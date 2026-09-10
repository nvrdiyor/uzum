#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SavdoIQ — domen va HTTPS ulash
#
#  Ishlatish (serverda):
#      bash add-domain.sh idturst.uz admin@idturst.uz
#
#  Oldindan: domen DNS'ida A-yozuvlar serverga qaratilgan bo'lishi SHART.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/opt/savdoiq}"

log()  { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✘ %s\033[0m\n' "$*"; exit 1; }

[ -n "$DOMAIN" ] || fail "Foydalanish: bash add-domain.sh <domen> [email]"
[ -d "$APP_DIR" ] || fail "$APP_DIR topilmadi — avval setup-server.sh ni ishga tushiring"

SERVER_IP="$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')"

# ── 1. DNS tekshiruvi ────────────────────────────────────────────────────────
log "DNS tekshirilmoqda: $DOMAIN → $SERVER_IP"
RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"

if [ -z "$RESOLVED" ]; then
  fail "$DOMAIN hech qanday IP'ga yechilmayapti.
   Domen sozlamalarida A-yozuv qo'shing:
       A   @     $SERVER_IP
       A   www   $SERVER_IP
   So'ng 10–30 daqiqa kuting va shu skriptni qayta ishga tushiring."
fi

if [ "$RESOLVED" != "$SERVER_IP" ]; then
  printf '\033[33m! %s\033[0m\n' "$DOMAIN → $RESOLVED (kutilgani: $SERVER_IP)"
  printf '  DNS hali tarqalmagan bo'"'"'lishi mumkin. Davom etamiz, lekin sertifikat olinmasligi mumkin.\n'
else
  ok "DNS to'g'ri: $DOMAIN → $SERVER_IP"
fi

WWW_OK=0
if getent ahostsv4 "www.$DOMAIN" >/dev/null 2>&1; then WWW_OK=1; ok "www.$DOMAIN ham yechilyapti"; fi

# ── 2. Nginx ─────────────────────────────────────────────────────────────────
log "Nginx sozlanmoqda"
SERVER_NAMES="$DOMAIN"
[ "$WWW_OK" = "1" ] && SERVER_NAMES="$DOMAIN www.$DOMAIN"

sed -i "s/^\( *\)server_name .*/\1server_name ${SERVER_NAMES};/" /etc/nginx/sites-available/savdoiq
nginx -t >/dev/null 2>&1 || fail "Nginx konfiguratsiyasida xato"
systemctl reload nginx
ok "server_name: $SERVER_NAMES"

# ── 3. HTTPS sertifikati ─────────────────────────────────────────────────────
log "Let's Encrypt sertifikati olinmoqda"
command -v certbot >/dev/null 2>&1 || {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
}

CERT_ARGS=(--nginx --non-interactive --agree-tos --redirect -d "$DOMAIN")
[ "$WWW_OK" = "1" ] && CERT_ARGS+=(-d "www.$DOMAIN")
if [ -n "$EMAIL" ]; then CERT_ARGS+=(-m "$EMAIL"); else CERT_ARGS+=(--register-unsafely-without-email); fi

if certbot "${CERT_ARGS[@]}"; then
  ok "HTTPS yoqildi (sertifikat avtomatik yangilanadi)"
  SCHEME="https"
else
  printf '\033[33m! Sertifikat olinmadi — sayt hozircha HTTP orqali ishlaydi.\033[0m\n'
  printf '  Sabab odatda: DNS hali tarqalmagan. 30 daqiqadan keyin qayta urinib ko'"'"'ring:\n'
  printf '      certbot --nginx -d %s\n' "$DOMAIN"
  SCHEME="http"
fi

# ── 4. Ilova manzillarini yangilash ──────────────────────────────────────────
log "Ilova sozlamalari yangilanmoqda"
sed -i "s|^WEB_URL=.*|WEB_URL=${SCHEME}://${DOMAIN}|" "$APP_DIR/.env"
sed -i "s|^API_URL=.*|API_URL=${SCHEME}://${DOMAIN}|" "$APP_DIR/.env"

cd "$APP_DIR"
npm run build 2>&1 | tail -3
pm2 restart savdoiq-api savdoiq-bot >/dev/null
ok "WEB_URL=${SCHEME}://${DOMAIN}"

# ── 5. Yakun ─────────────────────────────────────────────────────────────────
sleep 3
printf '\n\033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n'
printf '  Domen ulandi\n\n'
printf '  Sayt : %s://%s\n' "$SCHEME" "$DOMAIN"
printf '  API  : %s://%s/api/v1/health\n' "$SCHEME" "$DOMAIN"
printf '\n  Endi Telegram'"'"'da @BotFather ga kiring:\n'
printf '     /setdomain → botni tanlang → %s://%s\n' "$SCHEME" "$DOMAIN"
printf '  Shundan keyin saytdagi "Telegram orqali kirish" tugmasi ham ishlaydi.\n'
printf '\033[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m\n\n'

curl -s "${SCHEME}://${DOMAIN}/api/v1/health" || true
echo
