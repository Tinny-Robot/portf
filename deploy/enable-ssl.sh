#!/usr/bin/env bash
# Issue Let's Encrypt cert and switch nginx to trusted HTTPS for nathaniel.name.ng
#
# Prerequisite: remove the bad AAAA record in Cloudflare DNS for nathaniel.name.ng
# (currently 2001:4860:4802:32::15 — it blocks ACME validation).
# Keep the A record pointing at this server (184.73.129.137).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/nathaniel.name.ng"

if [[ ! -f /etc/letsencrypt/live/nathaniel.name.ng/fullchain.pem ]]; then
  echo "Requesting certificate..."
  sudo certbot certonly --nginx \
    -d nathaniel.name.ng \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email
else
  echo "Certificate already present; skipping issuance."
fi

echo "Installing production nginx config..."
sudo tee "$NGINX_SITE" > /dev/null <<'EOF'
# Nathaniel Handan Portfolio - nathaniel.name.ng
# Proxies to Node/Express on 127.0.0.1:8080 (PM2: nathaniel-portfolio)

server {
    listen 80;
    listen [::]:80;
    server_name nathaniel.name.ng www.nathaniel.name.ng;

    access_log /var/log/nginx/nathaniel.name.ng.access.log;
    error_log /var/log/nginx/nathaniel.name.ng.error.log;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://nathaniel.name.ng$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.nathaniel.name.ng;

    ssl_certificate /etc/letsencrypt/live/nathaniel.name.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nathaniel.name.ng/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://nathaniel.name.ng$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nathaniel.name.ng;

    ssl_certificate /etc/letsencrypt/live/nathaniel.name.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nathaniel.name.ng/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    access_log /var/log/nginx/nathaniel.name.ng.ssl.access.log;
    error_log /var/log/nginx/nathaniel.name.ng.ssl.error.log;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10m;

    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /api/health {
        proxy_pass http://127.0.0.1:8080/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}
EOF

sudo nginx -t
sudo systemctl reload nginx
curl -fsS "https://nathaniel.name.ng/api/health"
echo
echo "Done. https://nathaniel.name.ng/ is live with Let's Encrypt."
