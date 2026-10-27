/**
 * "Mahsulot foydasi" — sahifa (GET /products/profit) va uning Excel eksporti
 * (GET /export/product-profit) uchun BITTA hisob.
 *
 * Ilgari hisob products.ts marshrutining ichida edi. Eksport ham shu
 * funksiyani chaqiradi: fayldagi har bir so'm sahifadagi bilan bir xil
 * bo'lsin, ikki joyda yozilgan formula vaqt o'tib ajralib ketmasin (2026-10-24).
 *
 * Foyda ta'rifi butun saytdagi bilan bir xil (services/pnl.ts): pozitsiya
 * foydasidan shu mahsulotning reklama to'lovi ayriladi. Soliq alohida
 * saqlanmaydi — u ayniyatdan tiklanadi (chiqarishga − tannarx − qo'shimcha −
 * pozitsiya foydasi), shuning uchun kartochkadagi qatorlar so'mgacha yopiladi.
 *
 * Xarid foizi Sotuv voronkasi bilan AYNAN bir xil (routes/funnel.ts `collect`):
 * pozitsiya `splitLine` (services/returns.ts) bilan yo'qotilgan va tirik
 * donaga ajraladi; tirik dona buyurtmaning `deliveredAt` i hozirdan kech
 * bo'lmasa "sotildi", aks holda "yo'lda" va foizga KIRMAYDI.
 */
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  pct,
  round,
  type ProductProfitAttention,
  type ProductProfitBuyout,
  type ProductProfitFlag,
  type ProductProfitMoney,
  type ProductProfitResponse,
  type ProductProfitRow,
  type ProductProfitVariant,
} from '@savdoiq/shared';
import type { ResolvedRange } from '../lib/period.js';
import { aggregateSalesNet, getPeriodCosts, investedIn } from './pnl.js';
import { splitLine } from './returns.js';

// ─────────────────────────── Chegaralar ───────────────────────────

/** "Past marja": sotuv bor, zarar yo'q, lekin marja shundan past (%) */
const LOW_MARGIN_PCT = 10;
/** "Iqtisodini tekshiring": marja deyarli nol (%) */
const NEAR_ZERO_MARGIN_PCT = 5;
/**
 * "Iqtisodini tekshiring" uchun kamida shuncha sotilgan dona: bitta-ikkita
 * chegirmali sotuv marjani tasodifan nolga tushirib qo'yishi mumkin.
 */
const ECONOMICS_MIN_UNITS = 5;
/** "Past xarid": do'kon o'rtachasidan kamida shuncha foiz punkti past */
const LOW_BUYOUT_GAP_PP = 10;
/**
 * "Past xarid" uchun kamida shuncha yakunlangan dona — ikki donadan bittasi
 * qaytgan tovar "50% xarid" bo'lib, haqiqiy muammolarni ro'yxatdan surib
 * chiqarmasin.
 */
const LOW_BUYOUT_MIN_COMPLETED = 5;
/** "E‘tibor talab qiladi" kartalari soni */
const ATTENTION_MAX = 4;

// ─────────────────────────── Pul yordamchilari ───────────────────────────

const MONEY_KEYS = [
  'revenue',
  'commission',
  'logistics',
  'payout',
  'cogs',
  'otherCost',
  'tax',
  'ads',
  'netProfit',
] as const satisfies readonly (keyof ProductProfitMoney)[];

const emptyMoney = (): ProductProfitMoney => ({
  revenue: 0,
  commission: 0,
  logistics: 0,
  payout: 0,
  cogs: 0,
  otherCost: 0,
  tax: 0,
  ads: 0,
  netProfit: 0,
});

const mapMoney = (m: ProductProfitMoney, f: (v: number) => number): ProductProfitMoney => {
  const out = emptyMoney();
  for (const k of MONEY_KEYS) out[k] = f(m[k]);
  return out;
};

// ─────────────────────────── Xarid foizi ───────────────────────────

/** SKU (yoki mahsulot) bo'yicha yakunlangan va yo'ldagi dona — voronkadagi `Bucket` ning dona qismi */
interface BuyoutBucket {
  sold: number;
  canceled: number;
  returned: number;
  inTransit: number;
}

const emptyBucket = (): BuyoutBucket => ({ sold: 0, canceled: 0, returned: 0, inTransit: 0 });

function addBucket(into: BuyoutBucket, b: BuyoutBucket): void {
  into.sold += b.sold;
  into.canceled += b.canceled;
  into.returned += b.returned;
  into.inTransit += b.inTransit;
}

/** routes/funnel.ts `buyoutOf` bilan bir xil: sotildi ÷ (sotildi + bekor + qaytdi); yakunlangani bo'lmasa null */
function buyoutOf(b: BuyoutBucket): ProductProfitBuyout {
  const completed = b.sold + b.canceled + b.returned;
  return {
    buyoutRate: completed > 0 ? pct(b.sold, completed) : null,
    buyoutUnits: b.sold,
    completedUnits: completed,
    transitUnits: b.inTransit,
  };
}

/** Xarid foizi do'kon o'rtachasidan necha p.p. past; "Past xarid" emas bo'lsa null */
function buyoutGap(r: ProductProfitBuyout, storeRate: number | null): number | null {
  if (storeRate === null || r.buyoutRate === null || r.completedUnits < LOW_BUYOUT_MIN_COMPLETED) return null;
  const gap = round(storeRate - r.buyoutRate, 2);
  return gap >= LOW_BUYOUT_GAP_PP ? gap : null;
}

/**
 * Muammo belgilari — mahsulot va uning variantlari uchun BITTA qoida. Saytdagi
 * bo'limlar, variantlar ro'yxatidagi rang va Excel'dagi "Muammo" ustuni shundan:
 * chegara bir joyda o'zgarsa, hammasi birga o'zgaradi.
 */
function flagsFor(
  x: ProductProfitBuyout & { netProfit: number; units: number; margin: number },
  noCost: boolean,
  storeRate: number | null,
): ProductProfitFlag[] {
  const flags: ProductProfitFlag[] = [];
  if (x.netProfit < 0) flags.push('loss');
  else if (x.units > 0 && x.margin < LOW_MARGIN_PCT) flags.push('lowMargin');
  if (noCost) flags.push('noCost');
  if (buyoutGap(x, storeRate) !== null) flags.push('lowBuyout');
  return flags;
}

/** Sotilgan, lekin tannarxi kiritilmagan (cogs = 0) */
const missingCost = (v: { units: number; cogs: number }): boolean => v.units > 0 && v.cogs <= 0;

/**
 * Variant nomi (rang, o'lcham) — routes/planner.ts `variantOf` bilan bir xil
 * qoida: SKU nomi mahsulot nomini takrorlasa ("Naushnik — Qora"), faqat farq
 * qiladigan qismi qoladi. Takrorlasa-yu farqi bo'lmasa — null.
 */
function variantOf(skuTitle: string, productTitle: string): string | null {
  const sku = skuTitle.trim();
  const product = productTitle.trim();
  if (!sku || sku === product) return null;
  if (product && sku.startsWith(product)) {
    return sku.slice(product.length).replace(/^[\s—–\-·:,|/]+/, '').trim() || null;
  }
  return sku;
}

/** Davrdagi pozitsiyadan kerakli maydonlar: buyurtma sanog'i va xarid foizi */
const ITEM_SELECT = {
  skuId: true,
  orderId: true,
  qty: true,
  returnedQty: true,
  sellPrice: true,
  revenue: true,
  status: true,
  returnedAt: true,
  // Xaridor qabul qilgan sana — "sotildi" va "yo'lda" shu bilan ajraladi (voronka bilan bir xil)
  order: { select: { deliveredAt: true } },
} as const satisfies Prisma.OrderItemSelect;

type Item = Prisma.OrderItemGetPayload<{ select: typeof ITEM_SELECT }>;

// ─────────────────────────── Asosiy hisob ───────────────────────────

/**
 * Har bir mahsulot qancha pul qoldirdi: tushum → Uzum to'laydigani → sof foyda,
 * jami va bir dona hisobida; SKU variantlari, xarid foizi, muammo belgilari
 * va "E‘tibor talab qiladi" kartalari bilan.
 */
export async function buildProductProfit(
  company: { id: string; currency: string },
  range: ResolvedRange,
  storeIds: string[],
): Promise<ProductProfitResponse> {
  const [sales, costs, items] = await Promise.all([
    aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
    getPeriodCosts(company.id, storeIds, range.from, range.toExclusive, range.storeId),
    // Davrdagi BARCHA pozitsiyalar: tirik satrlar — buyurtma sanog'i, bekor/qaytganlar — xarid foizi
    storeIds.length
      ? prisma.orderItem.findMany({
          where: { orderedAt: { gte: range.from, lt: range.toExclusive }, order: { storeId: { in: storeIds } } },
          select: ITEM_SELECT,
        })
      : Promise.resolve([] as Item[]),
  ]);

  const asOf = Date.now();
  const buckets = new Map<string, BuyoutBucket>();
  /*
   * Buyurtmalar soni mahsulot bo'yicha ANIQ bo'lsin: bitta buyurtmada ikki
   * rang bo'lsa ikki marta sanalmaydi. Tirik satr — bekor/qaytmagan, donasi bor.
   */
  const liveLines: { skuId: string; orderId: string }[] = [];
  for (const it of items) {
    if (!it.skuId) continue;
    if (it.status !== 'canceled' && it.status !== 'returned' && !it.returnedAt && it.qty > 0) {
      liveLines.push({ skuId: it.skuId, orderId: it.orderId });
    }
    const s = splitLine(it);
    const b = buckets.get(it.skuId) ?? emptyBucket();
    if (s.kind === 'canceled') b.canceled += s.lost;
    else if (s.kind === 'returned') b.returned += s.lost;
    // Kelajakdagi `deliveredAt` (demo ma'lumotda bor) hali yo'lda — voronka bilan bir xil
    const deliveredAt = it.order.deliveredAt;
    if (deliveredAt !== null && deliveredAt.getTime() <= asOf) b.sold += s.live;
    else b.inTransit += s.live;
    buckets.set(it.skuId, b);
  }

  /*
   * SKU ma'lumoti katalogdan EMAS, sotuvi bor SKU'lardan to'g'ridan-to'g'ri.
   * Katalog yashirilgan va arxivlangan mahsulotlarni chiqarib tashlaydi —
   * birinchi versiyada shu sabab sotuvchi yashirgan ikki mahsulotning pullari
   * sahifadan tushib qoldi va yig'indi paneldagi sof foydadan 403 330 kam
   * chiqdi. Pul yashirilgan tovardan kelgan bo'lsa ham — u pul.
   */
  const skuIds = [...new Set([...sales.keys(), ...buckets.keys()])];
  const skuRows = skuIds.length
    ? await prisma.sku.findMany({
        where: { id: { in: skuIds } },
        select: {
          id: true,
          sku: true,
          title: true,
          imageUrl: true,
          // Sahifa jadvalni o'zi qidiradi — shtrix-kod va Uzum ID bo'yicha ham topsin (shared search.ts)
          barcode: true,
          uzumSkuId: true,
          productId: true,
          product: { select: { title: true, category: true, imageUrl: true, hidden: true, uzumProductId: true } },
        },
      })
    : [];
  const skuInfo = new Map(skuRows.map((s) => [s.id, s]));
  const productIds = [...new Set(skuRows.map((s) => s.productId))];
  const skuCounts = productIds.length
    ? await prisma.sku.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { _all: true } })
    : [];
  const skuCount = new Map(skuCounts.map((g) => [g.productId, g._count._all]));

  const ordersOf = new Map<string, Set<string>>();
  for (const line of liveLines) {
    const info = skuInfo.get(line.skuId);
    if (!info) continue;
    const set = ordersOf.get(info.productId) ?? new Set<string>();
    set.add(line.orderId);
    ordersOf.set(info.productId, set);
  }

  interface SkuPart {
    variant: ProductProfitVariant;
    money: ProductProfitMoney;
    returns: number;
    bucket: BuyoutBucket;
  }
  interface ProductAgg {
    title: string;
    category: string | null;
    hidden: boolean;
    image: string | null;
    uzumProductId: string | null;
    skus: SkuPart[];
  }
  const byProduct = new Map<string, ProductAgg>();
  let attributedAds = 0;
  for (const [skuId, agg] of sales) {
    const info = skuInfo.get(skuId);
    if (!info) continue;
    attributedAds += agg.adFee;
    // Pozitsiya foydasi (reklamagacha) = to'lov − tannarx − qo'shimcha − soliq
    const itemProfit = agg.netProfit + agg.adFee;
    /*
     * SKU summalari o'zi yaxlitlanadi, mahsulotniki — SKU'larniki yig'indisi:
     * qator ochilganda variantlar mahsulot qatoriga so'mgacha teng chiqsin,
     * Excel'dagi ikki varaqning JAMI qatorlari ham.
     */
    const money = mapMoney(
      {
        revenue: agg.revenue,
        commission: agg.commission,
        logistics: agg.logistics,
        payout: agg.payout,
        cogs: agg.cogs,
        otherCost: agg.otherCost,
        tax: agg.payout - agg.cogs - agg.otherCost - itemProfit,
        ads: agg.adFee,
        netProfit: agg.netProfit,
      },
      round,
    );
    const bucket = buckets.get(skuId) ?? emptyBucket();
    const title = info.title || info.product.title;
    const cur: ProductAgg = byProduct.get(info.productId) ?? {
      title: info.product.title,
      category: info.product.category,
      hidden: info.product.hidden,
      image: info.product.imageUrl,
      uzumProductId: info.product.uzumProductId,
      skus: [],
    };
    cur.skus.push({
      money,
      returns: agg.returns,
      bucket,
      variant: {
        skuId,
        sku: info.sku,
        title,
        variant: variantOf(title, info.product.title),
        units: agg.units,
        revenue: money.revenue,
        cogs: money.cogs,
        netProfit: money.netProfit,
        perUnitProfit: agg.units > 0 ? round(money.netProfit / agg.units) : 0,
        margin: pct(money.netProfit, money.revenue),
        ...buyoutOf(bucket),
        // Do'kon o'rtachasi ma'lum bo'lgach to'ldiriladi (pastda)
        flags: [],
        barcode: info.barcode,
        uzumSkuId: info.uzumSkuId,
      },
    });
    cur.image ??= info.imageUrl;
    byProduct.set(info.productId, cur);
  }

  const base = [...byProduct.entries()]
    .map(([productId, p]) => {
      const money = emptyMoney();
      const bucket = emptyBucket();
      let units = 0;
      let returns = 0;
      for (const s of p.skus) {
        for (const k of MONEY_KEYS) money[k] += s.money[k];
        addBucket(bucket, s.bucket);
        units += s.variant.units;
        returns += s.returns;
      }
      const variants = p.skus
        .map((s) => s.variant)
        .sort((a, b) => b.netProfit - a.netProfit || b.units - a.units || a.sku.localeCompare(b.sku));
      return { productId, p, money, bucket, units, returns, variants };
    })
    .filter((x) => x.units > 0 || x.money.ads > 0);

  const rows: ProductProfitRow[] = base
    .map(({ productId, p, money, bucket, units, returns, variants }) => ({
      productId,
      uzumProductId: p.uzumProductId,
      title: p.title,
      category: p.category,
      imageUrl: p.image,
      hidden: p.hidden,
      skuCount: skuCount.get(productId) ?? 1,
      units,
      orders: ordersOf.get(productId)?.size ?? 0,
      returns,
      ...money,
      margin: pct(money.netProfit, money.revenue),
      roi: pct(money.netProfit, investedIn(money.cogs, money.otherCost)),
      perUnit: units > 0 ? mapMoney(money, (v) => round(v / units)) : emptyMoney(),
      ...buyoutOf(bucket),
      flags: [] as ProductProfitFlag[],
      variants,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);

  const total = emptyMoney();
  for (const r of rows) for (const k of MONEY_KEYS) total[k] += r[k];
  const totalBucket = emptyBucket();
  for (const x of base) addBucket(totalBucket, x.bucket);

  const totals: ProductProfitResponse['totals'] = {
    ...mapMoney(total, round),
    units: rows.reduce((s, r) => s + r.units, 0),
    // Do'kon bo'yicha tirik buyurtmalar (bir buyurtmada ikki mahsulot bo'lsa bir marta)
    orders: new Set(liveLines.map((l) => l.orderId)).size,
    products: rows.length,
    margin: pct(total.netProfit, total.revenue),
    roi: pct(total.netProfit, investedIn(total.cogs, total.otherCost)),
    /*
     * "Do'kon o'rtachasi" — jadvaldagi mahsulotlar bo'yicha, voronka bilan bir
     * xil ta'rifda. Davrda bitta ham donasi sotilmagan (hammasi bekor/qaytgan)
     * mahsulot jadvalda yo'q — u o'rtachaga ham kirmaydi, aks holda jami
     * qatoridagi foiz bilan "o'rtacha" ikki xil son bo'lib chiqardi.
     */
    ...buyoutOf(totalBucket),
  };

  // Belgilar bitta joyda — tablar, ularning sanog'i, eksport va kartalar shundan
  for (const r of rows) {
    for (const v of r.variants) v.flags = flagsFor(v, missingCost(v), totals.buyoutRate);
    r.flags = flagsFor(r, r.variants.some(missingCost), totals.buyoutRate);
  }

  return {
    period: range.period,
    currency: company.currency,
    totals,
    rows,
    unallocated: round(Math.max(0, costs.total - attributedAds)),
    attention: buildAttention(rows, totals),
    thresholds: {
      lowMargin: LOW_MARGIN_PCT,
      nearZeroMargin: NEAR_ZERO_MARGIN_PCT,
      buyoutGap: LOW_BUYOUT_GAP_PP,
      buyoutMinCompleted: LOW_BUYOUT_MIN_COMPLETED,
    },
  };
}

// ─────────────────────────── "E‘tibor talab qiladi" ───────────────────────────

/** Pul ta'siri teng bo'lsa — avval muammo, keyin yutuq (tartib har so'rovda bir xil bo'lsin) */
const KIND_RANK: Record<ProductProfitAttention['kind'], number> = {
  lossMaker: 0,
  noCost: 1,
  lowBuyout: 2,
  checkEconomics: 3,
  profitLeader: 4,
  topSeller: 5,
};

/**
 * Kartalar: har tur bo'yicha nomzodlar, keyin pul ta'siri (so'm) bo'yicha
 * eng kattalari — har biri boshqa tur va boshqa mahsulot. Bitta mahsulot
 * ham zararda, ham tannarxsiz bo'lsa, ikki karta bir xil tovarni takrorlab,
 * qolgan muammolarni siqib chiqarardi.
 *
 * Pul ta'siri — xavf ostidagi summa:
 *   zarar               — zarar summasi;
 *   tannarxsiz          — taxminan yashirin tannarx: tannarxsiz tushum ×
 *                         tannarxi bor sotuvlardagi tannarx ulushi (foyda
 *                         shunchaga oshib ko'rinadi). Hech bir sotuvda tannarx
 *                         bo'lmasa — butun tushum (hech narsa ma'lum emas);
 *   past xarid          — do'kon o'rtachasidan ortiq yo'qotilgan dona × o'rtacha narx;
 *   iqtisodini tekshiring — do'kon o'rtacha marjasida qancha ko'p qolardi;
 *   foyda yetakchisi    — sof foydasi; eng ko'p sotilgan — sof foydasi
 *                         (tannarxsiz bo'lsa 0: u foyda haqiqiy emas).
 */
function buildAttention(rows: ProductProfitRow[], totals: ProductProfitResponse['totals']): ProductProfitAttention[] {
  const pool: ProductProfitAttention[] = [];
  const has = (r: ProductProfitRow, flag: ProductProfitFlag) => r.flags.includes(flag);
  // Yetakchi va eng ko'p sotilgan — solishtirish mumkin bo'lsagina (kamida ikki mahsulot)
  const comparable = rows.length >= 2;

  // ── Foyda yetakchisi: tannarxi to'liq (foydasi haqiqiy), reklama ayirilgan ──
  const verified = rows.filter((r) => r.netProfit > 0 && r.cogs > 0 && !has(r, 'noCost'));
  if (comparable && verified.length > 0) {
    const top = verified.reduce((a, b) => (b.netProfit > a.netProfit ? b : a));
    const positive = rows.reduce((s, r) => s + Math.max(0, r.netProfit), 0);
    pool.push({
      kind: 'profitLeader',
      productId: top.productId,
      values: { netProfit: top.netProfit, margin: top.margin, share: pct(top.netProfit, positive), impact: top.netProfit },
    });
  }

  // ── Eng ko'p sotilgan: dona bo'yicha, teng bo'lsa tushum ──
  const selling = rows.filter((r) => r.units > 0);
  if (comparable && selling.length > 0) {
    const top = selling.reduce((a, b) => (b.units > a.units || (b.units === a.units && b.revenue > a.revenue) ? b : a));
    pool.push({
      kind: 'topSeller',
      productId: top.productId,
      values: {
        units: top.units,
        share: pct(top.units, totals.units),
        perUnit: top.perUnit.netProfit,
        impact: has(top, 'noCost') ? 0 : Math.max(0, top.netProfit),
      },
    });
  }

  // ── Past xarid ──
  const storeRate = totals.buyoutRate;
  const lowBuyout = rows.filter((r) => has(r, 'lowBuyout'));
  for (const r of lowBuyout) {
    if (storeRate === null || r.buyoutRate === null) continue;
    const gap = round(storeRate - r.buyoutRate, 2);
    const avgPrice = r.units > 0 ? r.revenue / r.units : 0;
    pool.push({
      kind: 'lowBuyout',
      productId: r.productId,
      values: {
        rate: r.buyoutRate,
        storeRate,
        gap,
        lost: r.completedUnits - r.buyoutUnits,
        more: lowBuyout.length - 1,
        impact: round((gap / 100) * r.completedUnits * avgPrice),
      },
    });
  }

  // ── Iqtisodini tekshiring: sotuv bor, zarar yo'q, marja deyarli nol ──
  const thin = rows.filter(
    (r) => r.units >= ECONOMICS_MIN_UNITS && r.netProfit >= 0 && r.margin < NEAR_ZERO_MARGIN_PCT,
  );
  for (const r of thin) {
    pool.push({
      kind: 'checkEconomics',
      productId: r.productId,
      values: {
        margin: r.margin,
        revenue: r.revenue,
        perUnit: r.perUnit.netProfit,
        more: thin.length - 1,
        impact: round((r.revenue * Math.max(totals.margin - r.margin, NEAR_ZERO_MARGIN_PCT - r.margin)) / 100),
      },
    });
  }

  // ── Tannarxsiz sotuv ──
  let costedCogs = 0;
  let costedRevenue = 0;
  for (const r of rows) {
    for (const v of r.variants) {
      if (v.units > 0 && v.cogs > 0) {
        costedCogs += v.cogs;
        costedRevenue += v.revenue;
      }
    }
  }
  const cogsShare = costedRevenue > 0 ? costedCogs / costedRevenue : 1;
  const noCost = rows.filter((r) => has(r, 'noCost'));
  for (const r of noCost) {
    const missing = r.variants.filter(missingCost);
    const revenue = missing.reduce((s, v) => s + v.revenue, 0);
    pool.push({
      kind: 'noCost',
      productId: r.productId,
      values: {
        units: missing.reduce((s, v) => s + v.units, 0),
        revenue,
        skus: missing.length,
        more: noCost.length - 1,
        impact: round(revenue * cogsShare),
      },
    });
  }

  // ── Zarar ──
  const losing = rows.filter((r) => has(r, 'loss'));
  for (const r of losing) {
    pool.push({
      kind: 'lossMaker',
      productId: r.productId,
      values: {
        netProfit: r.netProfit,
        perUnit: r.units > 0 ? r.perUnit.netProfit : 0,
        ads: r.ads,
        more: losing.length - 1,
        impact: -r.netProfit,
      },
    });
  }

  pool.sort(
    (a, b) =>
      b.values.impact - a.values.impact ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.productId.localeCompare(b.productId),
  );
  const out: ProductProfitAttention[] = [];
  const kinds = new Set<string>();
  const used = new Set<string>();
  for (const card of pool) {
    if (out.length >= ATTENTION_MAX) break;
    if (kinds.has(card.kind) || used.has(card.productId)) continue;
    out.push(card);
    kinds.add(card.kind);
    used.add(card.productId);
  }
  return out;
}
