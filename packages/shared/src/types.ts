/**
 * API shartnomalari (DTO) — apps/api va apps/web o'rtasida umumiy.
 * Barcha pul qiymatlari UZS (butun so'mda), sanalar ISO-8601 string.
 */

import type { PlanId, FeatureAccess, FeatureId } from './plans.js';

export type Lang = 'uz' | 'ru' | 'en';
export type DeliveryType = 'FBO' | 'FBS' | 'DBS';
export type OrderStatus = 'new' | 'processing' | 'delivered' | 'canceled' | 'returned';
export type ExpenseCategory =
  | 'commission'
  | 'logistics'
  | 'marketing'
  | 'storage'
  | 'tax'
  | 'salary'
  | 'other';

// ─────────────────────────── Umumiy javob konvertlari ───────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface Period {
  from: string; // ISO date (inclusive)
  to: string; // ISO date (inclusive)
}

export interface RangeQuery extends Partial<Period> {
  storeId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ─────────────────────────── Auth ───────────────────────────

export interface AuthUser {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  phone: string | null;
  language: Lang;
  role: 'user' | 'admin';
  referralCode: string;
  createdAt: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  taxRate: number;
  currency: string;
  onboarded: boolean;
  onboardStep: 'company' | 'tax' | 'api_key' | 'syncing' | 'done';
  role: 'owner' | 'manager' | 'viewer';
}

export interface SubscriptionSummary {
  plan: PlanId;
  status: 'active' | 'expired' | 'canceled' | 'pending';
  startedAt: string;
  expiresAt: string;
  daysLeft: number;
  autoRenew: boolean;
  isTrial: boolean;
}

export interface StoreSummary {
  id: string;
  title: string;
  uzumShopId: string | null;
  status: string;
  productsCount?: number;
}

export interface MeResponse {
  user: AuthUser;
  company: CompanySummary | null;
  companies: CompanySummary[];
  subscription: SubscriptionSummary | null;
  stores: StoreSummary[];
  features: Record<FeatureId, FeatureAccess>;
  limits: {
    stores: number;
    cabinets: number;
    members: number;
    historyDays: number;
    used: { stores: number; cabinets: number; members: number };
  };
  sync: SyncStatus | null;
  unreadNotifications: number;
}

export interface TelegramAuthPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
  /** referal kodi (havoladan) */
  ref?: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
  isNewUser: boolean;
}

// ─────────────────────────── Uzum kabinet & sinxron ───────────────────────────

export interface UzumAccountSummary {
  id: string;
  label: string;
  keyHint: string | null;
  status: 'pending' | 'active' | 'invalid' | 'disabled';
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  storesCount: number;
  createdAt: string;
}

export type SyncStepId =
  | 'queued'
  | 'auth'
  | 'shops'
  | 'products'
  | 'stocks'
  | 'orders'
  | 'finance'
  | 'returns'
  | 'reviews'
  | 'analytics'
  | 'done';

export interface SyncStatus {
  jobId: string | null;
  status: 'idle' | 'queued' | 'running' | 'done' | 'failed';
  progress: number; // 0..100
  step: SyncStepId;
  stepIndex: number;
  totalSteps: number;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * Taxminiy qolgan vaqt (sekund) — oldingi sinxronlarning haqiqiy
   * davomiyligidan. 0 — hali noma'lum (birinchi sinxron boshida).
   */
  etaSeconds: number;
  firstRun: boolean;
}

// ─────────────────────────── Dashboard ───────────────────────────

export interface MetricValue {
  value: number;
  /** oldingi shu davrga nisbatan % o'zgarish */
  deltaPct: number | null;
  previous: number | null;
}

export interface DashboardResponse {
  period: Period;
  currency: string;
  revenue: MetricValue;
  payout: MetricValue;
  /**
   * Sof foyda — BARCHA xarajatdan keyin: komissiya, mijozga yetkazish, tannarx,
   * soliq VA davr xarajatlari (omborga logistika, reklama, saqlash, sotuvchining
   * o'z xarajatlari). Marja va ROI ham shundan hisoblanadi.
   */
  netProfit: MetricValue;
  /**
   * Sotilgan tovarlar bo'yicha foyda — davr xarajatlaridan OLDIN
   * (`netProfit + expenses.periodOnly`). Buyurtma va mahsulot darajasidagi
   * foyda shu ma'noda: davr xarajatini alohida buyurtmaga bog'lab bo'lmaydi.
   */
  itemProfit: number;
  margin: MetricValue;
  roi: MetricValue;
  ordersCount: MetricValue;
  unitsSold: MetricValue;
  avgCheck: MetricValue;
  buyoutRate: MetricValue;
  returnsRate: MetricValue;
  paidYesterday: number;
  expectedToday: number;
  /**
   * Uzum kabinetidagi "Umumiy balans" — hisobda to'plangan va hali yechib
   * olinmagan pul: sotuv − komissiya − Uzum ushlagan xizmat to'lovlari.
   * Foyda ko'rsatkichlari bilan solishtirilmaydi: foyda tannarxni ham
   * ayiradi, balans esa yo'q.
   */
  uzumBalance: number;
  paidOrdersYesterday: number;
  expectedOrdersToday: number;
  expenses: {
    commission: number;
    logistics: number;
    marketing: number;
    storage: number;
    tax: number;
    other: number;
    total: number;
    /**
     * Davr xarajatlari (omborga logistika, reklama, saqlash, boshqa) —
     * `itemProfit` dan ayirilib `netProfit` chiqadi. Komissiya va mijozga
     * yetkazish buyurtmaning o'zida ayrilgani uchun bu yerga kirmaydi.
     */
    periodOnly: number;
  };
  series: TimeSeriesPoint[];
  storesBreakdown: { storeId: string; title: string; revenue: number; orders: number }[];
  topProducts: TopProductRow[];
  insights: Insight[];
  stockValue: { units: number; amount: number; fbo: number; fbs: number };
}

export interface TimeSeriesPoint {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
  units: number;
  payout?: number;
  returns?: number;
}

export interface TopProductRow {
  skuId: string;
  sku: string;
  /** SKU nomi — ko'pincha faqat variant («ЧЕРН», «БЕЛЫЙ») */
  title: string;
  /** Mahsulot nomi: ikki xil tovarning bir xil nomli variantlarini ajratadi */
  productTitle?: string;
  imageUrl: string | null;
  revenue: number;
  profit: number;
  units: number;
  share: number;
  margin: number;
}

export interface Insight {
  id: string;
  level: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body: string;
  /** UI'da bosilganda o'tadigan sahifa */
  link?: string;
  metric?: string;
}

// ─────────────────────────── Sotuv tahlili ───────────────────────────

export interface HourlyPoint {
  hour: number; // 0..23
  orders: number;
  revenue: number;
}

export interface OrderRow {
  id: string;
  uzumOrderId: string | null;
  status: OrderStatus;
  deliveryType: DeliveryType;
  orderedAt: string;
  buyerCity: string | null;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  qty: number;
  purchasePrice: number;
  sellPrice: number;
  revenue: number;
  commission: number;
  logistics: number;
  payout: number;
  netProfit: number;
  margin: number;
}

export interface SalesAnalyticsResponse {
  period: Period;
  /** Davrdagi jami tushum (filtr qo'llangan) */
  revenue: number;
  /** Davrdagi jami sof foyda (filtr qo'llangan) */
  netProfit: number;
  /**
   * BUYURTMALAR SONI — bekor qilinmagan va qaytarilmagan buyurtmalar (filtr
   * qo'llangan). Yangi buyurtma darhol sanaladi va xaridor olib ketgach ham
   * sanoqda qoladi; bekor bo'lsa yoki qaytarilsa — sanoqdan chiqadi.
   * Sahifadagi barcha kesimlar (soat, hafta kuni, yetkazish turi, shahar) shu sanoqda.
   */
  ordersActive: number;
  /** Sanoqqa kirmagan: butunlay bekor qilingan buyurtmalar */
  ordersCanceled: number;
  /** Sanoqqa kirmagan: butunlay qaytarilgan buyurtmalar */
  ordersReturned: number;
  hourly: HourlyPoint[];
  /** Davrdagi BARCHA buyurtmalar, bekor va qaytarilganlari bilan (filtrsiz) */
  totalOrders: number;
  orders: Paginated<OrderRow>;
  byDeliveryType: { type: DeliveryType; orders: number; revenue: number }[];
  byCity: { city: string; orders: number; revenue: number }[];
  byWeekday: { weekday: number; orders: number; revenue: number }[];
}

// ─────────────────────────── Sotuv voronkasi ───────────────────────────

export type FunnelStepId = 'ordered' | 'sold' | 'canceled' | 'returned';

export interface FunnelStep {
  id: FunnelStepId;
  /** Dona */
  value: number;
  /** So'm */
  amount: number;
  prevValue: number;
  prevAmount: number;
  /** Oldingi davrga nisbatan o'zgarish, % */
  deltaPct: number | null;
  /** Buyurtmadan shu bosqichgacha yetib kelgan ulush, % */
  conversion: number | null;
}

export interface FunnelProductRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  ordered: number;
  orderedAmount: number;
  sold: number;
  soldAmount: number;
  canceled: number;
  returned: number;
  /** Sotib olish foizi: sotilgan / buyurtma qilingan */
  buyoutRate: number;
  /** Bitta dona uchun o'rtacha narx */
  avgPrice: number;
  /** Sotilgan summadagi ulushi, % */
  share: number;
  deltas: {
    ordered: number | null;
    sold: number | null;
    soldAmount: number | null;
    buyoutRate: number | null;
  };
}

export interface FunnelResponse {
  period: Period;
  previous: Period;
  currency: string;
  steps: FunnelStep[];
  totals: {
    ordered: number;
    orderedAmount: number;
    sold: number;
    soldAmount: number;
    canceled: number;
    returned: number;
    canceledAmount: number;
    buyoutRate: number;
    avgPrice: number;
  };
  daily: { date: string; ordered: number; sold: number; canceled: number; returned: number }[];
  rows: FunnelProductRow[];
  /** Uzum API bermaydigan bosqichlar (namoyish, kartochka ochish, savatga qo'shish) */
  missingSteps: string[];
}

// ─────────────────────────── Sotuv va qoldiq ───────────────────────────

export interface SalesStockRow {
  skuId: string;
  sku: string;
  title: string;
  storeTitle: string;
  imageUrl: string | null;
  sold: number;
  stockFbo: number;
  stockFbs: number;
  stockOwn: number;
  revenue: number;
  payout: number;
  netProfit: number;
  /** kunlik o'rtacha sotuv */
  avgDaily: number;
  /** qoldiq necha kunga yetadi */
  daysLeft: number | null;
  /** oyiga potentsial sotuv (dona) */
  monthPotential: number;
  status: 'critical' | 'low' | 'ok' | 'excess' | 'dead';
}

export interface SalesStockResponse {
  period: Period;
  totals: {
    sold: number;
    inStock: number;
    revenue: number;
    payout: number;
    netProfit: number;
    skuCount: number;
  };
  rows: Paginated<SalesStockRow>;
}

// ─────────────────────────── Mahsulotlar ───────────────────────────

export interface ProductCardSku {
  id: string;
  sku: string;
  title: string;
  price: number;
  /**
   * SOF sotib olish narxi — foydalanuvchi tahrirlaydigan maydon.
   * Qo'shimcha xarajat (`extraCost`) bu yerga QO'SHILMAYDI: ilgari
   * birlashtirilgan qiymat qaytarilar va tahrir oynasiga ham o'sha tushar edi,
   * saqlanganda esa qo'shimcha xarajat tannarxga qo'shilib ketardi —
   * har tahrirda tannarx o'z-o'zidan o'sib borardi.
   */
  purchasePrice: number;
  /** Qadoq, marker va boshqa qo'shimcha xarajat (bir dona uchun) */
  extraCost: number;
  /** `purchasePrice + extraCost` — ko'rsatish uchun to'liq tannarx */
  totalCost: number;
  stockFbo: number;
  stockFbs: number;
  stockOwn: number;
  sold: number;
  revenue: number;
  profit: number;
}

export interface ProductCard {
  id: string;
  uzumProductId: string | null;
  title: string;
  category: string | null;
  imageUrl: string | null;
  status: string;
  rating: number;
  reviewsCount: number;
  skuCount: number;
  /**
   * JORIY narx — katalogdagi eng arzon SKU narxi (aksiyada bo'lsa aksiya narxi).
   *
   * Ilgari bu yerda davr bo'yicha o'rtacha sotilgan narx turardi va joriy narx
   * uning ostida "eski narx"dek chizib ko'rsatilardi: 59 000 ga sotilayotgan
   * tovar "44 333, 59 000 dan −25%" bo'lib chiqardi. O'rtacha endi alohida
   * maydonda (`avgSoldPrice`) va o'z nomi bilan ko'rsatiladi.
   */
  minPrice: number;
  /** Chegirmadan OLDINGI narx; chegirma bo'lmasa 0 */
  listPrice: number;
  /** Davr ichida xaridorlar haqiqatda to'lagan o'rtacha narx (tushum / dona); sotuv bo'lmasa 0 */
  avgSoldPrice: number;
  /** Faol aksiya — nomi va tugash sanasi (ISO) */
  promo: { name: string; endsAt: string | null } | null;
  sold: number;
  returns: number;
  revenue: number;
  profit: number;
  roi: number;
  margin: number;
  conversion: number;
  stockFbo: number;
  stockFbs: number;
  stockOwn: number;
  daysLeft: number | null;
  needOrder: number;
  /** Arxivdagi tovar SavdoIQ'da o'chirilgan — ro'yxatlarda va tannarxda ko'rinmaydi */
  hidden: boolean;
  skus: ProductCardSku[];
}

export interface ProductsResponse {
  totals: {
    products: number;
    skus: number;
    inStock: number;
    needOrder: number;
    storageCostPerDay: number;
    /** O'chirilgan (yashirilgan) tovarlar soni — qidiruv hisobga olingan */
    hidden: number;
  };
  items: Paginated<ProductCard>;
}

// ─────────────────────────── Mahsulot foydasi ───────────────────────────

/**
 * Bitta mahsulotning pul oqimi davr bo'yicha: tushumdan sof foydagacha.
 *
 * Zanjir yopiladi:
 *   tushum − komissiya − yetkazish = chiqarishga (Uzum to'laydigan pul)
 *   chiqarishga − tannarx − qo'shimcha − soliq − reklama = sof foyda
 * Bekor qilingan va qaytarilgan sotuvlar kirmaydi.
 */
export interface ProductProfitMoney {
  revenue: number;
  commission: number;
  logistics: number;
  /** Uzum "yechib olish uchun" beradigan summa */
  payout: number;
  /** Tovar tannarxi (sotib olish narxi × dona) */
  cogs: number;
  /** Bir donaga qo'shimcha xarajat (qadoq, marker) × dona */
  otherCost: number;
  tax: number;
  /** Shu mahsulotning reklama to'lovi (buyurtmalarni ko'paytirish) */
  ads: number;
  netProfit: number;
}

export interface ProductProfitRow extends ProductProfitMoney {
  /** Ichki mahsulot id'si — tafsilot sahifasiga havola */
  productId: string;
  title: string;
  category: string | null;
  imageUrl: string | null;
  /** Sotuvchi katalogdan yashirgan mahsulot — puli baribir hisobda */
  hidden: boolean;
  skuCount: number;
  /** Sotilgan dona (bekor va qaytarilganlarsiz) */
  units: number;
  orders: number;
  returns: number;
  margin: number;
  /** Sof foyda ÷ (tannarx + qo'shimcha), % */
  roi: number;
  /** Bir donaga: shu davrdagi o'rtacha (jami ÷ dona); sotuv bo'lmasa 0 */
  perUnit: ProductProfitMoney;
}

export interface ProductProfitResponse {
  period: Period;
  currency: string;
  totals: ProductProfitMoney & { units: number; orders: number; products: number; margin: number; roi: number };
  rows: ProductProfitRow[];
  /**
   * Mahsulotga bog'lab bo'lmaydigan davr xarajatlari: omborga logistika, umumiy
   * reklama, saqlash va h.k. Mahsulotlar sof foydasi yig'indisidan shu ayrilsa —
   * do'konning sof foydasi chiqadi (Boshqaruv panelidagi bilan bir xil).
   */
  unallocated: number;
}

// ─────────────────────────── ABC tahlil ───────────────────────────

export interface AbcRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  revenue: number;
  profit: number;
  units: number;
  share: number;
  cumulativeShare: number;
  group: 'A' | 'B' | 'C';
  xyzGroup?: 'X' | 'Y' | 'Z';
}

export interface AbcResponse {
  period: Period;
  groups: {
    group: 'A' | 'B' | 'C';
    skuCount: number;
    revenue: number;
    units: number;
    revenueShare: number;
  }[];
  rows: AbcRow[];
}

// ─────────────────────────── Nolikvid ───────────────────────────

export interface IlliquidRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  stock: number;
  stockValue: number;
  daysWithoutSale: number;
  lastSaleAt: string | null;
  storageCostPerMonth: number;
  recommendation: 'discount' | 'promo' | 'withdraw' | 'watch';
  frozenCapital: number;
}

export interface IlliquidResponse {
  period: Period;
  totalFrozen: number;
  totalUnits: number;
  rows: Paginated<IlliquidRow>;
}

// ─────────────────────────── Qoldiqlar / ombor ───────────────────────────

export interface StockRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  storeTitle: string;
  fbo: number;
  fbs: number;
  own: number;
  reserved: number;
  inTransit: number;
  total: number;
  costValue: number;
  retailValue: number;
  avgDaily: number;
  daysLeft: number | null;
  status: 'critical' | 'low' | 'ok' | 'excess' | 'dead';
}

export interface StocksResponse {
  totals: { units: number; costValue: number; retailValue: number; skuCount: number };
  rows: Paginated<StockRow>;
}

// ─────────────────────────── Rejalashtiruvchi ───────────────────────────

export interface PlannerRow {
  skuId: string;
  sku: string;
  /** Mahsulot nomi */
  title: string;
  /** Variant (rang, o'lcham) — mahsulot nomidan farq qilsa, aks holda null */
  variant: string | null;
  imageUrl: string | null;
  /** Sotuvdagi qoldiq: FBO + FBS + o'z ombori */
  stock: number;
  /** Uzum omboriga jo'natilgan, hali qabul qilinmagan dona */
  inbound: number;
  /**
   * Kunlik sotuv tezligi — tovar sotuvda BO'LGAN kunlar bo'yicha.
   * Tugab turgan kunlar bo'luvchiga kirmaydi, aks holda tezlik past ko'rinadi.
   */
  avgDaily: number;
  /** Tezlik hisoblangan oynadagi sotuv, dona */
  soldUnits: number;
  /** Shu oynada tovar sotuvda bo'lgan kunlar */
  inStockDays: number;
  /** Shu oynada tovar tugab turgan kunlar */
  stockoutDays: number;
  /** Oxirgi 14 kun tezligining butun oynaga nisbatan farqi, %; ma'lumot kam bo'lsa null */
  trendPct: number | null;
  /** Qoldiq (yo'ldagisi bilan) necha kunga yetadi; sotuv yo'q bo'lsa null */
  daysLeft: number | null;
  stockoutDate: string | null;
  /** Shu sanadan kechikmay buyurtma berilsa, tovar tugamasdan yetib keladi */
  orderBy: string | null;
  /** `orderBy` gacha qolgan kun; 0 va manfiy — bugun berish kerak yoki kechikilgan */
  orderInDays: number | null;
  /** tanlangan zaxira davri uchun kerakli miqdor */
  recommendedQty: number;
  purchaseCost: number;
  /**
   * critical — bugun buyurtma berilsa ham tovar kelguncha tugaydi;
   * ending — buyurtma kuni yetdi yoki bir hafta ichida;
   * enough — hozircha shoshilmasa bo'ladi; no_action — sotuv yo'q.
   */
  status: 'critical' | 'ending' | 'enough' | 'no_action';
  /** Bugun buyurtma berilsa ham tovar kelguncha qoldiqsiz o'tadigan kunlar */
  gapDays: number;
  /** O'sha kunlarda yo'qotiladigan tushum */
  lostRevenue: number;
  /** Oynada tugab turgan kunlarda sotilmay qolgan taxminiy tushum */
  lostPast: number;
}

export interface PlannerResponse {
  coverDays: number;
  leadDays: number;
  /** Sotuv tezligi hisoblangan oyna, kun */
  windowDays: number;
  /** Buyurtma kuni hisobidagi ehtiyot zaxirasi, kun */
  safetyDays: number;
  counts: { all: number; critical: number; ending: number; enough: number; noAction: number };
  /** Butun katalog bo'yicha — qaysi yorliq ochiq bo'lishidan qat'i nazar */
  totals: {
    /** Miqdor tavsiya etilgan SKU'lar soni */
    needSkus: number;
    purchaseCost: number;
    /** Tovar kelguncha yo'qotiladigan tushum (kritik pozitsiyalar) */
    lostRevenue: number;
    /** Oynada tovar tugab turgani uchun sotilmay qolgan taxminiy tushum */
    lostPast: number;
    /** Buyurtma kuni yetgan yoki o'tgan SKU'lar soni */
    orderNow: number;
  };
  rows: PlannerRow[];
}

// ─────────────────────────── Oylik hisobot ───────────────────────────

export interface MonthlyReportResponse {
  period: Period;
  revenue: number;
  grossProfit: number;
  netProfit: number;
  avgCheck: number;
  ordersTotal: number;
  ordersSuccess: number;
  unitsSold: number;
  canceled: number;
  returns: number;
  returnRate: number;
  successRate: number;
  grossMargin: number;
  taxRate: number;
  expenses: { category: ExpenseCategory; amount: number }[];
  expensesTotal: number;
  topProducts: TopProductRow[];
  categories: { category: string; revenue: number; share: number }[];
  deliveryTypes: { type: DeliveryType; orders: number; success: number }[];
  warehouse: { fbo: number; fboAmount: number; fbs: number; fbsAmount: number };
  daily: TimeSeriesPoint[];
  insights: Insight[];
}

// ─────────────────────────── Moliya / unit-iqtisod ───────────────────────────

export interface FinanceResponse {
  period: Period;
  revenue: number;
  payout: number;
  cogs: number;
  /** Tushum − tannarx */
  grossProfit: number;
  /**
   * Sof foyda — SOTILGAN TOVARLAR bo'yicha: tushum − tannarx − komissiya −
   * mijozga yetkazish − soliq. Boshqaruv panelidagi "Sof foyda" bilan bir xil.
   */
  netProfit: number;
  /**
   * Davr foydasi — sof foydadan davr xarajatlari ayrilgandan keyin:
   * omborga logistika, reklama, saqlash, ish haqi va boshqalar.
   * Bu — yakuniy natija.
   */
  operatingProfit: number;
  /** Sof foydaga kirmagan davr xarajatlari yig'indisi */
  periodExpenses: number;
  expenses: { category: ExpenseCategory; amount: number; share: number }[];
  expensesTotal: number;
  taxAmount: number;
  daily: { date: string; revenue: number; expenses: number; profit: number }[];
  balance: {
    /** Yetkazilgan buyurtmalar bo'yicha to'lovga tayyor summa */
    paidOut: number;
    /** Hali yetkazilmagan buyurtmalar summasi */
    pending: number;
    /** Uzumdagi "Umumiy balans" — hisobda to'plangan, hali yechib olinmagan pul */
    total: number;
    nextPayoutAt: string | null;
    /**
     * `nextPayoutAt` sotuvchi TASDIQLAGAN jadvaldan hisoblanganmi.
     *
     * Uzum to'lov jadvalini API'da bermaydi. Tasdiqlanmagan bo'lsa sana
     * standart jadvaldan chiqadi va uni haqiqatdek ko'rsatish xato bo'ladi.
     */
    payoutConfirmed: boolean;
  };
}

export interface UnitEconomicsRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  price: number;
  purchasePrice: number;
  commissionPct: number;
  commission: number;
  logistics: number;
  storage: number;
  otherCost: number;
  tax: number;
  netProfit: number;
  margin: number;
  roi: number;
  breakEvenPrice: number;
  unitsSold: number;
  totalProfit: number;
}

export interface UnitEconomicsResponse {
  period: Period;
  totals: { revenue: number; profit: number; margin: number; roi: number };
  rows: Paginated<UnitEconomicsRow>;
}

export interface UnitCalcInput {
  price: number;
  purchasePrice: number;
  commissionPct: number;
  logistics: number;
  storagePerDay: number;
  storageDays: number;
  packaging: number;
  otherCost: number;
  taxPct: number;
  buyoutPct: number;
  returnLogistics: number;
  qty: number;
}

export interface UnitCalcResult {
  revenue: number;
  commission: number;
  logisticsTotal: number;
  storageTotal: number;
  cogs: number;
  tax: number;
  costTotal: number;
  netProfit: number;
  netProfitPerUnit: number;
  margin: number;
  markup: number;
  roi: number;
  breakEvenPrice: number;
  breakEvenQty: number;
}

// ─────────────────────────── Xitoydan import (PDD) kalkulyatori ───────────────────────────

export interface ImportCalcInput {
  /** PDD/1688 dagi narx (yuan, kupondan keyingi — 券后) */
  pddPrice: number;
  /** Qadoq bilan og'irligi (gramm) */
  weightGr: number;
  /** 1 CNY necha so'm */
  rate: number;
  /** Kargo narxi: so'm / kg */
  cargoPerKg: number;
  /** Uzum komissiyasi, % */
  commissionPct: number;
  /** Reklama va aksiyalarga ajratma, % */
  adsPct: number;
  /** Bitta buyurtma uchun yetkazib berish, so'm */
  deliveryFee: number;
  /** Foyda koeffitsienti: tannarxga nisbatan (2 = tannarxdan 2 barobar foyda) */
  profitMultiplier: number;
  /** Narxni yaxlitlash qadami (so'm). 0 — yaxlitlanmaydi */
  roundStep?: number;
}

export interface ImportCalcResult {
  /** Tovarning so'mdagi narxi (PDD × kurs) */
  goodsCost: number;
  /** Kargo (yetkazib olib kelish) xarajati */
  cargoCost: number;
  /** Tannarx = tovar + kargo */
  cost: number;
  /** Yaxlitlashdan oldingi narx */
  rawPrice: number;
  /** Uzum'da qo'yish kerak bo'lgan narx */
  price: number;
  commission: number;
  ads: number;
  delivery: number;
  netProfit: number;
  margin: number;
  roi: number;
  costShare: number;
  /** Qoida koeffitsienti: maksimal tannarx = narx × maxCostFactor − maxCostOffset */
  maxCostFactor: number;
  maxCostOffset: number;
  /** Komissiya + reklama 100% dan oshmasa true */
  valid: boolean;
}

export interface ImportDefaults extends ImportCalcInput {
  /** Kurs manbasi: cbu — Markaziy bank, fallback — zaxira qiymat */
  rateSource: 'cbu' | 'manual' | 'fallback';
  rateUpdatedAt: string | null;
  /** Komissiya haqiqiy buyurtmalardan hisoblandimi */
  commissionFromData: boolean;
}

// ─────────────────────────── Xarid partiyalari ───────────────────────────

export type BatchDelivery = 'avia' | 'avto';

/** Sotuvchi kiritadigan maydonlar — qolgani hisoblanadi */
export interface BatchItemInput {
  name: string;
  trackCode: string;
  /** Nechta dona; 0 — kiritilmagan */
  qty: number;
  /** Qatorning jami narxi (barcha donalar uchun), ¥ */
  priceCny: number;
  cargoName: string;
  delivery: BatchDelivery;
  weightKg: number;
  /** Kargo haqi, so'm */
  cargoCost: number;
}

/** Qo'shimcha xarajatning bitta qatori */
export interface BatchExtraInput {
  /** Izoh: nima uchun to'langan (bojxona, yo'l haqi...) */
  name: string;
  /** so'm */
  amount: number;
}

export interface BatchItemRow extends BatchItemInput {
  id: string;
  /** priceCny × kurs, so'm */
  priceUzs: number;
  /** priceUzs + cargoCost */
  total: number;
  /** total ÷ qty; soni kiritilmagan bo'lsa null */
  unitCost: number | null;
  /** Qo'shimcha xarajatning shu qatorga kg ulushi bo'yicha tushgan qismi, so'm */
  extraShare: number;
  /** (total + extraShare) ÷ qty; soni yoki (xarajat bo'lsa) kg kiritilmagan bo'lsa null */
  unitCostFull: number | null;
}

export interface BatchTotals {
  items: number;
  qty: number;
  weightKg: number;
  priceCny: number;
  goodsUzs: number;
  cargoUzs: number;
  extra: number;
  /** Qo'shimcha xarajat ÷ jami kg; kg kiritilmagan bo'lsa 0 */
  extraPerKg: number;
  total: number;
}

export interface BatchSummary {
  id: string;
  name: string;
  rate: number;
  extra: number;
  totals: BatchTotals;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetail extends BatchSummary {
  items: BatchItemRow[];
  /** Qo'shimcha xarajat tafsiloti; bo'sh bo'lsa `extra` qo'lda kiritilgan */
  extras: BatchExtraInput[];
  /** Kompaniyaning boshqa partiyalarida ishlatilgan kargo nomlari — tanlash uchun */
  cargoNames: string[];
}

export interface BatchListResponse {
  items: BatchSummary[];
  total: number;
}

export interface BatchRate {
  rate: number;
  source: 'cbu' | 'fallback';
  updatedAt: string | null;
}

// ─────────────────────────── Yo'qotish / qaytarish / saqlash ───────────────────────────

/**
 * SavdoIQ o'zi aniqlagan yo'qotish turi (Uzum API'da yo'qotishlar ro'yxati yo'q):
 *  • `balance`  — tovar balansida hisobda yo'q: qabul qilingan − sotilgan − ombordagi;
 *  • `counter`  — Uzum o'zi "yo'qolgan" deb belgilagan dona;
 *  • `defect`   — Uzum brak deb belgilagan dona;
 *  • `shortage` — nakladnoyda yuborilgandan kam qabul qilingan.
 */
export type LossKind = 'balance' | 'counter' | 'defect' | 'shortage';

/** Bekor qilingan yoki qaytarilgan, ammo omborga qaytgani ko'rinmagan buyurtma */
export interface BalanceOrderRef {
  orderId: string;
  /** Buyurtma sanasi (ISO) */
  date: string;
  kind: 'canceled' | 'returned';
  qty: number;
  /** Uzum bergan sabab (asl matni) */
  cause: string | null;
  /** Shu sanagacha omborga qaytishi kutiladi (ISO) */
  expectedBy: string;
}

/**
 * Kompensatsiya taxmini — Uzum qo'llanmasi 6.8 formulasi bo'yicha:
 * tovarning haqiqiy narxi − marketpleys komissiyasi.
 */
export interface CompensationBasis {
  /** "Haqiqiy narx": bir donaning o'rtacha sotuv narxi */
  price: number;
  /**
   * Narx qayerdan: oxirgi 30 kun o'rtachasi → sotuv bo'lmasa 90 kun →
   * u ham bo'lmasa oxirgi sotuv narxi → umuman sotilmagan bo'lsa kabinetdagi narx.
   */
  basis: '30d' | '90d' | 'last' | 'list';
  /** Bir donadagi marketpleys komissiyasi */
  commission: number;
  /** Bir dona uchun kompensatsiya: narx − komissiya */
  unit: number;
}

/** Yo'qotish yozuvining dalili — raqam qayerdan chiqqani */
export interface LossEvidence {
  /** Summa qanday hisoblangani */
  comp?: CompensationBasis;
  /** Shu donalarning tannarxi — solishtirish uchun */
  cost?: number;
  /** balance: tenglama hadlari */
  accepted?: number;
  sold?: number;
  returnedToSeller?: number;
  onHand?: number;
  /** Uzumda, lekin sotuvda emas (qo'shimcha ombor, fotostudiya, brak) */
  held?: number;
  /** Qaytishi hali kutilayotgan dona — yo'qotishga kirmagan */
  inReturn?: number;
  /** Omborga qaytmagan buyurtmalar (nomzodlar, yangisi birinchi) */
  suspects?: BalanceOrderRef[];
  /** Qoldiq buyurtmasiz kamaygan kunlar */
  removals?: { date: string; qty: number }[];
  /** shortage: nakladnoy raqami va yuborilgan dona */
  invoice?: string;
  sent?: number;
}

export interface LossRow {
  id: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  type: 'lost' | 'damaged' | 'not_delivered';
  /** SavdoIQ aniqlagan yozuvda — turi; Uzum/namuna yozuvida null */
  kind: LossKind | null;
  scheme: 'FBO' | 'FBS';
  qty: number;
  amount: number;
  compensated: number;
  status: 'open' | 'claimed' | 'compensated' | 'rejected';
  happenedAt: string;
  evidence: LossEvidence | null;
  note: string | null;
}

export type StockBalanceState =
  /** Hammasi joyida */
  | 'ok'
  /** Hisobda yo'q dona bor */
  | 'loss'
  /** Farq bor, lekin qaytishi kutilayotgan dona bilan tushuntiriladi */
  | 'waiting'
  /** Yaqinda qabul qilingan — Uzum qoldig'i hali o'rnashmagan */
  | 'settling'
  /** Buyurtmalar tarixi to'liq emas — hisoblab bo'lmaydi */
  | 'incomplete';

/** Bitta SKU bo'yicha tovar balansi (butun davr) */
export interface StockBalanceRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  state: StockBalanceState;
  /** Uzum nakladnoylari bo'yicha qabul qilingan */
  accepted: number;
  /** Sotilgan (yo'ldagi buyurtmalar bilan) */
  sold: number;
  /** Uzum sotuvchiga qaytarib bergan (qaytarish nakladnoylari) */
  returnedToSeller: number;
  /** Uzum omborida sotuvda turgan */
  onHand: number;
  /** Uzumda, lekin sotuvda emas: qo'shimcha ombor, fotostudiya, brak */
  held: number;
  /** Bekor qilingan/qaytarilgan, omborga qaytishi kutilmoqda */
  inReturn: number;
  /** Hisobda yo'q */
  unaccounted: number;
  /** Hisobda yo'q donalar uchun kompensatsiya taxmini (Uzum formulasi) */
  amount: number;
  /** Summa qanday hisoblangani; yo'qotish bo'lmasa null */
  comp: CompensationBasis | null;
  /** Kutilayotgan donalar eng kechi shu sanagacha qaytishi kerak (ISO) */
  waitingUntil: string | null;
  suspects: BalanceOrderRef[];
  removals: { date: string; qty: number }[];
}

/** Uzoq vaqt xaridorga topshirilmagan buyurtma */
export interface StuckOrderRow {
  orderId: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  qty: number;
  /** Buyurtma summasi (xaridor narxida) */
  amount: number;
  orderedAt: string;
  days: number;
}

export interface StockBalanceSummary {
  /** Qoldiq qaysi kun holatida (ISO); nakladnoy topilmasa null */
  asOf: string | null;
  totals: {
    skus: number;
    accepted: number;
    sold: number;
    onHand: number;
    inReturn: number;
    unaccounted: number;
    amount: number;
  };
  rows: StockBalanceRow[];
  stuck: StuckOrderRow[];
  /** Qoidalar — sahifadagi izohlar shu raqamlardan */
  rules: {
    /** Bekor bo'lgan payti noma'lum buyurtma: buyurtma kunidan shuncha kun kutiladi */
    returnWaitDays: number;
    /** Bekor qilingan buyurtma tovari omborga shuncha kun ichida qaytadi (bekor qilingan kundan) */
    cancelWaitDays: number;
    stuckDays: number;
    minClaim: number;
  };
}

export interface LossesResponse {
  /** Tovar balansi — butun davr bo'yicha, tanlangan davrga bog'liq emas */
  balance: StockBalanceSummary;
  /**
   * Hali da'vo yuborilmagan yo'qotishlar — filtr va davrdan qat'i nazar.
   * Uzum da'voni `balance.rules.minClaim` dan kam summaga qabul qilmaydi.
   */
  open: { count: number; qty: number; amount: number };
  totals: { skuCount: number; qty: number; amount: number; compensated: number };
  /**
   * Da'vo holati bo'yicha jamilar — BUTUN davr bo'yicha.
   * Ilgari sayt buni jadvalning joriy 25 qatoridan hisoblardi va
   * "Qoplanish darajasi" sahifa almashganda o'zgarib ketardi.
   */
  claims: {
    receivedAmount: number;
    pendingAmount: number;
    rejectedAmount: number;
    receivedCount: number;
    pendingCount: number;
    rejectedCount: number;
  };
  rows: Paginated<LossRow>;
}

/**
 * Xaridor tomonidagi holat:
 *  • `returned` — tovar punktga keldi, xaridor olmadi yoki oldi-yu qaytardi;
 *  • `canceled` — xaridor tovarni olmasdan buyurtmani bekor qildi.
 */
export type ReturnKind = 'returned' | 'canceled';

export interface ReturnRow {
  id: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  orderCode: string | null;
  qty: number;
  amount: number;
  /** Uzum bergan asl sabab matni (ko'pincha ruscha) */
  reason: string | null;
  /** `kind` bilan bir xil — eski mijozlar uchun qoldirilgan */
  status: string;
  kind: ReturnKind;
  returnedAt: string;
}

export interface ReturnsResponse {
  /** Qaysi tur ko'rsatilmoqda */
  kind: ReturnKind | 'all';
  /** Ikkala tur bo'yicha davr jamlari — tanlovdan qat'i nazar */
  counts: Record<ReturnKind, { qty: number; amount: number }>;
  totals: { qty: number; amount: number; rate: number };
  byReason: { reason: string; qty: number; share: number }[];
  /** Kunlik qaytarishlar — BUTUN davr bo'yicha (jadval sahifasiga bog'liq emas) */
  daily: { date: string; qty: number; amount: number }[];
  /** Eng ko'p qaytariladigan tovarlar — butun davr bo'yicha */
  topRisky: {
    key: string;
    sku: string | null;
    title: string | null;
    imageUrl: string | null;
    qty: number;
    amount: number;
    /** Shu tovar jami qaytarishlarning necha foizi */
    share: number;
  }[];
  rows: Paginated<ReturnRow>;
}

export interface StorageRow {
  skuId: string | null;
  sku: string | null;
  title: string | null;
  qty: number;
  volumeL: number;
  amount: number;
  perUnit: number;
  daysStored: number;
  shareOfProfit: number;
}

export interface StorageResponse {
  totals: { amount: number; perDay: number; volumeL: number };
  daily: { date: string; amount: number }[];
  rows: Paginated<StorageRow>;
}

// ─────────────────────────── Yetkazmalar ───────────────────────────

export interface ShipmentItemRow {
  id: string;
  skuId: string;
  sku: string;
  title: string;
  qty: number;
  accepted: number;
  boxes: number;
}

export interface ShipmentRow {
  id: string;
  code: string;
  destination: string | null;
  status: 'draft' | 'planned' | 'in_transit' | 'accepted' | 'canceled';
  plannedAt: string | null;
  acceptedAt: string | null;
  itemsCount: number;
  unitsCount: number;
  costValue: number;
  note: string | null;
  /** manual — saytda yaratilgan; uzum — Uzum nakladnoyidan (faqat o'qiladi) */
  source: 'manual' | 'uzum';
  items?: ShipmentItemRow[];
}

// ─────────────────────────── Sharhlar ───────────────────────────

export interface ReviewRow {
  id: string;
  rating: number;
  text: string | null;
  author: string | null;
  publishedAt: string;
  answered: boolean;
  answerText: string | null;
  autoAnswered: boolean;
  productTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
}

export interface ReviewsResponse {
  /**
   * Sayt sharhga javobni Uzum'ga yubora oladimi. Uzum API javob yozishga
   * ruxsat bermaydi — jonli rejimda `false`, javob Uzum kabinetida yoziladi.
   */
  canReply: boolean;
  totals: { count: number; avgRating: number; answered: number; unanswered: number };
  distribution: { rating: number; count: number }[];
  rows: Paginated<ReviewRow>;
}

// ─────────────────────────── Billing ───────────────────────────

export interface PlanPublic {
  id: PlanId;
  name: string;
  price: number;
  trialDays?: number;
  badge?: 'popular' | 'best';
  tagline: string;
  limits: {
    stores: number;
    cabinets: number;
    members: number;
    historyDays: number;
    syncIntervalMinutes: number;
  };
  features: { id: FeatureId; label: string; access: FeatureAccess }[];
  yearlyDiscount: number;
  current?: boolean;
}

export interface InvoiceRow {
  id: string;
  plan: PlanId;
  months: number;
  amount: number;
  currency: string;
  provider: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled';
  payUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ReferralResponse {
  code: string;
  link: string;
  botLink: string;
  percent: number;
  invited: number;
  activePaying: number;
  earnedTotal: number;
  pending: number;
  paid: number;
  history: {
    id: string;
    company: string;
    amount: number;
    status: string;
    createdAt: string;
  }[];
}

// ─────────────────────────── Bildirishnomalar ───────────────────────────

export interface NotificationRow {
  id: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// ─────────────────────────── Marketing: aksiyalar ───────────────────────────

/** Aksiyadagi bitta SKU — joriy va aksiya narxidagi iqtisod bilan */
export interface PromoSkuRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  /** Sotuvchi shu aksiyaga qo'shilganmi */
  joined: boolean;
  /** Joriy (ro'yxat) narxi */
  price: number;
  /** Uzum taklif qilgan aksiya narxi */
  promoPrice: number;
  /** Chegirma ulushi, % */
  discountPct: number;
  /** Joriy narxda bir donadan sof foyda */
  profitNow: number;
  /** Aksiya narxida bir donadan sof foyda */
  profitPromo: number;
  /** Aksiya narxidagi marja, % */
  marginPromo: number;
  /** Farq: aksiyaga kirsa har donada qancha yo'qotadi/yutadi */
  profitDelta: number;
  /** Oxirgi 30 kunda sotilgan dona — qaror uchun muhim */
  unitsSold: number;
  stock: number;
}

/** Bitta aksiya kampaniyasi */
export interface PromoRow {
  /** Uzumdagi aksiya nomi — guruhlash kaliti */
  name: string;
  /** Aksiyaga mos keladigan SKU soni */
  matched: number;
  /** Shulardan nechtasi qatnashyapti */
  joined: number;
  /** Qatnashmaganlar orasida foydali bo'lganlari */
  profitable: number;
  /** Barcha mos SKU'lar bo'yicha o'rtacha chegirma, % */
  avgDiscountPct: number;
  rows: PromoSkuRow[];
}

export interface PromosResponse {
  promos: PromoRow[];
  totals: {
    promos: number;
    matched: number;
    joined: number;
    /** Qatnashmagan foydali SKU'lardan kutilayotgan qo'shimcha foyda (30 kunlik sotuv tezligida) */
    potentialProfit: number;
  };
}

// ─────────────────────────── SKU holati ───────────────────────────

export type SkuHealthIssue = 'blocked' | 'archived' | 'high_returns' | 'defected' | 'missing' | 'no_cost' | 'ok';

export interface SkuHealthRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  issues: SkuHealthIssue[];
  blocked: boolean;
  blockingReason: string | null;
  archived: boolean;
  /** Uzum hisoblagan qaytarishlar ulushi, % */
  returnedPct: number;
  /** Uzum omborida yaroqsiz (brak) dona */
  qtyDefected: number;
  /** Uzum omborida yo'qolgan dona */
  qtyMissing: number;
  /** Brak va yo'qolganning tannarxdagi qiymati */
  lossValue: number;
  stock: number;
  price: number;
}

export interface SkuHealthResponse {
  totals: {
    skus: number;
    blocked: number;
    archived: number;
    highReturns: number;
    defected: number;
    missing: number;
    /** Brak va yo'qolgan donalarning jami tannarxi */
    lossValue: number;
    /** Muammosiz SKU soni */
    healthy: number;
  };
  rows: Paginated<SkuHealthRow>;
}

// ─────────────────────────── Pul kalendari ───────────────────────────

/**
 * To'lov jadvali — Uzum kabinetidagi "To'lovlar jadvalini sozlash".
 * Har birining o'z xizmat haqi bor: tez-tez to'lansa qimmatroq.
 */
export type PayoutMode = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/**
 * Bir kunda ochiladigan summa — faqat HALI KELADIGAN pul.
 * To'langan va xizmat to'lovlariga ketgan qism kirmaydi, shuning uchun
 * ochilgan kunlar yig'indisi "Yechib olish mumkin" ga teng chiqadi.
 */
export interface PayoutDay {
  /** Yechib olish uchun ochiladigan sana (ISO) */
  date: string;
  amount: number;
  orders: number;
  /** Bugun yoki undan oldinmi — ya'ni allaqachon ochilganmi */
  unlocked: boolean;
}

/**
 * Buyurtma puli qaysi bosqichda:
 * transit — sotilgan, xaridor hali qabul qilmagan (kutish boshlanmagan);
 * waiting — qabul qilingan, kutish muddati sanalyapti;
 * ready — ochilgan, yechib olish mumkin.
 */
export type PayoutOrderState = 'transit' | 'waiting' | 'ready';

/**
 * Puli hali kelmagan bitta buyurtma. Uzum to'liq yechib bergan yoki puli
 * xizmat to'lovlariga ketgan buyurtma ro'yxatdan chiqadi.
 */
export interface PayoutOrder {
  uzumOrderId: string | null;
  title: string;
  state: PayoutOrderState;
  /** Buyurtma berilgan (sotilgan) sana */
  orderedAt: string;
  /** Xaridor tovarni qabul qilgan sana; yo'lda bo'lsa null */
  acceptedAt: string | null;
  /** Yechib olish uchun ochiladigan sana; yo'lda bo'lsa hali noma'lum */
  unlockAt: string | null;
  /** Jadval bo'yicha pul haqiqatda tushadigan sana */
  payoutAt: string | null;
  /** Shu buyurtmadan hali keladigan summa */
  amount: number;
  unlocked: boolean;
  daysLeft: number;
  /** Ochilishgacha qolgan soat (ochilgan bo'lsa 0) */
  hoursLeft: number;
  /** Ochilishning aniq vaqti (ISO) — qabul vaqti + 10 × 24 soat */
  unlockTime: string | null;
}

/** Uzum o'tkazgan bitta to'lov */
export interface PayoutHistoryRow {
  date: string;
  /** Balansdan chiqqan summa (erta yechishda — haqdan keyingi) */
  amount: number;
  /** Erta yechish haqi; jadval to'lovida 0 */
  fee: number;
  /** scheduled — jadval bo'yicha · early — erta yechish · earlier — tarix yuritilishidan oldingi jami */
  kind: 'scheduled' | 'early' | 'earlier';
}

/** Jadval bo'yicha bitta to'lov kuni */
export interface PayoutPlanDay {
  date: string;
  /**
   * Shu sanada o'tkaziladigan summa (jadval haqidan oldin): balansdan
   * yo'ldagi va shu sana 00:00 gacha ochilmaydigan buyurtmalar, hamda oldingi
   * sanalarda beriladigan pul ayirilgani. Xizmat to'lovlari balansda ayirilgan.
   */
  amount: number;
  /** Shu sanaga to'g'ri keladigan buyurtmalar yig'indisi (sotuv − komissiya), ushlanmalarsiz */
  gross: number;
  /** Uzum balansdan ushlab qolgani uchun shu to'lovdan kamaygan summa (xizmat to'lovlari); 0 — yo'q */
  deducted: number;
  orders: number;
  /** Jadval haqi ayirilgandan keyin qo'lga tegadigan summa */
  net: number;
  /**
   * Yo'ldagi (hali qabul qilinmagan) buyurtmalar: `acceptedUntil` gacha qabul
   * qilinsa shu to'lovga qo'shiladi. Faqat qabul muddati hali o'tmagan eng
   * yaqin sanada to'ldiriladi, qolganlarida 0. `amount` ga KIRMAYDI — shartli pul.
   */
  transitOrders: number;
  /**
   * O'sha buyurtmalardan kutilayotgan summa: sotuv − komissiya − yetkazish haqi
   * (kabinetdagi "Yechib olish uchun"). Yetkazish haqini Uzum qabul kuni
   * ushlaydi, shuning uchun u hali balansda ayirilmagan — bu yerda ayiriladi.
   */
  transitAmount: number;
  /**
   * Shu sanagacha (shu kun ham) QABUL QILINGAN buyurtmalar to'lovga kiradi —
   * kabinetdagi "… gacha yig'ilgan jami pul". To'lov 00:00 da o'tadi, shuning
   * uchun bu to'lov kunidan (kutish kunlari + 1) kun oldin.
   */
  acceptedUntil: string;
  /** Shu sanada kuchda bo'lgan jadval — o'zgarish rejalashtirilgan bo'lsa farq qiladi */
  mode: PayoutMode;
  /** Shu sanadagi jadval haqi, % */
  feePct: number;
  /**
   * Shu sanagacha necha kun qolgani — SERVERDA sanaladi.
   *
   * Brauzerda sanalganda UTC yarim tuni mijozning mahalliy vaqti bilan
   * solishtirilib, Toshkentda 00:00–05:00 orasida bir kunga adashardi.
   */
  daysLeft: number;
}

/**
 * Tezkor yechib olish mezoni.
 *
 * `unknown` — biz tekshira olmaymiz (faqat Uzumda ma'lum). Uni "bajarildi"
 * deb ko'rsatish sotuvchini chalg'itardi.
 */
export interface PayoutCheck {
  key: 'no_debt' | 'not_blocked' | 'age_60d' | 'stable_sales' | 'no_anomaly' | 'antifraud';
  status: 'ok' | 'fail' | 'unknown';
  /** Aniq raqam bilan izoh: "62 kun", "18 kun savdo bo'lgan" */
  detail: string;
}

/** `PATCH /payout/rules` tanasi — sotuvchi kabinetdagi jadvalni qayd etadi */
export interface PayoutRulesRequest {
  mode: PayoutMode;
  /** Kelajakdagi o'zgarish — ikkalasi birga yuboriladi yoki ikkalasi ham `null` */
  nextMode?: PayoutMode | null;
  nextFrom?: string | null;
}

export interface PayoutCalendarResponse {
  /** Qoidalar — sozlamalardan olinadi, Uzum shartlari o'zgarsa moslanadi */
  rules: {
    holdDays: number;
    /** Bugun amal qiladigan erta (tezkor) yechib olish haqi, % — bepul davrda 0 */
    earlyFeePct: number;
    /** Erta yechish shu sanagacha bepul (ISO), aks holda null */
    earlyFeeFreeUntil: string | null;
    /** BUGUN kuchda turgan to'lov jadvali */
    mode: PayoutMode;
    /** Shu jadval uchun xizmat haqi, % */
    scheduleFeePct: number;
    /** Oy ichidagi to'lov sanalari (daily rejimda bo'sh) */
    payoutDays: number[];
    /**
     * Kelajakda kuchga kiradigan jadval — Uzum kabinetida jadvalni
     * o'zgartirganda u darhol emas, kelgusi sanadan ishlaydi
     * ("08.10.2026 dan amal qiladi"). O'zgarish yo'q bo'lsa `null`.
     */
    nextMode: PayoutMode | null;
    /** Yangi jadval kuchga kiradigan sana (ISO) */
    nextFrom: string | null;
    /**
     * Sotuvchi jadvalni TASDIQLAGANMI.
     *
     * Uzum ochiq API'da to'lov jadvalini bermaydi, shuning uchun u
     * tasdiqlanmaguncha standart variant olinadi. Tasdiqlanmagan hisob
     * ekranda ochiq aytiladi — jim turgan taxmin sotuvchini chalg'itadi.
     */
    confirmed: boolean;
  };
  totals: {
    /**
     * Hozir yechib olish mumkin: umumiy balans − hali ochilmagan buyurtmalar.
     * Xizmat to'lovlari va yechib olingan pul ayrilgan, 0 dan kam emas.
     */
    unlocked: number;
    /** Hisob boshidan beri sotuvchiga yechib berilgan (Uzum withdrawnProfit) */
    withdrawn: number;
    /** Umumiy balans — Moliya va Boshqaruv paneli bilan bir xil */
    balance: number;
    /** Uzum hozirgacha yechib bergan jami summa (`withdrawn` bilan bir xil) */
    paidOut: number;
    /** Qabul qilingan, lekin 10 kunlik kutish tugamagan buyurtmalar */
    pending: number;
    /** Hali xaridorga yetmagan buyurtmalar: balansda bor, kutish boshlanmagan */
    inTransit: number;
    /** Yo'ldagi buyurtmalar soni */
    transitOrders: number;
    /** Davr ichidagi xizmat to'lovlari (logistika, reklama, saqlash) */
    charges: number;
    /** Eng yaqin ochilish sanasi (ISO) yoki null */
    nextDate: string | null;
    /** Eng yaqin ochilishning aniq vaqti (ISO) yoki null */
    nextAt: string | null;
    nextAmount: number;
  };
  /** Kunlar bo'yicha ochilish jadvali — faqat puli hali kelmagan kunlar */
  days: PayoutDay[];
  /** Jadval bo'yicha KELGUSI to'lov kunlari (kamida uchta) */
  plan: PayoutPlanDay[];
  /** Uzum o'tkazgan to'lovlar — eng yangisi birinchi */
  history: PayoutHistoryRow[];
  /** Puli hali kelmagan buyurtmalar: avval ochilganlar, keyin kutilayotganlar, oxirida yo'ldagilar */
  orders: PayoutOrder[];
  /** Tezkor yechib olish mezonlari */
  instant: {
    /** Barcha tekshirsa bo'ladigan mezonlar bajarildimi (null — noma'lum qolganlari bor) */
    eligible: boolean | null;
    checks: PayoutCheck[];
  };
}
