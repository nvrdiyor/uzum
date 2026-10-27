/**
 * Tarif imkoniyatlarining ko'rinadigan nomlari (uz/ru/en) va taqqoslash jadvali guruhlari.
 * API `PlanPublic.features[].label` ni ham qaytaradi — bu yerdagi nom tarjima uchun ustun turadi.
 */

import type { FeatureAccess, FeatureId, PlanPublic } from '@savdoiq/shared';

export interface L10nText {
  uz: string;
  ru: string;
  en: string;
}

export const FEATURE_LABELS: Record<FeatureId, L10nText> = {
  dashboard_realtime: {
    uz: 'Jonli boshqaruv paneli',
    ru: 'Дашборд в реальном времени',
    en: 'Real-time dashboard',
  },
  /*
   * Bitta imkoniyat bir nechta sahifani ochadi. Ilgari yangilari shu nomga
   * qo'shib aytilardi ("Sotuv tahlili va Mening radarim"), chunki jadvalda
   * ular umuman ko'rinmasdi (2026-10-24). Endi radar va narxlar xaritasi —
   * o'z imkoniyatlari (growth_radar, price_map), kategoriyalar — EXTRA_ROWS
   * dagi alohida qator; nom esa o'z sahifasini aytadi (2026-10-27).
   */
  sales_analytics: {
    uz: 'Sotuv tahlili va buyurtma voronkasi',
    ru: 'Аналитика продаж и воронка заказов',
    en: 'Sales analytics and order funnel',
  },
  revenue_roi: { uz: 'Tushum va ROI', ru: 'Выручка и ROI', en: 'Revenue and ROI' },
  products_assortment: { uz: 'Mahsulotlar va assortiment', ru: 'Товары и ассортимент', en: 'Products and assortment' },
  stocks_fbo_fbs: { uz: 'FBO/FBS qoldiqlari', ru: 'Остатки FBO/FBS', en: 'FBO/FBS stock levels' },
  abc_analysis: { uz: 'ABC tahlil', ru: 'ABC-анализ', en: 'ABC analysis' },
  illiquid: { uz: 'Nolikvid tovarlar', ru: 'Неликвиды', en: 'Dead stock' },
  losses_report: { uz: 'Yo‘qotishlar hisoboti', ru: 'Отчёт по потерям', en: 'Losses report' },
  returns_report: { uz: 'Qaytarishlar hisoboti', ru: 'Отчёт по возвратам', en: 'Returns report' },
  // Sahifa Uzum'ning 01.06.2026 dagi rasmiy tarifi bo'yicha hisoblaydi (shared tariffs.ts)
  paid_storage: {
    uz: 'Pullik saqlash (Uzum tarifi, 01.06.2026 dan)',
    ru: 'Платное хранение (тариф Uzum с 01.06.2026)',
    en: 'Paid storage (Uzum tariff from 01.06.2026)',
  },
  // Menyudagi nom bilan bir xil — ilgari "Vazn va o'lcham" deyilardi, menyuda esa "Hajm va VGH"
  vgh_report: { uz: 'Hajm va VGH hisoboti', ru: 'Отчёт «Объём и ВГХ»', en: 'Volume and dimensions report' },
  warehouse: { uz: 'Ombor boshqaruvi', ru: 'Управление складом', en: 'Warehouse management' },
  shipments: { uz: 'Yetkazmalar', ru: 'Поставки', en: 'Shipments' },
  planner: {
    uz: 'Rejalashtiruvchi: FBO ga jo‘natish va xarid',
    ru: 'Планировщик: отгрузка на FBO и закупка',
    en: 'Planner: ship to FBO and buy',
  },
  monthly_reports: {
    uz: 'Oylik hisobot (Telegram’ga yuborish bilan)',
    ru: 'Месячный отчёт (с отправкой в Telegram)',
    en: 'Monthly report (with sending to Telegram)',
  },
  // unit_economics Moliya, Mahsulot foydasi, Unit-iqtisod va Pul kalendarini ochadi (lib/nav.ts)
  unit_economics: {
    uz: 'Moliya markazi va unit-iqtisod',
    ru: 'Финансовый центр и юнит-экономика',
    en: 'Finance hub and unit economics',
  },
  unit_calculator: {
    uz: 'Unit kalkulyator (tarif manbalari bilan)',
    ru: 'Юнит-калькулятор (с источниками тарифов)',
    en: 'Unit calculator (with tariff sources)',
  },
  cost_price: { uz: 'Tannarx boshqaruvi', ru: 'Управление себестоимостью', en: 'Cost price management' },
  expenses: { uz: 'Qo‘shimcha xarajatlar', ru: 'Дополнительные расходы', en: 'Extra expenses' },
  promos: {
    uz: 'Aksiyalar va ularning foydasi',
    ru: 'Акции и их прибыльность',
    en: 'Promotions and their profitability',
  },
  sku_health: {
    uz: 'SKU holati: blok, brak, qaytarishlar',
    ru: 'Состояние SKU: блок, брак, возвраты',
    en: 'SKU health: blocks, defects, returns',
  },
  card_seo: {
    uz: 'Kartochka SEO (audit, kalit so‘zlar, bepul AI uchun so‘rov)',
    ru: 'SEO карточек (аудит, ключевые слова, запрос для бесплатного AI)',
    en: 'Card SEO (audit, keywords, prompt for a free AI chatbot)',
  },
  // Faqat pullik tarifda, sinovda namuna (egasining qarori, 2026-10-27)
  growth_radar: { uz: 'Mening radarim', ru: 'Мой радар', en: 'My radar' },
  price_map: {
    uz: 'Narxlar xaritasi va raqobatchilar narxi (qo‘lda kiritiladi)',
    ru: 'Карта цен и цены конкурентов (вносятся вручную)',
    en: 'Price map and competitor prices (entered manually)',
  },
  reviews_autoreply: { uz: 'Sharhlarga avto-javob', ru: 'Автоответы на отзывы', en: 'Review auto-replies' },
  telegram_notifications: {
    uz: 'Telegram bildirishnomalari va ogohlantirishlar',
    ru: 'Уведомления и предупреждения в Telegram',
    en: 'Telegram notifications and alerts',
  },
  referral: { uz: 'Hamkorlik dasturi', ru: 'Партнёрская программа', en: 'Referral program' },
  export_excel: { uz: 'Excel’ga eksport', ru: 'Экспорт в Excel', en: 'Excel export' },
  api_access: { uz: 'API orqali kirish', ru: 'Доступ по API', en: 'API access' },
  priority_support: { uz: 'Ustuvor qo‘llab-quvvatlash', ru: 'Приоритетная поддержка', en: 'Priority support' },
};

/**
 * Tarifda bor, lekin sahifasi hali chiqmagan imkoniyatlar — ro'yxatlarda
 * "tez kunda" belgisi bilan ko'rsatiladi.
 *
 * Ilgari `vgh_report` oddiy imkoniyat qatori bo'lib sotilardi, sotuvchi esa
 * menyuda bunday hisobotni topa olmasdi (2026-10-24). Sahifa chiqqach shu
 * ro'yxatdan olib tashlanadi: "Hajm va VGH" (/vgh) chiqdi — ro'yxat hozircha
 * bo'sh, keyingi shunday imkoniyat uchun qoldirildi.
 */
export const COMING_SOON_FEATURES: ReadonlySet<string> = new Set<FeatureId>([]);

/**
 * Alohida FeatureId'si yo'q, lekin tarifda ruxsati ANIQ bo'lgan qatorlar
 * (2026-10-27). Ruxsat o'ylab topilmaydi — sahifa yoki xizmat aslida qaysi
 * tekshiruv bilan ochilsa, qator ham o'shandan olinadi:
 *  • Kategoriyalarim → abc_analysis (lib/nav.ts dagi `feature`). Mening
 *    radarim va Narxlar xaritasi endi o'z FeatureId'si bilan (growth_radar,
 *    price_map) — ular oddiy qatorlar;
 *  • Litrovka → unit_calculator (Kalkulyator sahifasining `?tab=litr` bo'limi);
 *  • dayjest va bot hisobotlari → telegram_notifications;
 *  • jamoa → limits.members: 1 kishilik tarifda taklif qilib bo'lmaydi.
 */
export type ExtraRowId =
  | 'categories'
  | 'litrovka'
  | 'team_invite'
  | 'team_views'
  | 'digests'
  | 'bot_reports';

export type CompareRowId = FeatureId | ExtraRowId;

interface ExtraRow {
  label: L10nText;
  source: { feature: FeatureId } | { minMembers: number };
}

export const EXTRA_ROWS: Record<ExtraRowId, ExtraRow> = {
  categories: {
    label: { uz: 'Kategoriyalarim', ru: 'Мои категории', en: 'My categories' },
    source: { feature: 'abc_analysis' },
  },
  litrovka: {
    label: { uz: 'Litrovka kalkulyatori', ru: 'Калькулятор литровки', en: 'Litrovka calculator' },
    source: { feature: 'unit_calculator' },
  },
  team_invite: {
    label: { uz: 'Jamoaga taklif havolasi', ru: 'Приглашение в команду по ссылке', en: 'Team invite link' },
    source: { minMembers: 2 },
  },
  team_views: {
    label: {
      uz: 'Ko‘rinish shablonlari: Omborchi, Buxgalter, Marketolog',
      ru: 'Шаблоны доступа: Кладовщик, Бухгалтер, Маркетолог',
      en: 'View templates: Warehouse, Accountant, Marketer',
    },
    source: { minMembers: 2 },
  },
  digests: {
    label: {
      uz: 'Haftalik va oylik dayjest',
      ru: 'Еженедельный и ежемесячный дайджест',
      en: 'Weekly and monthly digests',
    },
    source: { feature: 'telegram_notifications' },
  },
  bot_reports: {
    label: {
      uz: 'Botda hisobot: bugun, kecha, shu oy, shu yil',
      ru: 'Отчёты в боте: сегодня, вчера, месяц, год',
      en: 'Bot reports: today, yesterday, month, year',
    },
    source: { feature: 'telegram_notifications' },
  },
};

function isExtraRow(id: CompareRowId): id is ExtraRowId {
  return Object.prototype.hasOwnProperty.call(EXTRA_ROWS, id);
}

/** Qator tarifda qanday ishlaydi — FeatureId ham, qo'shimcha qator ham */
export function rowAccess(plan: PlanPublic, id: CompareRowId): FeatureAccess {
  const featureOf = (f: FeatureId): FeatureAccess => plan.features.find((x) => x.id === f)?.access ?? 'off';
  if (!isExtraRow(id)) return featureOf(id);
  const { source } = EXTRA_ROWS[id];
  if ('feature' in source) return featureOf(source.feature);
  return plan.limits.members >= source.minMembers ? 'full' : 'off';
}

/** Qator nomi — tarjima ustun, bo'lmasa API bergan nom */
export function rowLabel(plan: PlanPublic | null, id: CompareRowId, lang: keyof L10nText): string {
  if (isExtraRow(id)) return EXTRA_ROWS[id].label[lang];
  return FEATURE_LABELS[id]?.[lang] ?? plan?.features.find((x) => x.id === id)?.label ?? id;
}

export interface FeatureGroup {
  id: string;
  label: L10nText;
  items: CompareRowId[];
}

/**
 * Taqqoslash jadvali uchun mantiqiy guruhlar — FEATURE_IDS dagi har bir
 * imkoniyat bir marta uchraydi. Ilgari "Aksiyalar" va "SKU holati" bu yerda
 * yo'q edi, jadval ularni umuman ko'rsatmasdi (2026-10-27).
 */
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'analytics',
    label: { uz: 'Analitika', ru: 'Аналитика', en: 'Analytics' },
    items: [
      'dashboard_realtime',
      'sales_analytics',
      'revenue_roi',
      'products_assortment',
      'card_seo',
      'sku_health',
      'promos',
      'abc_analysis',
      'monthly_reports',
    ],
  },
  {
    id: 'growth',
    label: {
      uz: 'O‘sish — faqat o‘z ma’lumotingizdan',
      ru: 'Рост — только по вашим данным',
      en: 'Growth — from your own data only',
    },
    items: ['categories', 'growth_radar', 'price_map'],
  },
  {
    id: 'warehouse',
    label: { uz: 'Ombor va logistika', ru: 'Склад и логистика', en: 'Warehouse and logistics' },
    items: ['stocks_fbo_fbs', 'warehouse', 'shipments', 'planner', 'illiquid', 'paid_storage', 'vgh_report'],
  },
  {
    id: 'finance',
    label: { uz: 'Moliya', ru: 'Финансы', en: 'Finance' },
    items: ['unit_economics', 'unit_calculator', 'litrovka', 'cost_price', 'expenses', 'losses_report', 'returns_report'],
  },
  {
    id: 'team',
    label: { uz: 'Jamoa', ru: 'Команда', en: 'Team' },
    items: ['team_invite', 'team_views'],
  },
  {
    id: 'telegram',
    label: { uz: 'Telegram', ru: 'Telegram', en: 'Telegram' },
    items: ['telegram_notifications', 'digests', 'bot_reports'],
  },
  {
    id: 'services',
    label: { uz: 'Xizmatlar', ru: 'Сервисы', en: 'Services' },
    items: ['reviews_autoreply', 'referral', 'export_excel', 'api_access', 'priority_support'],
  },
];

/**
 * Kartada ko'rsatiladigan asosiy qatorlar (uzun ro'yxatni qisqartirish uchun).
 * Tariflarni ajratadiganlari tanlangan: sinovda namuna bo'lganlar (radar,
 * narxlar xaritasi, ABC, rejalashtiruvchi, VGH), sinovda yo'q jamoa, VIP dagi
 * API va ustuvor yordam.
 * Nolikvid va yo'qotishlar ABC/rejalashtiruvchi bilan bir xil ruxsatda —
 * ular jadvalda qoladi (2026-10-27).
 */
export const CARD_FEATURES: CompareRowId[] = [
  'dashboard_realtime',
  'sales_analytics',
  'unit_economics',
  'growth_radar',
  'price_map',
  'abc_analysis',
  'planner',
  'paid_storage',
  'vgh_report',
  'team_views',
  'digests',
  'reviews_autoreply',
  'api_access',
  'priority_support',
];
