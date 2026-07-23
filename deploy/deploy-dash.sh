#!/usr/bin/env bash
# Deploys the operator dashboard (dash.xdshka.party) — a standalone process
# (server/dashboard-server.ts) that reads both bot environments' sqlite
# files read-only and serves the dashboard/ Vite app's static build. Own
# dir, own port, own systemd unit; Caddy block is deploy/dash.caddy (:8097
# -> DASH_PORT), cloudflared ingress already routes dash.xdshka.party there.
#
# Usage: ./deploy/deploy-dash.sh [--dry-run] [--no-typecheck] [--dirty]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/deploy.conf"
[ -f "$CONFIG_FILE" ] && source "$CONFIG_FILE"

: ${HOST:="root@103.214.69.38"}
: ${DASH_API_DIR:="/opt/agent-music-tg-dash"}
: ${DASH_STATIC_DIR:="/srv/www/dash.xdshka.party"}
: ${DASH_SERVICE:="agent-music-dash"}
: ${DASH_HEALTH_PORT:=8789}
: ${KEEP_RELEASES:=5}

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
    log "Typechecking server + dashboard app"
    bun run typecheck || fail "Server typecheck failed (use --no-typecheck to skip)"
    (cd dashboard && bunx tsc --noEmit) || fail "Dashboard typecheck failed (use --no-typecheck to skip)"
  fi
}

check_ssh() {
  log "Checking SSH connectivity to $HOST"
  $SSH_BASE "$HOST" "exit" || fail "Cannot reach $HOST"
}

ensure_systemd_unit() {
  log "Ensuring systemd unit installed"
  run_cmd scp -q -o ConnectTimeout=25 "$SCRIPT_DIR/agent-music-dash.service" "$HOST:/etc/systemd/system/${DASH_SERVICE}.service"
  run_remote "systemctl daemon-reload && systemctl enable ${DASH_SERVICE} >/dev/null"
}

cd "$(dirname "$0")/.."

log "Pre-flight checks (DASHBOARD deploy)"
check_git_clean
check_typecheck
check_ssh

log "Building dashboard app"
run_cmd bash -c 'cd dashboard && bun install --frozen-lockfile && bun run build'

RELEASE="$(TZ=UTC date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
COMMIT_MSG="$(git log --oneline -1)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
log "Deploying DASHBOARD $RELEASE ($BRANCH: $COMMIT_MSG)"

ensure_systemd_unit

run_remote "mkdir -p '$DASH_API_DIR/releases/$RELEASE' '$DASH_STATIC_DIR/releases/$RELEASE'"

log "Syncing server code"
run_cmd rsync -az --delete \
  --exclude node_modules --exclude .git --exclude openspec --exclude data \
  -e "$SSH_BASE" \
  server package.json bun.lock tsconfig.json "$HOST:$DASH_API_DIR/releases/$RELEASE/"

log "Syncing dashboard static build"
run_cmd rsync -az --delete -e "$SSH_BASE" dashboard/dist/ "$HOST:$DASH_STATIC_DIR/releases/$RELEASE/dist/"

log "Installing production dependencies on VPS"
run_remote "cd '$DASH_API_DIR/releases/$RELEASE' && /root/.bun/bin/bun install --production"

log "Pointing 'current' symlinks at the new release"
run_remote "ln -sfn '$DASH_API_DIR/releases/$RELEASE' '$DASH_API_DIR/current' && ln -sfn '$DASH_STATIC_DIR/releases/$RELEASE' '$DASH_STATIC_DIR/current'"

log "Restarting $DASH_SERVICE"
run_remote "systemctl restart '$DASH_SERVICE' && sleep 3"

log "Health check (port $DASH_HEALTH_PORT)"
if $DRY_RUN; then
  echo "[DRY-RUN] Skipping health check"
elif run_ssh "curl -fsS --max-time 10 http://127.0.0.1:$DASH_HEALTH_PORT/healthz && test -f '$DASH_STATIC_DIR/current/dist/index.html'"; then
  log "DASHBOARD deploy OK: $RELEASE — https://dash.xdshka.party"
  if [ "$KEEP_RELEASES" -gt 0 ]; then
    run_remote "cd '$DASH_API_DIR/releases' && cur=\$(readlink -f '$DASH_API_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
    run_remote "cd '$DASH_STATIC_DIR/releases' && cur=\$(readlink -f '$DASH_STATIC_DIR/current'); ls -1dt */ | sed 's:/\$::' | awk -v d=\"\$PWD\" '{print d\"/\"\$0}' | grep -vxF \"\$cur\" | tail -n +$KEEP_RELEASES | xargs -r rm -rf"
  fi
else
  fail "DASHBOARD deploy health check FAILED — check: ssh $HOST journalctl -u $DASH_SERVICE -n 100"
fi
