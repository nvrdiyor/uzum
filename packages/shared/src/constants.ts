import type { SyncStepId, ExpenseCategory } from './types.js';

/**
 * Dastlabki to'liq sinxronizatsiya bosqichlari.
 * Umumiy `weight` = 1800 sekund (~30 daqiqa) — birinchi marta API kalit ulangandan keyin
 * platforma ma'lumotlarni yig'ib, tarixni qayta hisoblab chiqadi.
 */
export interface SyncStepDef {
  id: SyncStepId;
  /** taxminiy davomiylik, sekund */
  weight: number;
  label: { uz: string; ru: string; en: string };
  hint: { uz: string; ru: string; en: string };
}

export const SYNC_STEPS: SyncStepDef[] = [
  {
    id: 'auth',
    weight: 30,
    label: { uz: 'API kalit tekshirilmoqda', ru: 'Проверка API-ключа', en: 'Verifying API key' },
    hint: {
      uz: 'Uzum kabinetiga ulanish sinovdan o‘tkazilmoqda',
      ru: 'Проверяем подключение к кабинету Uzum',
      en: 'Testing the connection to your Uzum cabinet',
    },
  },
  {
    id: 'shops',
    weight: 60,
    label: { uz: 'Do‘konlar yuklanmoqda', ru: 'Загружаем магазины', en: 'Loading shops' },
    hint: {
      uz: 'Kabinetdagi barcha do‘konlar ro‘yxati olinmoqda',
      ru: 'Получаем список магазинов кабинета',
      en: 'Fetching the shops in your cabinet',
    },
  },
  {
    id: 'products',
    weight: 280,
    label: { uz: 'Mahsulotlar katalogi', ru: 'Каталог товаров', en: 'Product catalogue' },
    hint: {
      uz: 'Mahsulotlar, SKU va narxlar yig‘ilmoqda',
      ru: 'Собираем товары, SKU и цены',
      en: 'Collecting products, SKUs and prices',
    },
  },
  {
    id: 'stocks',
    weight: 220,
    label: { uz: 'Qoldiqlar (FBO/FBS)', ru: 'Остатки (FBO/FBS)', en: 'Stocks (FBO/FBS)' },
    hint: {
      uz: 'Omborlardagi qoldiqlar sinxronlanmoqda',
      ru: 'Синхронизируем остатки на складах',
      en: 'Syncing warehouse stock levels',
    },
  },
  {
    id: 'orders',
    weight: 560,
    label: { uz: 'Buyurtmalar tarixi', ru: 'История заказов', en: 'Order history' },
    hint: {
      uz: 'Bu eng uzun bosqich — barcha buyurtmalar yuklanmoqda',
      ru: 'Самый долгий этап — загружаем все заказы',
      en: 'The longest step — importing every order',
    },
  },
  {
    id: 'finance',
    weight: 280,
    label: { uz: 'Moliya va komissiyalar', ru: 'Финансы и комиссии', en: 'Finance and fees' },
    hint: {
      uz: 'Komissiya, logistika va to‘lovlar hisoblanmoqda',
      ru: 'Считаем комиссии, логистику и выплаты',
      en: 'Computing commission, logistics and payouts',
    },
  },
  {
    id: 'returns',
    weight: 160,
    label: { uz: 'Qaytarishlar va yo‘qotishlar', ru: 'Возвраты и потери', en: 'Returns and losses' },
    hint: {
      uz: 'Qaytarilgan va yo‘qolgan tovarlar aniqlanmoqda',
      ru: 'Определяем возвраты и потерянные товары',
      en: 'Detecting returned and lost items',
    },
  },
  {
    id: 'reviews',
    weight: 110,
    label: { uz: 'Sharhlar', ru: 'Отзывы', en: 'Reviews' },
    hint: {
      uz: 'Mijoz sharhlari va reytinglar olinmoqda',
      ru: 'Загружаем отзывы и рейтинги',
      en: 'Fetching customer reviews and ratings',
    },
  },
  {
    id: 'analytics',
    weight: 100,
    label: { uz: 'Analitika hisoblanmoqda', ru: 'Считаем аналитику', en: 'Building analytics' },
    hint: {
      uz: 'ABC, unit-iqtisod va prognozlar tayyorlanmoqda',
      ru: 'Готовим ABC, юнит-экономику и прогнозы',
      en: 'Preparing ABC, unit economics and forecasts',
    },
  },
];

/** Dastlabki to'liq sinxronizatsiya taxminiy vaqti (sekund) */
export const FIRST_SYNC_SECONDS = SYNC_STEPS.reduce((s, x) => s + x.weight, 0);

/** Keyingi (inkremental) sinxronlar tezroq — shu koeffitsiyentga bo'linadi */
export const INCREMENTAL_SPEEDUP = 12;

export const EXPENSE_CATEGORIES: {
  id: ExpenseCategory;
  label: { uz: string; ru: string; en: string };
  color: string;
}[] = [
  {
    id: 'commission',
    label: { uz: 'Komissiya', ru: 'Комиссия', en: 'Commission' },
    color: '#f97362',
  },
  { id: 'logistics', label: { uz: 'Logistika', ru: 'Логистика', en: 'Logistics' }, color: '#f5b544' },
  { id: 'marketing', label: { uz: 'Marketing', ru: 'Маркетинг', en: 'Marketing' }, color: '#6ea8ff' },
  { id: 'storage', label: { uz: 'Ombor', ru: 'Хранение', en: 'Storage' }, color: '#a78bfa' },
  { id: 'tax', label: { uz: 'Soliq', ru: 'Налог', en: 'Tax' }, color: '#2dd4a7' },
  { id: 'salary', label: { uz: 'Ish haqi', ru: 'Зарплата', en: 'Salary' }, color: '#38bdf8' },
  {
    id: 'other',
    label: { uz: 'Qo‘shimcha', ru: 'Прочее', en: 'Other' },
    color: '#94a3b8',
  },
];

/**
 * Uzum logistikasi: bazaviy narx + har qo'shimcha litr uchun ustama.
 *
 * Bu raqamlar TAXMIN emas — jonli buyurtmalardan o'lchangan: 7015 ta qatorda
 * eng kichik to'lov aynan 5 250 so'm, dona boshiga o'rtacha 14 975 so'm,
 * eng ko'p uchraydigan qiymatlar 12 200–14 100 oralig'ida. Ilgari bu yerda
 * yagona 12 000 so'm turardi va u haqiqatdan ~20% past edi, ya'ni
 * kalkulyator foydani oshirib ko'rsatardi.
 */
export const LOGISTICS_TARIFF = {
  /** 1 litrgacha bo'lgan tovar uchun bazaviy to'lov */
  base: 5_250,
  /** Har qo'shimcha to'liq litr uchun */
  perExtraLiter: 250,
  /**
   * Hajmi ma'lum bo'lmagan SKU uchun zaxira qiymat — o'lchangan mediana.
   * Nol emas: nol logistika foydani yolg'on ko'rsatadi.
   */
  fallback: 13_350,
} as const;

/** Hajm bo'yicha logistika to'lovi (litr). Hajm noma'lum bo'lsa — zaxira qiymat. */
export function logisticsForVolume(volumeL: number | null | undefined): number {
  if (!volumeL || !Number.isFinite(volumeL) || volumeL <= 0) return LOGISTICS_TARIFF.fallback;
  const extra = Math.max(0, Math.ceil(volumeL) - 1);
  return LOGISTICS_TARIFF.base + extra * LOGISTICS_TARIFF.perExtraLiter;
}

/** Uzum bo'yicha standart taxminlar (real API bo'lmaganda hisob uchun) */
export const DEFAULTS = {
  /** Jonli buyurtmalarda o'lchangan: 11,76% */
  commissionPct: 12,
  /** `logisticsForVolume` ishlatib bo'lmaganda — o'lchangan mediana */
  logisticsPerUnit: LOGISTICS_TARIFF.fallback,
  /**
   * DIQQAT: bu qiymat O'LCHANMAGAN. Bazadagi barcha saqlash to'lovlari
   * demo ma'lumot bo'lib chiqdi (aynan shu konstantadan generatsiya
   * qilingan), ya'ni uni tekshirib bo'lmadi. Uzum kabinetidagi haqiqiy
   * tarif bilan solishtirilishi kerak.
   */
  storagePerLiterPerDay: 120,
  buyoutPct: 92,
  taxPct: 1,
  currency: 'UZS',
  timezone: 'Asia/Tashkent',
} as const;

/** Qoldiq holati chegaralari (kun) */
export const STOCK_THRESHOLDS = {
  critical: 7,
  low: 14,
  excess: 90,
  deadDays: 45,
} as const;

export const SESSION_DAYS = 30;
export const LOGIN_CODE_TTL_MINUTES = 10;
