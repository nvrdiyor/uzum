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
  batchOrderSchema,
  batchShipmentSchema,
  batchUpdateSchema,
  calcBatch,
  toBusinessDate,
  type BatchDelivery,
  type BatchDetail,
  type BatchListResponse,
  type BatchRate,
  type BatchShipment,
  type BatchSummary,
  type CargoStat,
  type ShipmentStatus,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { getRate } from '../services/rates.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('cost_price'));

const MAX_BATCHES = 500;

const STALE_BATCH =
  'Partiya boshqa joyda o‘zgargan (boshqa oyna yoki qurilma). O‘zgarishlar ustidan yozilmasligi uchun saqlanmadi — sahifani yangilang.';
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

// ─────────────────────────── Jo'natmalar va kargo muddati ───────────────────────────

/** Kargo nomi qanday yozilganidan qat'i nazar bitta kalit: "Tez-tez " va "TEZ-TEZ" — bitta kargo */
const cargoKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toUpperCase();

const DAY_MS = 86_400_000;
const isoDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const dayDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);
/** Bugun — savdo kuni (Toshkent) bo'yicha */
const today = (): Date => dayDate(toBusinessDate(new Date()));

interface ShipRecord {
  batchId: string;
  cargoKey: string;
  delivery: string;
  status: string;
  shippedAt: Date | null;
  arrivedAt: Date | null;
}

interface GroupItem {
  cargoName: string;
  delivery: string;
  qty: number;
}

const toStatus = (v: string): ShipmentStatus => (v === 'shipped' || v === 'arrived' ? v : 'warehouse');

/**
 * Har partiyaning jo'natmalari va kargolarning haqiqiy muddati.
 *
 * Jo'natma = partiyadagi bitta kargo + bitta yetkazish turi. Partiyada
 * "MANDARIN avia" va "TEZ-TEZ avto" bo'lsa — ikki jo'natma, ular har xil kuni
 * keladi. Avia va avto muddati bir necha barobar farq qiladi, shuning uchun
 * o'rtacha ham kargo + tur bo'yicha alohida.
 */
function buildShipments(
  batches: ReadonlyArray<{ id: string; items: ReadonlyArray<GroupItem> }>,
  ships: ReadonlyArray<ShipRecord>,
): { byBatch: Map<string, BatchShipment[]>; stats: CargoStat[] } {
  const shipOf = new Map(ships.map((sh) => [`${sh.batchId}|${sh.cargoKey}|${sh.delivery}`, sh]));
  const now = today();

  const groupsOf = new Map<string, BatchShipment[]>();
  const statAcc = new Map<string, { cargoName: string; delivery: BatchDelivery; days: number[]; inTransit: number }>();

  for (const b of batches) {
    const groups = new Map<string, BatchShipment>();
    for (const it of b.items) {
      const delivery = toDelivery(it.delivery);
      const key = `${cargoKeyOf(it.cargoName)}|${delivery}`;
      const g = groups.get(key) ?? {
        cargoName: it.cargoName.trim(),
        delivery,
        items: 0,
        qty: 0,
        status: 'warehouse' as ShipmentStatus,
        shippedAt: null,
        arrivedAt: null,
        days: null,
        expectedAt: null,
      };
      g.items += 1;
      g.qty += it.qty;
      groups.set(key, g);
    }

    for (const [key, g] of groups) {
      const sh = shipOf.get(`${b.id}|${key}`);
      if (sh) {
        g.status = toStatus(sh.status);
        g.shippedAt = isoDay(sh.shippedAt);
        g.arrivedAt = isoDay(sh.arrivedAt);
        if (g.status === 'arrived' && sh.shippedAt && sh.arrivedAt) g.days = daysBetween(sh.shippedAt, sh.arrivedAt);
        if (g.status === 'shipped' && sh.shippedAt) g.days = Math.max(0, daysBetween(sh.shippedAt, now));
      }
      const acc = statAcc.get(key) ?? { cargoName: g.cargoName, delivery: g.delivery, days: [], inTransit: 0 };
      if (g.status === 'arrived' && g.days !== null) acc.days.push(g.days);
      if (g.status === 'shipped') acc.inTransit += 1;
      statAcc.set(key, acc);
    }
    groupsOf.set(b.id, [...groups.values()]);
  }

  const stats: CargoStat[] = [...statAcc.values()]
    .filter((a) => a.days.length > 0 || a.inTransit > 0)
    .map((a) => ({
      cargoName: a.cargoName,
      delivery: a.delivery,
      arrived: a.days.length,
      avgDays: a.days.length ? Math.round((a.days.reduce((x, y) => x + y, 0) / a.days.length) * 10) / 10 : null,
      minDays: a.days.length ? Math.min(...a.days) : null,
      maxDays: a.days.length ? Math.max(...a.days) : null,
      inTransit: a.inTransit,
    }))
    .sort((x, y) => y.arrived - x.arrived || x.cargoName.localeCompare(y.cargoName));

  // Yo'ldagi jo'natma qachon keladi — shu kargo va turining o'rtachasi bo'yicha
  const avgOf = new Map(stats.map((st) => [`${cargoKeyOf(st.cargoName)}|${st.delivery}`, st.avgDays]));
  for (const groups of groupsOf.values()) {
    for (const g of groups) {
      const avg = avgOf.get(`${cargoKeyOf(g.cargoName)}|${g.delivery}`);
      if (g.status === 'shipped' && g.shippedAt && avg != null) {
        g.expectedAt = isoDay(new Date(dayDate(g.shippedAt).getTime() + Math.round(avg) * DAY_MS));
      }
    }
  }

  return { byBatch: groupsOf, stats };
}

/** Qolgan tovar qayerda: yo'lda > omborda > keldi */
function batchStatus(shipments: ReadonlyArray<BatchShipment>): ShipmentStatus {
  if (shipments.some((g) => g.status === 'shipped')) return 'shipped';
  if (shipments.length === 0 || shipments.some((g) => g.status === 'warehouse')) return 'warehouse';
  return 'arrived';
}

/** Kompaniyaning barcha partiyalari bo'yicha jo'natmalar (kargo o'rtachasi butun tarixdan) */
async function companyShipments(companyId: string) {
  const [batches, ships] = await Promise.all([
    prisma.purchaseBatch.findMany({
      where: { companyId },
      select: { id: true, items: { select: { cargoName: true, delivery: true, qty: true } } },
      take: MAX_BATCHES,
    }),
    prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId } } }),
  ]);
  return buildShipments(batches, ships);
}

function toSummary(b: BatchRecord, items: ReadonlyArray<TotalsFields>, shipments: BatchShipment[] = []): BatchSummary {
  return {
    id: b.id,
    name: b.name,
    rate: b.rate,
    extra: b.extra,
    totals: calcBatch(b.rate, b.extra, items).totals,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    status: batchStatus(shipments),
    shipments,
  };
}

async function loadDetail(companyId: string, id: string): Promise<BatchDetail> {
  const batch = await prisma.purchaseBatch.findFirst({
    where: { id, companyId },
    include: { items: { orderBy: { position: 'asc' } }, extras: { orderBy: { position: 'asc' } } },
  });
  if (!batch) throw AppError.notFound('Partiya topilmadi');

  const used = await prisma.purchaseBatchItem.findMany({
    where: { batch: { companyId }, cargoName: { not: '' } },
    distinct: ['cargoName'],
    select: { cargoName: true },
    take: MAX_CARGO_NAMES,
  });

  const { rows } = calcBatch(batch.rate, batch.extra, batch.items);
  const { byBatch } = await companyShipments(companyId);
  return {
    ...toSummary(batch, batch.items, byBatch.get(batch.id) ?? []),
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
      extraShare: rows[i].extraShare,
      unitCostFull: rows[i].unitCostFull,
    })),
    extras: batch.extras.map((e) => ({ name: e.name, amount: e.amount })),
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
      // Sotuvchi belgilagan tartib; teng bo'lsa (hech qachon tartiblanmagan) yangisi yuqorida
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      take: MAX_BATCHES,
      include: {
        items: {
          select: { priceCny: true, cargoCost: true, qty: true, weightKg: true, cargoName: true, delivery: true },
        },
      },
    });
    const ships = await prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId: company.id } } });
    const { byBatch, stats } = buildShipments(rows, ships);
    const items = rows.map((b) => toSummary(b, b.items, byBatch.get(b.id) ?? []));

    // Barcha partiyalar bo'yicha jami — sahifa tepasidagi "Umumiy summa"
    const grand = { qty: 0, priceCny: 0, goodsUzs: 0, cargoUzs: 0, extra: 0, total: 0 };
    for (const b of items) {
      grand.qty += b.totals.qty;
      grand.priceCny += b.totals.priceCny;
      grand.goodsUzs += b.totals.goodsUzs;
      grand.cargoUzs += b.totals.cargoUzs;
      grand.extra += b.totals.extra;
      grand.total += b.totals.total;
    }
    grand.priceCny = Math.round(grand.priceCny * 100) / 100;

    res.json({ items, total: items.length, grand, cargoStats: stats } satisfies BatchListResponse);
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
    // Yangi partiya ro'yxat tepasida chiqadi — qo'lda tartiblangan bo'lsa ham
    const top = await prisma.purchaseBatch.aggregate({ _min: { position: true }, where: { companyId: company.id } });
    const created = await prisma.purchaseBatch.create({
      data: { companyId: company.id, name: body.name, rate, position: (top._min.position ?? 0) - 1 },
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

/**
 * PUT /order — partiyalar ro'yxatining tartibi.
 * `/:id` dan OLDIN e'lon qilinishi shart, aks holda "order" partiya id'si deb olinadi.
 *
 * `updatedAt` ATAYLAB o'zgartirilmaydi: u partiya mazmunining versiyasi
 * (ochiq jadval shu bo'yicha "boshqa joyda o'zgargan" deb tekshiradi) —
 * ro'yxatdagi o'rin almashgani mazmunni o'zgartirmaydi.
 */
router.put(
  '/order',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const { ids } = batchOrderSchema.parse(req.body ?? {});

    const own = await prisma.purchaseBatch.findMany({
      where: { companyId: company.id },
      select: { id: true, updatedAt: true },
    });
    const byId = new Map(own.map((b) => [b.id, b.updatedAt]));
    const unique = [...new Set(ids)];
    if (unique.some((id) => !byId.has(id))) throw AppError.badRequest('Ro‘yxatda begona yoki o‘chirilgan partiya bor');

    // Ro'yxatga kirmay qolganlar (boshqa oynada qo'shilgan) oxiriga, hozirgi tartibida
    const rest = own.map((b) => b.id).filter((id) => !unique.includes(id));
    await prisma.$transaction(
      [...unique, ...rest].map((id, position) =>
        prisma.purchaseBatch.update({ where: { id }, data: { position, updatedAt: byId.get(id) } }),
      ),
    );
    res.json({ ok: true });
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

    const expected = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : null;
    if (!expected || Number.isNaN(expected.getTime())) throw AppError.conflict(STALE_BATCH);

    // Tafsilot bor bo'lsa jami xarajat undan olinadi — ikkalasi hech qachon farq qilmaydi
    const extras = body.extras?.filter((e) => e.name || e.amount > 0);
    const extra = extras?.length ? Math.round(extras.reduce((a, e) => a + e.amount, 0)) : body.extra;

    /*
     * Versiya sharti yozuv bilan BITTA tranzaksiyada: "tekshir, keyin yoz"
     * orasida boshqa oyna saqlab ulgursa ham ustidan yozilmaydi. Butun
     * partiya almashtirilgani uchun eski oyna yangi qatorlarni o'chirib
     * yuborishi mumkin edi — aynan shunday bir qator yo'qolgan.
     */
    await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseBatch.updateMany({
        where: { id, companyId: company.id, updatedAt: expected },
        data: { name: body.name, rate: body.rate, extra, updatedAt: new Date() },
      });
      if (updated.count === 0) throw AppError.conflict(STALE_BATCH);

      await tx.purchaseBatchItem.deleteMany({ where: { batchId: id } });
      await tx.purchaseBatchItem.createMany({
        data: body.items.map((it, position) => ({ ...it, batchId: id, position })),
      });

      if (extras) {
        await tx.purchaseBatchExtra.deleteMany({ where: { batchId: id } });
        await tx.purchaseBatchExtra.createMany({
          data: extras.map((e, position) => ({ ...e, batchId: id, position })),
        });
      }
    });

    res.json(await loadDetail(company.id, id));
  }),
);

/**
 * PUT /:id/shipment — jo'natma holati va sanalari (kargo + yetkazish turi bo'yicha).
 *
 * Partiya jadvaliga (`updatedAt`) tegmaydi: ochiq jadval "boshqa joyda
 * o'zgargan" deb saqlashni rad etmasin — holat mazmun emas.
 */
router.put(
  '/:id/shipment',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const body = batchShipmentSchema.parse(req.body ?? {});

    const batch = await prisma.purchaseBatch.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!batch) throw AppError.notFound('Partiya topilmadi');

    const now = today();
    const todayIso = isoDay(now) as string;
    // Holatga mos sanalar: omborda — sanasiz; yo'lda — jo'natilgan sana (bo'lmasa bugun); keldi — kelgan sana (bo'lmasa bugun)
    const shippedIso = body.status === 'warehouse' ? null : (body.shippedAt ?? (body.status === 'shipped' ? todayIso : null));
    const arrivedIso = body.status === 'arrived' ? (body.arrivedAt ?? todayIso) : null;

    for (const d of [shippedIso, arrivedIso]) {
      if (d && dayDate(d).getTime() > now.getTime()) throw AppError.badRequest('Sana kelajakda bo‘lishi mumkin emas');
    }
    if (shippedIso && arrivedIso && dayDate(arrivedIso).getTime() < dayDate(shippedIso).getTime()) {
      throw AppError.badRequest('Kelgan sana jo‘natilgan sanadan oldin bo‘lishi mumkin emas');
    }

    const cargoKey = cargoKeyOf(body.cargoName);
    const data = {
      status: body.status,
      shippedAt: shippedIso ? dayDate(shippedIso) : null,
      arrivedAt: arrivedIso ? dayDate(arrivedIso) : null,
    };
    await prisma.purchaseBatchShipment.upsert({
      where: { batchId_cargoKey_delivery: { batchId: id, cargoKey, delivery: body.delivery } },
      create: { batchId: id, cargoKey, delivery: body.delivery, ...data },
      update: data,
    });

    const { byBatch, stats } = await companyShipments(company.id);
    const shipments = byBatch.get(id) ?? [];
    res.json({ shipments, status: batchStatus(shipments), cargoStats: stats });
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
