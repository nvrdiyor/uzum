/**
 * Ombor moduli — /api/v1/warehouse
 *
 *  GET    /shipments          → Paginated<ShipmentRow> (status filtri, qidiruv)
 *  GET    /shipments/:id      → ShipmentRow (pozitsiyalari bilan)
 *  POST   /shipments          → yangi yetkazma (qoralama)
 *  PATCH  /shipments/:id      → tahrirlash / holatni o'zgartirish
 *  DELETE /shipments/:id      → o'chirish (qabul qilingani o'chirilmaydi)
 *  GET    /losses             → LossesResponse (yo'qotishlar + tovar balansi)
 *  POST   /losses/:id/claim   → da'vo yuborilgan deb belgilash
 *  PATCH  /losses/:id         → holat: da'vo / kompensatsiya / rad etildi / qayta ochish
 *  GET    /losses/claim-draft → { text } — Uzum qo'llab-quvvatlashiga da'vo matni
 *  GET    /returns            → ReturnsResponse (sabablar taqsimoti bilan)
 *  GET    /storage            → StorageResponse (pullik saqlash)
 *  GET    /storage/turnover   → StorageTurnoverResponse (aylanma bo'yicha tarif, 30 kunlik prognoz)
 *  GET    /turnover           → tovar aylanmasi (aylanma kunlari, band kapital)
 *  GET    /vgh                → VghResponse (hajm va VGH: Uzum logistika yig'imi kartochka hajmiga mosmi)
 *
 * Barcha pul qiymatlari UZS (butun so'm), sanalar ISO-8601.
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import { z } from 'zod';
import {
  LOGISTICS_FEE,
  TARIFF_EFFECTIVE_FROM,
  billableLiters,
  businessDayStart,
  daysBetween,
  eachDay,
  formatDate,
  formatNumber,
  litersFromLogistics,
  logisticsFee,
  matchesQueryText,
  parseISODate,
  parseSkuQuery,
  pct,
  round,
  safeDiv,
  shipmentSchema,
  toISODate,
  toBusinessDate,
  type LossEvidence,
  type LossKind,
  type LossRow,
  type LossesResponse,
  type Paginated,
  type Period,
  type ReturnKind,
  type ReturnRow,
  type ReturnsResponse,
  type ShipmentItemRow,
  type ShipmentRow,
  type SkuQuery,
  type StorageResponse,
  type StorageRow,
  type VghResponse,
  type VghRow,
  type VghStatus,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  getSkuCatalog,
  getStoreIds,
  getStoreTitles,
  skuInfoMatches,
  skuMatches,
  withSoldSkus,
  type SkuInfo,
} from '../services/common.js';
import { notifyCompanyOwners } from '../services/notify.js';
import { loadReturns, returnsRate } from '../services/returns.js';
import { AUTO_LOSS_SOURCES, getBalanceSummary } from '../services/stock-balance.js';
import { getStorageTurnover } from '../services/storage-turnover.js';

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
  source: string;
  items: ShipmentItemWithSku[];
}

const UZUM_SHIPMENT_READONLY =
  'Bu yetkazma Uzum nakladnoyidan olingan — uni Uzum kabinetida o‘zgartiring, bu yerda sinxron orqali yangilanadi';

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
    source: s.source === 'uzum' ? 'uzum' : 'manual',
  };
  if (withItems) row.items = items;
  return row;
}

/**
 * Yetkazma qidiruvga mos keladimi: o'z kodi, manzili yoki izohi (matnning
 * qismi) yoki ichidagi birorta tovar — umumiy SKU qoidasi bilan (nom, SKU
 * kodi, shtrix-kod, Uzum ID, uzum.uz havolasi). Ilgari faqat kod, manzil va
 * izoh bazadagi `contains` bilan solishtirilardi: PostgreSQL'da registrga
 * sezgir edi, "shu tovar qaysi yetkazmada ketyapti" degan savolga esa javob
 * yo'q edi (2026-10-24).
 */
function shipmentMatches(s: ShipmentWithItems, catalog: Map<string, SkuInfo>, query: SkuQuery): boolean {
  if (matchesQueryText(query, s.code, s.destination, s.note)) return true;
  return s.items.some((it) => {
    const info = catalog.get(it.skuId);
    // Katalogda yo'q (yashirilgan mahsulotning arxivdagi) SKU — pozitsiyadagi kod va nom bo'yicha
    return info
      ? skuInfoMatches(info, query)
      : skuMatches({ id: it.skuId, sku: it.sku.sku, title: it.sku.title }, null, query);
  });
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
  const today = parseISODate(toBusinessDate(new Date()));

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

    const query = parseSkuQuery(range.search);
    const [shipments, catalog] = await Promise.all([
      prisma.shipment.findMany({
        where: {
          companyId: company.id,
          ...(range.storeId ? { storeId: range.storeId } : {}),
          ...(status ? { status: { in: statusDbValues(status) } } : {}),
        },
        include: SHIPMENT_INCLUDE,
        orderBy: { createdAt: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      // Faqat qidiruvda: tovarning shtrix-kodi va Uzum ID'lari katalogda (pozitsiya ularni saqlamaydi)
      query ? getStoreIds(company.id).then((ids) => getSkuCatalog(ids, true)) : Promise.resolve(null),
    ]);

    const found = query && catalog ? shipments.filter((s) => shipmentMatches(s, catalog, query)) : shipments;
    const rows = found.map((s) => toShipmentRow(s, false));
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
    if (existing.source === 'uzum') throw AppError.badRequest(UZUM_SHIPMENT_READONLY);

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
      select: { id: true, code: true, status: true, source: true },
    });
    if (!existing) throw AppError.notFound('Yetkazma topilmadi');
    if (existing.source === 'uzum') throw AppError.badRequest(UZUM_SHIPMENT_READONLY);
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

/** SavdoIQ o'zi aniqlagan yozuvlar turi — da'vo matnida */
const LOSS_KIND_LABEL: Record<LossKind, string> = {
  balance: 'Hisobda yo‘q',
  counter: 'Yo‘qolgan',
  defect: 'Brak',
  shortage: 'Qabulda kam',
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
  source: string;
  details: string | null;
  note: string | null;
}

/** SavdoIQ aniqlagan yozuvda — turi; Uzum/namuna yozuvida null */
const toLossKind = (source: string): LossKind | null =>
  (AUTO_LOSS_SOURCES as readonly string[]).includes(source) ? (source as LossKind) : null;

function parseEvidence(details: string | null): LossEvidence | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? (parsed as LossEvidence) : null;
  } catch {
    return null;
  }
}

/**
 * Yo'qotish yozuvlarini olish uchun umumiy filtr.
 *
 * Hal bo'lmagan yozuv (ochiq yoki da'vo yuborilgan) DAVRDAN QAT'I NAZAR
 * ko'rinadi: yo'qolgan tovar — hozirgi muammo, o'tgan oyning hisoboti emas.
 * Davr faqat yopilgan (qoplangan / rad etilgan) yozuvlarni saralaydi.
 */
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
    OR: [{ happenedAt: { gte: from, lt: toExclusive } }, { status: { in: ['open', 'claimed'] } }],
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
    kind: toLossKind(l.source),
    scheme: l.scheme === 'FBS' ? 'FBS' : 'FBO',
    qty: l.qty,
    amount: round(l.amount),
    compensated: round(l.compensated),
    status: toLossStatus(l.status),
    happenedAt: toBusinessDate(l.happenedAt),
    evidence: parseEvidence(l.details),
    note: l.note,
  };
}

const PRICE_BASIS_LABEL: Record<NonNullable<LossEvidence['comp']>['basis'], string> = {
  '30d': 'oxirgi 30 kunning o‘rtacha sotuv narxi',
  '90d': 'oxirgi 90 kunning o‘rtacha sotuv narxi',
  last: 'oxirgi sotuv narxi',
  list: 'kabinetdagi joriy narx',
};

/** Hali da'vo yuborilmagan yo'qotishlar jami — filtr va davrdan qat'i nazar */
async function openLossSummary(storeIds: string[]): Promise<LossesResponse['open']> {
  if (storeIds.length === 0) return { count: 0, qty: 0, amount: 0 };
  const agg = await prisma.lossRecord.aggregate({
    where: { storeId: { in: storeIds }, status: 'open' },
    _count: true,
    _sum: { qty: true, amount: true },
  });
  return { count: agg._count, qty: agg._sum.qty ?? 0, amount: round(agg._sum.amount ?? 0) };
}

/** Da'vo matni uchun: yozuv ostidagi dalil satrlari */
function evidenceLines(r: LossRow): string[] {
  const e = r.evidence;
  if (!e) return [];
  const n = (v: number | undefined): string => formatNumber(v ?? 0, 'uz');
  const lines: string[] = [];
  // Summa asosi — har qanday turdagi yozuv uchun oxirida qo'shiladi
  const money = e.comp
    ? [
        `   Summa: ${PRICE_BASIS_LABEL[e.comp.basis]} ${n(e.comp.price)} − komissiya ${n(e.comp.commission)} = ${n(e.comp.unit)} so‘m × ${n(r.qty)} dona = ${n(r.amount)} so‘m.`,
      ]
    : [];

  if (r.kind === 'balance') {
    const terms = [`qabul qilingan ${n(e.accepted)}`, `sotilgan ${n(e.sold)}`];
    if (e.returnedToSeller) terms.push(`sotuvchiga qaytarilgan ${n(e.returnedToSeller)}`);
    terms.push(`omborda ${n(e.onHand)}`);
    if (e.held) terms.push(`omborda sotuvdan tashqari ${n(e.held)}`);
    if (e.inReturn) terms.push(`qaytishi kutilmoqda ${n(e.inReturn)}`);
    lines.push(`   Hisob: ${terms.join(', ')} — ${n(r.qty)} dona hisobda yo‘q.`);
    for (const rm of e.removals ?? []) {
      lines.push(`   ${formatDate(rm.date, 'uz')} kuni qoldiq buyurtmasiz ${n(rm.qty)} donaga kamaygan.`);
    }
    for (const s of e.suspects ?? []) {
      const what = s.kind === 'returned' ? 'qaytarilgan' : 'bekor qilingan';
      const cause = s.cause ? ` («${s.cause}»)` : '';
      lines.push(`   Buyurtma №${s.orderId} (${formatDate(s.date, 'uz')}) ${what}${cause} — tovar omborga qaytmagan.`);
    }
  } else if (r.kind === 'shortage') {
    lines.push(
      `   Nakladnoy №${e.invoice ?? '—'}: yuborilgan ${n(e.sent)}, qabul qilingan ${n(e.accepted)} — ${n(r.qty)} dona kam.`,
    );
  }
  return [...lines, ...money];
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
        balance: await getBalanceSummary([]),
        open: { count: 0, qty: 0, amount: 0 },
        totals: { skuCount: 0, qty: 0, amount: 0, compensated: 0 },
        claims: {
          receivedAmount: 0,
          pendingAmount: 0,
          rejectedAmount: 0,
          receivedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
        },
        rows: paginate<LossRow>([], range.page, range.pageSize),
      };
      res.json(empty);
      return;
    }

    const [losses, catalog, balance, open] = await Promise.all([
      prisma.lossRecord.findMany({
        where: lossWhere(storeIds, range.from, range.toExclusive, q),
        orderBy: { happenedAt: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      getSkuCatalog(storeIds, true),
      getBalanceSummary(storeIds),
      openLossSummary(storeIds),
    ]);

    /*
     * Qidiruv — umumiy qoida (services/common.ts skuInfoMatches): nom, SKU
     * kodi, shtrix-kod, Uzum ID yoki havola. Ilgari `${sku} ${title}`
     * .toLowerCase() edi (2026-10-24). SKU'si katalogda yo'q yozuv avvalgidek
     * topilmaydi — uning nomi ham, kodi ham yo'q.
     */
    const query = parseSkuQuery(range.search);
    const rows = losses
      .filter((l) => {
        if (!query) return true;
        const info = l.skuId ? catalog.get(l.skuId) : undefined;
        return info ? skuInfoMatches(info, query) : false;
      })
      .map((l) => toLossRow(l, catalog));

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
      balance,
      open,
      totals: { skuCount: skuIds.size, qty, amount: round(amount), compensated: round(compensated) },
      claims: (() => {
        // Da'vo jamilari butun davr bo'yicha — jadval sahifasiga bog'liq emas
        let receivedAmount = 0;
        let pendingAmount = 0;
        let rejectedAmount = 0;
        let receivedCount = 0;
        let pendingCount = 0;
        let rejectedCount = 0;
        for (const r of rows) {
          if (r.compensated > 0) {
            receivedAmount += r.compensated;
            receivedCount += 1;
          } else if (r.status === 'open' || r.status === 'claimed') {
            pendingAmount += r.amount;
            pendingCount += 1;
          } else if (r.status === 'rejected') {
            rejectedAmount += r.amount;
            rejectedCount += 1;
          }
        }
        return {
          receivedAmount: round(receivedAmount),
          pendingAmount: round(pendingAmount),
          rejectedAmount: round(rejectedAmount),
          receivedCount,
          pendingCount,
          rejectedCount,
        };
      })(),
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

    // Sotuvchi qatorlarni belgilagan bo'lsa — faqat o'shalar (davr va holatdan qat'i nazar)
    const ids = (q.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    const [losses, catalog, storeTitles] = await Promise.all([
      storeIds.length
        ? prisma.lossRecord.findMany({
            where: ids.length
              ? { storeId: { in: storeIds }, id: { in: ids } }
              : {
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
      r.kind ? LOSS_KIND_LABEL[r.kind] : LOSS_TYPE_LABEL[r.type],
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

    // Har bir pozitsiya uchun dalil: raqam qayerdan chiqqani va buyurtma raqamlari
    const proof = rows.flatMap((r, i) => {
      const lines = evidenceLines(r);
      return lines.length ? [`${i + 1}. ${r.sku ?? '—'}`, ...lines] : [];
    });

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
      'Summa sotuvchi qo‘llanmasining 6.8-bo‘limidagi formula bo‘yicha hisoblandi:',
      'tovarning haqiqiy narxi (o‘rtacha sotuv narxi) − marketpleys komissiyasi.',
      '',
      table,
      '',
      ...(proof.length ? ['Asos:', ...proof, ''] : []),
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

const lossPatchSchema = z.object({
  status: z.enum(['open', 'claimed', 'compensated', 'rejected']),
  /** Uzum to'lab bergan summa — faqat `compensated` uchun */
  compensated: z.coerce.number().min(0).max(1e12).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * PATCH /losses/:id — yozuv holati.
 *
 * Uzum da'vo javobini API orqali bermaydi, shuning uchun natijani sotuvchi
 * o'zi belgilaydi: da'vo yuborildi → kompensatsiya olindi (summasi bilan)
 * yoki rad etildi. Xato belgilansa — qayta ochish mumkin.
 */
router.patch(
  '/losses/:id',
  requireFeature('losses_report'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = lossPatchSchema.parse(req.body ?? {});
    const storeIds = await getStoreIds(company.id);

    const existing = await prisma.lossRecord.findFirst({
      where: { id: String(req.params.id), storeId: { in: storeIds } },
    });
    if (!existing) throw AppError.notFound('Yo‘qotish yozuvi topilmadi');

    const compensated = input.status === 'compensated' ? round(input.compensated ?? existing.amount) : 0;
    if (input.status === 'compensated' && compensated <= 0) {
      throw AppError.badRequest('Kompensatsiya summasini kiriting');
    }

    const updated = await prisma.lossRecord.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        compensated,
        // Da'vo sanasi birinchi marta belgilanganda yoziladi; qayta ochilsa o'chadi
        claimSentAt: input.status === 'open' ? null : (existing.claimSentAt ?? new Date()),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
    });

    const catalog = await getSkuCatalog(storeIds, true);
    res.json(toLossRow(updated, catalog));
  }),
);

// ─────────────────────────── Qaytarishlar ───────────────────────────

const NO_REASON = 'Sabab ko‘rsatilmagan';

const RETURN_KINDS: ReturnKind[] = ['returned', 'canceled'];

/** `?kind=` → tur; eski `?status=` ham tushuniladi. Standart — qaytarishlar */
function asReturnKind(q: Record<string, string | undefined>): ReturnKind | 'all' {
  const v = q.kind ?? q.status;
  if (v === 'all') return 'all';
  return RETURN_KINDS.includes(v as ReturnKind) ? (v as ReturnKind) : 'returned';
}

router.get(
  '/returns',
  requireFeature('returns_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;
    const kind = asReturnKind(q);

    /*
     * Jamlar va qatorlar BITTA o'qishdan, Boshqaruv panelidagi karta bilan
     * yagona ta'rif (services/returns.ts): davr — buyurtma sanasi bo'yicha,
     * qaytarish ulushi — qabul qilingan + qaytgan donadan, bekor qilish —
     * buyurtma qilingan donadan. Ilgari sahifa qaytarishni taxminiy qaytish
     * sanasi bilan olib, ulush asosiga yo'ldagi donani ham qo'shardi va
     * qisman qaytishlarni ko'rmasdi: bir davr uchun panel 7,6%, sahifa 6,2%
     * ko'rsatardi (2026-10-24).
     */
    /*
     * Qidiruv: tovar — umumiy qoida (services/common.ts skuInfoMatches: nom,
     * SKU kodi, shtrix-kod, Uzum ID, uzum.uz havolasi), hujjat — buyurtma
     * raqami va sabab matni (shared matchesQueryText). Ilgari to'rttasi bitta
     * `toLowerCase().includes` qatorida edi: shtrix-kod va kartochkadagi
     * "ID: 701009" topilmasdi, "Cho'yan" "Cho‘yan"ni topmasdi (2026-10-24).
     * Katalog (shtrix-kod, ID'lar) faqat qidiruvda yuklanadi.
     */
    const query = parseSkuQuery(range.search);
    const [{ summary, lines }, catalog] = await Promise.all([
      loadReturns(storeIds, range.from, range.toExclusive),
      query ? getSkuCatalog(storeIds, true) : Promise.resolve(null),
    ]);

    // Ikkala tur jamlari — sahifadagi almashtirgich sonlari uchun (qidiruvga bog'liq emas)
    const counts: ReturnsResponse['counts'] = {
      returned: { qty: summary.returned.qty, amount: summary.returned.amount },
      canceled: { qty: summary.canceled.qty, amount: summary.canceled.amount },
    };

    const reasonFilter = q.reason && q.reason !== 'all' ? q.reason : undefined;
    const byReason = new Map<string, number>();
    let qty = 0;
    let amount = 0;

    const rows: ReturnRow[] = [];
    for (const l of lines) {
      if (kind !== 'all' && l.kind !== kind) continue;
      if (reasonFilter && (l.reason ?? NO_REASON) !== reasonFilter) continue;

      const row: ReturnRow = {
        id: l.id,
        sku: l.sku,
        title: l.title,
        imageUrl: l.imageUrl,
        orderCode: l.orderCode,
        qty: l.qty,
        amount: l.amount,
        reason: l.reason,
        status: l.kind,
        kind: l.kind,
        returnedAt: toBusinessDate(l.date),
        // Davr va tartib buyurtma kuni bo'yicha — jadvaldagi sana ham shu, aks holda qatorlar tartibsiz ko'rinardi
        orderedAt: toBusinessDate(l.orderedAt),
      };
      if (query) {
        const info = l.skuId ? catalog?.get(l.skuId) : undefined;
        // Katalogda yo'q SKU (yoki SKU'siz satr) — satrdagi kod va nom bo'yicha
        const product = info
          ? skuInfoMatches(info, query)
          : skuMatches({ id: l.skuId, sku: l.sku, title: l.title }, null, query);
        if (!product && !matchesQueryText(query, row.orderCode, row.reason)) continue;
      }

      qty += row.qty;
      amount += row.amount;
      const reason = row.reason?.trim() || NO_REASON;
      byReason.set(reason, (byReason.get(reason) ?? 0) + row.qty);
      rows.push(row);
    }

    if (range.order === 'asc') rows.reverse();

    /**
     * Kunlik seriya va "eng ko'p qaytariladigan" ro'yxati BUTUN davr bo'yicha
     * hisoblanadi — jadvalning joriy sahifasiga bog'liq emas.
     *
     * Kun — BUYURTMA kuni (davr ham shu bo'yicha). Qaytish sanasi bilan
     * chizilganda o'tgan oy uchun ustunlar keyingi oyga chiqib ketardi, demo
     * ma'lumotda esa kelajak kunlarga ham tushardi.
     */
    const dailyMap = new Map<string, { qty: number; amount: number }>();
    const riskyMap = new Map<
      string,
      { key: string; sku: string | null; title: string | null; imageUrl: string | null; qty: number; amount: number }
    >();
    for (const r of rows) {
      const day = r.orderedAt;
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

    /*
     * Filtr (qidiruv, sabab) bo'lmasa jamlar — xulosaning o'zi, panel kartasi
     * bilan aynan bir xil raqam. Filtr bo'lsa — mos qatorlar yig'indisi, ulush
     * esa o'sha ta'rif va o'sha davr asosi bilan.
     */
    const filtered = Boolean(query || reasonFilter);
    const both = summary.returned.qty + summary.canceled.qty;
    const totals: ReturnsResponse['totals'] = filtered
      ? { qty, amount: round(amount), rate: returnsRate(kind, qty, summary) }
      : kind === 'all'
        ? {
            qty: both,
            amount: round(summary.returned.amount + summary.canceled.amount),
            rate: returnsRate('all', both, summary),
          }
        : { ...summary[kind] };

    const payload: ReturnsResponse = {
      kind,
      counts,
      totals,
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

/**
 * GET /storage/turnover — pullik saqlash AYLANMA bo'yicha (Uzum qo'llanmasi,
 * 01.06.2026): har SKU holati (bepul / tez orada / pullik / yangi / hajm
 * yo'q), bugungi va 30 kunlik prognoz, Uzum haqiqatda ushlagan summa bilan
 * yonma-yon. Davr filtri ATAYLAB e'tiborsiz: aylanma doim "bugun" holatida,
 * tugagan 15 kun bo'yicha (services/storage-turnover.ts). Do'kon va qidiruv
 * filtri ishlaydi. Yuqoridagi '/storage' javobi o'zgarmaydi.
 */
router.get(
  '/storage/turnover',
  requireFeature('paid_storage'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    res.json(await getStorageTurnover(storeIds, { search: range.search }));
  }),
);

// ─────────────────────────── Tovar aylanmasi ───────────────────────────

/*
 * Ilgari bu hisob '/vgh' manzilida turardi, holbuki VGH (vazn-gabarit) bilan
 * aloqasi yo'q — aylanma kunlari va qoldiqda band kapital. Saytda uni hech
 * kim chaqirmasdi, tarifda esa "VGH hisoboti" sotilardi. '/vgh' endi
 * haqiqiy hajm tekshiruviga berildi (pastda), aylanma o'z nomi bilan shu
 * yerga o'zgarishsiz ko'chdi — tarif kaliti ham avvalgidek (2026-10-24).
 */

interface TurnoverRow {
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

interface TurnoverStoreRow {
  storeId: string;
  title: string;
  skuCount: number;
  avgStock: number;
  unitsSold: number;
  turnoverDays: number | null;
  frozenCapital: number;
  revenue: number;
}

interface TurnoverResponse {
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
  byStore: TurnoverStoreRow[];
  rows: Paginated<TurnoverRow>;
}

/** Aylanma kunlari bo'yicha holat */
function turnoverStatus(days: number | null): TurnoverRow['status'] {
  if (days === null) return 'dead';
  if (days <= 30) return 'fast';
  if (days <= 60) return 'normal';
  if (days <= 120) return 'slow';
  return 'dead';
}

router.get(
  '/turnover',
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

    // Qidiruv — umumiy qoida (skuInfoMatches); ilgari `${sku} ${title}`.toLowerCase() edi (2026-10-24)
    const query = parseSkuQuery(range.search);
    const rows: TurnoverRow[] = [];
    const stores = new Map<string, TurnoverStoreRow & { skus: Set<string>; soldTotal: number }>();

    let totalAvgStock = 0;
    let totalUnits = 0;
    let totalFrozen = 0;
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const info of catalog.values()) {
      if (query && !skuInfoMatches(info, query)) continue;

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
    const sortValue = (r: TurnoverRow): number => {
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

    const payload: TurnoverResponse = {
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
          } satisfies TurnoverStoreRow;
        })
        .sort((a, b) => b.frozenCapital - a.frozenCapital),
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Hajm va VGH (logistika yig'imi) ───────────────────────────

/**
 * Uzum yig'imi shuncha satrdan kam bo'lsa solishtirilmaydi: bitta-ikkita
 * buyurtmada yig'im tasodifan boshqacha chiqishi mumkin (aksiya, qo'lda
 * tuzatish), mediana esa kamida uchta satrda ma'noga ega.
 */
const VGH_MIN_LINES = 3;

/** Yig'imning tarif to'ridan (5 250, 5 500, …) yarim litr qadamigacha og'ishi — yaxlitlash shovqini */
const VGH_FEE_TOLERANCE = LOGISTICS_FEE.perExtraLiter / 2;

/**
 * Bundan past yig'im hajm haqida hech narsa demaydi va namunaga kirmaydi:
 * 0 — Uzum aksiyada logistikani umuman olmagan (2026-yil oktabrida shunday
 * bo'ldi, importer.ts `applyActualLogistics`), 0 dan katta, lekin eng kichik
 * tarifdan past — chegirma. Ular bilan mediana "Uzum kam litr hisoblaydi"
 * degan yolg'on farq chiqarardi.
 */
const VGH_FEE_FLOOR = LOGISTICS_FEE.base - VGH_FEE_TOLERANCE;

const VGH_STATUSES: readonly VghStatus[] = ['ok', 'mismatch', 'no_dimensions', 'insufficient'];

/** Ro'yxat tartibi — pul ketayotgani birinchi: ortiqcha olinayotgan, o'lchamsiz, kam olinayotgan, ma'lumot kam, mos */
function vghRank(r: VghRow): number {
  if (r.status === 'mismatch') return r.direction === 'over' ? 0 : 2;
  if (r.status === 'no_dimensions') return 1;
  return r.status === 'insufficient' ? 3 : 4;
}

/** `?sort=` kalitlari; noma'lum kalit — odatiy tartib */
function vghSortValue(key: string | undefined, r: VghRow): number | null | undefined {
  switch (key) {
    case 'extra':
      return r.extraTotal;
    case 'units':
      return r.units;
    case 'fee':
      return r.actualFee;
    case 'volume':
      return r.volumeL;
    default:
      return undefined;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface VghSample {
  /** Har satr uchun dona boshiga yig'im */
  fees: number[];
  units: number;
}

function toVghRow(info: SkuInfo, sample: VghSample | undefined): VghRow {
  const hasDims = info.volumeL > 0;
  const expectedFee = hasDims
    ? (logisticsFee(info.volumeL) ?? LOGISTICS_FEE.noDimensions)
    : LOGISTICS_FEE.noDimensions;
  const lines = sample?.fees.length ?? 0;
  const units = sample?.units ?? 0;
  const actualFee = sample && lines >= VGH_MIN_LINES ? round(median(sample.fees)) : null;
  // 5 250 dan shovqin qadar past — baribir 1 litr; 50 000 (chegara yoki o'lchamsiz tarif) litr bermaydi
  const actualL = actualFee === null ? null : litersFromLogistics(Math.max(actualFee, LOGISTICS_FEE.base));

  let status: VghStatus;
  let direction: VghRow['direction'] = null;
  let extraPerUnit: number | null = null;
  if (!hasDims) {
    /*
     * Kutilgan yig'im — o'lchamsiz tarifning o'zi, shuning uchun "farq"
     * ma'nosiz (Uzum 50 000 olsa ham 0 chiqardi): pul ustunlari bo'sh,
     * muammo holatning o'zida aytiladi.
     */
    status = 'no_dimensions';
  } else if (actualFee === null) {
    status = 'insufficient';
  } else if (Math.abs(actualFee - expectedFee) < VGH_FEE_TOLERANCE) {
    status = 'ok';
    extraPerUnit = 0;
  } else {
    status = 'mismatch';
    direction = actualFee > expectedFee ? 'over' : 'under';
    extraPerUnit = round(actualFee - expectedFee);
  }

  return {
    skuId: info.id,
    sku: info.sku,
    title: info.title,
    imageUrl: info.imageUrl,
    storeTitle: info.storeTitle,
    volumeL: hasDims ? round(info.volumeL, 3) : 0,
    billableL: billableLiters(info.volumeL),
    weightGr: round(Math.max(0, info.weightGr)),
    expectedFee,
    actualFee,
    actualL,
    lines,
    units,
    status,
    direction,
    extraPerUnit,
    extraTotal: extraPerUnit === null ? null : round(extraPerUnit * units),
  };
}

/**
 * GET /vgh — hajm va VGH tekshiruvi.
 *
 * Uzum logistika yig'imini har bir sotilgan dona uchun tovar hajmidan oladi
 * (packages/shared tariffs.ts). Kartochkadagi hajmdan kutilgan yig'im Uzum
 * HAQIQATDA ushlagan yig'im bilan solishtiriladi: farq bo'lsa, Uzum tovarni
 * boshqa o'lchamda hisoblayapti va sotuvchi har donada ortiqcha (yoki kam)
 * to'laydi.
 *
 * Haqiqiy yig'im — davrdagi topshirilgan satrlarning dona boshiga medianasi.
 * Kirmaydi: qaytarilgan va bekor qilingan satrlar (qo'llanma bo'yicha ularning
 * yig'imi qaytariladi), qisman qaytgan satr (yig'im qaysi donaga tegishli —
 * noaniq), yo'ldagi buyurtma (yig'im topshirilganda olinadi, unda hali nominal
 * qiymat turadi) va tarif kuchga kirgan kundan oldin topshirilgani — u eski
 * stavkada olingan.
 *
 * Jarima summasi ATAYLAB yo'q: Uzum VGH jarimasini e'lon qilmagan va egasi
 * uni ko'rsatmaslikni so'ragan (2026-10-24) — faqat logistikadagi farq.
 */
router.get(
  '/vgh',
  requireFeature('vgh_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;
    const statusFilter = VGH_STATUSES.find((s) => s === q.status) ?? null;
    const tariffStart = businessDayStart(TARIFF_EFFECTIVE_FROM);

    const [catalog, items] = await Promise.all([
      getSkuCatalog(storeIds),
      storeIds.length
        ? prisma.orderItem.findMany({
            where: {
              orderedAt: { gte: range.from, lt: range.toExclusive },
              skuId: { not: null },
              status: { notIn: ['returned', 'canceled'] },
              returnedAt: null,
              returnedQty: 0,
              qty: { gt: 0 },
              logistics: { gt: 0 },
              order: { storeId: { in: storeIds }, status: 'delivered' },
            },
            select: {
              skuId: true,
              qty: true,
              logistics: true,
              orderedAt: true,
              order: { select: { deliveredAt: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const samples = new Map<string, VghSample>();
    for (const it of items) {
      if (!it.skuId) continue;
      // Yig'im tovar topshirilganda olinadi: tarifdan oldin topshirilgani eski stavkada
      if ((it.order.deliveredAt ?? it.orderedAt) < tariffStart) continue;
      const perUnit = it.logistics / it.qty;
      if (perUnit < VGH_FEE_FLOOR) continue;
      const cur = samples.get(it.skuId) ?? { fees: [], units: 0 };
      cur.fees.push(perUnit);
      cur.units += it.qty;
      samples.set(it.skuId, cur);
    }

    // Davrda sotilib, hozir arxivda turgan SKU ham qatnashadi — ortiqcha to'lov haqiqiy pul
    await withSoldSkus(catalog, samples.keys(), storeIds);

    /*
     * Qidiruv — umumiy qoida (services/common.ts skuInfoMatches): nom, SKU
     * kodi, shtrix-kod, Uzum ID yoki uzum.uz havolasi. Ilgari faqat
     * `${sku} ${title}`.toLowerCase() edi — sahifadagi maydon esa boshqa
     * sahifalardagidek "shtrix-kod yoki ID" deydi (2026-10-24). Jamlar
     * avvalgidek qidiruvdan KEYIN: KPI topilgan SKU'lar bo'yicha.
     */
    const query = parseSkuQuery(range.search);
    const all: VghRow[] = [];
    for (const info of catalog.values()) {
      if (query && !skuInfoMatches(info, query)) continue;
      const sample = samples.get(info.id);
      /*
       * O'lchami bor, lekin davrda yig'im olingan sotuvi yo'q — solishtiradigan
       * narsa yo'q, ro'yxat to'ldirilmaydi. O'lchamsiz SKU esa sotilmagan
       * bo'lsa ham ko'rinadi: birinchi sotuvdayoq 50 000 so'm olinadi,
       * o'lchamni oldindan kiritish kerak.
       */
      if (info.volumeL > 0 && !sample) continue;
      all.push(toVghRow(info, sample));
    }

    // Jamlar holat filtridan oldin — sahifadagi almashtirgich sonlari o'zgarmasin
    const byStatus: Record<VghStatus, number> = { ok: 0, mismatch: 0, no_dimensions: 0, insufficient: 0 };
    let over = 0;
    let extraPaid = 0;
    let extraUnits = 0;
    for (const r of all) {
      byStatus[r.status] += 1;
      if (r.direction === 'over') {
        over += 1;
        extraPaid += r.extraTotal ?? 0;
        extraUnits += r.units;
      }
    }

    const dir = range.order === 'asc' ? 1 : -1;
    const rows = (statusFilter ? all.filter((r) => r.status === statusFilter) : all).sort((a, b) => {
      const av = vghSortValue(range.sort, a);
      const bv = vghSortValue(range.sort, b);
      if (av !== undefined && bv !== undefined && av !== bv) {
        // Solishtirib bo'lmaganlar (null) yo'nalishdan qat'i nazar oxirida
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      }
      return (
        vghRank(a) - vghRank(b) ||
        Math.abs(b.extraTotal ?? 0) - Math.abs(a.extraTotal ?? 0) ||
        b.units - a.units ||
        a.title.localeCompare(b.title)
      );
    });

    const payload: VghResponse = {
      period: range.period,
      rules: { minLines: VGH_MIN_LINES, effectiveFrom: TARIFF_EFFECTIVE_FROM },
      totals: { skuCount: all.length, byStatus, over, extraPaid: round(extraPaid), extraUnits },
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

export default router;
