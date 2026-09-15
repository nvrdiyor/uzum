/**
 * Ombor moduli — /api/v1/warehouse
 *
 *  GET    /shipments          → Paginated<ShipmentRow> (status filtri, qidiruv)
 *  GET    /shipments/:id      → ShipmentRow (pozitsiyalari bilan)
 *  POST   /shipments          → yangi yetkazma (qoralama)
 *  PATCH  /shipments/:id      → tahrirlash / holatni o'zgartirish
 *  DELETE /shipments/:id      → o'chirish (qabul qilingani o'chirilmaydi)
 *  GET    /losses             → LossesResponse (yo'qotishlar)
 *  POST   /losses/:id/claim   → da'vo yuborilgan deb belgilash
 *  GET    /losses/claim-draft → { text } — Uzum qo'llab-quvvatlashiga da'vo matni
 *  GET    /returns            → ReturnsResponse (sabablar taqsimoti bilan)
 *  GET    /storage            → StorageResponse (pullik saqlash)
 *  GET    /vgh                → tovar aylanmasi (aylanma kunlari, band kapital)
 *
 * Barcha pul qiymatlari UZS (butun so'm), sanalar ISO-8601.
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import { z } from 'zod';
import {
  daysBetween,
  eachDay,
  formatDate,
  formatNumber,
  parseISODate,
  pct,
  round,
  safeDiv,
  shipmentSchema,
  toISODate,
  type LossRow,
  type LossesResponse,
  type Paginated,
  type Period,
  type ReturnRow,
  type ReturnsResponse,
  type ShipmentItemRow,
  type ShipmentRow,
  type StorageResponse,
  type StorageRow,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import { aggregateSales, getSkuCatalog, getStoreIds, getStoreTitles } from '../services/common.js';
import { notifyCompanyOwners } from '../services/notify.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Yetkazmalar: yordamchilar ───────────────────────────

type ShipmentStatus = ShipmentRow['status'];

const SHIPMENT_STATUSES: ShipmentStatus[] = ['draft', 'planned', 'in_transit', 'accepted', 'canceled'];

/** Bazadagi eski/boshqacha nomlar → shartnomadagi holatlar */
const STATUS_ALIASES: Record<string, ShipmentStatus> = {
  new: 'draft',
  sent: 'in_transit',
  shipped: 'in_transit',
  transit: 'in_transit',
  done: 'accepted',
  received: 'accepted',
  cancelled: 'canceled',
};

function toShipmentStatus(value: string): ShipmentStatus {
  if ((SHIPMENT_STATUSES as string[]).includes(value)) return value as ShipmentStatus;
  return STATUS_ALIASES[value] ?? 'draft';
}

/** Filtrda bir holatga mos keluvchi barcha baza qiymatlari */
function statusDbValues(status: ShipmentStatus): string[] {
  const aliases = Object.entries(STATUS_ALIASES)
    .filter(([, v]) => v === status)
    .map(([k]) => k);
  return [status, ...aliases];
}

/** Ruxsat etilgan holat o'tishlari: draft → planned → in_transit → accepted */
const NEXT_STATUS: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ['planned', 'canceled'],
  planned: ['draft', 'in_transit', 'canceled'],
  in_transit: ['planned', 'accepted', 'canceled'],
  accepted: [],
  canceled: [],
};

const STATUS_LABEL: Record<ShipmentStatus, string> = {
  draft: 'Qoralama',
  planned: 'Rejalashtirilgan',
  in_transit: 'Yo‘lda',
  accepted: 'Qabul qilingan',
  canceled: 'Bekor qilingan',
};

interface ShipmentItemWithSku {
  id: string;
  skuId: string;
  qty: number;
  accepted: number;
  boxes: number;
  sku: { sku: string; title: string; purchasePrice: number; extraCost: number };
}

interface ShipmentWithItems {
  id: string;
  code: string;
  destination: string | null;
  status: string;
  plannedAt: Date | null;
  acceptedAt: Date | null;
  note: string | null;
  items: ShipmentItemWithSku[];
}

/** Prisma so'rovi uchun umumiy `include` (pozitsiya + SKU ma'lumoti) */
const SHIPMENT_INCLUDE = {
  items: {
    include: { sku: { select: { sku: true, title: true, purchasePrice: true, extraCost: true } } },
    orderBy: { id: 'asc' },
  },
} as const;

function toShipmentRow(s: ShipmentWithItems, withItems: boolean): ShipmentRow {
  let unitsCount = 0;
  let costValue = 0;

  const items: ShipmentItemRow[] = s.items.map((it) => {
    unitsCount += it.qty;
    costValue += it.qty * (it.sku.purchasePrice + it.sku.extraCost);
    return {
      id: it.id,
      skuId: it.skuId,
      sku: it.sku.sku,
      title: it.sku.title,
      qty: it.qty,
      accepted: it.accepted,
      boxes: it.boxes,
    };
  });

  const row: ShipmentRow = {
    id: s.id,
    code: s.code,
    destination: s.destination,
    status: toShipmentStatus(s.status),
    plannedAt: s.plannedAt ? toISODate(s.plannedAt) : null,
    acceptedAt: s.acceptedAt ? s.acceptedAt.toISOString() : null,
    itemsCount: items.length,
    unitsCount,
    costValue: round(costValue),
    note: s.note,
  };
  if (withItems) row.items = items;
  return row;
}

/** Do'kon shu kompaniyaga tegishlimi */
async function resolveStoreId(companyId: string, storeId?: string | null): Promise<string | null> {
  if (!storeId) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
  if (!store) throw AppError.badRequest('Do‘kon topilmadi');
  return store.id;
}

interface ShipmentItemInput {
  skuId: string;
  qty: number;
  boxes: number;
  accepted?: number;
}

/** Pozitsiyalarni tekshiradi va bir xil SKU'larni birlashtiradi */
async function normalizeItems(storeIds: string[], items: ShipmentItemInput[]): Promise<ShipmentItemInput[]> {
  if (items.length === 0) return [];

  const merged = new Map<string, ShipmentItemInput>();
  for (const it of items) {
    const cur = merged.get(it.skuId) ?? { skuId: it.skuId, qty: 0, boxes: 0, accepted: 0 };
    cur.qty += it.qty;
    cur.boxes += it.boxes;
    cur.accepted = (cur.accepted ?? 0) + (it.accepted ?? 0);
    merged.set(it.skuId, cur);
  }

  const ids = [...merged.keys()];
  const found = await prisma.sku.findMany({
    where: { id: { in: ids }, storeId: { in: storeIds } },
    select: { id: true },
  });
  const known = new Set(found.map((f) => f.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0)
    throw AppError.badRequest(`Ushbu SKU'lar topilmadi: ${unknown.slice(0, 5).join(', ')}`);

  return [...merged.values()];
}

/** Takrorlanmaydigan yetkazma kodi: SP-2026-001 */
async function nextShipmentCode(companyId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.shipment.count({ where: { companyId } });
  for (let i = 0; i < 100; i += 1) {
    const code = `SP-${year}-${String(count + 1 + i).padStart(3, '0')}`;
    const exists = await prisma.shipment.findFirst({ where: { companyId, code }, select: { id: true } });
    if (!exists) return code;
  }
  return `SP-${year}-${String(Date.now()).slice(-6)}`;
}

/**
 * Yetkazma qabul qilinganda qoldiqni yangilaydi:
 * o'z ombori (own) kamayadi, FBO oshadi, yo'ldagi miqdor (inTransit) kamayadi.
 * Bugungi kun uchun StockSnapshot yaratiladi yoki yangilanadi.
 */
async function applyAcceptance(items: { skuId: string; accepted: number }[]): Promise<void> {
  const today = parseISODate(toISODate(new Date()));

  for (const it of items) {
    if (it.accepted <= 0) continue;

    const sku = await prisma.sku.findUnique({ where: { id: it.skuId }, select: { id: true, storeId: true } });
    if (!sku) continue;

    const last = await prisma.stockSnapshot.findFirst({
      where: { skuId: sku.id },
      orderBy: { date: 'desc' },
      select: { fbo: true, fbs: true, own: true, reserved: true, inTransit: true },
    });
    const base = last ?? { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0 };

    const next = {
      fbo: base.fbo + it.accepted,
      fbs: base.fbs,
      own: Math.max(0, base.own - it.accepted),
      reserved: base.reserved,
      inTransit: Math.max(0, base.inTransit - it.accepted),
    };

    await prisma.stockSnapshot.upsert({
      where: { skuId_date: { skuId: sku.id, date: today } },
      update: next,
      create: { skuId: sku.id, storeId: sku.storeId, date: today, ...next },
    });
  }
}

// ─────────────────────────── GET /shipments ───────────────────────────

router.get(
  '/shipments',
  requireFeature('shipments'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;

    const status =
      q.status && q.status !== 'all' && (SHIPMENT_STATUSES as string[]).includes(q.status)
        ? (q.status as ShipmentStatus)
        : undefined;

    const shipments = await prisma.shipment.findMany({
      where: {
        companyId: company.id,
        ...(range.storeId ? { storeId: range.storeId } : {}),
        ...(status ? { status: { in: statusDbValues(status) } } : {}),
        ...(range.search
          ? {
              OR: [
                { code: { contains: range.search } },
                { destination: { contains: range.search } },
                { note: { contains: range.search } },
              ],
            }
          : {}),
      },
      include: SHIPMENT_INCLUDE,
      orderBy: { createdAt: range.order === 'asc' ? 'asc' : 'desc' },
    });

    const rows = shipments.map((s) => toShipmentRow(s, false));
    res.json(paginate(rows, range.page, range.pageSize) satisfies Paginated<ShipmentRow>);
  }),
);

// ─────────────────────────── GET /shipments/:id ───────────────────────────

router.get(
  '/shipments/:id',
  requireFeature('shipments'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const shipment = await prisma.shipment.findFirst({
      where: { id: String(req.params.id), companyId: company.id },
      include: SHIPMENT_INCLUDE,
    });
    if (!shipment) throw AppError.notFound('Yetkazma topilmadi');
    res.json(toShipmentRow(shipment, true));
  }),
);

// ─────────────────────────── POST /shipments ───────────────────────────

router.post(
  '/shipments',
  requireFeature('shipments'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = shipmentSchema.parse(req.body ?? {});

    const storeId = await resolveStoreId(company.id, input.storeId);
    const storeIds = await getStoreIds(company.id, storeId ?? undefined);
    const items = await normalizeItems(storeIds, input.items);

    const created = await prisma.shipment.create({
      data: {
        companyId: company.id,
        storeId,
        code: input.code?.trim() || (await nextShipmentCode(company.id)),
        destination: input.destination ?? null,
        status: 'draft',
        plannedAt: input.plannedAt ? parseISODate(input.plannedAt) : null,
        note: input.note ?? null,
        items: {
          create: items.map((it) => ({ skuId: it.skuId, qty: it.qty, boxes: it.boxes, accepted: 0 })),
        },
      },
      include: SHIPMENT_INCLUDE,
    });

    res.status(201).json(toShipmentRow(created, true));
  }),
);

// ─────────────────────────── PATCH /shipments/:id ───────────────────────────

const shipmentPatchSchema = z.object({
  status: z.enum(['draft', 'planned', 'in_transit', 'accepted', 'canceled']).optional(),
  code: z.string().trim().min(1).max(60).optional(),
  storeId: z.string().nullable().optional(),
  destination: z.string().max(120).nullable().optional(),
  plannedAt: z.string().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        skuId: z.string(),
        qty: z.coerce.number().int().min(0),
        boxes: z.coerce.number().int().min(0).default(0),
        /** Qabulda haqiqatda olingan miqdor */
        accepted: z.coerce.number().int().min(0).optional(),
      }),
    )
    .optional(),
});

router.patch(
  '/shipments/:id',
  requireFeature('shipments'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const input = shipmentPatchSchema.parse(req.body ?? {});

    const existing = await prisma.shipment.findFirst({
      where: { id, companyId: company.id },
      include: SHIPMENT_INCLUDE,
    });
    if (!existing) throw AppError.notFound('Yetkazma topilmadi');

    const current = toShipmentStatus(existing.status);
    const nextStatus = input.status ?? current;

    if (nextStatus !== current && !NEXT_STATUS[current].includes(nextStatus)) {
      throw AppError.badRequest(
        `“${STATUS_LABEL[current]}” holatidan “${STATUS_LABEL[nextStatus]}” holatiga o‘tish mumkin emas`,
        { from: current, to: nextStatus, allowed: NEXT_STATUS[current] },
      );
    }
    if (current === 'accepted' && input.items)
      throw AppError.badRequest('Qabul qilingan yetkazma pozitsiyalarini o‘zgartirib bo‘lmaydi');

    const storeId = input.storeId === undefined ? undefined : await resolveStoreId(company.id, input.storeId);
    const storeIds = await getStoreIds(company.id);

    // Pozitsiyalar to'liq almashtiriladi (mijoz jadvalni butunlay yuboradi)
    if (input.items) {
      const items = await normalizeItems(storeIds, input.items);
      await prisma.shipmentItem.deleteMany({ where: { shipmentId: existing.id } });
      if (items.length > 0) {
        await prisma.shipmentItem.createMany({
          data: items.map((it) => ({
            shipmentId: existing.id,
            skuId: it.skuId,
            qty: it.qty,
            boxes: it.boxes,
            accepted: Math.min(it.accepted ?? 0, it.qty),
          })),
        });
      }
    }

    const becomesAccepted = nextStatus === 'accepted' && current !== 'accepted';

    if (becomesAccepted) {
      // Qabul miqdori: so'rovda kelgan `accepted`, bo'lmasa mavjud qiymat, u ham bo'lmasa — rejadagi miqdor
      const sent = new Map<string, number>();
      for (const it of input.items ?? []) {
        if (it.accepted !== undefined) sent.set(it.skuId, it.accepted);
      }
      const rows = await prisma.shipmentItem.findMany({
        where: { shipmentId: existing.id },
        select: { id: true, skuId: true, qty: true, accepted: true },
      });

      const applied: { skuId: string; accepted: number }[] = [];
      for (const it of rows) {
        const raw = sent.get(it.skuId) ?? (it.accepted > 0 ? it.accepted : it.qty);
        const accepted = Math.max(0, Math.min(raw, it.qty));
        if (accepted !== it.accepted) {
          await prisma.shipmentItem.update({ where: { id: it.id }, data: { accepted } });
        }
        applied.push({ skuId: it.skuId, accepted });
      }

      await applyAcceptance(applied);
    }

    const updated = await prisma.shipment.update({
      where: { id: existing.id },
      data: {
        ...(input.status !== undefined ? { status: nextStatus } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(storeId !== undefined ? { storeId } : {}),
        ...(input.destination !== undefined ? { destination: input.destination } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.plannedAt !== undefined
          ? { plannedAt: input.plannedAt ? parseISODate(input.plannedAt) : null }
          : {}),
        ...(becomesAccepted ? { acceptedAt: new Date() } : {}),
      },
      include: SHIPMENT_INCLUDE,
    });

    const row = toShipmentRow(updated, true);

    if (becomesAccepted) {
      await notifyCompanyOwners(company.id, {
        type: 'success',
        title: `Yetkazma qabul qilindi — ${row.code}`,
        body: `${formatNumber(row.unitsCount, 'uz')} dona tovar omborga kirim qilindi. Qoldiqlar yangilandi.`,
        link: '/warehouse',
      });
    }

    res.json(row);
  }),
);

// ─────────────────────────── DELETE /shipments/:id ───────────────────────────

router.delete(
  '/shipments/:id',
  requireFeature('shipments'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);

    const existing = await prisma.shipment.findFirst({
      where: { id, companyId: company.id },
      select: { id: true, code: true, status: true },
    });
    if (!existing) throw AppError.notFound('Yetkazma topilmadi');
    if (toShipmentStatus(existing.status) === 'accepted')
      throw AppError.badRequest('Qabul qilingan yetkazmani o‘chirib bo‘lmaydi');

    await prisma.shipment.delete({ where: { id: existing.id } });
    res.json({ ok: true, id: existing.id, message: `${existing.code} yetkazmasi o‘chirildi` });
  }),
);

// ─────────────────────────── Yo'qotishlar ───────────────────────────

const LOSS_STATUSES: LossRow['status'][] = ['open', 'claimed', 'compensated', 'rejected'];

function toLossType(value: string): LossRow['type'] {
  if (value === 'lost' || value === 'damaged' || value === 'not_delivered') return value;
  if (value === 'shortage' || value === 'missing' || value === 'undelivered') return 'not_delivered';
  if (value === 'broken' || value === 'defect') return 'damaged';
  return 'lost';
}

function toLossStatus(value: string): LossRow['status'] {
  return (LOSS_STATUSES as string[]).includes(value) ? (value as LossRow['status']) : 'open';
}

const LOSS_TYPE_LABEL: Record<LossRow['type'], string> = {
  lost: 'Yo‘qolgan',
  damaged: 'Shikastlangan',
  not_delivered: 'Yetib kelmagan',
};

interface DbLoss {
  id: string;
  skuId: string | null;
  type: string;
  scheme: string;
  qty: number;
  amount: number;
  compensated: number;
  status: string;
  happenedAt: Date;
}

/** Yo'qotish yozuvlarini olish uchun umumiy filtr */
function lossWhere(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  q: Record<string, string | undefined>,
) {
  const scheme = q.scheme === 'FBO' || q.scheme === 'FBS' ? q.scheme : undefined;
  const status =
    q.status && q.status !== 'all' && (LOSS_STATUSES as string[]).includes(q.status) ? q.status : undefined;
  return {
    storeId: { in: storeIds },
    happenedAt: { gte: from, lt: toExclusive },
    ...(scheme ? { scheme } : {}),
    ...(status ? { status } : {}),
  };
}

function toLossRow(l: DbLoss, catalog: Map<string, { sku: string; title: string; imageUrl: string | null }>): LossRow {
  const info = l.skuId ? catalog.get(l.skuId) : undefined;
  return {
    id: l.id,
    sku: info?.sku ?? null,
    title: info?.title ?? null,
    imageUrl: info?.imageUrl ?? null,
    type: toLossType(l.type),
    scheme: l.scheme === 'FBS' ? 'FBS' : 'FBO',
    qty: l.qty,
    amount: round(l.amount),
    compensated: round(l.compensated),
    status: toLossStatus(l.status),
    happenedAt: toISODate(l.happenedAt),
  };
}

/** GET /losses — yo'qotishlar ro'yxati */
router.get(
  '/losses',
  requireFeature('losses_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;

    if (storeIds.length === 0) {
      const empty: LossesResponse = {
        totals: { skuCount: 0, qty: 0, amount: 0, compensated: 0 },
        rows: paginate<LossRow>([], range.page, range.pageSize),
      };
      res.json(empty);
      return;
    }

    const [losses, catalog] = await Promise.all([
      prisma.lossRecord.findMany({
        where: lossWhere(storeIds, range.from, range.toExclusive, q),
        orderBy: { happenedAt: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      getSkuCatalog(storeIds, true),
    ]);

    const search = range.search?.toLowerCase();
    const rows = losses
      .map((l) => toLossRow(l, catalog))
      .filter((r) => !search || `${r.sku ?? ''} ${r.title ?? ''}`.toLowerCase().includes(search));

    // Yig'indi ko'rinib turgan (filtrlangan) satrlar bo'yicha hisoblanadi
    const skuIds = new Set<string>();
    let qty = 0;
    let amount = 0;
    let compensated = 0;
    for (const r of rows) {
      if (r.sku) skuIds.add(r.sku);
      qty += r.qty;
      amount += r.amount;
      compensated += r.compensated;
    }

    const payload: LossesResponse = {
      totals: { skuCount: skuIds.size, qty, amount: round(amount), compensated: round(compensated) },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

/** GET /losses/claim-draft — Uzum qo'llab-quvvatlash xizmatiga da'vo matni */
router.get(
  '/losses/claim-draft',
  requireFeature('losses_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;

    // Da'voga faqat hali qoplanmagan yozuvlar kiritiladi (aniq status so'ralmasa)
    const draftStatus =
      q.status && q.status !== 'all' && (LOSS_STATUSES as string[]).includes(q.status) ? q.status : null;

    const [losses, catalog, storeTitles] = await Promise.all([
      storeIds.length
        ? prisma.lossRecord.findMany({
            where: {
              ...lossWhere(storeIds, range.from, range.toExclusive, q),
              status: draftStatus ?? { in: ['open', 'claimed'] },
            },
            orderBy: { happenedAt: 'asc' },
          })
        : Promise.resolve([]),
      getSkuCatalog(storeIds, true),
      getStoreTitles(company.id),
    ]);

    const rows = losses.map((l) => toLossRow(l, catalog));
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const stores = range.storeId
      ? [storeTitles.get(range.storeId) ?? 'Do‘kon']
      : [...storeTitles.values()].slice(0, 10);

    // Tekis ustunli jadval (matn monoshirift bilan ko'rsatiladi)
    const header = ['№', 'SKU', 'Sana', 'Sxema', 'Holat', 'Dona', 'Summa (so‘m)'];
    const body = rows.map((r, i) => [
      String(i + 1),
      r.sku ?? '—',
      formatDate(r.happenedAt, 'uz'),
      r.scheme,
      LOSS_TYPE_LABEL[r.type],
      formatNumber(r.qty, 'uz'),
      formatNumber(r.amount, 'uz'),
    ]);
    const widths = header.map((h, col) =>
      Math.max(h.length, ...body.map((line) => line[col].length), 3),
    );
    const renderLine = (cells: string[]): string =>
      cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();

    const table =
      rows.length > 0
        ? [renderLine(header), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(renderLine)].join('\n')
        : 'Tanlangan davrda qoplanmagan yo‘qotish topilmadi.';

    const text = [
      'Uzum Market qo‘llab-quvvatlash xizmatiga',
      '',
      `Kompaniya: ${company.name}`,
      `Do‘kon(lar): ${stores.length ? stores.join(', ') : '—'}`,
      `Davr: ${formatDate(range.period.from, 'uz')} — ${formatDate(range.period.to, 'uz')}`,
      '',
      'Assalomu alaykum!',
      '',
      'Quyidagi tovarlar bo‘yicha ombor/yetkazib berish bosqichida yo‘qotish qayd etildi.',
      'Iltimos, holatni tekshirib, kompensatsiya ajratishingizni so‘raymiz.',
      '',
      table,
      '',
      `Jami: ${formatNumber(rows.length, 'uz')} ta pozitsiya, ${formatNumber(totalQty, 'uz')} dona, ${formatNumber(
        round(totalAmount),
        'uz',
      )} so‘m.`,
      '',
      'Ilova sifatida yetkazma hujjatlari va ombor hisobotlarini taqdim etishga tayyormiz.',
      'Javobingizni kutamiz.',
      '',
      'Hurmat bilan,',
      company.name,
    ].join('\n');

    res.json({
      text,
      count: rows.length,
      qty: totalQty,
      amount: round(totalAmount),
      period: range.period satisfies Period,
    });
  }),
);

/** POST /losses/:id/claim — da'vo yuborilgan deb belgilash */
router.post(
  '/losses/:id/claim',
  requireFeature('losses_report'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const storeIds = await getStoreIds(company.id);

    const existing = await prisma.lossRecord.findFirst({
      where: { id, storeId: { in: storeIds } },
    });
    if (!existing) throw AppError.notFound('Yo‘qotish yozuvi topilmadi');

    const status = toLossStatus(existing.status);
    if (status === 'compensated') throw AppError.badRequest('Bu yo‘qotish allaqachon qoplangan');
    if (status === 'claimed') throw AppError.badRequest('Da’vo allaqachon yuborilgan');

    const note = typeof req.body?.note === 'string' ? String(req.body.note).slice(0, 500) : undefined;

    const updated = await prisma.lossRecord.update({
      where: { id: existing.id },
      data: { status: 'claimed', claimSentAt: new Date(), ...(note ? { note } : {}) },
    });

    const catalog = await getSkuCatalog(storeIds, true);
    const row = toLossRow(updated, catalog);

    await notifyCompanyOwners(company.id, {
      type: 'info',
      title: 'Yo‘qotish bo‘yicha da’vo yuborildi',
      body: `${row.sku ?? 'SKU'} — ${formatNumber(row.qty, 'uz')} dona, ${formatNumber(row.amount, 'uz')} so‘m. Uzum javobini kuting.`,
      link: '/losses',
    });

    res.json(row);
  }),
);

// ─────────────────────────── Qaytarishlar ───────────────────────────

const NO_REASON = 'Sabab ko‘rsatilmagan';

router.get(
  '/returns',
  requireFeature('returns_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;

    if (storeIds.length === 0) {
      const empty: ReturnsResponse = {
        totals: { qty: 0, amount: 0, rate: 0 },
        byReason: [],
        daily: [],
        topRisky: [],
        rows: paginate<ReturnRow>([], range.page, range.pageSize),
      };
      res.json(empty);
      return;
    }

    const [returns, catalog, sales] = await Promise.all([
      prisma.returnRecord.findMany({
        where: {
          storeId: { in: storeIds },
          returnedAt: { gte: range.from, lt: range.toExclusive },
          ...(q.status && q.status !== 'all' ? { status: q.status } : {}),
          ...(q.reason && q.reason !== 'all' ? { reason: q.reason } : {}),
        },
        orderBy: { returnedAt: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);

    let soldUnits = 0;
    for (const agg of sales.values()) soldUnits += agg.units;

    const byReason = new Map<string, number>();
    const search = range.search?.toLowerCase();
    let qty = 0;
    let amount = 0;

    const rows: ReturnRow[] = [];
    for (const r of returns) {
      const info = r.skuId ? catalog.get(r.skuId) : undefined;

      const row: ReturnRow = {
        id: r.id,
        sku: info?.sku ?? null,
        title: info?.title ?? null,
        imageUrl: info?.imageUrl ?? null,
        orderCode: r.orderCode,
        qty: r.qty,
        amount: round(r.amount),
        reason: r.reason,
        status: r.status,
        returnedAt: toISODate(r.returnedAt),
      };
      if (search) {
        const hay = `${row.sku ?? ''} ${row.title ?? ''} ${row.orderCode ?? ''} ${row.reason ?? ''}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      // Yig'indi va sabablar taqsimoti — faqat ko'rinib turgan satrlar bo'yicha
      qty += row.qty;
      amount += row.amount;
      const reason = r.reason?.trim() || NO_REASON;
      byReason.set(reason, (byReason.get(reason) ?? 0) + row.qty);

      rows.push(row);
    }

    /**
     * Kunlik seriya va "eng ko'p qaytariladigan" ro'yxati BUTUN davr bo'yicha
     * hisoblanadi. Ilgari sayt buni faqat jadvalning joriy 25 qatoridan
     * yasardi — 2-sahifaga o'tilganda grafik butunlay o'zgarib ketardi.
     */
    const dailyMap = new Map<string, { qty: number; amount: number }>();
    const riskyMap = new Map<
      string,
      { key: string; sku: string | null; title: string | null; imageUrl: string | null; qty: number; amount: number }
    >();
    for (const r of rows) {
      const day = String(r.returnedAt).slice(0, 10);
      const d = dailyMap.get(day) ?? { qty: 0, amount: 0 };
      d.qty += r.qty;
      d.amount += r.amount;
      dailyMap.set(day, d);

      const key = r.sku ?? r.title ?? r.id;
      const k = riskyMap.get(key) ?? { key, sku: r.sku, title: r.title, imageUrl: r.imageUrl, qty: 0, amount: 0 };
      k.qty += r.qty;
      k.amount += r.amount;
      riskyMap.set(key, k);
    }

    const payload: ReturnsResponse = {
      totals: {
        qty,
        amount: round(amount),
        // Qaytarish ulushi: qaytgan dona / (sotilgan + qaytgan)
        rate: pct(qty, soldUnits + qty),
      },
      daily: [...dailyMap.entries()]
        .map(([date, v]) => ({ date, qty: v.qty, amount: round(v.amount) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topRisky: [...riskyMap.values()]
        .map((v) => ({ ...v, amount: round(v.amount), share: pct(v.qty, qty) }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8),
      byReason: [...byReason.entries()]
        .map(([reason, reasonQty]) => ({ reason, qty: reasonQty, share: pct(reasonQty, qty) }))
        .sort((a, b) => b.qty - a.qty),
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Pullik saqlash ───────────────────────────

router.get(
  '/storage',
  requireFeature('paid_storage'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const days = eachDay(range.period);

    if (storeIds.length === 0) {
      const empty: StorageResponse = {
        totals: { amount: 0, perDay: 0, volumeL: 0 },
        daily: days.map((date) => ({ date, amount: 0 })),
        rows: paginate<StorageRow>([], range.page, range.pageSize),
      };
      res.json(empty);
      return;
    }

    const [fees, catalog, sales] = await Promise.all([
      prisma.storageFee.findMany({
        where: { storeId: { in: storeIds }, date: { gte: range.from, lt: range.toExclusive } },
        select: { skuId: true, date: true, qty: true, volumeL: true, amount: true },
      }),
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);

    interface FeeAgg {
      qtyDays: number;
      volumeDays: number;
      amount: number;
      days: Set<string>;
    }

    const bySku = new Map<string, FeeAgg>();
    const byDay = new Map<string, number>(days.map((d) => [d, 0]));
    let totalAmount = 0;
    let totalVolumeDays = 0;

    for (const f of fees) {
      const key = f.skuId ?? '';
      const cur = bySku.get(key) ?? { qtyDays: 0, volumeDays: 0, amount: 0, days: new Set<string>() };
      const dayKey = toISODate(f.date);
      cur.qtyDays += f.qty;
      cur.volumeDays += f.volumeL;
      cur.amount += f.amount;
      cur.days.add(dayKey);
      bySku.set(key, cur);

      totalAmount += f.amount;
      totalVolumeDays += f.volumeL;
      if (byDay.has(dayKey)) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + f.amount);
    }

    const rows: StorageRow[] = [];
    for (const [skuId, agg] of bySku) {
      const info = skuId ? catalog.get(skuId) : undefined;
      const daysStored = agg.days.size || 1;
      const avgQty = Math.round(agg.qtyDays / daysStored);
      const profit = skuId ? sales.get(skuId)?.netProfit ?? 0 : 0;

      rows.push({
        skuId: skuId || null,
        sku: info?.sku ?? null,
        title: info?.title ?? null,
        qty: avgQty,
        volumeL: round(agg.volumeDays / daysStored, 2),
        amount: round(agg.amount),
        perUnit: round(safeDiv(agg.amount, avgQty)),
        daysStored: agg.days.size,
        // Saqlash to'lovi shu SKU foydasining necha foizini "yeb" qo'ymoqda
        shareOfProfit: profit > 0 ? pct(agg.amount, profit) : agg.amount > 0 ? 100 : 0,
      });
    }

    const sortKey = range.sort ?? 'amount';
    const dir = range.order === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const value = (r: StorageRow): number =>
        sortKey === 'qty' ? r.qty : sortKey === 'share' ? r.shareOfProfit : sortKey === 'perUnit' ? r.perUnit : r.amount;
      const diff = (value(a) - value(b)) * dir;
      return diff !== 0 ? diff : b.amount - a.amount;
    });

    const payload: StorageResponse = {
      totals: {
        amount: round(totalAmount),
        perDay: round(safeDiv(totalAmount, days.length)),
        volumeL: round(safeDiv(totalVolumeDays, days.length), 2),
      },
      daily: days.map((date) => ({ date, amount: round(byDay.get(date) ?? 0) })),
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Tovar aylanmasi (VGH) ───────────────────────────

interface VghRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  storeId: string;
  storeTitle: string;
  /** Davrdagi o'rtacha qoldiq (dona) */
  avgStock: number;
  /** Davr oxiridagi qoldiq (dona) */
  stock: number;
  unitsSold: number;
  /** Kunlik o'rtacha sotuv — sotuv tezligi */
  avgDaily: number;
  /** Aylanma kunlari: o'rtacha qoldiq / kunlik sotuv */
  turnoverDays: number | null;
  /** Davrda necha marta aylandi */
  turnoverRate: number;
  /** Qoldiqda band bo'lgan kapital (tannarx bo'yicha) */
  frozenCapital: number;
  revenue: number;
  profit: number;
  status: 'fast' | 'normal' | 'slow' | 'dead';
}

interface VghStoreRow {
  storeId: string;
  title: string;
  skuCount: number;
  avgStock: number;
  unitsSold: number;
  turnoverDays: number | null;
  frozenCapital: number;
  revenue: number;
}

interface VghResponse {
  period: Period;
  totals: {
    skuCount: number;
    avgStock: number;
    unitsSold: number;
    avgDaily: number;
    turnoverDays: number | null;
    frozenCapital: number;
    revenue: number;
    profit: number;
  };
  byStore: VghStoreRow[];
  rows: Paginated<VghRow>;
}

/** Aylanma kunlari bo'yicha holat */
function turnoverStatus(days: number | null): VghRow['status'] {
  if (days === null) return 'dead';
  if (days <= 30) return 'fast';
  if (days <= 60) return 'normal';
  if (days <= 120) return 'slow';
  return 'dead';
}

router.get(
  '/vgh',
  requireFeature('vgh_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const periodDays = Math.max(1, daysBetween(range.period.from, range.period.to) + 1);

    const [catalog, sales, snapshots, storeTitles] = await Promise.all([
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
      storeIds.length
        ? prisma.stockSnapshot.findMany({
            where: { storeId: { in: storeIds }, date: { gte: range.from, lt: range.toExclusive } },
            select: { skuId: true, date: true, fbo: true, fbs: true, own: true },
            orderBy: { date: 'asc' },
          })
        : Promise.resolve([]),
      getStoreTitles(company.id),
    ]);

    // SKU kesimida o'rtacha va oxirgi qoldiq
    const stockAgg = new Map<string, { sum: number; days: number; last: number }>();
    for (const s of snapshots) {
      const total = s.fbo + s.fbs + s.own;
      const cur = stockAgg.get(s.skuId) ?? { sum: 0, days: 0, last: 0 };
      cur.sum += total;
      cur.days += 1;
      cur.last = total; // snapshotlar sana bo'yicha o'sish tartibida
      stockAgg.set(s.skuId, cur);
    }

    const search = range.search?.toLowerCase();
    const rows: VghRow[] = [];
    const stores = new Map<string, VghStoreRow & { skus: Set<string>; soldTotal: number }>();

    let totalAvgStock = 0;
    let totalUnits = 0;
    let totalFrozen = 0;
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const info of catalog.values()) {
      if (search && !`${info.sku} ${info.title}`.toLowerCase().includes(search)) continue;

      const st = stockAgg.get(info.id);
      const avgStock = st && st.days > 0 ? st.sum / st.days : 0;
      const stock = st?.last ?? 0;
      const agg = sales.get(info.id);
      const unitsSold = agg?.units ?? 0;

      // Qoldiq ham, sotuv ham bo'lmasa — jadvalni shovqin bilan to'ldirmaymiz
      if (avgStock <= 0 && unitsSold <= 0) continue;

      const avgDaily = unitsSold / periodDays;
      const turnoverDays = avgDaily > 0 ? round(avgStock / avgDaily) : null;
      const frozenCapital = avgStock * (info.purchasePrice + info.extraCost);

      rows.push({
        skuId: info.id,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        storeId: info.storeId,
        storeTitle: info.storeTitle,
        avgStock: round(avgStock, 1),
        stock,
        unitsSold,
        avgDaily: round(avgDaily, 2),
        turnoverDays,
        turnoverRate: round(safeDiv(unitsSold, avgStock), 2),
        frozenCapital: round(frozenCapital),
        revenue: round(agg?.revenue ?? 0),
        profit: round(agg?.netProfit ?? 0),
        status: turnoverStatus(turnoverDays),
      });

      totalAvgStock += avgStock;
      totalUnits += unitsSold;
      totalFrozen += frozenCapital;
      totalRevenue += agg?.revenue ?? 0;
      totalProfit += agg?.netProfit ?? 0;

      const store = stores.get(info.storeId) ?? {
        storeId: info.storeId,
        title: storeTitles.get(info.storeId) ?? info.storeTitle,
        skuCount: 0,
        avgStock: 0,
        unitsSold: 0,
        turnoverDays: null,
        frozenCapital: 0,
        revenue: 0,
        skus: new Set<string>(),
        soldTotal: 0,
      };
      store.skus.add(info.id);
      store.avgStock += avgStock;
      store.unitsSold += unitsSold;
      store.frozenCapital += frozenCapital;
      store.revenue += agg?.revenue ?? 0;
      store.soldTotal += unitsSold;
      stores.set(info.storeId, store);
    }

    const sortKey = range.sort ?? 'frozen';
    const dir = range.order === 'asc' ? 1 : -1;
    const sortValue = (r: VghRow): number => {
      switch (sortKey) {
        case 'turnover':
          // Aylanmasiz SKU'lar eng oxirida turishi uchun katta qiymat
          return r.turnoverDays ?? 9999;
        case 'units':
          return r.unitsSold;
        case 'stock':
          return r.avgStock;
        case 'revenue':
          return r.revenue;
        default:
          return r.frozenCapital;
      }
    };
    rows.sort((a, b) => {
      const diff = (sortValue(a) - sortValue(b)) * dir;
      return diff !== 0 ? diff : b.frozenCapital - a.frozenCapital;
    });

    const totalAvgDaily = totalUnits / periodDays;

    const payload: VghResponse = {
      period: range.period,
      totals: {
        skuCount: rows.length,
        avgStock: round(totalAvgStock, 1),
        unitsSold: totalUnits,
        avgDaily: round(totalAvgDaily, 2),
        turnoverDays: totalAvgDaily > 0 ? round(totalAvgStock / totalAvgDaily) : null,
        frozenCapital: round(totalFrozen),
        revenue: round(totalRevenue),
        profit: round(totalProfit),
      },
      byStore: [...stores.values()]
        .map((s) => {
          const daily = s.soldTotal / periodDays;
          return {
            storeId: s.storeId,
            title: s.title,
            skuCount: s.skus.size,
            avgStock: round(s.avgStock, 1),
            unitsSold: s.unitsSold,
            turnoverDays: daily > 0 ? round(s.avgStock / daily) : null,
            frozenCapital: round(s.frozenCapital),
            revenue: round(s.revenue),
          } satisfies VghStoreRow;
        })
        .sort((a, b) => b.frozenCapital - a.frozenCapital),
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

export default router;
