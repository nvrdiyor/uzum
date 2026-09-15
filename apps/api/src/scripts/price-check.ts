/**
 * Narxlarni uch manbada solishtirish: Uzum katalogi, Uzum moliya buyurtmalari
 * va bizning bazamiz.
 *
 *   npx tsx apps/api/src/scripts/price-check.ts <companyId>
 *
 * Hech narsani o'zgartirmaydi.
 */
import { prisma } from '@savdoiq/db';
import { decryptSecret } from '../lib/crypto.js';
import { UzumHttp } from '../uzum/http.js';
import { UZUM_PAGE_LIMITS, uzumPath } from '../uzum/endpoints.js';

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

function pickList(payload: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const r = rec(payload);
  for (const key of [...keys, 'payload', 'items', 'content', 'list', 'data', 'result', 'rows']) {
    const value = r[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const inner = rec(value);
      for (const k of ['items', 'content', 'list', 'rows']) {
        if (Array.isArray(inner[k])) return inner[k] as unknown[];
      }
    }
  }
  const arrays = Object.values(r).filter(Array.isArray) as unknown[][];
  return arrays.length === 1 ? arrays[0] : [];
}

/** Obyekt ichidagi narxga o'xshash barcha maydonlarni topadi */
function priceFields(obj: unknown, prefix = '', depth = 0): [string, number][] {
  if (depth > 3) return [];
  const out: [string, number][] = [];
  const r = rec(obj);
  for (const [k, v] of Object.entries(r)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' && /price|amount|sum|cost|profit|commission|fee|discount/i.test(k)) {
      out.push([path, v]);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...priceFields(v, path, depth + 1));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const companyId = process.argv[2];
  const account = await prisma.uzumAccount.findFirst({
    where: companyId ? { companyId } : {},
    orderBy: { createdAt: 'desc' },
  });
  if (!account) {
    console.error('Kabinet topilmadi');
    process.exitCode = 1;
    return;
  }
  const cid = account.companyId;
  const apiKey = decryptSecret(account.apiKeyEnc).trim().replace(/^Bearer\s+/i, '');
  const store = await prisma.store.findFirst({
    where: { companyId: cid },
    select: { id: true, uzumShopId: true },
  });
  const shopId = store?.uzumShopId ?? '';
  const http = new UzumHttp({ apiKey });

  // ── 1. Katalog ──
  const catalogue = await http.fetchAllPages(
    uzumPath('products', { shopId }),
    {},
    (p) => pickList(p, ['products', 'productList', 'skuList']),
    { size: UZUM_PAGE_LIMITS.default },
  ).catch((e) => {
    console.error('katalog xato:', e instanceof Error ? e.message : e);
    return [] as unknown[];
  });

  console.log(`\n══ KATALOG (${catalogue.length} satr) ══`);
  if (catalogue[0]) {
    console.log('Birinchi satrdagi narx maydonlari:');
    for (const [k, v] of priceFields(catalogue[0])) console.log(`  ${k.padEnd(34)} ${money(v)}`);
  }

  // ── 2. Moliya buyurtmalari ──
  const from = new Date('2026-08-01T00:00:00.000Z');
  const to = new Date();
  const orders = await http.fetchAllPages(
    uzumPath('financeOrders'),
    {
      shopIds: shopId,
      dateFrom: Math.floor(from.getTime() / 1000),
      dateTo: Math.ceil(to.getTime() / 1000),
    },
    (p) => pickList(p, ['orders']),
    { size: UZUM_PAGE_LIMITS.financeOrders ?? 100 },
  );

  console.log(`\n══ MOLIYA BUYURTMALARI (${orders.length} satr) ══`);
  if (orders[0]) {
    console.log('Birinchi satrdagi narx maydonlari:');
    for (const [k, v] of priceFields(orders[0])) console.log(`  ${k.padEnd(34)} ${money(v)}`);
  }
  console.log('\nSKU kesimida (Uzum):');
  const bySku = new Map<string, { qty: number; sell: number; purchase: number; profit: number }>();
  for (const raw of orders) {
    const r = rec(raw);
    const sku = String(r.skuTitle ?? r.sku ?? '—');
    const qty = num(r.amount) - num(r.amountReturns);
    if (qty <= 0) continue;
    const cur = bySku.get(sku) ?? { qty: 0, sell: 0, purchase: 0, profit: 0 };
    cur.qty += qty;
    cur.sell += num(r.sellPrice) * qty;
    cur.purchase += num(r.purchasePrice) * qty;
    cur.profit += num(r.sellerProfit);
    bySku.set(sku, cur);
  }
  for (const [sku, v] of bySku)
    console.log(
      `  ${sku.padEnd(30)} ${String(v.qty).padStart(3)} dona · sotuv ${money(v.sell / v.qty).padStart(9)} · tannarx ${money(
        v.purchase / v.qty,
      ).padStart(9)}`,
    );

  // ── 3. Bizning bazamiz ──
  console.log('\n══ BIZNING BAZA ══');
  const skus = await prisma.sku.findMany({
    where: { storeId: store?.id },
    select: { sku: true, title: true, price: true, oldPrice: true, purchasePrice: true },
    orderBy: { sku: 'asc' },
  });
  console.log('Sku.price (katalogdan):');
  for (const s of skus)
    console.log(
      `  ${s.sku.padEnd(30)} narx ${money(s.price).padStart(9)} · eski ${money(s.oldPrice).padStart(9)} · tannarx ${money(
        s.purchasePrice,
      ).padStart(9)}   ${s.title.slice(0, 32)}`,
    );

  const items = await prisma.orderItem.groupBy({
    by: ['skuId'],
    _sum: { qty: true, revenue: true },
    where: { status: { notIn: ['canceled'] }, order: { storeId: store?.id } },
  });
  const byId = new Map(
    (await prisma.sku.findMany({ where: { storeId: store?.id }, select: { id: true, sku: true } })).map((s) => [
      s.id,
      s.sku,
    ]),
  );
  console.log('\nOrderItem bo‘yicha o‘rtacha sotuv narxi (revenue/qty):');
  for (const g of items) {
    const qty = g._sum.qty ?? 0;
    if (qty <= 0) continue;
    console.log(
      `  ${String(byId.get(g.skuId ?? '') ?? g.skuId).padEnd(30)} ${String(qty).padStart(3)} dona · ${money(
        (g._sum.revenue ?? 0) / qty,
      ).padStart(9)}`,
    );
  }
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
