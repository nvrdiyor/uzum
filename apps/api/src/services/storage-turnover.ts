/**
 * Pullik saqlash — AYLANMA bo'yicha tahlil (GET /api/v1/warehouse/storage/turnover).
 *
 * Uzum qo'llanmasi (01.06.2026 dan, packages/shared/src/tariffs.ts): saqlash
 * qabul qilingan kundan emas, AYLANMADAN hisoblanadi —
 *   aylanma = oxirgi 15 kundagi o'rtacha kunlik qoldiq ÷ o'rtacha kunlik sotuv
 * (dona, yuqoriga yaxlitlanadi). 60 kungacha bepul, keyin 12 / 18 / 24
 * so'm/litr/kun (imtiyozli toifalarda 12 / 14 / 18), bir dona uchun kuniga
 * 5 000 (3 000) so'mdan oshmaydi. To'lov har kuni JORIY qoldiqdan olinadi.
 *
 * Uzum aylanmani API'da bermaydi — hammasi o'z bazamizdan. Ta'riflar:
 *
 *  • Qoldiq — faqat FBO (StockSnapshot.fbo): pullik saqlash Uzum omboridagi
 *    tovarga olinadi. FBS (sotuvchi omboridan jo'natiladigan) va `own`
 *    (o'z ombori) kirmaydi.
 *  • Oyna — tugagan 15 savdo kuni (Toshkent): [bugun − 15, kecha]. Bugun
 *    hali tugamagan: uning chala sotuvi tezlikni pasaytirib, aylanmani
 *    oshirib ko'rsatardi.
 *  • O'rtacha qoldiq — oynaning har kuni uchun o'sha kungi yozuv, yozuv
 *    bo'lmasa oldingi ma'lum qiymat (services/demand.ts kabi). Do'kon hali
 *    kuzatilmagan kunlar (do'konning birinchi qoldiq yozuvidan oldin) hisobga
 *    KIRMAYDI: kecha ulangan do'konda "14 kun 0 dona" degan soxta o'rtacha
 *    chiqmasin. Do'kon kuzatilgan, lekin SKU yozuvi yo'q kun — 0 dona.
 *  • Sotuv — ilovaning boshqa joylaridagi ta'rif (services/demand.ts,
 *    common.ts aggregateSales): bekor qilingan va qaytarilgan pozitsiyalar
 *    kirmaydi, sxema (FBO/FBS) ajratilmaydi. O'rtacha = oynadagi dona ÷ 15 —
 *    qo'llanmadagi formula. Rejalashtiruvchining "sotuvda bo'lgan kunlar"
 *    tuzatishi ATAYLAB qo'llanmaydi: to'lov Uzum formulasi bilan olinadi.
 *  • Sotuvda necha kun (yangi SKU bepul davri) — eng erta dalil: SKU
 *    katalogga tushgan kun yoki birinchi buyurtma. Do'kon ulangan paytda bor
 *    bo'lgan SKU'ning Uzumdagi haqiqiy yoshi noma'lum (Sku.createdAt — bizning
 *    birinchi sinxron sanasi), shuning uchun unga bepul davr QO'LLANMAYDI:
 *    to'lovni yashirib "bepul" deyishdan ko'rsatib, belgilab qo'ygan halolroq.
 *    Ulangandan keyin paydo bo'lgan SKU'da sana aniq (sinxron oralig'i aniqligida).
 *  • Hajm — Sku.volumeL; 0 bo'lsa summa o'ylab topilmaydi (status no_volume).
 *  • 30 kunlik prognoz — joriy sur'atda (oynadagi o'rtacha sotuv) va yangi
 *    yetkazmasiz: qoldiq kuniga shuncha kamayadi, aylanma har kuni sirpanuvchi
 *    15 kunlik oynadan qayta hisoblanadi, bepul davr tugashi ham hisobga olinadi.
 *
 * Telegram bot (apps/bot/src/jobs/stock-alert.ts) AYNAN shu qoidalarni
 * takrorlaydi — bot API'ni import qila olmaydi. Bu yerda qoida o'zgarsa,
 * u yerda ham o'zgartiring.
 *
 * Uzum haqiqatda ushlagan to'lov (StorageFee) yonma-yon qaytariladi —
 * prognoz va haqiqiy summa farqi darhol ko'rinadi (2026-10-24).
 */
import { prisma } from '@savdoiq/db';
import {
  FREE_TURNOVER_DAYS,
  NEW_AFTER_CONNECT_MS,
  NEW_SKU_FREE_DAYS,
  STORAGE_TARIFF,
  TARIFF_EFFECTIVE_FROM,
  TURNOVER_WINDOW_DAYS,
  addDays,
  billableLiters,
  businessDayStart,
  daysBetween,
  hasExtendedNewSkuFree,
  parseISODate,
  parseSkuQuery,
  round,
  skuSaleAge,
  storageFeePerDay,
  storageRatePerLiterDay,
  storageTariffKind,
  toBusinessDate,
  toISODate,
  turnoverDays,
  type SkuSaleAgeInput,
  type StorageTariffKind,
  type StorageTurnoverResponse,
  type StorageTurnoverRow,
  type StorageTurnoverStatus,
  type StorageTurnoverTier,
} from '@savdoiq/shared';
import { getSkuCatalog, skuInfoMatches } from './common.js';

/** "Tez orada pullik": aylanma shu kundan 60 gacha — hali bepul, lekin chegaraga yaqin */
export const NEAR_TURNOVER_DAYS = 45;
/** Prognoz ufqi, kun (bugun ham kiradi) */
export const PROJECTION_DAYS = 30;
/** Oynadan oldingi oxirgi qoldiq shu chuqurlikda qidiriladi (demand.ts bilan bir xil) */
const SEED_LOOKBACK_DAYS = 30;
/** Uzum haqiqatda ushlagan to'lov — oxirgi shuncha kun (bugun ham kiradi) */
const ACTUAL_DAYS = 30;
/** Javobdagi qatorlar chegarasi — jadval cheksiz o'smasin (jamlar baribir hammasi bo'yicha) */
const MAX_ROWS = 2000;
/** Ortiqcha donani yaxlitlashda suzuvchi nuqta xatosi (3,0000001 → 4) bo'lmasin */
const EPS = 1e-6;
/** `in` ro'yxati bo'laklari (SQLite o'zgaruvchilar chegarasi) */
const IN_CHUNK = 500;

/** Jadval tartibi: avval pul ketayotgani, keyin xavf ostidagisi */
const STATUS_RANK: Record<StorageTurnoverStatus, number> = { paid: 0, no_volume: 1, near: 2, new_free: 3, free: 4 };
const TIERS: StorageTurnoverTier[] = ['free', 'tier1', 'tier2', 'tier3'];

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Aylanma guruhi — chegaralar tariffs.ts dagi jadvaldan (ikkala tarif turida bir xil) */
export function tierOf(turnover: number): StorageTurnoverTier {
  const i = STORAGE_TARIFF.standard.tiers.findIndex((t) => turnover <= t.upTo);
  return TIERS[i] ?? 'tier3';
}

export interface TurnoverInput {
  /** Hozirgi FBO qoldig'i, dona */
  stock: number;
  /** Oynaning ma'lum kunlaridagi FBO qoldig'i, xronologik (oxirgisi — kecha) */
  history: number[];
  /** Oynada sotilgan dona */
  sold: number;
  volumeL: number;
  category: string | null;
  /** Bugun holatiga sotuvda necha kun */
  daysOnSale: number;
  /** Yoshi aniq — faqat shunda yangi SKU bepul davri qo'llanadi */
  ageKnown: boolean;
}

export interface TurnoverResult {
  kind: StorageTariffKind;
  avgStock: number;
  avgDaily: number;
  /** Cheksiz — oynada sotuv yo'q */
  turnover: number;
  tier: StorageTurnoverTier;
  liters: number;
  rate: number;
  perItemDay: number | null;
  status: StorageTurnoverStatus;
  feeToday: number | null;
  fee30d: number | null;
  paidFromDay: number | null;
  excessUnits: number;
  freeDays: number;
}

/**
 * Bitta SKU bo'yicha aylanma, holat va prognoz. Faqat sof hisob — baza yo'q,
 * shuning uchun alohida sinab ko'rish oson.
 */
export function analyzeTurnover(inp: TurnoverInput): TurnoverResult {
  const kind = storageTariffKind(inp.category);
  const extended = hasExtendedNewSkuFree(inp.category);
  const freeDays = extended ? NEW_SKU_FREE_DAYS.extended : NEW_SKU_FREE_DAYS.default;
  const liters = billableLiters(inp.volumeL);
  const cap = STORAGE_TARIFF[kind].capPerItemDay;

  const avgDaily = inp.sold / TURNOVER_WINDOW_DAYS;
  // Oynada birorta ma'lum kun yo'q (do'kon bugun ulangan) — hozirgi qoldiq o'rtacha deb olinadi
  const avgStock = inp.history.length > 0 ? mean(inp.history) : inp.stock;
  const turnover = turnoverDays(avgStock, avgDaily);
  const rate = storageRatePerLiterDay(turnover, kind);

  /** k kundan keyin sotuvda necha kun; yoshi noma'lum bo'lsa null — tariffs.ts bepul davrni tekshirmaydi */
  const onSaleAt = (k: number): number | null => (inp.ageKnown ? inp.daysOnSale + k : null);
  const freeAt = (k: number): boolean => {
    const d = onSaleAt(k);
    return d !== null && d < freeDays;
  };

  let status: StorageTurnoverStatus;
  if (freeAt(0)) status = 'new_free';
  else if (turnover <= FREE_TURNOVER_DAYS) status = turnover >= NEAR_TURNOVER_DAYS ? 'near' : 'free';
  else status = liters > 0 ? 'paid' : 'no_volume';

  /*
   * Prognoz: k-kuni qoldiq = hozirgi − sur'at × k (kutilgan qiymat, kasrli
   * dona — summa oxirida yaxlitlanadi). k-kunning aylanmasi k−15 … k−1
   * kunlar bo'yicha: o'tgan kunlar — haqiqiy tarix, keyingilari — prognoz.
   */
  const series = [...inp.history];
  let total = 0;
  let paidFromDay: number | null = null;
  for (let k = 0; k < PROJECTION_DAYS; k += 1) {
    if (k > 0) series.push(Math.max(0, inp.stock - avgDaily * (k - 1)));
    const units = Math.max(0, inp.stock - avgDaily * k);
    const recent = series.slice(-TURNOVER_WINDOW_DAYS);
    const t = k === 0 ? turnover : turnoverDays(recent.length > 0 ? mean(recent) : inp.stock, avgDaily);
    if (paidFromDay === null && units > 0 && !freeAt(k) && storageRatePerLiterDay(t, kind) > 0) paidFromDay = k;
    total += storageFeePerDay({
      units,
      volumeL: inp.volumeL,
      turnover: t,
      kind,
      daysOnSale: onSaleAt(k),
      extendedNewSkuFree: extended,
    });
  }

  const feeToday =
    status === 'no_volume'
      ? null
      : round(
          storageFeePerDay({
            units: inp.stock,
            volumeL: inp.volumeL,
            turnover,
            kind,
            daysOnSale: onSaleAt(0),
            extendedNewSkuFree: extended,
          }),
        );

  return {
    kind,
    avgStock,
    avgDaily,
    turnover,
    tier: tierOf(turnover),
    liters,
    rate,
    perItemDay: liters > 0 ? Math.min(liters * rate, cap) : null,
    status,
    feeToday,
    // Hajm noma'lum va 30 kun ichida pullik bo'ladi — summa o'ylab topilmaydi
    fee30d: liters === 0 && paidFromDay !== null ? null : round(total),
    paidFromDay,
    excessUnits: Math.max(0, Math.ceil(inp.stock - FREE_TURNOVER_DAYS * avgDaily - EPS)),
    freeDays,
  };
}

const zeroByStatus = (): Record<StorageTurnoverStatus, number> => ({
  free: 0,
  near: 0,
  paid: 0,
  new_free: 0,
  no_volume: 0,
});

function emptyResponse(date: string, from: string, to: string): StorageTurnoverResponse {
  return {
    date,
    window: { from, to },
    rules: {
      freeTurnoverDays: FREE_TURNOVER_DAYS,
      nearFromDays: NEAR_TURNOVER_DAYS,
      windowDays: TURNOVER_WINDOW_DAYS,
      projectionDays: PROJECTION_DAYS,
      effectiveFrom: TARIFF_EFFECTIVE_FROM,
    },
    totals: {
      skus: 0,
      byStatus: zeroByStatus(),
      feeToday: 0,
      fee30d: 0,
      fee30dByStatus: zeroByStatus(),
      excessUnits: 0,
      actual30d: 0,
      actualLastDay: 0,
      actualLastDate: null,
    },
    rows: [],
  };
}

interface SkuSnaps {
  /** Oynadan oldingi oxirgi qoldiq */
  seed: number | null;
  /** Oyna kunlari: 'YYYY-MM-DD' → FBO */
  days: Map<string, number>;
  /** Bugungi yozuv */
  today: number | null;
}

/**
 * FBO qoldig'i bor har bir SKU bo'yicha aylanma tahlili.
 *
 * Jamlar (`totals`) BUTUN ro'yxat bo'yicha, `search` faqat qatorlarni
 * saralaydi — kartochkalar qidiruvga qarab sakramasin. `totals.excessUnits`
 * — hozir to'lov olinayotgan (paid, no_volume) SKU'lar ortiqchasi.
 */
type StockFirsts = NonNullable<SkuSaleAgeInput['stock']>;

/**
 * SKU qoldig'i birinchi yozilgan kun va sotuvga yaroqli (FBO yoki FBS)
 * qoldiq birinchi paydo bo'lgan kun — `skuSaleAge` ning "ulanganda qoldiq
 * nol edi" holati uchun. Bot (jobs/stock-alert.ts) xuddi shu so'rovni qiladi.
 */
export async function loadStockFirsts(skuIds: string[]): Promise<Map<string, StockFirsts>> {
  const out = new Map<string, StockFirsts>();
  for (let i = 0; i < skuIds.length; i += IN_CHUNK) {
    const chunk = skuIds.slice(i, i + IN_CHUNK);
    const [seen, onSale] = await Promise.all([
      prisma.stockSnapshot.groupBy({ by: ['skuId'], where: { skuId: { in: chunk } }, _min: { date: true } }),
      prisma.stockSnapshot.groupBy({
        by: ['skuId'],
        where: { skuId: { in: chunk }, OR: [{ fbo: { gt: 0 } }, { fbs: { gt: 0 } }] },
        _min: { date: true },
      }),
    ]);
    const firstOnSale = new Map(onSale.map((r) => [r.skuId, r._min.date ?? undefined]));
    for (const r of seen) {
      if (r._min.date) out.set(r.skuId, { firstSeen: r._min.date, firstOnSale: firstOnSale.get(r.skuId) });
    }
  }
  return out;
}

/** `skuSaleAge` bitta SKU uchun — kalkulyator butun katalog aylanmasini yig'masin */
export async function skuAgeOnSale(
  sku: { id: string; storeId: string; createdAt: Date },
  now = new Date(),
): Promise<{ daysOnSale: number; ageKnown: boolean }> {
  const [start, first, stock] = await Promise.all([
    // getSkuCatalog(…, true) dagi to'plam: arxivdagisi ham, yashirilgan mahsulotning arxivdagisi emas
    prisma.sku.aggregate({
      where: { storeId: sku.storeId, NOT: { archived: true, product: { hidden: true } } },
      _min: { createdAt: true },
    }),
    prisma.orderItem.aggregate({ where: { skuId: sku.id }, _min: { orderedAt: true } }),
    loadStockFirsts([sku.id]),
  ]);
  const age = skuSaleAge({
    createdAt: sku.createdAt,
    storeCatalogStart: start._min.createdAt?.getTime(),
    firstOrder: first._min.orderedAt ?? undefined,
    stock: stock.get(sku.id),
    todayKey: toBusinessDate(now),
  });
  return { daysOnSale: age.daysOnSale, ageKnown: age.ageKnown };
}

export async function getStorageTurnover(
  storeIds: string[],
  opts: { now?: Date; search?: string } = {},
): Promise<StorageTurnoverResponse> {
  const now = opts.now ?? new Date();
  const todayKey = toBusinessDate(now);
  // Qoldiq va saqlash yozuvlari sanasi — kunning UTC yarim tuni (importer `dayStart`)
  const today = parseISODate(todayKey);
  const windowFrom = addDays(today, -TURNOVER_WINDOW_DAYS);
  const windowKeys = Array.from({ length: TURNOVER_WINDOW_DAYS }, (_, i) => toISODate(addDays(windowFrom, i)));
  const fromKey = windowKeys[0] as string;
  const toKey = windowKeys[windowKeys.length - 1] as string;

  const out = emptyResponse(todayKey, fromKey, toKey);
  if (storeIds.length === 0) return out;

  const [catalog, snaps, items, fees] = await Promise.all([
    // Arxivdagi SKU ham: Uzum omborida qoldig'i tursa, to'lov baribir olinadi
    getSkuCatalog(storeIds, true),
    prisma.stockSnapshot.findMany({
      where: { storeId: { in: storeIds }, date: { gte: addDays(windowFrom, -SEED_LOOKBACK_DAYS), lte: today } },
      select: { skuId: true, storeId: true, date: true, fbo: true },
      orderBy: { date: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: {
        orderedAt: { gte: businessDayStart(fromKey), lt: businessDayStart(todayKey) },
        order: { storeId: { in: storeIds } },
        skuId: { not: null },
      },
      select: { skuId: true, qty: true, status: true, returnedAt: true },
    }),
    prisma.storageFee.findMany({
      where: { storeId: { in: storeIds }, date: { gte: addDays(today, -(ACTUAL_DAYS - 1)), lte: today } },
      select: { skuId: true, date: true, amount: true },
    }),
  ]);

  // ── Qoldiq: do'kon qachondan kuzatiladi va SKU kesimida kunlar ──
  const storeFirst = new Map<string, string>();
  const bySku = new Map<string, SkuSnaps>();
  for (const s of snaps) {
    const key = toISODate(s.date);
    // Sana bo'yicha o'sish tartibida — birinchisi eng erta
    if (!storeFirst.has(s.storeId)) storeFirst.set(s.storeId, key);
    const cur = bySku.get(s.skuId) ?? { seed: null, days: new Map<string, number>(), today: null };
    if (key < fromKey) cur.seed = s.fbo;
    else if (key <= toKey) cur.days.set(key, s.fbo);
    else cur.today = s.fbo;
    bySku.set(s.skuId, cur);
  }

  // ── Sotuv: ilovadagi yagona ta'rif (bekor va qaytarilganlarsiz) ──
  const soldBySku = new Map<string, number>();
  for (const it of items) {
    if (!it.skuId) continue;
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned || it.status === 'canceled') continue;
    soldBySku.set(it.skuId, (soldBySku.get(it.skuId) ?? 0) + it.qty);
  }

  // ── Uzum haqiqatda ushlagan to'lov ──
  const actualBySku = new Map<string, number>();
  const actualByDay = new Map<string, number>();
  let actual30d = 0;
  for (const f of fees) {
    actual30d += f.amount;
    const key = toISODate(f.date);
    actualByDay.set(key, (actualByDay.get(key) ?? 0) + f.amount);
    if (f.skuId) actualBySku.set(f.skuId, (actualBySku.get(f.skuId) ?? 0) + f.amount);
  }
  const actualLastDate = [...actualByDay.keys()].sort().at(-1) ?? null;

  // ── Do'konning birinchi katalog importi: undan keyin paydo bo'lgan SKU'ning yoshi aniq ──
  const catalogStart = new Map<string, number>();
  for (const info of catalog.values()) {
    const at = info.createdAt.getTime();
    const cur = catalogStart.get(info.storeId);
    if (cur === undefined || at < cur) catalogStart.set(info.storeId, at);
  }

  // Bugungi FBO qoldig'i va oyna tarixi
  interface Prepared {
    skuId: string;
    stock: number;
    history: number[];
    candidate: boolean;
  }
  const prepared: Prepared[] = [];
  for (const info of catalog.values()) {
    const snap = bySku.get(info.id);
    if (!snap) continue;
    const observedFrom = storeFirst.get(info.storeId);
    let have: number | null = snap.seed;
    const history: number[] = [];
    for (const key of windowKeys) {
      const v = snap.days.get(key);
      if (v !== undefined) have = v;
      if (have !== null) history.push(have);
      else if (observedFrom !== undefined && key >= observedFrom) history.push(0);
    }
    const stock = snap.today ?? have ?? 0;
    // Uzum omborida qoldiq yo'q — saqlash to'lovi ham yo'q
    if (stock <= 0) continue;
    const start = catalogStart.get(info.storeId);
    const candidate = start !== undefined && info.createdAt.getTime() - start > NEW_AFTER_CONNECT_MS;
    prepared.push({ skuId: info.id, stock, history, candidate });
  }

  /*
   * Ulanganda katalogda bor, lekin qoldig'i NOL bo'lgan va qoldiq keyin kelgan
   * SKU — o'sha kuni sotuvga chiqqan (shared skuSaleAge, 2-holat). Ilgari u
   * "yoshi noma'lum" bo'lib, yangi SKU bepul davri qo'llanmasdi (2026-10-27).
   */
  const stockFirsts = await loadStockFirsts(prepared.filter((p) => !p.candidate).map((p) => p.skuId));
  const arrivedLater = (skuId: string): boolean => {
    const s = stockFirsts.get(skuId);
    return Boolean(s?.firstOnSale && s.firstOnSale.getTime() > s.firstSeen.getTime());
  };

  // Birinchi buyurtma — yoshi aniqlanishi mumkin bo'lgan SKU'lar uchun (odatda bir nechta)
  const firstOrder = new Map<string, Date>();
  const candidates = prepared.filter((p) => p.candidate || arrivedLater(p.skuId)).map((p) => p.skuId);
  for (let i = 0; i < candidates.length; i += IN_CHUNK) {
    const rows = await prisma.orderItem.groupBy({
      by: ['skuId'],
      where: { skuId: { in: candidates.slice(i, i + IN_CHUNK) } },
      _min: { orderedAt: true },
    });
    for (const r of rows) {
      if (r.skuId && r._min.orderedAt) firstOrder.set(r.skuId, r._min.orderedAt);
    }
  }

  const rows: StorageTurnoverRow[] = [];
  const totals = out.totals;
  for (const p of prepared) {
    const info = catalog.get(p.skuId);
    if (!info) continue;
    const { sinceKey, daysOnSale, ageKnown } = skuSaleAge({
      createdAt: info.createdAt,
      storeCatalogStart: catalogStart.get(info.storeId),
      firstOrder: firstOrder.get(info.id),
      stock: stockFirsts.get(info.id),
      todayKey,
    });
    const sold = soldBySku.get(info.id) ?? 0;

    const r = analyzeTurnover({
      stock: p.stock,
      history: p.history,
      sold,
      volumeL: info.volumeL,
      category: info.category,
      daysOnSale,
      ageKnown,
    });

    const row: StorageTurnoverRow = {
      skuId: info.id,
      sku: info.sku,
      title: info.title,
      imageUrl: info.imageUrl,
      storeId: info.storeId,
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
      category: info.category,
      tariffKind: r.kind,
      stock: p.stock,
      avgStock: round(r.avgStock, 1),
      stockDays: p.history.length,
      sold,
      avgDaily: round(r.avgDaily, 2),
      turnoverDays: Number.isFinite(r.turnover) ? r.turnover : null,
      tier: r.tier,
      liters: r.liters,
      rate: r.rate,
      perItemDay: r.perItemDay,
      status: r.status,
      feeToday: r.feeToday,
      fee30d: r.fee30d,
      paidFromDay: r.paidFromDay,
      excessUnits: r.excessUnits,
      daysOnSale,
      ageKnown,
      newSkuFreeDays: r.freeDays,
      freeUntil:
        r.status === 'new_free' ? toISODate(addDays(parseISODate(sinceKey), r.freeDays - 1)) : null,
      actual30d: round(actualBySku.get(info.id) ?? 0),
    };
    rows.push(row);

    totals.skus += 1;
    totals.byStatus[row.status] += 1;
    if (row.feeToday !== null) totals.feeToday += row.feeToday;
    if (row.fee30d !== null) {
      totals.fee30d += row.fee30d;
      totals.fee30dByStatus[row.status] += row.fee30d;
    }
    if (row.status === 'paid' || row.status === 'no_volume') totals.excessUnits += row.excessUnits;
  }

  totals.actual30d = round(actual30d);
  totals.actualLastDate = actualLastDate;
  totals.actualLastDay = round(actualLastDate ? (actualByDay.get(actualLastDate) ?? 0) : 0);

  rows.sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const byFee = (b.fee30d ?? 0) - (a.fee30d ?? 0);
    if (byFee !== 0) return byFee;
    // Aylanmasi uzunroq (sotuvsiz — eng uzun) yuqorida
    const ta = a.turnoverDays ?? Number.POSITIVE_INFINITY;
    const tb = b.turnoverDays ?? Number.POSITIVE_INFINITY;
    // Ayirma emas, taqqoslash: Infinity − Infinity = NaN tartibni buzardi
    if (ta !== tb) return tb > ta ? 1 : -1;
    return b.stock - a.stock;
  });

  /*
   * Qidiruv — umumiy qoida (services/common.ts skuInfoMatches): nom, SKU kodi,
   * shtrix-kod, Uzum SKU / mahsulot ID'si yoki uzum.uz havolasi. Ilgari faqat
   * `${sku} ${title}`.toLowerCase() edi: "Cho'yan" (oddiy apostrof)
   * "Cho‘yan"ni, kartochkadagi "ID: 701009" esa hech narsani topmasdi (2026-10-24).
   */
  const query = parseSkuQuery(opts.search);
  const visible = query
    ? rows.filter((r) => {
        const info = catalog.get(r.skuId);
        return info ? skuInfoMatches(info, query) : false;
      })
    : rows;

  out.rows = visible.slice(0, MAX_ROWS);
  return out;
}
