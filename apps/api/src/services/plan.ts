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
  parseISODate,
  parseSkuQuery,
  recommendedQty,
  round,
  toBusinessDate,
  toISODate,
  type PlannerDraftScope,
  type PlannerResponse,
  type PlannerRow,
  type PlannerSettings,
  type StockPlanSummary,
} from '@savdoiq/shared';
import { getLatestStocks, getSkuCatalog, skuInfoMatches, skuMatches, type SkuInfo, type StockInfo } from './common.js';
import { getDemand, type Demand } from './demand.js';

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

export const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };
export const NO_DEMAND: Demand = { units: 0, inStockDays: 0, stockoutDays: 0, rate: 0, trendPct: null, avgPrice: 0 };

/** Jadvalda avval eng shoshilinch qatorlar turadi */
export const STATUS_RANK: Record<PlannerRow['status'], number> = {
  critical: 0,
  ending: 1,
  enough: 2,
  no_action: 3,
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
    where: { shipment: { companyId, status: 'in_transit' }, sku: { storeId: { in: storeIds } } },
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

export interface PlanInput {
  info: SkuInfo;
  stock: StockInfo;
  inbound: number;
  demand: Demand;
  cover: number;
  lead: number;
  /** Bugungi kun (UTC yarim tunga tenglashtirilgan) */
  today: Date;
}

/** Bitta SKU uchun reja qatori — butun ilovadagi "buyurtma kerak" shundan */
export function buildRow(inp: PlanInput): PlannerRow {
  const { info, demand, lead } = inp;
  const rate = demand.rate;
  const supply = inp.stock.total + inp.inbound;

  /** Aniq (kasrli) qiymat hisob uchun, butun kun — ko'rsatish uchun; pastga yaxlitlanadi: ehtiyotkor tomon */
  const daysExact = rate > 0 ? supply / rate : null;
  const daysLeft = daysExact === null ? null : Math.floor(daysExact);

  const qty = recommendedQty(rate, inp.cover, supply, lead);
  const unitCost = info.purchasePrice + info.extraCost;
  // Katalog narxi eskirgan bo'lishi mumkin (aksiya, o'zgartirilgan narx) — haqiqiy sotuv narxi ishonchliroq
  const price = demand.avgPrice > 0 ? demand.avgPrice : info.price;

  /*
   * JO'NATISH VA SOTIB OLISH. FBO'ga kerak = xuddi shu talab − FBO − yo'ldagi
   * (yo'ldagi tovar FBO'ga ketyapti). Uning o'z ombori + FBS qoplay oladigan
   * qismi — "ombordan FBO'ga jo'nating", qolgani — sotib olish. Band qilingan
   * dona (`reserved`) jo'natilmaydi: u allaqachon xaridorga va'da qilingan.
   * Bir xil formula (shared `recommendedQty`) — band qilingan dona bo'lmasa
   * jo'natish + sotib olish aynan FBO'ga kerakli miqdorga teng. Ilgari
   * qoralamaga sotib olish miqdori tushardi va qabul qilinganda u o'z
   * omboridan FBO'ga ko'chirilgandek yozilardi — omborda bo'lmagan tovar
   * "jo'natilardi", omborda turgani esa rejada ko'rinmasdi (2026-10-24).
   */
  const fboNeed = recommendedQty(rate, inp.cover, inp.stock.fbo + inp.inbound, lead);
  const shippable = Math.max(0, inp.stock.own + inp.stock.fbs - inp.stock.reserved);
  const shipQty = Math.min(fboNeed, shippable);

  /*
   * Buyurtma kuni: shu kuni buyurtma berilsa, tovar qoldiq tugashidan
   * SAFETY_DAYS kun oldin yetib keladi. Manfiy — kechikilgan.
   */
  const orderInDays = daysLeft === null ? null : daysLeft - lead - SAFETY_DAYS;

  /*
   * HOLAT.
   *  kritik     — bugun buyurtma berilsa ham tovar kelguncha tugaydi;
   *  tugayapti  — buyurtma kuni yetdi yoki bir hafta ichida;
   *  yetarli    — hozircha shoshilmasa bo'ladi;
   *  harakatsiz — sotuv yo'q, prognoz qurib bo'lmaydi.
   */
  let status: PlannerRow['status'];
  if (daysExact === null || orderInDays === null) status = 'no_action';
  else if (daysExact <= lead) status = 'critical';
  else if (orderInDays <= ORDER_SOON_DAYS) status = 'ending';
  else status = 'enough';

  // Bugun buyurtma berilsa ham qoldiqsiz o'tadigan vaqt
  const gapExact = daysExact === null ? 0 : Math.max(0, lead - daysExact);

  const variant = variantOf(info.title, info.productTitle);

  return {
    skuId: info.id,
    sku: info.sku,
    title: info.productTitle || info.title,
    variant,
    imageUrl: info.imageUrl,
    stock: inp.stock.total,
    inbound: inp.inbound,
    avgDaily: round(rate, 2),
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
    lostPast: round(demand.stockoutDays * rate * price),
  };
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
  const [settings, catalog, stocks, demand, inbound] = await Promise.all([
    cover !== null && lead !== null ? Promise.resolve(null) : getPlannerSettings(companyId),
    getSkuCatalog(storeIds, false),
    getLatestStocks(storeIds),
    getDemand(storeIds),
    getInbound(companyId, storeIds),
  ]);

  const data: PlanData = {
    coverDays: cover ?? settings?.coverDays ?? DEFAULT_COVER,
    leadDays: lead ?? settings?.leadDays ?? DEFAULT_LEAD,
    today: parseISODate(toBusinessDate(new Date())),
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
  for (const r of rows) {
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
const STATUS_FILTERS: PlanStatusFilter[] = ['all', 'critical', 'ending', 'enough', 'no_action'];

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
  const counts = { all: 0, critical: 0, ending: 0, enough: 0, noAction: 0 };
  const totals = {
    needSkus: 0,
    purchaseCost: 0,
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
    else counts.noAction += 1;

    if (row.recommendedQty > 0) {
      totals.needSkus += 1;
      totals.purchaseCost += row.purchaseCost;
      totals.buyUnits += row.recommendedQty;
    }
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
      lostRevenue: round(totals.lostRevenue),
      lostPast: round(totals.lostPast),
    },
    rows,
    all,
  };
}
