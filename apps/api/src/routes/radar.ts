/**
 * "Mening radarim" — /api/v1/growth/radar
 *
 *  GET / → RadarResponse: sotuvchining O'Z SKU'lari bo'yicha besh signal —
 *          tezlashdi, sekinlashdi, yangi yulduzlar, tez orada tugaydi va
 *          qaytarish o'sdi. Har signalda eng muhim SKU'lar, signal ortidagi
 *          raqamlar bilan.
 *
 * FAQAT O'Z MA'LUMOTI. Bozor trendlari, raqobatchilar narxi yoki Uzum
 * vitrinasi ATAYLAB o'qilmaydi (scrape qilinmaydi): signal sotuvchining
 * bazamizdagi buyurtma va qoldiq yozuvlaridan. Shu sabab sahifa "bozorda nima
 * o'sayotgani" emas, "MENING tovarlarimdan qaysi biri o'zgardi" deydi (2026-10-24).
 *
 * DAVR TANLAGICHIGA BOG'LIQ EMAS (today.ts kabi): radar "hozir nima
 * o'zgaryapti" savoliga javob beradi. Hamma oyna OXIRGI TO'LIQ savdo kuni
 * (kecha, Toshkent) bilan tugaydi — bugungi yarim kunlik sotuv so'nggi 7
 * kunning tezligini sun'iy pasaytirib, har kuni ertalab hamma tovar
 * "sekinlashdi" bo'lib ko'rinardi. Do'kon filtri (?storeId) hisobga olinadi.
 *
 * TEZLIK — Rejalashtiruvchining o'z ta'rifi (services/demand.ts getDemand):
 * sotilgan dona ÷ tovar SOTUVDA BO'LGAN kunlar. Oddiy "dona ÷ kun" olinsa,
 * oldingi oynada tugab turgan tovar to'ldirilgach "tezlashdi" deb chiqardi.
 * getDemand kunlarni UTC sanasi bo'yicha ajratadi (Rejalashtiruvchi ham
 * shunday) — tezlik va "yetadi" kunlari /planner dagi bilan bir xil bo'lsin.
 *
 * QOIDALAR (chegaralar pastda, hammasi ATAYLAB ehtiyotkor — yolg'on signal
 * sotuvchini behuda tovar buyurtma qilishga yoki narx tushirishga undaydi):
 *  1. accelerating — so'nggi 7 kun tezligi oldingi 28 kunnikidan kamida +50%,
 *     7 kunda kamida 10 dona; oldingi oynada tovar kamida 14 kun sotuvda bo'lgan
 *     va kamida 4 dona sotilgan; farq tasodifiy tebranishdan katta (`beyondNoise`).
 *  2. slowing — tezlik kamida −40%, oldingi 28 kunda kamida 21 dona; so'nggi
 *     7 kunda tovar bir kun ham tugamagan va hozir qoldig'i bor (aks holda
 *     sabab — talab emas, qoldiq: u "Tez orada tugaydi" kartasida); farq
 *     tasodifiy tebranishdan katta. Sinxron kechagi kunni to'liq qamramasa —
 *     'stale': yo'q yozuv sekinlashish bo'lib ko'rinardi.
 *  3. newStars — birinchi sotuvi oxirgi 30 kun ichida, do'kon tarixida undan
 *     oldin kamida 30 kun bor (aks holda "yangi" emas, "tarix shu yerdan
 *     boshlanadi"); kamida 10 dona va tezligi do'kondagi eski SKU'lar
 *     tezligining yuqori choragida (P75).
 *  4. stockout — Rejalashtiruvchi qatori (services/plan.ts, kompaniyaning
 *     yetkazish muddati): 'critical' (tovar kelguncha tugaydi) va 'ending'
 *     (buyurtma kuni bir hafta ichida). Hisob qayta yozilmaydi — raqamlar
 *     /planner bilan bir xil.
 *  5. returnsRising — qaytarish ulushi (services/returns.ts ta'rifi: qaytgan
 *     ÷ (xaridor qabul qilgan + qaytgan), buyurtma sanasi bo'yicha) so'nggi 28
 *     kunda oldingi 28 kundan kamida 5 p.p. yuqori; har ikki oynada asos
 *     kamida 10 dona, so'nggisida kamida 3 ta qaytgan; ikki ulush farqi
 *     tasodifiy emas (`proportionsDiffer`). Ikkala oyna HOZIRGI holat bilan —
 *     Boshqaruv panelidagi qaytarish kartasi (returnsSummary.ts) sababi bilan.
 *
 * TAQQOSLASH TARIXI — services/pnl.ts comparablePeriod: oldingi oyna
 * saqlangan tarixdan (tarif chegarasi yoki birinchi sinxron) tashqarida
 * bo'lsa signal 'noHistory' — u yerdagi nol "sotuv bo'lmagan" emas, "ma'lumot yo'q".
 *
 * TARIF. Sahifa 'growth_radar' — faqat pullik tarifda, sinovda namuna
 * (2026-10-27; ilgari 'sales_analytics' edi). Kartalar o'z bo'limining tarifi bilan: "Tez orada tugaydi" — 'planner',
 * "Qaytarish o'sdi" — 'returns_report'. Faqat ko'rish uchun ('preview',
 * sinovdagi Rejalashtiruvchi) — eng muhim uchtasi, Rejalashtiruvchining o'z
 * namunasidagi kabi (`limited`); yopiq ('off') — 'locked': nechta SKU ekani
 * aytiladi, qatorlar berilmaydi (today.ts dagi qulflangan vazifalar kabi —
 * sotuvchi nimani yo'qotayotganini ko'radi).
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  addDays,
  businessDayStart,
  featureAccess,
  parseISODate,
  pct,
  round,
  toBusinessDate,
  toISODate,
  type PlannerRow,
  type RadarNewStarRow,
  type RadarResponse,
  type RadarReturnsRow,
  type RadarSignal,
  type RadarSkuRef,
  type RadarStockoutRow,
  type RadarThresholds,
  type RadarVelocityRow,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { getStoreIds, type SkuInfo } from '../services/common.js';
import { getDemand, type Demand } from '../services/demand.js';
import { NO_DEMAND, loadPlanData, planSku, planTable, variantOf } from '../services/plan.js';
import { comparablePeriod } from '../services/pnl.js';
import { realReason, splitLine } from '../services/returns.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Oynalar ───────────────────────────

/** So'nggi oyna, kun */
const RECENT_DAYS = 7;
/** Taqqoslash oynasi: 4 to'liq hafta — hafta kunlari mavsumiyligi (shanba-yakshanba cho'qqisi) ikkala oynada teng */
const BASE_DAYS = 28;
/** Kichik grafik — ikkala oyna birga */
const SPARK_DAYS = RECENT_DAYS + BASE_DAYS;
/**
 * Qaytarish oynasi: 7 kun emas, 28 kun. Qaytarish buyurtmadan bir necha
 * kun keyin keladi va bir SKU'da haftasiga 1–2 ta bo'ladi — 7 kunlik ulush
 * faqat shovqin bo'lardi.
 */
const RETURNS_DAYS = 28;
/** "Yangi" — birinchi sotuvidan beri ko'pi bilan shuncha kun */
const NEW_DAYS = 30;
/**
 * Do'kon tarixida birinchi sotuvdan OLDIN kamida shuncha kun bo'lishi kerak.
 * Do'kon 10 kun oldin ulangan bo'lsa, uning har bir SKU'si "10 kun oldin
 * birinchi marta sotilgan" bo'lib chiqadi — bu yangilik emas, tariximiz
 * shu kundan boshlanadi.
 */
const NEW_HISTORY_DAYS = 30;

// ─────────────────────────── Chegaralar ───────────────────────────

/** Tezlashish: so'nggi 7 kunda kamida shuncha dona — "1 → 3 dona, +200%" signal emas */
const ACCEL_MIN_UNITS = 10;
/** Tezlashish: tezlik kamida shuncha % oshgan */
const ACCEL_MIN_PCT = 50;
/** Tezlashish: oldingi 28 kunda kamida shuncha dona — asos juda kichik bo'lsa foiz ma'nosiz (+900%) */
const ACCEL_MIN_PREV_UNITS = 4;
/** Sekinlashish: oldingi 28 kunda kamida shuncha dona (kuniga ~0,75) — kam sotiladigan tovarda bo'sh hafta odatiy */
const SLOW_MIN_PREV_UNITS = 21;
/** Sekinlashish: tezlik kamida shuncha % tushgan */
const SLOW_MIN_PCT = 40;
/**
 * Oldingi oynada tovar kamida shuncha kun sotuvda bo'lgan: 28 kunning 20 kuni
 * tugab turgan tovarning "oldingi tezligi" 8 kundan chiqadi va ishonchsiz.
 */
const MIN_IN_STOCK_DAYS = 14;
/**
 * Tasodifiy tebranish. Kunlik dona soni Puasson taqsimotiga yaqin, lekin
 * buyurtmada 2–3 dona ham bo'ladi — dispersiya o'rtachadan ~1,5 barobar
 * katta. Farq √(1,5 × kutilgan) ning NOISE_Z barobaridan katta bo'lsagina
 * signal: kuniga 1 dona sotiladigan tovarda haftasiga 11 dona (+57%) hali
 * tasodif, 14 dona (+100%) — signal. Bu tekshiruvsiz faqat "+50%" chegarasi
 * qolsa, kuniga ~1 dona sotiladigan har o'ninchi SKU har hafta tasodifan
 * "tezlashdi" bo'lib chiqardi (Puasson: P(X ≥ 11 | 7) ≈ 0,1).
 */
const DISPERSION = 1.5;
const NOISE_Z = 2;
/** Yangi yulduz: kamida shuncha dona sotilgan */
const NEW_MIN_UNITS = 10;
/** Yangi yulduz tezligi — eski SKU'lar tezligining shu kvantili (yuqori chorak) */
const NEW_RATE_QUANTILE = 0.75;
/** Kvantil uchun kamida shuncha eski SKU; kam bo'lsa — kuniga 1 dona */
const NEW_RATE_MIN_SAMPLE = 4;
const NEW_FALLBACK_RATE = 1;
/** Qaytarish: har ikki oynada ulush asosi (qabul qilingan + qaytgan) kamida shuncha dona */
const RETURNS_MIN_BASE = 10;
/** Qaytarish: so'nggi oynada kamida shuncha qaytgan — "bitta qaytdi, ulush 10% ga o'sdi" signal emas */
const RETURNS_MIN_RETURNED = 3;
/** Qaytarish: ulush kamida shuncha foiz punkti o'sgan */
const RETURNS_MIN_PP = 5;
/** Ikki ulush farqi uchun z (bir tomonlama, ~2,3% tasodif) */
const RETURNS_Z = 2;
/** Har signalda eng ko'pi shuncha qator (sanoq — `count` da to'liq) */
const MAX_ROWS = 20;
/**
 * Bo'lim tarifda faqat ko'rish uchun ochiq bo'lsa — shuncha eng muhim qator.
 * Rejalashtiruvchining o'z namunasi (routes/planner.ts PREVIEW_ROWS) bilan
 * bir xil: sinovdagi sotuvchi o'sha sahifada ham aynan shu uchtasini ko'radi.
 */
const PREVIEW_ROWS = 3;
/**
 * Sinxron "eskirgan": oxirgi muvaffaqiyatli sinxron kechagi kun oxiridan
 * shuncha soatdan ko'p oldin tugagan. Bir necha soatlik kechikish 7 kunlik
 * tezlikni deyarli o'zgartirmaydi; bir-ikki kunlik uzilish esa (2026-10-22
 * da Uzum bir necha soat ishlamagan) har bir tovarni "sekinlashdi" qilardi.
 */
const STALE_HOURS = 6;

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Kuzatilgan dona kutilganidan tasodifiy tebranishdan ko'proq farq qiladimi (ikki tomonga ham) */
function beyondNoise(observed: number, expected: number): boolean {
  const sd = Math.sqrt(DISPERSION * Math.max(expected, 1));
  return Math.abs(observed - expected) >= NOISE_Z * sd;
}

/**
 * Ikki ulush farqi tasodifiy emasmi — umumiy ulush bilan z-test (bir
 * tomonlama: faqat o'sish). x — qaytgan, n — asos.
 */
function proportionsDiffer(x1: number, n1: number, x0: number, n0: number): boolean {
  const p = (x1 + x0) / (n1 + n0);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n0));
  if (!(se > 0)) return false;
  return (x1 / n1 - x0 / n0) / se >= RETURNS_Z;
}

/** Chiziqli kvantil (q ∈ [0, 1]); bo'sh ro'yxat — null */
function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] as number;
  const b = s[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** Bir oynadagi qaytarish holati (services/returns.ts `buildSummary` bilan bir xil bo'linish) */
interface ReturnsBucket {
  /** Xaridor qabul qilgan tirik dona */
  handed: number;
  returned: number;
  /** Qaytgan donalar summasi — sotuv narxi × dona (Uzum bunday satrda amount = 0 beradi) */
  amount: number;
  reasons: Map<string, number>;
}

const emptyReturns = (): ReturnsBucket => ({ handed: 0, returned: 0, amount: 0, reasons: new Map() });

const ITEM_SELECT = {
  skuId: true,
  qty: true,
  returnedQty: true,
  sellPrice: true,
  revenue: true,
  status: true,
  returnedAt: true,
  returnCause: true,
  orderedAt: true,
  order: { select: { deliveredAt: true } },
} as const satisfies Prisma.OrderItemSelect;

/** Do'konlarning birinchi saqlangan buyurtmasi — "yangi" SKU uchun tarix chuqurligi */
async function storeFirstOrders(storeIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (storeIds.length === 0) return out;
  const rows = await prisma.order.groupBy({
    by: ['storeId'],
    _min: { orderedAt: true },
    where: { storeId: { in: storeIds } },
  });
  for (const r of rows) if (r._min.orderedAt) out.set(r.storeId, r._min.orderedAt);
  return out;
}

/** SKU'larning bazadagi BIRINCHI sotuvi (bekor qilinganlarsiz — getAvgDaily'dagi qoida) */
async function firstSales(skuIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (skuIds.length === 0) return out;
  const rows = await prisma.orderItem.groupBy({
    by: ['skuId'],
    _min: { orderedAt: true },
    where: { skuId: { in: skuIds }, status: { not: 'canceled' } },
  });
  for (const r of rows) if (r.skuId && r._min.orderedAt) out.set(r.skuId, r._min.orderedAt);
  return out;
}

/** Oxirgi muvaffaqiyatli sinxron (Sozlamalar → sinxron tarixi bilan bir xil qoida: holati 'done') */
async function lastSuccessfulSync(companyId: string): Promise<Date | null> {
  const job = await prisma.syncJob.findFirst({
    where: { companyId, status: 'done' },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  return job?.finishedAt ?? null;
}

/** Eng ko'p uchragan sabab; teng bo'lsa alifbo bo'yicha — har so'rovda bir xil chiqsin */
function topReasonOf(reasons: Map<string, number>): string | null {
  let best: string | null = null;
  let bestQty = 0;
  for (const [raw, qty] of reasons) {
    if (qty > bestQty || (qty === bestQty && best !== null && raw < best)) {
      best = raw;
      bestQty = qty;
    }
  }
  return best;
}

const signal = <R>(state: RadarResponse['accelerating']['state'], count: number, rows: R[]): RadarSignal<R> => ({
  state,
  count,
  rows,
});

/**
 * Karta o'z bo'limining tarifi bilan: to'liq — hamma qator; faqat ko'rish
 * ('preview') — eng muhim PREVIEW_ROWS tasi va `limited`; yopiq — sanoq,
 * qatorsiz. Qaysi bo'lim ekanini chaqiruvchi beradi (today.ts KIND_FEATURE kabi).
 */
function gated<R>(access: ReturnType<typeof featureAccess>, rows: R[], count = rows.length): RadarSignal<R> {
  if (access === 'full') return signal('ready', count, rows.slice(0, MAX_ROWS));
  if (access === 'preview') {
    return { ...signal('ready', count, rows.slice(0, PREVIEW_ROWS)), limited: count > PREVIEW_ROWS };
  }
  return signal('locked', count, []);
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  // Faqat pullik tarifda: sinovda 402 'preview' — sayt namunani ko'rsatadi (2026-10-27).
  // Ilgari sales_analytics edi va radar sinovda ham to'liq ochiq turardi
  requireFeature('growth_radar'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const q = req.query as Record<string, string | undefined>;
    const storeId = q.storeId && q.storeId !== 'all' ? q.storeId : undefined;
    const storeIds = await getStoreIds(company.id, storeId);

    const now = new Date();
    const nowMs = now.getTime();
    const today = toBusinessDate(now);
    // Oxirgi to'liq savdo kuni — UTC yarim tuniga tenglashtirilgan sana (getDemand shu ko'rinishda kutadi)
    const asOfDate = addDays(parseISODate(today), -1);
    const asOf = toISODate(asOfDate);
    const iso = (offset: number): string => toISODate(addDays(asOfDate, offset));
    const windows: RadarResponse['windows'] = {
      recent: { from: iso(-(RECENT_DAYS - 1)), to: asOf },
      previous: { from: iso(-(SPARK_DAYS - 1)), to: iso(-RECENT_DAYS) },
      returnsRecent: { from: iso(-(RETURNS_DAYS - 1)), to: asOf },
      returnsPrevious: { from: iso(-(2 * RETURNS_DAYS - 1)), to: iso(-RETURNS_DAYS) },
      newSince: iso(-(NEW_DAYS - 1)),
    };
    const earliest = windows.returnsPrevious.from < windows.previous.from ? windows.returnsPrevious.from : windows.previous.from;

    const [planData, recentDemand, prevDemand, velocityCmp, returnsCmp, storeFirst, lastSync, items] = await Promise.all([
      // Faol katalog, qoldiq, yo'ldagi tovar va kompaniyaning yetkazish muddati — Rejalashtiruvchining o'zi
      loadPlanData(company.id, storeIds),
      getDemand(storeIds, RECENT_DAYS, asOfDate),
      getDemand(storeIds, BASE_DAYS, addDays(asOfDate, -RECENT_DAYS)),
      comparablePeriod(storeIds, windows.previous, plan),
      comparablePeriod(storeIds, windows.returnsPrevious, plan),
      storeFirstOrders(storeIds),
      lastSuccessfulSync(company.id),
      storeIds.length
        ? prisma.orderItem.findMany({
            where: {
              orderedAt: { gte: businessDayStart(earliest), lt: businessDayStart(today) },
              order: { storeId: { in: storeIds } },
              skuId: { not: null },
            },
            select: ITEM_SELECT,
          })
        : Promise.resolve([]),
    ]);

    // ── Kunlik sotuv (kichik grafik) va qaytarish oynalari — bitta o'qishdan ──
    const sparkStart = parseISODate(windows.previous.from).getTime();
    const daily = new Map<string, number[]>();
    const returns = new Map<string, { recent: ReturnsBucket; prev: ReturnsBucket }>();
    for (const it of items) {
      if (!it.skuId) continue;
      const day = toBusinessDate(it.orderedAt);
      // Kunlik dona — getDemand qoidasi: qaytgan va bekor qilingan satr sotuv emas
      const idx = Math.round((parseISODate(day).getTime() - sparkStart) / 86_400_000);
      const lost = it.status === 'returned' || Boolean(it.returnedAt) || it.status === 'canceled';
      if (idx >= 0 && idx < SPARK_DAYS && !lost) {
        const arr = daily.get(it.skuId) ?? new Array<number>(SPARK_DAYS).fill(0);
        arr[idx] = (arr[idx] ?? 0) + it.qty;
        daily.set(it.skuId, arr);
      }

      const win = day >= windows.returnsRecent.from ? 'recent' : day >= windows.returnsPrevious.from ? 'prev' : null;
      if (!win) continue;
      const s = splitLine(it);
      const pair = returns.get(it.skuId) ?? { recent: emptyReturns(), prev: emptyReturns() };
      const b = pair[win];
      const deliveredAt = it.order.deliveredAt;
      if (deliveredAt !== null && deliveredAt.getTime() <= nowMs) b.handed += s.live;
      if (s.kind === 'returned' && s.lost > 0) {
        b.returned += s.lost;
        b.amount += s.unitPrice * s.lost;
        const reason = realReason(it.returnCause);
        if (reason) b.reasons.set(reason, (b.reasons.get(reason) ?? 0) + s.lost);
      }
      returns.set(it.skuId, pair);
    }

    const refOf = (info: SkuInfo): RadarSkuRef => ({
      skuId: info.id,
      productId: info.productId,
      sku: info.sku,
      title: info.productTitle || info.title,
      variant: variantOf(info.title, info.productTitle),
      imageUrl: info.imageUrl,
      category: info.category?.trim() || null,
      daily: daily.get(info.id) ?? new Array<number>(SPARK_DAYS).fill(0),
    });

    const velocityRow = (info: SkuInfo, r: Demand, p: Demand, row: PlannerRow | null): RadarVelocityRow => {
      // Haqiqiy sotuv narxi (aksiya, chegirma) katalog narxidan ishonchliroq — Rejalashtiruvchi qoidasi
      const price = r.avgPrice > 0 ? r.avgPrice : p.avgPrice > 0 ? p.avgPrice : info.price;
      return {
        ...refOf(info),
        recentUnits: r.units,
        recentRate: round(r.rate, 2),
        prevUnits: p.units,
        prevRate: round(p.rate, 2),
        prevInStockDays: p.inStockDays,
        changePct: p.rate > 0 ? round((r.rate / p.rate - 1) * 100, 1) : 0,
        revenuePerDay: round((r.rate - p.rate) * price),
        stock: row?.stock ?? 0,
        daysLeft: row?.daysLeft ?? null,
      };
    };

    // ── 1–2. Tezlashish va sekinlashish ──
    const stale = lastSync === null || lastSync.getTime() < businessDayStart(today).getTime() - STALE_HOURS * 3_600_000;
    const accelerating: RadarVelocityRow[] = [];
    const slowing: RadarVelocityRow[] = [];
    // "Yangi yulduz" uchun: oxirgi 35 kunda sotilgan SKU'lar
    const selling: { info: SkuInfo; r: Demand; p: Demand; units: number; rate: number }[] = [];

    for (const info of planData.catalog.values()) {
      const r = recentDemand.get(info.id) ?? NO_DEMAND;
      const p = prevDemand.get(info.id) ?? NO_DEMAND;
      const units = r.units + p.units;
      if (units > 0) {
        // 35 kunlik tezlik — xuddi getDemand formulasi: dona ÷ sotuvda bo'lgan kunlar (kamida 7)
        selling.push({ info, r, p, units, rate: units / Math.max(RECENT_DAYS, r.inStockDays + p.inStockDays) });
      }
      if (!velocityCmp || p.inStockDays < MIN_IN_STOCK_DAYS || p.rate <= 0) continue;
      const expected = p.rate * RECENT_DAYS;
      const row = planSku(planData, info.id);

      if (
        r.units >= ACCEL_MIN_UNITS &&
        p.units >= ACCEL_MIN_PREV_UNITS &&
        r.rate >= p.rate * (1 + ACCEL_MIN_PCT / 100) &&
        beyondNoise(r.units, expected)
      ) {
        accelerating.push(velocityRow(info, r, p, row));
      } else if (
        p.units >= SLOW_MIN_PREV_UNITS &&
        r.stockoutDays === 0 &&
        (row?.stock ?? 0) > 0 &&
        r.rate <= p.rate * (1 - SLOW_MIN_PCT / 100) &&
        beyondNoise(r.units, expected)
      ) {
        slowing.push(velocityRow(info, r, p, row));
      }
    }
    // Pul bo'yicha: kuniga eng ko'p qo'shimcha (yo'qotilayotgan) tushum birinchi; foiz kichik asosni ko'tarib yuborardi
    accelerating.sort((a, b) => b.revenuePerDay - a.revenuePerDay || b.changePct - a.changePct);
    slowing.sort((a, b) => a.revenuePerDay - b.revenuePerDay || a.changePct - b.changePct);

    // ── 3. Yangi yulduzlar ──
    const firsts = await firstSales(selling.map((s) => s.info.id));
    const established: number[] = [];
    const fresh: (typeof selling)[number][] = [];
    for (const s of selling) {
      const first = firsts.get(s.info.id);
      if (!first) continue;
      if (toBusinessDate(first) >= windows.newSince) fresh.push(s);
      else established.push(s.rate);
    }
    const p75 = established.length >= NEW_RATE_MIN_SAMPLE ? quantile(established, NEW_RATE_QUANTILE) : null;
    const newMinRate = round(p75 ?? NEW_FALLBACK_RATE, 2);
    // Do'konning birinchi buyurtmasi shu kundan kech bo'lsa, eng kech chiqqan SKU ham "yangi" deb aytib bo'lmaydi
    const historyOk = [...storeFirst.values()].some((d) => toBusinessDate(d) <= iso(-NEW_HISTORY_DAYS));
    const newStars: RadarNewStarRow[] = [];
    for (const s of fresh) {
      const first = firsts.get(s.info.id) as Date;
      const firstDay = toBusinessDate(first);
      const storeStart = storeFirst.get(s.info.storeId);
      const launchedAfterHistory =
        storeStart !== undefined &&
        toBusinessDate(storeStart) <= toISODate(addDays(parseISODate(firstDay), -NEW_HISTORY_DAYS));
      if (!launchedAfterHistory || s.units < NEW_MIN_UNITS || s.rate < newMinRate) continue;
      const row = planSku(planData, s.info.id);
      newStars.push({
        ...refOf(s.info),
        firstSaleDate: firstDay,
        daysOnSale: Math.round((asOfDate.getTime() - parseISODate(firstDay).getTime()) / 86_400_000) + 1,
        units: s.units,
        revenue: round(s.r.avgPrice * s.r.units + s.p.avgPrice * s.p.units),
        rate: round(s.rate, 2),
        stock: row?.stock ?? 0,
        daysLeft: row?.daysLeft ?? null,
      });
    }
    newStars.sort((a, b) => b.rate - a.rate || b.units - a.units);

    // ── 4. Tez orada tugaydi — Rejalashtiruvchining o'z qatorlari, shoshilinchlik tartibida ──
    const risky = planTable(planData).all.filter((r) => r.status === 'critical' || r.status === 'ending');
    const stockoutRows: RadarStockoutRow[] = [];
    for (const r of risky.slice(0, MAX_ROWS)) {
      const info = planData.catalog.get(r.skuId);
      if (!info) continue;
      stockoutRows.push({
        ...refOf(info),
        status: r.status === 'critical' ? 'critical' : 'ending',
        stock: r.stock,
        inbound: r.inbound,
        avgDaily: r.avgDaily,
        daysLeft: r.daysLeft,
        stockoutDate: r.stockoutDate,
        orderBy: r.orderBy,
        orderInDays: r.orderInDays,
        recommendedQty: r.recommendedQty,
        lostRevenue: r.lostRevenue,
      });
    }

    // ── 5. Qaytarish o'smoqda ──
    const returnsRows: { row: RadarReturnsRow; impact: number }[] = [];
    if (returnsCmp) {
      for (const info of planData.catalog.values()) {
        const pair = returns.get(info.id);
        if (!pair) continue;
        const { recent, prev } = pair;
        const recentBase = recent.handed + recent.returned;
        const prevBase = prev.handed + prev.returned;
        if (recentBase < RETURNS_MIN_BASE || prevBase < RETURNS_MIN_BASE) continue;
        if (recent.returned < RETURNS_MIN_RETURNED) continue;
        const recentRate = pct(recent.returned, recentBase);
        const prevRate = pct(prev.returned, prevBase);
        const deltaPp = round(recentRate - prevRate, 1);
        if (deltaPp < RETURNS_MIN_PP) continue;
        if (!proportionsDiffer(recent.returned, recentBase, prev.returned, prevBase)) continue;
        // Ta'sir — o'sish sabab ORTIQCHA qaytgan donalar summasi: (ulush farqi × asos) × qaytgan dona narxi
        const unitPrice = recent.returned > 0 ? recent.amount / recent.returned : 0;
        returnsRows.push({
          row: {
            ...refOf(info),
            recentRate,
            prevRate,
            deltaPp,
            recentReturned: recent.returned,
            recentBase,
            prevReturned: prev.returned,
            prevBase,
            returnedAmount: round(recent.amount),
            topReason: topReasonOf(recent.reasons),
          },
          impact: ((recentRate - prevRate) / 100) * recentBase * unitPrice,
        });
      }
    }
    returnsRows.sort((a, b) => b.impact - a.impact || b.row.deltaPp - a.row.deltaPp);


    const thresholds: RadarThresholds = {
      accelMinUnits: ACCEL_MIN_UNITS,
      accelMinPct: ACCEL_MIN_PCT,
      slowMinPrevUnits: SLOW_MIN_PREV_UNITS,
      slowMinPct: SLOW_MIN_PCT,
      minInStockDays: MIN_IN_STOCK_DAYS,
      newDays: NEW_DAYS,
      newMinUnits: NEW_MIN_UNITS,
      newMinRate,
      returnsMinBase: RETURNS_MIN_BASE,
      returnsMinReturned: RETURNS_MIN_RETURNED,
      returnsMinPp: RETURNS_MIN_PP,
      maxRows: MAX_ROWS,
    };

    const payload: RadarResponse = {
      asOf,
      windows,
      leadDays: planData.leadDays,
      skus: planData.catalog.size,
      sellingSkus: selling.length,
      accelerating: velocityCmp
        ? signal('ready', accelerating.length, accelerating.slice(0, MAX_ROWS))
        : signal('noHistory', 0, []),
      slowing: !velocityCmp
        ? signal('noHistory', 0, [])
        : stale
          ? signal('stale', 0, [])
          : signal('ready', slowing.length, slowing.slice(0, MAX_ROWS)),
      newStars: historyOk ? signal('ready', newStars.length, newStars.slice(0, MAX_ROWS)) : signal('noHistory', 0, []),
      // Rejalashtiruvchi tarifi: sinovda ('preview') — uning o'z namunasidagi kabi eng shoshilinch uchtasi
      stockout: gated(featureAccess(plan, 'planner'), stockoutRows, risky.length),
      returnsRising: returnsCmp
        ? gated(
            featureAccess(plan, 'returns_report'),
            returnsRows.slice(0, MAX_ROWS).map((x) => x.row),
            returnsRows.length,
          )
        : signal('noHistory', 0, []),
      thresholds,
    };
    res.json(payload);
  }),
);

export default router;
