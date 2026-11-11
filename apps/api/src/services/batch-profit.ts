/**
 * Partiya foydasi — ma'lumotni yig'ish (hisobning o'zi toza: packages/shared
 * batch-profit.ts). Har so'rovda butun kompaniya bo'yicha qayta hisoblanadi:
 * FIFO hamma partiyalarga umumiy (bir partiyaning sanasi boshqasining sotuviga
 * ta'sir qiladi), buyurtma qatorlari esa har sinxronda qayta yoziladi —
 * saqlangan taqsimot eskirib qolardi.
 *
 * Qaysi sotuv: kompaniyaning barcha do'konlari (yuqoridagi do'kon tanlovi
 * ATAYLAB hisobga olinmaydi — partiya kompaniyaniki), FBO ham FBS ham, tirik
 * pozitsiyalar (bekor qilingan va qaytgan donasiz).
 */
import { prisma } from '@savdoiq/db';
import {
  allocateBatchSales,
  calcBatch,
  matchesSkuQuery,
  normalizeCardText,
  normSkuCode,
  parseSkuQuery,
  profitRow,
  parseSkuCodes,
  resolveRowLinks,
  summarizeBatchProfit,
  toBusinessDate,
  type BatchSkuOption,
  type BatchSkuSearchResponse,
  type BatchProfitDetail,
  type BatchProfitFix,
  type BatchProfitListResponse,
  type BatchProfitOrder,
  type BatchProfitRow,
  type BatchProfitSku,
  type BatchProfitSummary,
  type BatchProfitTotals,
  type BatchProfitUnattributed,
  type ProfitLineInput,
  type ProfitLotInput,
  type ProfitMoneyState,
  type ProfitOpeningInput,
  type ProfitRowInput,
  type ProfitTake,
  type ResolvedRowLink,
  type ShipmentStatus,
} from '@savdoiq/shared';
import { getStoreIds, getTaxRate } from './common.js';
import { shipKeyOf } from './batch-keys.js';

const MAX_BATCHES = 500;
/** Bitta `IN (...)` ro'yxatidagi qiymatlar — SQLite o'zgaruvchilar chegarasidan ancha past */
const IN_CHUNK = 500;
/** Qator bo'yicha qaytariladigan sotuvlar (tekshirish ro'yxati) */
const ORDERS_PER_ROW = 50;
/** Uzum'ning umrbod hisoblagichi bizdagidan shuncha ko'p bo'lsa — tarix to'liq emas */
const HISTORY_GAP_MIN = 1;

const chunk = <T>(items: readonly T[], size = IN_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toStatus = (v: string): ShipmentStatus => (v === 'shipped' || v === 'arrived' ? v : 'warehouse');
const toDelivery = (v: string): 'avia' | 'avto' => (v === 'avia' ? 'avia' : 'avto');

interface LoadedRow {
  name: string;
  qty: number;
  cost: number;
  extraExcluded: boolean;
  cargoName: string;
  delivery: 'avia' | 'avto';
  trip: string;
  noKg: boolean;
  legStatus: ShipmentStatus;
  shippedAt: string | null;
  arrivedAt: string | null;
  link: ResolvedRowLink;
  /** `lots` dagi o'rni; lot bo'lmasa -1 */
  lot: number;
}

interface LoadedBatch {
  id: string;
  name: string;
  createdAt: Date;
  undistributed: number;
  rows: LoadedRow[];
}

export interface BatchProfitBook {
  batches: LoadedBatch[];
  totals: Map<string, BatchProfitTotals>;
  rowsOf: Map<string, BatchProfitRow[]>;
  unattributed: BatchProfitUnattributed;
  skus: Map<string, BatchProfitSku>;
  taxRate: number;
  syncedAt: string | null;
  storeCount: number;
}

/**
 * Butun kompaniya bo'yicha partiya foydasi. `now` — testlar uchun (pul holati:
 * kelajakdagi yetkazish sanasi hali yo'lda).
 */
export async function loadBatchProfit(companyId: string, now: Date = new Date()): Promise<BatchProfitBook> {
  const [batchRecs, ships, storeIds, taxRate, stores, account] = await Promise.all([
    prisma.purchaseBatch.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_BATCHES,
      select: {
        id: true,
        name: true,
        rate: true,
        extra: true,
        createdAt: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            name: true,
            qty: true,
            priceCny: true,
            cargoCost: true,
            weightKg: true,
            extraExcluded: true,
            cargoName: true,
            delivery: true,
            trip: true,
            skuCodes: true,
          },
        },
      },
    }),
    prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId } } }),
    getStoreIds(companyId),
    getTaxRate(companyId),
    prisma.store.findMany({ where: { companyId }, select: { id: true, title: true } }),
    prisma.uzumAccount.findFirst({ where: { companyId, lastSyncAt: { not: null } }, orderBy: { lastSyncAt: 'desc' }, select: { lastSyncAt: true } }),
  ]);

  // ── Qatorlar: tannarx, jo'natma holati, bog'lanish ──
  const shipOf = new Map(ships.map((sh) => [`${sh.batchId}|${sh.cargoKey}|${sh.delivery}`, sh]));
  const links = resolveRowLinks(
    batchRecs.map((b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt.toISOString(),
      items: b.items.map((it) => ({ name: it.name, skuCodes: parseSkuCodes(it.skuCodes), extraExcluded: it.extraExcluded })),
    })),
  );

  const lots: ProfitLotInput[] = [];
  const lotMeta: { batch: number; row: number }[] = [];
  const batches: LoadedBatch[] = batchRecs.map((b, bi) => {
    const calc = calcBatch(b.rate, b.extra, b.items);
    const rows = b.items.map<LoadedRow>((it, ri) => {
      const r = calc.rows[ri];
      const delivery = toDelivery(it.delivery);
      const leg = shipOf.get(`${b.id}|${shipKeyOf(it.cargoName, it.trip)}|${delivery}`);
      const legStatus = toStatus(leg?.status ?? 'warehouse');
      const link = links[bi][ri];
      const qty = Math.max(0, Math.floor(it.qty || 0));
      const row: LoadedRow = {
        name: it.name,
        qty,
        cost: r.total + r.extraShare,
        extraExcluded: it.extraExcluded,
        cargoName: it.cargoName,
        delivery,
        trip: it.trip,
        noKg: qty > 0 && r.unitCostFull === null,
        legStatus,
        shippedAt: isoDay(leg?.shippedAt),
        arrivedAt: legStatus === 'arrived' ? isoDay(leg?.arrivedAt) : null,
        link,
        lot: -1,
      };
      if ((link.link === 'explicit' || link.link === 'name') && qty > 0 && link.codes.length > 0) {
        row.lot = lots.length;
        lotMeta.push({ batch: bi, row: ri });
        lots.push({
          batchId: b.id,
          batchCreatedAt: b.createdAt.toISOString(),
          position: ri,
          qty,
          codes: [...new Set(link.codes.map(normSkuCode))],
          // «Keldi», lekin sanasiz (eski yozuv) — darvozasiz
          availableFrom: legStatus === 'arrived' ? (row.arrivedAt ?? '0000-01-01') : null,
          // Hali kelmagan lotga undan oldingi sotuv ayblanmaydi: u jo'natilmagan (yoki partiya hali yo'q) edi
          notBefore: row.shippedAt ?? toBusinessDate(b.createdAt),
        });
      }
      return row;
    });
    const undistributed = calc.totals.extra - calc.rows.reduce((a, r) => a + r.extraShare, 0);
    return { id: b.id, name: b.name, createdAt: b.createdAt, undistributed, rows };
  });

  // ── Katalog: kod → SKU'lar ──
  /** Sotuvi o'qiladigan kodlar — lotlarniki (soni bor bog'langan qatorlar) */
  const codes = new Set(lots.flatMap((l) => l.codes));
  /** Ko'rsatish uchun — barcha bog'lanishlardagi kodlar (soni hali yozilmagan qatorniki ham) */
  const shownCodes = new Set([...codes, ...links.flat().flatMap((l) => l.codes.map(normSkuCode))]);
  const skuRecs = storeIds.length
    ? await prisma.sku.findMany({
        where: { storeId: { in: storeIds } },
        select: {
          id: true,
          sku: true,
          title: true,
          imageUrl: true,
          storeId: true,
          uzumSold: true,
          uzumReturned: true,
          product: { select: { title: true } },
        },
      })
    : [];
  const storeTitle = new Map(stores.map((s) => [s.id, s.title]));
  const codeOfSku = new Map<string, string>();
  const skus = new Map<string, BatchProfitSku>();
  const skuIdsOfCode = new Map<string, string[]>();
  for (const s of skuRecs) {
    const code = normSkuCode(s.sku);
    codeOfSku.set(s.id, code);
    if (!shownCodes.has(code)) continue;
    if (codes.has(code)) {
      const ids = skuIdsOfCode.get(code);
      if (ids) ids.push(s.id);
      else skuIdsOfCode.set(code, [s.id]);
    }
    const cur = skus.get(code);
    const store = storeTitle.get(s.storeId) ?? '';
    if (cur) {
      if (store && !cur.stores.includes(store)) cur.stores.push(store);
      if (!cur.imageUrl && s.imageUrl) cur.imageUrl = s.imageUrl;
    } else {
      skus.set(code, { code: s.sku, title: s.title || s.product.title, imageUrl: s.imageUrl, stores: store ? [store] : [] });
    }
  }
  const relevantSkuIds = [...skuIdsOfCode.values()].flat();
  // Katalogsiz (SKU'si o'chgan) pozitsiyalar kodi bo'yicha: bog'lanishdagi va katalogdagi yozilishlar
  const rawCodes = [
    ...new Set([
      ...batches.flatMap((b) => b.rows.filter((r) => r.lot >= 0).flatMap((r) => r.link.codes.map((c) => c.trim()))),
      ...skuRecs.filter((s) => codes.has(normSkuCode(s.sku))).map((s) => s.sku),
    ]),
  ];

  // ── Sotuvlar ──
  const lineRecs: {
    id: string;
    skuId: string | null;
    skuCode: string | null;
    qty: number;
    payout: number;
    revenue: number;
    orderedAt: Date;
    order: { status: string; deliveredAt: Date | null; uzumOrderId: string | null };
  }[] = [];
  const lineSelect = {
    id: true,
    skuId: true,
    skuCode: true,
    qty: true,
    payout: true,
    revenue: true,
    orderedAt: true,
    order: { select: { status: true, deliveredAt: true, uzumOrderId: true } },
  } as const;
  const liveWhere = {
    order: { storeId: { in: storeIds } },
    status: { notIn: ['canceled', 'returned'] },
    returnedAt: null,
    qty: { gt: 0 },
  };
  if (storeIds.length && codes.size) {
    // push(...rows) EMAS: ~125 mingdan ko'p argument V8 stekini to'ldiradi
    for (const part of chunk(relevantSkuIds)) {
      for (const l of await prisma.orderItem.findMany({ where: { ...liveWhere, skuId: { in: part } }, select: lineSelect })) lineRecs.push(l);
    }
    for (const part of chunk(rawCodes)) {
      for (const l of await prisma.orderItem.findMany({ where: { ...liveWhere, skuId: null, skuCode: { in: part } }, select: lineSelect })) lineRecs.push(l);
    }
  }
  const nowMs = now.getTime();
  const stateOf = (o: { status: string; deliveredAt: Date | null }): ProfitMoneyState =>
    !o.deliveredAt || o.deliveredAt.getTime() > nowMs ? 'transit' : o.status === 'new' || o.status === 'processing' ? 'held' : 'unlocked';
  const lines: ProfitLineInput[] = [];
  const lineOrderNo: (string | null)[] = [];
  for (const l of lineRecs) {
    // Katalogdagi kod ustun: pozitsiyadagi kod eski bo'lishi mumkin
    const code = (l.skuId ? codeOfSku.get(l.skuId) : undefined) ?? normSkuCode(l.skuCode ?? '');
    if (!codes.has(code)) continue;
    lines.push({
      id: l.id,
      code,
      day: toBusinessDate(l.orderedAt),
      at: l.orderedAt.getTime(),
      units: l.qty,
      payout: l.payout,
      revenue: l.revenue,
      tax: Math.round((l.revenue * taxRate) / 100),
      state: stateOf(l.order),
    });
    lineOrderNo.push(l.order.uzumOrderId);
  }

  // ── Uzum qabul qilgan donalar: eski qoldiq va sana dalillari ──
  const receiptRecs = relevantSkuIds.length
    ? (
        await Promise.all(
          chunk(relevantSkuIds).map((part) =>
            prisma.shipmentItem.findMany({
              where: { skuId: { in: part }, accepted: { gt: 0 }, shipment: { source: 'uzum', status: 'accepted' } },
              select: { skuId: true, accepted: true, shipment: { select: { acceptedAt: true, plannedAt: true, createdAt: true } } },
            }),
          ),
        )
      ).flat()
    : [];
  const receipts = new Map<string, { day: string; units: number }[]>();
  for (const r of receiptRecs) {
    const code = codeOfSku.get(r.skuId);
    if (!code) continue;
    // Tovar balansi bilan bir xil qoida (stock-balance.ts): qabul payti, bo'lmasa reja, bo'lmasa yaratilgan
    const at = r.shipment.acceptedAt ?? r.shipment.plannedAt ?? r.shipment.createdAt;
    const item = { day: toBusinessDate(at), units: r.accepted };
    const list = receipts.get(code);
    if (list) list.push(item);
    else receipts.set(code, [item]);
  }
  for (const list of receipts.values()) list.sort((a, b) => a.day.localeCompare(b.day));

  /*
   * Tarix to'liqmi: Uzum'ning umrbod hisoblagichi (sotilgan + qaytgan) bizdagi
   * barcha pozitsiyalardan ko'p bo'lsa — buyurtmalarning bir qismi SavdoIQ
   * tarixidan oldin. Tovar balansi bilan bir xil o'lchov (stock-balance.ts).
   */
  const dbUnits = new Map<string, number>();
  for (const part of chunk(relevantSkuIds)) {
    const sums = await prisma.orderItem.groupBy({ by: ['skuId'], where: { skuId: { in: part } }, _sum: { qty: true, returnedQty: true } });
    for (const s of sums) if (s.skuId) dbUnits.set(s.skuId, (s._sum.qty ?? 0) + (s._sum.returnedQty ?? 0));
  }
  const historyGap = new Map<string, number>();
  for (const s of skuRecs) {
    const code = codeOfSku.get(s.id);
    if (!code || !codes.has(code)) continue;
    const uzumUnits = s.uzumSold + s.uzumReturned;
    if (uzumUnits <= 0) continue;
    const gap = uzumUnits - (dbUnits.get(s.id) ?? 0);
    if (gap >= HISTORY_GAP_MIN) historyGap.set(code, (historyGap.get(code) ?? 0) + gap);
  }

  const shippedOfLot = lotMeta.map((m) => batches[m.batch].rows[m.row].shippedAt);
  const createdDayOfLot = lotMeta.map((m) => toBusinessDate(batches[m.batch].createdAt));
  const byCreatedLot = (a: number, b: number): number =>
    lots[a].batchCreatedAt.localeCompare(lots[b].batchCreatedAt) ||
    lots[a].batchId.localeCompare(lots[b].batchId) ||
    lots[a].position - lots[b].position;
  const lotsOfCode = new Map<string, number[]>();
  lots.forEach((l, i) => {
    for (const code of l.codes) {
      const list = lotsOfCode.get(code);
      if (list) list.push(i);
      else lotsOfCode.set(code, [i]);
    }
  });

  /*
   * Eski qoldiq: Uzum shu tovarni hech bir partiya JO'NATILMASIDAN oldin qabul
   * qilgan bo'lsa — u partiyadan emas, oldingi tovar: birinchi sotiladi va hech
   * qaysi partiyaga yozilmaydi. Faqat shu tovarning har bir lotida jo'natilgan
   * sana yozilgan bo'lsa quriladi (chegara — eng erta jo'natilgan kun). Partiya
   * yaratilgan kun chegara EMAS: eski xaridlar keyin kiritiladi (Excel'dan
   * ko'chirilgan) — ularning o'z qabuli "eski qoldiq" bo'lib, sotuvi yashirinib
   * qolardi. Uzum hisoblagichi SavdoIQ tarixidan ko'p sotuv ko'rsatsa, o'sha
   * farq eng eski qabullardan ayriladi: u tarixdan oldin sotilgan.
   */
  /*
   * Chegarada har lot o'zining eng erta mavjud bo'lishi mumkin kuni bilan qatnashadi:
   * jo'natilgan kuni, u yozilmagan va hali «Keldi» bo'lmagan lot — partiya yaratilgan
   * kuni (hisob ham uni shu kundan oldin "ayblamaydi"; Xitoydagi qayta buyurtma eski
   * qoldiqni o'chirib qo'ymasin). «Keldi», lekin jo'natilgani yozilmagan lot bo'lsa —
   * eski qoldiq qurilmaydi: bu keyin kiritilgan eski partiya bo'lishi mumkin, uning o'z
   * qabuli "eski qoldiq" bo'lib qolmasin.
   */
  const openings: ProfitOpeningInput[] = [];
  const openingBound = new Map<string, string>();
  for (const [code, idx] of lotsOfCode) {
    if (idx.some((i) => lots[i].availableFrom !== null && !shippedOfLot[i])) continue;
    const bound = idx.map((i) => shippedOfLot[i] ?? createdDayOfLot[i]).sort()[0];
    openingBound.set(code, bound);
    let skip = historyGap.get(code) ?? 0;
    for (const r of receipts.get(code) ?? []) {
      if (r.day >= bound) continue;
      const units = Math.max(0, r.units - skip);
      skip = Math.max(0, skip - r.units);
      if (units > 0) openings.push({ code, day: r.day, units });
    }
  }

  /*
   * Kelgan sana dalili. Uzum tovarni qabul qilgan kuni u sotuvchida bo'lgan.
   * Bir lotda birga turgan kodlar (ranglar) bitta guruh: guruh qabullari kun
   * tartibida yig'iladi va o'sha kungacha kelgan lotlar sig'imi (har lot bir marta)
   * bilan solishtiriladi — faqat sig'imdan OSHGAN qismi hali «Keldi» bo'lmagan
   * (yoki kech belgilangan) lotga dalil: kelib bo'lgan partiya izohlaydigan qabul
   * yangi partiyaga taklif qilinmaydi. Dalil avval o'sha kungacha jo'natilgani
   * yozilgan lotga (eng erta jo'natilganiga), bo'lmasa jo'natmasi yozilmagan lotga
   * beriladi: «Keldi» bo'lganiga (keyin kiritilgan bo'lishi mumkin) yoki o'sha kungacha
   * yaratilganiga — hali yaratilmagan partiya qabul qilingan tovarning egasi bo'lolmaydi.
   * Tanlangan lot shu kundan sig'imga qo'shiladi — keyingi qabullarni ham u izohlaydi.
   */
  const evidence: (string | null)[] = lots.map(() => null);
  const parent = new Map<string, string>();
  const root = (code: string): string => {
    let r = code;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string;
    let c = code;
    while (c !== r) {
      const next = parent.get(c) as string;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const l of lots) for (let k = 1; k < l.codes.length; k += 1) {
    const a = root(l.codes[0]);
    const b = root(l.codes[k]);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, { lots: number[]; receipts: { day: string; units: number }[] }>();
  const groupOf = (code: string) => {
    const key = root(code);
    const cur = groups.get(key);
    if (cur) return cur;
    const fresh = { lots: [] as number[], receipts: [] as { day: string; units: number }[] };
    groups.set(key, fresh);
    return fresh;
  };
  lots.forEach((l, i) => {
    if (l.codes.length) groupOf(l.codes[0]).lots.push(i);
  });
  for (const [code, list] of receipts) {
    if (!lotsOfCode.has(code)) continue;
    const bound = openingBound.get(code);
    const g = groupOf(code);
    // Eski qoldiq qabullari dalil emas
    for (const r of list) if (!(bound && r.day < bound)) g.receipts.push(r);
  }
  for (const g of groups.values()) {
    if (!g.lots.length || !g.receipts.length) continue;
    g.receipts.sort((a, b) => a.day.localeCompare(b.day));
    const assumed = new Map<number, string>();
    const fromOf = (k: number): string | null => {
      const actual = lots[k].availableFrom;
      const guess = assumed.get(k) ?? null;
      return actual && guess ? (actual < guess ? actual : guess) : (actual ?? guess);
    };
    let received = 0;
    for (const r of g.receipts) {
      received += r.units;
      let capacity = g.lots.reduce((a, k) => {
        const f = fromOf(k);
        return a + (f !== null && f <= r.day ? lots[k].qty : 0);
      }, 0);
      while (received > capacity) {
        const open = g.lots.filter((k) => {
          const f = fromOf(k);
          return f === null || f > r.day;
        });
        const dated = open
          .filter((k) => shippedOfLot[k] !== null && (shippedOfLot[k] as string) <= r.day)
          .sort((a, b) => (shippedOfLot[a] as string).localeCompare(shippedOfLot[b] as string) || byCreatedLot(a, b));
        const undated = open
          .filter((k) => shippedOfLot[k] === null && (lots[k].availableFrom !== null || createdDayOfLot[k] <= r.day))
          .sort(byCreatedLot);
        const pick = dated[0] ?? undated[0];
        if (pick === undefined) break;
        assumed.set(pick, r.day);
        const cur = evidence[pick];
        if (!cur || r.day < cur) evidence[pick] = r.day;
        capacity += lots[pick].qty;
      }
    }
  }

  // ── Taqsimlash ──
  const alloc = allocateBatchSales(lots, openings, lines);

  // ── Partiyalar va qatorlar ──
  const totals = new Map<string, BatchProfitTotals>();
  const rowsOf = new Map<string, BatchProfitRow[]>();
  for (const b of batches) {
    const inputs: ProfitRowInput[] = b.rows.map((r) => ({
      name: r.name,
      link: r.link.link,
      qty: r.qty,
      cost: r.cost,
      legStatus: r.legStatus,
      take: r.lot >= 0 ? alloc.lots[r.lot] : null,
      optedOut: r.link.optedOut,
    }));
    totals.set(b.id, summarizeBatchProfit(inputs, b.undistributed));
    rowsOf.set(
      b.id,
      b.rows.map((r, index) => {
        const take = r.lot >= 0 ? alloc.lots[r.lot] : null;
        const calc = profitRow(inputs[index]);
        const pieces = take ? [...take.pieces].sort((x, y) => lines[y.line].at - lines[x.line].at || y.line - x.line) : [];
        const orders: BatchProfitOrder[] = pieces.slice(0, ORDERS_PER_ROW).map((p) => ({
          orderNo: lineOrderNo[p.line],
          day: lines[p.line].day,
          units: p.units,
          moneyBack: p.payout - p.tax,
          state: lines[p.line].state,
        }));
        return {
          ...calc,
          index,
          name: r.name,
          link: r.link.link,
          codes: r.link.codes,
          linkFrom: r.link.from,
          optedOut: r.link.optedOut,
          qty: r.qty,
          legStatus: r.legStatus,
          arrivedAt: r.arrivedAt,
          beforeArrival: take?.beforeArrival ?? 0,
          notMarked: take?.notMarked ?? 0,
          firstSaleAt: take?.firstDay ?? null,
          lastSaleAt: take?.lastDay ?? null,
          soldOutAt: take && calc.left === 0 ? take.soldOutDay : null,
          missingCodes: r.link.codes.filter((c) => !skus.has(normSkuCode(c))),
          fix: take ? fixOf(r, take, evidence[r.lot]) : null,
          orders,
          ordersTotal: pieces.length,
        } satisfies BatchProfitRow;
      }),
    );
  }

  // ── Hech qaysi partiyaga tushmagan sotuv ──
  const unattributed: BatchProfitUnattributed = {
    units: 0,
    moneyBack: 0,
    opening: 0,
    beforeArrival: 0,
    notMarked: 0,
    overTracked: 0,
    top: [],
  };
  const tops: { code: string; title: string; units: number }[] = [];
  for (const [code, v] of alloc.byCode) {
    unattributed.units += v.units;
    unattributed.moneyBack += v.payout - v.tax;
    unattributed.opening += v.opening;
    unattributed.beforeArrival += v.beforeArrival;
    unattributed.notMarked += v.notMarked;
    unattributed.overTracked += v.overTracked;
    // Eski qoldiqdan sotilgani — tushunarli, ro'yxatda alohida ko'rsatilmaydi
    const unexplained = v.units - v.opening;
    if (unexplained > 0) tops.push({ code: skus.get(code)?.code ?? code, title: skus.get(code)?.title ?? '', units: unexplained });
  }
  unattributed.top = tops.sort((a, b) => b.units - a.units || a.code.localeCompare(b.code)).slice(0, 5);

  return {
    batches,
    totals,
    rowsOf,
    unattributed,
    skus,
    taxRate,
    syncedAt: account?.lastSyncAt?.toISOString() ?? null,
    storeCount: stores.length,
  };
}

/**
 * Sanani bir bosishda tuzatish taklifi (`evidence` — Uzum shu lot tovarini
 * qabul qilgan birinchi kun, yuqoridagi qoida bilan):
 *  • hali «Keldi» emas, lekin Uzum qabul qilgan yoki tovaridan sotilgan
 *    (notMarked) — taklif: qabul kuni, bo'lmasa birinchi shunday sotuv kuni;
 *  • «Keldi», lekin Uzum undan oldin qabul qilgan va oldin sotilgan
 *    (beforeArrival) — taklif: qabul kuni. Uzum dalilisiz taklif berilmaydi:
 *    oldingi sotuv eski qoldiqdan bo'lishi mumkin.
 * Kelgan sana jo'natilgandan oldin bo'lolmaydi (server ham rad etadi).
 */
function fixOf(row: LoadedRow, take: ProfitTake, evidence: string | null): BatchProfitFix | null {
  const leg = { cargoName: row.cargoName, delivery: row.delivery, trip: row.trip, shippedAt: row.shippedAt };
  const notBefore = (d: string): string => (row.shippedAt && d < row.shippedAt ? row.shippedAt : d);

  if (row.legStatus !== 'arrived') {
    const sale = take.notMarked > 0 ? take.firstBlameDay : null;
    const ev = evidence && (!sale || evidence <= sale) ? evidence : null;
    const date = ev ?? sale;
    return date ? { kind: 'arrive', date: notBefore(date), basis: ev ? 'invoice' : 'sale', ...leg } : null;
  }
  if (row.arrivedAt && take.beforeArrival > 0 && evidence && evidence < row.arrivedAt) {
    return { kind: 'earlier', date: notBefore(evidence), basis: 'invoice', ...leg };
  }
  return null;
}

// ─────────────────────────── Kesh ───────────────────────────

/*
 * Hisob butun kompaniya bo'yicha va og'ir: partiya sahifasi har avtomatik
 * saqlashdan keyin uni qayta so'raydi, ro'yxat ham. Natija qisqa muddat
 * eslab qolinadi; bir vaqtdagi so'rovlar bitta hisobni kutadi. Barmoq izi —
 * partiyalar va jo'natmalarning soni va oxirgi o'zgarishi, do'konlar soni,
 * kompaniya (soliq stavkasi) va oxirgi sinxron. Sinxron ishlayotganda
 * keshlanmaydi: buyurtmalar bo'laklab qayta yozilmoqda.
 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 32;
const cache = new Map<string, { fp: string; at: number; book: Promise<BatchProfitBook> }>();

async function fingerprint(companyId: string): Promise<string | null> {
  const [batch, ship, company, account, stores, running, jobs, invoices] = await Promise.all([
    prisma.purchaseBatch.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.purchaseBatchShipment.aggregate({ where: { batch: { companyId } }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { updatedAt: true, taxRate: true } }),
    prisma.uzumAccount.aggregate({ where: { companyId }, _max: { lastSyncAt: true } }),
    prisma.store.count({ where: { companyId } }),
    prisma.syncJob.count({ where: { companyId, status: 'running' } }),
    // Buyurtma va SKU'larni faqat sinxron yozadi: har tugagan ish (oddiy ham, tarixni yuklash ham) izni o'zgartiradi
    prisma.syncJob.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.shipment.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
  ]);
  if (running > 0) return null;
  return [
    batch._count._all,
    batch._max.updatedAt?.getTime() ?? 0,
    ship._count._all,
    ship._max.updatedAt?.getTime() ?? 0,
    company?.updatedAt.getTime() ?? 0,
    company?.taxRate ?? 0,
    account._max.lastSyncAt?.getTime() ?? 0,
    stores,
    jobs._count._all,
    jobs._max.updatedAt?.getTime() ?? 0,
    invoices._count._all,
    invoices._max.updatedAt?.getTime() ?? 0,
  ].join('|');
}

/** Testlar uchun: bazaga sinxronsiz to'g'ridan-to'g'ri yozilganda */
export function resetBatchProfitCache(): void {
  cache.clear();
}

/**
 * Partiya yozuvidan keyin (yozuv tranzaksiyasi tugagach) — kompaniya hisobini
 * unutish. Barmoq izi yetmaydi: ikki partiya bir vaqtda saqlansa, keyinroq
 * tugagani oldinroq vaqt tamg'asi bilan yozilishi mumkin (eng katta updatedAt
 * o'zgarmaydi) — eski raqamlar 60 soniya ko'rinib turardi.
 */
export function invalidateBatchProfit(companyId: string): void {
  cache.delete(companyId);
}

/** Marshrutlar shu orqali oladi: o'zgarish bo'lmasa — eslab qolingan hisob */
export async function getBatchProfit(companyId: string): Promise<BatchProfitBook> {
  const fp = await fingerprint(companyId);
  if (fp === null) return loadBatchProfit(companyId);
  const hit = cache.get(companyId);
  if (hit && hit.fp === fp && Date.now() - hit.at < CACHE_TTL_MS) return hit.book;
  const book = loadBatchProfit(companyId);
  cache.delete(companyId);
  cache.set(companyId, { fp, at: Date.now(), book });
  // Xato bo'lsa eslab qolinmaydi — keyingi so'rov qayta hisoblaydi
  book.catch(() => {
    if (cache.get(companyId)?.book === book) cache.delete(companyId);
  });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return book;
}

/** Ro'yxat sahifasi uchun */
export function toListResponse(book: BatchProfitBook): BatchProfitListResponse {
  const items: BatchProfitSummary[] = book.batches.map((b) => ({ batchId: b.id, ...(book.totals.get(b.id) as BatchProfitTotals) }));
  const grand = { invested: 0, moneyBack: 0, profit: 0, pendingBack: 0, paidBack: 0 };
  for (const t of items) {
    grand.invested += t.invested;
    grand.moneyBack += t.moneyBack;
    grand.profit += t.profit;
    grand.pendingBack += t.back.held + t.back.transit;
    if (t.state === 'paidBack') grand.paidBack += 1;
  }
  return { items, grand, unattributed: book.unattributed, taxRate: book.taxRate, syncedAt: book.syncedAt };
}

/** Bitta partiya sahifasi uchun; partiya topilmasa null */
export function toDetailResponse(book: BatchProfitBook, batchId: string): BatchProfitDetail | null {
  const totals = book.totals.get(batchId);
  const rows = book.rowsOf.get(batchId);
  if (!totals || !rows) return null;
  const skus: Record<string, BatchProfitSku> = {};
  for (const r of rows) {
    for (const c of r.codes) {
      const key = normSkuCode(c);
      const sku = book.skus.get(key);
      if (sku) skus[key] = sku;
    }
  }
  return { batchId, ...totals, rows, skus, taxRate: book.taxRate, syncedAt: book.syncedAt, storeCount: book.storeCount };
}

/**
 * Bog'lash oynasi uchun Uzum tovarlari. Bir xil kodli SKU'lar (ikki do'kon)
 * bitta variant bo'lib chiqadi. Avval aniq qidiruv (Mahsulotlar sahifasidagi
 * qoida: nomi, kodi, shtrix-kodi, ID), topilmasa — so'rovdagi 3+ harfli
 * so'zlarning biri mos kelganlari (ko'p mosi yuqorida): partiyadagi nom
 * ("Skate 20 qora") Uzum'dagi nomga to'liq mos kelmasligi tabiiy.
 */
export async function searchBatchSkus(companyId: string, q: string, take: number): Promise<BatchSkuSearchResponse> {
  const storeIds = await getStoreIds(companyId);
  if (storeIds.length === 0) return { items: [], match: q ? 'query' : 'all' };
  const [skuRecs, stores, linkedRecs] = await Promise.all([
    prisma.sku.findMany({
      // Sotuvchi SavdoIQ'da "o'chirgan" mahsulot tanlovda chiqmaydi
      // SavdoIQ'da "o'chirilgan" (yashirilgan) mahsulot ham — eski partiyasi shunga bog'lanadi; ro'yxat oxirida, "arxivda" belgisi bilan
      where: { storeId: { in: storeIds } },
      select: {
        id: true,
        sku: true,
        title: true,
        barcode: true,
        uzumSkuId: true,
        imageUrl: true,
        storeId: true,
        archived: true,
        product: { select: { id: true, title: true, uzumProductId: true, category: true, hidden: true } },
      },
    }),
    prisma.store.findMany({ where: { companyId }, select: { id: true, title: true } }),
    prisma.purchaseBatchItem.findMany({ where: { batch: { companyId }, skuCodes: { not: '' } }, select: { skuCodes: true } }),
  ]);
  const storeTitle = new Map(stores.map((s) => [s.id, s.title]));
  const linkedRows = new Map<string, number>();
  for (const r of linkedRecs) for (const c of new Set((parseSkuCodes(r.skuCodes) ?? []).map(normSkuCode))) linkedRows.set(c, (linkedRows.get(c) ?? 0) + 1);

  type Option = BatchSkuOption & { recs: typeof skuRecs };
  const byCode = new Map<string, Option>();
  for (const s of skuRecs) {
    const key = normSkuCode(s.sku);
    if (!key) continue;
    const store = storeTitle.get(s.storeId) ?? '';
    const cur = byCode.get(key);
    if (cur) {
      cur.recs.push(s);
      if (store && !cur.stores.includes(store)) cur.stores.push(store);
      // Bir do'konda faol bo'lsa — faol
      cur.archived = cur.archived && (s.archived || s.product.hidden);
      if (!cur.imageUrl && s.imageUrl) cur.imageUrl = s.imageUrl;
      continue;
    }
    byCode.set(key, {
      code: s.sku,
      title: s.title || s.product.title,
      productId: s.product.id,
      productTitle: s.product.title,
      imageUrl: s.imageUrl,
      stores: store ? [store] : [],
      archived: s.archived || s.product.hidden,
      linkedRows: linkedRows.get(key) ?? 0,
      recs: [s],
    });
  }
  const all = [...byCode.values()];
  const order = (a: Option, b: Option) =>
    Number(a.archived) - Number(b.archived) || a.productTitle.localeCompare(b.productTitle) || a.title.localeCompare(b.title) || a.code.localeCompare(b.code);

  let match: BatchSkuSearchResponse['match'] = 'all';
  let list = all.sort(order);
  const query = parseSkuQuery(q);
  if (query) {
    const strict = all.filter((o) => o.recs.some((s) => matchesSkuQuery(query, s, s.product)));
    if (strict.length > 0) {
      match = 'query';
      list = strict.sort(order);
    } else {
      match = 'tokens';
      const tokens = [...new Set(normalizeCardText(q).split(' ').filter((t) => t.length >= 3))];
      list = all
        .map((o) => {
          const hay = normalizeCardText(`${o.title} ${o.productTitle} ${o.code}`);
          return { o, score: tokens.filter((t) => hay.includes(t)).length };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || order(x.o, y.o))
        .map((x) => x.o);
    }
  }
  return { items: list.slice(0, take).map(({ recs: _recs, ...o }) => o), match };
}
