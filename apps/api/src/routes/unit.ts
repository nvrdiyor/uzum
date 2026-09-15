/**
 * Unit-iqtisod moduli — /api/v1/unit
 *
 *  GET    /               → UnitEconomicsResponse (SKU kesimida bir dona uchun iqtisod)
 *  POST   /calc           → UnitCalcResult (kalkulyator, shared/calc.ts formulasi)
 *  GET    /defaults       → kalkulyator uchun boshlang'ich qiymatlar (SKU bo'yicha)
 *  GET    /scenarios      → saqlangan stsenariylar
 *  POST   /scenarios      → yangi stsenariy (data — JSON string)
 *  DELETE /scenarios/:id  → stsenariyni o'chirish
 *
 * Barcha pul qiymatlari UZS (butun so'm), sanalar ISO-8601.
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import { z } from 'zod';
import {
  DEFAULTS,
  IMPORT_CALC_FALLBACK,
  addDays,
  calcImportPrice,
  calcUnitEconomics,
  importCalcSchema,
  parseISODate,
  pct,
  round,
  safeDiv,
  toISODate,
  unitCalcSchema,
  type ImportCalcInput,
  type ImportDefaults,
  type UnitCalcInput,
  type UnitCalcResult,
  type UnitEconomicsResponse,
  type UnitEconomicsRow,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  type SalesAgg,
  type SkuInfo,
} from '../services/common.js';
import { getRate } from '../services/rates.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Bitta kompaniyada saqlanadigan stsenariylar chegarasi */
const MAX_SCENARIOS = 50;
/** Kalkulyator standart qiymatlari uchun statistika oynasi (kun) */
const DEFAULTS_WINDOW_DAYS = 30;

// ─────────────────────────── Yordamchilar ───────────────────────────

interface StorageAgg {
  /** Davrdagi jami saqlash to'lovi */
  amount: number;
  /** Kunlik qoldiqlar yig'indisi (dona × kun) */
  qtyDays: number;
  /** To'lov qayd etilgan kunlar soni */
  days: number;
}

/** Davr bo'yicha SKU kesimida pullik saqlash to'lovlari */
async function storageBySku(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
): Promise<Map<string, StorageAgg>> {
  const out = new Map<string, StorageAgg>();
  if (storeIds.length === 0) return out;

  const rows = await prisma.storageFee.findMany({
    where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
    select: { skuId: true, amount: true, qty: true },
  });

  for (const r of rows) {
    if (!r.skuId) continue;
    const cur = out.get(r.skuId) ?? { amount: 0, qtyDays: 0, days: 0 };
    cur.amount += r.amount;
    cur.qtyDays += r.qty;
    cur.days += 1;
    out.set(r.skuId, cur);
  }
  return out;
}

/** Foizni xavfsiz oraliqqa keltiradi (calc.ts kirishlari uchun) */
const clampPct = (value: number, max = 100): number => Math.min(max, Math.max(0, value));

/**
 * Bitta SKU uchun bir dona tovarning iqtisodi.
 * Sotuv bo'lgan bo'lsa — haqiqiy komissiya/logistika, aks holda kompaniya o'rtachasi.
 */
function buildRow(
  info: SkuInfo,
  agg: SalesAgg | undefined,
  storage: StorageAgg | undefined,
  fallback: { commissionPct: number; logistics: number },
  taxRate: number,
): { row: UnitEconomicsRow; revenue: number; investment: number } {
  const units = agg?.units ?? 0;
  const hasSales = Boolean(agg) && units > 0;

  // Haqiqiy o'rtacha sotuv narxi (chegirmalar hisobga olinadi)
  const price = hasSales && agg ? safeDiv(agg.revenue, units) : info.price;
  const commissionPct =
    hasSales && agg && agg.revenue > 0 ? (agg.commission / agg.revenue) * 100 : fallback.commissionPct;
  const logistics = hasSales && agg ? safeDiv(agg.logistics, units) : fallback.logistics;
  /**
   * Qo'shimcha xarajat bitta manbadan olinadi: sotuv bo'lsa — buyurtma
   * satrlaridagi qiymat, aks holda katalogdagi qiymat. Ilgari ikkalasi
   * qo'shilib, bir dona uchun xarajat oshib ketardi.
   */
  const otherCost = hasSales && agg ? safeDiv(agg.otherCost, units) : info.extraCost;

  // Saqlash: davr to'lovi sotilgan donalarga taqsimlanadi, sotuv bo'lmasa — dona-kun bo'yicha
  const storagePerUnit = storage
    ? units > 0
      ? safeDiv(storage.amount, units)
      : safeDiv(storage.amount, storage.qtyDays)
    : 0;

  const calc = calcUnitEconomics({
    price,
    purchasePrice: info.purchasePrice,
    commissionPct: clampPct(commissionPct),
    logistics,
    storagePerDay: storagePerUnit,
    storageDays: 1,
    packaging: 0,
    otherCost,
    taxPct: clampPct(taxRate, 50),
    // Qaytarishlar allaqachon yig'indidan chiqarilgan — shuning uchun 100%
    buyoutPct: 100,
    returnLogistics: 0,
    qty: 1,
  });

  const row: UnitEconomicsRow = {
    skuId: info.id,
    sku: info.sku,
    title: info.title,
    imageUrl: info.imageUrl,
    price: round(price),
    purchasePrice: round(info.purchasePrice),
    commissionPct: round(clampPct(commissionPct), 2),
    commission: calc.commission,
    logistics: calc.logisticsTotal,
    storage: calc.storageTotal,
    otherCost: round(otherCost),
    tax: calc.tax,
    netProfit: calc.netProfit,
    margin: calc.margin,
    roi: calc.roi,
    breakEvenPrice: calc.breakEvenPrice,
    unitsSold: units,
    totalProfit: round(calc.netProfit * units),
  };

  return {
    row,
    revenue: agg?.revenue ?? 0,
    investment: (info.purchasePrice + otherCost) * units,
  };
}

/** Jadval saralash kalitlari */
const SORTERS: Record<string, (r: UnitEconomicsRow) => number> = {
  profit: (r) => r.totalProfit,
  margin: (r) => r.margin,
  roi: (r) => r.roi,
  units: (r) => r.unitsSold,
};

// ─────────────────────────── GET / — unit-iqtisod jadvali ───────────────────────────

router.get(
  '/',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, sales, storage] = await Promise.all([
      getSkuCatalog(storeIds, false),
      aggregateSales(storeIds, range.from, range.toExclusive),
      storageBySku(storeIds, range.from, range.toExclusive),
    ]);

    // Sotuvsiz SKU'lar uchun kompaniya o'rtachasi (bo'lmasa — platforma taxminlari)
    let allRevenue = 0;
    let allCommission = 0;
    let allLogistics = 0;
    let allUnits = 0;
    for (const agg of sales.values()) {
      allRevenue += agg.revenue;
      allCommission += agg.commission;
      allLogistics += agg.logistics;
      allUnits += agg.units;
    }
    const fallback = {
      commissionPct: allRevenue > 0 ? (allCommission / allRevenue) * 100 : DEFAULTS.commissionPct,
      logistics: allUnits > 0 ? allLogistics / allUnits : DEFAULTS.logisticsPerUnit,
    };

    const search = range.search?.toLowerCase();
    const rows: UnitEconomicsRow[] = [];
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalInvestment = 0;

    for (const info of catalog.values()) {
      if (search && !`${info.sku} ${info.title}`.toLowerCase().includes(search)) continue;
      const built = buildRow(info, sales.get(info.id), storage.get(info.id), fallback, company.taxRate);
      rows.push(built.row);
      totalRevenue += built.revenue;
      totalProfit += built.row.totalProfit;
      totalInvestment += built.investment;
    }

    const sorter = SORTERS[range.sort ?? 'profit'] ?? SORTERS.profit;
    const dir = range.order === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const diff = (sorter(a) - sorter(b)) * dir;
      return diff !== 0 ? diff : b.totalProfit - a.totalProfit;
    });

    const payload: UnitEconomicsResponse = {
      period: range.period,
      totals: {
        revenue: round(totalRevenue),
        profit: round(totalProfit),
        margin: pct(totalProfit, totalRevenue),
        roi: pct(totalProfit, totalInvestment),
      },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /calc — kalkulyator ───────────────────────────

router.post(
  '/calc',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const input = unitCalcSchema.parse(req.body ?? {});
    const result = calcUnitEconomics(input);
    res.json(result satisfies UnitCalcResult);
  }),
);

// ─────────────────────────── GET /defaults — boshlang'ich qiymatlar ───────────────────────────

interface UnitSkuOption {
  id: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  price: number;
  purchasePrice: number;
  unitsSold: number;
}

interface UnitDefaultsResponse {
  skuId: string | null;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  currency: string;
  /** Kalkulyator formasi uchun tayyor kirish qiymatlari */
  input: UnitCalcInput;
  /** Shu qiymatlar bo'yicha oldindan hisoblangan natija */
  result: UnitCalcResult;
  /** Tanlash uchun SKU ro'yxati (sotuv bo'yicha tartiblangan) */
  skus: UnitSkuOption[];
  /** Qaysi qiymat qayerdan olingani — UI'da izoh ko'rsatish uchun */
  source: {
    /** 'catalogue' — Uzum katalogidagi foiz ishlatildi */
    commission: 'sales' | 'catalogue' | 'default';
    logistics: 'sales' | 'default';
    storage: 'fees' | 'volume' | 'default';
    buyout: 'sales' | 'default';
  };
}

router.get(
  '/defaults',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    // Standart qiymatlar oxirgi 30 kunlik statistika asosida hisoblanadi
    const toExclusive = addDays(parseISODate(toISODate(new Date())), 1);
    const from = addDays(toExclusive, -DEFAULTS_WINDOW_DAYS);

    const [catalog, sales, storage, stocks] = await Promise.all([
      getSkuCatalog(storeIds, false),
      aggregateSales(storeIds, from, toExclusive),
      storageBySku(storeIds, from, toExclusive),
      getLatestStocks(storeIds),
    ]);

    // Kompaniya bo'yicha o'rtachalar
    let allRevenue = 0;
    let allCommission = 0;
    let allLogistics = 0;
    let allUnits = 0;
    let allReturns = 0;
    for (const agg of sales.values()) {
      allRevenue += agg.revenue;
      allCommission += agg.commission;
      allLogistics += agg.logistics;
      allUnits += agg.units;
      allReturns += agg.returns;
    }

    const requested = typeof req.query.skuId === 'string' ? req.query.skuId.trim() : '';
    if (requested && !catalog.has(requested)) throw AppError.notFound('SKU topilmadi');

    const options: UnitSkuOption[] = [...catalog.values()]
      .map((info) => ({
        id: info.id,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        price: round(info.price),
        purchasePrice: round(info.purchasePrice),
        unitsSold: sales.get(info.id)?.units ?? 0,
      }))
      .sort((a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title))
      .slice(0, 200);

    const chosenId = requested || options[0]?.id || '';
    const info = chosenId ? (catalog.get(chosenId) ?? null) : null;
    const agg = info ? sales.get(info.id) : undefined;
    const units = agg?.units ?? 0;

    // Komissiya
    const commissionFromSku = agg && agg.revenue > 0 ? (agg.commission / agg.revenue) * 100 : 0;
    const commissionFromCompany = allRevenue > 0 ? (allCommission / allRevenue) * 100 : 0;
    /**
     * Tartib: shu SKU sotuvidan hisoblangan foiz → Uzum katalogidagi foiz →
     * kompaniya o'rtachasi → standart taxmin. Uzumning o'z foizi (masalan 15%)
     * kompaniya o'rtachasidan ham, 12% taxmindan ham aniqroq.
     */
    const commissionPct =
      commissionFromSku || (info?.commissionPct ?? 0) || commissionFromCompany || DEFAULTS.commissionPct;
    const commissionSource: 'sales' | 'catalogue' | 'default' = commissionFromSku
      ? 'sales'
      : info?.commissionPct
        ? 'catalogue'
        : commissionFromCompany
          ? 'sales'
          : 'default';

    // Logistika (bir dona uchun)
    const logisticsFromSku = agg && units > 0 ? agg.logistics / units : 0;
    const logisticsFromCompany = allUnits > 0 ? allLogistics / allUnits : 0;
    const logistics = logisticsFromSku || logisticsFromCompany || DEFAULTS.logisticsPerUnit;
    const logisticsSource: 'sales' | 'default' = logisticsFromSku || logisticsFromCompany ? 'sales' : 'default';

    // Saqlash: to'lov tarixi → hajm bo'yicha taxmin → 0
    const fee = info ? storage.get(info.id) : undefined;
    let storagePerDay = 0;
    let storageSource: 'fees' | 'volume' | 'default' = 'default';
    if (fee && fee.qtyDays > 0) {
      storagePerDay = fee.amount / fee.qtyDays;
      storageSource = 'fees';
    } else if (info && info.storagePerItem > 0) {
      // Uzumning o'z hisobi — oylik, kunlikka bo'linadi
      storagePerDay = info.storagePerItem / 30;
      storageSource = 'volume';
    } else if (info && info.volumeL > 0) {
      storagePerDay = info.volumeL * DEFAULTS.storagePerLiterPerDay;
      storageSource = 'volume';
    }

    // Saqlash muddati: qoldiq necha kunga yetadi
    const stock = info ? stocks.get(info.id)?.total ?? 0 : 0;
    const avgDaily = units / DEFAULTS_WINDOW_DAYS;
    const storageDays = avgDaily > 0 ? Math.min(60, Math.max(1, Math.round(stock / avgDaily))) : 20;

    // Sotib olish darajasi (qaytarishlarni hisobga olib)
    const buyoutBase = allUnits + allReturns;
    const buyoutFromSales = buyoutBase > 0 ? (allUnits / buyoutBase) * 100 : 0;
    const buyoutPct = buyoutFromSales > 0 ? Math.min(100, Math.max(1, buyoutFromSales)) : DEFAULTS.buyoutPct;
    const buyoutSource: 'sales' | 'default' = buyoutFromSales > 0 ? 'sales' : 'default';

    const input: UnitCalcInput = {
      price: round(info?.price ?? 0),
      purchasePrice: round(info?.purchasePrice ?? 0),
      commissionPct: round(clampPct(commissionPct), 2),
      logistics: round(logistics),
      storagePerDay: round(storagePerDay),
      storageDays,
      packaging: 0,
      otherCost: round(info?.extraCost ?? 0),
      taxPct: round(clampPct(company.taxRate, 50), 2),
      buyoutPct: round(buyoutPct, 2),
      // Qaytarish logistikasi odatda to'g'ri yo'nalishning ~75% i
      returnLogistics: round(logistics * 0.75),
      qty: 100,
    };

    const payload: UnitDefaultsResponse = {
      skuId: info?.id ?? null,
      sku: info?.sku ?? null,
      title: info?.title ?? null,
      imageUrl: info?.imageUrl ?? null,
      currency: company.currency,
      input,
      result: calcUnitEconomics(input),
      skus: options,
      source: {
        commission: commissionSource,
        logistics: logisticsSource,
        storage: storageSource,
        buyout: buyoutSource,
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Stsenariylar ───────────────────────────

interface UnitScenarioRow {
  id: string;
  name: string;
  /** Kirish qiymatlari — JSON string (bazada shu ko'rinishda saqlanadi) */
  data: string;
  /** Tekshirilgan kirish (buzilgan JSON bo'lsa null) */
  input: UnitCalcInput | null;
  /** Oldindan hisoblangan natija (input bo'lsa) */
  result: UnitCalcResult | null;
  createdAt: string;
  updatedAt: string;
}

const scenarioSchema = z.object({
  name: z.string().trim().min(1, 'Nom kiritilmagan').max(120),
  /** Obyekt yoki JSON string — ikkalasi ham qabul qilinadi */
  data: z.union([z.string(), z.record(z.unknown())]).optional(),
});

/** Saqlangan JSON'ni tekshirib `UnitCalcInput` ga keltiradi */
function parseScenarioData(data: string): UnitCalcInput | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = unitCalcSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function toScenarioRow(s: {
  id: string;
  name: string;
  data: string;
  createdAt: Date;
  updatedAt: Date;
}): UnitScenarioRow {
  const input = parseScenarioData(s.data);
  return {
    id: s.id,
    name: s.name,
    data: s.data,
    input,
    result: input ? calcUnitEconomics(input) : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** GET /scenarios — saqlangan stsenariylar (eng yangisi birinchi) */
router.get(
  '/scenarios',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rows = await prisma.unitScenario.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: 'desc' },
      take: MAX_SCENARIOS,
    });
    res.json({ items: rows.map(toScenarioRow), total: rows.length });
  }),
);

/** POST /scenarios — yangi stsenariy */
router.post(
  '/scenarios',
  requireFeature('unit_economics'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const body = scenarioSchema.parse(req.body ?? {});

    // `data` yo'q bo'lsa — kalkulyator maydonlari to'g'ridan-to'g'ri tanada kelgan deb hisoblaymiz
    let raw: unknown = body.data ?? req.body;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw AppError.badRequest('`data` maydoni to‘g‘ri JSON emas');
      }
    }
    const input = unitCalcSchema.parse(raw);

    const count = await prisma.unitScenario.count({ where: { companyId: company.id } });
    if (count >= MAX_SCENARIOS)
      throw AppError.badRequest(`Stsenariylar soni chegarasi — ${MAX_SCENARIOS} ta. Eskilarini o‘chiring.`);

    const created = await prisma.unitScenario.create({
      data: { companyId: company.id, name: body.name, data: JSON.stringify(input) },
    });

    res.status(201).json(toScenarioRow(created));
  }),
);

/** DELETE /scenarios/:id — o'chirish */
router.delete(
  '/scenarios/:id',
  requireFeature('unit_economics'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const result = await prisma.unitScenario.deleteMany({ where: { id, companyId: company.id } });
    if (result.count === 0) throw AppError.notFound('Stsenariy topilmadi');
    res.json({ ok: true, id });
  }),
);

// ─────────────────────── Xitoydan import (PDD) kalkulyatori ───────────────────────

/** Ma'lumot yetarli bo'lmaganda ishlatiladigan bozor bo'yicha odatiy qiymatlar */
const IMPORT_FALLBACK = IMPORT_CALC_FALLBACK;

/** Haqiqiy buyurtmalardan komissiya oynasi (kun) */
const IMPORT_STATS_DAYS = 90;

/**
 * GET /import-defaults — kalkulyator uchun avtomatik boshlang'ich qiymatlar:
 *  • CNY kursi — Markaziy bankdan (6 soatga keshlanadi),
 *  • komissiya va yetkazib berish — foydalanuvchining haqiqiy buyurtmalaridan.
 */
router.get(
  '/import-defaults',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rate = await getRate('CNY');

    let commissionPct: number = IMPORT_FALLBACK.commissionPct;
    let deliveryFee: number = IMPORT_FALLBACK.deliveryFee;
    let commissionFromData = false;

    const storeIds = await getStoreIds(company.id);
    if (storeIds.length > 0) {
      const to = new Date();
      const from = addDays(to, -IMPORT_STATS_DAYS);
      const agg = await prisma.orderItem.aggregate({
        where: {
          orderedAt: { gte: from, lt: to },
          order: { storeId: { in: storeIds } },
          status: { not: 'canceled' },
        },
        _sum: { revenue: true, commission: true, logistics: true },
        _count: { _all: true },
      });

      const revenue = agg._sum.revenue ?? 0;
      const commission = agg._sum.commission ?? 0;
      const logistics = agg._sum.logistics ?? 0;
      const items = agg._count._all ?? 0;

      if (revenue > 0 && commission > 0) {
        commissionPct = round(pct(commission, revenue), 1);
        commissionFromData = true;
      }
      if (items > 0 && logistics > 0) {
        deliveryFee = round(safeDiv(logistics, items));
      }
    }

    const payload: ImportDefaults = {
      pddPrice: IMPORT_FALLBACK.pddPrice,
      weightGr: IMPORT_FALLBACK.weightGr,
      rate: round(rate.rate),
      cargoPerKg: IMPORT_FALLBACK.cargoPerKg,
      commissionPct,
      adsPct: IMPORT_FALLBACK.adsPct,
      deliveryFee,
      profitMultiplier: IMPORT_FALLBACK.profitMultiplier,
      roundStep: IMPORT_FALLBACK.roundStep,
      rateSource: rate.source,
      rateUpdatedAt: rate.updatedAt,
      commissionFromData,
    };

    res.json(payload);
  }),
);

/** POST /import-calc — server tomonda hisoblash (sayt mahalliy ham hisoblaydi) */
router.post(
  '/import-calc',
  ah(async (req, res) => {
    const input = importCalcSchema.parse(req.body) as ImportCalcInput;
    res.json(calcImportPrice(input));
  }),
);

export default router;
