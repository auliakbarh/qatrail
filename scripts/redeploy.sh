#!/usr/bin/env bash
# Redeploy QATrail on the server. Pull -> install -> build -> schema -> publish
# client -> reload API. Safe to re-run.
#
# Usage:
#   ./scripts/redeploy.sh              # full redeploy
#   ./scripts/redeploy.sh --no-pull    # skip git pull (deploy current checkout)
#   SKIP_SCHEMA=1 ./scripts/redeploy.sh   # skip `npm run db:push`
#
# Override the defaults via env if your paths differ:
#   APP_DIR   repo path        (default: this repo's root)
#   WEB_ROOT  nginx static dir (default: /var/www/qatrail)
#   PM2_APP   pm2 process name (default: qar-server)

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WEB_ROOT="${WEB_ROOT:-/var/www/qatrail}"
PM2_APP="${PM2_APP:-qar-server}"
DO_PULL=1
[ "${1:-}" = "--no-pull" ] && DO_PULL=0

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cd "$APP_DIR"
log "Redeploying from $APP_DIR"

if [ "$DO_PULL" = 1 ]; then
  log "git pull"
  git pull --ff-only
  # The displayed version is the newest tag, so make sure tags are up to date.
  git fetch --tags --force
fi

log "version: $(git describe --tags --abbrev=0 2>/dev/null || echo 'no tag — falling back to package.json')"

log "npm install"
npm install

log "build (server + client)"
npm run build

if [ "${SKIP_SCHEMA:-0}" != "1" ]; then
  log "prisma db push"
  npm run db:push
else
  log "skipping schema (SKIP_SCHEMA=1)"
fi

log "publish client -> $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r client/dist/* "$WEB_ROOT"/

log "reload API ($PM2_APP)"
pm2 reload "$PM2_APP"

log "reload nginx"
sudo nginx -t && sudo systemctl reload nginx

log "done"
pm2 status "$PM2_APP"
