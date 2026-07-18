#!/usr/bin/env bash
# Promote to prod: run this AFTER deploy-test.sh passed and you poked the
# test bot on Telegram. Thin wrapper — just calls the real deploy.sh.
# Usage: ./deploy/deploy-prod.sh [--dry-run] [--no-typecheck] [--dirty]
set -euo pipefail
exec "$(dirname "$0")/deploy.sh" "$@"
