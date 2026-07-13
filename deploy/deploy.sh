#!/usr/bin/env bash
# Deploys this repo to the VPS: builds the Mini App locally, rsyncs the
# static build to /srv/www/miniapp.xdshka.party (matching this box's existing
# static-site convention) and the server code to /opt/agent-music-tg
# (matching fox-nails-bot's /opt convention), re-points both `current`
# symlinks, restarts the systemd unit, and health-checks /healthz.
# Usage: ./deploy/deploy.sh
set -euo pipefail

HOST="root@103.214.69.38"
API_DIR="/opt/agent-music-tg"
STATIC_DIR="/srv/www/miniapp.xdshka.party"
RELEASE="$(date +%Y%m%d%H%M%S)"

cd "$(dirname "$0")/.."

echo "==> Building Mini App"
(cd miniapp && bun install --frozen-lockfile && bun run build)

echo "==> Creating release dirs on VPS"
ssh "$HOST" "mkdir -p '$API_DIR/releases/$RELEASE' '$STATIC_DIR/releases/$RELEASE'"

echo "==> Syncing server code"
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'openspec' \
  --exclude 'data' \
  server package.json bun.lock tsconfig.json "$HOST:$API_DIR/releases/$RELEASE/"

echo "==> Syncing Mini App static build"
rsync -az --delete miniapp/dist/ "$HOST:$STATIC_DIR/releases/$RELEASE/dist/"

echo "==> Installing production dependencies on VPS"
ssh "$HOST" "cd '$API_DIR/releases/$RELEASE' && /root/.bun/bin/bun install --production"

echo "==> Pointing 'current' symlinks at the new release"
ssh "$HOST" "ln -sfn '$API_DIR/releases/$RELEASE' '$API_DIR/current' && ln -sfn '$STATIC_DIR/releases/$RELEASE' '$STATIC_DIR/current'"

echo "==> Restarting service"
ssh "$HOST" "systemctl restart agent-music-tg && sleep 2"

echo "==> Health check"
if ssh "$HOST" "curl -fsS http://127.0.0.1:8787/healthz"; then
  echo ""
  echo "==> Deploy OK: $RELEASE"
else
  echo ""
  echo "==> Health check FAILED — see README rollback section" >&2
  exit 1
fi
