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
  NEW_SKU_FREE_DAYS,
  TURNOVER_WINDOW_DAYS,
  addDays,
  billableLiters,
  calcImportPrice,
  calcUnitEconomics,
  hasExtendedNewSkuFree,
  importCalcSchema,
  logisticsFee,
  parseISODate,
  pct,
  round,
  safeDiv,
  storageFeePerDay,
  storageTariffKind,
  toISODate,
  businessDayStart,
  toBusinessDate,
  turnoverDays,
  unitCalcSchema,
  type ImportCalcInput,
  type ImportDefaults,
  type StorageTariffKind,
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
  skuInfoMatches,
  withSoldSkus,
  type SalesAgg,
  type SkuInfo,
} from '../services/common.js';
import { aggregateSalesNet } from '../services/pnl.js';
import { getRate } from '../services/rates.js';
import { skuAgeOnSale } from '../services/storage-turnover.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Bitta kompaniyada saqlanadigan stsenariylar chegarasi */
const MAX_SCENARIOS = 50;
/** Kalkulyator standart qiymatlari uchun statistika oynasi (kun) */
const DEFAULTS_WINDOW_DAYS = 30;
/**
 * Kalkulyatordagi "Saqlash kunlari" maydonining chegarasi (saytdagi maydon
 * ham 365 gacha). Ilgari 60 edi: aylanmasi 60 kundan oshgan — ya'ni Uzum
 * tarifida PULLIK — tovarda kunlar 60 da to'xtab, bir donaga saqlash bir
 * necha baravar kam chiqardi (2026-10-24).
 */
const MAX_STORAGE_DAYS = 365;
/** Sotuv yo'q va aylanma noma'lum bo'lganda "Saqlash kunlari" taxmini */
const NO_SALES_STORAGE_DAYS = 20;
/** Aylanma oynasidan oldingi oxirgi FBO qoldig'i shu chuqurlikda qidiriladi (storage-turnover.ts bilan bir xil) */
const TURNOVER_SEED_DAYS = 30;

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

/** "Saqlash kunlari" — butun kun, 1..365 */
const clampDays = (days: number): number => Math.min(MAX_STORAGE_DAYS, Math.max(1, Math.round(days)));

interface SkuTurnover {
  /** Aylanma, kun: oynada sotuv yo'q — Infinity (qo'llanmadagi 361+ guruh), FBO qoldiq yo'q — 0 */
  days: number;
  /** Oynadagi o'rtacha FBO qoldig'i, dona */
  avgStock: number;
  /** Oynadagi o'rtacha kunlik sotuv, dona */
  avgDaily: number;
}

/**
 * Bitta SKU aylanmasi — Uzum qo'llanmasidagi formula (shared tariffs.ts):
 * oxirgi 15 TUGAGAN savdo kunidagi o'rtacha FBO qoldig'i ÷ o'rtacha kunlik
 * sotuv. Ta'riflar Saqlash sahifasidagi bilan bir xil
 * (services/storage-turnover.ts): pullik saqlash faqat Uzum omboridagi (FBO)
 * tovarga olinadi; bugun hali tugamagan; yozuvsiz kun — oldingi ma'lum qoldiq;
 * bekor qilingan va qaytarilgan pozitsiyalar sotuvga kirmaydi; o'rtacha
 * sotuv = oynadagi dona ÷ 15.
 *
 * ATAYLAB bitta SKU uchun alohida yengil so'rov: kalkulyator har SKU
 * tanlanganda chaqiradi, butun katalog aylanmasini yig'ish shart emas.
 */
async function skuTurnover(skuId: string, currentFbo: number, now = new Date()): Promise<SkuTurnover> {
  const todayKey = toBusinessDate(now);
  // Qoldiq yozuvlari sanasi — kunning UTC yarim tuni (importer `dayStart`)
  const today = parseISODate(todayKey);
  const windowFrom = addDays(today, -TURNOVER_WINDOW_DAYS);
  const fromKey = toISODate(windowFrom);

  const [snaps, items] = await Promise.all([
    prisma.stockSnapshot.findMany({
      where: { skuId, date: { gte: addDays(windowFrom, -TURNOVER_SEED_DAYS), lt: today } },
      select: { date: true, fbo: true },
      orderBy: { date: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: { skuId, orderedAt: { gte: businessDayStart(fromKey), lt: businessDayStart(todayKey) } },
      select: { qty: true, status: true, returnedAt: true },
    }),
  ]);

  let seed: number | null = null;
  const byDay = new Map<string, number>();
  for (const s of snaps) {
    const key = toISODate(s.date);
    if (key < fromKey) seed = s.fbo;
    else byDay.set(key, s.fbo);
  }
  const history: number[] = [];
  let have = seed;
  for (let i = 0; i < TURNOVER_WINDOW_DAYS; i += 1) {
    const v = byDay.get(toISODate(addDays(windowFrom, i)));
    if (v !== undefined) have = v;
    if (have !== null) history.push(have);
  }

  let sold = 0;
  for (const it of items) {
    if (it.status === 'canceled' || it.status === 'returned' || it.returnedAt) continue;
    sold += it.qty;
  }

  // Oynada birorta ma'lum kun yo'q (do'kon yaqinda ulangan) — hozirgi qoldiq o'rtacha deb olinadi
  const avgStock = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : currentFbo;
  const avgDaily = sold / TURNOVER_WINDOW_DAYS;
  return { days: turnoverDays(avgStock, avgDaily), avgStock, avgDaily };
}

/**
 * Bitta SKU uchun bir dona tovarning iqtisodi.
 * Sotuv bo'lgan bo'lsa — haqiqiy komissiya/logistika, aks holda kompaniya o'rtachasi.
 */
function buildRow(
  info: SkuInfo,
  agg: (SalesAgg & { adFee?: number }) | undefined,
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
  /*
   * Sotuvsiz SKU'da — Uzum tarifi bo'yicha, hajmidan (tariffs.ts). Ilgari
   * kompaniya o'rtachasi olinardi: 28 litrlik gilam ham, 0,2 litrlik kabel
   * ham bir xil logistika "to'lardi" (2026-10-24). Hajm noma'lum bo'lsa —
   * o'sha o'rtacha.
   */
  const logistics =
    hasSales && agg ? safeDiv(agg.logistics, units) : (logisticsFee(info.volumeL) ?? fallback.logistics);
  /**
   * Qo'shimcha xarajat bitta manbadan olinadi: sotuv bo'lsa — buyurtma
   * satrlaridagi qiymat, aks holda katalogdagi qiymat. Ilgari ikkalasi
   * qo'shilib, bir dona uchun xarajat oshib ketardi.
   */
  const extraCost = hasSales && agg ? safeDiv(agg.otherCost, units) : info.extraCost;
  /**
   * Shu mahsulotning reklama to'lovi, bir donaga. Tovarga sarflangan pul emas
   * (ROI maxrajiga kirmaydi), lekin foydadan ayriladi — aks holda reklama bilan
   * sotilayotgan tovarning marjasi haqiqiydan baland ko'rinardi.
   */
  const adPerUnit = hasSales && agg ? safeDiv(agg.adFee ?? 0, units) : 0;
  const otherCost = extraCost + adPerUnit;

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
    // Qadoq va bir donaga qo'shimcha xarajat — tovarga sarflangan pul (ROI maxrajida)
    packaging: extraCost,
    otherCost: adPerUnit,
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
    investment: (info.purchasePrice + extraCost) * units,
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
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      storageBySku(storeIds, range.from, range.toExclusive),
    ]);
    // Arxivdagi/yashirilgan, lekin davrda sotilgan SKU ham jamlamaga kiradi
    await withSoldSkus(catalog, sales.keys(), storeIds);

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

    // Qidiruv — umumiy qoida (services/common.ts skuInfoMatches): nom, SKU kodi, shtrix-kod, Uzum ID yoki havola
    const search = range.search;
    const rows: UnitEconomicsRow[] = [];
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalInvestment = 0;

    for (const info of catalog.values()) {
      if (search && !skuInfoMatches(info, search)) continue;
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
  /**
   * Qaysi qiymat qayerdan olingani — kalkulyator maydon yonida belgi
   * ("Uzum tarifi" / "Sizning ma'lumotingiz" / "Taxmin") va izohda formula
   * ko'rsatadi:
   *  - 'sales'     — shu SKU'ning oxirgi 30 kundagi sotuvi;
   *  - 'company'   — kompaniya bo'yicha o'rtacha (shu SKU sotilmagan);
   *  - 'catalogue' — Uzum kartochkasidagi qiymat (komissiya foizi, oylik saqlash);
   *  - 'tariff'    — Uzum qo'llanmasidagi tarif (tariffs.ts): logistika hajmdan,
   *                  saqlash hajm va aylanmadan;
   *  - 'fees'      — Uzum haqiqatda ushlagan saqlash to'lovlari;
   *  - 'none'      — Uzum omborida (FBO) qoldiq yo'q, saqlash olinmaydi;
   *  - 'turnover' / 'stock' — saqlash kunlari aylanmadan / qoldiq ÷ sotuvdan;
   *  - 'default'   — ma'lumot yetarli emas, umumiy taxmin.
   * Ilgari 'sales' kompaniya o'rtachasini ham anglatardi, 'volume' esa 120
   * so'm/l/kun taxmini edi (2026-10-24).
   */
  source: {
    commission: 'sales' | 'company' | 'catalogue' | 'default';
    logistics: 'sales' | 'tariff' | 'company' | 'default';
    storage: 'fees' | 'catalogue' | 'tariff' | 'none' | 'default';
    storageDays: 'turnover' | 'stock' | 'default';
    buyout: 'sales' | 'default';
  };
  /** Izohdagi formulalar uchun raqamlar */
  basis: UnitDefaultsBasis;
}

interface UnitDefaultsBasis {
  /** Kartochkadagi hajm, litr (0 — o'lcham yo'q) */
  volumeL: number;
  /** Uzum hisoblaydigan litr (yuqoriga yaxlitlangan); hajm noma'lum — 0 */
  billableL: number;
  category: string | null;
  /** Saqlash tarifi turi — toifa nomidan (taxminiy moslik) */
  tariffKind: StorageTariffKind;
  /** Uzum tarifi bo'yicha bir dona logistikasi; hajm noma'lum — null */
  logisticsTariff: number | null;
  /** Shu SKU'ning oxirgi 30 kundagi sotuvi, dona */
  units30: number;
  /** Qoldiq hozir: Uzum omborida (FBO) va jami */
  fbo: number;
  stock: number;
  /** Aylanma (oxirgi 15 kun, FBO): null — sotuv yo'q (361+ guruh); FBO qoldiq yo'q — 0 */
  turnoverDays: number | null;
  avgStock15: number;
  avgDaily15: number;
  /** Uzum kartochkasidagi bir dona uchun oylik saqlash (0 — bermagan) */
  storagePerItemMonth: number;
  /** Yangi SKU bepul davri (30 yoki 60 kun) va undan qolgan kun; yoshi noma'lum yoki o'tib ketgan — 0 */
  newSkuFreeDays: number;
  newSkuFreeLeft: number;
}

router.get(
  '/defaults',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    // Standart qiymatlar oxirgi 30 kunlik statistika asosida hisoblanadi
    const toExclusive = addDays(businessDayStart(toBusinessDate(new Date())), 1);
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
    const commissionSource: UnitDefaultsResponse['source']['commission'] = commissionFromSku
      ? 'sales'
      : info?.commissionPct
        ? 'catalogue'
        : commissionFromCompany
          ? 'company'
          : 'default';

    /*
     * Logistika (bir dona uchun): shu SKU sotuvi → Uzum tarifi (hajmdan) →
     * kompaniya o'rtachasi → o'lchangan mediana. Haqiqiy sotuv tarifdan
     * oldin turadi: Uzum tovarni boshqa o'lchamda hisoblasa (VGH), sotuvchi
     * aynan shuni to'laydi.
     */
    const logisticsTariff = info ? logisticsFee(info.volumeL) : null;
    const logisticsFromSku = agg && units > 0 ? agg.logistics / units : 0;
    const logisticsFromCompany = allUnits > 0 ? allLogistics / allUnits : 0;
    const logistics = logisticsFromSku || logisticsTariff || logisticsFromCompany || DEFAULTS.logisticsPerUnit;
    const logisticsSource: UnitDefaultsResponse['source']['logistics'] = logisticsFromSku
      ? 'sales'
      : logisticsTariff
        ? 'tariff'
        : logisticsFromCompany
          ? 'company'
          : 'default';

    /*
     * Saqlash (bir dona, kuniga): Uzum ushlagan to'lov → Uzum kartochkasidagi
     * oylik to'lov → Uzum tarifi: hajm × aylanma bo'yicha stavka (tariffs.ts,
     * 01.06.2026 dan; 60 kungacha bepul). Ilgari oxirgisi hajm × 120 so'm edi —
     * o'lchanmagan va ~10 baravar katta stavka, bepul davrsiz (2026-10-24).
     */
    const fee = info ? storage.get(info.id) : undefined;
    const stockInfo = info ? stocks.get(info.id) : undefined;
    const fbo = stockInfo?.fbo ?? 0;
    const stock = stockInfo?.total ?? 0;
    const tariffKind = storageTariffKind(info?.category);
    const turnover = info && fbo > 0 ? await skuTurnover(info.id, fbo) : null;
    let storagePerDay = 0;
    let storageSource: UnitDefaultsResponse['source']['storage'] = 'default';
    if (fee && fee.qtyDays > 0) {
      storagePerDay = fee.amount / fee.qtyDays;
      storageSource = 'fees';
    } else if (info && info.storagePerItem > 0) {
      // Uzumning o'z hisobi — oylik, kunlikka bo'linadi
      storagePerDay = info.storagePerItem / 30;
      storageSource = 'catalogue';
    } else if (info && !turnover) {
      // Uzum omborida qoldiq yo'q (FBS yoki tugagan) — saqlash to'lovi olinmaydi
      storageSource = 'none';
    } else if (info && turnover && billableLiters(info.volumeL) > 0) {
      storagePerDay = storageFeePerDay({ units: 1, volumeL: info.volumeL, turnover: turnover.days, kind: tariffKind });
      storageSource = 'tariff';
    }

    /*
     * Saqlash muddati — dona omborda necha kun turadi. Tarif bo'yicha
     * hisoblanganda — aylanmaning o'zi: stavka ham shu kunlardan chiqadi
     * (kalkulyator maydon o'zgarsa stavkani shu qoida bilan qayta hisoblaydi).
     * Sotuv yo'q (aylanma cheksiz) — 365. Aks holda qoldiq necha kunga yetadi.
     */
    const avgDaily = units / DEFAULTS_WINDOW_DAYS;
    let storageDays = avgDaily > 0 ? clampDays(stock / avgDaily) : NO_SALES_STORAGE_DAYS;
    let storageDaysSource: UnitDefaultsResponse['source']['storageDays'] = avgDaily > 0 ? 'stock' : 'default';
    if (storageSource === 'tariff' && turnover) {
      storageDays = Number.isFinite(turnover.days) ? clampDays(turnover.days) : MAX_STORAGE_DAYS;
      storageDaysSource = 'turnover';
    }

    /*
     * Yangi SKU: Uzum sotuvdagi birinchi 30 kunda (ayrim toifalarda 60)
     * aylanmadan qat'i nazar saqlash olmaydi. Kalkulyator "kunlik to'lov ×
     * kunlar" oladi, shuning uchun qolgan bepul kunlar kunlik summaga o'rtacha
     * bo'lib kiradi: jami = pullik kunlar × stavka. Yoshi Saqlash sahifasidagi
     * qoida bilan aniqlanadi; noma'lum bo'lsa bepul davr qo'llanmaydi.
     * Ilgari bepul davr kalkulyatorda umuman hisobga olinmasdi (2026-10-24).
     */
    const newSkuFreeDays = hasExtendedNewSkuFree(info?.category) ? NEW_SKU_FREE_DAYS.extended : NEW_SKU_FREE_DAYS.default;
    let newSkuFreeLeft = 0;
    if (storageSource === 'tariff' && info) {
      const age = await skuAgeOnSale(info);
      if (age.ageKnown) newSkuFreeLeft = Math.max(0, newSkuFreeDays - age.daysOnSale);
      if (newSkuFreeLeft > 0) storagePerDay = (storagePerDay * Math.max(0, storageDays - newSkuFreeLeft)) / storageDays;
    }

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
      // Uzum qaytgan tovar uchun logistika olmaydi — yig'im qaytariladi (qo'llanma,
      // 3.tariffs). Ilgari bu yerda to'g'ri logistikaning 75% i taxmin qilinardi.
      returnLogistics: 0,
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
        storageDays: storageDaysSource,
        buyout: buyoutSource,
      },
      basis: {
        volumeL: round(info?.volumeL ?? 0, 3),
        billableL: billableLiters(info?.volumeL),
        category: info?.category ?? null,
        tariffKind,
        logisticsTariff,
        units30: units,
        fbo,
        stock,
        turnoverDays: turnover ? (Number.isFinite(turnover.days) ? turnover.days : null) : 0,
        avgStock15: round(turnover?.avgStock ?? 0, 1),
        avgDaily15: round(turnover?.avgDaily ?? 0, 2),
        storagePerItemMonth: round(info?.storagePerItem ?? 0),
        newSkuFreeDays,
        newSkuFreeLeft,
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
