# Siz to'ldirishingiz kerak bo'lgan narsalar

> **Qisqa javob: bitta fayl — loyiha ildizidagi `.env`**
> (`C:\Users\Administrator\Desktop\sellerman\.env`)
>
> Kodda hech narsani o'zgartirish shart emas. Boshqa hamma narsa allaqachon yozilgan.

---

## 1. `.env` — barcha kalitlar shu yerda

Fayl allaqachon yaratilgan (`npm run setup` yaratgan). Uni oching va quyidagilarni to'ldiring.

### 🔴 Majburiy — bularsiz bot ishlamaydi

| O'zgaruvchi | Qayerdan olinadi | Namuna |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` | `7712345678:AAH...` |
| `TELEGRAM_BOT_USERNAME` | O'sha bot username'i (`@` siz) | `savdoiq_bot` |
| `TELEGRAM_ADMIN_IDS` | Botda `/id` buyrug'i sizning ID'ingizni aytadi | `123456789` |

> BotFather'da yana bitta qadam: `/setdomain` → domeningiz (masalan `https://savdoiq.uz`).
> Busiz saytdagi **Telegram orqali kirish** tugmasi ishlamaydi. Localda: `http://localhost:5173`.

### 🟡 Haqiqiy Uzum ma'lumotlari uchun

| O'zgaruvchi | Qiymat |
| --- | --- |
| `UZUM_MODE` | `demo` → namunaviy ma'lumot · `live` → haqiqiy Uzum API |

Uzum API kalitining **o'zi `.env` ga yozilmaydi!** Har bir foydalanuvchi o'z kalitini
botga yuboradi yoki saytda **Sozlamalar → Uzum kabinetlar** orqali qo'shadi.
Kalit bazaga AES-256-GCM bilan **shifrlangan holda** yoziladi.

Kalitni olish: `seller.uzum.uz` → **Mening profilim** → **API kalitlar** → *Kalitni yaratish*.

### 🟢 To'lovlarni avtomatlashtirish uchun (ixtiyoriy)

| O'zgaruvchi | Izoh |
| --- | --- |
| `PAYME_MERCHANT_ID`, `PAYME_KEY` | Payme kassa ma'lumotlari |
| `CLICK_MERCHANT_ID`, `CLICK_SERVICE_ID`, `CLICK_SECRET` | Click kassa ma'lumotlari |
| `MANUAL_CARD`, `MANUAL_CARD_OWNER` | Karta raqami va egasi — qo'lda to'lov uchun |

Bularsiz ham tizim ishlaydi: foydalanuvchi kartaga o'tkazadi, siz **/admin → To'lovlar**
bo'limida tasdiqlaysiz va tarif avtomatik yoqiladi.

### ⚙️ Ishlab chiqarishga chiqishda

| O'zgaruvchi | Nima yozish kerak |
| --- | --- |
| `NODE_ENV` | `production` |
| `WEB_URL` | `https://savdoiq.uz` |
| `API_URL` | `https://api.savdoiq.uz` |
| `TRUST_PROXY` | `true` (nginx orqasida) |
| `DATABASE_URL` | PostgreSQL manzili (avval `npm run db:use-postgres`) |
| `SESSION_SECRET` | 32+ belgi tasodifiy satr |
| `ENCRYPTION_KEY` | 64 ta hex belgi — **hech qachon o'zgartirmang** |

Kalit generatsiya qilish:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ `ENCRYPTION_KEY` o'zgarsa, shifrlangan barcha Uzum API kalitlari o'qilmay qoladi
> va foydalanuvchilar kabinetni qayta ulashiga to'g'ri keladi.

---

## 2. Nomni yoki narxni o'zgartirish kerak bo'lsa

Bular kodda, lekin har biri **bitta joyda**:

| Nima | Fayl |
| --- | --- |
| Tarif narxlari, limitlar, imkoniyatlar | `packages/shared/src/plans.ts` |
| Sinxronizatsiya bosqichlari va 30 daqiqa | `packages/shared/src/constants.ts` → `SYNC_STEPS` |
| Standart komissiya, logistika, saqlash | `packages/shared/src/constants.ts` → `DEFAULTS` |
| Referal foizi (20%) | `packages/shared/src/plans.ts` → `REFERRAL_PERCENT` |
| Brend nomi (matn) | `packages/shared/src/index.ts` → `APP.name` |
| Logotip (SVG) | `apps/web/src/components/layout/Sidebar.tsx` → `Logo` |
| Ranglar / dizayn tokenlari | `apps/web/src/styles/index.css` |
| Uzum API yo'llari | `apps/api/src/uzum/endpoints.ts` |
| Bot matnlari (uz/ru) | `apps/bot/src/i18n.ts` |
| Import kalkulyatori standartlari | `apps/api/src/routes/unit.ts` → `IMPORT_FALLBACK` |

---

## 3. Ishga tushirish ketma-ketligi

```bash
npm install
npm run setup      # .env yaratadi + maxfiy kalitlarni generatsiya qiladi + bazani tayyorlaydi
npm run db:seed    # namunaviy ma'lumot (ixtiyoriy)
npm run dev        # sayt :5173 · API :4000 · bot
```

Bot tokeni bo'lmasa ham sayt to'liq ishlaydi — `/login` sahifasida **"Namuna ma'lumot bilan
ko'rish"** tugmasi bor.

---

## 4. Tez-tez so'raladigan savollar

**Foydalanuvchi API kalitini qayerga kiritadi?**
Ikki joyda: Telegram botda (ro'yxatdan o'tish paytida) yoki saytda
**Sozlamalar → Uzum kabinetlar → Kabinet qo'shish**. Ikkalasi ham bir xil bazaga yozadi.

**Kalit xavfsizmi?**
Ha: AES-256-GCM bilan shifrlanadi, interfeysda faqat oxirgi 4 belgi (`••••1234`) ko'rinadi,
bot esa kalit yuborilgan xabarni Telegram'dan o'chirishga harakat qiladi.

**30 daqiqani qisqartirsa bo'ladimi?**
Ha: `.env` da `SYNC_SPEED_FACTOR=60` (30 daqiqa → ~30 soniya). Bu sinov uchun;
haqiqiy foydalanuvchilar uchun `1` qoldiring.

**Ma'lumotlar bazasi qayerda?**
Hozir SQLite: `packages/db/prisma/dev.db`. Serverga chiqishda:
`npm run db:use-postgres` → `.env` da `DATABASE_URL` ni yozing → `npm run db:push`.
