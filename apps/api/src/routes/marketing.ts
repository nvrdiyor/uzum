/**
 * Marketing moduli — /api/v1/marketing
 *
 *  GET /promos      → PromosResponse (Uzum aksiyalari va ularning foydasi)
 *  GET /sku-health  → SkuHealthResponse (bloklangan, brak, yo'qolgan, qaytarishlar)
 *
 * Ma'lumot manbai — Uzum katalogi (`GET /v1/product/shop/{shopId}`). U har bir
 * SKU uchun `specialOffer` (aksiya taklifi), `blocked`, `quantityDefected`,
 * `quantityMissing` va `returnedPercentage` ni beradi. Alohida so'rov yo'q.
 *
 * Barcha pul qiymatlari UZS (butun so'm).
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  DEFAULTS,
  addDays,
  parseISODate,
  pct,
  round,
  safeDiv,
  toISODate,
  type Paginated,
  type PromoRow,
  type PromoSkuRow,
  type PromosResponse,
  type SkuHealthIssue,
  type SkuHealthResponse,
  type SkuHealthRow,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import { getStoreIds } from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Sotuv tezligini o'lchash oynasi — aksiyaga kirish qarori shunga tayanadi */
const SALES_WINDOW_DAYS = 30;
/** Shundan yuqori qaytarish ulushi muammo hisoblanadi, % */
const HIGH_RETURN_PCT = 20;

/**
 * SKU bo'yicha oxirgi 30 kunda sotilgan dona va bir donaga to'g'ri keladigan
 * haqiqiy logistika. Logistika Uzum javobida SKU darajasida berilmaydi —
 * u faqat buyurtma pozitsiyasida bo'ladi, shuning uchun realizatsiyadan olinadi.
 */
async function recentSales(storeIds: string[]): Promise<Map<string, { units: number; logistics: number }>> {
  const toExclusive = addDays(parseISODate(toISODate(new Date())), 1);
  const from = addDays(toExclusive, -SALES_WINDOW_DAYS);

  const rows = await prisma.orderItem.groupBy({
    by: ['skuId'],
    where: {
      skuId: { not: null },
      order: { storeId: { in: storeIds } },
      orderedAt: { gte: from, lt: toExclusive },
      status: { notIn: ['canceled', 'returned'] },
    },
    _sum: { qty: true, logistics: true },
  });

  const map = new Map<string, { units: number; logistics: number }>();
  for (const r of rows) {
    if (!r.skuId) continue;
    const units = r._sum.qty ?? 0;
    const logisticsTotal = r._sum.logistics ?? 0;
    map.set(r.skuId, {
      units,
      // Bir donaga to'g'ri keladigan logistika; sotuv bo'lmasa standart qiymat
      logistics: units > 0 ? round(logisticsTotal / units) : DEFAULTS.logisticsPerUnit,
    });
  }
  return map;
}

/**
 * Bir dona uchun sof foyda.
 *
 * Saqlash to'lovi QO'SHILMAYDI — u oylik ushlab turish xarajati, bitta
 * sotuvga bog'liq emas. Aksiyaga kirish qarori sotuvdan keladigan foydaga
 * qarab qabul qilinadi, saqlash esa ikkala holatda ham bir xil.
 */
function unitProfit(input: {
  price: number;
  commissionPct: number;
  logistics: number;
  purchasePrice: number;
  extraCost: number;
  taxPct: number;
}): number {
  const commission = (input.price * input.commissionPct) / 100;
  const tax = (input.price * input.taxPct) / 100;
  return round(input.price - commission - input.logistics - input.purchasePrice - input.extraCost - tax);
}

// ─────────────────────────── GET /promos ───────────────────────────

router.get(
  '/promos',
  requireFeature('promos'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    /*
     * Faqat aksiyasi bor SKU'lar. `promoOffered` — Uzum taklif qilgan,
     * `promoJoined` — sotuvchi allaqachon qo'shilgan. Nomi bo'lmasa
     * guruhlab bo'lmaydi, shuning uchun u ham shart.
     */
    const skus = await prisma.sku.findMany({
      where: {
        storeId: { in: storeIds },
        archived: false,
        promoName: { not: null },
        OR: [{ promoOffered: true }, { promoJoined: true }],
      },
      select: {
        id: true,
        sku: true,
        title: true,
        imageUrl: true,
        price: true,
        purchasePrice: true,
        extraCost: true,
        commissionPct: true,
        promoName: true,
        promoPrice: true,
        promoJoined: true,
        stocks: { orderBy: { date: 'desc' }, take: 1, select: { fbo: true, fbs: true, own: true } },
      },
    });

    const sales = await recentSales(storeIds);
    const taxPct = company.taxRate;

    const byPromo = new Map<string, PromoSkuRow[]>();

    for (const s of skus) {
      const name = s.promoName ?? '';
      if (!name) continue;

      const commissionPct = s.commissionPct > 0 ? s.commissionPct : DEFAULTS.commissionPct;
      const stat = sales.get(s.id);
      const logistics = stat?.logistics ?? DEFAULTS.logisticsPerUnit;
      const base = { commissionPct, logistics, purchasePrice: s.purchasePrice, extraCost: s.extraCost, taxPct };

      /*
       * Sotuvchi aksiyaga ALLAQACHON qo'shilgan bo'lsa Uzum `mechanicPrice: null`
       * yuboradi — chegirma `price` ning o'ziga singib ketgan, alohida aksiya
       * narxi yo'q. Bunday holda `promoPrice` 0 qoladi va interfeys uni "—"
       * deb ko'rsatadi; soxta 0% chegirma chizish chalg'itardi.
       */
      const hasPromoPrice = s.promoPrice > 0 && s.promoPrice < s.price;
      const effectivePrice = hasPromoPrice ? s.promoPrice : s.price;
      const profitNow = unitProfit({ ...base, price: s.price });
      const profitPromo = unitProfit({ ...base, price: effectivePrice });
      const snap = s.stocks[0];

      const row: PromoSkuRow = {
        skuId: s.id,
        sku: s.sku,
        title: s.title,
        imageUrl: s.imageUrl,
        joined: s.promoJoined,
        price: round(s.price),
        promoPrice: hasPromoPrice ? round(s.promoPrice) : 0,
        discountPct: hasPromoPrice ? round(pct(s.price - s.promoPrice, s.price)) : 0,
        profitNow,
        profitPromo,
        marginPromo: pct(profitPromo, effectivePrice),
        profitDelta: round(profitPromo - profitNow),
        unitsSold: stat?.units ?? 0,
        stock: (snap?.fbo ?? 0) + (snap?.fbs ?? 0) + (snap?.own ?? 0),
      };

      const list = byPromo.get(name);
      if (list) list.push(row);
      else byPromo.set(name, [row]);
    }

    const promos: PromoRow[] = [...byPromo.entries()]
      .map(([name, rows]) => {
        rows.sort((a, b) => b.profitPromo - a.profitPromo);
        const joined = rows.filter((r) => r.joined).length;
        return {
          name,
          matched: rows.length,
          joined,
          // Qatnashmagan, lekin aksiya narxida ham foydali bo'lganlar
          profitable: rows.filter((r) => !r.joined && r.profitPromo > 0).length,
          // O'rtacha chegirma faqat narxi ma'lum bo'lganlar bo'yicha
          avgDiscountPct: (() => {
            const withPrice = rows.filter((r) => r.promoPrice > 0);
            return round(safeDiv(withPrice.reduce((s, r) => s + r.discountPct, 0), withPrice.length), 1);
          })(),
          rows,
        } satisfies PromoRow;
      })
      .sort((a, b) => b.matched - a.matched);

    /*
     * Kutilayotgan qo'shimcha foyda: qatnashmagan va aksiya narxida foydali
     * SKU'lar bo'yicha, oxirgi 30 kunlik sotuv tezligida. Bu taxmin —
     * aksiya sotuvni oshirishi ham mumkin, lekin oshishini kafolatlab bo'lmaydi,
     * shuning uchun tezlik o'zgarmagan deb olinadi.
     */
    const potentialProfit = promos.reduce(
      (sum, p) =>
        sum + p.rows.filter((r) => !r.joined && r.profitPromo > 0).reduce((s, r) => s + r.profitPromo * r.unitsSold, 0),
      0,
    );

    const payload: PromosResponse = {
      promos,
      totals: {
        promos: promos.length,
        matched: promos.reduce((s, p) => s + p.matched, 0),
        joined: promos.reduce((s, p) => s + p.joined, 0),
        potentialProfit: round(potentialProfit),
      },
    };
    res.json(payload);
  }),
);

// ─────────────────────────── GET /sku-health ───────────────────────────

router.get(
  '/sku-health',
  requireFeature('sku_health'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const q = req.query as Record<string, string | undefined>;
    const onlyIssues = q.issues === '1' || q.issues === 'true';
    const pageNo = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 50) || 50));
    const search = range.search;

    const skus = await prisma.sku.findMany({
      where: {
        storeId: { in: storeIds },
        ...(search ? { OR: [{ sku: { contains: search } }, { title: { contains: search } }] } : {}),
      },
      select: {
        id: true,
        sku: true,
        title: true,
        imageUrl: true,
        price: true,
        purchasePrice: true,
        archived: true,
        blocked: true,
        blockingReason: true,
        returnedPct: true,
        qtyDefected: true,
        qtyMissing: true,
        stocks: { orderBy: { date: 'desc' }, take: 1, select: { fbo: true, fbs: true, own: true } },
      },
    });

    const all: SkuHealthRow[] = skus.map((s) => {
      const issues: SkuHealthIssue[] = [];
      if (s.blocked) issues.push('blocked');
      if (s.archived) issues.push('archived');
      if (s.returnedPct >= HIGH_RETURN_PCT) issues.push('high_returns');
      if (s.qtyDefected > 0) issues.push('defected');
      if (s.qtyMissing > 0) issues.push('missing');
      if (s.purchasePrice <= 0) issues.push('no_cost');
      if (issues.length === 0) issues.push('ok');

      const snap = s.stocks[0];
      return {
        skuId: s.id,
        sku: s.sku,
        title: s.title,
        imageUrl: s.imageUrl,
        issues,
        blocked: s.blocked,
        blockingReason: s.blockingReason,
        archived: s.archived,
        returnedPct: round(s.returnedPct, 1),
        qtyDefected: s.qtyDefected,
        qtyMissing: s.qtyMissing,
        // Yo'qotilgan qiymat tannarx bo'yicha — sotuv narxi bu tovarlar uchun amalga oshmaydi
        lossValue: round((s.qtyDefected + s.qtyMissing) * s.purchasePrice),
        stock: (snap?.fbo ?? 0) + (snap?.fbs ?? 0) + (snap?.own ?? 0),
        price: round(s.price),
      } satisfies SkuHealthRow;
    });

    const totals = {
      skus: all.length,
      blocked: all.filter((r) => r.blocked).length,
      archived: all.filter((r) => r.archived).length,
      highReturns: all.filter((r) => r.returnedPct >= HIGH_RETURN_PCT).length,
      defected: all.filter((r) => r.qtyDefected > 0).length,
      missing: all.filter((r) => r.qtyMissing > 0).length,
      lossValue: round(all.reduce((s, r) => s + r.lossValue, 0)),
      healthy: all.filter((r) => r.issues[0] === 'ok').length,
    };

    // Muammolilar tepada: avval yo'qotilgan qiymat, keyin qaytarish ulushi
    const filtered = onlyIssues ? all.filter((r) => r.issues[0] !== 'ok') : all;
    filtered.sort((a, b) => b.lossValue - a.lossValue || b.returnedPct - a.returnedPct);

    const rows: Paginated<SkuHealthRow> = paginate(filtered, pageNo, pageSize);

    const payload: SkuHealthResponse = { totals, rows };
    res.json(payload);
  }),
);

export default router;
