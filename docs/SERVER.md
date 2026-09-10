# Serverni boshqarish — SavdoIQ

**Server:** `139.59.159.128` (Ubuntu 24.04) · **Papka:** `/opt/savdoiq` · **Sayt:** <http://139.59.159.128>

---

## Serverga kirish

```bash
ssh -i ~/.ssh/savdoiq_deploy root@139.59.159.128
```

Yoki parol bilan (kalit ishlamasa):

```bash
ssh root@139.59.159.128
```

---

## Kundalik buyruqlar

| Nima kerak | Buyruq |
| --- | --- |
| Holatni ko'rish | `pm2 status` |
| API loglari | `pm2 logs savdoiq-api --lines 50` |
| Bot loglari | `pm2 logs savdoiq-bot --lines 50` |
| Qayta ishga tushirish | `pm2 restart savdoiq-api savdoiq-bot` |
| To'xtatish | `pm2 stop savdoiq-api savdoiq-bot` |
| Sayt ishlayaptimi | `curl http://127.0.0.1:4000/health` |
| Nginx qayta yuklash | `systemctl reload nginx` |
| Disk / xotira | `df -h /` · `free -m` |

---

## Kodni yangilash (GitHub'dan)

Kompyuteringizda o'zgarish qilib, GitHub'ga yuklaganingizdan keyin serverda:

```bash
cd /opt/savdoiq && git pull && npm install && npm run build && pm2 restart savdoiq-api savdoiq-bot
```

Yoki bitta buyruq bilan (skript hamma narsani o'zi qiladi):

```bash
bash /root/setup-server.sh
```

> Skript idempotent: `.env` dagi `SESSION_SECRET` va `ENCRYPTION_KEY` saqlanib qoladi,
> ma'lumotlar bazasi o'chirilmaydi.

---

## Sozlamalarni o'zgartirish

Hamma sozlama bitta faylda: `/opt/savdoiq/.env`

```bash
nano /opt/savdoiq/.env
# o'zgartirdingiz → Ctrl+O, Enter, Ctrl+X
pm2 restart savdoiq-api savdoiq-bot
```

### Bot tokenini almashtirish

1. Telegram'da [@BotFather](https://t.me/BotFather) → `/mybots` → botni tanlang → **API Token** → `Revoke current token`
2. Yangi tokenni nusxalang
3. Serverda:
   ```bash
   nano /opt/savdoiq/.env      # TELEGRAM_BOT_TOKEN=yangi_token
   pm2 restart savdoiq-bot
   pm2 logs savdoiq-bot --lines 20    # "ishga tushdi" chiqishi kerak
   ```

### Admin qo'shish

`.env` da vergul bilan: `TELEGRAM_ADMIN_IDS=7173535158,123456789`
Telegram ID'ni botda `/id` buyrug'i ko'rsatadi.

### Haqiqiy Uzum ma'lumotlariga o'tish

```bash
nano /opt/savdoiq/.env      # UZUM_MODE=live
pm2 restart savdoiq-api
```

---

## Xavfsizlik (birinchi navbatda qiling)

### 1. Server parolini almashtirish

```bash
passwd
```

### 2. Parol bilan kirishni yopish (kalit ishlagach)

```bash
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

> Buni qilishdan oldin **albatta** kalit bilan kira olishingizni tekshiring —
> aks holda serverga faqat DigitalOcean Console orqali kirasiz.

### 3. Maxfiy kalitlar

`.env` dagi `ENCRYPTION_KEY` ni **hech qachon o'zgartirmang** — u bilan foydalanuvchilarning
Uzum API kalitlari shifrlangan. O'zgarsa, hammasi qaytadan ulanishi kerak bo'ladi.

Nusxasini xavfsiz joyda saqlang:

```bash
grep -E 'SESSION_SECRET|ENCRYPTION_KEY' /opt/savdoiq/.env
```

---

## Domen va HTTPS ulash

Domen olganingizdan keyin (masalan `savdoiq.uz`):

**1.** Domen sozlamalarida A-yozuv qo'shing: `@` → `139.59.159.128` va `www` → `139.59.159.128`

**2.** Serverda:

```bash
# nginx'ga domenni aytamiz
sed -i 's/server_name _;/server_name savdoiq.uz www.savdoiq.uz;/' /etc/nginx/sites-available/savdoiq
nginx -t && systemctl reload nginx

# HTTPS sertifikati (bepul, avtomatik yangilanadi)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d savdoiq.uz -d www.savdoiq.uz --agree-tos -m sizning@email.uz --redirect

# ilovaga yangi manzilni beramiz
sed -i 's|^WEB_URL=.*|WEB_URL=https://savdoiq.uz|' /opt/savdoiq/.env
sed -i 's|^API_URL=.*|API_URL=https://savdoiq.uz|' /opt/savdoiq/.env
cd /opt/savdoiq && npm run build && pm2 restart savdoiq-api savdoiq-bot
```

**3.** Telegram'da: [@BotFather](https://t.me/BotFather) → `/setdomain` → botni tanlang → `https://savdoiq.uz`

> Shundan keyin saytdagi **"Telegram orqali kirish"** tugmasi ham ishlay boshlaydi.
> Domensiz (IP bilan) faqat **botdagi 6 xonali kod** orqali kirish ishlaydi.

---

## Ma'lumotlar bazasi

PostgreSQL, baza nomi `savdoiq`. Ulanish satri `.env` dagi `DATABASE_URL` da.

```bash
# bazaga kirish
sudo -u postgres psql savdoiq

# zaxira nusxa
sudo -u postgres pg_dump savdoiq | gzip > /root/savdoiq-$(date +%F).sql.gz

# tiklash
gunzip -c /root/savdoiq-2026-09-11.sql.gz | sudo -u postgres psql savdoiq
```

Har kuni avtomatik zaxira (cron):

```bash
(crontab -l 2>/dev/null; echo "0 3 * * * sudo -u postgres pg_dump savdoiq | gzip > /root/backup-\$(date +\%F).sql.gz && find /root -name 'backup-*.sql.gz' -mtime +14 -delete") | crontab -
```

---

## Namunaviy (demo) ma'lumotni o'chirish

Haqiqiy foydalanuvchilar kelganda demo kompaniyalarni tozalash:

```bash
cd /opt/savdoiq
sudo -u postgres psql savdoiq -c "DELETE FROM \"Company\" WHERE name IN ('LOOTBOX TECH','SAMARQAND SAVDO');"
sudo -u postgres psql savdoiq -c "DELETE FROM \"User\" WHERE \"telegramId\" LIKE '1000000%';"
pm2 restart savdoiq-api
```

Qaytadan qo'shish kerak bo'lsa: `npm run db:seed`

---

## Muammo bo'lsa

| Belgi | Tekshirish |
| --- | --- |
| Sayt ochilmayapti | `systemctl status nginx` · `nginx -t` |
| Sayt ochiladi, ma'lumot yo'q | `pm2 logs savdoiq-api --lines 80` |
| Bot javob bermayapti | `pm2 logs savdoiq-bot --lines 80` — token to'g'rimi? |
| "409 Conflict" bot logida | Bot ikki joyda ishlayapti — kompyuterdagisini to'xtating |
| Baza xatosi | `systemctl status postgresql` |
| Hammasi qotib qolgan | `pm2 restart all && systemctl reload nginx` |
