/**
 * Sotuv voronkasi — /api/v1/funnel
 *
 * Uzum kabinetidagi "Sotuv voronkasi" bo'limining mantiqiy analogi, lekin
 * SavdoIQ faqat Seller API bergan ma'lumot bilan ishlaydi.
 *
 * MUHIM: Uzum Seller API'da namoyishlar (impressions), kartochka ochilishi va
 * savatga qo'shish bo'yicha endpoint YO'Q (`docs/UZUM-API.md`). Shuning uchun
 * voronka buyurtmadan boshlanadi. Buyurtma qilingan har bir dona to'rt
 * holatdan biriga tushadi:
 *
 *     Buyurtma qilindi = Sotildi + Yo'lda + Bekor qilindi + Qaytarildi
 *
 * Har bir bosqich taqqoslash davri bilan (`range.previous`, rejimi
 * `?compare=`: oldingi teng davr, o'tgan oy yoki o'tgan yil — lib/period.ts)
 * TENG YOSHDA solishtiriladi (pastda `collect` izohi) va mahsulot kesimida
 * "sotib olish foizi" (buyout) hisoblanadi — faqat YAKUNLANGAN donalar
 * bo'yicha: sotildi / (sotildi + bekor + qaytdi). Boshqaruv panelidagi "Sotib olish darajasi" va
 * Mahsulotlar kartochkasidagi xarid foizi bilan bir xil ta'rif
 * (analytics.ts, products.ts).
 *
 * Yo'qotish voronkasi (`stages`) — shu holatlardan to'rt bosqich: buyurtma
 * qilindi → bekor qilinmadi (jo'natildi) → xaridor qabul qildi →
 * qaytarilmadi (sotildi). Yo'ldagi dona ikkinchi bosqichda bor, uchinchisida
 * yo'q: u yo'qotish emas, natija kutilmoqda — ikkalasining farqi alohida,
 * neytral ko'rsatiladi. Yo'qotilgan tushum va foyda (`lost`) hamda sabablar
 * so'mda (`reasons`) — bekor qilingan va qaytgan donalardan, "Qaytarishlar"
 * sahifasi bilan bitta qoidada (services/returns.ts `splitLine`).
 *
 * Oldingi davr saqlangan tarixdan tashqarida bo'lsa (services/pnl.ts
 * comparablePeriod) — o'zgarishlar ham, oldingi qiymatlar ham null.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  deltaPct,
  pct,
  round,
  parseISODate,
  toISODate,
  businessDayStart,
  toBusinessDate,
  type FunnelLost,
  type FunnelProductRow,
  type FunnelReason,
  type FunnelResponse,
  type FunnelStage,
  type FunnelStep,
  type FunnelStepId,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getSkuCatalog, getStoreIds } from '../services/common.js';
import { comparablePeriod } from '../services/pnl.js';
import { realReason, splitLine } from '../services/returns.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Bitta SKU (yoki jami) bo'yicha bosqich raqamlari — dona va so'm */
interface Bucket {
  ordered: number;
  orderedAmount: number;
  sold: number;
  soldAmount: number;
  inTransit: number;
  inTransitAmount: number;
  canceled: number;
  canceledAmount: number;
  returned: number;
  returnedAmount: number;
  /** Tirik (bekor qilinmagan, qaytmagan) donalarning sof foydasi — yo'qotilgan foyda shundan baholanadi */
  liveProfit: number;
}

const emptyBucket = (): Bucket => ({
  ordered: 0,
  orderedAmount: 0,
  sold: 0,
  soldAmount: 0,
  inTransit: 0,
  inTransitAmount: 0,
  canceled: 0,
  canceledAmount: 0,
  returned: 0,
  returnedAmount: 0,
  liveProfit: 0,
});

type DayRow = FunnelResponse['daily'][number];

/** Sabab (null — sabab ko'rsatilmagan) → yo'qotilgan dona va so'm */
type ReasonMap = Map<string | null, { units: number; amount: number }>;

interface Collected {
  total: Bucket;
  /** Davrdagi buyurtmalar (alohida orderId) — qolgan sanoqlar dona */
  orders: number;
  bySku: Map<string, Bucket>;
  byDay: Map<string, Omit<DayRow, 'date'>>;
  /** Yo'qotilgan dona sabablari — faqat joriy davr uchun yig'iladi */
  reasons: { canceled: ReasonMap; returned: ReasonMap };
}

/** SKU'ga bog'lanmagan satrlar kaliti — katalogda yo'q, mahsulot jadvaliga chiqmaydi */
const NO_SKU = '—';

/**
 * Shundan kam yakunlangan bo'lsa sotib olish foizi DASTLABKI: foiz faqat
 * eski buyurtmalardan chiqadi va yo'ldagilar yetib borgach (yoki bekor
 * bo'lgach) o'zgaradi. Ilgari foiz bunday ogohlantirishsiz ko'rsatilardi.
 */
const PRELIMINARY_BELOW = 95;

/** Yakunlangan dona: sotildi + bekor + qaytdi. Yo'ldagilar hali natija bermagan */
const completedOf = (b: Bucket): number => b.sold + b.canceled + b.returned;

/** Sotib olish foizi yakunlangan donalar bo'yicha; yakunlangani bo'lmasa null */
const buyoutOf = (b: Bucket): number | null => {
  const done = completedOf(b);
  return done > 0 ? pct(b.sold, done) : null;
};

/*
 * Sababsiz yozuv — services/returns.ts `realReason` (yagona qoida): bo'sh
 * matn va "Клиент не указал причину" bitta "sabab ko'rsatilmagan" guruhiga
 * tushadi. Naqsh o'zgarsa returns.ts va web lib/returnReasons.ts birga.
 *
 * Sababsiz guruh ATAYLAB tashlab yuborilmaydi (panel kartasidagi "asosiy
 * sabab" dan farqli): so'mdagi taqsimotda u bo'lmasa ulushlar yig'indisi 100%
 * bo'lmay, kichik bir sabab yo'qotishning asosiy qismidek ko'rinardi.
 */

/**
 * Davr bo'yicha pozitsiyalarni yig'adi.
 *
 * Har bir satr ikki qismga bo'linadi:
 *   - yo'qotilgan dona — bekor/qaytgan satrda `returnedQty` (bo'lmasa `qty`),
 *     tirik satrda qisman qaytgan `returnedQty`. Uzum bunday satrda
 *     `amount = 0` beradi, shuning uchun summa = sotuv narxi × dona;
 *   - tirik dona (`qty`) — buyurtmaning `deliveredAt` i `asOf` dan kech
 *     bo'lmasa xaridor qabul qilgan (sotildi), aks holda hali yo'lda.
 *
 * Ilgari bekor/qaytmagan hamma satr "sotildi" sanalardi: importer yo'ldagi
 * satrga ham `status = 'delivered'` qo'yadi, demak yangi buyurtmalar ham
 * sotilgan bo'lib, sotib olish foizi ~90% chiqardi. Qaytgan summa esa doim 0
 * edi, qisman qaytgan satrda esa "sotildi" "buyurtma qilindi" dan oshib
 * ketardi (2026-10-24).
 *
 * `asOf` — holat qaysi paytdagi bo'yicha olinadi. Joriy davr uchun hozir,
 * taqqoslash davri uchun hozir − ikki davr BOSHLARI orasidagi farq
 * (`range.from − prevFrom`): taqqoslash davrining har bir satri joriy
 * davrdagi juftligi bilan bir xil yoshda baholanadi. 'prev' rejimida bu farq
 * davr uzunligiga teng, 'prevMonth' / 'prevYear' da esa bir oy (yil) —
 * davrlar uzunligi farq qilsa ham (fevral ↔ mart) boshlar bir xil yoshda
 * tekislanadi, "davr uzunligi" bilan siljitish bu yerda xato bo'lardi. Ilgari oldingi
 * davr yakuniy holati bilan olinardi — u yerdagi yo'ldagilar allaqachon
 * yetkazilgan, joriy davrdagilar esa hali yo'lda, shuning uchun "Sotildi"
 * o'zgarishi sun'iy tushardi (7 kunlik davrda −37%, buyurtmalar esa −17%)
 * (2026-10-24). Kelajakdagi `deliveredAt` (demo ma'lumotda bor) ham hali
 * yo'lda sanaladi. Bekor/qaytgan satr esa yakuniy holati bilan qoladi: Uzum
 * bekor qilingan sanani bermaydi, `returnedAt` esa taxminiy.
 *
 * Bo'linishning o'zi — services/returns.ts `splitLine`. Ilgari shu qoida bu
 * yerda qo'lda takrorlangan edi va ikki nusxa ajralib ketsa voronka bilan
 * "Qaytarishlar" sahifasi yana turli son ko'rsatardi (2026-10-24).
 *
 * `detailed` — kunlik dinamika va yo'qotish sabablari (faqat joriy davr).
 */
async function collect(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  asOf: Date,
  detailed: boolean,
): Promise<Collected> {
  const out: Collected = {
    total: emptyBucket(),
    orders: 0,
    bySku: new Map(),
    byDay: new Map(),
    reasons: { canceled: new Map(), returned: new Map() },
  };
  if (storeIds.length === 0) return out;

  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } } },
    select: {
      orderId: true,
      skuId: true,
      qty: true,
      revenue: true,
      sellPrice: true,
      status: true,
      returnedAt: true,
      returnedQty: true,
      orderedAt: true,
      // Tirik satr foydasi — yo'qotilgan foydani baholash uchun (lostProfitOf)
      netProfit: true,
      // Bekor qilish yoki qaytarish sababi (asl matni)
      returnCause: true,
      // Xaridor qabul qilgan sana — "sotildi" va "yo'lda" shu bilan ajraladi (Boshqaruv paneli bilan bir xil)
      order: { select: { deliveredAt: true } },
    },
  });

  const orderIds = new Set<string>();

  for (const it of items) {
    orderIds.add(it.orderId);
    const key = it.skuId ?? NO_SKU;
    const bucket = out.bySku.get(key) ?? emptyBucket();

    /*
     * Yo'qotilgan dona: bekor/qaytgan satrning hammasi yoki tirik satrning
     * qisman qaytgan qismi. Uzum bunday satrda amount = 0 beradi — summa
     * sotuv narxi × dona. Tirik dona summasi esa haqiqiy tushum.
     */
    const s = splitLine(it);
    const lostAmount = s.unitPrice * s.lost;
    const liveAmount = s.live > 0 ? it.revenue : 0;
    const liveProfit = s.live > 0 ? it.netProfit : 0;
    const deliveredAt = it.order.deliveredAt;
    const delivered = deliveredAt !== null && deliveredAt.getTime() <= asOf.getTime();

    for (const b of [bucket, out.total]) {
      b.ordered += s.live + s.lost;
      b.orderedAmount += liveAmount + lostAmount;
      if (s.kind === 'canceled') {
        b.canceled += s.lost;
        b.canceledAmount += lostAmount;
      } else if (s.kind === 'returned') {
        // Tirik satrdagi qisman qaytish ham qaytarish (xaridor qabul qilib qaytargan)
        b.returned += s.lost;
        b.returnedAmount += lostAmount;
      }
      if (delivered) {
        b.sold += s.live;
        b.soldAmount += liveAmount;
      } else {
        b.inTransit += s.live;
        b.inTransitAmount += liveAmount;
      }
      b.liveProfit += liveProfit;
    }

    out.bySku.set(key, bucket);

    if (detailed) {
      const day = toBusinessDate(it.orderedAt);
      const row = out.byDay.get(day) ?? { ordered: 0, sold: 0, inTransit: 0, canceled: 0, returned: 0 };
      row.ordered += s.live + s.lost;
      if (s.kind === 'canceled') row.canceled += s.lost;
      else if (s.kind === 'returned') row.returned += s.lost;
      if (delivered) row.sold += s.live;
      else row.inTransit += s.live;
      out.byDay.set(day, row);

      if (s.kind && s.lost > 0) {
        const reasons = out.reasons[s.kind];
        const raw = realReason(it.returnCause);
        const r = reasons.get(raw) ?? { units: 0, amount: 0 };
        r.units += s.lost;
        r.amount += lostAmount;
        reasons.set(raw, r);
      }
    }
  }

  out.orders = orderIds.size;
  return out;
}

/**
 * Yo'qotilgan foyda — bekor qilingan va qaytgan donalar sotilganda keltirgan
 * bo'lardi: har SKU uchun shu davrdagi TIRIK donalarining (xaridor qabul
 * qilgan va yo'ldagi) o'rtacha sof foydasi × yo'qotilgan dona. Bir dona
 * iqtisodi (narx, komissiya, logistika, tannarx) buyurtma paytidayoq ma'lum,
 * yo'ldagi satrda ham Uzum to'lovi bor. Faqat qabul qilinganlar olinsa,
 * qisqa davrda ("Bugun") asos umuman qolmasdi.
 *
 * Yo'qotilgan satrning O'Z `netProfit` i ATAYLAB olinmaydi: Uzum bunday
 * satrda amount = 0 beradi va importer foydani shundan hisoblaydi — u
 * yo'qotishni ko'rsatmaydi. Davrda tirik donasi yo'q SKU (va SKU'siz satr)
 * baholanmaydi — taxmin o'ylab topilmaydi, ularning soni va tushumi alohida.
 * Yo'qotilgan dona umuman bo'lmasa foyda 0; bor-u, bittasi ham baholanmasa — null.
 */
function lostProfitOf(c: Collected): { profit: number | null; unpricedUnits: number; unpricedAmount: number } {
  let profit = 0;
  let priced = 0;
  let unpricedUnits = 0;
  let unpricedAmount = 0;
  for (const [key, b] of c.bySku) {
    const lost = b.canceled + b.returned;
    if (lost <= 0) continue;
    const live = b.sold + b.inTransit;
    if (key === NO_SKU || live <= 0) {
      unpricedUnits += lost;
      unpricedAmount += b.canceledAmount + b.returnedAmount;
      continue;
    }
    profit += (b.liveProfit / live) * lost;
    priced += lost;
  }
  return {
    profit: priced > 0 ? round(profit) : unpricedUnits > 0 ? null : 0,
    unpricedUnits,
    unpricedAmount: round(unpricedAmount),
  };
}

/** Sabablar ro'yxati: haqiqiy sabablar summa bo'yicha kamayib, sababsizi (raw null) oxirida */
function reasonList(map: ReasonMap): FunnelReason[] {
  let units = 0;
  let amount = 0;
  for (const v of map.values()) {
    units += v.units;
    amount += v.amount;
  }
  return [...map.entries()]
    .map(([raw, v]) => ({
      raw,
      units: v.units,
      amount: round(v.amount),
      // Summa umuman yo'q bo'lsa (narxsiz satrlar) — dona ulushi
      share: amount > 0 ? pct(v.amount, amount) : pct(v.units, units),
    }))
    .sort(
      (a, b) =>
        Number(a.raw === null) - Number(b.raw === null) ||
        b.amount - a.amount ||
        b.units - a.units ||
        (a.raw ?? '').localeCompare(b.raw ?? ''),
    );
}

/** So'm qismlari yaxlitlangan holda; buyurtma summasi — ularning yig'indisi (ayirmalar aynan mos kelsin) */
function amountsOf(b: Bucket): Record<FunnelStepId, number> {
  const sold = round(b.soldAmount);
  const inTransit = round(b.inTransitAmount);
  const canceled = round(b.canceledAmount);
  const returned = round(b.returnedAmount);
  return { ordered: sold + inTransit + canceled + returned, sold, inTransit, canceled, returned };
}

/**
 * GET /funnel — holatlar (`steps`), yo'qotish voronkasi (`stages`), yo'qotilgan
 * tushum va foyda, sabablar so'mda, kunlik dinamika va mahsulot kesimi.
 */
router.get(
  '/',
  requireFeature('sales_analytics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const prevFrom = businessDayStart(range.previous.from);
    const prevTo = addDays(businessDayStart(range.previous.to), 1);
    /*
     * Taqqoslash davri teng yoshda: hozirdan ikki davr BOSHLARI orasidagi
     * farqcha oldingi paytdagi holati ('prev' da bu davr uzunligi,
     * 'prevMonth' / 'prevYear' da — bir oy / bir yil; collect izohi)
     */
    const now = new Date();
    const prevAsOf = new Date(now.getTime() - (range.from.getTime() - prevFrom.getTime()));

    const [cur, previous, catalog] = await Promise.all([
      collect(storeIds, range.from, range.toExclusive, now, true),
      /*
       * Oldingi davr saqlangan tarixdan tashqarida bo'lsa (tarif chegarasi
       * yoki birinchi sinxrondan oldin) u yerdagi nol "sotuv bo'lmagan" emas,
       * "ma'lumot yo'q" degani. Ilgari voronka baribir shu qisman oynaga
       * solishtirardi va yolg'on o'sish ko'rsatardi; endi Boshqaruv paneli va
       * qaytarish kartasi bilan bitta qoida (services/pnl.ts comparablePeriod):
       * o'zgarish ham, oldingi qiymat ham null (2026-10-24).
       */
      comparablePeriod(storeIds, range.previous, plan).then(async (period) =>
        period ? { period, data: await collect(storeIds, prevFrom, prevTo, prevAsOf, false) } : null,
      ),
      getSkuCatalog(storeIds, true),
    ]);
    const prev = previous?.data ?? null;

    const T = cur.total;
    const PT = prev?.total ?? null;
    const A = amountsOf(T);
    const PA = PT ? amountsOf(PT) : null;

    // ── Bosqichlar: buyurtma qilingan dona va uning to'rt holati (ulush — buyurtma qilingan donadan) ──
    const step = (id: FunnelStepId): FunnelStep => ({
      id,
      value: T[id],
      amount: A[id],
      prevValue: PT ? PT[id] : null,
      prevAmount: PA ? PA[id] : null,
      deltaPct: PT ? deltaPct(T[id], PT[id]) : null,
      conversion: T.ordered > 0 ? pct(T[id], T.ordered) : null,
    });
    const steps: FunnelStep[] = [
      step('ordered'),
      step('sold'),
      // Yo'ldagi dona alohida: na sotilgan, na yo'qotilgan
      step('inTransit'),
      step('canceled'),
      // Ilgari qaytgan summa doim 0 edi (2026-10-24)
      step('returned'),
    ];

    /*
     * ── Yo'qotish voronkasi: to'rt bosqich ──
     * Yo'ldagi dona "jo'natildi" da bor, "qabul qildi" da yo'q: u yo'qotish
     * emas, natija kutilmoqda — sahifada bosqichlar orasida neytral turadi.
     * "Qabul qildi" ga qaytganlar ham kiradi: Uzum topshirish punktida
     * olinmaganini va olib qaytarilganini ajratmaydi. Ulushlar —
     * services/returns.ts ta'rifi: bekor qilish ÷ buyurtma qilingan, qaytarish
     * ÷ (qabul qilingan + qaytgan), ya'ni oldingi bosqich donasi.
     */
    const received = T.sold + T.returned;
    const shipped = received + T.inTransit;
    const shareOf = (units: number): number | null => (T.ordered > 0 ? pct(units, T.ordered) : null);
    const rateOf = (part: number, base: number): number | null => (base > 0 ? pct(part, base) : null);
    const stages: FunnelStage[] = [
      { id: 'ordered', units: T.ordered, amount: A.ordered, share: shareOf(T.ordered), drop: null },
      {
        id: 'shipped',
        units: shipped,
        amount: A.ordered - A.canceled,
        share: shareOf(shipped),
        drop: { id: 'canceled', units: T.canceled, amount: A.canceled, rate: rateOf(T.canceled, T.ordered) },
      },
      {
        id: 'received',
        units: received,
        amount: A.sold + A.returned,
        share: shareOf(received),
        drop: { id: 'inTransit', units: T.inTransit, amount: A.inTransit, rate: rateOf(T.inTransit, shipped) },
      },
      {
        id: 'kept',
        units: T.sold,
        amount: A.sold,
        share: shareOf(T.sold),
        drop: { id: 'returned', units: T.returned, amount: A.returned, rate: rateOf(T.returned, received) },
      },
    ];

    /*
     * ── Yo'qotilgan qiymat — bekor qilingan va qaytgan donalar ──
     * Foyda o'zgarishi faqat ikkala davrda ham hamma yo'qotilgan dona
     * baholangan bo'lsa: aks holda farq baholanmay qolgan donalardan chiqib,
     * yo'qotish kamaygandek yoki ko'paygandek ko'rinardi.
     */
    const lp = lostProfitOf(cur);
    const plp = prev ? lostProfitOf(prev) : null;
    const lostAmount = A.canceled + A.returned;
    const prevLostAmount = PA ? PA.canceled + PA.returned : null;
    const lost: FunnelLost = {
      units: T.canceled + T.returned,
      amount: lostAmount,
      share: A.ordered > 0 ? pct(lostAmount, A.ordered) : null,
      profit: lp.profit,
      unpricedUnits: lp.unpricedUnits,
      unpricedAmount: lp.unpricedAmount,
      prevAmount: prevLostAmount,
      prevProfit: plp?.profit ?? null,
      amountDeltaPct: prevLostAmount === null ? null : deltaPct(lostAmount, prevLostAmount),
      profitDeltaPct:
        lp.profit !== null && plp && plp.profit !== null && lp.unpricedUnits === 0 && plp.unpricedUnits === 0
          ? deltaPct(lp.profit, plp.profit)
          : null,
    };

    // ── Kunlik dinamika (bo'sh kunlar ham chiqadi, lekin bugundan nariga o'tmaydi) ──
    const daily: FunnelResponse['daily'] = [];
    const tomorrow = addDays(businessDayStart(toBusinessDate(now)), 1);
    const lastDay = range.toExclusive < tomorrow ? range.toExclusive : tomorrow;
    for (let d = new Date(range.from); d < lastDay; d = addDays(d, 1)) {
      const key = toBusinessDate(d);
      const row = cur.byDay.get(key);
      daily.push({
        date: key,
        ordered: row?.ordered ?? 0,
        sold: row?.sold ?? 0,
        inTransit: row?.inTransit ?? 0,
        canceled: row?.canceled ?? 0,
        returned: row?.returned ?? 0,
      });
    }

    // ── Mahsulot kesimi ──
    const rows: FunnelProductRow[] = [];
    for (const [skuId, b] of cur.bySku) {
      const info = catalog.get(skuId);
      // Katalogda yo'q — o'chirilgan tovar
      if (!info) continue;
      const p = prev ? (prev.bySku.get(skuId) ?? emptyBucket()) : null;
      const buyoutRate = buyoutOf(b);

      rows.push({
        skuId,
        sku: info?.sku ?? '—',
        title: info?.title ?? info?.productTitle ?? 'Nomaʼlum mahsulot',
        imageUrl: info?.imageUrl ?? null,
        ordered: b.ordered,
        orderedAmount: round(b.orderedAmount),
        sold: b.sold,
        soldAmount: round(b.soldAmount),
        inTransit: b.inTransit,
        canceled: b.canceled,
        returned: b.returned,
        completed: completedOf(b),
        buyoutRate,
        avgPrice: b.sold > 0 ? round(b.soldAmount / b.sold) : 0,
        share: cur.total.soldAmount > 0 ? pct(b.soldAmount, cur.total.soldAmount) : 0,
        // Taqqoslab bo'lmasa (oldingi davr tarixdan tashqarida) — hammasi "—"
        deltas: p
          ? {
              ordered: deltaPct(b.ordered, p.ordered),
              sold: deltaPct(b.sold, p.sold),
              soldAmount: deltaPct(b.soldAmount, p.soldAmount),
              buyoutRate: buyoutRate === null ? null : deltaPct(buyoutRate, buyoutOf(p)),
            }
          : { ordered: null, sold: null, soldAmount: null, buyoutRate: null },
      });
    }

    rows.sort((a, b) => b.soldAmount - a.soldAmount || b.ordered - a.ordered);

    const completed = completedOf(T);
    const completedPct = T.ordered > 0 ? pct(completed, T.ordered) : null;
    const totalBuyout = buyoutOf(T);

    const payload: FunnelResponse = {
      period: range.period,
      previous: range.previous,
      currency: company.currency,
      steps,
      totals: {
        orders: cur.orders,
        ordersDeltaPct: prev ? deltaPct(cur.orders, prev.orders) : null,
        ordered: T.ordered,
        orderedAmount: A.ordered,
        sold: T.sold,
        soldAmount: A.sold,
        inTransit: T.inTransit,
        inTransitAmount: A.inTransit,
        canceled: T.canceled,
        returned: T.returned,
        canceledAmount: A.canceled,
        returnedAmount: A.returned,
        completed,
        completedPct,
        buyoutRate: totalBuyout,
        preliminary: totalBuyout !== null && completedPct !== null && completedPct < PRELIMINARY_BELOW,
        avgPrice: T.sold > 0 ? round(T.soldAmount / T.sold) : 0,
      },
      comparePeriod: previous?.period ?? null,
      stages,
      lost,
      reasons: {
        canceled: reasonList(cur.reasons.canceled),
        returned: reasonList(cur.reasons.returned),
      },
      daily,
      rows,
      // Bu bosqichlar Uzum Seller API'da mavjud emas
      missingSteps: ['impressions', 'cardOpens', 'addToCart'],
    };

    res.json(payload);
  }),
);

export default router;
