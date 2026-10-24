/**
 * Yetkazib berish rejalashtiruvchisi — /api/v1/planner
 *
 *  GET  / → PlannerResponse: har bir SKU uchun qoldiq necha kunga yetadi,
 *           QACHON buyurtma berish kerak, tanlangan zaxira davri (cover) va
 *           yetkazish muddati (lead) uchun qancha olib kelish kerak.
 *  POST /shipment-draft → tanlangan SKU'lardan yetkazma qoralamasi (Shipment + ShipmentItem).
 *
 * HISOB:
 *   tezlik        = oxirgi 30 kundagi sotuv / tovar SOTUVDA BO'LGAN kunlar (`services/demand.ts`)
 *   ta'minot      = qoldiq + Uzum omboriga yo'ldagi tovar
 *   yetadi        = ta'minot / tezlik
 *   buyurtma kuni = tugash sanasi − yetkazish muddati − ehtiyot zaxirasi (3 kun)
 *   tavsiya       = tezlik × (yetkazish + zaxira davri) − ta'minot
 *   yo'qotish     = bugun buyurtma berilsa ham tovar kelguncha qoldiqsiz o'tadigan
 *                   kunlar × tezlik × haqiqiy sotuv narxi
 *
 * Ilgari "yo'qotilayotgan tushum" zaxira davridagi talabning qoldiqdan ortgan
 * qismi edi — hamma tovar yetarli bo'lsa ham 413 000 so'm ko'rsatardi, chunki
 * 30 kunlik talab har doim qoldiqdan katta. U yo'qotish emas, buyurtma hajmi.
 */
import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  parseISODate,
  recommendedQty,
  round,
  toISODate,
  toBusinessDate,
  type PlannerResponse,
  type PlannerRow,
  type ShipmentItemRow,
  type ShipmentRow,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getLatestStocks, getSkuCatalog, getStoreIds, type SkuInfo, type StockInfo } from '../services/common.js';
import { DEMAND_WINDOW_DAYS, getDemand, type Demand } from '../services/demand.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('planner'));

/** Zaxira davri chegaralari (kun) — saytdagi slayder bilan bir xil */
const COVER_MIN = 7;
const COVER_MAX = 90;
// Eksport: Boshqaruv panelidagi "Bugun nima qilish kerak" (routes/today.ts) aynan shu qiymatlar bilan hisoblaydi
export const DEFAULT_COVER = 30;
/** Yetkazib berish muddati (kun) — buyurtma berilgandan omborga tushgunga qadar */
export const DEFAULT_LEAD = 7;
/**
 * Ehtiyot zaxirasi (kun): buyurtma kuni shuncha oldinga suriladi. Sotuv bir
 * tekis emas — bir kunda 3 ta, keyin ikki kun yo'q; yetkazma ham kechikadi.
 */
const SAFETY_DAYS = 3;
/** Buyurtma kuni shuncha kun ichida bo'lsa — "buyurtma vaqti" */
const ORDER_SOON_DAYS = 7;
/** Javobdagi qatorlar chegarasi — jadval cheksiz o'smasligi uchun */
const MAX_ROWS = 1000;
/** Standart quti hajmi (litr) va qutidagi dona — yetkazma qoralamasi uchun */
const BOX_VOLUME_L = 60;
const BOX_UNITS = 20;

export const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };
export const NO_DEMAND: Demand = { units: 0, inStockDays: 0, stockoutDays: 0, rate: 0, trendPct: null, avgPrice: 0 };

// ─────────────────────────── Yordamchilar ───────────────────────────

/**
 * Zaxira davri: 7..90 kun (standart — 30).
 * Saytdagi slayder har qanday butun sonni yuboradi, shuning uchun ro'yxat emas,
 * oraliq tekshiriladi — aks holda 45 kun so'ralganda jimgina 30 kun qaytardi.
 */
function coverParam(value: string | number | undefined): number {
  const raw = Math.round(Number(value ?? DEFAULT_COVER));
  if (!Number.isFinite(raw)) return DEFAULT_COVER;
  return Math.min(COVER_MAX, Math.max(COVER_MIN, raw));
}

/** Yetkazish muddati (kun), 0..120 oralig'ida (standart — 7) */
function leadParam(value: string | number | undefined): number {
  const raw = Math.round(Number(value ?? DEFAULT_LEAD));
  if (!Number.isFinite(raw)) return DEFAULT_LEAD;
  return Math.min(120, Math.max(0, raw));
}

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

/**
 * Variant nomi (rang, o'lcham). SKU nomi ba'zan mahsulot nomini takrorlaydi
 * ("Naushnik — Qora"): o'shanda faqat farq qiladigan qismi qoladi.
 */
function variantOf(skuTitle: string, productTitle: string): string | null {
  const sku = skuTitle.trim();
  const product = productTitle.trim();
  if (!sku || sku === product) return null;
  if (product && sku.startsWith(product)) {
    return sku.slice(product.length).replace(/^[\s—–\-·:,|/]+/, '').trim() || null;
  }
  return sku;
}

/** Jadvalda avval eng shoshilinch qatorlar turadi */
const STATUS_RANK: Record<PlannerRow['status'], number> = {
  critical: 0,
  ending: 1,
  enough: 2,
  no_action: 3,
};

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

/** Bitta SKU uchun reja qatori (eksport: routes/today.ts ham "yo'qotiladigan tushum"ni shundan oladi) */
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
    status,
    gapDays: Math.ceil(gapExact),
    lostRevenue: round(gapExact * rate * price),
    lostPast: round(demand.stockoutDays * rate * price),
  };
}

// ─────────────────────────── GET / — reja ───────────────────────────

type StatusFilter = PlannerRow['status'] | 'all';
const STATUS_FILTERS: StatusFilter[] = ['all', 'critical', 'ending', 'enough', 'no_action'];

function statusParam(req: Request): StatusFilter | null {
  const raw = (req.query as Record<string, string | undefined>).status;
  if (!raw) return null;
  return (STATUS_FILTERS as string[]).includes(raw) ? (raw as StatusFilter) : null;
}

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const cover = coverParam(q.cover);
    const lead = leadParam(q.lead);
    const filter = statusParam(req);

    const storeIds = await getStoreIds(company.id, range.storeId);
    const [catalog, stocks, demand, inbound] = await Promise.all([
      getSkuCatalog(storeIds, false),
      getLatestStocks(storeIds),
      getDemand(storeIds),
      getInbound(company.id, storeIds),
    ]);

    const today = parseISODate(toBusinessDate(new Date()));
    const search = range.search?.toLowerCase();

    const counts = { all: 0, critical: 0, ending: 0, enough: 0, noAction: 0 };
    // Jamlanmalar butun katalog bo'yicha — qaysi yorliq ochiq bo'lishidan qat'i nazar bir xil
    const totals = { needSkus: 0, purchaseCost: 0, lostRevenue: 0, lostPast: 0, orderNow: 0 };
    const rows: PlannerRow[] = [];

    for (const info of catalog.values()) {
      const row = buildRow({
        info,
        stock: stocks.get(info.id) ?? EMPTY_STOCK,
        inbound: inbound.get(info.id) ?? 0,
        demand: demand.get(info.id) ?? NO_DEMAND,
        cover,
        lead,
        today,
      });

      // Hisoblagichlar butun katalog bo'yicha — filtr faqat ko'rinadigan qatorlarga ta'sir qiladi
      counts.all += 1;
      if (row.status === 'critical') counts.critical += 1;
      else if (row.status === 'ending') counts.ending += 1;
      else if (row.status === 'enough') counts.enough += 1;
      else counts.noAction += 1;

      if (row.recommendedQty > 0) {
        totals.needSkus += 1;
        totals.purchaseCost += row.purchaseCost;
      }
      totals.lostRevenue += row.lostRevenue;
      totals.lostPast += row.lostPast;
      if (row.orderInDays !== null && row.orderInDays <= 0) totals.orderNow += 1;

      if (
        search &&
        !info.title.toLowerCase().includes(search) &&
        !info.productTitle.toLowerCase().includes(search) &&
        !info.sku.toLowerCase().includes(search)
      )
        continue;
      if (filter && filter !== 'all' && row.status !== filter) continue;
      // Standart ko'rinishda sotuvi yo'q SKU'lar jadvalni to'ldirmaydi (?status=all — barchasi)
      if (!filter && row.status === 'no_action') continue;

      rows.push(row);
    }

    // Shoshilinchlik bo'yicha: holat → buyurtma kuni → buyurtma summasi
    rows.sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byStatus !== 0) return byStatus;
      const da = a.orderInDays ?? Number.MAX_SAFE_INTEGER;
      const db = b.orderInDays ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return b.purchaseCost - a.purchaseCost;
    });

    const visible = rows.slice(0, MAX_ROWS);

    const payload: PlannerResponse = {
      coverDays: cover,
      leadDays: lead,
      windowDays: DEMAND_WINDOW_DAYS,
      safetyDays: SAFETY_DAYS,
      counts,
      totals: {
        needSkus: totals.needSkus,
        purchaseCost: round(totals.purchaseCost),
        lostRevenue: round(totals.lostRevenue),
        lostPast: round(totals.lostPast),
        orderNow: totals.orderNow,
      },
      rows: visible,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /shipment-draft — yetkazma qoralamasi ───────────────────────────

const shipmentDraftSchema = z.object({
  skuIds: z.array(z.string().min(1)).min(1).max(500),
  cover: z.coerce.number().optional(),
  lead: z.coerce.number().optional(),
  destination: z.string().trim().max(120).optional(),
  plannedAt: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

/** Qutilar soni: avval hajm bo'yicha, hajm noma'lum bo'lsa — dona bo'yicha */
function boxCount(qty: number, volumeL: number): number {
  if (qty <= 0) return 0;
  if (volumeL > 0) return Math.max(1, Math.ceil((qty * volumeL) / BOX_VOLUME_L));
  return Math.max(1, Math.ceil(qty / BOX_UNITS));
}

/** Kompaniya ichida ketma-ket kod: SP-2026-001 */
async function nextCode(companyId: string): Promise<string> {
  const count = await prisma.shipment.count({ where: { companyId } });
  return `SP-${new Date().getUTCFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

router.post(
  '/shipment-draft',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = shipmentDraftSchema.parse(req.body);
    const cover = coverParam(input.cover);
    const lead = leadParam(input.lead);

    const storeIds = await getStoreIds(company.id);
    const [catalog, stocks, demand, inbound] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getDemand(storeIds),
      getInbound(company.id, storeIds),
    ]);

    const ids = [...new Set(input.skuIds)];
    const picked = ids.map((id) => catalog.get(id)).filter((s): s is SkuInfo => Boolean(s));
    if (picked.length === 0) throw AppError.badRequest('Yuborilgan SKU’lar bu kompaniyada topilmadi');

    const today = parseISODate(toBusinessDate(new Date()));
    const drafts = picked.map((info) => {
      // Jadvaldagi "Tavsiya" bilan aynan bir xil son
      const supply = (stocks.get(info.id) ?? EMPTY_STOCK).total + (inbound.get(info.id) ?? 0);
      const qty = recommendedQty(demand.get(info.id)?.rate ?? 0, cover, supply, lead);
      return { info, qty, boxes: boxCount(qty, info.volumeL) };
    });

    // Yetkazma bitta do'konga tegishli bo'lsa — o'sha do'kon, aralash bo'lsa — bog'lanmaydi
    const uniqueStores = [...new Set(picked.map((s) => s.storeId))];
    const storeId = uniqueStores.length === 1 ? uniqueStores[0] : null;

    const plannedAt = input.plannedAt ? parseISODate(input.plannedAt) : addDays(today, lead);
    if (Number.isNaN(plannedAt.getTime())) throw AppError.badRequest('Sana noto‘g‘ri formatda (YYYY-MM-DD)');

    const created = await prisma.shipment.create({
      data: {
        companyId: company.id,
        storeId,
        code: await nextCode(company.id),
        destination: input.destination ?? null,
        status: 'draft',
        plannedAt,
        note: input.note ?? `Rejalashtiruvchidan: ${cover} kunlik zaxira, yetkazish ${lead} kun`,
        items: {
          create: drafts.map((d) => ({ skuId: d.info.id, qty: d.qty, accepted: 0, boxes: d.boxes })),
        },
      },
      include: { items: true },
    });

    const itemsById = new Map(drafts.map((d) => [d.info.id, d.info]));
    const items: ShipmentItemRow[] = created.items.map((it) => {
      const info = itemsById.get(it.skuId);
      return {
        id: it.id,
        skuId: it.skuId,
        sku: info?.sku ?? '—',
        title: info?.title ?? 'Noma’lum SKU',
        qty: it.qty,
        accepted: it.accepted,
        boxes: it.boxes,
      } satisfies ShipmentItemRow;
    });

    const costValue = drafts.reduce(
      (s, d) => s + d.qty * (d.info.purchasePrice + d.info.extraCost),
      0,
    );

    const payload: ShipmentRow = {
      id: created.id,
      code: created.code,
      destination: created.destination,
      status: 'draft',
      plannedAt: created.plannedAt ? toISODate(created.plannedAt) : null,
      acceptedAt: null,
      source: 'manual',
      itemsCount: items.length,
      unitsCount: items.reduce((s, i) => s + i.qty, 0),
      costValue: round(costValue),
      note: created.note,
      items,
    };

    res.status(201).json(payload);
  }),
);

export default router;
