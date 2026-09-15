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
  /** Taxminiy qolgan vaqt (sekund) — dastlabki to'liq yig'ish ~30 daqiqa */
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
  netProfit: MetricValue;
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
     * Sof foydaga KIRMAGAN davr xarajatlari (omborga logistika, reklama, saqlash, boshqa).
     * Komissiya va mijozga yetkazish Uzumning "yechib olish uchun" summasida
     * allaqachon ayrilgani uchun bu yerga kirmaydi.
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
  title: string;
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
  /** Bekor qilinmagan/qaytarilmagan buyurtmalar soni (filtr qo'llangan) */
  ordersActive: number;
  hourly: HourlyPoint[];
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
  /** Xaridor to'laydigan eng past narx (aksiya bo'lsa — aksiya narxi) */
  minPrice: number;
  /** Chegirmasiz ro'yxat narxi — aksiya faol bo'lsagina `minPrice` dan katta */
  listPrice: number;
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
  skus: ProductCardSku[];
}

export interface ProductsResponse {
  totals: {
    products: number;
    skus: number;
    inStock: number;
    needOrder: number;
    storageCostPerDay: number;
  };
  items: Paginated<ProductCard>;
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
  title: string;
  imageUrl: string | null;
  stock: number;
  avgDaily: number;
  daysLeft: number | null;
  /** tanlangan zaxira davri uchun kerakli miqdor */
  recommendedQty: number;
  purchaseCost: number;
  status: 'critical' | 'ending' | 'enough' | 'no_action';
  stockoutDate: string | null;
  lostRevenue: number;
}

export interface PlannerResponse {
  coverDays: number;
  counts: { all: number; critical: number; ending: number; enough: number; noAction: number };
  totalPurchaseCost: number;
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

// ─────────────────────────── Yo'qotish / qaytarish / saqlash ───────────────────────────

export interface LossRow {
  id: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  type: 'lost' | 'damaged' | 'not_delivered';
  scheme: 'FBO' | 'FBS';
  qty: number;
  amount: number;
  compensated: number;
  status: 'open' | 'claimed' | 'compensated' | 'rejected';
  happenedAt: string;
}

export interface LossesResponse {
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

export interface ReturnRow {
  id: string;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  orderCode: string | null;
  qty: number;
  amount: number;
  reason: string | null;
  status: string;
  returnedAt: string;
}

export interface ReturnsResponse {
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
