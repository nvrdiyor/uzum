/**
 * Xarid partiyalari — sotuvchi Xitoydan olgan tovarlarini partiyalarga
 * bo'lib yuritadigan jadval (Excel o'rniga).
 *
 * Sayt butun partiyani bitta PUT bilan saqlaydi: qatorlar tartibi ham,
 * o'chirilgan qatorlar ham shu bilan birga yoziladi, alohida qator
 * endpointlari kerak bo'lmaydi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  batchCreateSchema,
  batchUpdateSchema,
  calcBatch,
  type BatchDelivery,
  type BatchDetail,
  type BatchListResponse,
  type BatchRate,
  type BatchSummary,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { getRate } from '../services/rates.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('cost_price'));

const MAX_BATCHES = 500;
const MAX_CARGO_NAMES = 50;

interface BatchRecord {
  id: string;
  name: string;
  rate: number;
  extra: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ItemRecord {
  id: string;
  name: string;
  trackCode: string;
  qty: number;
  priceCny: number;
  cargoName: string;
  delivery: string;
  weightKg: number;
  cargoCost: number;
}

const toDelivery = (v: string): BatchDelivery => (v === 'avia' ? 'avia' : 'avto');

type TotalsFields = Pick<ItemRecord, 'priceCny' | 'cargoCost' | 'qty' | 'weightKg'>;

function toSummary(b: BatchRecord, items: ReadonlyArray<TotalsFields>): BatchSummary {
  return {
    id: b.id,
    name: b.name,
    rate: b.rate,
    extra: b.extra,
    totals: calcBatch(b.rate, b.extra, items).totals,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

async function loadDetail(companyId: string, id: string): Promise<BatchDetail> {
  const batch = await prisma.purchaseBatch.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!batch) throw AppError.notFound('Partiya topilmadi');

  const used = await prisma.purchaseBatchItem.findMany({
    where: { batch: { companyId }, cargoName: { not: '' } },
    distinct: ['cargoName'],
    select: { cargoName: true },
    take: MAX_CARGO_NAMES,
  });

  const { rows } = calcBatch(batch.rate, batch.extra, batch.items);
  return {
    ...toSummary(batch, batch.items),
    items: batch.items.map((it, i) => ({
      id: it.id,
      name: it.name,
      trackCode: it.trackCode,
      qty: it.qty,
      priceCny: it.priceCny,
      cargoName: it.cargoName,
      delivery: toDelivery(it.delivery),
      weightKg: it.weightKg,
      cargoCost: it.cargoCost,
      priceUzs: rows[i].priceUzs,
      total: rows[i].total,
      unitCost: rows[i].unitCost,
    })),
    cargoNames: used.map((u) => u.cargoName).sort((a, b) => a.localeCompare(b)),
  };
}

/** GET /rate — Markaziy bank bo'yicha 1 ¥ kursi */
router.get(
  '/rate',
  ah(async (_req, res) => {
    const rate = await getRate('CNY');
    res.json({ rate: rate.rate, source: rate.source, updatedAt: rate.updatedAt } satisfies BatchRate);
  }),
);

/** GET / — partiyalar ro'yxati (eng yangisi birinchi) */
router.get(
  '/',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rows = await prisma.purchaseBatch.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_BATCHES,
      include: { items: { select: { priceCny: true, cargoCost: true, qty: true, weightKg: true } } },
    });
    const items = rows.map((b) => toSummary(b, b.items));
    res.json({ items, total: items.length } satisfies BatchListResponse);
  }),
);

/** POST / — yangi partiya; kurs berilmasa Markaziy bank kursi olinadi */
router.post(
  '/',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const body = batchCreateSchema.parse(req.body ?? {});

    const count = await prisma.purchaseBatch.count({ where: { companyId: company.id } });
    if (count >= MAX_BATCHES)
      throw AppError.badRequest(`Partiyalar soni chegarasi — ${MAX_BATCHES} ta. Eskilarini o‘chiring.`);

    const rate = body.rate ?? Math.round((await getRate('CNY')).rate * 100) / 100;
    const created = await prisma.purchaseBatch.create({
      data: { companyId: company.id, name: body.name, rate },
    });

    res.status(201).json(await loadDetail(company.id, created.id));
  }),
);

/** GET /:id — partiya jadvali */
router.get(
  '/:id',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    res.json(await loadDetail(company.id, String(req.params.id)));
  }),
);

/** PUT /:id — butun partiyani saqlash (sarlavha + barcha qatorlar) */
router.put(
  '/:id',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const body = batchUpdateSchema.parse(req.body ?? {});

    const exists = await prisma.purchaseBatch.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!exists) throw AppError.notFound('Partiya topilmadi');

    await prisma.$transaction([
      prisma.purchaseBatch.update({
        where: { id },
        data: { name: body.name, rate: body.rate, extra: body.extra },
      }),
      prisma.purchaseBatchItem.deleteMany({ where: { batchId: id } }),
      prisma.purchaseBatchItem.createMany({
        data: body.items.map((it, position) => ({ ...it, batchId: id, position })),
      }),
    ]);

    res.json(await loadDetail(company.id, id));
  }),
);

/** DELETE /:id — partiyani qatorlari bilan o'chirish */
router.delete(
  '/:id',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const result = await prisma.purchaseBatch.deleteMany({ where: { id, companyId: company.id } });
    if (result.count === 0) throw AppError.notFound('Partiya topilmadi');
    res.json({ ok: true, id });
  }),
);

export default router;
