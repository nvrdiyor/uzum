/**
 * Tovar balansi — Uzum omborida yo'qolgan tovarni aniqlash.
 *
 * Uzum Seller API'da yo'qotishlar ro'yxati YO'Q, katalogdagi `quantityMissing`
 * esa hujjatda "eskirgan" deb belgilangan (amalda doim 0). Shuning uchun
 * yo'qotish Uzumdan o'qilmaydi — hisoblanadi:
 *
 *   qabul qilingan − sotilgan − sotuvchiga qaytarilgan − omborda turgan = farq
 *
 * Har bir had Uzum kabinetida ko'rinadi (nakladnoylar, buyurtmalar, qoldiq),
 * ya'ni sotuvchi natijani o'zi tekshira oladi va da'voda dalil qila oladi.
 *
 * Farqning hammasi ham yo'qotish emas. Bekor qilingan yoki qaytarilgan
 * buyurtmaning tovari omborga bir necha kundan keyin yetib keladi — shu
 * vaqt ichida u "qaytish yo'lida", yo'qolgan emas. Muddat o'tib ham
 * qaytmagani va buyurtmasiz kamaygani — "hisobda yo'q".
 *
 * Xato tomonga og'ish har doim EHTIYOTKOR: shubhali joyda tovar yo'qolgan deb
 * emas, kutilmoqda deb sanaladi — yolg'on signal sotuvchini Uzumga asossiz
 * da'vo yozishga undardi.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  round,
  toISODate,
  type BalanceOrderRef,
  type LossEvidence,
  type LossKind,
  type StockBalanceRow,
  type StockBalanceState,
  type StockBalanceSummary,
  type StuckOrderRow,
} from '@savdoiq/shared';
import { getLatestStocks, getSkuCatalog } from './common.js';

const DAY_MS = 86_400_000;

/**
 * Bekor qilingan buyurtma tovari omborga qaytishi uchun beriladigan muddat,
 * BUYURTMA sanasidan. Bekor qilingan sana API'da yo'q, shuning uchun yetkazish
 * (≈3 kun), punktda saqlash (≈5–7 kun) va qaytish yo'li (≈7–10 kun) birga
 * olinadi. Jonli do'konda eng uzoq qaytish 12 kun bo'lgan.
 */
export const RETURN_WAIT_DAYS = 21;
/** Xaridor qaytargan (sanasi ma'lum) tovar uchun — QAYTARILGAN kundan */
const RETURNED_WAIT_DAYS = 14;
/** Shuncha kundan beri topshirilmagan buyurtma "uzoq yo'lda" deb ko'rsatiladi */
export const STUCK_DAYS = 14;
/** Qabuldan keyin shuncha vaqt yangi yo'qotish qayd etilmaydi — qoldiq o'rnashsin */
const SETTLE_MS = DAY_MS;
/** Dalilda ko'rsatiladigan nomzod buyurtmalar chegarasi */
const MAX_SUSPECTS = 5;

// ─────────────────────────── Sof hisob (bazasiz) ───────────────────────────

export interface BalanceOrder {
  orderId: string;
  orderedAt: Date;
  returnedAt: Date | null;
  /** Sotuvda qolgan dona (Uzum `amount`) */
  qty: number;
  /** Bekor qilingan yoki qaytarilgan dona (Uzum `amountReturns`) */
  returnedQty: number;
  /** Pozitsiya holati: delivered | canceled | returned */
  status: string;
  cause: string | null;
}

export interface BalanceInput {
  now: Date;
  /** Qabul qilingan nakladnoy pozitsiyalari */
  receipts: { at: Date; qty: number }[];
  /** FBO buyurtmalar — Uzum omboridan chiqqan tovar */
  orders: BalanceOrder[];
  /** Uzum sotuvchiga qaytarib bergan dona (qaytarish nakladnoylari) */
  returnedToSeller: number;
  /** Omborda sotuvda turgan dona */
  onHand: number;
  /** Uzumda, lekin sotuvda emas: qo'shimcha ombor, fotostudiya, brak, Uzum "yo'qolgan" degani */
  held: number;
  /** Kunlik qoldiq (UTC kun boshi), o'sish tartibida */
  snapshots: { date: Date; fbo: number }[];
  /**
   * Uzum hisoblagichidagi (sotilgan + qaytarilgan) dona bizdagidan nechtaga
   * ko'p. Musbat — buyurtmalar tarixi to'liq yuklanmagan; o'sha donalar
   * sotilgan deb olinadi, aks holda ular "yo'qolgan" bo'lib chiqardi.
   */
  historyDeficit: number;
  /** Uzum hisoblagichlari kelganmi — kelmagan bo'lsa tarix to'liqligini bilib bo'lmaydi */
  countersKnown: boolean;
}

interface EventRef {
  orderId: string;
  orderedAt: Date;
  /** Tovar omborga qaytishi mumkin bo'lgan eng erta payt */
  at: Date;
  kind: 'canceled' | 'returned';
  qty: number;
  cause: string | null;
  expectedBy: Date;
}

export interface BalanceResult {
  /** none — Uzum nakladnoyi yo'q, hisoblab bo'lmaydi */
  state: 'none' | 'incomplete' | 'settling' | 'ok';
  accepted: number;
  sold: number;
  returnedToSeller: number;
  onHand: number;
  held: number;
  /** Tushuntirilmagan farq (manfiy bo'lmaydi) */
  gap: number;
  inReturn: number;
  unaccounted: number;
  waitingUntil: Date | null;
  suspects: EventRef[];
  removals: { date: Date; qty: number }[];
  /** Yo'qotish qachondan beri (dalildagi eng erta sana) */
  since: Date | null;
}

const dayOf = (d: Date): number => Math.floor(d.getTime() / DAY_MS);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const median3 = (a: number, b: number, c: number): number => a + b + c - Math.min(a, b, c) - Math.max(a, b, c);

/**
 * Kunlik qoldiq daftari: qoldiq buyurtma va qabuldan TASHQARI qachon o'zgargan.
 *
 * Har bir snapshot kuni uchun "kutilgan qoldiq" = birinchi snapshot + qabul −
 * buyurtma. Haqiqiy qoldiqning undan farqi faqat ikki narsadan bo'lishi mumkin:
 * qaytgan tovar omborga keldi (+) yoki tovar buyurtmasiz kamaydi (−).
 *
 * Bir kunlik sakrash shovqin bo'lishi mumkin (sinxron bilan kun chegarasi,
 * qabulning kechikib aks etishi) — uch kunlik mediana uni olib tashlaydi.
 * Oxirgi kundagi o'zgarish ertasi kuni tasdiqlanmaguncha hisobga olinmaydi.
 *
 * Eng birinchi snapshot tashlanadi: u kabinet ulangan kuni, kunning o'rtasida
 * olingan bo'lishi mumkin — o'sha kunning keyingi buyurtmalari unga kirmagan.
 */
function ledger(inp: BalanceInput): { arrivals: { day: number; qty: number }[]; removals: { day: number; qty: number }[] } {
  const snaps = inp.snapshots.slice(1);
  if (snaps.length < 3) return { arrivals: [], removals: [] };

  const first = dayOf(snaps[0].date);
  const moves = new Map<number, number>();
  const add = (at: Date, delta: number): void => {
    const d = dayOf(at);
    if (d > first) moves.set(d, (moves.get(d) ?? 0) + delta);
  };
  for (const r of inp.receipts) add(r.at, r.qty);
  for (const o of inp.orders) add(o.orderedAt, -(o.qty + o.returnedQty));

  const moveDays = [...moves.keys()].sort((a, b) => a - b);
  let cursor = 0;
  let expected = snaps[0].fbo;
  const excess: number[] = [0];
  for (let i = 1; i < snaps.length; i += 1) {
    const day = dayOf(snaps[i].date);
    while (cursor < moveDays.length && moveDays[cursor] <= day) {
      expected += moves.get(moveDays[cursor]) ?? 0;
      cursor += 1;
    }
    excess.push(snaps[i].fbo - expected);
  }

  const last = excess.length - 1;
  const smooth: number[] = [0];
  for (let i = 1; i < last; i += 1) smooth.push(median3(excess[i - 1], excess[i], excess[i + 1]));
  smooth.push(excess[last] === excess[last - 1] ? excess[last] : smooth[last - 1]);

  const arrivals: { day: number; qty: number }[] = [];
  const removals: { day: number; qty: number }[] = [];
  for (let i = 1; i < smooth.length; i += 1) {
    const delta = smooth[i] - smooth[i - 1];
    const day = dayOf(snaps[i].date);
    if (delta > 0) arrivals.push({ day, qty: delta });
    else if (delta < 0) removals.push({ day, qty: -delta });
  }
  return { arrivals, removals };
}

/** Bitta SKU balansi. Bazaga murojaat qilmaydi — sinash oson bo'lishi uchun */
export function reconcileSku(inp: BalanceInput): BalanceResult {
  const accepted = sum(inp.receipts.map((r) => r.qty));
  const sold = sum(inp.orders.map((o) => o.qty));
  const base = {
    accepted,
    sold,
    returnedToSeller: inp.returnedToSeller,
    onHand: inp.onHand,
    held: inp.held,
    gap: 0,
    inReturn: 0,
    unaccounted: 0,
    waitingUntil: null,
    suspects: [],
    removals: [],
    since: null,
  } satisfies Omit<BalanceResult, 'state'>;

  if (accepted === 0) return { ...base, state: 'none' };
  if (!inp.countersKnown) return { ...base, state: 'incomplete' };

  const diff = accepted - sold - inp.returnedToSeller - inp.onHand - inp.held;
  const gap = Math.max(0, diff - Math.max(0, inp.historyDeficit));

  const lastReceipt = Math.max(...inp.receipts.map((r) => r.at.getTime()));
  const state: BalanceResult['state'] = inp.now.getTime() - lastReceipt < SETTLE_MS ? 'settling' : 'ok';
  if (gap === 0) return { ...base, state };

  // Omborga qaytishi kerak bo'lgan donalar
  const events: (EventRef & { left: number })[] = inp.orders
    .filter((o) => o.returnedQty > 0)
    .map((o) => {
      const at = o.returnedAt ?? o.orderedAt;
      const waitDays = o.returnedAt ? RETURNED_WAIT_DAYS : RETURN_WAIT_DAYS;
      return {
        orderId: o.orderId,
        orderedAt: o.orderedAt,
        at,
        kind: o.status === 'returned' ? ('returned' as const) : ('canceled' as const),
        qty: o.returnedQty,
        left: o.returnedQty,
        cause: o.cause,
        expectedBy: new Date(at.getTime() + waitDays * DAY_MS),
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  /*
   * Omborga kelgan har bir dona o'sha kungacha bo'lgan ENG YANGI qaytarishga
   * tegishli deb olinadi: tez bekor qilingan buyurtma tovari o'sha kuniyoq
   * bo'shaydi, bir oy oldingi qaytarish esa endi kelishi dargumon.
   */
  const book = ledger(inp);
  for (const arrival of book.arrivals) {
    for (let n = 0; n < arrival.qty; n += 1) {
      const match = events.find((e) => e.left > 0 && dayOf(e.at) <= arrival.day);
      if (!match) break;
      match.left -= 1;
    }
  }

  const out = events.filter((e) => e.left > 0).map(({ left, ...e }) => ({ ...e, qty: left }));
  const waiting = out.filter((e) => e.expectedBy.getTime() >= inp.now.getTime());
  const suspects = out.filter((e) => e.expectedBy.getTime() < inp.now.getTime());

  const inReturn = Math.min(gap, sum(waiting.map((e) => e.qty)));
  const unaccounted = gap - inReturn;

  // Buyurtmasiz kamayishlar — eng so'nggilaridan, hisobda yo'q donadan oshmasin
  const removals: { date: Date; qty: number }[] = [];
  let room = unaccounted;
  for (const r of [...book.removals].reverse()) {
    if (room <= 0) break;
    const qty = Math.min(room, r.qty);
    removals.unshift({ date: new Date(r.day * DAY_MS), qty });
    room -= qty;
  }

  const shownSuspects = unaccounted > 0 ? suspects.slice(0, MAX_SUSPECTS) : [];
  const dates = [...removals.map((r) => r.date.getTime()), ...shownSuspects.map((s) => s.orderedAt.getTime())];

  return {
    ...base,
    state,
    gap,
    inReturn,
    unaccounted,
    waitingUntil: inReturn > 0 ? new Date(Math.max(...waiting.map((e) => e.expectedBy.getTime()))) : null,
    suspects: shownSuspects,
    removals,
    since: unaccounted > 0 && dates.length ? new Date(Math.min(...dates)) : null,
  };
}

// ─────────────────────────── Ma'lumot yig'ish ───────────────────────────

export interface SkuBalance extends BalanceResult {
  skuId: string;
  storeId: string;
  /** Bir dona tannarxi (xarid narxi + qo'shimcha xarajat) */
  unitCost: number;
  defected: number;
  missing: number;
}

export interface ShortageRef {
  shipmentId: string;
  code: string;
  skuId: string;
  storeId: string;
  sent: number;
  accepted: number;
  at: Date;
}

export interface StoreBalances {
  bySku: Map<string, SkuBalance>;
  shortages: ShortageRef[];
}

const chunk = <T,>(items: T[], size = 400): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Do'kon(lar)dagi barcha SKU balansi.
 *
 * Ikki bosqich: avval hamma SKU uchun arzon yig'indilar (qabul, sotuv, qoldiq),
 * keyin faqat farqi bor SKU'lar uchun buyurtmalar va qoldiq tarixi — katta
 * do'konda yuz minglab buyurtmani har so'rovda o'qimaslik uchun.
 */
export async function loadBalances(storeIds: string[], now: Date = new Date()): Promise<StoreBalances> {
  const bySku = new Map<string, SkuBalance>();
  if (storeIds.length === 0) return { bySku, shortages: [] };

  const [skus, shipItems, fboSums, allSums, backSums, stocks] = await Promise.all([
    prisma.sku.findMany({
      // Sotuvchi "o'chirgan" arxiv tovar hech qayerda ko'rinmaydi — bu yerda ham
      where: { storeId: { in: storeIds }, NOT: { archived: true, product: { hidden: true } } },
      select: {
        id: true,
        storeId: true,
        purchasePrice: true,
        extraCost: true,
        qtyDefected: true,
        qtyMissing: true,
        qtyElsewhere: true,
        uzumSold: true,
        uzumReturned: true,
      },
    }),
    prisma.shipmentItem.findMany({
      where: { shipment: { storeId: { in: storeIds }, source: 'uzum', status: 'accepted' } },
      select: {
        skuId: true,
        qty: true,
        accepted: true,
        shipment: { select: { id: true, code: true, storeId: true, acceptedAt: true, plannedAt: true, createdAt: true } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ['skuId'],
      where: { skuId: { not: null }, order: { storeId: { in: storeIds }, deliveryType: 'FBO' } },
      _sum: { qty: true },
    }),
    prisma.orderItem.groupBy({
      by: ['skuId'],
      where: { skuId: { not: null }, order: { storeId: { in: storeIds } } },
      _sum: { qty: true, returnedQty: true },
    }),
    prisma.returnRecord.groupBy({
      by: ['skuId'],
      where: { storeId: { in: storeIds }, skuId: { not: null }, status: { in: ['pending', 'completed'] } },
      _sum: { qty: true },
    }),
    getLatestStocks(storeIds),
  ]);

  const receipts = new Map<string, { at: Date; qty: number }[]>();
  const shortages: ShortageRef[] = [];
  for (const it of shipItems) {
    const at = it.shipment.acceptedAt ?? it.shipment.plannedAt ?? it.shipment.createdAt;
    const list = receipts.get(it.skuId) ?? [];
    list.push({ at, qty: it.accepted });
    receipts.set(it.skuId, list);
    if (it.accepted < it.qty && it.shipment.storeId) {
      shortages.push({
        shipmentId: it.shipment.id,
        code: it.shipment.code,
        skuId: it.skuId,
        storeId: it.shipment.storeId,
        sent: it.qty,
        accepted: it.accepted,
        at,
      });
    }
  }

  const soldFbo = new Map(fboSums.map((r) => [r.skuId as string, r._sum.qty ?? 0]));
  const unitsAll = new Map(allSums.map((r) => [r.skuId as string, (r._sum.qty ?? 0) + (r._sum.returnedQty ?? 0)]));
  const back = new Map(backSums.map((r) => [r.skuId as string, r._sum.qty ?? 0]));

  // 1-bosqich: yig'indilar bo'yicha farq
  const drafts = new Map<string, BalanceInput>();
  for (const s of skus) {
    const dbUnits = unitsAll.get(s.id) ?? 0;
    const uzumUnits = s.uzumSold + s.uzumReturned;
    const stock = stocks.get(s.id);
    drafts.set(s.id, {
      now,
      receipts: receipts.get(s.id) ?? [],
      // Yig'indi bitta "buyurtma" sifatida — farq bor-yo'qligini bilish uchun yetarli
      orders: [
        { orderId: '', orderedAt: now, returnedAt: null, qty: soldFbo.get(s.id) ?? 0, returnedQty: 0, status: 'delivered', cause: null },
      ],
      returnedToSeller: back.get(s.id) ?? 0,
      onHand: stock?.fbo ?? 0,
      held: s.qtyElsewhere + s.qtyDefected + s.qtyMissing,
      snapshots: [],
      historyDeficit: uzumUnits - dbUnits,
      countersKnown: uzumUnits > 0 || dbUnits === 0,
    });
  }

  // 2-bosqich: farqi bor SKU'lar uchun buyurtmalar va qoldiq tarixi
  const detailed = skus.filter((s) => {
    const draft = drafts.get(s.id);
    return draft ? reconcileSku(draft).gap > 0 : false;
  });
  for (const part of chunk(detailed.map((s) => s.id))) {
    const [items, snaps] = await Promise.all([
      prisma.orderItem.findMany({
        where: { skuId: { in: part }, order: { deliveryType: 'FBO' } },
        select: {
          skuId: true,
          qty: true,
          returnedQty: true,
          status: true,
          orderedAt: true,
          returnedAt: true,
          returnCause: true,
          order: { select: { uzumOrderId: true } },
        },
      }),
      prisma.stockSnapshot.findMany({
        where: { skuId: { in: part } },
        orderBy: { date: 'asc' },
        select: { skuId: true, date: true, fbo: true },
      }),
    ]);
    for (const id of part) {
      const draft = drafts.get(id);
      if (!draft) continue;
      draft.orders = items
        .filter((it) => it.skuId === id)
        .map((it) => ({
          orderId: it.order.uzumOrderId ?? '',
          orderedAt: it.orderedAt,
          returnedAt: it.returnedAt,
          qty: it.qty,
          returnedQty: it.returnedQty,
          status: it.status,
          cause: it.returnCause,
        }));
      draft.snapshots = snaps.filter((sn) => sn.skuId === id).map((sn) => ({ date: sn.date, fbo: sn.fbo }));
    }
  }

  for (const s of skus) {
    const draft = drafts.get(s.id);
    if (!draft) continue;
    bySku.set(s.id, {
      ...reconcileSku(draft),
      skuId: s.id,
      storeId: s.storeId,
      unitCost: s.purchasePrice + s.extraCost,
      defected: s.qtyDefected,
      missing: s.qtyMissing,
    });
  }

  return { bySku, shortages };
}

// ─────────────────────────── Yo'qotish yozuvlari ───────────────────────────

/** SavdoIQ o'zi yuritadigan manbalar — Uzum/namuna yozuvlariga (`uzum`) tegilmaydi */
export const AUTO_LOSS_SOURCES: readonly LossKind[] = ['balance', 'counter', 'defect', 'shortage'];

const TYPE_OF: Record<LossKind, 'lost' | 'damaged' | 'not_delivered'> = {
  balance: 'lost',
  counter: 'lost',
  defect: 'damaged',
  shortage: 'not_delivered',
};

const refOf = (e: EventRef): BalanceOrderRef => ({
  orderId: e.orderId,
  date: toISODate(e.orderedAt),
  kind: e.kind,
  qty: e.qty,
  cause: e.cause,
  expectedBy: toISODate(e.expectedBy),
});

const evidenceOf = (b: SkuBalance): LossEvidence => ({
  accepted: b.accepted,
  sold: b.sold,
  returnedToSeller: b.returnedToSeller,
  onHand: b.onHand,
  held: b.held,
  inReturn: b.inReturn,
  suspects: b.suspects.map(refOf),
  removals: b.removals.map((r) => ({ date: toISODate(r.date), qty: r.qty })),
});

interface Desired {
  source: LossKind;
  ref: string;
  skuId: string;
  qty: number;
  unitCost: number;
  happenedAt: Date;
  details: LossEvidence | null;
}

const lossId = (...parts: (string | number)[]): string =>
  `ls_${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24)}`;

/**
 * Balans natijasini `LossRecord` yozuvlariga aylantiradi (sinxronning oxirida).
 *
 * Har bir (manba, kalit) juftligi uchun bitta OCHIQ yozuv hozirgi holatni
 * ko'rsatadi: dona o'zgarsa yangilanadi, tovar topilsa o'chadi. Sotuvchi
 * da'vo yuborgan yoki yopgan yozuvlarga tegilmaydi — ular tarix; ustiga yangi
 * yo'qotish chiqsa, faqat ortgan qismi uchun yangi ochiq yozuv ochiladi.
 *
 * `settling` va `incomplete` holatdagi SKU'ning balans yozuvi o'zgarmaydi:
 * ma'lumot ishonchli bo'lmagan paytda na yangi signal, na "topildi" kerak.
 */
export interface LossSyncResult {
  created: number;
  updated: number;
  removed: number;
  /** Yangi aniqlangan yo'qotishlar — xabar uchun */
  found: { skuId: string; kind: LossKind; qty: number; amount: number }[];
  /** Hisobda yo'q bo'lib turgan, endi yana ko'ringan donalar (faqat balans) */
  recovered: { skuId: string; qty: number }[];
}

export async function syncLossRecords(storeId: string, now: Date = new Date()): Promise<LossSyncResult> {
  const res: LossSyncResult = { created: 0, updated: 0, removed: 0, found: [], recovered: [] };
  const { bySku, shortages } = await loadBalances([storeId], now);

  const desired = new Map<string, Desired>();
  const frozen = new Set<string>();
  const put = (d: Desired): void => void desired.set(`${d.source}|${d.ref}`, d);

  for (const b of bySku.values()) {
    if (b.state === 'ok' && b.unaccounted > 0) {
      put({
        source: 'balance',
        ref: b.skuId,
        skuId: b.skuId,
        qty: b.unaccounted,
        unitCost: b.unitCost,
        happenedAt: b.since ?? now,
        details: evidenceOf(b),
      });
    } else if (b.state === 'settling' || b.state === 'incomplete') {
      frozen.add(`balance|${b.skuId}`);
    }
    if (b.missing > 0) {
      put({ source: 'counter', ref: b.skuId, skuId: b.skuId, qty: b.missing, unitCost: b.unitCost, happenedAt: now, details: null });
    }
    if (b.defected > 0) {
      put({ source: 'defect', ref: b.skuId, skuId: b.skuId, qty: b.defected, unitCost: b.unitCost, happenedAt: now, details: null });
    }
  }
  for (const s of shortages) {
    const unitCost = bySku.get(s.skuId)?.unitCost;
    if (unitCost === undefined) continue;
    put({
      source: 'shortage',
      ref: `${s.shipmentId}:${s.skuId}`,
      skuId: s.skuId,
      qty: s.sent - s.accepted,
      unitCost,
      happenedAt: s.at,
      details: { invoice: s.code, sent: s.sent, accepted: s.accepted },
    });
  }

  const existing = await prisma.lossRecord.findMany({
    where: { storeId, source: { in: [...AUTO_LOSS_SOURCES] } },
    select: { id: true, skuId: true, source: true, ref: true, qty: true, amount: true, details: true, status: true },
  });
  const byKey = new Map<string, typeof existing>();
  for (const r of existing) {
    const key = `${r.source}|${r.ref ?? ''}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  const creates: Prisma.LossRecordCreateManyInput[] = [];
  for (const key of new Set([...desired.keys(), ...byKey.keys()])) {
    if (frozen.has(key)) continue;
    const want = desired.get(key);
    const have = byKey.get(key) ?? [];
    const open = have.find((r) => r.status === 'open');
    const settled = sum(have.filter((r) => r.status !== 'open').map((r) => r.qty));
    const qty = want ? Math.max(0, want.qty - settled) : 0;

    if (qty === 0 || !want) {
      if (open) {
        await prisma.lossRecord.delete({ where: { id: open.id } });
        res.removed += 1;
        if (open.source === 'balance' && open.skuId) res.recovered.push({ skuId: open.skuId, qty: open.qty });
      }
      continue;
    }

    const data = {
      qty,
      amount: round(qty * want.unitCost),
      details: want.details ? JSON.stringify(want.details) : null,
    };
    if (open) {
      // Har 30 daqiqada o'zgarmagan yozuvni qayta yozmaymiz
      if (open.qty !== data.qty || open.amount !== data.amount || open.details !== data.details) {
        await prisma.lossRecord.update({ where: { id: open.id }, data });
        res.updated += 1;
        // Ochiq yozuvdagi dona o'zgarishi ham yangilik: ortgani — yana yo'qoldi, kamaygani — qaytdi
        if (data.qty > open.qty) {
          const more = data.qty - open.qty;
          res.found.push({ skuId: want.skuId, kind: want.source, qty: more, amount: round(more * want.unitCost) });
        } else if (data.qty < open.qty && want.source === 'balance') {
          res.recovered.push({ skuId: want.skuId, qty: open.qty - data.qty });
        }
      }
    } else {
      creates.push({
        id: lossId(storeId, want.source, want.ref, have.length),
        storeId,
        skuId: want.skuId,
        type: TYPE_OF[want.source],
        scheme: 'FBO',
        status: 'open',
        compensated: 0,
        happenedAt: want.happenedAt,
        source: want.source,
        ref: want.ref,
        ...data,
      });
      res.found.push({ skuId: want.skuId, kind: want.source, qty, amount: data.amount });
    }
  }

  if (creates.length) {
    await prisma.lossRecord.createMany({ data: creates });
    res.created = creates.length;
  }
  return res;
}

// ─────────────────────────── Sahifa uchun ───────────────────────────

const STATE_RANK: Record<StockBalanceState, number> = { loss: 0, waiting: 1, settling: 2, incomplete: 3, ok: 4 };

/** "Yo'qotilgan tovarlar" sahifasidagi tovar balansi bo'limi */
export async function getBalanceSummary(storeIds: string[], now: Date = new Date()): Promise<StockBalanceSummary> {
  const rules = { returnWaitDays: RETURN_WAIT_DAYS, stuckDays: STUCK_DAYS };
  const empty: StockBalanceSummary = {
    asOf: null,
    totals: { skus: 0, accepted: 0, sold: 0, onHand: 0, inReturn: 0, unaccounted: 0, amount: 0 },
    rows: [],
    stuck: [],
    rules,
  };
  if (storeIds.length === 0) return empty;

  const [{ bySku }, catalog, lastSnap, stuckItems] = await Promise.all([
    loadBalances(storeIds, now),
    getSkuCatalog(storeIds, true),
    prisma.stockSnapshot.findFirst({
      where: { storeId: { in: storeIds } },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
    prisma.orderItem.findMany({
      where: {
        qty: { gt: 0 },
        order: {
          storeId: { in: storeIds },
          status: { in: ['new', 'processing'] },
          deliveredAt: null,
          orderedAt: { lt: new Date(now.getTime() - STUCK_DAYS * DAY_MS) },
        },
      },
      orderBy: { orderedAt: 'asc' },
      take: 200,
      select: {
        skuId: true,
        title: true,
        skuCode: true,
        qty: true,
        revenue: true,
        orderedAt: true,
        order: { select: { uzumOrderId: true } },
      },
    }),
  ]);

  const rows: StockBalanceRow[] = [];
  for (const b of bySku.values()) {
    if (b.state === 'none') continue;
    const info = catalog.get(b.skuId);
    if (!info) continue;
    const state: StockBalanceState =
      b.state !== 'ok' ? b.state : b.unaccounted > 0 ? 'loss' : b.inReturn > 0 ? 'waiting' : 'ok';
    rows.push({
      skuId: b.skuId,
      sku: info.sku,
      title: info.title,
      imageUrl: info.imageUrl,
      state,
      accepted: b.accepted,
      sold: b.sold,
      returnedToSeller: b.returnedToSeller,
      onHand: b.onHand,
      held: b.held,
      inReturn: b.inReturn,
      unaccounted: b.unaccounted,
      amount: round(b.unaccounted * b.unitCost),
      waitingUntil: b.waitingUntil ? toISODate(b.waitingUntil) : null,
      suspects: b.suspects.map(refOf),
      removals: b.removals.map((r) => ({ date: toISODate(r.date), qty: r.qty })),
    });
  }
  rows.sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.unaccounted - a.unaccounted || b.accepted - a.accepted,
  );

  const stuck: StuckOrderRow[] = stuckItems.map((it) => {
    const info = it.skuId ? catalog.get(it.skuId) : undefined;
    return {
      orderId: it.order.uzumOrderId ?? '',
      sku: info?.sku ?? it.skuCode ?? null,
      title: info?.title ?? it.title ?? null,
      imageUrl: info?.imageUrl ?? null,
      qty: it.qty,
      amount: round(it.revenue),
      orderedAt: toISODate(it.orderedAt),
      days: Math.floor((now.getTime() - it.orderedAt.getTime()) / DAY_MS),
    };
  });

  return {
    asOf: rows.length && lastSnap ? toISODate(lastSnap.date) : null,
    totals: {
      skus: rows.length,
      accepted: sum(rows.map((r) => r.accepted)),
      sold: sum(rows.map((r) => r.sold)),
      onHand: sum(rows.map((r) => r.onHand)),
      inReturn: sum(rows.map((r) => r.inReturn)),
      unaccounted: sum(rows.map((r) => r.unaccounted)),
      amount: sum(rows.map((r) => r.amount)),
    },
    rows,
    stuck,
    rules,
  };
}
