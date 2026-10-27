/**
 * Sotuv sanasi asosi — "buyurtma sanasi" yoki "qabul sanasi" (2026-10-27).
 *
 * Saytdagi har pul raqami sotuvni BUYURTMA kuniga yozadi (OrderItem.orderedAt).
 * Uzum esa pulni va oylik hisobotini xaridor tovarni QABUL QILGAN kun bo'yicha
 * beradi (Order.deliveredAt — moliyadagi `dateIssued`). Shuning uchun bizdagi
 * "oktabr tushumi" Uzum kabinetidagidan farq qiladi: yo'ldagi buyurtmalar
 * bizda sanaladi, keyin bekor bo'lgan yoki qaytgani raqamlarni orqaga suradi.
 * Moliya va Oylik hisobotda ixtiyoriy `?basis=receipt` rejimi shu farqni
 * yopadi; standart — avvalgidek buyurtma sanasi (lib/period.ts `DateBasis`).
 *
 * Qabul sanasi qoidalari (bitta joyda, Moliya va hisobot bir xil o'qiydi):
 *  • pozitsiya davrga buyurtmasining `deliveredAt` i bilan tushadi (savdo kuni,
 *    Asia/Tashkent) va faqat qabul qilingandan keyin: `deliveredAt` bor va
 *    hozirdan kech emas. Yo'ldagi buyurtma hali hech qaysi davrda yo'q;
 *  • bekor qilingan pozitsiya kirmaydi;
 *  • qaytgani ma'lum pozitsiya (holati 'returned' yoki `returnedAt` bor) —
 *    buyurtma sanasidagi qoidaning AYNAN o'zi (finance.ts sumLiveLines,
 *    returns.ts splitLine): pulda hisoblanmaydi. Uzum qaytarish sanasini
 *    bermaydi (`returnedAt` — taxmin), shuning uchun qaytgan tovarni "qaytgan
 *    kuni minus" qilib yozish o'rniga u qabul qilingan davrdan butunlay
 *    chiqadi — ikkala rejimda qaytish raqamni bir xil yo'l bilan o'zgartiradi
 *    va ikkala rejimning yig'indisi bir xil pozitsiyalardan iborat bo'ladi;
 *  • davr xarajatlari (Expense, StorageFee) ikkala rejimda ham o'z sanasida —
 *    ular buyurtma sanasiga bog'liq emas.
 */
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import { toBusinessDate, type Period } from '@savdoiq/shared';
import type { DateBasis } from '../lib/period.js';
import { getDailySeries, seriesWindow } from './common.js';

/**
 * Davrga tushadigan buyurtma pozitsiyalari sharti (Prisma `where`).
 *
 * 'order' — avvalgi shartning AYNAN o'zi (finance.ts, monthly-report.ts), shu
 * sabab standart javoblar o'zgarmaydi.
 *
 * 'receipt' — buyurtma `deliveredAt` i [from, toExclusive) ichida va `now`
 * dan kech emas. Ikkinchi shart demo ma'lumotdagi kelajak sanasi uchun ham:
 * hali qabul qilinmagan tovar Uzum hisobotida yo'q, bizda ham sotuv emas.
 *
 * Indeks: Order'da (storeId, orderedAt) bor, deliveredAt'da yo'q. So'rov
 * do'kon bo'yicha o'sha indeksning boshidan foydalanadi, sana esa do'kon
 * buyurtmalari ichida suziladi — sxema o'zgarmaydi. Xom SQL yo'q: SQLite
 * (dev) va PostgreSQL (prod) bir xil ishlaydi.
 */
export function lineDateWhere(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  basis: DateBasis,
  now: Date = new Date(),
): Prisma.OrderItemWhereInput {
  if (basis === 'receipt') {
    return { order: { storeId: { in: storeIds }, deliveredAt: { gte: from, lt: toExclusive, lte: now } } };
  }
  return { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } } };
}

/** Buyurtma darajasidagi shart (buyurtmalar soni, yetkazish turi) — `lineDateWhere` bilan bir asosda */
export function orderDateWhere(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  basis: DateBasis,
  now: Date = new Date(),
): Prisma.OrderWhereInput {
  if (basis === 'receipt') {
    return { storeId: { in: storeIds }, deliveredAt: { gte: from, lt: toExclusive, lte: now } };
  }
  return { storeId: { in: storeIds }, orderedAt: { gte: from, lt: toExclusive } };
}

/** Pozitsiya qaysi savdo kuniga (oyiga) yoziladi — `lineDateWhere` bilan bir asosda */
export function lineDate(it: { orderedAt: Date; order?: { deliveredAt: Date | null } | null }, basis: DateBasis): Date {
  return basis === 'receipt' ? (it.order?.deliveredAt ?? it.orderedAt) : it.orderedAt;
}

export type DailyPoint = Awaited<ReturnType<typeof getDailySeries>>[number];

/**
 * Kunlik seriya (tushum, foyda, buyurtma, dona) — sana asosi bo'yicha.
 *
 * 'order' da common.ts getDailySeries'ning o'zi (Boshqaruv paneli bilan bitta
 * funksiya). 'receipt' da xuddi o'sha kunlar (seriesWindow) va o'sha qoida
 * (bekor qilingan va qaytgan pozitsiya pulga kirmaydi, buyurtma — tirik
 * pozitsiyasi bo'lsa), faqat kun = qabul qilingan kun. Kunlar yig'indisi
 * shu asosdagi jami bilan teng bo'lishi shart (Moliya grafigi, hisobotning
 * "Kunlik" varag'i).
 */
export async function getDailySeriesByBasis(storeIds: string[], period: Period, basis: DateBasis): Promise<DailyPoint[]> {
  if (basis === 'order') return getDailySeries(storeIds, period);

  const { from, to, keys } = seriesWindow(period);
  const map = new Map<string, DailyPoint>();
  for (const key of keys) map.set(key, { date: key, revenue: 0, profit: 0, orders: 0, units: 0, payout: 0, returns: 0 });
  if (storeIds.length === 0) return [...map.values()];

  const items = await prisma.orderItem.findMany({
    where: lineDateWhere(storeIds, from, to, basis),
    select: {
      orderedAt: true,
      revenue: true,
      netProfit: true,
      payout: true,
      qty: true,
      status: true,
      orderId: true,
      returnedAt: true,
      order: { select: { deliveredAt: true } },
    },
  });

  const ordersPerDay = new Map<string, Set<string>>();
  for (const it of items) {
    const key = toBusinessDate(lineDate(it, basis));
    const row = map.get(key);
    if (!row) continue;
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned) {
      row.returns += it.qty;
    } else if (it.status !== 'canceled') {
      row.revenue += it.revenue;
      row.profit += it.netProfit;
      row.payout += it.payout;
      row.units += it.qty;
      const set = ordersPerDay.get(key) ?? new Set<string>();
      set.add(it.orderId);
      ordersPerDay.set(key, set);
    }
  }
  for (const [key, set] of ordersPerDay) {
    const row = map.get(key);
    if (row) row.orders = set.size;
  }
  return [...map.values()];
}
