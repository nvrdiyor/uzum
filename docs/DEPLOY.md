# Ishga tushirish (deploy)

## 1. Serverni tayyorlash

```bash
# Ubuntu 22.04+ misolida
sudo apt update && sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 2. Ma'lumotlar bazasi (PostgreSQL)

```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE DATABASE savdoiq;"
sudo -u postgres psql -c "CREATE USER sp WITH PASSWORD 'kuchli-parol';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE savdoiq TO sp;"
```

Loyihada:

```bash
npm run db:use-postgres
# .env: DATABASE_URL="postgresql://sp:kuchli-parol@localhost:5432/savdoiq?schema=public"
npm run db:generate && npm run db:push
```

Yoki Docker bilan: `docker compose up -d db`

## 3. Muhit o'zgaruvchilari

`.env` (ildizda):

```ini
NODE_ENV=production
API_PORT=4000
API_URL=https://api.sizningdomen.uz
WEB_URL=https://sizningdomen.uz
TRUST_PROXY=true

DATABASE_URL="postgresql://sp:parol@localhost:5432/savdoiq?schema=public"

SESSION_SECRET=<64 belgi tasodifiy>
ENCRYPTION_KEY=<64 hex belgi>

TELEGRAM_BOT_TOKEN=<BotFather tokeni>
TELEGRAM_BOT_USERNAME=<bot username>
TELEGRAM_ADMIN_IDS=<telegram id>

UZUM_MODE=live
```

Kalit generatsiya qilish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `ENCRYPTION_KEY` ni **hech qachon almashtirmang** — u bilan shifrlangan Uzum API kalitlari
> o'qilmay qoladi. Almashtirish kerak bo'lsa, avval barcha kabinetlarni qayta ulang.

## 4. Yig'ish va ishga tushirish

```bash
npm ci
npm run build
pm2 start "npm run start" --name sp-api
pm2 start "npm run start --workspace @savdoiq/bot" --name sp-bot
pm2 save && pm2 startup
```

Frontend statik fayllari: `apps/web/dist` → nginx orqali beriladi.

## 5. Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name sizningdomen.uz;

  root /var/www/savdoiq/apps/web/dist;
  index index.html;

  # SPA marshrutlash
  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # statik keshlash
  location ~* \.(js|css|svg|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
```

SSL: `sudo certbot --nginx -d sizningdomen.uz`

## 6. Telegram

1. BotFather → `/setdomain` → `https://sizningdomen.uz` (Login Widget uchun **shart**).
2. Webhook rejimi (ixtiyoriy, long polling ham ishlaydi):
   ```ini
   TELEGRAM_WEBHOOK_URL=https://api.sizningdomen.uz/telegram/webhook
   TELEGRAM_WEBHOOK_SECRET=<tasodifiy>
   ```

## 7. Sinxronizatsiya ishchisi

Standart holatda ishchi API jarayoni ichida ishlaydi (`SYNC_IN_PROCESS=true`).
Yuklama oshganda alohida jarayonga ajrating:

```ini
SYNC_IN_PROCESS=false
```

```bash
pm2 start "npm run worker --workspace @savdoiq/api" --name sp-worker
```

## 8. Zaxira nusxa

```bash
# PostgreSQL
pg_dump -U sp savdoiq | gzip > backup-$(date +%F).sql.gz

# SQLite
cp packages/db/prisma/dev.db backups/dev-$(date +%F).db
```

Kuniga bir marta cron bilan bajaring va `.env` faylini alohida, xavfsiz joyda saqlang.

## 9. Monitoring

- `pm2 logs sp-api` / `pm2 monit`
- Sog'liq tekshiruvi: `GET /health` → `{ ok: true }`
- Sinxron xatolari: `/admin` → "Sinxronizatsiya joblari"
