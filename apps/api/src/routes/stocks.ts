/**
 * Qoldiqlar moduli — /api/v1/stocks
 *
 *  GET /              → StocksResponse (FBO/FBS/o'z ombori kesimida qoldiq, uning qiymati,
 *                       hammasi sotilsa kutilayotgan tushum va foyda)
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
  parseSkuQuery,
  round,
  toISODate,
  toBusinessDate,
  type Paginated,
  type SalesStockResponse,
  type SalesStockRow,
  type SkuQuery,
  type SkuSearchKeys,
  type StockStatus,
  type StockStatusStat,
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
  getSkuCatalog,
  getStoreIds,
  isSalesStockVisible,
  skuInfoMatches,
  withSoldSkus,
  stockState,
  type SalesAgg,
  type SkuInfo,
  type StockInfo,
} from '../services/common.js';
import { aggregateSalesNet } from '../services/pnl.js';
import { loadPlanData, parseStockStatus, planSku, planStockStatus } from '../services/plan.js';
import { compareStockRows, filterStockList, loadStockList } from '../services/stock-rows.js';

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

/**
 * Qidiruv mos keladimi — umumiy qoida (services/common.ts skuInfoMatches):
 * nom, SKU kodi, shtrix-kod, Uzum SKU / mahsulot ID'si yoki uzum.uz havolasi.
 * Ilgari faqat nom va SKU kodi edi (2026-10-24). So'rov bir marta tahlil
 * qilinadi (parseSkuQuery) — har qatorda qayta emas.
 */
function matches(info: SkuInfo, query: SkuQuery | null): boolean {
  return query === null || skuInfoMatches(info, query);
}

/**
 * Holat filtri (?status=critical|low|ok|excess|dead) — services/plan.ts
 * `parseStockStatus`: Excel eksporti (routes/export.ts) ham aynan shuni o'qiydi.
 */
const statusFilter = parseStockStatus;

// ─────────────────────────── GET / — qoldiqlar ───────────────────────────

/*
 * Qidiruv, holat, tartib va sahifalash — SERVERDA (2026-10-27). Ilgari sahifa
 * 500 qatorni (pageSize chegarasi) olib, qolganini o'zi qilardi: 500 dan
 * ortiq SKU'li do'konda jadval va holat sonlari kesilardi, Excel esa 10 000
 * tagacha berardi — ikkalasi farq qilardi. Chegarani 10 000 ga ko'tarish
 * o'rniga sahifalash tanlandi: bir qator JSON'da ~0,8 KB (reja xulosasi
 * bilan, 634 SKU'da o'lchangan), 10 000 SKU — ~8 MB javob va har qidiruvda
 * shuncha qatorni brauzerda filtrlash; endi har so'rov 25 qator (~21 KB).
 * Server baribir barcha SKU'ni hisoblaydi (634 SKU — ~0,2 s) — KPI va holat
 * sonlari butun ombor bo'yicha bo'lishi shart.
 * Qatorlar va tartib Excel bilan BITTA manbadan (services/stock-rows.ts).
 */
router.get(
  '/',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const onlyStatus = statusFilter(q.status);

    const storeIds = await getStoreIds(company.id, range.storeId);
    const all = await loadStockList(company.id, company.taxRate, storeIds);

    // KPI kartochkalari — do'kon filtridagi BUTUN ombor: qidiruv va holat ularni o'zgartirmaydi (sahifadagidek)
    let units = 0;
    let costValue = 0;
    let retailValue = 0;
    let payoutValue = 0;
    let profitValue = 0;
    let unitsNoCost = 0;
    let skuCount = 0;
    for (const { row: r } of all) {
      units += r.total;
      costValue += r.costValue;
      retailValue += r.retailValue;
      payoutValue += r.payoutValue;
      if (r.profitValue !== null) profitValue += r.profitValue;
      else unitsNoCost += r.total;
      // Faqat omborda qoldig'i bor SKU sanaladi — KPI jadval bilan mos bo'lsin
      if (r.total > 0) skuCount += 1;
    }

    /*
     * Holatlar kesimi va "eng qimmat 10 SKU" — qidiruvga mos BARCHA SKU
     * bo'yicha, holat filtridan OLDIN: "Kritik" bosilganda qolgan tugmalar
     * 0 ga tushmasin ("Sotuv va qoldiq" sahifasidagi qoida).
     */
    const searched = filterStockList(all, parseSkuQuery(range.search), null);
    const byStatus: Record<StockStatus, StockStatusStat> = {
      critical: { skus: 0, units: 0, costValue: 0 },
      low: { skus: 0, units: 0, costValue: 0 },
      ok: { skus: 0, units: 0, costValue: 0 },
      excess: { skus: 0, units: 0, costValue: 0 },
      dead: { skus: 0, units: 0, costValue: 0 },
    };
    for (const { row } of searched) {
      const s = byStatus[row.status];
      s.skus += 1;
      s.units += row.total;
      s.costValue += row.costValue;
    }
    for (const s of Object.values(byStatus)) s.costValue = round(s.costValue);
    const topCost = searched
      .map((x) => x.row)
      .sort(compareStockRows('costValue', 'desc'))
      .slice(0, 10)
      .map((r) => ({ skuId: r.skuId, sku: r.sku, title: r.title, costValue: r.costValue }));

    // Jadval: qidiruv + holat, tanlangan tartib (teng qiymatlar SKU id bo'yicha — sahifalar barqaror)
    const rows = filterStockList(searched, null, onlyStatus)
      .map((x) => x.row)
      .sort(compareStockRows(range.sort, range.order));
    const filtered = { units: 0, costValue: 0, payoutValue: 0 };
    for (const r of rows) {
      filtered.units += r.total;
      filtered.costValue += r.costValue;
      filtered.payoutValue += r.payoutValue;
    }

    const payload: StocksResponse = {
      totals: {
        units,
        costValue: round(costValue),
        retailValue: round(retailValue),
        skuCount,
        payoutValue: round(payoutValue),
        profitValue: round(profitValue),
        unitsNoCost,
      },
      byStatus,
      filtered: { units: filtered.units, costValue: round(filtered.costValue), payoutValue: round(filtered.payoutValue) },
      topCost,
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
    const [catalog, planData, sales, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      /*
       * Holat va "yetadi" — Rejalashtiruvchining o'zi (planStockStatus),
       * Qoldiqlar sahifasi bilan bitta nishon. Ilgari bu sahifa 7/14 kunlik
       * qat'iy chegara va oddiy 30 kunlik o'rtacha bilan hisoblardi: yetkazish
       * 14 kun bo'lsa 12 kunlik SKU Qoldiqlarda "Kritik", shu yerda "Tugayapti"
       * edi (2026-10-24). Qoldiq ham rejadan — u `getLatestStocks` ni o'zi yuklaydi.
       */
      loadPlanData(company.id, storeIds),
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getAvgDaily(storeIds, AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);
    const stocks = planData.stocks;
    // Yashirilgan tovar ham davrda sotilgan bo'lsa — jami tushum boshqa sahifalar bilan teng chiqsin
    await withSoldSkus(catalog, sales.keys(), storeIds);

    const query = parseSkuQuery(range.search);
    const rows: SalesStockRow[] = [];
    /*
     * Holatlar soni qidiruvga mos BARCHA SKU bo'yicha, holat filtridan OLDIN
     * sanaladi. Ilgari mijoz ularni joriy (allaqachon filtrlangan) 50 qatordan
     * sanardi: "Kritik" bosilsa qolgan tugmalar 0 ga tushib, halqa bitta
     * qizil aylanaga aylanardi, 50 tadan ortiq SKU'da esa faqat 1-sahifa
     * sanalardi (2026-10-24).
     */
    const statusCounts: Record<StockStatus, number> = { critical: 0, low: 0, ok: 0, excess: 0, dead: 0 };

    for (const [skuId, info] of catalog) {
      if (!matches(info, query)) continue;
      const st = stocks.get(skuId) ?? EMPTY_STOCK;
      const agg = sales.get(skuId) ?? EMPTY_AGG;
      const avg = avgDaily.get(skuId) ?? 0;
      /*
       * Davrda sotuvi ham, qoldig'i ham, so'nggi 30 kunlik sur'ati ham yo'q SKU
       * jadvalni faqat cho'zadi. Qoida endi holat filtriga bog'liq emas.
       * Ilgari filtr tanlanganda bu SKU'lar ham qaytarilardi: "Kritik"
       * ro'yxatiga arxivdagi, allaqachon sotilmay qo'yilgan bo'sh SKU'lar
       * qo'shilib, son tugmadagidan ko'p chiqardi. Sur'ati bor (yaqinda
       * sotilgan), lekin qoldig'i tugagan SKU esa haqiqiy "Kritik" —
       * u "Barchasi"da ham ko'rinadi (2026-10-24). Qoida Excel eksporti bilan
       * umumiy: fayldagi qatorlar sahifadagi bilan bir xil bo'lsin.
       */
      if (!isSalesStockVisible(agg.units, agg.revenue, st.total, avg)) continue;
      // Sotuvi yo'q va arxivdagi SKU (rejada `no_action` yoki umuman yo'q) — eski qoldiq qoidasi
      const row = planSku(planData, skuId);
      const state = planStockStatus(
        row,
        stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt)),
      );
      // "Yetadi" shu tezlikdan chiqadi — ikkalasi bir manbadan (Qoldiqlar sahifasidagi kabi)
      const daily = row && row.status !== 'no_action' ? row.avgDaily : round(avg, 2);
      statusCounts[state.status] += 1;
      if (onlyStatus && state.status !== onlyStatus) continue;

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
        avgDaily: daily,
        daysLeft: state.daysLeft,
        // Oyiga potentsial sotuv: joriy sur'at 30 kun davom etsa
        monthPotential: Math.round(daily * 30),
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
    let maxRevenue = 0;
    for (const r of rows) {
      sold += r.sold;
      inStock += r.stockFbo + r.stockFbs + r.stockOwn;
      revenue += r.revenue;
      payout += r.payout;
      netProfit += r.netProfit;
      maxRevenue = Math.max(maxRevenue, r.revenue);
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
        statusCounts,
        maxRevenue,
      },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /warehouse — o'z ombori kesimi ───────────────────────────

/** Qidiruv kalitlari (SkuSearchKeys) — Ombor sahifasi jadvalni o'zi qidiradi, shtrix-kod va Uzum ID bo'yicha ham */
export interface WarehouseStockRow extends SkuSearchKeys {
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
  /**
   * Oddiy 30 kunlik o'rtacha kunlik sotuv — ATAYLAB Rejalashtiruvchi tezligi
   * emas: sahifa undan Uzum aylanmasini (qoldiq ÷ kunlik sotuv) hisoblaydi,
   * Uzum formulasida esa "sotuvda bo'lgan kunlar" tuzatishi yo'q.
   */
  avgDaily: number;
  /** SKU'ning BARCHA qoldig'i (yo'ldagisi bilan) necha kunga yetadi — Rejalashtiruvchi, faqat o'z ombori emas */
  daysLeft: number | null;
  /** Qoldiqlar sahifasidagi nishonning o'zi (planStockStatus) */
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

/** Bir saqlash sxemasidagi qoldiq: dona va tannarx qiymati (pulsiz shablonda costValue — null) */
export interface WarehouseSchemeTotal {
  units: number;
  costValue: number;
}

const SCHEMES = ['fbo', 'fbs', 'own'] as const;

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
    /**
     * FBO / FBS / o'z ombori kesimi — qidiruvga mos BARCHA SKU (o'z omborida
     * qoldig'i yo'q SKU ham). Ilgari sahifa buni GET /stocks dan 500 qator
     * olib o'zi yig'ardi: 500 dan ortiq SKU'da kartalar kesilgan edi (2026-10-27).
     */
    schemes: Record<(typeof SCHEMES)[number], WarehouseSchemeTotal>;
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

    const [catalog, planData, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      // Holat va "yetadi" — Rejalashtiruvchidan (pastda); qoldiq ham rejadan — u getLatestStocks'ni o'zi yuklaydi
      loadPlanData(company.id, storeIds),
      getAvgDaily(storeIds, AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);
    const stocks = planData.stocks;

    const query = parseSkuQuery(range.search);
    const rows: WarehouseStockRow[] = [];
    const byStore = new Map<string, WarehouseStoreTotals>();
    const schemes = {
      fbo: { units: 0, costValue: 0 },
      fbs: { units: 0, costValue: 0 },
      own: { units: 0, costValue: 0 },
    } satisfies Record<(typeof SCHEMES)[number], WarehouseSchemeTotal>;

    for (const [skuId, info] of catalog) {
      if (!matches(info, query)) continue;
      const st = stocks.get(skuId) ?? EMPTY_STOCK;
      // Sxemalar kesimi — pastdagi "faqat o'z ombori" filtridan OLDIN: FBO'dagi qoldiq ham shu yerda sanaladi
      for (const k of SCHEMES) {
        schemes[k].units += st[k];
        schemes[k].costValue += st[k] * (info.purchasePrice + info.extraCost);
      }
      // Bu bo'lim faqat o'z ombori haqida: FBO qoldig'i bu yerda ko'rsatilmaydi
      if (st.own <= 0 && st.reserved <= 0 && st.inTransit <= 0) continue;

      const avg = avgDaily.get(skuId) ?? 0;
      /*
       * Holat va "yetadi" — SKU'ning UMUMIY holati, Qoldiqlar sahifasidagi
       * nishonning o'zi (planStockStatus: barcha qoldiq + yo'ldagi, kompaniyaning
       * yetkazish muddati bilan). Ilgari faqat o'z ombori qoldig'idan 7/14 kunlik
       * chegara bilan hisoblanardi: FBO'da 200 dona turgan SKU o'z omboridagi
       * 3 donasi uchun "Kritik" chiqardi (2026-10-24). Sotuvi yo'q va arxivdagi
       * SKU — Qoldiqlardagi kabi eski qoldiq qoidasi, butun qoldiq bilan.
       */
      const state = planStockStatus(
        planSku(planData, skuId),
        stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt)),
      );
      const volumeL = round(st.own * info.volumeL, 2);
      const costValue = round(st.own * (info.purchasePrice + info.extraCost));

      rows.push({
        skuId,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        storeId: info.storeId,
        storeTitle: info.storeTitle,
        /*
         * Sahifa jadvalni o'zi qidiradi — shtrix-kod, Uzum ID va mahsulot nomi
         * bo'yicha ham topsin (shared search.ts). Mahsulot nomisiz variant nomli
         * («ЧЕРН») SKU sahifada topilmay, `?search=` bilan esa topilardi (2026-10-27).
         */
        productId: info.productId,
        productTitle: info.productTitle,
        uzumProductId: info.uzumProductId,
        barcode: info.barcode,
        uzumSkuId: info.uzumSkuId,
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
        schemes: {
          fbo: { units: schemes.fbo.units, costValue: round(schemes.fbo.costValue) },
          fbs: { units: schemes.fbs.units, costValue: round(schemes.fbs.costValue) },
          own: { units: schemes.own.units, costValue: round(schemes.own.costValue) },
        },
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
    const today = parseISODate(toBusinessDate(new Date()));
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
