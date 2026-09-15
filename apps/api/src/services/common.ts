/**
 * Umumiy ma'lumot yig'ish yordamchilari.
 * BU FAYLNI O'ZGARTIRMANG — barcha route modullari shunga tayanadi.
 */
import { prisma } from '@savdoiq/db';
import { STOCK_THRESHOLDS, addDays, toISODate, type ExpenseCategory, type Period } from '@savdoiq/shared';

export interface SkuInfo {
  id: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  price: number;
  purchasePrice: number;
  extraCost: number;
  volumeL: number;
  weightGr: number;
  productId: string;
  productTitle: string;
  category: string | null;
  storeId: string;
  storeTitle: string;
  archived: boolean;
  /** Katalogga qo'shilgan sana — yangi tovarni "nolikvid" deb belgilamaslik uchun */
  createdAt: Date;
}

export interface StockInfo {
  fbo: number;
  fbs: number;
  own: number;
  reserved: number;
  inTransit: number;
  total: number;
  date: Date | null;
}

export interface SalesAgg {
  skuId: string;
  units: number;
  revenue: number;
  payout: number;
  cogs: number;
  commission: number;
  logistics: number;
  otherCost: number;
  netProfit: number;
  orders: number;
  returns: number;
  lastSaleAt: Date | null;
  /** Davrdagi birinchi sotuv — yangi tovarlarda o'rtachani to'g'ri hisoblash uchun */
  firstSaleAt: Date | null;
}

/** Kompaniyaning do'kon id'lari (storeId filtri bilan) */
export async function getStoreIds(companyId: string, storeId?: string): Promise<string[]> {
  const stores = await prisma.store.findMany({
    where: { companyId, ...(storeId ? { id: storeId } : {}) },
    select: { id: true },
  });
  return stores.map((s) => s.id);
}

export async function getStoreTitles(companyId: string): Promise<Map<string, string>> {
  const stores = await prisma.store.findMany({ where: { companyId }, select: { id: true, title: true } });
  return new Map(stores.map((s) => [s.id, s.title]));
}

/** SKU katalogi (mahsulot va do'kon ma'lumotlari bilan) */
export async function getSkuCatalog(storeIds: string[], includeArchived = false): Promise<Map<string, SkuInfo>> {
  if (storeIds.length === 0) return new Map();
  const skus = await prisma.sku.findMany({
    where: { storeId: { in: storeIds }, ...(includeArchived ? {} : { archived: false }) },
    include: {
      product: { select: { id: true, title: true, category: true, imageUrl: true } },
      store: { select: { id: true, title: true } },
    },
  });
  return new Map(
    skus.map((s) => [
      s.id,
      {
        id: s.id,
        sku: s.sku,
        title: s.title || s.product.title,
        imageUrl: s.imageUrl ?? s.product.imageUrl ?? null,
        price: s.price,
        purchasePrice: s.purchasePrice,
        extraCost: s.extraCost,
        volumeL: s.volumeL,
        weightGr: s.weightGr,
        productId: s.productId,
        productTitle: s.product.title,
        category: s.product.category,
        storeId: s.storeId,
        storeTitle: s.store.title,
        archived: s.archived,
        createdAt: s.createdAt,
      } satisfies SkuInfo,
    ]),
  );
}

/** Har bir SKU uchun eng so'nggi qoldiq */
export async function getLatestStocks(storeIds: string[]): Promise<Map<string, StockInfo>> {
  const out = new Map<string, StockInfo>();
  if (storeIds.length === 0) return out;

  // So'nggi 3 kunlik snapshot'lardan eng yangisini olamiz
  const since = addDays(new Date(), -7);
  const rows = await prisma.stockSnapshot.findMany({
    where: { storeId: { in: storeIds }, date: { gte: since } },
    orderBy: { date: 'desc' },
  });

  for (const r of rows) {
    if (out.has(r.skuId)) continue;
    out.set(r.skuId, {
      fbo: r.fbo,
      fbs: r.fbs,
      own: r.own,
      reserved: r.reserved,
      inTransit: r.inTransit,
      total: r.fbo + r.fbs + r.own,
      date: r.date,
    });
  }

  // Snapshot topilmagan SKU'lar uchun eng oxirgi mavjud yozuv
  const known = new Set(out.keys());
  const missing = await prisma.sku.findMany({
    where: { storeId: { in: storeIds }, id: { notIn: [...known] } },
    select: { id: true },
  });
  if (missing.length) {
    const older = await prisma.stockSnapshot.findMany({
      where: { skuId: { in: missing.map((m) => m.id) } },
      orderBy: { date: 'desc' },
      take: 5000,
    });
    for (const r of older) {
      if (out.has(r.skuId)) continue;
      out.set(r.skuId, {
        fbo: r.fbo,
        fbs: r.fbs,
        own: r.own,
        reserved: r.reserved,
        inTransit: r.inTransit,
        total: r.fbo + r.fbs + r.own,
        date: r.date,
      });
    }
    for (const m of missing) {
      if (!out.has(m.id))
        out.set(m.id, { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null });
    }
  }

  return out;
}

/** Davr bo'yicha SKU kesimidagi sotuvlar */
export async function aggregateSales(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
): Promise<Map<string, SalesAgg>> {
  const out = new Map<string, SalesAgg>();
  if (storeIds.length === 0) return out;

  const items = await prisma.orderItem.findMany({
    where: {
      orderedAt: { gte: from, lt: toExclusive },
      order: { storeId: { in: storeIds } },
    },
    select: {
      skuId: true,
      qty: true,
      revenue: true,
      payout: true,
      purchasePrice: true,
      commission: true,
      logistics: true,
      otherCost: true,
      netProfit: true,
      status: true,
      orderId: true,
      orderedAt: true,
      returnedAt: true,
    },
  });

  const ordersBySku = new Map<string, Set<string>>();

  for (const it of items) {
    if (!it.skuId) continue;
    const cur =
      out.get(it.skuId) ??
      ({
        skuId: it.skuId,
        units: 0,
        revenue: 0,
        payout: 0,
        cogs: 0,
        commission: 0,
        logistics: 0,
        otherCost: 0,
        netProfit: 0,
        orders: 0,
        returns: 0,
        lastSaleAt: null,
        firstSaleAt: null,
      } satisfies SalesAgg);

    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned) {
      cur.returns += it.qty;
    } else if (it.status !== 'canceled') {
      cur.units += it.qty;
      cur.revenue += it.revenue;
      cur.payout += it.payout;
      cur.cogs += it.purchasePrice * it.qty;
      cur.commission += it.commission;
      cur.logistics += it.logistics;
      cur.otherCost += it.otherCost;
      cur.netProfit += it.netProfit;
      if (!cur.lastSaleAt || it.orderedAt > cur.lastSaleAt) cur.lastSaleAt = it.orderedAt;
      if (!cur.firstSaleAt || it.orderedAt < cur.firstSaleAt) cur.firstSaleAt = it.orderedAt;
    }

    const set = ordersBySku.get(it.skuId) ?? new Set<string>();
    set.add(it.orderId);
    ordersBySku.set(it.skuId, set);

    out.set(it.skuId, cur);
  }

  for (const [skuId, set] of ordersBySku) {
    const agg = out.get(skuId);
    if (agg) agg.orders = set.size;
  }

  return out;
}

/** Yangi tovarda o'rtachani haddan tashqari oshirib yubormaslik uchun eng kichik oyna (kun) */
const MIN_AVG_WINDOW = 7;

/**
 * O'rtacha kunlik sotuv (dona) — oxirgi `days` kun bo'yicha.
 *
 * Bo'luvchi — tovar HAQIQATDA sotuvda bo'lgan kunlar soni: agar tovar 11 kun
 * oldin birinchi marta sotilgan bo'lsa, 30 ga emas, 11 ga bo'linadi. Aks holda
 * yangi tovarlarning tezligi bir necha barobar past ko'rinadi va "qoldiq 160
 * kunga yetadi" kabi noto'g'ri prognoz chiqadi. Juda yangi tovarlarda (1–2 kun)
 * teskari xato bo'lmasligi uchun eng kichik oyna — 7 kun.
 */
export async function getAvgDaily(storeIds: string[], days = 30): Promise<Map<string, number>> {
  const to = new Date();
  const from = addDays(to, -days);
  const sales = await aggregateSales(storeIds, from, to);
  const out = new Map<string, number>();
  for (const [skuId, agg] of sales) {
    if (agg.units <= 0) {
      out.set(skuId, 0);
      continue;
    }
    const since = agg.firstSaleAt && agg.firstSaleAt > from ? agg.firstSaleAt : from;
    const onSaleDays = Math.floor((to.getTime() - since.getTime()) / 86_400_000) + 1;
    const window = Math.min(days, Math.max(MIN_AVG_WINDOW, onSaleDays));
    out.set(skuId, agg.units / window);
  }
  return out;
}

/** Oxirgi sotuv sanalari (harakatsiz tovarlarni aniqlash uchun) */
export async function getLastSaleDates(storeIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (storeIds.length === 0) return out;
  const rows = await prisma.orderItem.findMany({
    where: { order: { storeId: { in: storeIds } }, status: { not: 'canceled' } },
    select: { skuId: true, orderedAt: true },
    orderBy: { orderedAt: 'desc' },
    take: 20_000,
  });
  for (const r of rows) {
    if (!r.skuId || out.has(r.skuId)) continue;
    out.set(r.skuId, r.orderedAt);
  }
  return out;
}

/** Davr xarajatlari (kategoriyalar bo'yicha) */
export async function getExpenses(
  companyId: string,
  from: Date,
  toExclusive: Date,
  storeId?: string,
): Promise<Record<ExpenseCategory, number>> {
  const rows = await prisma.expense.findMany({
    where: {
      companyId,
      date: { gte: from, lt: toExclusive },
      // `uzum-payout` — buyurtma satrlarida allaqachon ayrilgan to'lovlar
      source: { not: 'uzum-payout' },
      ...(storeId ? { storeId } : {}),
    },
    select: { category: true, amount: true },
  });
  const out: Record<ExpenseCategory, number> = {
    commission: 0,
    logistics: 0,
    marketing: 0,
    storage: 0,
    tax: 0,
    salary: 0,
    other: 0,
  };
  for (const r of rows) {
    const key = (r.category as ExpenseCategory) ?? 'other';
    out[key] = (out[key] ?? 0) + r.amount;
  }
  return out;
}

/** Kunlik seriya (tushum/foyda/buyurtma) */
export async function getDailySeries(
  storeIds: string[],
  period: Period,
): Promise<{ date: string; revenue: number; profit: number; orders: number; units: number; payout: number; returns: number }[]> {
  const from = new Date(`${period.from}T00:00:00.000Z`);
  /**
   * Seriya bugundan nariga o'tmaydi: "shu oy" tanlanganda oy oxirigacha nol
   * kunlar chizilsa, grafik har doim nolga qulagandek ko'rinardi.
   */
  const tomorrow = addDays(new Date(`${toISODate(new Date())}T00:00:00.000Z`), 1);
  const periodEnd = addDays(new Date(`${period.to}T00:00:00.000Z`), 1);
  const to = periodEnd < tomorrow ? periodEnd : tomorrow;

  const map = new Map<
    string,
    { date: string; revenue: number; profit: number; orders: number; units: number; payout: number; returns: number }
  >();

  let cur = new Date(from);
  while (cur < to) {
    const key = toISODate(cur);
    map.set(key, { date: key, revenue: 0, profit: 0, orders: 0, units: 0, payout: 0, returns: 0 });
    cur = addDays(cur, 1);
  }

  if (storeIds.length === 0) return [...map.values()];

  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: to }, order: { storeId: { in: storeIds } } },
    select: {
      orderedAt: true,
      revenue: true,
      netProfit: true,
      payout: true,
      qty: true,
      status: true,
      orderId: true,
      returnedAt: true,
    },
  });

  const ordersPerDay = new Map<string, Set<string>>();

  for (const it of items) {
    const key = toISODate(it.orderedAt);
    const row = map.get(key);
    if (!row) continue;
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned) {
      row.returns += it.qty;
    } else if (it.status !== 'canceled') {
      row.revenue += it.revenue;
      row.profit += it.netProfit;
      row.payout += it.payout;
      row.units += it.qty;
    }
    const set = ordersPerDay.get(key) ?? new Set<string>();
    set.add(it.orderId);
    ordersPerDay.set(key, set);
  }

  for (const [key, set] of ordersPerDay) {
    const row = map.get(key);
    if (row) row.orders = set.size;
  }

  return [...map.values()];
}

/**
 * Qoldiq holati: kritik / tugayapti / yetarli / ortiqcha / harakatsiz.
 *
 * `daysOnCatalog` berilsa, katalogga yaqinda qo'shilgan va hali sotilmagan tovar
 * "harakatsiz" deb belgilanmaydi: 3 kun oldin qo'shilgan tovar haqida
 * "45 kundan beri sotilmayapti" deyish noto'g'ri bo'lardi.
 */
export function stockState(
  total: number,
  avgDaily: number,
  daysWithoutSale: number,
  daysOnCatalog = Number.POSITIVE_INFINITY,
): { status: 'critical' | 'low' | 'ok' | 'excess' | 'dead'; daysLeft: number | null } {
  const daysLeft = avgDaily > 0 ? Math.round(total / avgDaily) : null;
  const longEnough = daysOnCatalog >= STOCK_THRESHOLDS.deadDays;
  if (daysWithoutSale >= STOCK_THRESHOLDS.deadDays && total > 0) {
    if (longEnough) return { status: 'dead', daysLeft };
    return { status: 'ok', daysLeft };
  }
  if (total <= 0) return { status: 'critical', daysLeft: 0 };
  if (daysLeft === null) return { status: longEnough ? 'dead' : 'ok', daysLeft: null };
  if (daysLeft <= STOCK_THRESHOLDS.critical) return { status: 'critical', daysLeft };
  if (daysLeft <= STOCK_THRESHOLDS.low) return { status: 'low', daysLeft };
  if (daysLeft >= STOCK_THRESHOLDS.excess) return { status: 'excess', daysLeft };
  return { status: 'ok', daysLeft };
}

export function daysSince(date: Date | null | undefined): number {
  if (!date) return 9999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

/** Kompaniyaning soliq stavkasi */
export async function getTaxRate(companyId: string): Promise<number> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { taxRate: true } });
  return c?.taxRate ?? 0;
}
