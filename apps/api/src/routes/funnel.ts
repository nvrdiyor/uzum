/**
 * Sotuv voronkasi — /api/v1/funnel
 *
 * Uzum kabinetidagi "Sotuv voronkasi" bo'limining mantiqiy analogi, lekin
 * SavdoIQ faqat Seller API bergan ma'lumot bilan ishlaydi.
 *
 * MUHIM: Uzum Seller API'da namoyishlar (impressions), kartochka ochilishi va
 * savatga qo'shish bo'yicha endpoint YO'Q (`docs/UZUM-API.md`). Shuning uchun
 * voronka buyurtmadan boshlanadi:
 *
 *     Buyurtma qilindi → Sotildi (yetkazildi) → Bekor qilindi → Qaytarildi
 *
 * Har bir bosqich oldingi teng davr bilan solishtiriladi va mahsulot kesimida
 * "sotib olish foizi" (buyout) hisoblanadi.
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

/** Bitta SKU bo'yicha bosqich raqamlari */
interface Bucket {
  ordered: number;
  orderedAmount: number;
  sold: number;
  soldAmount: number;
  canceled: number;
  canceledAmount: number;
  returned: number;
}

const emptyBucket = (): Bucket => ({
  ordered: 0,
  orderedAmount: 0,
  sold: 0,
  soldAmount: 0,
  canceled: 0,
  canceledAmount: 0,
  returned: 0,
});

interface Collected {
  total: Bucket;
  bySku: Map<string, Bucket>;
  byDay: Map<string, { ordered: number; sold: number; canceled: number; returned: number }>;
}

/**
 * Davr bo'yicha pozitsiyalarni yig'adi.
 *
 * Uzum bekor qilingan/qaytarilgan pozitsiyada `amount = 0` yuboradi va miqdorni
 * `amountReturns` da beradi — importer uni `qty = 0` va status bilan saqlaydi.
 * Shuning uchun "buyurtma qilingan" = sotilgan + bekor qilingan + qaytarilgan.
 */
async function collect(storeIds: string[], from: Date, toExclusive: Date, withDays: boolean): Promise<Collected> {
  const out: Collected = { total: emptyBucket(), bySku: new Map(), byDay: new Map() };
  if (storeIds.length === 0) return out;

  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } } },
    select: {
      skuId: true,
      qty: true,
      revenue: true,
      sellPrice: true,
      status: true,
      returnedAt: true,
      orderedAt: true,
    },
  });

  for (const it of items) {
    const key = it.skuId ?? '—';
    const bucket = out.bySku.get(key) ?? emptyBucket();

    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    const canceled = it.status === 'canceled';
    // Bekor/qaytarilganda qty 0 bo'ladi — bitta dona deb hisoblaymiz
    const units = Math.max(it.qty, returned || canceled ? 1 : 0);
    const amount = it.revenue > 0 ? it.revenue : it.sellPrice * units;

    bucket.ordered += units;
    bucket.orderedAmount += amount;
    out.total.ordered += units;
    out.total.orderedAmount += amount;

    if (returned) {
      bucket.returned += units;
      out.total.returned += units;
    } else if (canceled) {
      bucket.canceled += units;
      bucket.canceledAmount += amount;
      out.total.canceled += units;
      out.total.canceledAmount += amount;
    } else {
      bucket.sold += it.qty;
      bucket.soldAmount += it.revenue;
      out.total.sold += it.qty;
      out.total.soldAmount += it.revenue;
    }

    out.bySku.set(key, bucket);

    if (withDays) {
      const day = toISODate(it.orderedAt);
      const row = out.byDay.get(day) ?? { ordered: 0, sold: 0, canceled: 0, returned: 0 };
      row.ordered += units;
      if (returned) row.returned += units;
      else if (canceled) row.canceled += units;
      else row.sold += it.qty;
      out.byDay.set(day, row);
    }
  }

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

    const prevFrom = new Date(`${range.previous.from}T00:00:00.000Z`);
    const prevTo = addDays(new Date(`${range.previous.to}T00:00:00.000Z`), 1);

    const [cur, prev, catalog] = await Promise.all([
      collect(storeIds, range.from, range.toExclusive, true),
      collect(storeIds, prevFrom, prevTo, false),
      getSkuCatalog(storeIds, true),
    ]);

    // ── Bosqichlar ──
    const steps: FunnelStep[] = [
      {
        id: 'ordered',
        value: cur.total.ordered,
        amount: round(cur.total.orderedAmount),
        prevValue: prev.total.ordered,
        prevAmount: round(prev.total.orderedAmount),
        deltaPct: deltaPct(cur.total.ordered, prev.total.ordered),
        conversion: 100,
      },
      {
        id: 'sold',
        value: cur.total.sold,
        amount: round(cur.total.soldAmount),
        prevValue: prev.total.sold,
        prevAmount: round(prev.total.soldAmount),
        deltaPct: deltaPct(cur.total.sold, prev.total.sold),
        conversion: cur.total.ordered > 0 ? pct(cur.total.sold, cur.total.ordered) : null,
      },
      {
        id: 'canceled',
        value: cur.total.canceled,
        amount: round(cur.total.canceledAmount),
        prevValue: prev.total.canceled,
        prevAmount: round(prev.total.canceledAmount),
        deltaPct: deltaPct(cur.total.canceled, prev.total.canceled),
        conversion: cur.total.ordered > 0 ? pct(cur.total.canceled, cur.total.ordered) : null,
      },
      {
        id: 'returned',
        value: cur.total.returned,
        amount: 0,
        prevValue: prev.total.returned,
        prevAmount: 0,
        deltaPct: deltaPct(cur.total.returned, prev.total.returned),
        conversion: cur.total.ordered > 0 ? pct(cur.total.returned, cur.total.ordered) : null,
      },
    ];

    // ── Kunlik dinamika (bo'sh kunlar ham chiqadi, lekin bugundan nariga o'tmaydi) ──
    const daily: FunnelResponse['daily'] = [];
    const tomorrow = addDays(parseISODate(toISODate(new Date())), 1);
    const lastDay = range.toExclusive < tomorrow ? range.toExclusive : tomorrow;
    for (let d = new Date(range.from); d < lastDay; d = addDays(d, 1)) {
      const key = toISODate(d);
      const row = cur.byDay.get(key);
      daily.push({
        date: key,
        ordered: row?.ordered ?? 0,
        sold: row?.sold ?? 0,
        canceled: row?.canceled ?? 0,
        returned: row?.returned ?? 0,
      });
    }

    // ── Mahsulot kesimi ──
    const rows: FunnelProductRow[] = [];
    for (const [skuId, b] of cur.bySku) {
      const info = catalog.get(skuId);
      const p = prev.bySku.get(skuId) ?? emptyBucket();

      rows.push({
        skuId,
        sku: info?.sku ?? '—',
        title: info?.title ?? info?.productTitle ?? 'Nomaʼlum mahsulot',
        imageUrl: info?.imageUrl ?? null,
        ordered: b.ordered,
        orderedAmount: round(b.orderedAmount),
        sold: b.sold,
        soldAmount: round(b.soldAmount),
        canceled: b.canceled,
        returned: b.returned,
        buyoutRate: b.ordered > 0 ? pct(b.sold, b.ordered) : 0,
        avgPrice: b.sold > 0 ? round(b.soldAmount / b.sold) : 0,
        share: cur.total.soldAmount > 0 ? pct(b.soldAmount, cur.total.soldAmount) : 0,
        deltas: {
          ordered: deltaPct(b.ordered, p.ordered),
          sold: deltaPct(b.sold, p.sold),
          soldAmount: deltaPct(b.soldAmount, p.soldAmount),
          buyoutRate: deltaPct(
            b.ordered > 0 ? pct(b.sold, b.ordered) : 0,
            p.ordered > 0 ? pct(p.sold, p.ordered) : 0,
          ),
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
        ordered: cur.total.ordered,
        orderedAmount: round(cur.total.orderedAmount),
        sold: cur.total.sold,
        soldAmount: round(cur.total.soldAmount),
        canceled: cur.total.canceled,
        returned: cur.total.returned,
        canceledAmount: round(cur.total.canceledAmount),
        buyoutRate: cur.total.ordered > 0 ? pct(cur.total.sold, cur.total.ordered) : 0,
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
