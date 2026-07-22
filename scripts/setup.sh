#!/usr/bin/env bash
# First-time deploy of QATrail (app level). Assumes the toolchain (Node, PM2)
# and a reachable PostgreSQL already exist, and the repo is cloned.
# Does: install -> schema -> seed -> build -> publish client -> start API.
#
# Before running:
#   - server/.env must exist and be filled (DATABASE_URL, JWT_SECRET,
#     SECRET_ENC_KEY, CORS_ORIGINS, FRONTEND_BASE_URL, SUPER_ADMIN_*).
#     If missing, this script copies the template and stops so you can edit it.
#
# Usage:
#   ./scripts/setup.sh                 # full first deploy
#   SEED_CONTENT=1 ./scripts/setup.sh  # also load the QATrail catalogue
#
# Override defaults via env:
#   APP_DIR     repo path        (default: this repo's root)
#   WEB_ROOT    nginx static dir (default: /var/www/qatrail)
#   PM2_APP     pm2 process name (default: qar-server)
#   PUBLIC_URL  public origin    (default: https://qatrail.hpam.id)
#               used only to create client/.env.production if it's missing

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
WEB_ROOT="${WEB_ROOT:-/var/www/qatrail}"
PM2_APP="${PM2_APP:-qar-server}"
PUBLIC_URL="${PUBLIC_URL:-https://qatrail.hpam.id}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"
log "First deploy from $APP_DIR"

# --- preflight ---
command -v node >/dev/null || die "node not found — install Node 20 first (step 0)."
command -v pm2  >/dev/null || die "pm2 not found — run: sudo npm install -g pm2"

if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  die "server/.env was missing — created it from the template. Edit it (secrets, DATABASE_URL, origins) then re-run this script."
fi

if [ ! -f client/.env.production ]; then
  echo "VITE_API_URL=\"${PUBLIC_URL}/graphql\"" > client/.env.production
  log "Created client/.env.production -> ${PUBLIC_URL}/graphql"
fi

# --- install + schema + seed ---
log "npm install"
npm install

log "prisma db push"
npm run db:push

log "seed base data (super admin, SLA targets, settings)"
npm run db:seed

if [ "${SEED_CONTENT:-0}" = "1" ]; then
  log "seed QATrail catalogue (SEED_CONTENT=1)"
  npm run db:seed:content
fi

# --- build + publish ---
log "build (server + client)"
npm run build

log "publish client -> $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}"/*
sudo cp -r client/dist/* "$WEB_ROOT"/

# --- start API under PM2 ---
log "start API ($PM2_APP)"
pm2 startOrReload ecosystem.config.cjs --only "$PM2_APP"
pm2 save

log "done — API is up. Next steps (manual, once):"
cat <<EOF

  1. Enable PM2 on boot:   pm2 startup   (run the command it prints)
  2. Configure nginx:      see docs/DEPLOY_EXAMPLE.md step 8 / 8b
                           (server block for qatrail.hpam.id, then reload)
  3. Log in at ${PUBLIC_URL} as the super admin, then change the password.

  Redeploys after this:    ./scripts/redeploy.sh
EOF
