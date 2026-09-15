/**
 * Yetkazib berish rejalashtiruvchisi — /api/v1/planner
 *
 *  GET  / → PlannerResponse: har bir SKU uchun qoldiq necha kunga yetadi,
 *           tanlangan zaxira davri (cover) va yetkazish muddati (lead) uchun
 *           qancha buyurtma qilish kerak, qancha tushum yo'qotilishi mumkin.
 *  POST /shipment-draft → tanlangan SKU'lardan yetkazma qoralamasi (Shipment + ShipmentItem).
 *
 * Prognoz `@savdoiq/shared/calc.ts` dagi umumiy formulalarga tayanadi
 * (`recommendedQty`, `forecastUnits`) — sayt va API bir xil natija beradi.
 */
import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import {
  STOCK_THRESHOLDS,
  addDays,
  forecastUnits,
  parseISODate,
  recommendedQty,
  round,
  toISODate,
  type PlannerResponse,
  type PlannerRow,
  type ShipmentItemRow,
  type ShipmentRow,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import {
  getAvgDaily,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  type SkuInfo,
  type StockInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('planner'));

/** Zaxira davri chegaralari (kun) — saytdagi slayder bilan bir xil */
const COVER_MIN = 7;
const COVER_MAX = 90;
const DEFAULT_COVER = 30;
/** Yetkazib berish muddati (kun) — buyurtma berilgandan omborga tushgunga qadar */
const DEFAULT_LEAD = 7;
/** O'rtacha kunlik sotuvni hisoblash oynasi (kun) */
const AVG_WINDOW = 30;
/** Javobdagi qatorlar chegarasi — jadval cheksiz o'smasligi uchun */
const MAX_ROWS = 1000;
/** Standart quti hajmi (litr) va qutidagi dona — yetkazma qoralamasi uchun */
const BOX_VOLUME_L = 60;
const BOX_UNITS = 20;

const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };

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
 * Holat: kritik (7 kundan kam qoldi), tugayapti (14 kungacha),
 * yetarli, harakat kerak emas (sotuv yo'q — prognoz qurib bo'lmaydi).
 */
function plannerStatus(avgDaily: number, daysLeft: number | null): PlannerRow['status'] {
  if (avgDaily <= 0 || daysLeft === null) return 'no_action';
  if (daysLeft <= STOCK_THRESHOLDS.critical) return 'critical';
  if (daysLeft <= STOCK_THRESHOLDS.low) return 'ending';
  return 'enough';
}

/** Jadvalda avval eng shoshilinch qatorlar turadi */
const STATUS_RANK: Record<PlannerRow['status'], number> = {
  critical: 0,
  ending: 1,
  enough: 2,
  no_action: 3,
};

interface PlanInput {
  info: SkuInfo;
  stock: StockInfo;
  avgDaily: number;
  cover: number;
  lead: number;
  /** Bugungi kun (UTC yarim tunga tenglashtirilgan) */
  today: Date;
}

/** Bitta SKU uchun reja qatori */
function buildRow(inp: PlanInput): PlannerRow {
  const total = inp.stock.total;
  const avg = inp.avgDaily;
  const daysLeft = avg > 0 ? Math.round(total / avg) : null;
  const qty = recommendedQty(avg, inp.cover, total, inp.lead);
  const unitCost = inp.info.purchasePrice + inp.info.extraCost;

  // Zaxira davridagi talabning qoldiq bilan qoplanmagan qismi — yo'qotilgan tushum
  const demand = forecastUnits(avg, inp.cover);
  const missed = Math.max(0, demand - total);

  return {
    skuId: inp.info.id,
    sku: inp.info.sku,
    title: inp.info.title,
    imageUrl: inp.info.imageUrl,
    stock: total,
    avgDaily: round(avg, 2),
    daysLeft,
    recommendedQty: qty,
    purchaseCost: round(qty * unitCost),
    status: plannerStatus(avg, daysLeft),
    stockoutDate: daysLeft === null ? null : toISODate(addDays(inp.today, daysLeft)),
    lostRevenue: round(missed * inp.info.price),
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
    const [catalog, stocks, avgDaily] = await Promise.all([
      getSkuCatalog(storeIds, false),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, AVG_WINDOW),
    ]);

    const today = parseISODate(toISODate(new Date()));
    const search = range.search?.toLowerCase();

    const counts = { all: 0, critical: 0, ending: 0, enough: 0, noAction: 0 };
    const rows: PlannerRow[] = [];

    for (const info of catalog.values()) {
      const row = buildRow({
        info,
        stock: stocks.get(info.id) ?? EMPTY_STOCK,
        avgDaily: avgDaily.get(info.id) ?? 0,
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

      if (search && !info.title.toLowerCase().includes(search) && !info.sku.toLowerCase().includes(search))
        continue;
      if (filter && filter !== 'all' && row.status !== filter) continue;
      // Standart ko'rinishda sotuvi yo'q SKU'lar jadvalni to'ldirmaydi (?status=all — barchasi)
      if (!filter && row.status === 'no_action') continue;

      rows.push(row);
    }

    // Shoshilinchlik bo'yicha: holat → qoldiq kunlari → buyurtma summasi
    rows.sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byStatus !== 0) return byStatus;
      const da = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const db = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return b.purchaseCost - a.purchaseCost;
    });

    const visible = rows.slice(0, MAX_ROWS);

    const payload: PlannerResponse = {
      coverDays: cover,
      counts,
      totalPurchaseCost: round(visible.reduce((s, r) => s + r.purchaseCost, 0)),
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
    const [catalog, stocks, avgDaily] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, AVG_WINDOW),
    ]);

    const ids = [...new Set(input.skuIds)];
    const picked = ids.map((id) => catalog.get(id)).filter((s): s is SkuInfo => Boolean(s));
    if (picked.length === 0) throw AppError.badRequest('Yuborilgan SKU’lar bu kompaniyada topilmadi');

    const today = parseISODate(toISODate(new Date()));
    const drafts = picked.map((info) => {
      const stock = stocks.get(info.id) ?? EMPTY_STOCK;
      const avg = avgDaily.get(info.id) ?? 0;
      const qty = recommendedQty(avg, cover, stock.total, lead);
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
