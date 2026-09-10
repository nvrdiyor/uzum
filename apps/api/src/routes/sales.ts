/**
 * Sotuv tahlili moduli — /api/v1/sales
 *
 *  GET /            → SalesAnalyticsResponse
 *                     (soatlik taqsimot, buyurtmalar ro'yxati, yetkazish turi,
 *                      shaharlar va hafta kunlari kesimi)
 *  GET /orders/:id  → bitta buyurtma tafsiloti (pozitsiyalar + xarajat taqsimoti)
 *
 * Kesimlar (soatlik, hafta kuni, shahar, yetkazish turi) **filtrlangan** to'plam
 * ustida hisoblanadi — grafiklar tanlangan filtrga birga javob beradi.
 * `totalOrders` esa filtrsiz, davrdagi jami buyurtmalar sonini bildiradi.
 *
 * Barcha pul qiymatlari UZS (butun son), sanalar ISO-8601.
 * Ma'lumot bo'lmasa ham 200 va bo'sh/nol qiymatlar qaytariladi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  DEFAULTS,
  pct,
  round,
  safeDiv,
  type DeliveryType,
  type HourlyPoint,
  type OrderRow,
  type OrderStatus,
  type Paginated,
  type SalesAnalyticsResponse,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getSkuCatalog, getStoreIds } from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Doimiylar va kichik yordamchilar ───────────────────────────

const ORDER_STATUSES: OrderStatus[] = ['new', 'processing', 'delivered', 'canceled', 'returned'];
const DELIVERY_TYPES: DeliveryType[] = ['FBO', 'FBS', 'DBS'];

/** Bazadagi matnni xavfsiz OrderStatus'ga aylantiradi (notanish qiymat → 'new') */
const toOrderStatus = (value: string): OrderStatus =>
  (ORDER_STATUSES as string[]).includes(value) ? (value as OrderStatus) : 'new';

/** Bazadagi matnni xavfsiz DeliveryType'ga aylantiradi (notanish qiymat → 'FBO') */
const toDeliveryType = (value: string): DeliveryType =>
  (DELIVERY_TYPES as string[]).includes(value) ? (value as DeliveryType) : 'FBO';

/** Query'dagi status filtri ('all' yoki notanish qiymat — filtrsiz) */
const pickStatus = (value?: string): OrderStatus | undefined =>
  value && value !== 'all' && (ORDER_STATUSES as string[]).includes(value) ? (value as OrderStatus) : undefined;

/** Query'dagi yetkazish turi filtri ('all' yoki notanish qiymat — filtrsiz) */
const pickDeliveryType = (value?: string): DeliveryType | undefined =>
  value && value !== 'all' && (DELIVERY_TYPES as string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as DeliveryType)
    : undefined;

/** Shahar nomi bo'sh bo'lsa umumiy guruh */
const UNKNOWN_CITY = 'Noma’lum shahar';

/**
 * Berilgan vaqt mintaqasining UTC'dan farqi (millisekund).
 * Bazadagi barcha sanalar UTC'da saqlanadi, ammo sotuvchi Toshkent vaqtida ishlaydi —
 * shuning uchun soatlik va hafta kunlari kesimi mahalliy vaqtda ko'rsatiladi.
 */
function timeZoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const get = (key: string): number => Number(map[key] ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24, // ba'zi ICU versiyalari yarim tunni "24" deb qaytaradi
    get('minute'),
    get('second'),
  );
  // Sekunddan kichik qismni tashlab, faqat mintaqa farqini olamiz
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Mintaqa farqi bir marta hisoblanadi (Toshkentda yozgi vaqt yo'q — doimiy UTC+5) */
const TZ_OFFSET_MS = ((): number => {
  try {
    return timeZoneOffsetMs(DEFAULTS.timezone, new Date());
  } catch {
    return 5 * 3_600_000;
  }
})();

/** UTC sanani do'kon mintaqasidagi "mahalliy" sanaga siljitadi */
const toLocal = (date: Date): Date => new Date(date.getTime() + TZ_OFFSET_MS);

/** Pozitsiya amaldagimi? (bekor qilingan va qaytarilganlar pulda hisoblanmaydi) */
const isEffective = (item: { status: string; returnedAt: Date | null }): boolean =>
  item.status !== 'canceled' && item.status !== 'returned' && !item.returnedAt;

// ─────────────────────────── Ichki tiplar ───────────────────────────

/** SKU haqida qisqa ma'lumot — rasm va nomni to'ldirish uchun */
interface SkuBrief {
  sku: string;
  title: string;
  imageUrl: string | null;
}

type SkuLookup = (skuId: string) => SkuBrief | undefined;

interface DbOrderItem {
  id: string;
  skuId: string | null;
  skuCode: string | null;
  title: string | null;
  qty: number;
  sellPrice: number;
  purchasePrice: number;
  commission: number;
  logistics: number;
  otherCost: number;
  revenue: number;
  payout: number;
  netProfit: number;
  status: string;
  returnedAt: Date | null;
}

interface DbOrder {
  id: string;
  uzumOrderId: string | null;
  status: string;
  deliveryType: string;
  orderedAt: Date;
  buyerCity: string | null;
  items: DbOrderItem[];
}

/** Buyurtma satri uchun kerakli maydonlar */
const ORDER_ROW_SELECT = {
  id: true,
  uzumOrderId: true,
  status: true,
  deliveryType: true,
  orderedAt: true,
  buyerCity: true,
  items: {
    select: {
      id: true,
      skuId: true,
      skuCode: true,
      title: true,
      qty: true,
      sellPrice: true,
      purchasePrice: true,
      commission: true,
      logistics: true,
      otherCost: true,
      revenue: true,
      payout: true,
      netProfit: true,
      status: true,
      returnedAt: true,
    },
  },
} satisfies Prisma.OrderSelect;

/**
 * Buyurtmani jadval satriga aylantiradi.
 *
 * Kelishuv:
 *  • `sellPrice`     — buyurtmaning to'liq sotuv qiymati (barcha pozitsiyalar, bekor qilinganlar ham);
 *  • `revenue`       — faqat amaldagi (bekor qilinmagan/qaytarilmagan) pozitsiyalar tushumi;
 *  • `purchasePrice` — amaldagi pozitsiyalarning jami tannarxi (COGS);
 *  • `qty`           — buyurtmadagi barcha dona soni (tarkibni ko'rsatish uchun).
 */
function toOrderRow(order: DbOrder, lookup: SkuLookup): OrderRow {
  let qty = 0;
  let grossValue = 0;
  let revenue = 0;
  let cogs = 0;
  let commission = 0;
  let logistics = 0;
  let payout = 0;
  let netProfit = 0;

  // Asosiy pozitsiya — eng qimmat satr (nom va rasm shundan olinadi)
  let main: DbOrderItem | null = null;
  let mainWeight = -1;

  for (const it of order.items) {
    const weight = it.sellPrice * it.qty;
    if (weight > mainWeight) {
      mainWeight = weight;
      main = it;
    }
    qty += it.qty;
    grossValue += weight;

    if (!isEffective(it)) continue;
    revenue += it.revenue;
    cogs += it.purchasePrice * it.qty;
    commission += it.commission;
    logistics += it.logistics;
    payout += it.payout;
    netProfit += it.netProfit;
  }

  const info = main?.skuId ? lookup(main.skuId) : undefined;
  const baseTitle = main?.title || info?.title || 'Noma’lum mahsulot';
  const extraPositions = Math.max(0, order.items.length - 1);

  return {
    id: order.id,
    uzumOrderId: order.uzumOrderId,
    status: toOrderStatus(order.status),
    deliveryType: toDeliveryType(order.deliveryType),
    orderedAt: order.orderedAt.toISOString(),
    buyerCity: order.buyerCity,
    title: extraPositions > 0 ? `${baseTitle} +${extraPositions}` : baseTitle,
    sku: main?.skuCode ?? info?.sku ?? null,
    imageUrl: info?.imageUrl ?? null,
    qty,
    purchasePrice: round(cogs),
    sellPrice: round(grossValue),
    revenue: round(revenue),
    commission: round(commission),
    logistics: round(logistics),
    payout: round(payout),
    netProfit: round(netProfit),
    margin: pct(netProfit, revenue),
  };
}

/** Saralash ustuni (foyda bazada saqlanmaydi — buyurtma darajasidagi ustunlar bo'yicha) */
function orderByFor(sort: string | undefined, order: 'asc' | 'desc'): Prisma.OrderOrderByWithRelationInput {
  switch (sort) {
    case 'revenue':
      return { totalAmount: order };
    case 'qty':
      return { itemsCount: order };
    case 'city':
      return { buyerCity: order };
    case 'status':
      return { status: order };
    case 'delivery':
      return { deliveryType: order };
    default:
      return { orderedAt: order };
  }
}

// ─────────────────────────── GET / — sotuv tahlili ───────────────────────────

router.get(
  '/',
  requireFeature('sales_analytics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const q = req.query as Record<string, string | undefined>;

    const status = pickStatus(q.status);
    const deliveryType = pickDeliveryType(q.type);
    const search = range.search;

    // Davrdagi barcha buyurtmalar (filtrsiz) — `totalOrders` uchun
    const whereBase: Prisma.OrderWhereInput = {
      storeId: { in: storeIds },
      orderedAt: { gte: range.from, lt: range.toExclusive },
    };

    // Qidiruv: buyurtma raqami/ID yoki pozitsiya SKU/nomi bo'yicha
    const where: Prisma.OrderWhereInput = {
      ...whereBase,
      ...(status ? { status } : {}),
      ...(deliveryType ? { deliveryType } : {}),
      ...(search
        ? {
            OR: [
              { uzumOrderId: { contains: search } },
              { id: { contains: search } },
              { items: { some: { skuCode: { contains: search } } } },
              { items: { some: { title: { contains: search } } } },
            ],
          }
        : {}),
    };

    const [aggRows, totalOrders, pageRows, catalog] = await Promise.all([
      // Kesimlar uchun yengil o'qish (faqat kerakli maydonlar)
      prisma.order.findMany({
        where,
        select: {
          deliveryType: true,
          orderedAt: true,
          buyerCity: true,
          items: { select: { revenue: true, status: true, returnedAt: true } },
        },
      }),
      prisma.order.count({ where: whereBase }),
      prisma.order.findMany({
        where,
        orderBy: orderByFor(range.sort, range.order),
        skip: (range.page - 1) * range.pageSize,
        take: range.pageSize,
        select: ORDER_ROW_SELECT,
      }),
      getSkuCatalog(storeIds, true),
    ]);

    // ── Kesimlar ──
    const hourly: HourlyPoint[] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
    const byWeekdayRaw = Array.from({ length: 7 }, (_, weekday) => ({ weekday, orders: 0, revenue: 0 }));
    const byDelivery = new Map<DeliveryType, { orders: number; revenue: number }>(
      DELIVERY_TYPES.map((type) => [type, { orders: 0, revenue: 0 }]),
    );
    const byCityMap = new Map<string, { orders: number; revenue: number }>();

    for (const o of aggRows) {
      let revenue = 0;
      for (const it of o.items) {
        if (isEffective(it)) revenue += it.revenue;
      }

      const local = toLocal(o.orderedAt);
      const hourBucket = hourly[local.getUTCHours()];
      if (hourBucket) {
        hourBucket.orders += 1;
        hourBucket.revenue += revenue;
      }

      const weekdayBucket = byWeekdayRaw[local.getUTCDay()];
      if (weekdayBucket) {
        weekdayBucket.orders += 1;
        weekdayBucket.revenue += revenue;
      }

      const delivery = byDelivery.get(toDeliveryType(o.deliveryType));
      if (delivery) {
        delivery.orders += 1;
        delivery.revenue += revenue;
      }

      const cityKey = o.buyerCity?.trim() || UNKNOWN_CITY;
      const city = byCityMap.get(cityKey) ?? { orders: 0, revenue: 0 };
      city.orders += 1;
      city.revenue += revenue;
      byCityMap.set(cityKey, city);
    }

    // ── Jadval satrlari ──
    const lookup: SkuLookup = (skuId) => {
      const info = catalog.get(skuId);
      return info ? { sku: info.sku, title: info.title, imageUrl: info.imageUrl } : undefined;
    };
    const items = pageRows.map((row) => toOrderRow(row, lookup));

    const filteredTotal = aggRows.length;
    const orders: Paginated<OrderRow> = {
      items,
      total: filteredTotal,
      page: range.page,
      pageSize: range.pageSize,
      pages: Math.max(1, Math.ceil(filteredTotal / range.pageSize)),
    };

    const payload: SalesAnalyticsResponse = {
      period: range.period,
      hourly: hourly.map((h) => ({ hour: h.hour, orders: h.orders, revenue: round(h.revenue) })),
      totalOrders,
      orders,
      byDeliveryType: DELIVERY_TYPES.map((type) => {
        const agg = byDelivery.get(type) ?? { orders: 0, revenue: 0 };
        return { type, orders: agg.orders, revenue: round(agg.revenue) };
      }),
      // Eng yirik 12 ta shahar (tushum bo'yicha)
      byCity: [...byCityMap.entries()]
        .map(([city, agg]) => ({ city, orders: agg.orders, revenue: round(agg.revenue) }))
        .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
        .slice(0, 12),
      // weekday: 0 — yakshanba ... 6 — shanba (JS konventsiyasi)
      byWeekday: byWeekdayRaw.map((w) => ({ weekday: w.weekday, orders: w.orders, revenue: round(w.revenue) })),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /orders/:id — buyurtma tafsiloti ───────────────────────────

/** Buyurtma ichidagi bitta pozitsiya */
export interface OrderPositionRow {
  id: string;
  skuId: string | null;
  sku: string | null;
  title: string;
  imageUrl: string | null;
  qty: number;
  /** birlik sotuv narxi */
  sellPrice: number;
  /** birlik tannarxi */
  purchasePrice: number;
  revenue: number;
  cogs: number;
  commission: number;
  logistics: number;
  otherCost: number;
  payout: number;
  netProfit: number;
  margin: number;
  status: OrderStatus;
  returnedAt: string | null;
  /** pozitsiya pul hisobida qatnashadimi (bekor/qaytarilgan bo'lsa — yo'q) */
  effective: boolean;
}

/** Xarajat taqsimoti satri */
export interface OrderCostRow {
  key: 'cogs' | 'commission' | 'logistics' | 'other' | 'tax';
  label: string;
  amount: number;
  /** tushumga nisbatan ulush, % */
  share: number;
}

export interface OrderDetailResponse {
  order: OrderRow;
  storeId: string;
  storeTitle: string;
  paidAt: string | null;
  deliveredAt: string | null;
  discount: number;
  positionsCount: number;
  positions: OrderPositionRow[];
  costs: OrderCostRow[];
  totals: {
    revenue: number;
    cogs: number;
    commission: number;
    logistics: number;
    otherCost: number;
    tax: number;
    costTotal: number;
    payout: number;
    netProfit: number;
    margin: number;
    avgUnitPrice: number;
  };
}

const COST_LABEL: Record<OrderCostRow['key'], string> = {
  cogs: 'Tannarx',
  commission: 'Uzum komissiyasi',
  logistics: 'Logistika',
  other: 'Boshqa xarajatlar',
  tax: 'Soliq',
};

router.get(
  '/orders/:id',
  requireFeature('sales_analytics'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const key = req.params.id;

    // ID yoki Uzum buyurtma raqami bo'yicha qidiramiz
    const order = await prisma.order.findFirst({
      where: {
        store: { companyId: company.id },
        OR: [{ id: key }, { uzumOrderId: key }],
      },
      select: {
        ...ORDER_ROW_SELECT,
        paidAt: true,
        deliveredAt: true,
        discount: true,
        store: { select: { id: true, title: true } },
      },
    });
    if (!order) throw AppError.notFound('Buyurtma topilmadi');

    const skuIds = [...new Set(order.items.map((it) => it.skuId).filter((v): v is string => Boolean(v)))];
    const skus = skuIds.length
      ? await prisma.sku.findMany({
          where: { id: { in: skuIds } },
          select: { id: true, sku: true, title: true, imageUrl: true, product: { select: { imageUrl: true } } },
        })
      : [];
    const skuMap = new Map<string, SkuBrief>(
      skus.map((s) => [s.id, { sku: s.sku, title: s.title, imageUrl: s.imageUrl ?? s.product.imageUrl ?? null }]),
    );
    const lookup: SkuLookup = (skuId) => skuMap.get(skuId);

    let revenue = 0;
    let cogs = 0;
    let commission = 0;
    let logistics = 0;
    let otherCost = 0;
    let payout = 0;
    let netProfit = 0;
    let effectiveUnits = 0;

    const positions: OrderPositionRow[] = order.items.map((it) => {
      const info = it.skuId ? lookup(it.skuId) : undefined;
      const effective = isEffective(it);
      const itemCogs = it.purchasePrice * it.qty;

      if (effective) {
        revenue += it.revenue;
        cogs += itemCogs;
        commission += it.commission;
        logistics += it.logistics;
        otherCost += it.otherCost;
        payout += it.payout;
        netProfit += it.netProfit;
        effectiveUnits += it.qty;
      }

      return {
        id: it.id,
        skuId: it.skuId,
        sku: it.skuCode ?? info?.sku ?? null,
        title: it.title || info?.title || 'Noma’lum mahsulot',
        imageUrl: info?.imageUrl ?? null,
        qty: it.qty,
        sellPrice: round(it.sellPrice),
        purchasePrice: round(it.purchasePrice),
        revenue: round(it.revenue),
        cogs: round(itemCogs),
        commission: round(it.commission),
        logistics: round(it.logistics),
        otherCost: round(it.otherCost),
        payout: round(it.payout),
        netProfit: round(it.netProfit),
        margin: pct(it.netProfit, it.revenue),
        status: toOrderStatus(it.status),
        returnedAt: it.returnedAt ? it.returnedAt.toISOString() : null,
        effective,
      } satisfies OrderPositionRow;
    });

    // Soliq buyurtma darajasida saqlanmaydi — kompaniya stavkasi bo'yicha hisoblanadi
    const tax = (revenue * company.taxRate) / 100;
    const costTotal = cogs + commission + logistics + otherCost + tax;

    const costs: OrderCostRow[] = (
      [
        { key: 'cogs', amount: cogs },
        { key: 'commission', amount: commission },
        { key: 'logistics', amount: logistics },
        { key: 'other', amount: otherCost },
        { key: 'tax', amount: tax },
      ] as { key: OrderCostRow['key']; amount: number }[]
    ).map(({ key, amount }) => ({
      key,
      label: COST_LABEL[key],
      amount: round(amount),
      share: pct(amount, revenue),
    }));

    const payload: OrderDetailResponse = {
      order: toOrderRow(order, lookup),
      storeId: order.store.id,
      storeTitle: order.store.title,
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      discount: round(order.discount),
      positionsCount: positions.length,
      positions,
      costs,
      totals: {
        revenue: round(revenue),
        cogs: round(cogs),
        commission: round(commission),
        logistics: round(logistics),
        otherCost: round(otherCost),
        tax: round(tax),
        costTotal: round(costTotal),
        payout: round(payout),
        netProfit: round(netProfit),
        margin: pct(netProfit, revenue),
        avgUnitPrice: round(safeDiv(revenue, effectiveUnits)),
      },
    };

    res.json(payload);
  }),
);

export default router;
