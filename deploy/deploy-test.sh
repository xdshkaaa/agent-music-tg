#!/usr/bin/env bash
# Deploys current tree to a SEPARATE test-bot instance on the same VPS:
# own dir, own port, own systemd unit, own .env (bootstrapped from the prod
# .env with token/port/paths swapped), own Mini App static build served at
# https://miniapp-dev.xdshka.party (Caddy :8095 -> localhost:8788, see
# deploy/miniapp-dev.caddy) — a separate origin is required so initData
# signed by the TEST bot verifies against the TEST bot's token instead of
# prod's (Telegram signs initData with whichever bot's chat opened the Mini
# App; the server verifies it against its own TELEGRAM_BOT_TOKEN).
#
# Usage: ./deploy/deploy-test.sh [--dry-run] [--no-typecheck] [--dirty]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.conf"
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

: ${HOST:="root@103.214.69.38"}
: ${TEST_API_DIR:="/opt/agent-music-tg-test"}
: ${TEST_STATIC_DIR:="/srv/www/miniapp-dev.xdshka.party"}
: ${TEST_PUBLIC_ORIGIN:="https://miniapp-dev.xdshka.party"}
: ${TEST_PORT:=8788}
: ${TEST_SERVICE:="agent-music-tg-test"}
: ${KEEP_RELEASES:=3}
TEST_BOT_TOKEN="8675084924:AAHFw9GrTmeg3cpgv4Yl8nx6O1psOdbEeOU"

SSH_OPTS="${SSH_OPTS:--o ConnectTimeout=25 -o ConnectionAttempts=5 -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -o BatchMode=yes}"

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

log()  { echo "==> $(TZ=UTC date +%H:%M:%S) $*"; }
warn() { echo "WARN: $*" >&2; }
fail() { echo "FATAL: $*" >&2; exit 1; }

SSH_BASE="ssh $SSH_OPTS"
run_ssh()    { $SSH_BASE "$HOST" "$@"; }
run_cmd()    { if $DRY_RUN; then echo "[DRY-RUN] $*"; else "$@"; fi; }
run_remote() { if $DRY_RUN; then echo "[DRY-RUN] ssh $HOST: $1"; else run_ssh "$1"; fi }

check_git_clean() {
  if ! $ALLOW_DIRTY && [ -n "$(git status --porcelain)" ]; then
    warn "Uncommitted changes:"; git status --short >&2
    fail "Use --dirty to deploy anyway"
  fi
  log "Git working tree clean"
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

# Bootstrap the test .env from the prod one on first run: same providers/
# payments config, swapped token/port/paths so it can't collide with prod.
ensure_test_env() {
  log "Ensuring test .env exists on VPS"
  run_remote "test -f '$TEST_API_DIR/.env'" && { log "Test .env already present, leaving as-is"; return; }
  run_ssh "test -f '/opt/agent-music-tg/.env'" || fail "Prod .env not found at /opt/agent-music-tg/.env — nothing to bootstrap test .env from"
  run_remote "mkdir -p '$TEST_API_DIR'"
  run_remote "cp '/opt/agent-music-tg/.env' '$TEST_API_DIR/.env'"
  run_remote "sed -i \
    -e 's|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$TEST_BOT_TOKEN|' \
    -e 's|^PORT=.*|PORT=$TEST_PORT|' \
    -e 's|^DB_PATH=.*|DB_PATH=$TEST_API_DIR/data/app.sqlite|' \
    -e 's|^AUDIO_SCRATCH_DIR=.*|AUDIO_SCRATCH_DIR=$TEST_API_DIR/data/audio-scratch|' \
    -e 's|^STREAM_CACHE_DIR=.*|STREAM_CACHE_DIR=$TEST_API_DIR/data/stream-cache|' \
    -e 's|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=$TEST_PUBLIC_ORIGIN|' \
    '$TEST_API_DIR/.env'"
  log "Test .env bootstrapped from prod .env (token/port/paths swapped — review the rest, e.g. PAYMENTS_ENABLED, if you want test to differ)"
}

ensure_systemd_unit() {
  log "Ensuring systemd unit installed"
  run_cmd scp -q -o ConnectTimeout=25 "$SCRIPT_DIR/agent-music-tg-test.service" "$HOST:/etc/systemd/system/${TEST_SERVICE}.service"
  run_remote "systemctl daemon-reload && systemctl enable ${TEST_SERVICE} >/dev/null"
}

cd "$(dirname "$0")/.."

log "Pre-flight checks (TEST deploy)"
check_git_clean
check_typecheck
check_ssh

log "Building Mini App"
run_cmd bash -c 'cd miniapp && bun install --frozen-lockfile && bun run build'

RELEASE="$(TZ=UTC date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
COMMIT_MSG="$(git log --oneline -1)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Deploying TEST $RELEASE ($BRANCH: $COMMIT_MSG)"

ensure_test_env
ensure_systemd_unit

run_remote "mkdir -p '$TEST_API_DIR/releases/$RELEASE' '$TEST_STATIC_DIR/releases/$RELEASE'"

log "Syncing server code"
run_cmd rsync -az --delete \
  --exclude node_modules --exclude .git --exclude openspec --exclude data \
  -e "$SSH_BASE" \
  server package.json bun.lock tsconfig.json "$HOST:$TEST_API_DIR/releases/$RELEASE/"

log "Syncing Mini App static build"
run_cmd rsync -az --delete -e "$SSH_BASE" miniapp/dist/ "$HOST:$TEST_STATIC_DIR/releases/$RELEASE/dist/"

log "Ensuring audio tooling + data dirs"
run_remote "command -v ffmpeg >/dev/null || (apt-get update -qq && apt-get install -y -qq ffmpeg); \
  mkdir -p '$TEST_API_DIR/data/audio-scratch' '$TEST_API_DIR/data/stream-cache'"

log "Installing production dependencies on VPS"
run_remote "cd '$TEST_API_DIR/releases/$RELEASE' && /root/.bun/bin/bun install --production"

log "Pointing 'current' symlinks at the new release"
run_remote "ln -sfn '$TEST_API_DIR/releases/$RELEASE' '$TEST_API_DIR/current' && ln -sfn '$TEST_STATIC_DIR/releases/$RELEASE' '$TEST_STATIC_DIR/current'"

log "Restarting $TEST_SERVICE"
run_remote "systemctl restart '$TEST_SERVICE' && sleep 3"

log "Health check (port $TEST_PORT)"
if $DRY_RUN; then
  echo "[DRY-RUN] Skipping health check"
elif run_ssh "curl -fsS --max-time 10 http://127.0.0.1:$TEST_PORT/healthz && test -f '$TEST_STATIC_DIR/current/dist/index.html'"; then
  log "TEST deploy OK: $RELEASE — open $TEST_PUBLIC_ORIGIN from the test bot's menu button on Telegram"
  if [ "$KEEP_RELEASES" -gt 0 ]; then
    run_remote "cd '$TEST_API_DIR/releases' && cur=\$(readlink -f '$TEST_API_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
    run_remote "cd '$TEST_STATIC_DIR/releases' && cur=\$(readlink -f '$TEST_STATIC_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
  fi
else
  fail "TEST deploy health check FAILED — check: ssh $HOST journalctl -u $TEST_SERVICE -n 100"
fi
