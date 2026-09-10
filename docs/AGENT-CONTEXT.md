# SavdoIQ — ishlab chiqish konteksti

> Bu hujjat loyihaning shartnomalarini (contracts) belgilaydi. Har bir modul shu qoidalarga amal qiladi.

## Mahsulot

**SavdoIQ** — Uzum Market sotuvchilari uchun analitika platformasi (sellerman.io ga o‘xshash, lekin
o‘z dizayni va o‘z tarif tizimi bilan).

Asosiy oqim:

1. Foydalanuvchi **Telegram bot** orqali ro‘yxatdan o‘tadi (telefon → kompaniya nomi → soliq stavkasi).
2. Bot **Uzum seller API kaliti**ni so‘raydi (seller.uzum.uz → Mening profilim → API kalitlar).
3. API kalit kelgach, platforma **~30 daqiqa** davomida ma’lumotlarni yig‘adi (birinchi to‘liq sinxronizatsiya).
4. Saytga kirish ham Telegram orqali: **Login Widget** yoki botdagi **bir martalik kod/havola**.
5. Analitika: sotuv, foyda, qoldiq, ABC, unit-iqtisod, yo‘qotishlar, sharhlar va h.k.

## Tariflar (UZS / oy)

| Tarif | Narx | Do‘kon | Kabinet |
| --- | --- | --- | --- |
| Sinov (7 kun bepul) | 0 | 1 | 1 |
| Standart | 200 000 | 3 | 3 |
| Biznes | 400 000 | 5 | 5 |
| VIP | 600 000 | 10 | ∞ |

Manba: `packages/shared/src/plans.ts` (`PLANS`, `featureAccess`, `hasFeature`).
Funksiya ruxsati: `full` | `preview` (xira ko‘rinadi, qulf) | `off`.

## Monorepo tuzilishi

```
packages/shared   → umumiy TS tiplar, tariflar, formatlash, hisob-kitob (calc.ts)
packages/db       → Prisma sxemasi + klient (`import { prisma } from '@savdoiq/db'`)
apps/api          → Express REST API (/api/v1) + sinxronizatsiya ishchisi
apps/bot          → Telegram bot (grammY)
apps/web          → React + Vite + Tailwind sayt
```

## Umumiy qoidalar

- **Til:** kod izohlari va UI matnlari o‘zbekcha (lotin). UI’da uz/ru/en tarjima bor.
- **Pul:** UZS, butun son. Sana: ISO-8601 (`YYYY-MM-DD` yoki to‘liq ISO).
- **TypeScript strict.** `any` ishlatmang; `unknown` + tekshiruv yaxshiroq.
- Import: `@savdoiq/shared`, `@savdoiq/db`; web’da `@/...` alias.
- **Mavjud fayllarni buzmang.** Faqat sizga tegishli fayllarni yarating/tahrirlang.
- Yangi npm paketi qo‘shmang — mavjudlari yetarli.

## API konventsiyalari (apps/api)

- Barcha marshrutlar `/api/v1/<modul>` ostida (`src/app.ts` da ulangan).
- Har bir route fayli `const router = Router(); ... export default router;` ko‘rinishida.
- Middleware’lar `src/lib/auth.ts` dan:
  `requireAuth`, `requireCompany`, `requireFeature('<featureId>')`, `requireRole('owner','manager')`, `requireAdmin`.
- Kontekst: `const { user, company, plan } = companyCtx(req);`
- Xatolar: `AppError.badRequest() | unauthorized() | forbidden() | notFound() | limit()`.
  Async handler’ni `ah(...)` bilan o‘rang (`src/lib/errors.ts`).
- Davr/filtr: `resolveRange(req, plan)` → `{ period, previous, from, toExclusive, storeId, page, pageSize, search, sort, order }`
  (`src/lib/period.ts`), sahifalash uchun `paginate(items, page, pageSize)`.
- Javob tiplari **aniq** `packages/shared/src/types.ts` dagi interfeyslarga mos bo‘lsin.
- Ma’lumot yig‘ish yordamchilari: `src/services/common.ts`
  (`getStoreIds`, `getSkuCatalog`, `getLatestStocks`, `aggregateSales`, `getAvgDaily`,
  `getLastSaleDates`, `getExpenses`, `getDailySeries`, `stockState`, `daysSince`, `getTaxRate`).
  **Bu faylni o‘zgartirmang.**

Namuna:

```ts
import { Router } from 'express';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange, paginate } from '../lib/period.js';
import { getStoreIds, aggregateSales } from '../services/common.js';
import type { SalesStockResponse } from '@savdoiq/shared';

const router = Router();
router.use(requireAuth, requireCompany);

router.get('/', requireFeature('stocks_fbo_fbs'), ah(async (req, res) => {
  const { company, plan } = companyCtx(req);
  const range = resolveRange(req, plan);
  const storeIds = await getStoreIds(company.id, range.storeId);
  // ...
  res.json(payload satisfies SalesStockResponse);
}));

export default router;
```

> Import yo‘llarida `.js` kengaytmasi ishlatiladi (ESM uslubi), lekin `moduleResolution: Bundler`
> bo‘lgani uchun kengaytmasiz ham ishlaydi. Mavjud fayllardagi uslubga ergashing.

## Web konventsiyalari (apps/web)

- Sahifa fayli: `src/pages/<Nom>.tsx`, `export default function <Nom>()`.
- Tarjima: fayl boshida `registerNamespace('<ns>', { uz: {...}, ru: {...}, en: {...} })`,
  keyin `const t = useT('<ns>')`. Umumiy kalitlar `common` namespace’da (`src/i18n/common.ts`).
- Formatlash: `const f = useFormat();` → `f.money()`, `f.num()`, `f.pct()`, `f.date()`, `f.compact()`.
- Ma’lumot: `@tanstack/react-query` + `api` klienti (`@/lib/api`).
  Filtrlar: `usePeriodQuery()` (`@/store/ui`) → `{ from, to, storeId }`.
- UI kit: `@/components/ui` → `Card, CardHeader, CardBody, Button, IconButton, Badge, Delta, Input,
  SearchInput, Select, Toggle, Segmented, ProgressBar, ProgressRing, Skeleton, SkeletonRows,
  EmptyState, ErrorState, Avatar, Divider, CheckItem, Sparkline, StatCard, StatGrid, DataTable,
  ProductCell, PlanGate, PreviewBadge, PageHeader, Modal, Drawer, toast`.
- Grafiklar: `@/components/charts` → `TrendChart, LinesChart, BarsChart, DonutChart, ChartCard`.
- Filtr paneli: `@/components/filters` → `<FilterBar />`, `PeriodPicker`, `StoreSwitcher`.
- Ikonkalar: `lucide-react`.
- **Sahifa qolipi:**

```tsx
export default function Foo() {
  const t = useT('foo');
  const f = useFormat();
  const q = usePeriodQuery();
  const { data, isLoading } = useQuery({
    queryKey: ['foo', q],
    queryFn: () => api.get<FooResponse>('/foo', q),
  });

  return (
    <>
      <PageHeader icon={<Icon className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
      <FilterBar />
      <PlanGate feature="abc_analysis">
        {/* mazmun */}
      </PlanGate>
    </>
  );
}
```

## Dizayn tili (muhim)

sellerman.io — binafsha/neon, biz **boshqacha**: **grafit + mint (emerald)**, tinch va aniq.

- Ranglar faqat CSS o‘zgaruvchilari orqali: `bg-surface`, `text-ink`, `text-muted`, `border-line`,
  `text-brand`, `bg-brand/10`, `text-danger`, `text-warn`, `text-info`, `text-violet`.
  **Hech qachon** `bg-gray-800`, `text-white`, `#hex` yozmang (grafik ranglaridan tashqari).
- Kartochka: `card` (radius 18px, 1px chegara, yumshoq soya). Sarlavha: `font-display font-extrabold`.
- Raqamlar: `tnum` klassi (bir xil kenglik).
- Bo‘shliqlar: sahifa bloklari orasida `space-y-5`, grid `gap-4`.
- Har bir sahifada: `PageHeader` → filtrlar → KPI qatori (`StatGrid`) → grafik(lar) → jadval.
- Bo‘sh holat, yuklanish (skeleton) va xato holati **majburiy**.
- Mobil: jadval `overflow-x-auto`, KPI `grid-cols-2`, sidebar chekka menyuga aylanadi.
- Animatsiya: `framer-motion` yengil (0.25s), `ease-spring`.

## Sinxronizatsiya (30 daqiqa)

- Bosqichlar `packages/shared/src/constants.ts` → `SYNC_STEPS` (jami 1800 s).
- `SyncJob` yozuvi progress/step/eta bilan yangilanadi, sayt `/sync/status` ni so‘rab turadi.
- `SYNC_SPEED_FACTOR` (env) sinov uchun jarayonni tezlashtiradi (masalan 60 → ~30 soniya).
- Demo rejim (`UZUM_MODE=demo`) haqiqiy API’siz ishonchli namunaviy ma’lumot generatsiya qiladi.

## Uzum API

- Adapter: `apps/api/src/uzum/client.ts` — `UzumClient` interfeysi, `LiveUzumClient` va `DemoUzumClient`.
- API kalit AES-256-GCM bilan shifrlanadi (`src/lib/crypto.ts` → `encryptSecret`/`decryptSecret`).
- Endpoint yo‘llari bitta konfiguratsiyada (`src/uzum/endpoints.ts`) — real hujjatlar bilan
  moslashtirish oson bo‘lishi uchun.
