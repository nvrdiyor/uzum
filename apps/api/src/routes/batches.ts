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
  batchExtraKind,
  batchOrderSchema,
  batchShipmentSchema,
  batchUpdateSchema,
  batchUzumSchema,
  calcBatch,
  cargoPaidRows,
  cargoPayment,
  cargoPayTracked,
  parseSkuCodes,
  serializeSkuCodes,
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
import { cargoKeyOf, shipKeyOf, tripKeyOf } from '../services/batch-keys.js';
import { getBatchProfit, invalidateBatchProfit, searchBatchSkus, toDetailResponse, toListResponse } from '../services/batch-profit.js';

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
  forUzum: boolean;
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
  trip: string;
  weightKg: number;
  cargoCost: number;
}

const toDelivery = (v: string): BatchDelivery => (v === 'avia' ? 'avia' : 'avto');

type TotalsFields = Pick<ItemRecord, 'priceCny' | 'cargoCost' | 'qty' | 'weightKg'> & {
  extraExcluded?: boolean;
  cargoPaid?: boolean;
};

// ─────────────────────────── Jo'natmalar va kargo muddati ───────────────────────────

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
  trip: string;
  qty: number;
}

const toStatus = (v: string): ShipmentStatus => (v === 'shipped' || v === 'arrived' ? v : 'warehouse');

/**
 * Har partiyaning jo'natmalari va kargolarning haqiqiy muddati.
 *
 * Jo'natma = partiyadagi bitta kargo + bitta yetkazish turi + bitta reys.
 * Partiyada "MANDARIN avia" va "TEZ-TEZ avto" bo'lsa — ikki jo'natma; TEZ-TEZ
 * tovarining yarmi 50-reysda, yarmi 51-reysda kelsa — yana ikkiga bo'linadi:
 * ular har xil kuni keladi va har biri o'rtachaga alohida kiradi. Ilgari
 * bunday partiya bitta jo'natma edi va o'rtacha muddat noto'g'ri chiqardi.
 *
 * O'rtacha kargo + tur bo'yicha (avia va avto muddati bir necha barobar farq
 * qiladi). Bitta reys bir necha partiyaning tovarini olib kelgan bo'lsa, u
 * o'rtachaga BIR marta kiradi — u bitta yuk mashinasi.
 */
function buildShipments(
  batches: ReadonlyArray<{ id: string; items: ReadonlyArray<GroupItem> }>,
  ships: ReadonlyArray<ShipRecord>,
): { byBatch: Map<string, BatchShipment[]>; stats: CargoStat[] } {
  const shipOf = new Map(ships.map((sh) => [`${sh.batchId}|${sh.cargoKey}|${sh.delivery}`, sh]));
  const now = today();

  const groupsOf = new Map<string, BatchShipment[]>();
  /** kargo + tur → kelgan jo'natmalar muddati; reysli jo'natmalar reys bo'yicha birlashtiriladi */
  const statAcc = new Map<
    string,
    {
      cargoName: string;
      delivery: BatchDelivery;
      loose: number[];
      trips: Map<string, number[]>;
      transitLoose: number;
      transitTrips: Set<string>;
    }
  >();

  for (const b of batches) {
    const groups = new Map<string, BatchShipment>();
    for (const it of b.items) {
      const delivery = toDelivery(it.delivery);
      const key = `${shipKeyOf(it.cargoName, it.trip)}|${delivery}`;
      const g = groups.get(key) ?? {
        cargoName: it.cargoName.trim(),
        delivery,
        trip: it.trip.trim(),
        items: 0,
        qty: 0,
        status: 'warehouse' as ShipmentStatus,
        shippedAt: null,
        arrivedAt: null,
        days: null,
        expectedAt: null,
        expectedBasis: null,
        daysLeft: null,
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

      const statKey = `${cargoKeyOf(g.cargoName)}|${g.delivery}`;
      const acc = statAcc.get(statKey) ?? {
        cargoName: g.cargoName,
        delivery: g.delivery,
        loose: [],
        trips: new Map<string, number[]>(),
        transitLoose: 0,
        transitTrips: new Set<string>(),
      };
      const trip = tripKeyOf(g.trip);
      if (g.status === 'arrived' && g.days !== null) {
        if (trip) acc.trips.set(trip, [...(acc.trips.get(trip) ?? []), g.days]);
        else acc.loose.push(g.days);
      }
      if (g.status === 'shipped') {
        if (trip) acc.transitTrips.add(trip);
        else acc.transitLoose += 1;
      }
      statAcc.set(statKey, acc);
    }
    groupsOf.set(b.id, [...groups.values()]);
  }

  /** Yetkazish turi bo'yicha barcha kargolarning muddatlari — kargoning o'z ma'lumoti bo'lmasa zaxira taxmin */
  const modeDays = new Map<BatchDelivery, number[]>();
  const stats: CargoStat[] = [...statAcc.values()]
    .map((a) => {
      // Har reys — bitta nuqta (bir necha partiyada kiritilgan bo'lsa, ularning o'rtachasi)
      const days = [
        ...a.loose,
        ...[...a.trips.values()].map((list) => Math.round(list.reduce((x, y) => x + y, 0) / list.length)),
      ];
      modeDays.set(a.delivery, [...(modeDays.get(a.delivery) ?? []), ...days]);
      return {
        cargoName: a.cargoName,
        delivery: a.delivery,
        arrived: days.length,
        avgDays: days.length ? Math.round((days.reduce((x, y) => x + y, 0) / days.length) * 10) / 10 : null,
        minDays: days.length ? Math.min(...days) : null,
        maxDays: days.length ? Math.max(...days) : null,
        inTransit: a.transitLoose + a.transitTrips.size,
      };
    })
    .filter((st) => st.arrived > 0 || st.inTransit > 0)
    .sort((x, y) => y.arrived - x.arrived || x.cargoName.localeCompare(y.cargoName));

  /*
   * Yo'ldagi har jo'natma (har reys) qachon keladi. Avval shu kargo va turining
   * o'z o'rtachasi; u hali yo'q bo'lsa (kargo birinchi marta olib kelyapti) —
   * shu turdagi barcha kargolar o'rtachasi. Bir partiyadagi ikki reys har biri
   * o'z sanasidan hisoblanadi.
   */
  const avgOf = new Map(stats.map((st) => [`${cargoKeyOf(st.cargoName)}|${st.delivery}`, st.avgDays]));
  const modeAvg = new Map(
    [...modeDays].filter(([, list]) => list.length > 0).map(([mode, list]) => [mode, list.reduce((x, y) => x + y, 0) / list.length]),
  );
  for (const groups of groupsOf.values()) {
    for (const g of groups) {
      if (g.status !== 'shipped' || !g.shippedAt) continue;
      const own = avgOf.get(`${cargoKeyOf(g.cargoName)}|${g.delivery}`);
      const avg = own ?? modeAvg.get(g.delivery) ?? null;
      if (avg == null) continue;
      const expected = new Date(dayDate(g.shippedAt).getTime() + Math.round(avg) * DAY_MS);
      g.expectedAt = isoDay(expected);
      g.expectedBasis = own != null ? 'cargo' : 'mode';
      g.daysLeft = daysBetween(now, expected);
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
      select: { id: true, items: { select: { cargoName: true, delivery: true, trip: true, qty: true } } },
      take: MAX_BATCHES,
    }),
    prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId } } }),
  ]);
  return buildShipments(batches, ships);
}

/** Yo'l kira yig'indisi. Tafsilotsiz (qo'lda yozilgan) qo'shimcha xarajat — boshqa xarajat */
const roadOf = (extras: ReadonlyArray<{ name: string; amount: number; kind: string }>): number =>
  extras.reduce((sum, e) => sum + (batchExtraKind(e) === 'road' ? e.amount : 0), 0);

function toSummary(
  b: BatchRecord,
  items: ReadonlyArray<TotalsFields>,
  shipments: BatchShipment[] = [],
  roadExtra = 0,
  payments: ReadonlyArray<{ amount: number }> = [],
): BatchSummary {
  const totals = calcBatch(b.rate, b.extra, items).totals;
  return {
    id: b.id,
    name: b.name,
    rate: b.rate,
    extra: b.extra,
    totals,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    status: batchStatus(shipments),
    shipments,
    roadExtra: Math.round(roadExtra),
    cargoPayment: cargoPayment(totals.cargoUzs, payments, cargoPayTracked(b.createdAt), cargoPaidRows(items)),
    forUzum: b.forUzum,
  };
}

async function loadDetail(companyId: string, id: string): Promise<BatchDetail> {
  const batch = await prisma.purchaseBatch.findFirst({
    where: { id, companyId },
    include: {
      items: { orderBy: { position: 'asc' } },
      extras: { orderBy: { position: 'asc' } },
      payments: { orderBy: { position: 'asc' } },
    },
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
    ...toSummary(batch, batch.items, byBatch.get(batch.id) ?? [], roadOf(batch.extras), batch.payments),
    items: batch.items.map((it, i) => ({
      id: it.id,
      name: it.name,
      trackCode: it.trackCode,
      qty: it.qty,
      priceCny: it.priceCny,
      cargoName: it.cargoName,
      delivery: toDelivery(it.delivery),
      trip: it.trip,
      weightKg: it.weightKg,
      cargoCost: it.cargoCost,
      extraExcluded: it.extraExcluded,
      cargoPaid: it.cargoPaid,
      skuCodes: parseSkuCodes(it.skuCodes),
      priceUzs: rows[i].priceUzs,
      total: rows[i].total,
      unitCost: rows[i].unitCost,
      extraShare: rows[i].extraShare,
      unitCostFull: rows[i].unitCostFull,
    })),
    extras: batch.extras.map((e) => ({ name: e.name, amount: e.amount, kind: batchExtraKind(e) })),
    payments: batch.payments.map((p) => ({ date: isoDay(p.paidOn), amount: p.amount, cargoName: p.cargoName, note: p.note })),
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
          select: {
            priceCny: true,
            cargoCost: true,
            qty: true,
            weightKg: true,
            extraExcluded: true,
            cargoPaid: true,
            cargoName: true,
            delivery: true,
            trip: true,
          },
        },
        extras: { select: { name: true, amount: true, kind: true } },
        payments: { select: { amount: true } },
      },
    });
    const ships = await prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId: company.id } } });
    const { byBatch, stats } = buildShipments(rows, ships);
    const items = rows.map((b) => toSummary(b, b.items, byBatch.get(b.id) ?? [], roadOf(b.extras), b.payments));

    /*
     * Barcha partiyalar bo'yicha jami — sahifa tepasidagi "Umumiy summa".
     * Unga tovar, cargo va YO'L KIRA kiradi (sotuvchi talabi): logistika, paket
     * kabi boshqa qo'shimcha xarajatlar kirmaydi — ular faqat tovar tannarxida.
     */
    const grand = {
      qty: 0,
      priceCny: 0,
      goodsUzs: 0,
      cargoUzs: 0,
      extra: 0,
      roadExtra: 0,
      otherExtra: 0,
      total: 0,
      cargoPaid: 0,
      cargoDue: 0,
    };
    for (const b of items) {
      grand.qty += b.totals.qty;
      grand.priceCny += b.totals.priceCny;
      grand.goodsUzs += b.totals.goodsUzs;
      grand.cargoUzs += b.totals.cargoUzs;
      grand.extra += b.totals.extra;
      grand.roadExtra += b.roadExtra;
      grand.cargoPaid += b.cargoPayment.paid;
      grand.cargoDue += b.cargoPayment.due;
    }
    grand.priceCny = Math.round(grand.priceCny * 100) / 100;
    grand.otherExtra = Math.max(0, Math.round(grand.extra - grand.roadExtra));
    grand.total = Math.round(grand.goodsUzs + grand.cargoUzs + grand.roadExtra);

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

    invalidateBatchProfit(company.id);
    res.status(201).json(await loadDetail(company.id, created.id));
  }),
);

/**
 * GET /profit — har partiyaga qancha tikilgan, qancha qaytgan va foyda (ro'yxat uchun).
 * `/:id` dan OLDIN e'lon qilinishi shart, aks holda "profit" partiya id'si deb olinadi.
 * Hisob butun kompaniya bo'yicha: FIFO barcha partiyalarga umumiy.
 */
router.get(
  '/profit',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    res.json(toListResponse(await getBatchProfit(company.id)));
  }),
);

/**
 * GET /skus?q= — partiya qatorini bog'lash uchun Uzum tovarlari (ikkala do'kon,
 * bir xil kodlilar birlashtirilgan). So'rov bo'yicha topilmasa — so'zlarning
 * biri mos kelganlari. `/:id` dan OLDIN e'lon qilinadi.
 */
router.get(
  '/skus',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const q = String(req.query.q ?? '').trim().slice(0, 100);
    const take = Math.min(100, Math.max(1, Math.floor(Number(req.query.take) || 40)));
    res.json(await searchBatchSkus(company.id, q, take));
  }),
);

/** GET /:id/profit — bitta partiya foydasi qatorlari bilan */
router.get(
  '/:id/profit',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const own = await prisma.purchaseBatch.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!own) throw AppError.notFound('Partiya topilmadi');
    const detail = toDetailResponse(await getBatchProfit(company.id), id);
    if (!detail) throw AppError.notFound('Partiya topilmadi');
    res.json(detail);
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

      /*
       * Eski sahifa versiyasi yangi maydonlarni ("cargo to'langan" belgisi, Uzum
       * tovariga bog'lanish) bilmaydi va yubormaydi — u saqlaganda ular o'chib
       * ketmasin: nomi va trek kodi bir xil qatordan olinadi (qatorlar ko'chirilgan
       * bo'lsa ham). Har maydon alohida tekshiriladi: sahifa birini bilib,
       * ikkinchisini bilmasligi mumkin.
       */
      const rowKey = (it: { name: string; trackCode: string }) => JSON.stringify([it.name, it.trackCode]);
      const keepPaid = body.items.length > 0 && body.items.every((it) => it.cargoPaid === undefined);
      const keepCodes = body.items.length > 0 && body.items.every((it) => it.skuCodes === undefined);
      const carried = new Map<string, { cargoPaid: boolean; skuCodes: string }[]>();
      if (keepPaid || keepCodes) {
        const prev = await tx.purchaseBatchItem.findMany({
          where: { batchId: id },
          orderBy: { position: 'asc' },
          select: { name: true, trackCode: true, cargoPaid: true, skuCodes: true },
        });
        for (const p of prev) carried.set(rowKey(p), [...(carried.get(rowKey(p)) ?? []), p]);
      }

      await tx.purchaseBatchItem.deleteMany({ where: { batchId: id } });
      await tx.purchaseBatchItem.createMany({
        // Maydonlar aniq sanab yoziladi: so'rovdagi ro'yxat (skuCodes) bazaga matn bo'lib tushadi
        data: body.items.map((it, position) => {
          // Nomi va trek kodi bir xil qatorlar navbat bilan — har biri o'zinikini oladi
          const prev = keepPaid || keepCodes ? carried.get(rowKey(it))?.shift() : undefined;
          return {
            batchId: id,
            position,
            name: it.name,
            trackCode: it.trackCode,
            qty: it.qty,
            priceCny: it.priceCny,
            cargoName: it.cargoName,
            delivery: it.delivery,
            trip: it.trip,
            weightKg: it.weightKg,
            cargoCost: it.cargoCost,
            extraExcluded: it.extraExcluded,
            cargoPaid: it.cargoPaid ?? prev?.cargoPaid ?? false,
            // undefined — eski sahifa (oldingisi qoladi); null — tegilmagan; [] — ataylab yo'q ('-')
            skuCodes: it.skuCodes !== undefined ? serializeSkuCodes(it.skuCodes) : keepCodes ? (prev?.skuCodes ?? '') : '',
          };
        }),
      });

      if (extras) {
        await tx.purchaseBatchExtra.deleteMany({ where: { batchId: id } });
        await tx.purchaseBatchExtra.createMany({
          data: extras.map((e, position) => ({ ...e, batchId: id, position })),
        });
      }

      // Cargo to'lovlari: berilsa to'liq almashtiriladi; summasi va izohi yo'q qator yozilmaydi
      if (body.payments) {
        await tx.purchaseBatchPayment.deleteMany({ where: { batchId: id } });
        await tx.purchaseBatchPayment.createMany({
          data: body.payments
            .filter((p) => p.amount > 0 || p.note)
            .map((p, position) => ({
              batchId: id,
              position,
              paidOn: p.date ? dayDate(p.date) : null,
              amount: p.amount,
              cargoName: p.cargoName,
              note: p.note,
            })),
        });
      }
    });

    // Foyda hisobi yangi qatorlar bilan qayta hisoblansin (yozuv tranzaksiyasi tugadi)
    invalidateBatchProfit(company.id);
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

    const cargoKey = shipKeyOf(body.cargoName, body.trip);
    const data = {
      status: body.status,
      shippedAt: shippedIso ? dayDate(shippedIso) : null,
      arrivedAt: arrivedIso ? dayDate(arrivedIso) : null,
    };

    /*
     * Reys — bitta yuk mashinasi (yoki samolyot). Unda boshqa partiyalarning
     * tovari ham ketgan bo'lsa, ular ham shu kuni jo'natilgan va shu kuni keladi:
     * holat va sanalar o'sha partiyalarga ham yoziladi. Reyssiz jo'natma —
     * faqat shu partiyaniki.
     */
    const batchIds = new Set<string>([id]);
    if (tripKeyOf(body.trip)) {
      const same = await prisma.purchaseBatchItem.findMany({
        where: { batch: { companyId: company.id }, delivery: body.delivery, trip: { not: '' } },
        select: { batchId: true, cargoName: true, trip: true },
      });
      for (const it of same) if (shipKeyOf(it.cargoName, it.trip) === cargoKey) batchIds.add(it.batchId);
    }

    await prisma.$transaction(
      [...batchIds].map((batchId) =>
        prisma.purchaseBatchShipment.upsert({
          where: { batchId_cargoKey_delivery: { batchId, cargoKey, delivery: body.delivery } },
          create: { batchId, cargoKey, delivery: body.delivery, ...data },
          update: data,
        }),
      ),
    );

    invalidateBatchProfit(company.id);
    const { byBatch, stats } = await companyShipments(company.id);
    const shipments = byBatch.get(id) ?? [];
    res.json({ shipments, status: batchStatus(shipments), cargoStats: stats });
  }),
);

/**
 * PUT /:id/uzum — partiya Uzum'da sotish uchunmi (2026-11-13, egasi: "FOR MY bu partiya
 * emas — belgilasa partiyalar foydasida bo'lsin"). Belgisi olingan partiya «Partiya
 * foydasi»da hisoblanmaydi va Uzum sotuvlarini olmaydi.
 *
 * `updatedAt` ATAYLAB o'zgartirilmaydi (PUT /order kabi): u jadval mazmunining versiyasi —
 * ochiq jadval belgi tufayli "boshqa joyda o'zgargan" deb saqlashni rad etmasin. Butun
 * partiya PUT'i bu maydonga tegmaydi, shuning uchun ochiq jadval uni qaytarib yozmaydi.
 */
router.put(
  '/:id/uzum',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const { forUzum } = batchUzumSchema.parse(req.body ?? {});
    /*
     * Solishtirib-yozish: o'qilgan versiya o'zgarmagan bo'lsagina yoziladi va o'sha versiya
     * qoldiriladi. Oddiy "o'qi, keyin yoz" bo'lsa, shu orada saqlangan jadvalning yangi
     * versiyasi ustiga eskisi yozilib qolardi: ochiq sahifa keyingi saqlashda 409 olardi,
     * eski oyna esa qulfni aylanib o'tardi. Belgi mazmun emas — 409 o'rniga qayta uriniladi.
     */
    let written = false;
    for (let attempt = 0; attempt < 3 && !written; attempt += 1) {
      const batch = await prisma.purchaseBatch.findFirst({ where: { id, companyId: company.id }, select: { updatedAt: true } });
      if (!batch) throw AppError.notFound('Partiya topilmadi');
      const r = await prisma.purchaseBatch.updateMany({
        where: { id, companyId: company.id, updatedAt: batch.updatedAt },
        data: { forUzum, updatedAt: batch.updatedAt },
      });
      written = r.count === 1;
    }
    if (!written) throw AppError.conflict('Partiya hozir saqlanmoqda — belgini qayta bosing');
    // Foyda hisobi: barmoq izi updatedAt ni sezmaydi — kesh qo'lda unutiladi
    invalidateBatchProfit(company.id);
    res.json({ id, forUzum });
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
    invalidateBatchProfit(company.id);
    res.json({ ok: true, id });
  }),
);

export default router;
