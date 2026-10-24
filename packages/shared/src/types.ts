/**
 * API shartnomalari (DTO) — apps/api va apps/web o'rtasida umumiy.
 * Barcha pul qiymatlari UZS (butun so'mda), sanalar ISO-8601 string.
 */

import type { PlanId, FeatureAccess, FeatureId } from './plans.js';
import type { CardAuditResult, CardLang, CardSectionId } from './card-seo.js';

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
  /**
   * Oxirgi MUVAFFAQIYATLI sinxron (kompaniya kabinetlaridan eng yangisi).
   * `finishedAt` xato bilan tugagan jobda ham to'ladi — "ma'lumot qachon
   * yangilandi" degan savolga javob bermaydi (2026-10-22 da Uzum ishlamay
   * qolganda aynan shunday edi: job yiqilgan, ma'lumot esa eski).
   */
  lastSuccessAt: string | null;
  /** Eng yaqin rejali sinxron */
  nextSyncAt: string | null;
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
  /**
   * Oldingi teng davr kunma-kun, `series` bilan o'sha ta'rifda (foyda davr
   * xarajatlaridan keyin). Indeks bo'yicha tekislangan: i-nuqta joriy davrning
   * i-kuniga to'g'ri keladi, `date` — oldingi davrdagi haqiqiy sana. Joriy
   * seriya bugun bilan tugasa ham bu davrning to'liq uzunligida — yig'indisi
   * KPI'lardagi `previous` bilan teng. Oldingi davr saqlangan tarixdan (tarif
   * chuqurligi, birinchi sinxron) tashqarida bo'lsa null: nol chiziq "o'sish"
   * deb o'qilmasin.
   */
  previousSeries?: TimeSeriesPoint[] | null;
  /** `previousSeries` qaysi kunlar (= KPI o'zgarishlari qaysi davrga nisbatan); taqqoslab bo'lmasa null */
  comparePeriod?: Period | null;
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

/**
 * GET /analytics/cost-coverage — tanlangan davrda sotilgan donalarning
 * qanchasida tannarx bor. Foyda faqat shu ulushda ishonchli: tannarxsiz
 * pozitsiyada cogs = 0, ya'ni foyda shu tovarlar tannarxicha ortiq chiqadi.
 *
 * "Sotilgan" — Boshqaruv paneli foydasi bilan bir xil qoida: davr buyurtma
 * sanasi bo'yicha, bekor qilingan va qaytgan pozitsiyalar kirmaydi
 * (`soldUnits` = `DashboardResponse.unitsSold`, `revenue` = `revenue`).
 */
export interface CostCoverageResponse {
  period: Period;
  /** Davrda sotilgan dona */
  soldUnits: number;
  /** Shulardan tannarxsiz sotilgani (pozitsiyadagi tannarx 0) */
  unitsNoCost: number;
  /** Sotuv tushumi, so'm */
  revenue: number;
  /** Tannarxsiz sotilgan donalar tushumi, so'm */
  revenueNoCost: number;
  /** Tannarxsiz sotilgan SKU'lar soni (katalogga bog'lanmagan pozitsiyalar sanalmaydi) */
  skusNoCost: number;
  /**
   * Tannarxi bor donalar ulushi, % — bir xonagacha PASTGA yaxlitlangan:
   * bitta dona tannarxsiz bo'lsa ham 100 chiqmaydi. Sotuv bo'lmasa 100.
   */
  pct: number;
  /**
   * Foyda taxminan shuncha ortiq ko'rinadi, so'm: tannarxi bor sotuvlardagi
   * tannarx/tushum nisbati × tannarxsiz tushum. Taxmin uchun asos bo'lmasa
   * (davrda tannarxi bor sotuv yo'q) — null.
   */
  estMissingCogs: number | null;
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

/**
 * Buyurtma qilingan dona to'rt holatdan biriga tushadi (yig'indisi = ordered):
 * sotildi (xaridor qabul qildi), yo'lda (hali qabul qilmadi), bekor, qaytdi.
 * Ilgari `inTransit` yo'q edi va yo'ldagi dona "sotildi" ga qo'shilardi —
 * sotib olish foizi sun'iy ~90% chiqardi (2026-10-24).
 */
export type FunnelStepId = 'ordered' | 'sold' | 'inTransit' | 'canceled' | 'returned';

export interface FunnelStep {
  id: FunnelStepId;
  /** Dona */
  value: number;
  /** So'm */
  amount: number;
  /**
   * Oldingi teng davr — TENG YOSHDA: sotildi/yo'lda bo'linishi o'sha davr
   * hozirgi davr yoshida bo'lgan paytdagi holat (hozir − davr uzunligi).
   * Ilgari yakuniy holat olinardi va "Sotildi" o'zgarishi sun'iy tushardi
   * (2026-10-24). Bekor/qaytgan esa yakuniy holat bo'yicha.
   */
  prevValue: number;
  prevAmount: number;
  /** Oldingi davrga nisbatan o'zgarish, % */
  deltaPct: number | null;
  /** Buyurtma qilingan donalardagi ulushi, % */
  conversion: number | null;
}

export interface FunnelProductRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  /** Buyurtma qilingan DONA (buyurtmalar soni emas) */
  ordered: number;
  orderedAmount: number;
  /** Xaridor qabul qilgan dona (buyurtmada `deliveredAt` bor) */
  sold: number;
  soldAmount: number;
  /** Hali yo'ldagi dona — sotilgan ham, yo'qotilgan ham emas */
  inTransit: number;
  canceled: number;
  returned: number;
  /** Yakunlangan dona: sotildi + bekor + qaytdi (yo'ldagilar kirmaydi) */
  completed: number;
  /**
   * Sotib olish foizi: sotildi / yakunlangan. Yakunlangani bo'lmasa `null`
   * ("—"): hammasi yo'lda bo'lgan tovar "0% sotib olindi" emas.
   */
  buyoutRate: number | null;
  /** Bitta dona uchun o'rtacha narx */
  avgPrice: number;
  /** Sotilgan summadagi ulushi, % */
  share: number;
  /** Oldingi teng davrga nisbatan, % — teng yoshda (`FunnelStep.prevValue` dagi kabi) */
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
    /**
     * Buyurtmalar soni (alohida `orderId`). Qolgan sanoqlar DONA: ilgari
     * "Buyurtma qilindi" yorlig'i ostida dona ko'rsatilardi (2026-10-24).
     */
    orders: number;
    /** Buyurtmalar sonining oldingi teng davrga nisbatan o'zgarishi, % */
    ordersDeltaPct: number | null;
    ordered: number;
    orderedAmount: number;
    sold: number;
    soldAmount: number;
    inTransit: number;
    inTransitAmount: number;
    canceled: number;
    returned: number;
    canceledAmount: number;
    /** Qaytgan dona summasi: sotuv narxi × qaytgan dona (ilgari doim 0 edi) */
    returnedAmount: number;
    /** Yakunlangan dona: sotildi + bekor + qaytdi */
    completed: number;
    /** Sotib olish foizi: sotildi / yakunlangan; yakunlangani bo'lmasa `null` */
    buyoutRate: number | null;
    avgPrice: number;
  };
  /** Kunlik DONA; sold + inTransit + canceled + returned = ordered */
  daily: { date: string; ordered: number; sold: number; inTransit: number; canceled: number; returned: number }[];
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
    /**
     * Holatlar soni — qidiruvga mos barcha SKU bo'yicha, holat filtridan
     * oldin. Filtr tanlanganda ham o'zgarmaydi (tasma va tugmalar shundan).
     */
    statusCounts: Record<SalesStockRow['status'], number>;
    /**
     * Ro'yxatdagi (qidiruv va holat filtridan keyin, BARCHA sahifalar) eng
     * katta SKU tushumi — tushum chizig'ining miqyosi. Ilgari mijoz uni joriy
     * 50 qatordan olardi: har sahifaning birinchi qatori to'liq chiziq olardi
     * (2026-10-24).
     */
    maxRevenue: number;
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
  /**
   * Xarid foizi, %: xaridor qabul qilgan dona ÷ (qabul qilingan + bekor + qaytgan).
   * Faqat davrdagi YAKUNLANGAN pozitsiyalar — yo'ldagilar kirmaydi. Yakunlangani
   * bo'lmasa `null` ("—"), 0% emas.
   *
   * Ilgari bu o'rinda `conversion` turardi — bozor o'rtachasi (2,5%) va
   * reytingdan to'qilgan "konversiya". Seller API ko'rishlarni bermaydi, demak
   * u raqam haqiqiy emas edi (2026-10-24).
   */
  buyoutRate: number | null;
  /** Xaridor qabul qilgan dona (Order.deliveredAt bor, bekor/qaytmagan) */
  buyoutUnits: number;
  /** Xarid foizi asosi — yakunlangan dona: qabul qilingan + bekor + qaytgan */
  completedUnits: number;
  /** Hali yo'ldagi dona (xaridor qabul qilmagan) — xarid foiziga kirmaydi */
  transitUnits: number;
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
  /** Kutilayotgan tushum: qoldiq hammasi joriy narxda sotilsa, Uzum komissiyasi va logistikasidan keyin */
  payoutValue: number;
  /** Bir donadan tushum */
  payoutPerUnit: number;
  /** Komissiya va logistika shu SKU sotuvidan ('sales') yoki taxmin ('estimate') */
  payoutSource: 'sales' | 'estimate';
  /** Kutilayotgan foyda: tushum − tannarx − soliq; tannarx kiritilmagan bo'lsa null */
  profitValue: number | null;
  avgDaily: number;
  daysLeft: number | null;
  status: 'critical' | 'low' | 'ok' | 'excess' | 'dead';
}

export interface StocksResponse {
  totals: {
    units: number;
    costValue: number;
    retailValue: number;
    skuCount: number;
    /** Kutilayotgan tushum (jami) */
    payoutValue: number;
    /** Kutilayotgan foyda — faqat tannarxi kiritilgan SKU'lar bo'yicha */
    profitValue: number;
    /** Qoldig'i bor, tannarxi kiritilmagan dona — foydaga kirmagan */
    unitsNoCost: number;
  };
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
  /**
   * Oldingi teng davr kunma-kun, `daily` bilan o'sha ta'rifda va indeks bo'yicha
   * tekislangan (DashboardResponse.previousSeries kabi). Tarix yetmasa null.
   */
  previousDaily?: { date: string; revenue: number; expenses: number; profit: number }[] | null;
  /** `previousDaily` qaysi kunlar; taqqoslab bo'lmasa null */
  comparePeriod?: Period | null;
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
  /** Kargo reys raqami; bo'sh — ko'rsatilmagan. Har reys alohida jo'natma */
  trip: string;
  weightKg: number;
  /** Kargo haqi, so'm */
  cargoCost: number;
}

/**
 * Qo'shimcha xarajat turi. Yo'l kira — tovarni olib kelish puli, partiyalar
 * umumiy summasiga kiradi. Boshqalari (logistika, paket...) — kirmaydi.
 * Ikkalasi ham tovar tannarxiga kg bo'yicha bo'linadi.
 */
export type BatchExtraKind = 'road' | 'other';

/** Qo'shimcha xarajatning bitta qatori */
export interface BatchExtraInput {
  /** Izoh: nima uchun to'langan (bojxona, yo'l haqi...) */
  name: string;
  /** so'm */
  amount: number;
  kind?: BatchExtraKind;
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

/** Jo'natma holati: Xitoydagi omborda → yo'lda → keldi */
export type ShipmentStatus = 'warehouse' | 'shipped' | 'arrived';

/**
 * Partiyadagi bitta jo'natma — bitta kargo va bitta yetkazish turi bilan
 * ketgan tovarlar (masalan "MANDARIN · avia" va "TEZ-TEZ · avto" — ikki jo'natma).
 */
export interface BatchShipment {
  /** Qatorlardagi yozilishi (birinchi uchragani); bo'sh — kargo ko'rsatilmagan */
  cargoName: string;
  delivery: BatchDelivery;
  /** Reys raqami (qatorlardagi yozilishi); bo'sh — ko'rsatilmagan */
  trip: string;
  /** Shu jo'natmadagi qatorlar soni */
  items: number;
  qty: number;
  status: ShipmentStatus;
  /** YYYY-MM-DD */
  shippedAt: string | null;
  arrivedAt: string | null;
  /** Keldi — yo'lda o'tgan kunlar; yo'lda — jo'natilgandan beri o'tgan kunlar */
  days: number | null;
  /** Yo'lda bo'lsa: taxminiy kelish kuni (YYYY-MM-DD) */
  expectedAt: string | null;
  /**
   * Taxmin nimaga asoslangan: `cargo` — shu kargo va turining o'zi olib kelgan
   * jo'natmalar; `mode` — bu kargo bo'yicha hali ma'lumot yo'q, shu turdagi
   * (avia yoki avto) barcha kargolar o'rtachasi. Taxmin bo'lmasa null.
   */
  expectedBasis: 'cargo' | 'mode' | null;
  /** Taxminiy kelishgacha qolgan kun (bugun — savdo kuni); manfiy — kechikmoqda */
  daysLeft: number | null;
}

export interface BatchSummary {
  id: string;
  name: string;
  rate: number;
  extra: number;
  totals: BatchTotals;
  createdAt: string;
  updatedAt: string;
  /**
   * Qolgan tovar qayerda: biror jo'natma yo'lda bo'lsa — yo'lda, aks holda
   * biror jo'natma omborda bo'lsa — omborda, hammasi kelgan bo'lsa — keldi.
   */
  status: ShipmentStatus;
  shipments: BatchShipment[];
  /** Qo'shimcha xarajatlardan yo'l kira yig'indisi — ro'yxatdagi "Umumiy" shu bilan */
  roadExtra: number;
}

/** Kargo kompaniyasi va yetkazish turi bo'yicha haqiqiy muddat */
export interface CargoStat {
  cargoName: string;
  delivery: BatchDelivery;
  /**
   * Ikkala sanasi kiritilgan, kelgan jo'natmalar soni. Bitta reys bir necha
   * partiyaning tovarini olib kelgan bo'lsa ham — bitta (o'rtacha ikki marta sanalmaydi)
   */
  arrived: number;
  avgDays: number | null;
  minDays: number | null;
  maxDays: number | null;
  /** Hozir yo'lda */
  inTransit: number;
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
  /**
   * Barcha partiyalar bo'yicha jami. `total` = tovar + cargo + yo'l kira;
   * logistika, paket kabi boshqa xarajatlar (`otherExtra`) unga kirmaydi.
   */
  grand: {
    qty: number;
    priceCny: number;
    goodsUzs: number;
    cargoUzs: number;
    extra: number;
    roadExtra: number;
    otherExtra: number;
    total: number;
  };
  cargoStats: CargoStat[];
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
  /** Taxminiy qaytish sanasi (Uzum aniq sanani bermaydi); bo'lmasa buyurtma kuni */
  returnedAt: string;
  /** Buyurtma kuni, YYYY-MM-DD — davr va jadval tartibi shu bo'yicha */
  orderedAt: string;
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
  /**
   * 10 kunlik muddat o'tgan, lekin Uzum pulni hali ochmagan (buyurtma hali
   * PROCESSING). Bunday pul eng yaqin to'lovga kirmaydi — keyingisiga o'tadi.
   */
  overdue?: boolean;
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

// ─────────────────────────── Admin: kompaniya ichi ───────────────────────────

/** GET /admin/companies/:id — kompaniya nimadan iborat (faqat o'qish) */
export interface AdminCompanyDetail {
  id: string;
  name: string;
  createdAt: string;
  onboarded: boolean;
  /** Seed yaratgan namunaviy kompaniya (haqiqiy mijoz emas) */
  demo: boolean;
  plan: PlanId;
  planActive: boolean;
  expiresAt: string | null;
  members: { id: string; name: string; username: string | null; telegramId: string; role: string }[];
  /** Uzum kabinetlari — kalitning o'zi qaytarilmaydi */
  cabinets: { id: string; label: string; status: string; lastSyncAt: string | null; lastError: string | null }[];
  stores: {
    id: string;
    title: string;
    uzumShopId: string | null;
    status: string;
    products: number;
    skus: number;
    orders: number;
    lastOrderAt: string | null;
  }[];
  totals: {
    products: number;
    /** Arxivda bo'lmagan SKU'lar */
    skus: number;
    /** Tannarxi kiritilgan (arxivda bo'lmagan) SKU'lar */
    withCost: number;
    stockUnits: number;
    /** Qoldiq × (tannarx + qo'shimcha xarajat) — tannarxi bor SKU'lar bo'yicha */
    stockCost: number;
    /** Qoldiq × joriy narx */
    stockRetail: number;
    /** Kutilayotgan tushum: hammasi joriy narxda sotilsa Uzum komissiya va logistikadan keyin to'laydigan summa */
    stockPayout: number;
    /** Kutilayotgan foyda: tushum − tannarx − soliq (faqat tannarxi kiritilganlar) */
    stockProfit: number;
    /** Qoldig'i bor, tannarxi kiritilmagan — foydaga kirmagan */
    stockUnitsNoCost: number;
    stockSkusNoCost: number;
  };
}

/** GET /admin/companies/:id/products — bitta SKU qatori */
export interface AdminCompanySkuRow {
  id: string;
  productId: string;
  title: string;
  /** Variant nomi (rang, o'lcham) — mahsulot nomi bilan bir xil bo'lsa null */
  variant: string | null;
  sku: string;
  imageUrl: string | null;
  storeTitle: string;
  price: number;
  oldPrice: number;
  purchasePrice: number;
  extraCost: number;
  stock: number;
  /** Qoldiq × (tannarx + qo'shimcha); tannarx kiritilmagan bo'lsa 0 */
  stockCost: number;
  /** Bir donadan tushum: narx − Uzum komissiyasi − logistika */
  payoutPerUnit: number;
  /** Qoldiq × bir donadan tushum */
  stockPayout: number;
  /** Komissiya va logistika shu SKU'ning sotuvidan ('sales') yoki taxmin ('estimate') */
  payoutSource: 'sales' | 'estimate';
  archived: boolean;
  /** Uzum Market'dagi sahifa (tovar Uzum ID'si bo'lmasa null) */
  uzumUrl: string | null;
}

// ─────────────────────────── Kartochka SEO (/cards) ───────────────────────────

/** Kartochka matni qayerdan: Seller API (faqat nom), sotuvchi joylagan yoki qo'llangan qoralama */
export type CardContentSource = 'seller_api' | 'manual' | 'draft';

export interface CardContentDto {
  lang: CardLang;
  title: string;
  descriptionHtml: string;
  source: CardContentSource;
  /** Seller API'dan kelgan (saqlanmagan) nomda null */
  updatedAt: string | null;
}

export interface CardKeywordDto {
  id: string;
  text: string;
  /** Faqat sotuvchi import qilgan talab (ko'rishlar); taxmin emas */
  demand: number | null;
  source: 'seller' | 'auto' | 'import';
  status: 'active' | 'excluded';
}

export interface CardDraftDto {
  id: string;
  lang: CardLang;
  title: string;
  descriptionHtml: string;
  usp: string[];
  /** ai_chat — bepul chatbot javobidan; manual — sotuvchi o'zi yozgan */
  source: 'ai_chat' | 'manual';
  /** applied — sotuvchi Uzum kabinetiga qo'ydim deb belgilagan */
  status: 'draft' | 'applied';
  scoreBefore: number | null;
  scoreAfter: number | null;
  createdAt: string;
  appliedAt: string | null;
}

/** Ballni qayta hisoblash uchun matndan tashqari ma'lumotlar (sayt jonli hisoblaydi) */
export interface CardAuditContext {
  category: string | null;
  reviews: { count: number; rating: number; answered: number | null } | null;
  health: { blocked: boolean; returnedPct: number | null; hasImage: boolean } | null;
}

export interface CardListRow {
  productId: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  storeTitle: string;
  uzumUrl: string | null;
  score: number;
  /** Bo'lim bo'yicha foiz (0..100); ma'lumot yo'q bo'lsa null */
  sections: Record<CardSectionId, number | null>;
  /** Oxirgi 30 kun (Toshkent kuni) */
  revenue30: number;
  profit30: number;
  units30: number;
  stock: number;
  /** Ustuvorlik: 30 kunlik tushum × ballgacha yetmagan ulush × omborda borligi */
  opportunity: number;
  titleLangs: CardLang[];
  descriptionLangs: CardLang[];
  keywordsCount: number;
  draftStatus: 'none' | 'draft' | 'applied';
  appliedAt: string | null;
}

export interface CardListResponse extends Paginated<CardListRow> {
  totals: {
    cards: number;
    avgScore: number;
    /** Ball 60 dan past */
    lowScore: number;
    withDescription: number;
    applied: number;
  };
}

export interface CardReviewInsights {
  count: number;
  rating: number;
  answered: number;
  /** [1★, 2★, 3★, 4★, 5★] */
  distribution: number[];
  /** Sharhlardagi "Afzalliklari:" qismlari */
  pros: string[];
  /** Sharhlardagi "Kamchiliklari:" qismlari va past baholi sharhlar */
  cons: string[];
  recent: { rating: number; text: string; date: string }[];
}

export interface CardImpact {
  appliedAt: string;
  /** Qo'llashdan oldingi va keyingi teng kunlar (ko'pi bilan 14) */
  days: number;
  before: { revenue: number; units: number; orders: number };
  after: { revenue: number; units: number; orders: number };
}

export interface CardDetailResponse {
  product: {
    id: string;
    title: string;
    imageUrl: string | null;
    category: string | null;
    brand: string | null;
    storeTitle: string;
    uzumProductId: string | null;
    uzumUrl: string | null;
    blocked: boolean;
    returnedPct: number;
    /** Variant nomlari — AI so'roviga fakt sifatida beriladi */
    skuTitles: string[];
  };
  contents: CardContentDto[];
  keywords: CardKeywordDto[];
  drafts: CardDraftDto[];
  reviews: CardReviewInsights;
  sales: { revenue30: number; profit30: number; units30: number; stock: number };
  auditContext: CardAuditContext;
  /** Server hisoblagan joriy ball (sayt matn o'zgarganda o'zi qayta hisoblaydi) */
  audit: CardAuditResult;
  impact: CardImpact | null;
}

// ─────────────────────────── Oylik maqsadlar (Boshqaruv paneli) ───────────────────────────

/**
 * Oy natijasi — Boshqaruv panelidagi raqamlar bilan AYNAN bir xil ta'rif:
 * sof foyda davr xarajatlaridan keyin, marja = sof foyda ÷ tushum, dona —
 * bekor qilinmagan va qaytmagan sotuv (panelning `unitsSold`i).
 */
export interface GoalMetrics {
  revenue: number;
  netProfit: number;
  units: number;
  /** Foizda, 2 xona (18.42) */
  marginPct: number;
}

/** Maqsad yoki taklif; `null` — bu ko'rsatkich kuzatilmaydi */
export interface GoalTargets {
  revenue: number | null;
  netProfit: number | null;
  units: number | null;
  marginPct: number | null;
}

/** GET /dashboard/goals */
export interface GoalsResponse {
  /** 'YYYY-MM' — Toshkent kalendari bo'yicha joriy oy */
  month: string;
  /** Oyning nechanchi kuni (sarlavhadagi "24-kun / 31") */
  dayOfMonth: number;
  daysInMonth: number;
  /**
   * Oy boshidan o'tgan vaqt KASR kunlarda (24-kuni soat 10:00 da 23.42; kamida 1).
   * Sur'at belgisi, prognoz va "kuniga kerak" shu bilan hisoblanadi.
   */
  elapsedDays: number;
  currency: string;
  actual: GoalMetrics;
  /** Saqlangan maqsad (CompanySetting 'goals:YYYY-MM'); saqlanmagan bo'lsa null */
  target: GoalTargets | null;
  /**
   * O'tgan oy × 1,1 (marja — o'tgan oyniki, chegara sifatida). O'tgan oyda
   * sotuv bo'lmasa null; o'tgan oy zarar bo'lsa sof foyda va marja taklifi null.
   */
  suggested: GoalTargets | null;
  lastMonth: GoalMetrics | null;
  /**
   * Oy oxiri prognozi. Tushum va dona — o'tgan kunlar sur'ati bo'yicha chiziqli;
   * sof foyda — tovarlar foydasi sur'ati minus kutilayotgan davr xarajatlari.
   */
  forecast: { revenue: number; netProfit: number; units: number };
  /**
   * Qolgan kunlarda kuniga qancha kerak (maqsadga yetilgan bo'lsa 0; oxirgi
   * kuni — butun qoldiq). Maqsad saqlanmagan bo'lsa null, saqlanmagan
   * ko'rsatkich uchun ham null. Sof foydada hali tushmagan kutilgan davr
   * xarajati ham hisobga olingan.
   */
  needPerDay: { revenue: number | null; netProfit: number | null; units: number | null } | null;
  /** 'company' — do'kon filtri tanlangan bo'lsa ham hisob barcha do'konlar bo'yicha */
  scope: 'company' | 'store';
}

/** PUT /dashboard/goals — berilmagan yoki null kalit shu maqsadni olib tashlaydi */
export interface GoalsUpdateRequest {
  month: string;
  revenue?: number | null;
  netProfit?: number | null;
  units?: number | null;
  marginPct?: number | null;
}

/** PUT /dashboard/goals javobi; hamma maqsad olib tashlansa target null */
export interface GoalsUpdateResponse {
  month: string;
  target: GoalTargets | null;
}

// ─────────────────────────── Bugun nima qilish kerak (Boshqaruv paneli) ───────────────────────────

/**
 * Vazifa turi — har biri bitta tekshiruv (apps/api routes/today.ts):
 *  loss    — da'vo yuborilmagan yo'qotish (Uzum qoplashi kerak bo'lgan pul);
 *  review  — javobsiz salbiy (≤ 3★) sharh, oxirgi 30 kun;
 *  cost    — 30 kunda sotilgan, lekin tannarxi kiritilmagan SKU;
 *  fbs     — sotuvchi yig'ishi kerak bo'lgan yangi FBS/DBS buyurtma;
 *  stock   — bugun buyurtma berilsa ham tovar kelguncha tugaydigan qoldiq;
 *  storage — pullik saqlash haftadan haftaga o'sdi.
 */
export type TodayTaskKind = 'loss' | 'review' | 'cost' | 'fbs' | 'stock' | 'storage';
export type TodayTaskLevel = 'danger' | 'warn' | 'info';

export interface TodayTask {
  /**
   * Qator kaliti: bitta obyekt — "loss:<id>", "review:<id>", "cost:<skuId>",
   * "fbs:<orderId>", "stock:<skuId>", "storage:<YYYY-Www>"; bir turdagi bir
   * nechta obyekt bitta qatorga yig'ilganda — "<kind>:*".
   */
  key: string;
  kind: TodayTaskKind;
  level: TodayTaskLevel;
  /** O'zbekcha matn (sayt uch tilda `kind` + `params` dan o'zi yasaydi) */
  title: string;
  body: string;
  /** Xavf ostidagi pul, so'm. Halol raqam bo'lmasa (sharh) — null, hech qachon taxmin qilinmaydi */
  amount: number | null;
  link: string;
  cta: string;
  /** Tarifda bu bo'lim faqat ko'rish uchun ochiq ('preview') yoki yopiq */
  locked?: boolean;
  /** Qatordagi obyektlar soni (bitta obyekt — 1) */
  count: number;
  /** "Bajarildi" / "Keyinroq" shu obyekt kalitlariga yoziladi (guruhda — har biriga) */
  keys: string[];
  /** Matnni tilga moslash uchun xom qiymatlar (son, ISO sana, SKU kodi) */
  params: Record<string, string | number>;
}

/** Ishga tushgan va hech narsa topmagan tekshiruv — "Hammasi nazoratda" ro'yxati uchun */
export interface TodayCheck {
  kind: TodayTaskKind;
  label: string;
}

/** GET /dashboard/today — davr tanlagichiga bog'liq emas, "bugun" — Toshkent savdo kuni */
export interface TodayResponse {
  /** Toshkent savdo kuni, YYYY-MM-DD */
  date: string;
  items: TodayTask[];
  cleared: TodayCheck[];
  /**
   * Uzum bugun jadval bo'yicha o'tkazgan to'lov — sinxron uni allaqachon qayd
   * etgan bo'lsa (PayoutRecord). Bugun to'lov kuni bo'lmasa yoki hali qayd
   * etilmagan bo'lsa null. Vazifa emas, faqat kontekst.
   */
  payoutToday: number | null;
  /** Foydalanuvchi "Bajarildi" yoki "Keyinroq" deb yashirgan obyektlar soni */
  hidden: number;
}

export type TodayAction = 'done' | 'snooze' | 'reset';

/** PATCH /dashboard/today/:key — `keys` berilsa amal har biriga (guruh qatori) */
export interface TodayActionRequest {
  action: TodayAction;
  keys?: string[];
}

export interface TodayActionResponse {
  action: TodayAction;
  keys: string[];
  /** 'snooze' — qachongacha yashiriladi (keyingi Toshkent kunining boshi, ISO) */
  snoozeUntil: string | null;
}

// ─────────────────────────── Qaytarish va bekor qilish (Boshqaruv paneli) ───────────────────────────

/**
 * Davr bo'yicha qaytarish va bekor qilish xulosasi — YAGONA ta'rif
 * (apps/api services/returns.ts `summarizeReturns`). Boshqaruv panelidagi
 * karta, "Qaytarishlar" sahifasi jamlari va Sotuv voronkasidagi qaytgan /
 * bekor qilingan dona va summa shu bilan bir xil chiqadi:
 *  • davr — BUYURTMA sanasi bo'yicha (Uzum qaytarish sanasini bermaydi);
 *  • qaytarish ulushi = qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona);
 *  • bekor qilish ulushi = bekor qilingan dona ÷ buyurtma qilingan barcha dona;
 *  • summa — sotuv narxi × dona, so'm.
 */
export interface ReturnsSummary {
  /** Xaridor qabul qilgan dona — qaytarish ulushining asosi (yo'ldagilar kirmaydi) */
  soldUnits: number;
  /** Davrda buyurtma qilingan barcha dona: sotilgan + yo'lda + bekor + qaytgan */
  orderedUnits: number;
  /** Qaytgan dona (qisman qaytishlar bilan), summa va ulush (%, 2 xona) */
  returned: { qty: number; amount: number; rate: number };
  /** Bekor qilingan dona, summa va ulush (%, 2 xona) */
  canceled: { qty: number; amount: number; rate: number };
  /**
   * Qaytarishlar orasida eng ko'p uchragan HAQIQIY sabab — Uzum bergan asl
   * matn (sayt uni "Qaytarishlar" sahifasidagi qoidalar bilan tarjima qiladi).
   * Sababsizlar (bo'sh matn, "Клиент не указал причину") hisobga olinmaydi;
   * haqiqiy sabab umuman bo'lmasa null. `share` — barcha qaytgan donadan, %.
   */
  topReason: { raw: string; qty: number; share: number } | null;
  /** Eng ko'p qaytgan SKU (katalogdagi); `rate` — shu SKU ning o'z qaytarish ulushi, % */
  topSku: {
    skuId: string;
    productId: string;
    sku: string;
    title: string;
    /** Mahsulot nomi — SKU nomi faqat variant ("ЧЕРН") bo'lsa, qaysi tovar ekani shundan */
    productTitle: string;
    imageUrl: string | null;
    qty: number;
    amount: number;
    rate: number;
  } | null;
}

/** GET /dashboard/returns — tanlangan davr va oldingi teng davr */
export interface DashboardReturnsResponse {
  period: Period;
  previousPeriod: Period;
  current: ReturnsSummary;
  /** Oldingi davrda buyurtma bo'lmasa null */
  previous: ReturnsSummary | null;
  /**
   * Ulush o'zgarishi FOIZ PUNKTIDA (joriy − oldingi, 1 xona). Oldingi davr
   * bo'lmasa null; ulushlardan birining asosi 0 bo'lsa o'sha kalit null.
   */
  deltaPp: { returned: number | null; canceled: number | null } | null;
}
