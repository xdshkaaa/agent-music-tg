#!/usr/bin/env bash
# Deploys this repo to the VPS: builds the Mini App locally, rsyncs the
# static build and server code, re-points both `current` symlinks, restarts
# the systemd unit, health-checks /healthz, rolls back on failure, and
# notifies the admin via Telegram.
# Usage: ./deploy/deploy.sh [--dry-run] [--no-typecheck] [--dirty]
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
CONFIG_FILE="$(dirname "$0")/deploy.conf"
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

: ${HOST:="root@103.214.69.38"}
: ${API_DIR:="/opt/agent-music-tg"}
: ${STATIC_DIR:="/srv/www/miniapp.xdshka.party"}
: ${KEEP_RELEASES:=5}
: ${NOTIFY:=true}

SSH_OPTS="${SSH_OPTS:--o ConnectTimeout=25 -o ConnectionAttempts=5 -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -o BatchMode=yes}"

# ── Flags ───────────────────────────────────────────────────────────────────
DRY_RUN=false
SKIP_TYPECHECK=false
ALLOW_DIRTY=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --no-typecheck) SKIP_TYPECHECK=true ;;
    --dirty) ALLOW_DIRTY=true ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

# ── Helpers ─────────────────────────────────────────────────────────────────
log()  { echo "==> $(TZ=UTC date +%H:%M:%S) $*"; }
warn() { echo "WARN: $*" >&2; }
fail() { echo "FATAL: $*" >&2; exit 1; }

SSH_BASE="ssh $SSH_OPTS"
run_ssh()  { $SSH_BASE "$HOST" "$@"; }
run_cmd()  { if $DRY_RUN; then echo "[DRY-RUN] $*"; else "$@"; fi; }
run_remote() {
  if $DRY_RUN; then echo "[DRY-RUN] ssh $HOST: $1"; else run_ssh "$1"; fi
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
check_git_clean() {
  if ! $ALLOW_DIRTY && [ -n "$(git status --porcelain)" ]; then
    warn "Uncommitted changes:"
    git status --short >&2
    fail "Use --dirty to deploy anyway"
  fi
  log "Git working tree clean"
}

check_git_branch() {
  local branch
  branch=$(git rev-parse --abbrev-ref HEAD)
  echo "       Branch: $branch"
  if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
    if ! $ALLOW_DIRTY; then
      echo -n "       Deploy from '$branch'? [Y/n] "
      read -r resp
      if [ "$resp" != "Y" ] && [ "$resp" != "y" ] && [ "$resp" != "" ]; then
        fail "Aborted by user"
      fi
    fi
  fi
}

check_typecheck() {
  if ! $SKIP_TYPECHECK; then
    log "Running typecheck"
    bun run typecheck || fail "Typecheck failed (use --no-typecheck to skip)"
  fi
}

check_ssh() {
  log "Checking SSH connectivity to $HOST"
  $SSH_BASE "$HOST" "exit" || fail "Cannot reach $HOST"
}

check_remote_env() {
  log "Checking .env on VPS"
  run_ssh "test -f '$API_DIR/.env'" || fail "No .env found at $API_DIR/.env on VPS"
}

# ── Telegram notifications ──────────────────────────────────────────────────
NOTIFY_TOKEN=""
NOTIFY_CHAT=""
load_notify_config() {
  local env_file=".env"
  if [ ! -f "$env_file" ]; then return; fi
  NOTIFY_TOKEN=$(grep ^TELEGRAM_BOT_TOKEN= "$env_file" | cut -d= -f2-)
  NOTIFY_CHAT=$(grep ^ADMIN_CHAT_IDS= "$env_file" | cut -d= -f2- | cut -d, -f1)
}

notify_telegram() {
  [ "$NOTIFY" != "true" ] && return
  [ -z "$NOTIFY_TOKEN" ] && return
  [ -z "$NOTIFY_CHAT" ] && { warn "ADMIN_CHAT_IDS not found in .env"; return; }
  curl -fsS -X POST "https://api.telegram.org/bot$NOTIFY_TOKEN/sendMessage" \
    -d "chat_id=$NOTIFY_CHAT" \
    -d "text=$1" \
    -d "parse_mode=HTML" \
    -d "disable_web_page_preview=true" >/dev/null 2>&1 || true
}

# ── Main ────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

log "Pre-flight checks"
check_git_clean
check_git_branch
check_typecheck
check_ssh
check_remote_env

log "Building Mini App"
run_cmd bash -c 'cd miniapp && bun install --frozen-lockfile && bun run build'

RELEASE="$(TZ=UTC date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
COMMIT_MSG="$(git log --oneline -1)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Deploying $RELEASE ($BRANCH: $COMMIT_MSG)"

run_remote "mkdir -p '$API_DIR/releases/$RELEASE' '$STATIC_DIR/releases/$RELEASE'"

log "Syncing server code"
run_cmd rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude openspec \
  --exclude data \
  -e "$SSH_BASE" \
  server package.json bun.lock tsconfig.json "$HOST:$API_DIR/releases/$RELEASE/"

log "Syncing Mini App static build"
run_cmd rsync -az --delete -e "$SSH_BASE" miniapp/dist/ "$HOST:$STATIC_DIR/releases/$RELEASE/dist/"

log "Ensuring audio tooling (yt-dlp + ffmpeg) on VPS"
run_remote "command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg); \
  if command -v yt-dlp >/dev/null; then yt-dlp -U --quiet || true; \
  else curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp; fi; \
  mkdir -p '$API_DIR/data/audio-scratch' '$API_DIR/data/stream-cache'"

log "Installing production dependencies on VPS"
run_remote "cd '$API_DIR/releases/$RELEASE' && /root/.bun/bin/bun install --production"

log "Pointing 'current' symlinks at the new release"
run_remote "ln -sfn '$API_DIR/releases/$RELEASE' '$API_DIR/current' && ln -sfn '$STATIC_DIR/releases/$RELEASE' '$STATIC_DIR/current'"

log "Restarting service"
run_remote "systemctl restart agent-music-tg && sleep 3"

log "Health check"
if $DRY_RUN; then
  echo "[DRY-RUN] Skipping health check"
elif run_ssh "curl -fsS --max-time 10 http://127.0.0.1:8787/healthz && test -f '$STATIC_DIR/current/dist/index.html'"; then
  echo ""
  log "Deploy OK: $RELEASE"

  if [ "$KEEP_RELEASES" -gt 0 ]; then
    log "Cleaning up old releases (keeping $KEEP_RELEASES)"
    run_remote "cd '$API_DIR/releases' && cur=\$(readlink -f '$API_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
    run_remote "cd '$STATIC_DIR/releases' && cur=\$(readlink -f '$STATIC_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
  fi

  load_notify_config
  notify_telegram "✅ Deploy <code>$RELEASE</code> OK
Branch: $BRANCH
Commit: $COMMIT_MSG"
else
  echo ""
  warn "Health check FAILED — rolling back..."

  PREV_RELEASE=$(run_ssh "cd '$API_DIR/releases' && ls -1dt */ | sed 's:/\$::' | grep -vxF '$RELEASE' | head -n 1")

  if [ -n "$PREV_RELEASE" ]; then
    PREV_RELEASE=$(basename "$PREV_RELEASE")
    log "Rolling back to $PREV_RELEASE"
    run_remote "ln -sfn '$API_DIR/releases/$PREV_RELEASE' '$API_DIR/current' && ln -sfn '$STATIC_DIR/releases/$PREV_RELEASE' '$STATIC_DIR/current'"
    run_remote "systemctl restart agent-music-tg && sleep 3"

    if run_ssh "curl -fsS --max-time 10 http://127.0.0.1:8787/healthz && test -f '$STATIC_DIR/current/dist/index.html'"; then
      log "Rollback OK: $PREV_RELEASE"
    else
      warn "CRITICAL: Rollback health check also FAILED — server may be down"
    fi
  else
    warn "No previous release to roll back to (first deploy?)"
    PREV_RELEASE=""
  fi

  load_notify_config
  notify_telegram "❌ Deploy <code>$RELEASE</code> FAILED
Reason: Health check failed
Rolled back to: <code>${PREV_RELEASE:-N/A}</code>"

  fail "Deploy FAILED — see output above"
fi
