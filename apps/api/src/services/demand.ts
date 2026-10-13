/**
 * Talab — tovar kuniga nechta sotiladi. Rejalashtiruvchi shunga tayanadi.
 *
 * NEGA ODDIY "30 KUNDA SOTILGANI / 30" EMAS. Tovar oyning bir qismida tugab
 * turgan bo'lsa, o'sha kunlarda u sotilmagan — talab yo'qligidan emas,
 * tovar yo'qligidan. Oddiy o'rtacha bu kunlarni ham bo'luvchiga qo'shadi va
 * tezlikni past ko'rsatadi: jonli do'konda (2026-10-13) teflon oyoqcha 30
 * kunda 24 ta sotilgan, lekin 8 kun omborda yo'q edi — haqiqiy tezlik kuniga
 * 0,8 emas, 24 / 22 ≈ 1,1. Past tezlik bilan qoldiq "22 kunga yetadi" deb
 * ko'rinardi (aslida ~16 kun) va buyurtma kam tavsiya qilinardi — ya'ni
 * tovar yana tugab qolardi.
 *
 * Shuning uchun bo'luvchi — tovar SOTUVDA BO'LGAN kunlar: kunlik qoldiq
 * yozuvida (StockSnapshot) qoldiq bor yoki o'sha kuni buyurtma tushgan.
 * Yangi tovar ham shu bilan to'g'ri sanaladi: sotuvga chiqqaniga 7 kun
 * bo'lsa, 30 ga emas, 7 ga bo'linadi.
 */
import { prisma } from '@savdoiq/db';
import { addDays, toISODate } from '@savdoiq/shared';

/** Tezlik hisoblanadigan oyna (kun) */
export const DEMAND_WINDOW_DAYS = 30;
/** Yo'nalishni (o'sish/pasayish) ko'rsatish uchun yaqin oyna */
const RECENT_DAYS = 14;
/**
 * Eng kichik bo'luvchi (kun). Sotuvga chiqqaniga 1–2 kun bo'lgan tovarda
 * bitta sotuv "kuniga 1 ta" bo'lib ko'rinmasligi uchun.
 */
const MIN_DAYS = 7;
/** Yo'nalish faqat shuncha sotuvdan keyin ko'rsatiladi — 2–3 dona sotuvda u shovqin */
const MIN_UNITS_FOR_TREND = 6;

export interface Demand {
  /** Oynadagi sof sotuv, dona (bekor qilingan va qaytarilganlarsiz) */
  units: number;
  /** Oynada tovar sotuvda bo'lgan kunlar */
  inStockDays: number;
  /** Oynada tovar tugab turgan kunlar (birinchi marta sotuvga chiqqunga qadar bo'lgan kunlar kirmaydi) */
  stockoutDays: number;
  /** Kunlik sotuv tezligi: `units / max(MIN_DAYS, inStockDays)` */
  rate: number;
  /** Oxirgi 14 kun tezligining butun oynaga nisbatan farqi, %; ma'lumot kam bo'lsa null */
  trendPct: number | null;
  /** Haqiqiy o'rtacha sotuv narxi (tushum / dona); sotuv bo'lmasa 0 */
  avgPrice: number;
}

interface DayCell {
  units: number;
  ordered: boolean;
  revenue: number;
}

const dayKey = (d: Date): string => toISODate(d);

export async function getDemand(
  storeIds: string[],
  days = DEMAND_WINDOW_DAYS,
  now = new Date(),
): Promise<Map<string, Demand>> {
  const out = new Map<string, Demand>();
  if (storeIds.length === 0) return out;

  const today = new Date(`${dayKey(now)}T00:00:00.000Z`);
  /** Oyna bugunni ham o'z ichiga oladi: [from .. today] — jami `days` kun */
  const from = addDays(today, -(days - 1));
  const recentFrom = dayKey(addDays(today, -(RECENT_DAYS - 1)));

  const [items, snaps, seedSnaps, soldBefore, stockedBefore] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderedAt: { gte: from }, order: { storeId: { in: storeIds } }, skuId: { not: null } },
      select: { skuId: true, orderedAt: true, qty: true, revenue: true, status: true, returnedAt: true },
    }),
    prisma.stockSnapshot.findMany({
      where: { storeId: { in: storeIds }, date: { gte: from } },
      select: { skuId: true, date: true, fbo: true, fbs: true, own: true },
    }),
    // Oynadan oldingi oxirgi holat: oynaning birinchi kunlarida yozuv bo'lmasa shundan davom etiladi
    prisma.stockSnapshot.findMany({
      where: { storeId: { in: storeIds }, date: { lt: from, gte: addDays(from, -30) } },
      orderBy: { date: 'desc' },
      select: { skuId: true, fbo: true, fbs: true, own: true },
    }),
    // Oynadan oldin ham sotilganmi yoki omborda bo'lganmi — "tugab turgan" kunlarni
    // "hali sotuvga chiqmagan" kunlardan ajratish uchun
    prisma.orderItem.groupBy({
      by: ['skuId'],
      where: { orderedAt: { lt: from }, order: { storeId: { in: storeIds } }, skuId: { not: null } },
      _count: { _all: true },
    }),
    prisma.stockSnapshot.groupBy({
      by: ['skuId'],
      where: { storeId: { in: storeIds }, date: { lt: from }, OR: [{ fbo: { gt: 0 } }, { fbs: { gt: 0 } }, { own: { gt: 0 } }] },
      _count: { _all: true },
    }),
  ]);

  // SKU → kun → sotuv
  const sales = new Map<string, Map<string, DayCell>>();
  for (const it of items) {
    if (!it.skuId) continue;
    const byDay = sales.get(it.skuId) ?? new Map<string, DayCell>();
    const key = dayKey(it.orderedAt);
    const cell = byDay.get(key) ?? { units: 0, ordered: false, revenue: 0 };
    // Bekor qilingan buyurtma ham o'sha kuni tovar bor bo'lganini bildiradi
    cell.ordered = true;
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (!returned && it.status !== 'canceled') {
      cell.units += it.qty;
      cell.revenue += it.revenue;
    }
    byDay.set(key, cell);
    sales.set(it.skuId, byDay);
  }

  // SKU → kun → qoldiq bormi
  const stock = new Map<string, Map<string, boolean>>();
  for (const sn of snaps) {
    const byDay = stock.get(sn.skuId) ?? new Map<string, boolean>();
    byDay.set(dayKey(sn.date), sn.fbo + sn.fbs + sn.own > 0);
    stock.set(sn.skuId, byDay);
  }

  const seed = new Map<string, boolean>();
  for (const sn of seedSnaps) {
    if (!seed.has(sn.skuId)) seed.set(sn.skuId, sn.fbo + sn.fbs + sn.own > 0);
  }

  const seenBefore = new Set<string>();
  for (const r of soldBefore) if (r.skuId) seenBefore.add(r.skuId);
  for (const r of stockedBefore) seenBefore.add(r.skuId);

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i += 1) dayKeys.push(dayKey(addDays(from, i)));

  const skuIds = new Set<string>([...sales.keys(), ...stock.keys()]);
  for (const skuId of skuIds) {
    const sold = sales.get(skuId);
    const snap = stock.get(skuId);

    /** Oxirgi ma'lum holat: true — bor, false — yo'q, null — hali noma'lum */
    let have: boolean | null = seed.get(skuId) ?? null;
    /** Tovar bir marta bo'lsa ham sotuvda bo'lganmi — shundan keyingina "tugadi" deyish mumkin */
    let launched = seenBefore.has(skuId) || have === true;

    let units = 0;
    let revenue = 0;
    let inStockDays = 0;
    let stockoutDays = 0;
    let recentUnits = 0;
    let recentDays = 0;

    for (const key of dayKeys) {
      const cell = sold?.get(key);
      const known = snap?.get(key);
      if (known !== undefined) have = known;

      const available = Boolean(cell?.ordered) || have === true;
      if (available) {
        launched = true;
        inStockDays += 1;
        if (key >= recentFrom) recentDays += 1;
      } else if (have === false && launched) {
        stockoutDays += 1;
      }

      if (cell) {
        units += cell.units;
        revenue += cell.revenue;
        if (key >= recentFrom) recentUnits += cell.units;
      }
    }

    const rate = units > 0 ? units / Math.max(MIN_DAYS, inStockDays) : 0;
    let trendPct: number | null = null;
    if (rate > 0 && units >= MIN_UNITS_FOR_TREND && recentDays >= MIN_DAYS && inStockDays > recentDays) {
      trendPct = Math.round(((recentUnits / recentDays - rate) / rate) * 100);
    }

    out.set(skuId, {
      units,
      inStockDays,
      stockoutDays,
      rate,
      trendPct,
      avgPrice: units > 0 ? revenue / units : 0,
    });
  }

  return out;
}
