# SavdoIQ

**Uzum Market sotuvchilari uchun analitika platformasi** — Telegram bot orqali ro'yxatdan o'tish,
Uzum seller API kaliti bilan avtomatik sinxronizatsiya va to'liq savdo tahlili.

> sellerman.io kabi funksional, lekin o'z dizayni (grafit + mint), o'z tarif tizimi va
> ochiq, kengaytiriladigan arxitekturasi bilan.

---

## Nimalar bor

| Bo'lim | Tavsif |
| --- | --- |
| **Boshqaruv paneli** | Tushum, sof foyda, marja, ROI, o'rtacha chek — oldingi davr bilan taqqoslab; avtomatik xulosalar (insights) |
| **Sotuv tahlili** | Soatlik taqsimot, buyurtmalar jadvali, shahar/kun/yetkazish turi kesimlari |
| **Sotuv va qoldiq** | Sotuv + qoldiq bir jadvalda, "necha kunga yetadi", oylik potentsial |
| **Mahsulotlar** | Kartochka/jadval ko'rinishi, ROI, marja, konversiya, SKU tafsilotlari |
| **ABC / XYZ** | Pareto tahlili, 3×3 matritsa, guruhlar bo'yicha tushum ulushi |
| **Nolikvidlar** | Muzlagan kapital, sotuvsiz kunlar, saqlash xarajati, tavsiyalar |
| **Tannarx** | Barcha SKU tannarxini tez kiritish, jonli marja/ROI hisobi |
| **Qoldiqlar / Ombor / Yetkazmalar** | FBO / FBS / o'z ombori, qoldiq tarixi, yetkazma rejalari |
| **Rejalashtiruvchi** | Nimani va qancha olib kelish kerak — zaxira davri bo'yicha tavsiya |
| **Yo'qotishlar / Qaytarishlar / Pullik saqlash** | Da'vo matnini tayyorlash, sabablar tahlili, saqlash xarajati |
| **Moliya / Unit-iqtisod / Kalkulyator** | P&L, xarajat tuzilmasi, 1 dona iqtisodi, nol foyda narxi |
| **Import kalkulyatori** | PDD/1688 narxidan Uzum narxi: kurs Markaziy bankdan avtomatik, komissiya sizning buyurtmalaringizdan |
| **Oylik hisobot** | To'liq oylik kesim, oylar taqqoslovi, chop etishga tayyor |
| **Sharhlar** | Reyting taqsimoti, shablonlar bilan javob, ommaviy avto-javob |
| **Tariflar / Referal** | Obuna, to'lov, hamkorlik dasturi (20%) |
| **Telegram bot** | Ro'yxatdan o'tish, API kalit, kunlik hisobot, saytga kirish kodi |

Uch til: **o'zbek / rus / ingliz**. Yorug' va qorong'i mavzu.

---

## Tariflar

| Tarif | Narx (UZS/oy) | Do'kon | Uzum kabinet | Izoh |
| --- | --- | --- | --- | --- |
| **Sinov** | 0 — **7 kun** | 1 | 1 | Ilg'or bo'limlar faqat ko'rish uchun |
| **Standart** | 200 000 | 3 | 3 | Barcha hisobotlar to'liq |
| **Biznes** | 400 000 | 5 | 5 | Tezroq sinxron, ko'proq jamoa |
| **VIP** | 600 000 | 10 | ∞ | API kirish, ustuvor qo'llab-quvvatlash |

Narx va imkoniyatlar bitta joyda: [`packages/shared/src/plans.ts`](packages/shared/src/plans.ts).

---

## Tez boshlash

```bash
npm install
npm run setup      # .env yaratadi, kalitlar generatsiya qiladi, bazani tayyorlaydi
npm run db:seed    # namunaviy ma'lumot (ixtiyoriy, lekin tavsiya etiladi)
npm run dev        # sayt :5173, API :4000, bot (token bo'lsa)
```

Sayt: <http://localhost:5173> · API: <http://localhost:4000/api/v1/health>

Telegram bot tokeni bo'lmasa ham sayt to'liq ishlaydi: `/login` sahifasida **Demo rejim** tugmasi
seed qilingan kompaniyaga kiritadi.

### Talablar

- Node.js 20+
- Ma'lumotlar bazasi: **SQLite** (standart, hech nima o'rnatish shart emas) yoki **PostgreSQL**

---

## Telegram botni ulash

1. [@BotFather](https://t.me/BotFather) da bot yarating → tokenni oling.
2. `.env` ga yozing:
   ```
   TELEGRAM_BOT_TOKEN=123456:AA...
   TELEGRAM_BOT_USERNAME=sizning_botingiz
   ```
3. Saytdan Telegram orqali kirish uchun BotFather'da domenni belgilang:
   `/setdomain` → `http://localhost:5173` (prodda — haqiqiy domeningiz).
4. Admin huquqi uchun: `TELEGRAM_ADMIN_IDS=<sizning telegram id>` (botda `/id` buyrug'i ko'rsatadi).

### Botdagi oqim

```
/start → til → telefon → kompaniya nomi → soliq stavkasi → Uzum API kaliti
      → "Ma'lumot yig'ilmoqda, ~30 daqiqa" → tayyor bo'lganda xabar + saytga kirish kodi
```

---

## Uzum API kalitini olish

`seller.uzum.uz` → **Mening profilim** → **API kalitlar** → kalit yarating va nusxalang.
Kalitni botga yuboring yoki saytda **Sozlamalar → Uzum kabinetlar → Kabinet qo'shish**.

Kalit **AES-256-GCM** bilan shifrlab saqlanadi (`ENCRYPTION_KEY`), interfeysda faqat oxirgi
4 belgisi ko'rinadi.

### Demo va live rejim

```
UZUM_MODE=demo   # haqiqiy API'siz, realistik namunaviy ma'lumot bilan ishlaydi
UZUM_MODE=live   # haqiqiy Uzum Seller API
```

Live rejimga o'tishdan oldin [`docs/UZUM-API.md`](docs/UZUM-API.md) dagi endpoint xaritasini
haqiqiy hujjatlar bilan solishtiring — adapter bitta joyda: `apps/api/src/uzum/`.

---

## Sinxronizatsiya (30 daqiqa)

API kalit ulangach dastlabki to'liq yig'ish ishga tushadi va **~30 daqiqa** davom etadi
(bosqichlar: `packages/shared/src/constants.ts` → `SYNC_STEPS`):

```
API kalit → do'konlar → mahsulotlar → qoldiqlar → buyurtmalar → moliya
         → qaytarishlar → sharhlar → analitika hisobi
```

Jarayon saytda jonli ko'rinadi (`/onboarding`) va yuqori panelda progress chizig'i bo'lib turadi.
Keyingi sinxronlar inkremental va ancha tez (tarifga qarab 10–60 daqiqada bir marta).

Sinovda tezlashtirish uchun: `SYNC_SPEED_FACTOR=60` (30 daqiqa → ~30 soniya).

---

## Buyruqlar

| Buyruq | Vazifasi |
| --- | --- |
| `npm run dev` | Sayt + API + bot (parallel) |
| `npm run dev:web` / `dev:api` / `dev:bot` | Alohida ishga tushirish |
| `npm run build` | Barcha paketlarni yig'ish |
| `npm run start` | Ishlab chiqarish rejimida API |
| `npm run setup` | Boshlang'ich sozlash |
| `npm run db:seed` | Namunaviy ma'lumot |
| `npm run db:studio` | Prisma Studio (baza ko'rinishi) |
| `npm run db:use-postgres` | PostgreSQL'ga o'tish |
| `npm run typecheck` | TypeScript tekshiruvi |

> **Windows eslatmasi:** `npm run build` ni `npm run dev` ishlab turganda bajarmang —
> Prisma dvigatel fayli band bo'lgani uchun `EPERM` xatosi chiqadi. Avval dev serverni to'xtating.

---

## Arxitektura

```
packages/
  shared/   TS tiplar, tariflar, formatlash, unit-iqtisod formulalari
  db/       Prisma sxemasi (SQLite ↔ PostgreSQL) va klient
apps/
  api/      Express REST API + sinxronizatsiya ishchisi
            ├ routes/    19 ta modul (/api/v1/...)
            ├ services/  common (yig'ish), sync, importer, notify
            ├ uzum/      adapter: live + demo klient
            └ worker/    fon jarayoni
  bot/      Telegram bot (grammY)
  web/      React + Vite + Tailwind + Recharts
```

Xavfsizlik: sessiya tokenlari HMAC-hash bilan saqlanadi, API kalitlar AES-256-GCM bilan shifrlanadi,
barcha marshrutlarda rol va tarif tekshiruvi, rate limiting.

Batafsil: [`docs/SIZ-TOLDIRASIZ.md`](docs/SIZ-TOLDIRASIZ.md) · [`docs/UZUM-API.md`](docs/UZUM-API.md) · [`docs/DEPLOY.md`](docs/DEPLOY.md) · [`docs/AGENT-CONTEXT.md`](docs/AGENT-CONTEXT.md)

---

## Keyingi qadamlar (siz to'ldirasiz)

> To'liq ro'yxat va tushuntirishlar: [`docs/SIZ-TOLDIRASIZ.md`](docs/SIZ-TOLDIRASIZ.md)

1. `.env` ga haqiqiy `TELEGRAM_BOT_TOKEN` va admin ID.
2. `UZUM_MODE=live` va `docs/UZUM-API.md` bo'yicha endpointlarni tasdiqlash.
3. To'lov tizimlari: `PAYME_*` / `CLICK_*` kalitlari (yoki qo'lda tasdiqlash rejimida qolish).
4. PostgreSQL va domen: `npm run db:use-postgres`, `WEB_URL`/`API_URL` ni yangilash.
