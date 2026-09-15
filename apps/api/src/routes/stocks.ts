/**
 * Qoldiqlar moduli — /api/v1/stocks
 *
 *  GET /              → StocksResponse (FBO/FBS/o'z ombori kesimida qoldiq va uning qiymati)
 *  GET /sales-stock   → SalesStockResponse (sotuv + qoldiq: nima qancha sotildi va qancha qoldi)
 *  GET /warehouse     → o'z ombori kesimi: SKU bo'yicha qoldiq, band, yo'lda, qiymat, hajm
 *  GET /history       → ?skuId= bo'yicha oxirgi 60 kunlik qoldiq tarixi
 *
 * Barcha pul qiymatlari UZS (butun son), sanalar ISO-8601.
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymat qaytaradi (xato emas).
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  parseISODate,
  round,
  toISODate,
  type Paginated,
  type SalesStockResponse,
  type SalesStockRow,
  type StockRow,
  type StocksResponse,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  daysSince,
  getAvgDaily,
  getLastSaleDates,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  stockState,
  type SalesAgg,
  type SkuInfo,
  type StockInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Qoldiq tarixi uzunligi (kun) */
const HISTORY_DAYS = 60;
/** O'rtacha kunlik sotuvni hisoblash oynasi (kun) */
const AVG_WINDOW = 30;

// ─────────────────────────── Yordamchilar ───────────────────────────

const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };

const EMPTY_AGG: SalesAgg = {
  skuId: '',
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
};

type SortValue = number | string;

/** Umumiy saralash (matn — alifbo bo'yicha, son — kattaligi bo'yicha) */
function applySort<T>(rows: T[], order: 'asc' | 'desc', value: (row: T) => SortValue): T[] {
  const dir = order === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
    return (va - vb) * dir;
  });
}

/** Qidiruv mos keladimi (nom yoki SKU kodi bo'yicha, registrga bog'liq emas) */
function matches(info: SkuInfo, search: string | undefined): boolean {
  if (!search) return true;
  return info.title.toLowerCase().includes(search) || info.sku.toLowerCase().includes(search);
}

/** Ruxsat etilgan holat filtri (?status=critical|low|ok|excess|dead) */
type StockStatus = StockRow['status'];
const STATUSES: StockStatus[] = ['critical', 'low', 'ok', 'excess', 'dead'];

function statusFilter(value: string | undefined): StockStatus | null {
  return value && (STATUSES as string[]).includes(value) ? (value as StockStatus) : null;
}

// ─────────────────────────── GET / — qoldiqlar ───────────────────────────

const STOCK_SORT: Record<string, (r: StockRow) => SortValue> = {
  total: (r) => r.total,
  fbo: (r) => r.fbo,
  fbs: (r) => r.fbs,
  own: (r) => r.own,
  reserved: (r) => r.reserved,
  inTransit: (r) => r.inTransit,
  costValue: (r) => r.costValue,
  retailValue: (r) => r.retailValue,
  avgDaily: (r) => r.avgDaily,
  daysLeft: (r) => r.daysLeft ?? Number.MAX_SAFE_INTEGER,
  title: (r) => r.title,
  sku: (r) => r.sku,
};

router.get(
  '/',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const onlyStatus = statusFilter(q.status);

    const storeIds = await getStoreIds(company.id, range.storeId);
    const [catalog, stocks, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);

    const search = range.search?.toLowerCase();
    const rows: StockRow[] = [];

    for (const [skuId, info] of catalog) {
      if (!matches(info, search)) continue;
      const st = stocks.get(skuId) ?? EMPTY_STOCK;
      const avg = avgDaily.get(skuId) ?? 0;
      const state = stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt));
      if (onlyStatus && state.status !== onlyStatus) continue;

      rows.push({
        skuId,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        storeTitle: info.storeTitle,
        fbo: st.fbo,
        fbs: st.fbs,
        own: st.own,
        reserved: st.reserved,
        inTransit: st.inTransit,
        total: st.total,
        // Tannarx bo'yicha qiymat — omborda "muzlab turgan" pul
        costValue: round(st.total * (info.purchasePrice + info.extraCost)),
        // Sotuv narxi bo'yicha qiymat — potentsial tushum
        retailValue: round(st.total * info.price),
        avgDaily: round(avg, 2),
        daysLeft: state.daysLeft,
        status: state.status,
      });
    }

    const sorter = STOCK_SORT[range.sort ?? 'costValue'] ?? STOCK_SORT.costValue;
    applySort(rows, range.order, sorter);

    let units = 0;
    let costValue = 0;
    let retailValue = 0;
    for (const r of rows) {
      units += r.total;
      costValue += r.costValue;
      retailValue += r.retailValue;
    }

    const payload: StocksResponse = {
      totals: { units, costValue: round(costValue), retailValue: round(retailValue), skuCount: rows.length },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /sales-stock — sotuv va qoldiq ───────────────────────────

const SALES_STOCK_SORT: Record<string, (r: SalesStockRow) => SortValue> = {
  sold: (r) => r.sold,
  revenue: (r) => r.revenue,
  payout: (r) => r.payout,
  netProfit: (r) => r.netProfit,
  avgDaily: (r) => r.avgDaily,
  monthPotential: (r) => r.monthPotential,
  stock: (r) => r.stockFbo + r.stockFbs + r.stockOwn,
  daysLeft: (r) => r.daysLeft ?? Number.MAX_SAFE_INTEGER,
  title: (r) => r.title,
};

router.get(
  '/sales-stock',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const onlyStatus = statusFilter(q.status);

    const storeIds = await getStoreIds(company.id, range.storeId);
    const [catalog, stocks, sales, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      aggregateSales(storeIds, range.from, range.toExclusive),
      getAvgDaily(storeIds, AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);

    const search = range.search?.toLowerCase();
    const rows: SalesStockRow[] = [];

    for (const [skuId, info] of catalog) {
      if (!matches(info, search)) continue;
      const st = stocks.get(skuId) ?? EMPTY_STOCK;
      const agg = sales.get(skuId) ?? EMPTY_AGG;
      const avg = avgDaily.get(skuId) ?? 0;
      const state = stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt));
      if (onlyStatus && state.status !== onlyStatus) continue;
      // Sotuvi ham, qoldig'i ham bo'lmagan SKU jadvalni faqat cho'zadi
      if (agg.units === 0 && st.total === 0 && !onlyStatus) continue;

      rows.push({
        skuId,
        sku: info.sku,
        title: info.title,
        storeTitle: info.storeTitle,
        imageUrl: info.imageUrl,
        sold: agg.units,
        stockFbo: st.fbo,
        stockFbs: st.fbs,
        stockOwn: st.own,
        revenue: round(agg.revenue),
        payout: round(agg.payout),
        netProfit: round(agg.netProfit),
        avgDaily: round(avg, 2),
        daysLeft: state.daysLeft,
        // Oyiga potentsial sotuv: joriy sur'at 30 kun davom etsa
        monthPotential: Math.round(avg * 30),
        status: state.status,
      });
    }

    const sorter = SALES_STOCK_SORT[range.sort ?? 'revenue'] ?? SALES_STOCK_SORT.revenue;
    applySort(rows, range.order, sorter);

    let sold = 0;
    let inStock = 0;
    let revenue = 0;
    let payout = 0;
    let netProfit = 0;
    for (const r of rows) {
      sold += r.sold;
      inStock += r.stockFbo + r.stockFbs + r.stockOwn;
      revenue += r.revenue;
      payout += r.payout;
      netProfit += r.netProfit;
    }

    const payload: SalesStockResponse = {
      period: range.period,
      totals: {
        sold,
        inStock,
        revenue: round(revenue),
        payout: round(payout),
        netProfit: round(netProfit),
        skuCount: rows.length,
      },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /warehouse — o'z ombori kesimi ───────────────────────────

export interface WarehouseStockRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  storeId: string;
  storeTitle: string;
  /** O'z omboridagi qoldiq (FBS/DBS uchun) */
  own: number;
  /** Buyurtmalarga band qilingan */
  reserved: number;
  /** Sotuvga tayyor: own − reserved */
  available: number;
  /** Yo'lda (Uzum omboriga jo'natilgan) */
  inTransit: number;
  costValue: number;
  retailValue: number;
  /** Egallagan hajm, litr */
  volumeL: number;
  /** Umumiy og'irlik, kg */
  weightKg: number;
  avgDaily: number;
  daysLeft: number | null;
  status: StockStatus;
}

export interface WarehouseStoreTotals {
  storeId: string;
  title: string;
  skuCount: number;
  units: number;
  reserved: number;
  inTransit: number;
  costValue: number;
  volumeL: number;
}

export interface WarehouseStockResponse {
  totals: {
    skuCount: number;
    units: number;
    reserved: number;
    available: number;
    inTransit: number;
    costValue: number;
    retailValue: number;
    volumeL: number;
    weightKg: number;
    byStore: WarehouseStoreTotals[];
  };
  rows: Paginated<WarehouseStockRow>;
}

const WAREHOUSE_SORT: Record<string, (r: WarehouseStockRow) => SortValue> = {
  own: (r) => r.own,
  reserved: (r) => r.reserved,
  available: (r) => r.available,
  inTransit: (r) => r.inTransit,
  costValue: (r) => r.costValue,
  retailValue: (r) => r.retailValue,
  volumeL: (r) => r.volumeL,
  daysLeft: (r) => r.daysLeft ?? Number.MAX_SAFE_INTEGER,
  title: (r) => r.title,
  sku: (r) => r.sku,
};

router.get(
  '/warehouse',
  requireFeature('warehouse'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);

    const search = range.search?.toLowerCase();
    const rows: WarehouseStockRow[] = [];
    const byStore = new Map<string, WarehouseStoreTotals>();

    for (const [skuId, info] of catalog) {
      if (!matches(info, search)) continue;
      const st = stocks.get(skuId) ?? EMPTY_STOCK;
      // Bu bo'lim faqat o'z ombori haqida: FBO qoldig'i bu yerda ko'rsatilmaydi
      if (st.own <= 0 && st.reserved <= 0 && st.inTransit <= 0) continue;

      const avg = avgDaily.get(skuId) ?? 0;
      const state = stockState(st.own, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt));
      const volumeL = round(st.own * info.volumeL, 2);
      const costValue = round(st.own * (info.purchasePrice + info.extraCost));

      rows.push({
        skuId,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        storeId: info.storeId,
        storeTitle: info.storeTitle,
        own: st.own,
        reserved: st.reserved,
        available: Math.max(0, st.own - st.reserved),
        inTransit: st.inTransit,
        costValue,
        retailValue: round(st.own * info.price),
        volumeL,
        weightKg: round((st.own * info.weightGr) / 1000, 2),
        avgDaily: round(avg, 2),
        daysLeft: state.daysLeft,
        status: state.status,
      });

      const agg =
        byStore.get(info.storeId) ??
        ({
          storeId: info.storeId,
          title: info.storeTitle,
          skuCount: 0,
          units: 0,
          reserved: 0,
          inTransit: 0,
          costValue: 0,
          volumeL: 0,
        } satisfies WarehouseStoreTotals);
      agg.skuCount += 1;
      agg.units += st.own;
      agg.reserved += st.reserved;
      agg.inTransit += st.inTransit;
      agg.costValue += costValue;
      agg.volumeL += volumeL;
      byStore.set(info.storeId, agg);
    }

    const sorter = WAREHOUSE_SORT[range.sort ?? 'costValue'] ?? WAREHOUSE_SORT.costValue;
    applySort(rows, range.order, sorter);

    let units = 0;
    let reserved = 0;
    let available = 0;
    let inTransit = 0;
    let costValue = 0;
    let retailValue = 0;
    let volumeL = 0;
    let weightKg = 0;
    for (const r of rows) {
      units += r.own;
      reserved += r.reserved;
      available += r.available;
      inTransit += r.inTransit;
      costValue += r.costValue;
      retailValue += r.retailValue;
      volumeL += r.volumeL;
      weightKg += r.weightKg;
    }

    const payload: WarehouseStockResponse = {
      totals: {
        skuCount: rows.length,
        units,
        reserved,
        available,
        inTransit,
        costValue: round(costValue),
        retailValue: round(retailValue),
        volumeL: round(volumeL, 2),
        weightKg: round(weightKg, 2),
        byStore: [...byStore.values()]
          .map((s) => ({ ...s, costValue: round(s.costValue), volumeL: round(s.volumeL, 2) }))
          .sort((a, b) => b.costValue - a.costValue),
      },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /history — qoldiq tarixi ───────────────────────────

export interface StockHistoryPoint {
  date: string;
  fbo: number;
  fbs: number;
  own: number;
}

router.get(
  '/history',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const skuId = (req.query as Record<string, string | undefined>).skuId?.trim();
    if (!skuId) throw AppError.badRequest('skuId parametri talab qilinadi');

    const storeIds = await getStoreIds(company.id);
    const sku = await prisma.sku.findFirst({
      where: { id: skuId, storeId: { in: storeIds } },
      select: { id: true },
    });
    if (!sku) throw AppError.notFound('SKU topilmadi');

    // Oxirgi 60 kunning ISO sanalari (bugun — oxirgi nuqta)
    const today = parseISODate(toISODate(new Date()));
    const days: string[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) days.push(toISODate(addDays(today, -i)));

    const snapshots = await prisma.stockSnapshot.findMany({
      where: { skuId: sku.id, date: { gte: parseISODate(days[0]) } },
      select: { date: true, fbo: true, fbs: true, own: true },
      orderBy: { date: 'asc' },
    });

    const byDay = new Map<string, { fbo: number; fbs: number; own: number }>();
    for (const s of snapshots) byDay.set(toISODate(s.date), { fbo: s.fbo, fbs: s.fbs, own: s.own });

    // Snapshot bo'lmagan kunlarda oxirgi ma'lum qiymat saqlanadi (grafik uzilmasligi uchun)
    let carry = { fbo: 0, fbs: 0, own: 0 };
    const payload: StockHistoryPoint[] = days.map((date) => {
      const found = byDay.get(date);
      if (found) carry = found;
      return { date, fbo: carry.fbo, fbs: carry.fbs, own: carry.own };
    });

    res.json(payload);
  }),
);

export default router;
