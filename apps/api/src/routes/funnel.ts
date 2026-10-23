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
 * Har bir bosqich oldingi teng davr bilan TENG YOSHDA solishtiriladi (pastda
 * `collect` izohi) va mahsulot kesimida "sotib olish foizi" (buyout)
 * hisoblanadi — faqat YAKUNLANGAN donalar bo'yicha: sotildi / (sotildi +
 * bekor + qaytdi). Boshqaruv panelidagi "Sotib olish darajasi" va
 * Mahsulotlar kartochkasidagi xarid foizi bilan bir xil ta'rif
 * (analytics.ts, products.ts).
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
  type FunnelProductRow,
  type FunnelResponse,
  type FunnelStep,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getSkuCatalog, getStoreIds } from '../services/common.js';

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
});

type DayRow = FunnelResponse['daily'][number];

interface Collected {
  total: Bucket;
  /** Davrdagi buyurtmalar (alohida orderId) — qolgan sanoqlar dona */
  orders: number;
  bySku: Map<string, Bucket>;
  byDay: Map<string, Omit<DayRow, 'date'>>;
}

/** Yakunlangan dona: sotildi + bekor + qaytdi. Yo'ldagilar hali natija bermagan */
const completedOf = (b: Bucket): number => b.sold + b.canceled + b.returned;

/** Sotib olish foizi yakunlangan donalar bo'yicha; yakunlangani bo'lmasa null */
const buyoutOf = (b: Bucket): number | null => {
  const done = completedOf(b);
  return done > 0 ? pct(b.sold, done) : null;
};

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
 * oldingi davr uchun hozir − davr uzunligi: oldingi davrning har bir satri
 * joriy davrdagi juftligi bilan bir xil yoshda baholanadi. Ilgari oldingi
 * davr yakuniy holati bilan olinardi — u yerdagi yo'ldagilar allaqachon
 * yetkazilgan, joriy davrdagilar esa hali yo'lda, shuning uchun "Sotildi"
 * o'zgarishi sun'iy tushardi (7 kunlik davrda −37%, buyurtmalar esa −17%)
 * (2026-10-24). Kelajakdagi `deliveredAt` (demo ma'lumotda bor) ham hali
 * yo'lda sanaladi. Bekor/qaytgan satr esa yakuniy holati bilan qoladi: Uzum
 * bekor qilingan sanani bermaydi, `returnedAt` esa taxminiy.
 */
async function collect(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  asOf: Date,
  withDays: boolean,
): Promise<Collected> {
  const out: Collected = { total: emptyBucket(), orders: 0, bySku: new Map(), byDay: new Map() };
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
      // Xaridor qabul qilgan sana — "sotildi" va "yo'lda" shu bilan ajraladi (Boshqaruv paneli bilan bir xil)
      order: { select: { deliveredAt: true } },
    },
  });

  const orderIds = new Set<string>();

  for (const it of items) {
    orderIds.add(it.orderId);
    const key = it.skuId ?? '—';
    const bucket = out.bySku.get(key) ?? emptyBucket();

    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    const canceled = !returned && it.status === 'canceled';
    const unitPrice = it.sellPrice > 0 ? it.sellPrice : it.qty > 0 ? it.revenue / it.qty : 0;

    // Yo'qotilgan dona: bekor/qaytgan satrning hammasi yoki tirik satrning qisman qaytgan qismi
    const lost = returned || canceled ? (it.returnedQty > 0 ? it.returnedQty : Math.max(it.qty, 1)) : it.returnedQty;
    const lostAmount = unitPrice * lost;
    // Tirik dona — faqat bekor/qaytmagan satrda; uning summasi haqiqiy tushum
    const live = returned || canceled ? 0 : it.qty;
    const liveAmount = returned || canceled ? 0 : it.revenue;
    const deliveredAt = it.order.deliveredAt;
    const delivered = deliveredAt !== null && deliveredAt.getTime() <= asOf.getTime();

    for (const b of [bucket, out.total]) {
      b.ordered += live + lost;
      b.orderedAmount += liveAmount + lostAmount;
      if (canceled) {
        b.canceled += lost;
        b.canceledAmount += lostAmount;
      } else {
        // Tirik satrdagi qisman qaytish ham qaytarish (xaridor qabul qilib qaytargan)
        b.returned += lost;
        b.returnedAmount += lostAmount;
      }
      if (delivered) {
        b.sold += live;
        b.soldAmount += liveAmount;
      } else {
        b.inTransit += live;
        b.inTransitAmount += liveAmount;
      }
    }

    out.bySku.set(key, bucket);

    if (withDays) {
      const day = toBusinessDate(it.orderedAt);
      const row = out.byDay.get(day) ?? { ordered: 0, sold: 0, inTransit: 0, canceled: 0, returned: 0 };
      row.ordered += live + lost;
      if (canceled) row.canceled += lost;
      else row.returned += lost;
      if (delivered) row.sold += live;
      else row.inTransit += live;
      out.byDay.set(day, row);
    }
  }

  out.orders = orderIds.size;
  return out;
}

/**
 * GET /funnel — voronka bosqichlari, kunlik dinamika va mahsulot kesimi.
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
    // Oldingi davr teng yoshda: hozirdan davr uzunligicha oldingi paytdagi holati
    const now = new Date();
    const prevAsOf = new Date(now.getTime() - (range.from.getTime() - prevFrom.getTime()));

    const [cur, prev, catalog] = await Promise.all([
      collect(storeIds, range.from, range.toExclusive, now, true),
      collect(storeIds, prevFrom, prevTo, prevAsOf, false),
      getSkuCatalog(storeIds, true),
    ]);

    // ── Bosqichlar: buyurtma qilingan dona va uning to'rt holati (ulush — buyurtma qilingan donadan) ──
    const step = (id: FunnelStep['id'], unitsKey: keyof Bucket, amountKey: keyof Bucket): FunnelStep => ({
      id,
      value: cur.total[unitsKey],
      amount: round(cur.total[amountKey]),
      prevValue: prev.total[unitsKey],
      prevAmount: round(prev.total[amountKey]),
      deltaPct: deltaPct(cur.total[unitsKey], prev.total[unitsKey]),
      conversion: cur.total.ordered > 0 ? pct(cur.total[unitsKey], cur.total.ordered) : null,
    });
    const steps: FunnelStep[] = [
      step('ordered', 'ordered', 'orderedAmount'),
      step('sold', 'sold', 'soldAmount'),
      // Yo'ldagi dona alohida: na sotilgan, na yo'qotilgan
      step('inTransit', 'inTransit', 'inTransitAmount'),
      step('canceled', 'canceled', 'canceledAmount'),
      // Ilgari qaytgan summa doim 0 edi (2026-10-24)
      step('returned', 'returned', 'returnedAmount'),
    ];

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
      const p = prev.bySku.get(skuId) ?? emptyBucket();
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
        deltas: {
          ordered: deltaPct(b.ordered, p.ordered),
          sold: deltaPct(b.sold, p.sold),
          soldAmount: deltaPct(b.soldAmount, p.soldAmount),
          buyoutRate: buyoutRate === null ? null : deltaPct(buyoutRate, buyoutOf(p)),
        },
      });
    }

    rows.sort((a, b) => b.soldAmount - a.soldAmount || b.ordered - a.ordered);

    const payload: FunnelResponse = {
      period: range.period,
      previous: range.previous,
      currency: company.currency,
      steps,
      totals: {
        orders: cur.orders,
        ordersDeltaPct: deltaPct(cur.orders, prev.orders),
        ordered: cur.total.ordered,
        orderedAmount: round(cur.total.orderedAmount),
        sold: cur.total.sold,
        soldAmount: round(cur.total.soldAmount),
        inTransit: cur.total.inTransit,
        inTransitAmount: round(cur.total.inTransitAmount),
        canceled: cur.total.canceled,
        returned: cur.total.returned,
        canceledAmount: round(cur.total.canceledAmount),
        returnedAmount: round(cur.total.returnedAmount),
        completed: completedOf(cur.total),
        buyoutRate: buyoutOf(cur.total),
        avgPrice: cur.total.sold > 0 ? round(cur.total.soldAmount / cur.total.sold) : 0,
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
