#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  SavdoIQ — serverdagi ilovani yangilash
#
#  Ishlatish (serverda):
#      bash deploy/update.sh
#
#  NIMA UCHUN SKRIPT KERAK
#  Serverda `packages/db/prisma/schema.prisma` doimo o'zgartirilgan holatda
#  turadi: `provider = "postgresql"`. `git pull` ishlashi uchun uni avval
#  asl holatiga qaytarish kerak, ya'ni SQLite'ga. Agar shundan keyin
#  `npm run build` ishga tushirilsa, `prisma generate` SQLite klientini
#  yasaydi va API ishga tushmay qoladi:
#      Error validating datasource `db`: the URL must start with `file:`
#  Shuning uchun tartib QAT'IY: checkout → pull → use-postgres → build.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/savdoiq}"
cd "$APP_DIR"

log() { printf '\n\033[36m▸ %s\033[0m\n' "$*"; }
ok()  { printf '\033[32m✔ %s\033[0m\n' "$*"; }

log "Kod yangilanmoqda"
git checkout -- packages/db/prisma/schema.prisma
git pull -q origin main
ok "$(git log --oneline -1)"

log "Prisma provayderi PostgreSQL ga o'tkazilmoqda"
npm run db:use-postgres >/dev/null
grep -q 'provider = "postgresql"' packages/db/prisma/schema.prisma || {
  printf '\033[31m✘ provider almashmadi — to‘xtatildi\033[0m\n'
  exit 1
}
ok 'provider = "postgresql"'

# Sxema o'zgargan bo'lsa bazaga qo'llanadi. Ustun qo'shish xavfsiz;
# ma'lumot yo'qotadigan o'zgarish bo'lsa buyruq o'zi to'xtaydi.
log "Baza sxemasi tekshirilmoqda"
npx prisma db push --schema packages/db/prisma/schema.prisma

log "Yig'ilmoqda"
npm run build 2>&1 | tail -30

log "Jarayonlar qayta ishga tushirilmoqda"
pm2 restart savdoiq-api savdoiq-bot >/dev/null
sleep 3

# Ishga tushganini tasdiqlash — pm2 "online" deyishi yetarli emas,
# jarayon startda yiqilsa ham bir necha soniya "online" bo'lib turadi
if pm2 logs savdoiq-api --lines 30 --nostream 2>/dev/null | grep -q 'ishga tushirishda xatolik'; then
  printf '\033[31m✘ API ishga tushmadi — loglarni ko‘ring: pm2 logs savdoiq-api\033[0m\n'
  exit 1
fi

ok 'API va bot ishlayapti'
pm2 list | grep savdoiq || true
