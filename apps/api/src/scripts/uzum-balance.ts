/**
 * Uzum kabinetidagi "Umumiy balans" bilan solishtirish uchun xom hisob.
 *
 *   npx tsx apps/api/src/scripts/uzum-balance.ts <companyId> [YYYY-MM-DD] [YYYY-MM-DD]
 *
 * Hech narsani o'zgartirmaydi — faqat `/v1/finance/orders` va
 * `/v1/finance/expenses` javoblaridan summalarni chiqaradi, shunda saytdagi
 * raqam Uzumdagidan farq qilsa, farq qaysi moddadan ekani ko'rinadi.
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

/** Javob konvertidan ro'yxatni ajratib olish (live.ts dagi mantiq bilan bir xil) */
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

async function main(): Promise<void> {
  const [companyId, fromArg, toArg] = process.argv.slice(2);
  if (!companyId) {
    console.error('Foydalanish: uzum-balance.ts <companyId> [from] [to]');
    process.exitCode = 1;
    return;
  }

  const account = await prisma.uzumAccount.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  if (!account) {
    console.error('Kabinet topilmadi');
    process.exitCode = 1;
    return;
  }
  const apiKey = decryptSecret(account.apiKeyEnc).trim().replace(/^Bearer\s+/i, '');
  const store = await prisma.store.findFirst({ where: { companyId }, select: { uzumShopId: true } });
  const shopId = store?.uzumShopId ?? '';

  const from = new Date(`${fromArg ?? '2026-01-01'}T00:00:00.000Z`);
  const to = new Date(`${toArg ?? new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);
  const params = {
    shopIds: shopId,
    dateFrom: Math.floor(from.getTime() / 1000),
    dateTo: Math.ceil(to.getTime() / 1000),
  };

  const http = new UzumHttp({ apiKey });
  const [orders, expenses] = await Promise.all([
    http.fetchAllPages(
      uzumPath('financeOrders'),
      params,
      (p) => pickList(p, ['orders', 'financeOrders']),
      { size: UZUM_PAGE_LIMITS.financeOrders ?? 100 },
    ),
    http.fetchAllPages(
      uzumPath('financeExpenses'),
      params,
      (p) => pickList(p, ['expenses', 'payments', 'paymentInfoList']),
      { size: UZUM_PAGE_LIMITS.financeExpenses },
    ),
  ]);

  console.log(`Do‘kon ${shopId} · ${from.toISOString().slice(0, 10)} — ${to.toISOString().slice(0, 10)}`);
  console.log(`Buyurtma satrlari: ${orders.length}, xarajat satrlari: ${expenses.length}\n`);

  let sell = 0;
  let commission = 0;
  let profit = 0;
  let deliveryFee = 0;
  let qty = 0;
  const byStatus = new Map<string, { n: number; profit: number }>();

  for (const raw of orders) {
    const r = rec(raw);
    const net = num(r.amount) - num(r.amountReturns);
    if (net <= 0) continue;
    qty += net;
    sell += num(r.sellPrice) * net;
    commission += num(r.commission);
    profit += num(r.sellerProfit);
    deliveryFee += num(r.logisticDeliveryFee);
    const status = String(r.status ?? r.orderStatus ?? '—');
    const cur = byStatus.get(status) ?? { n: 0, profit: 0 };
    cur.n += net;
    cur.profit += num(r.sellerProfit);
    byStatus.set(status, cur);
  }

  console.log('── Buyurtmalar (finance/orders) ──');
  console.log(`  dona:                 ${money(qty)}`);
  console.log(`  sotuv summasi:        ${money(sell)}`);
  console.log(`  komissiya:            ${money(commission)}`);
  console.log(`  yetkazish (maydon):   ${money(deliveryFee)}`);
  console.log(`  yechib olish uchun:   ${money(profit)}`);
  console.log(`  tekshiruv (sotuv − komissiya − yetkazish): ${money(sell - commission - deliveryFee)}`);
  console.log('  status kesimida:');
  for (const [s, v] of [...byStatus.entries()].sort((a, b) => b[1].profit - a[1].profit))
    console.log(`    ${s.padEnd(24)} ${String(v.n).padStart(5)} dona · ${money(v.profit).padStart(12)}`);

  console.log('\n── Xarajatlar (finance/expenses) ──');
  let expTotal = 0;
  const byCode = new Map<string, { n: number; sum: number; sample: string }>();
  for (const raw of expenses) {
    const r = rec(raw);
    const price = num(r.paymentPrice ?? r.amount ?? r.price);
    const signed = String(r.type ?? '').toUpperCase() === 'INCOME' ? -Math.abs(price) : Math.abs(price);
    expTotal += signed;
    const code = String(r.code ?? r.source ?? '—');
    const cur = byCode.get(code) ?? { n: 0, sum: 0, sample: String(r.name ?? '') };
    cur.n += 1;
    cur.sum += signed;
    byCode.set(code, cur);
  }
  for (const [code, v] of [...byCode.entries()].sort((a, b) => b[1].sum - a[1].sum))
    console.log(
      `  ${code.padEnd(26)} ${String(v.n).padStart(4)} ta · ${money(v.sum).padStart(12)}   ${v.sample.slice(0, 44)}`,
    );
  console.log(`  ${'JAMI'.padEnd(26)} ${String(expenses.length).padStart(4)} ta · ${money(expTotal).padStart(12)}`);

  console.log('\n── Balans variantlari ──');
  console.log(`  A) yechib olish uchun − jami xarajat:             ${money(profit - expTotal)}`);
  console.log(`  B) sotuv − komissiya − jami xarajat:              ${money(sell - commission - expTotal)}`);
  console.log(`  C) yechib olish uchun + yetkazish − jami xarajat: ${money(profit + deliveryFee - expTotal)}`);
  console.log('\n  Uzum kabinetidagi "Umumiy balans" bilan qaysi biri mos kelsa — o‘shasi to‘g‘ri.');

  if (orders[0]) console.log('\nBuyurtma satri namunasi:\n', JSON.stringify(orders[0], null, 2).slice(0, 1000));
  if (expenses[0]) console.log('\nXarajat satri namunasi:\n', JSON.stringify(expenses[0], null, 2).slice(0, 700));
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
