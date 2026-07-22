#!/usr/bin/env bash
# Write + enable the nginx site for QATrail (qatrail.hpam.id). Serves the static
# client from WEB_ROOT and proxies /graphql (HTTP + WebSocket) to the API.
# TLS uses the existing hpam wildcard cert. Re-runnable.
#
# Usage:
#   sudo ./scripts/setup-nginx.sh
#
# Override defaults via env:
#   DOMAIN    server_name       (default: qatrail.hpam.id)
#   API_PORT  local API port    (default: 4010)   # 4000 is used by jcb.hpam.id
#   WEB_ROOT  static client dir  (default: /var/www/qatrail)
#   SITE      site file name     (default: qatrail)
#   SSL_CERT  cert path         (default: /home/ubuntu/certs/ssl.crt)
#   SSL_KEY   key path          (default: /home/ubuntu/certs/ssl.key)

set -euo pipefail

DOMAIN="${DOMAIN:-qatrail.hpam.id}"
API_PORT="${API_PORT:-4010}"
WEB_ROOT="${WEB_ROOT:-/var/www/qatrail}"
SITE="${SITE:-qatrail}"
SSL_CERT="${SSL_CERT:-/home/ubuntu/certs/ssl.crt}"
SSL_KEY="${SSL_KEY:-/home/ubuntu/certs/ssl.key}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (sudo ./scripts/setup-nginx.sh)"
command -v nginx >/dev/null || die "nginx not installed — sudo apt-get install -y nginx"

AVAIL="/etc/nginx/sites-available/$SITE"
ENABLED="/etc/nginx/sites-enabled/$SITE"

[ -f "$SSL_CERT" ] || log "WARNING: cert not found at $SSL_CERT (nginx -t will fail until it exists)"
[ -f "$SSL_KEY" ]  || log "WARNING: key not found at $SSL_KEY"

mkdir -p "$WEB_ROOT"

log "writing $AVAIL (domain=$DOMAIN, api=127.0.0.1:$API_PORT, root=$WEB_ROOT)"
cat > "$AVAIL" <<NGINX
server {
    listen 443 ssl;
    listen [::]:443 ssl;

    ssl_certificate     $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

    server_name $DOMAIN;
    client_max_body_size 2m;

    root $WEB_ROOT;
    index index.html;

    location /graphql {
        proxy_pass http://127.0.0.1:$API_PORT/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

# Redirect plain HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
NGINX

log "enabling site"
ln -sf "$AVAIL" "$ENABLED"

log "nginx -t"
nginx -t

log "reload nginx"
systemctl reload nginx

log "done — $DOMAIN is served (root $WEB_ROOT -> API 127.0.0.1:$API_PORT)"
echo "Reminder: server/.env PORT must be $API_PORT and client built with VITE_API_URL=https://$DOMAIN/graphql"
