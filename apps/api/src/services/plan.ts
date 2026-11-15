/**
 * "Buyurtma kerak" — YAGONA hisob. Rejalashtiruvchi (routes/planner.ts),
 * "Bugun nima qilish kerak" (routes/today.ts), Mahsulotlar ro'yxati va
 * mahsulot sahifasi (routes/products.ts), Qoldiqlar jadvali va yon paneli
 * (routes/stocks.ts), Boshqaruv panelidagi "tugayotgan qoldiq" xulosasi
 * (routes/analytics.ts) va Excel'dagi sotib olish hamda mahsulotlar
 * ro'yxati (routes/export.ts GET /planner, GET /products) shu fayldan oladi.
 * Telegram bot API paketini import qila olmaydi — u "tugayapti" qoidasini
 * soddalashtirib takrorlaydi, lekin kompaniyaning o'sha yetkazish muddati
 * bilan (apps/bot/src/jobs/stock-alert.ts).
 *
 * NEGA BITTA JOYDA. Ilgari bir xil 30 kun uchun uch sahifa uch xil son
 * ko'rsatardi: Mahsulotlar KPI'si o'z formulasida (yetkazish 0 kun, oddiy
 * 30 kunlik o'rtacha, yo'ldagi tovarsiz), Rejalashtiruvchi — boshqa, mahsulot
 * sahifasi — uchinchi: "Paxta choyshab 22 kunga yetadi" derdi, kulrang
 * varianti esa 0 da va kritik edi — jami qoldiq jami tezlikka bo'linib,
 * tugagan SKU "o'rtacha"ga singib ketardi (2026-10-24).
 *
 * HISOB (bitta SKU):
 *   tezlik        = oxirgi 30 kundagi sotuv / tovar SOTUVDA BO'LGAN kunlar (services/demand.ts)
 *   ta'minot      = qoldiq (FBO + FBS + o'z ombori) + Uzum omboriga yo'ldagi tovar
 *   yetadi        = ta'minot / tezlik (pastga yaxlitlanadi — ehtiyotkor tomon)
 *   buyurtma kuni = tugash sanasi − yetkazish muddati − ehtiyot zaxirasi (3 kun)
 *   sotib olish   = tezlik × (yetkazish + zaxira davri) − ta'minot
 *   jo'natish     = FBO'ga kerakli miqdorning (o'sha talab − FBO − yo'ldagi)
 *                   o'z ombori + FBS (band qilinganidan tashqari) qoplay oladigan qismi
 *   yo'qotish     = bugun buyurtma berilsa ham tovar kelguncha qoldiqsiz o'tadigan
 *                   kunlar × tezlik × haqiqiy sotuv narxi
 *
 * Ilgari "yo'qotilayotgan tushum" zaxira davridagi talabning qoldiqdan ortgan
 * qismi edi — hamma tovar yetarli bo'lsa ham 413 000 so'm ko'rsatardi, chunki
 * 30 kunlik talab har doim qoldiqdan katta. U yo'qotish emas, buyurtma hajmi.
 *
 * MAHSULOT — SKU'larning o'rtachasi EMAS (planProduct): bitta sotiladigan
 * varianti kritik bo'lsa mahsulot ham kritik, "yetadi" — eng tez tugaydigan
 * variantniki. Miqdorlar esa SKU'lar bo'yicha qo'shiladi: har variant o'z
 * zaxirasiga muhtoj.
 *
 * Yetkazish muddati va zaxira davri — KOMPANIYA sozlamasi (CompanySetting
 * 'planner.leadDays', 'planner.coverDays'). Ilgari yetkazish muddati faqat
 * brauzerda (localStorage) saqlanardi, server esa hamma joyda 7 kun deb
 * olardi: sotuvchi 14 kun tanlasa ham "Bugun" ro'yxati va Mahsulotlar 7 kun
 * bilan hisoblardi (2026-10-24).
 */
import { prisma } from '@savdoiq/db';
import {
  STOCK_THRESHOLDS,
  addDays,
  effectiveMode,
  normSkuCode,
  parseISODate,
  parseSkuQuery,
  previousSeason,
  round,
  seasonWindow,
  toBusinessDate,
  toISODate,
  type PlanHoldReason,
  type PlannerDraftScope,
  type PlannerResponse,
  type PlannerRow,
  type PlannerSettings,
  type StockPlanSummary,
} from '@savdoiq/shared';
import { getLatestStocks, getSkuCatalog, skuInfoMatches, skuMatches, type SkuInfo, type StockInfo } from './common.js';
import { getDemand, type Demand } from './demand.js';
import { getBatchProfit } from './batch-profit.js';

// ─────────────────────────── Chegaralar ───────────────────────────

/** Zaxira davri chegaralari (kun) — saytdagi slayder bilan bir xil */
export const COVER_MIN = 7;
export const COVER_MAX = 90;
export const DEFAULT_COVER = 30;
/** Yetkazib berish muddati (kun) — buyurtma berilgandan omborga tushgunga qadar */
export const LEAD_MIN = 0;
export const LEAD_MAX = 120;
export const DEFAULT_LEAD = 7;
/**
 * Ehtiyot zaxirasi (kun): buyurtma kuni shuncha oldinga suriladi. Sotuv bir
 * tekis emas — bir kunda 3 ta, keyin ikki kun yo'q; yetkazma ham kechikadi.
 */
export const SAFETY_DAYS = 3;
/** Buyurtma kuni shuncha kun ichida bo'lsa — "buyurtma vaqti" */
export const ORDER_SOON_DAYS = 7;

/**
 * Ehtiyot zaxirasi uchun xizmat darajasi z (≈90%): zaxira = z × kunlik
 * tebranish × √(yetkazish kunlari). Sotuv qancha notekis bo'lsa, zaxira shuncha
 * ko'p; bir tekis sotiladigan tovarda deyarli qo'shilmaydi.
 */
export const SERVICE_Z = 1.28;
/** Yo'nalish prognozga yarim og'irlik bilan kiradi va shu chegaradan oshmaydi */
const TREND_WEIGHT = 0.5;
const TREND_MIN = -0.6;
const TREND_MAX = 1;

export const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };
export const NO_DEMAND: Demand = { units: 0, inStockDays: 0, stockoutDays: 0, rate: 0, trendPct: null, avgPrice: 0, dailySd: 0 };

/** Jadvalda avval eng shoshilinch qatorlar turadi */
export const STATUS_RANK: Record<PlannerRow['status'], number> = {
  critical: 0,
  ending: 1,
  enough: 2,
  held: 3,
  no_action: 4,
};

// ─────────────────────────── Parametrlar ───────────────────────────

/**
 * So'rov yoki sozlamadagi kun → butun son, oraliq ichida; bo'sh yoki noto'g'ri
 * bo'lsa null (chaqiruvchi kompaniya sozlamasini oladi).
 *
 * Saytdagi slayder har qanday butun sonni yuboradi, shuning uchun ro'yxat emas,
 * oraliq tekshiriladi — aks holda 45 kun so'ralganda jimgina 30 kun qaytardi.
 */
function toDays(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** Zaxira davri: 7..90 kun */
export const parseCover = (value: unknown): number | null => toDays(value, COVER_MIN, COVER_MAX);
/** Yetkazish muddati: 0..120 kun */
export const parseLead = (value: unknown): number | null => toDays(value, LEAD_MIN, LEAD_MAX);

// ─────────────────────────── Kompaniya sozlamasi ───────────────────────────

export const PLANNER_SETTING_KEYS = {
  leadDays: 'planner.leadDays',
  coverDays: 'planner.coverDays',
} as const;

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = { leadDays: DEFAULT_LEAD, coverDays: DEFAULT_COVER };

export interface PlannerSettingsState extends PlannerSettings {
  /** Kompaniya o'zi saqlaganmi (aks holda — standart qiymatlar) */
  saved: boolean;
  updatedAt: Date | null;
}

/**
 * Kompaniyaning yetkazish muddati va zaxira davri. Qiymat umumiy PUT
 * /company/settings orqali ham yozilishi mumkin (kalit qoidasi
 * 'planner.leadDays' ni o'tkazadi), shuning uchun har biri alohida
 * tekshiriladi: buzilgani standartga qaytadi, oraliqdan tashqarisi chegaraga
 * tortiladi — butun reja yiqilmaydi.
 */
export async function getPlannerSettings(companyId: string): Promise<PlannerSettingsState> {
  const rows = await prisma.companySetting.findMany({
    where: { companyId, key: { in: [PLANNER_SETTING_KEYS.leadDays, PLANNER_SETTING_KEYS.coverDays] } },
    select: { key: true, value: true, updatedAt: true },
  });
  const out: PlannerSettingsState = { ...DEFAULT_PLANNER_SETTINGS, saved: false, updatedAt: null };
  for (const r of rows) {
    const isLead = r.key === PLANNER_SETTING_KEYS.leadDays;
    const v = isLead ? parseLead(r.value) : parseCover(r.value);
    if (v === null) continue;
    if (isLead) out.leadDays = v;
    else out.coverDays = v;
    out.saved = true;
    if (!out.updatedAt || r.updatedAt > out.updatedAt) out.updatedAt = r.updatedAt;
  }
  return out;
}

const isUniqueViolation = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'P2002';

async function writeSetting(companyId: string, key: string, value: string): Promise<void> {
  try {
    await prisma.companySetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value },
      update: { value },
    });
  } catch (err) {
    /*
     * Ikki parallel BIRINCHI saqlash: PostgreSQL'da upsert atomar emas — ikkinchisi
     * unique xatosini oladi. Yozuv endi bor, shuning uchun oddiy yangilash yetadi.
     */
    if (!isUniqueViolation(err)) throw err;
    await prisma.companySetting.update({ where: { companyId_key: { companyId, key } }, data: { value } });
  }
}

/** Saqlash: berilgan maydonlargina yoziladi, qiymat oraliqqa tortiladi */
export async function savePlannerSettings(
  companyId: string,
  patch: Partial<PlannerSettings>,
): Promise<PlannerSettingsState> {
  const lead = parseLead(patch.leadDays);
  const cover = parseCover(patch.coverDays);
  if (lead !== null) await writeSetting(companyId, PLANNER_SETTING_KEYS.leadDays, String(lead));
  if (cover !== null) await writeSetting(companyId, PLANNER_SETTING_KEYS.coverDays, String(cover));
  return getPlannerSettings(companyId);
}

// ─────────────────────────── Yo'ldagi tovar ───────────────────────────

/**
 * Uzum omboriga yo'ldagi tovar: jo'natilgan, hali qabul qilinmagan dona.
 *
 * Qo'lda yaratilgan yetkazma va Uzum nakladnoyi bitta yukning ikki yozuvi
 * bo'lishi mumkin, shuning uchun ular qo'shilmaydi — kattasi olinadi.
 * Qoralamalar (draft) kirmaydi: ular hali jo'natilmagan.
 */
export async function getInbound(companyId: string, storeIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (storeIds.length === 0) return out;
  const items = await prisma.shipmentItem.findMany({
    // Uzum ombori qabul qilayotgani ham hali sotuvda emas — kelayotgan tovar
    where: { shipment: { companyId, status: { in: ['in_transit', 'accepting'] } }, sku: { storeId: { in: storeIds } } },
    select: { skuId: true, qty: true, accepted: true, shipment: { select: { source: true } } },
  });
  const bySource = new Map<string, { uzum: number; manual: number }>();
  for (const it of items) {
    const left = Math.max(0, it.qty - it.accepted);
    if (left <= 0) continue;
    const cur = bySource.get(it.skuId) ?? { uzum: 0, manual: 0 };
    if (it.shipment.source === 'uzum') cur.uzum += left;
    else cur.manual += left;
    bySource.set(it.skuId, cur);
  }
  for (const [skuId, v] of bySource) out.set(skuId, Math.max(v.uzum, v.manual));
  return out;
}

// ─────────────────────────── Bitta SKU qatori ───────────────────────────

/**
 * Variant nomi (rang, o'lcham). SKU nomi ba'zan mahsulot nomini takrorlaydi
 * ("Naushnik — Qora"): o'shanda faqat farq qiladigan qismi qoladi.
 */
export function variantOf(skuTitle: string, productTitle: string): string | null {
  const sku = skuTitle.trim();
  const product = productTitle.trim();
  if (!sku || sku === product) return null;
  if (product && sku.startsWith(product)) {
    return sku.slice(product.length).replace(/^[\s—–\-·:,|/]+/, '').trim() || null;
  }
  return sku;
}

/** Sotib olingan, hali Uzumga topshirilmagan tovar (Partiyalar) */
export interface PipelineInfo {
  /** Jami: Xitoy omborida, cargoda, Toshkentga kelgan, rejadagi ta'minotda */
  qty: number;
  /** Shundan Toshkentga kelgani — FBO'ga jo'natsa bo'ladi */
  arrived: number;
}

export const NO_PIPELINE: PipelineInfo = { qty: 0, arrived: 0 };

export interface PlanInput {
  info: SkuInfo;
  stock: StockInfo;
  inbound: number;
  demand: Demand;
  cover: number;
  lead: number;
  /** Bugungi kun (UTC yarim tunga tenglashtirilgan) */
  today: Date;
  /** Partiyalarda sotib olingan, hali Uzumga yetmagan tovar */
  pipeline?: PipelineInfo;
  /** Mavsumiy tovar: o'tgan mavsumdagi kunlik sotuv (mavsumdan tashqarida reja shundan) */
  seasonRate?: number;
}

/**
 * Prognoz tezligi: 30 kunlik tezlik, oxirgi 14 kunning yo'nalishi bilan
 * to'g'rilangan (yarim og'irlik, -60%..+100% chegarada). O'sayotgan tovar
 * kam, tushayotgani ko'p buyurtma qilinmasin; ma'lumot kam bo'lsa (yo'nalish
 * yo'q) — 30 kunlik tezlikning o'zi.
 */
export function forecastRate(demand: Demand): number {
  if (demand.rate <= 0) return 0;
  if (demand.trendPct === null) return demand.rate;
  const trend = Math.min(TREND_MAX, Math.max(TREND_MIN, demand.trendPct / 100));
  return demand.rate * (1 + TREND_WEIGHT * trend);
}

/** Ehtiyot zaxirasi (dona): z × kunlik tebranish × √yetkazish kunlari, butunga yuqoriga */
export function safetyStock(demand: Demand, lead: number): number {
  if (demand.rate <= 0 || demand.dailySd <= 0) return 0;
  return Math.ceil(SERVICE_Z * demand.dailySd * Math.sqrt(Math.max(1, lead)));
}

/**
 * Bitta SKU uchun reja qatori — butun ilovadagi "buyurtma kerak" shundan.
 *
 * AQLLI REJA (2026-11-15, egasi: "rejalashtiruvchini mukammal, aqlli qil"):
 *  1. Tezlik — prognoz: 30 kunlik tezlik oxirgi 14 kun yo'nalishi bilan.
 *  2. Ehtiyot zaxirasi qat'iy 3 kun emas — sotuv tebranishidan (kamida 3 kun).
 *  3. Partiyalarda sotib olingan tovar (Xitoyda, cargoda, keldi) ta'minotga
 *     qo'shiladi: allaqachon olingan tovar qayta tavsiya qilinmaydi; Toshkentga
 *     kelgani — "FBO'ga jo'nating".
 *  4. Sotuvchi rejimi (shared sku-plan.ts): pauza / endi olinmaydi — sotib
 *     olish yo'q; mavsumiy — mavsum tugashigacha sotiladigan miqdor, mavsum
 *     tugashiga ulgurmasa yo'q, mavsumdan tashqarida keyingi mavsumga o'z
 *     vaqtida (o'tgan mavsum tezligi bilan).
 */
export function buildRow(inp: PlanInput): PlannerRow {
  const { info, demand, lead } = inp;
  const pipeline = inp.pipeline ?? NO_PIPELINE;
  let rate = forecastRate(demand);
  const mode = effectiveMode(info.plan, inp.today);
  const window = mode === 'seasonal' ? seasonWindow(info.plan.seasonMonths, inp.today) : null;
  /*
   * Mavsum endi boshlangan (30 kunlik oynaning bir qismi mavsumdan oldingi
   * jim kunlar): hozirgi tezlik past chiqadi — o'tgan mavsum tezligi katta
   * bo'lsa, o'shani olamiz. Aks holda mavsum boshida kam buyurtma qilinardi.
   */
  if (window?.inSeason && inp.seasonRate && window.length - window.daysToEnd < 30 && inp.seasonRate > rate) {
    rate = inp.seasonRate;
  }
  /** Javonda va Uzumga yo'lda: "qoldiq necha kunga yetadi" shundan */
  const shelf = inp.stock.total + inp.inbound;
  /** Sotib olish qarori uchun: partiyalarda kelayotgani ham */
  const supply = shelf + pipeline.qty;

  const safety = safetyStock(demand, lead);
  /** Buyurtma kuni hisobidagi zaxira: kamida SAFETY_DAYS, tebranish katta bo'lsa — ko'proq */
  const safetyDays = rate > 0 ? Math.max(SAFETY_DAYS, Math.ceil(safety / rate)) : SAFETY_DAYS;

  /** Aniq (kasrli) qiymat hisob uchun, butun kun — ko'rsatish uchun; pastga yaxlitlanadi: ehtiyotkor tomon */
  const shelfExact = rate > 0 ? shelf / rate : null;
  const daysLeft = shelfExact === null ? null : Math.floor(shelfExact);
  /** Partiyalar bilan birga necha kunga yetadi — sotib olish kuni shundan */
  const supplyExact = rate > 0 ? supply / rate : null;

  /**
   * Kerakli dona (talab + ehtiyot zaxirasi) — sotib olish ham, FBO'ga jo'natish
   * ham SHU maqsaddan: ikkalasi bir xil bo'lmasa, sotib olish tavsiya qilinib,
   * o'z omboridagi tovar to'liq jo'natilmay qolardi.
   */
  let target = rate > 0 ? rate * (inp.cover + lead) + safety : 0;
  let qty = rate > 0 ? Math.max(0, Math.ceil(target - supply)) : 0;
  let orderInDays = supplyExact === null ? null : Math.floor(supplyExact) - lead - safetyDays;
  const unitCost = info.purchasePrice + info.extraCost;
  // Katalog narxi eskirgan bo'lishi mumkin (aksiya, o'zgartirilgan narx) — haqiqiy sotuv narxi ishonchliroq
  const price = demand.avgPrice > 0 ? demand.avgPrice : info.price;

  /*
   * HOLAT.
   *  kritik     — bugun buyurtma berilsa ham tovar kelguncha tugaydi;
   *  tugayapti  — buyurtma kuni yetdi yoki bir hafta ichida;
   *  yetarli    — hozircha shoshilmasa bo'ladi;
   *  harakatsiz — sotuv yo'q, prognoz qurib bo'lmaydi;
   *  to'xtatilgan (held) — quyida, sotuvchi rejimi va mavsum.
   */
  let status: PlannerRow['status'];
  if (supplyExact === null || orderInDays === null) status = 'no_action';
  else if (supplyExact <= lead) status = 'critical';
  else if (orderInDays <= ORDER_SOON_DAYS) status = 'ending';
  else status = 'enough';

  // Bugun buyurtma berilsa ham qoldiqsiz o'tadigan vaqt
  let gapExact = supplyExact === null ? 0 : Math.max(0, lead - supplyExact);

  // ── Sotuvchi rejimi va mavsum ──
  let hold: PlanHoldReason | null = null;
  let holdUntil: string | null = null;
  let season: PlannerRow['season'] = null;
  /** Mavsumdan tashqarida: keyingi mavsumga rejalashtirilgan miqdor (hozir sotib olinmaydi) */
  let seasonQty = 0;
  if (mode === 'pause' || mode === 'stop') {
    hold = mode;
    holdUntil = mode === 'pause' ? info.plan.pauseUntil : null;
  } else if (mode === 'seasonal') {
    const w = window;
    if (w) {
      season = { start: w.start, end: w.end, inSeason: w.inSeason };
      if (w.inSeason) {
        if (lead >= w.daysToEnd) {
          // Yangi partiya mavsum tugagandan keyin keladi — qolgani sotib tugatiladi
          hold = 'season_end';
        } else if (rate > 0) {
          // Faqat mavsum oxirigacha sotiladigan miqdor: undan keyin talab yo'q
          const horizon = Math.min(inp.cover + lead, w.daysToEnd);
          target = rate * horizon + safety;
          qty = Math.max(0, Math.ceil(target - supply));
          // Qoldiq mavsum oxirigacha yetsa — buyurtma kerak emas
          if (supplyExact !== null && supplyExact >= w.daysToEnd) {
            qty = 0;
            status = 'enough';
            orderInDays = null;
            gapExact = 0;
          }
        }
      } else {
        // Mavsum emas: keyingi mavsumga o'z vaqtida tayyorlanish
        const seasonal = inp.seasonRate && inp.seasonRate > 0 ? inp.seasonRate : rate;
        const until = w.daysToStart - lead - SAFETY_DAYS;
        gapExact = 0;
        if (seasonal <= 0) {
          hold = 'off_season';
          holdUntil = null;
          qty = 0;
        } else {
          target = seasonal * Math.min(inp.cover, w.length);
          qty = Math.max(0, Math.ceil(target - supply));
          orderInDays = until;
          if (qty <= 0) {
            hold = 'off_season';
            orderInDays = null;
          } else if (until > ORDER_SOON_DAYS) {
            hold = 'off_season';
            holdUntil = toISODate(addDays(inp.today, until));
            seasonQty = qty;
          } else {
            // Mavsumga buyurtma vaqti keldi
            status = w.daysToStart <= lead ? 'critical' : 'ending';
          }
        }
      }
    }
  }
  if (hold) {
    // To'xtatilgan qator hech qayerda "sotib oling" bo'lib sanalmaydi
    status = 'held';
    qty = 0;
    if (hold !== 'off_season' || seasonQty === 0) orderInDays = null;
    gapExact = 0;
  }

  /*
   * JO'NATISH. FBO'ga kerak = xuddi shu talab − FBO − yo'ldagi (yo'ldagi tovar
   * FBO'ga ketyapti). Uning o'z ombori + FBS + Toshkentga kelgan partiya
   * qoplay oladigan qismi — "ombordan FBO'ga jo'nating". Band qilingan dona
   * (`reserved`) jo'natilmaydi: u allaqachon xaridorga va'da qilingan. Pauza
   * va "endi olinmaydi" tovarda ham jo'natish qoladi — qoldiq sotib tugatiladi;
   * mavsum emas bo'lsa — jo'natilmaydi (sotilmaydi).
   */
  const fboNeed = Math.max(0, Math.ceil(target - inp.stock.fbo - inp.inbound));
  const shippable = Math.max(0, inp.stock.own + inp.stock.fbs - inp.stock.reserved) + pipeline.arrived;
  const shipQty = hold === 'off_season' || hold === 'season_end' ? 0 : Math.min(fboNeed, shippable);

  const variant = variantOf(info.title, info.productTitle);

  return {
    skuId: info.id,
    sku: info.sku,
    title: info.productTitle || info.title,
    variant,
    imageUrl: info.imageUrl,
    stock: inp.stock.total,
    inbound: inp.inbound,
    avgDaily: round(demand.rate, 2),
    soldUnits: demand.units,
    inStockDays: demand.inStockDays,
    stockoutDays: demand.stockoutDays,
    trendPct: demand.trendPct,
    daysLeft,
    stockoutDate: daysLeft === null ? null : toISODate(addDays(inp.today, daysLeft)),
    orderBy: orderInDays === null ? null : toISODate(addDays(inp.today, Math.max(0, orderInDays))),
    orderInDays,
    recommendedQty: qty,
    purchaseCost: round(qty * unitCost),
    fbo: inp.stock.fbo,
    shippable,
    shipQty,
    status,
    gapDays: Math.ceil(gapExact),
    lostRevenue: round(gapExact * rate * price),
    lostPast: round(demand.stockoutDays * demand.rate * price),
    forecastDaily: round(rate, 2),
    safetyUnits: hold ? 0 : safety,
    pipeline: pipeline.qty,
    pipelineArrived: pipeline.arrived,
    historicRate: Boolean(demand.fromHistory),
    planMode: info.plan.mode,
    pauseUntil: info.plan.pauseUntil,
    seasonMonths: info.plan.seasonMonths,
    hold,
    holdUntil,
    season,
    seasonQty,
  };
}

/**
 * Partiyalarda sotib olingan, hali Uzumga topshirilmagan tovar — SKU bo'yicha.
 *
 * Partiya qatori bosqichi (shared batch-profit.ts BatchStage): Xitoy omborida,
 * cargoda, Toshkentga keldi, yoki Uzum ta'minlashi hali REJADA. Yo'ldagi va
 * qabul qilinayotgan ta'minot `getInbound` da bor — ikki marta sanalmaydi.
 * Qator bir nechta SKU'ga bog'langan bo'lsa (ranglar), dona ularning sotuv
 * tezligiga qarab bo'linadi (sotuvi bo'lmasa — teng).
 *
 * Ilgari Rejalashtiruvchi buni bilmasdi: 200 dona Xitoyda sotib olinib cargoda
 * kelayotgan bo'lsa ham, Uzumdagi qoldiq tugayotgani uchun yana 200 dona
 * "sotib oling" derdi.
 */
export async function getPipeline(
  companyId: string,
  catalog: Map<string, SkuInfo>,
  demand: Map<string, Demand>,
): Promise<Map<string, PipelineInfo>> {
  const out = new Map<string, PipelineInfo>();
  if (catalog.size === 0) return out;
  let book: Awaited<ReturnType<typeof getBatchProfit>>;
  try {
    book = await getBatchProfit(companyId);
  } catch {
    // Partiya hisobi yiqilsa reja baribir chiqsin — partiyasiz
    return out;
  }
  const byCode = new Map<string, string[]>();
  for (const info of catalog.values()) {
    const key = normSkuCode(info.sku);
    const list = byCode.get(key) ?? [];
    list.push(info.id);
    byCode.set(key, list);
  }
  const add = (skuId: string, qty: number, arrived: boolean) => {
    const cur = out.get(skuId) ?? { qty: 0, arrived: 0 };
    cur.qty += qty;
    if (arrived) cur.arrived += qty;
    out.set(skuId, cur);
  };
  for (const rows of book.rowsOf.values()) {
    for (const r of rows) {
      if (r.optedOut || r.qty <= 0 || r.codes.length === 0) continue;
      const waiting =
        r.stage === 'warehouse' ||
        r.stage === 'shipped' ||
        r.stage === 'arrived' ||
        (r.stage === 'toUzum' && (!r.supply || r.supply.status === 'planned'));
      if (!waiting) continue;
      const skuIds = [...new Set(r.codes.flatMap((c) => byCode.get(normSkuCode(c)) ?? []))];
      if (skuIds.length === 0) continue;
      const arrived = r.stage === 'arrived';
      // Tezlikka qarab bo'lish, qoldiq — eng katta kasrga (jami dona saqlanadi)
      const weights = skuIds.map((id) => demand.get(id)?.rate ?? 0);
      const total = weights.reduce((a, b) => a + b, 0);
      const shares = skuIds.map((_, i) => (total > 0 ? (r.qty * (weights[i] as number)) / total : r.qty / skuIds.length));
      const whole = shares.map(Math.floor);
      let left = r.qty - whole.reduce((a, b) => a + b, 0);
      const order = shares.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
      for (const [, i] of order) {
        if (left <= 0) break;
        whole[i] = (whole[i] as number) + 1;
        left -= 1;
      }
      skuIds.forEach((id, i) => {
        if ((whole[i] as number) > 0) add(id, whole[i] as number, arrived);
      });
    }
  }
  return out;
}

/** Mavsumiy SKU'lar uchun minimal bo'luvchi (kun): bir-ikki sotuv "kuniga 1 ta" bo'lib ketmasin */
const SEASON_MIN_DAYS = 14;

/**
 * Mavsumiy SKU'larning O'TGAN mavsumdagi kunlik sotuvi. Mavsumdan tashqarida
 * hozirgi tezlik ~0 — keyingi mavsumga qancha olishni shu aytadi. Bo'luvchi —
 * mavsumdagi birinchi sotuvdan mavsum oxirigacha (tovar mavsum o'rtasida
 * chiqqan bo'lsa ham to'g'ri), kamida 14 kun.
 */
export async function getSeasonRates(
  storeIds: string[],
  catalog: Map<string, SkuInfo>,
  today: Date,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const windows = new Map<string, { start: Date; end: Date }>();
  for (const info of catalog.values()) {
    if (info.plan.mode !== 'seasonal') continue;
    const prev = previousSeason(info.plan.seasonMonths, today);
    if (!prev) continue;
    windows.set(info.id, { start: parseISODate(prev.start), end: addDays(parseISODate(prev.end), 1) });
  }
  if (windows.size === 0 || storeIds.length === 0) return out;
  const from = new Date(Math.min(...[...windows.values()].map((w) => w.start.getTime())));
  const to = new Date(Math.max(...[...windows.values()].map((w) => w.end.getTime())));
  const items = await prisma.orderItem.findMany({
    where: {
      skuId: { in: [...windows.keys()] },
      order: { storeId: { in: storeIds } },
      orderedAt: { gte: from, lt: to },
      status: { notIn: ['canceled', 'returned'] },
      returnedAt: null,
    },
    select: { skuId: true, qty: true, orderedAt: true },
  });
  const agg = new Map<string, { units: number; first: number }>();
  for (const it of items) {
    if (!it.skuId) continue;
    const w = windows.get(it.skuId);
    const t = it.orderedAt.getTime();
    if (!w || t < w.start.getTime() || t >= w.end.getTime()) continue;
    const cur = agg.get(it.skuId) ?? { units: 0, first: t };
    cur.units += it.qty;
    cur.first = Math.min(cur.first, t);
    agg.set(it.skuId, cur);
  }
  for (const [skuId, a] of agg) {
    const w = windows.get(skuId) as { start: Date; end: Date };
    const days = Math.max(SEASON_MIN_DAYS, Math.ceil((w.end.getTime() - a.first) / 86_400_000));
    out.set(skuId, a.units / days);
  }
  return out;
}

/**
 * Hozir sotib olinadimi: miqdori bor va buyurtma kuni bir hafta ichida
 * (kritik yoki tugayapti). Rejalashtiruvchi xulosasi, Excel ro'yxati va
 * "Bugun" vazifalari shu bilan — "yetarli" qatorning kichik to'ldirishi
 * hozirgi xaridni shishirmaydi.
 */
export function dueNow(row: PlannerRow): boolean {
  return row.recommendedQty > 0 && (row.status === 'critical' || row.status === 'ending');
}

/** Shoshilinchlik bo'yicha: holat → buyurtma kuni → buyurtma summasi */
export function compareRows(a: PlannerRow, b: PlannerRow): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  const da = a.orderInDays ?? Number.MAX_SAFE_INTEGER;
  const db = b.orderInDays ?? Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return b.purchaseCost - a.purchaseCost;
}

/**
 * Qoralamaga tushadimi: faqat JO'NATILADIGAN miqdori bor SKU (0 dona qator
 * yetkazmaga hech qachon yozilmaydi). 'urgent' — buyurtma kuni yetgan yoki
 * o'tganlari (kritiklar ham shu jumladan: ularda buyurtma kuni doim o'tgan).
 */
export function inDraftScope(row: PlannerRow, scope: PlannerDraftScope): boolean {
  if (row.shipQty <= 0) return false;
  return scope === 'needed' || (row.orderInDays !== null && row.orderInDays <= 0);
}

// ─────────────────────────── Butun katalog ───────────────────────────

/** Bir martada yuklangan reja: katalog va har SKU qatori, kompaniya parametrlari bilan */
export interface PlanData {
  coverDays: number;
  leadDays: number;
  today: Date;
  /** Rejadagi SKU'lar — arxivdagi va o'chirilganlar kirmaydi (Rejalashtiruvchi jadvali bilan bir xil to'plam) */
  catalog: Map<string, SkuInfo>;
  rows: Map<string, PlannerRow>;
  /** Do'konlarning BARCHA SKU'lari so'nggi qoldig'i (`getLatestStocks`) — chaqiruvchi qayta so'ramasin */
  stocks: Map<string, StockInfo>;
}

/**
 * Rejani yuklaydi. `cover` / `lead` — so'rovda aniq berilgan qiymat
 * (masalan, ?lead=14); berilmasa yoki noto'g'ri bo'lsa — kompaniya sozlamasi.
 */
export async function loadPlanData(
  companyId: string,
  storeIds: string[],
  opts: { cover?: unknown; lead?: unknown } = {},
): Promise<PlanData> {
  const cover = parseCover(opts.cover);
  const lead = parseLead(opts.lead);
  const today = parseISODate(toBusinessDate(new Date()));
  const [settings, catalog, stocks, demand, inbound] = await Promise.all([
    cover !== null && lead !== null ? Promise.resolve(null) : getPlannerSettings(companyId),
    getSkuCatalog(storeIds, false),
    getLatestStocks(storeIds),
    // Uzoq tugab turgan tovar — oynadan oldingi sotuvdan (services/demand.ts withHistory)
    getDemand(storeIds, undefined, undefined, { withHistory: true }),
    getInbound(companyId, storeIds),
  ]);
  // Partiyalar (sotib olingan, hali Uzumga yetmagan) va mavsumiy SKU'larning o'tgan mavsumi
  const [pipeline, seasonRates] = await Promise.all([
    getPipeline(companyId, catalog, demand),
    getSeasonRates(storeIds, catalog, today),
  ]);

  const data: PlanData = {
    coverDays: cover ?? settings?.coverDays ?? DEFAULT_COVER,
    leadDays: lead ?? settings?.leadDays ?? DEFAULT_LEAD,
    today,
    catalog,
    rows: new Map(),
    stocks,
  };
  for (const info of catalog.values()) {
    data.rows.set(
      info.id,
      buildRow({
        info,
        stock: stocks.get(info.id) ?? EMPTY_STOCK,
        inbound: inbound.get(info.id) ?? 0,
        demand: demand.get(info.id) ?? NO_DEMAND,
        cover: data.coverDays,
        lead: data.leadDays,
        today: data.today,
        pipeline: pipeline.get(info.id),
        seasonRate: seasonRates.get(info.id),
      }),
    );
  }
  return data;
}

/** Bitta SKU qatori; SKU rejada bo'lmasa (arxivda, boshqa do'konda) — null */
export function planSku(data: PlanData, skuId: string): PlannerRow | null {
  return data.rows.get(skuId) ?? null;
}

/**
 * Qatorlar xulosasi. Holat, "yetadi", tugash va buyurtma sanasi — ENG
 * shoshilinch SKU'niki (holat ham "yetadi" ga bog'liq, shuning uchun ular bir
 * SKU'dan chiqadi); miqdor va pul — yig'indi.
 */
function summarize(rows: PlannerRow[], data: PlanData): StockPlanSummary | null {
  if (rows.length === 0) return null;
  let worst = rows[0] as PlannerRow;
  let soonest: PlannerRow | null = null;
  let orderFirst: PlannerRow | null = null;
  const sum = { reorderQty: 0, shipQty: 0, purchaseCost: 0, lostRevenue: 0, avgDaily: 0, inbound: 0, critical: 0 };
  let pipeline = 0;
  let heldSkus = 0;
  let seasonQty = 0;
  const holds = new Set<PlanHoldReason | null>();
  let holdUntil: string | null = null;
  for (const r of rows) {
    pipeline += r.pipeline;
    seasonQty += r.seasonQty;
    holds.add(r.hold);
    if (r.status === 'held') heldSkus += 1;
    if (r.holdUntil && (holdUntil === null || r.holdUntil < holdUntil)) holdUntil = r.holdUntil;
    sum.reorderQty += r.recommendedQty;
    sum.shipQty += r.shipQty;
    sum.purchaseCost += r.purchaseCost;
    sum.lostRevenue += r.lostRevenue;
    sum.avgDaily += r.avgDaily;
    sum.inbound += r.inbound;
    if (r.status === 'critical') sum.critical += 1;
    if (STATUS_RANK[r.status] < STATUS_RANK[worst.status]) worst = r;
    if (r.daysLeft !== null && (soonest === null || r.daysLeft < (soonest.daysLeft as number))) soonest = r;
    if (r.orderInDays !== null && (orderFirst === null || r.orderInDays < (orderFirst.orderInDays as number))) {
      orderFirst = r;
    }
  }
  return {
    status: worst.status,
    daysLeft: soonest?.daysLeft ?? null,
    stockoutDate: soonest?.stockoutDate ?? null,
    orderBy: orderFirst?.orderBy ?? null,
    orderInDays: orderFirst?.orderInDays ?? null,
    reorderQty: sum.reorderQty,
    shipQty: sum.shipQty,
    purchaseCost: round(sum.purchaseCost),
    lostRevenue: round(sum.lostRevenue),
    avgDaily: round(sum.avgDaily, 2),
    inbound: sum.inbound,
    criticalSkus: sum.critical,
    skus: rows.length,
    leadDays: data.leadDays,
    coverDays: data.coverDays,
    pipeline,
    heldSkus,
    hold: holds.size === 1 ? ([...holds][0] ?? null) : null,
    holdUntil,
    seasonQty,
  };
}

/** Bitta SKU xulosasi (Qoldiqlar va mahsulot sahifasidagi SKU qatori uchun) */
export function planSkuSummary(data: PlanData, skuId: string): StockPlanSummary | null {
  const row = planSku(data, skuId);
  return row ? summarize([row], data) : null;
}

/**
 * Mahsulot xulosasi: SKU'lari bo'yicha. Bitta sotiladigan varianti kritik
 * bo'lsa — mahsulot ham kritik; tugagan SKU boshqalarining qoldig'iga
 * "o'rtacha" bo'lib singib ketmaydi. Rejaga kirmagan (arxivdagi) SKU'lar
 * tashlanadi; birortasi ham kirmasa — null.
 */
export function planProduct(data: PlanData, skuIds: Iterable<string>): StockPlanSummary | null {
  const rows: PlannerRow[] = [];
  for (const id of skuIds) {
    const row = data.rows.get(id);
    if (row) rows.push(row);
  }
  return summarize(rows, data);
}

// ─────────────────────────── Qoldiq holati (besh qiymatli nishon) ───────────────────────────

/** Qoldiqlar va mahsulot sahifasidagi nishon: Kritik / Tugayapti / Yetarli / Ortiqcha / Harakatsiz */
export type StockBadgeStatus = 'critical' | 'low' | 'ok' | 'excess' | 'dead';

/**
 * SKU holati — besh qiymatli nishon, lekin "kritik" va "tugayapti"
 * Rejalashtiruvchidan (yetkazish muddati, yo'ldagi tovar, tugab turgan
 * kunlarsiz tezlik bilan). Sotuvi yo'q yoki arxivdagi SKU (rejada `no_action`
 * yoki umuman yo'q) — chaqiruvchining eski qoldiq qoidasi (`legacy`:
 * harakatsiz, tugagan).
 *
 * Ilgari bu qoida faqat mahsulot sahifasida edi (routes/products.ts), Qoldiqlar
 * jadvali esa 7/14 kunlik qat'iy chegara va oddiy 30 kunlik o'rtacha bilan
 * hisoblardi: yetkazish 14 kun bo'lsa 12 kunlik SKU Rejalashtiruvchida
 * "Kritik", Qoldiqlarda "Tugayapti" edi, yon paneldagi tavsiya esa
 * Rejalashtiruvchidan kelardi — bitta qatorda ikki xil hisob (2026-10-24).
 */
export function planStockStatus(
  row: PlannerRow | null,
  legacy: { status: StockBadgeStatus; daysLeft: number | null },
): { status: StockBadgeStatus; daysLeft: number | null } {
  if (!row || row.status === 'no_action') return legacy;
  /*
   * To'xtatilgan (pauza, endi olinmaydi, mavsum emas): "kritik / tugayapti"
   * deyilmaydi — sotuvchi qaror qilgan. Qoldig'i tugagani — harakatsiz.
   */
  if (row.status === 'held') {
    if (row.stock <= 0) return { status: 'dead', daysLeft: row.daysLeft };
    const excessHeld = row.daysLeft !== null && row.daysLeft >= STOCK_THRESHOLDS.excess;
    return { status: excessHeld ? 'excess' : 'ok', daysLeft: row.daysLeft };
  }
  if (row.status === 'critical') return { status: 'critical', daysLeft: row.daysLeft };
  if (row.status === 'ending') return { status: 'low', daysLeft: row.daysLeft };
  const excess = row.daysLeft !== null && row.daysLeft >= STOCK_THRESHOLDS.excess;
  return { status: excess ? 'excess' : 'ok', daysLeft: row.daysLeft };
}

const STOCK_BADGE_STATUSES: StockBadgeStatus[] = ['critical', 'low', 'ok', 'excess', 'dead'];

/**
 * `?status=critical|low|ok|excess|dead` — Qoldiqlar va "Sotuv va qoldiq"
 * sahifalari hamda ularning Excel fayllari uchun BITTA o'quvchi; berilmasa
 * yoki noma'lum bo'lsa null (filtr yo'q). Ilgari ro'yxat faqat
 * routes/stocks.ts ichida edi, eksport esa `?status=` ni umuman o'qimasdi:
 * sahifada "Kritik" tanlab Excel bosilsa, faylda barcha SKU chiqardi (2026-10-27).
 */
export function parseStockStatus(raw: unknown): StockBadgeStatus | null {
  return typeof raw === 'string' && (STOCK_BADGE_STATUSES as string[]).includes(raw) ? (raw as StockBadgeStatus) : null;
}

// ─────────────────────────── Jadval (Rejalashtiruvchi, Excel, namuna) ───────────────────────────

export type PlanStatusFilter = PlannerRow['status'] | 'all';
const STATUS_FILTERS: PlanStatusFilter[] = ['all', 'critical', 'ending', 'enough', 'no_action', 'held'];

/** ?status= qiymati; berilmasa yoki noma'lum bo'lsa null (standart ko'rinish) */
export function parseStatusFilter(raw: unknown): PlanStatusFilter | null {
  return typeof raw === 'string' && (STATUS_FILTERS as string[]).includes(raw) ? (raw as PlanStatusFilter) : null;
}

export interface PlanTable {
  counts: PlannerResponse['counts'];
  totals: PlannerResponse['totals'];
  /** Holat filtri va qidiruvdan o'tgan qatorlar, shoshilinchlik tartibida (cheklanmagan) */
  rows: PlannerRow[];
  /** Butun katalog, shoshilinchlik tartibida — bir bosishdagi qoralama va namuna uchun */
  all: PlannerRow[];
}

/**
 * Rejalashtiruvchi jadvali. Hisoblagichlar va jamlanmalar BUTUN katalog
 * bo'yicha — qaysi yorliq ochiq bo'lishidan qat'i nazar bir xil; filtr va
 * qidiruv faqat qatorlarga ta'sir qiladi. Standart ko'rinishda (filtr yo'q)
 * sotuvi yo'q SKU'lar jadvalni to'ldirmaydi (?status=all — barchasi).
 */
export function planTable(data: PlanData, opts: { filter?: PlanStatusFilter | null; search?: string } = {}): PlanTable {
  const filter = opts.filter ?? null;
  const counts = { all: 0, critical: 0, ending: 0, enough: 0, noAction: 0, held: 0 };
  const totals = {
    needSkus: 0,
    purchaseCost: 0,
    laterSkus: 0,
    laterCost: 0,
    pipelineUnits: 0,
    heldSkus: 0,
    lostRevenue: 0,
    lostPast: 0,
    orderNow: 0,
    buyUnits: 0,
    shipSkus: 0,
    shipUnits: 0,
    urgentShipSkus: 0,
  };
  const all: PlannerRow[] = [];
  const rows: PlannerRow[] = [];

  /*
   * Qidiruv — umumiy qoida (services/common.ts skuInfoMatches): nom, SKU kodi,
   * shtrix-kod, Uzum SKU / mahsulot ID'si yoki uzum.uz havolasi. Ilgari faqat
   * nom va SKU kodi edi: kartochkadagi "ID: 701009" Rejalashtiruvchida ham,
   * Excel'dagi sotib olish ro'yxatida ham topilmasdi (2026-10-24).
   */
  const query = parseSkuQuery(opts.search);

  for (const [skuId, row] of data.rows) {
    counts.all += 1;
    if (row.status === 'critical') counts.critical += 1;
    else if (row.status === 'ending') counts.ending += 1;
    else if (row.status === 'enough') counts.enough += 1;
    else if (row.status === 'held') counts.held += 1;
    else counts.noAction += 1;

    /*
     * "Hozir sotib oling" — faqat buyurtma kuni bir hafta ichida bo'lganlar
     * (kritik va tugayapti). Hafta keyin ham bo'ladigan to'ldirish rejada
     * ko'rinadi, lekin hozirgi xaridga qo'shilmaydi (`dueNow`).
     */
    if (row.recommendedQty > 0) {
      if (dueNow(row)) {
        totals.needSkus += 1;
        totals.purchaseCost += row.purchaseCost;
        totals.buyUnits += row.recommendedQty;
      } else {
        totals.laterSkus += 1;
        totals.laterCost += row.purchaseCost;
      }
    }
    totals.pipelineUnits += row.pipeline;
    if (row.status === 'held') totals.heldSkus += 1;
    if (inDraftScope(row, 'needed')) {
      totals.shipSkus += 1;
      totals.shipUnits += row.shipQty;
    }
    if (inDraftScope(row, 'urgent')) totals.urgentShipSkus += 1;
    totals.lostRevenue += row.lostRevenue;
    totals.lostPast += row.lostPast;
    if (row.orderInDays !== null && row.orderInDays <= 0) totals.orderNow += 1;

    all.push(row);

    const info = data.catalog.get(skuId);
    const found = info
      ? skuInfoMatches(info, query)
      : skuMatches({ id: skuId, sku: row.sku, title: row.title }, null, query);
    if (query && !found) continue;
    if (filter && filter !== 'all' && row.status !== filter) continue;
    if (!filter && row.status === 'no_action') continue;
    rows.push(row);
  }

  all.sort(compareRows);
  rows.sort(compareRows);

  return {
    counts,
    totals: {
      ...totals,
      purchaseCost: round(totals.purchaseCost),
      laterCost: round(totals.laterCost),
      lostRevenue: round(totals.lostRevenue),
      lostPast: round(totals.lostPast),
    },
    rows,
    all,
  };
}
