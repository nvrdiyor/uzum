#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SavdoIQ — serverni noldan sozlash (Ubuntu 22.04 / 24.04)
#
#  Ishlatish (serverda, root sifatida):
#      bash setup-server.sh
#
#  Skript idempotent: qayta ishga tushirilsa hech narsani buzmaydi.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${REPO:-https://github.com/nvrdiyor/uzum}"
APP_DIR="${APP_DIR:-/opt/savdoiq}"
SERVER_IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
DB_NAME="savdoiq"
DB_USER="savdoiq"

# Bot ma'lumotlari muhitdan olinadi (deploy.sh uzatadi)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-savdoiqbot}"
TELEGRAM_ADMIN_IDS="${TELEGRAM_ADMIN_IDS:-}"

log()  { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }

export DEBIAN_FRONTEND=noninteractive

# ── 1. Tizim paketlari ───────────────────────────────────────────────────────
log "Tizim paketlari o'rnatilmoqda"
apt-get update -qq
apt-get install -y -qq curl git nginx postgresql postgresql-contrib ufw ca-certificates >/dev/null
ok "curl, git, nginx, postgresql, ufw"

# ── 2. Node.js 20 ────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  log "Node.js 20 o'rnatilmoqda"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node $(node -v) · npm $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  log "PM2 o'rnatilmoqda"
  npm install -g pm2 --silent >/dev/null 2>&1
fi
ok "PM2 $(pm2 -v)"

# ── 3. PostgreSQL bazasi ─────────────────────────────────────────────────────
log "Ma'lumotlar bazasi tayyorlanmoqda"
systemctl enable --now postgresql >/dev/null 2>&1 || true

# Parol faqat serverda hosil qilinadi va faqat shu yerda saqlanadi
DB_PASS_FILE="/root/.savdoiq_db_pass"
if [ ! -f "$DB_PASS_FILE" ]; then
  openssl rand -hex 24 > "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS="$(cat "$DB_PASS_FILE")"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -q -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -q -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -q -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
sudo -u postgres psql -q -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"
ok "PostgreSQL: ${DB_NAME} / ${DB_USER}"

# ── 4. Kodni olish ───────────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Kod yangilanmoqda"
  git -C "$APP_DIR" fetch --quiet origin
  git -C "$APP_DIR" reset --hard --quiet origin/main
else
  log "Kod yuklab olinmoqda"
  rm -rf "$APP_DIR"
  git clone --quiet "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
ok "Kod: $APP_DIR ($(git -C "$APP_DIR" rev-parse --short HEAD))"

# ── 5. .env ──────────────────────────────────────────────────────────────────
log "Sozlamalar (.env)"
if [ -f "$APP_DIR/.env" ]; then
  # Mavjud maxfiy kalitlarni saqlab qolamiz — aks holda shifrlangan API kalitlar o'qilmay qoladi
  SESSION_SECRET="$(grep -E '^SESSION_SECRET=' "$APP_DIR/.env" | cut -d= -f2- || true)"
  ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' "$APP_DIR/.env" | cut -d= -f2- || true)"
fi
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"

cat > "$APP_DIR/.env" <<ENVFILE
NODE_ENV=production

# ── Server ──
API_PORT=4000
API_URL=http://${SERVER_IP}
WEB_URL=http://${SERVER_IP}
TRUST_PROXY=true

# ── Ma'lumotlar bazasi ──
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"

# ── Xavfsizlik (O'ZGARTIRMANG — shifrlangan API kalitlar shunga bog'liq) ──
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ── Telegram ──
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_BOT_USERNAME=${TELEGRAM_BOT_USERNAME}
TELEGRAM_ADMIN_IDS=${TELEGRAM_ADMIN_IDS}

# ── Uzum ──
UZUM_MODE=demo
UZUM_API_BASE=https://api-seller.uzum.uz/api/seller-openapi
UZUM_TIMEOUT_MS=30000
UZUM_MAX_RETRIES=3
UZUM_RPS=3

# ── Sinxronizatsiya ──
SYNC_IN_PROCESS=true
SYNC_POLL_MS=3000
SYNC_CONCURRENCY=2
SYNC_SPEED_FACTOR=1

# ── To'lov (keyin to'ldiriladi) ──
PAYME_MERCHANT_ID=
PAYME_KEY=
CLICK_MERCHANT_ID=
CLICK_SERVICE_ID=
CLICK_SECRET=
MANUAL_CARD=
MANUAL_CARD_OWNER=

# ── Frontend ──
VITE_API_URL=/api/v1
VITE_BOT_USERNAME=${TELEGRAM_BOT_USERNAME}
VITE_BRAND_NAME=SavdoIQ
ENVFILE
chmod 600 "$APP_DIR/.env"
ok ".env yozildi (WEB_URL=http://${SERVER_IP})"

# ── 6. Yig'ish ───────────────────────────────────────────────────────────────
log "Paketlar o'rnatilmoqda (bir necha daqiqa)"
npm install --no-audit --no-fund 2>&1 | tail -3

# npm'ning ma'lum muammosi: Windows'da yaratilgan package-lock.json ichida Linux uchun
# ixtiyoriy ikkilik paketlar bo'lmaydi (rollup/esbuild) → yig'ish "Cannot find module
# @rollup/rollup-linux-x64-gnu" xatosi bilan to'xtaydi.
# https://github.com/npm/cli/issues/4828
ARCH_PKG="@rollup/rollup-linux-x64-gnu"
[ "$(uname -m)" = "aarch64" ] && ARCH_PKG="@rollup/rollup-linux-arm64-gnu"
ESBUILD_PKG="@esbuild/linux-x64"
[ "$(uname -m)" = "aarch64" ] && ESBUILD_PKG="@esbuild/linux-arm64"

if [ ! -d "node_modules/${ARCH_PKG}" ] || [ ! -d "node_modules/${ESBUILD_PKG}" ]; then
  warn "Platformaga mos ikkilik paketlar yetishmayapti — toza o'rnatish qilinmoqda"
  rm -rf node_modules package-lock.json
  npm install --no-audit --no-fund 2>&1 | tail -3
fi
ok "Paketlar o'rnatildi"

log "PostgreSQL rejimiga o'tkazish"
npm run db:use-postgres >/dev/null
npm run db:generate >/dev/null 2>&1
npm run db:push >/dev/null 2>&1
ok "Baza sxemasi qo'llandi"

log "Loyiha yig'ilmoqda"
npm run build 2>&1 | tail -3
ok "Yig'ildi"

# ── 7. PM2 ───────────────────────────────────────────────────────────────────
log "Jarayonlar ishga tushirilmoqda"
pm2 delete savdoiq-api savdoiq-bot >/dev/null 2>&1 || true
cd "$APP_DIR"
pm2 start apps/api/dist/index.js --name savdoiq-api --cwd "$APP_DIR" --time >/dev/null
pm2 start apps/bot/dist/index.js --name savdoiq-bot --cwd "$APP_DIR" --time >/dev/null
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
ok "PM2: savdoiq-api, savdoiq-bot"

# ── 8. Nginx ─────────────────────────────────────────────────────────────────
log "Nginx sozlanmoqda"
cat > /etc/nginx/sites-available/savdoiq <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root ${APP_DIR}/apps/web/dist;
    index index.html;
    client_max_body_size 12m;

    # SPA marshrutlash.
    # index.html HECH QACHON keshlanmaydi: u fayl nomlaridagi xeshlarni
    # ko'rsatib turadi, har chiqarilishda xeshlar o'zgaradi. Eski index.html
    # keshdan olinsa, brauzer endi mavjud bo'lmagan fayllarni so'raydi va
    # ichki sahifalar ochilmay qo'yadi.
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
    }

    # Xeshlangan fayllar uzoq keshlanadi (nomi o'zgarmasa — mazmuni ham o'zgarmaydi)
    location ~* \.(js|css|svg|woff2|png|jpg|webp)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        # Eski chunk so'ralsa index.html emas, aniq 404 qaytsin — shunda sayt
        # buni tushunib o'zini yangilaydi (apps/web/src/lib/lazyPage.tsx)
        try_files \$uri =404;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/savdoiq /etc/nginx/sites-enabled/savdoiq
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
ok "Nginx: http://${SERVER_IP}"

# ── 9. Firewall ──────────────────────────────────────────────────────────────
log "Firewall"
ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable   >/dev/null 2>&1 || true
ok "UFW: 22, 80, 443 ochiq"

# ── 10. Yakun ────────────────────────────────────────────────────────────────
sleep 4
printf '\n\033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n'
printf '  SavdoIQ ishga tushdi\n\n'
printf '  Sayt   : http://%s\n' "${SERVER_IP}"
printf '  API    : http://%s/health\n' "${SERVER_IP}"
printf '  Bot    : https://t.me/%s\n' "${TELEGRAM_BOT_USERNAME}"
printf '\n  Holat  : pm2 status\n'
printf '  Loglar : pm2 logs savdoiq-api --lines 50\n'
printf '\033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n\n'

curl -s "http://127.0.0.1:4000/health" || warn "API hali javob bermayapti — 'pm2 logs savdoiq-api' bilan tekshiring"
echo
pm2 status
