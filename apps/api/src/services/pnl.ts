/**
 * Foyda hisobining YAGONA ta'rifi — barcha sahifalar shu yerdan oladi.
 *
 * Ilgari har sahifa o'zicha hisoblardi va bir xil davr uchun raqamlar turlicha
 * chiqardi: Boshqaruv paneli "Sof foyda"dan Uzum saqlash to'lovini ayirmasdi,
 * Moliya sahifasi "Sof foyda" deb tovarlar bo'yicha foydani ko'rsatardi, Oylik
 * hisobot esa hamma xarajatdan keyingisini. Mahsulot marjasi va ROI'si shu
 * mahsulotning reklama to'lovini umuman bilmasdi.
 *
 * Atamalar:
 *   tovarlar bo'yicha foyda = Σ pozitsiya (to'lov − tannarx − qo'shimcha − soliq)
 *   davr xarajatlari        = pozitsiyaga bog'lab bo'lmaydigan hamma narsa:
 *                             omborga logistika, reklama, saqlash, ish haqi,
 *                             qo'lda kiritilgan komissiya/soliq/boshqa
 *   SOF FOYDA               = tovarlar bo'yicha foyda − davr xarajatlari
 *   marja                   = sof foyda ÷ tushum
 *   ROI                     = sof foyda ÷ tovarga sarflangan pul (tannarx + qo'shimcha)
 */
import { prisma } from '@savdoiq/db';
import {
  addDays,
  businessDayStart,
  eachDay,
  getPlan,
  round,
  toBusinessDate,
  toISODate,
  type Period,
  type PlanId,
} from '@savdoiq/shared';
import { aggregateSales, getDailySeries, getExpenses, type SalesAgg } from './common.js';

export interface PeriodCosts {
  /** Omborga yetkazish va boshqa buyurtmaga bog'lanmagan logistika */
  logistics: number;
  /** Reklama: buyurtmalarni ko'paytirish to'lovi, pulli targ'ibot */
  marketing: number;
  /** Uzum saqlash to'lovi (StorageFee) + qo'lda kiritilgani */
  storage: number;
  salary: number;
  other: number;
  /** Qo'lda kiritilgan komissiya (Uzum komissiyasi pozitsiyada ayrilgan) */
  commission: number;
  /** Qo'lda kiritilgan soliq (stavka bo'yicha soliq pozitsiyada ayrilgan) */
  tax: number;
  total: number;
}

const storeScope = (storeIds: string[], storeId?: string) =>
  storeId ? { storeId } : { OR: [{ storeId: { in: storeIds } }, { storeId: null }] };

/** Uzum saqlash to'lovlari yig'indisi */
async function storageFees(storeIds: string[], from: Date, toExclusive: Date): Promise<number> {
  if (storeIds.length === 0) return 0;
  const agg = await prisma.storageFee.aggregate({
    _sum: { amount: true },
    where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Davr xarajatlari. `uzum-payout` manbali satrlar kirmaydi — ular buyurtma
 * pozitsiyasida ("yechib olish uchun" summasida) allaqachon ayrilgan.
 */
export async function getPeriodCosts(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  storeId?: string,
): Promise<PeriodCosts> {
  const [exp, fees] = await Promise.all([
    getExpenses(companyId, from, toExclusive, storeId),
    storageFees(storeIds, from, toExclusive),
  ]);
  const costs = {
    logistics: exp.logistics,
    marketing: exp.marketing,
    storage: exp.storage + fees,
    salary: exp.salary,
    other: exp.other,
    commission: exp.commission,
    tax: exp.tax,
  };
  return { ...costs, total: Object.values(costs).reduce((s, v) => s + v, 0) };
}

/**
 * Davr xarajatlari kunma-kun (savdo kuni → summa) — foyda grafigi uchun.
 *
 * QO'LDA KIRITILGAN xarajat (`source: 'manual'`) o'z oyining shu oynaga
 * tushgan kunlariga TENG bo'linadi. Sotuvchi ish haqi, ijara yoki oylik
 * reklamani bitta sana bilan kiritadi (odatda oyning 1-kuni) — ilgari butun
 * summa o'sha kunga yozilardi va grafikda bir kunlik katta "zarar" ustuni
 * chiqardi, oyning qolgan kunlari esa xarajatsizdek ko'rinardi (2026-10-24).
 * Uzumdan keladigan xarajat va saqlash to'lovi kunlik — o'z kunida qoladi.
 *
 * Yig'indi O'ZGARMAYDI (getPeriodCosts bilan aynan teng): xarajat faqat
 * oynaning o'z kunlariga bo'linadi, ulushlar butun so'mda, qoldiq oxirgi
 * kunda. Bugundan keyingi kunlarga bo'linmaydi: grafik seriyasi
 * (getDailySeries) bugun bilan tugaydi va ulushning bir qismi grafikdan
 * tushib qolardi.
 */
export async function getPeriodCostsByDay(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  storeId?: string,
): Promise<Map<string, number>> {
  const [rows, fees] = await Promise.all([
    prisma.expense.findMany({
      where: {
        companyId,
        date: { gte: from, lt: toExclusive },
        source: { not: 'uzum-payout' },
        ...(storeId ? { storeId } : {}),
      },
      select: { date: true, amount: true, source: true },
    }),
    storeIds.length
      ? prisma.storageFee.findMany({
          where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
          select: { date: true, amount: true },
        })
      : Promise.resolve([]),
  ]);
  const out = new Map<string, number>();
  const add = (day: string, amount: number) => out.set(day, (out.get(day) ?? 0) + amount);

  // Bo'lish mumkin bo'lgan kunlar: oyna ichida va bugundan kech emas
  const firstDay = toBusinessDate(from);
  const windowLast = toBusinessDate(addDays(toExclusive, -1));
  const today = toBusinessDate(new Date());
  const lastDay = windowLast < today ? windowLast : today;

  for (const r of fees) add(toBusinessDate(r.date), r.amount);
  for (const r of rows) {
    const day = toBusinessDate(r.date);
    const days = r.source === 'manual' ? monthDaysWithin(day, firstDay, lastDay) : [];
    if (days.length === 0) {
      add(day, r.amount);
      continue;
    }
    // Kumulyativ yaxlitlash: har ulush butun so'm, yig'indisi aynan `amount`
    let given = 0;
    days.forEach((d, i) => {
      const upTo = i === days.length - 1 ? r.amount : Math.round((r.amount * (i + 1)) / days.length);
      add(d, upTo - given);
      given = upTo;
    });
  }
  return out;
}

/** `day` oyining [first, last] oraliqqa tushgan kunlari (ISO sanalar) */
function monthDaysWithin(day: string, first: string, last: string): string[] {
  const monthFirst = `${day.slice(0, 7)}-01`;
  // Keyingi oyning 0-kuni — shu oyning oxirgi kuni
  const monthLast = toISODate(new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)));
  const from = monthFirst > first ? monthFirst : first;
  const to = monthLast < last ? monthLast : last;
  return from <= to ? eachDay({ from, to }) : [];
}

// ─────────────────────────── Kunlik grafik va oldingi davr ───────────────────────────

/** Kunlik grafik nuqtasi; `profit` — davr xarajatlari ayrilgandan keyin */
export type NetDailyPoint = Awaited<ReturnType<typeof getDailySeries>>[number];

/**
 * Kunlik seriya, foyda DAVR XARAJATLARIDAN KEYIN — Boshqaruv paneli va Moliya
 * grafigidagi "Sof foyda". Joriy va oldingi davr shu bitta funksiyadan
 * olinadi: ta'rif farq qilsa, oldingi davr chizig'i tizimli ravishda baland
 * yoki past turib, yo'q "o'sish"ni ko'rsatardi.
 */
export async function getNetDailySeries(
  companyId: string,
  storeIds: string[],
  period: Period,
  storeId?: string,
): Promise<NetDailyPoint[]> {
  const [series, costs] = await Promise.all([
    getDailySeries(storeIds, period),
    getPeriodCostsByDay(
      companyId,
      storeIds,
      businessDayStart(period.from),
      addDays(businessDayStart(period.to), 1),
      storeId,
    ),
  ]);
  return series.map((p) => ({ ...p, profit: round(p.profit - (costs.get(p.date) ?? 0)) }));
}

/**
 * Oldingi davr grafikda taqqoslashga yaroqlimi; yaroqli bo'lsa — o'sha davr.
 *
 * Saqlangan tarixdan tashqaridagi kunlar bazada NOL bo'lib turadi, lekin bu
 * "o'tgan safar sotuv bo'lmagan" emas, "bizda ma'lumot yo'q" degani. Bunday
 * oyna chizilsa, uzuq chiziq nolda yotib, har qanday davr keskin o'sishdek
 * ko'rinardi. Shuning uchun oldingi davr ikkala chegaradan keyin boshlanishi shart:
 *  • tarif tarixi (`historyDays`) — joriy davr ham shu chegarada kesiladi
 *    (lib/period.ts), sinxron ham undan nariga bormaydi;
 *  • birinchi saqlangan buyurtma — birinchi to'liq sinxron undan oldingisini
 *    olmagan (ko'pi bilan 365 kun) yoki do'kon o'shanda hali sotmagan.
 */
export async function comparablePeriod(storeIds: string[], previous: Period, plan: PlanId): Promise<Period | null> {
  if (storeIds.length === 0) return null;
  const floor = toBusinessDate(addDays(new Date(), -getPlan(plan).limits.historyDays));
  if (previous.from < floor) return null;
  const first = await prisma.order.aggregate({
    _min: { orderedAt: true },
    where: { storeId: { in: storeIds } },
  });
  const firstAt = first._min.orderedAt;
  if (!firstAt || previous.from < toBusinessDate(firstAt)) return null;
  return previous;
}

/**
 * Oldingi teng davr seriyasi — joriy davr bilan kunma-kun tekislangan:
 * `previousPeriod` bir xil uzunlikdagi siljish, shuning uchun i-nuqta joriy
 * davrning i-kuniga to'g'ri keladi. Tarix yetmasa null (comparablePeriod).
 */
export async function getPreviousNetSeries(
  companyId: string,
  storeIds: string[],
  previous: Period,
  plan: PlanId,
  storeId?: string,
): Promise<{ period: Period; series: NetDailyPoint[] } | null> {
  const period = await comparablePeriod(storeIds, previous, plan);
  if (!period) return null;
  return { period, series: await getNetDailySeries(companyId, storeIds, period, storeId) };
}

/** ROI maxraji: tovarga sarflangan pul — tannarx va bir donaga qo'shimcha xarajat */
export const investedIn = (cogs: number, otherCost: number): number => cogs + otherCost;

// ─────────────────────────── Mahsulot reklamasi ───────────────────────────

/**
 * Reklama to'lovi qaysi mahsulotniki — Uzum buni alohida maydonda bermaydi,
 * faqat satr matnida: "Buyurtmalarni ko'paytirish to'lovi, tovar IDsi — 3239880.
 * Xaridor tovarni olganida 1770 so'm yechib oldik… Sotuvdan foiz — 3%".
 * Ruscha va inglizcha yozilishi ham tutiladi. Topilmasa — null (umumiy reklama).
 */
export function adProductId(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = /(?:tovar\s+IDsi|ID\s+товара|товара\s+ID|product\s+ID)\D{0,6}(\d{4,})/i.exec(note);
  return m?.[1] ?? null;
}

/**
 * Mahsulotga bog'langan reklama to'lovlari — SKU kesimida.
 *
 * To'lov mahsulot darajasida keladi (sotuvdan foiz), shuning uchun uning
 * SKU'lariga davrdagi tushum ulushiga qarab taqsimlanadi. Davrda mahsulotning
 * sotuvi bo'lmasa (to'lov xaridor tovarni olganda yechiladi — buyurtma oldingi
 * davrda bo'lishi mumkin), SKU'lar orasida teng bo'linadi.
 *
 * Bu summa mahsulot marjasi va ROI'sidan ayriladi. Davr yig'indisida u reklama
 * xarajati ichida allaqachon bor — u yerda qayta ayrilmaydi.
 */
export async function getAdFeesBySku(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  revenueBySku: Map<string, number>,
  storeId?: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (storeIds.length === 0) return out;

  const rows = await prisma.expense.findMany({
    where: {
      companyId,
      category: 'marketing',
      source: { not: 'uzum-payout' },
      date: { gte: from, lt: toExclusive },
      ...storeScope(storeIds, storeId),
    },
    select: { amount: true, note: true },
  });

  const byProduct = new Map<string, number>();
  for (const r of rows) {
    const pid = adProductId(r.note);
    if (pid) byProduct.set(pid, (byProduct.get(pid) ?? 0) + r.amount);
  }
  if (byProduct.size === 0) return out;

  const skus = await prisma.sku.findMany({
    where: { storeId: { in: storeIds }, product: { uzumProductId: { in: [...byProduct.keys()] } } },
    select: { id: true, product: { select: { uzumProductId: true } } },
  });
  const skusOf = new Map<string, string[]>();
  for (const s of skus) {
    const pid = s.product.uzumProductId;
    if (!pid) continue;
    skusOf.set(pid, [...(skusOf.get(pid) ?? []), s.id]);
  }

  for (const [pid, amount] of byProduct) {
    const ids = skusOf.get(pid) ?? [];
    if (ids.length === 0) continue;
    const revenue = ids.reduce((s, id) => s + Math.max(0, revenueBySku.get(id) ?? 0), 0);
    for (const id of ids) {
      const share = revenue > 0 ? Math.max(0, revenueBySku.get(id) ?? 0) / revenue : 1 / ids.length;
      if (share > 0) out.set(id, (out.get(id) ?? 0) + amount * share);
    }
  }
  return out;
}

// ─────────────────────────── Mahsulot kesimi ───────────────────────────

/** SKU sotuvlari; `netProfit` — mahsulot reklamasi ayirilgan foyda */
export type SalesNet = Map<string, SalesAgg & { adFee: number }>;

/**
 * Davr bo'yicha SKU sotuvlari, MAHSULOT KESIMIDAGI sahifalar uchun:
 * foydadan shu mahsulotning reklama to'lovi ayirilgan.
 *
 * Davr yig'indisi (Boshqaruv paneli, Moliya, Oylik hisobot) buni ISHLATMAYDI —
 * u yerda reklama davr xarajati sifatida bir marta ayriladi; ikkalasini
 * aralashtirish reklamani ikki marta ayirgan bo'lardi.
 */
export async function aggregateSalesNet(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  storeId?: string,
): Promise<SalesNet> {
  const sales = await aggregateSales(storeIds, from, toExclusive);
  const ads = await getAdFeesBySku(
    companyId,
    storeIds,
    from,
    toExclusive,
    new Map([...sales].map(([id, a]) => [id, a.revenue])),
    storeId,
  );
  const out: SalesNet = new Map();
  for (const [id, agg] of sales) {
    const adFee = ads.get(id) ?? 0;
    out.set(id, { ...agg, adFee, netProfit: agg.netProfit - adFee });
  }
  // Davrda sotuvi yo'q, lekin reklama to'lovi yechilgan SKU ham ko'rinsin (foyda manfiy)
  for (const [id, adFee] of ads) {
    if (out.has(id) || adFee === 0) continue;
    out.set(id, {
      skuId: id,
      units: 0,
      revenue: 0,
      payout: 0,
      cogs: 0,
      commission: 0,
      logistics: 0,
      otherCost: 0,
      netProfit: -adFee,
      orders: 0,
      returns: 0,
      lastSaleAt: null,
      firstSaleAt: null,
      adFee,
    });
  }
  return out;
}
