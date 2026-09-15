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

const BASE = 'https://api-seller.uzum.uz/api/seller-openapi';

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

async function fetchAll(path: string, apiKey: string, params: Record<string, string>): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 0; page < 50; page += 1) {
    const qs = new URLSearchParams({ ...params, page: String(page), size: '100' });
    const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      console.error(`${path} → HTTP ${res.status}`);
      break;
    }
    const body = (await res.json()) as Record<string, unknown>;
    const list =
      (body.payload as unknown[]) ??
      (body.orders as unknown[]) ??
      (body.expenses as unknown[]) ??
      (body.payments as unknown[]) ??
      (body.paymentInfoList as unknown[]) ??
      (Array.isArray(body) ? (body as unknown[]) : []);
    const arr = Array.isArray(list)
      ? list
      : ((list as Record<string, unknown> | null)?.items as unknown[]) ?? [];
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < 100) break;
  }
  return out;
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
  const p = {
    shopIds: shopId,
    dateFrom: String(Math.floor(from.getTime() / 1000)),
    dateTo: String(Math.ceil(to.getTime() / 1000)),
  };

  const [orders, expenses] = await Promise.all([
    fetchAll('/v1/finance/orders', apiKey, p),
    fetchAll('/v1/finance/expenses', apiKey, p),
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
    const r = raw as Record<string, unknown>;
    const amount = num(r.amount);
    const returns = num(r.amountReturns);
    const net = amount - returns;
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
    console.log(`    ${s.padEnd(22)} ${String(v.n).padStart(5)} dona · ${money(v.profit).padStart(12)}`);

  console.log('\n── Xarajatlar (finance/expenses) ──');
  let expTotal = 0;
  const byCode = new Map<string, { n: number; sum: number; sample: string }>();
  for (const raw of expenses) {
    const r = raw as Record<string, unknown>;
    const price = num(r.paymentPrice ?? r.amount ?? r.price);
    const kind = String(r.type ?? '').toUpperCase();
    const signed = kind === 'INCOME' ? -Math.abs(price) : Math.abs(price);
    expTotal += signed;
    const code = String(r.code ?? r.source ?? '—');
    const cur = byCode.get(code) ?? { n: 0, sum: 0, sample: String(r.name ?? '') };
    cur.n += 1;
    cur.sum += signed;
    byCode.set(code, cur);
  }
  for (const [code, v] of [...byCode.entries()].sort((a, b) => b[1].sum - a[1].sum))
    console.log(`  ${code.padEnd(28)} ${String(v.n).padStart(4)} ta · ${money(v.sum).padStart(12)}   ${v.sample.slice(0, 48)}`);
  console.log(`  ${'JAMI'.padEnd(28)} ${String(expenses.length).padStart(4)} ta · ${money(expTotal).padStart(12)}`);

  console.log('\n── Balans variantlari ──');
  console.log(`  A) yechib olish uchun − jami xarajat:            ${money(profit - expTotal)}`);
  console.log(`  B) sotuv − komissiya − jami xarajat:             ${money(sell - commission - expTotal)}`);
  console.log(`  C) yechib olish uchun + yetkazish − jami xarajat: ${money(profit + deliveryFee - expTotal)}`);
  console.log('\n  Uzum kabinetidagi "Umumiy balans" bilan qaysi biri mos kelsa — o‘shasi to‘g‘ri.');

  // Xom satrlardan bittasi — maydon nomlarini tekshirish uchun
  if (orders[0]) console.log('\nBuyurtma satri namunasi:\n', JSON.stringify(orders[0], null, 2).slice(0, 900));
  if (expenses[0]) console.log('\nXarajat satri namunasi:\n', JSON.stringify(expenses[0], null, 2).slice(0, 700));
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
