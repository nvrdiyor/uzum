/**
 * Uzumning `/v1/finance/orders` javobini bizning bazamiz bilan
 * BUYURTMA-BUYURTMA solishtiradi.
 *
 *   npx tsx apps/api/src/scripts/payout-diff.ts <companyId> [YYYY-MM-DD]
 *
 * Hech narsani o'zgartirmaydi. Maqsad: saytdagi umumiy balans kabinetdagidan
 * farq qilganda, farq QAYSI buyurtmadan kelayotganini aniq ko'rsatish.
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

async function main(): Promise<void> {
  const [companyId, fromArg] = process.argv.slice(2);
  if (!companyId) {
    console.error('Foydalanish: payout-diff.ts <companyId> [from]');
    process.exitCode = 1;
    return;
  }

  const account = await prisma.uzumAccount.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  if (!account) {
    console.error('Kabinet topilmadi');
    process.exitCode = 1;
    return;
  }
  const apiKey = decryptSecret(account.apiKeyEnc).trim().replace(/^Bearer\s+/i, '');
  const store = await prisma.store.findFirst({ where: { companyId }, select: { id: true, uzumShopId: true } });
  if (!store) return;

  const from = new Date(`${fromArg ?? '2026-09-01'}T00:00:00.000Z`);
  const to = new Date();
  const http = new UzumHttp({ apiKey });

  const rows = await http.fetchAllPages(
    uzumPath('financeOrders'),
    {
      shopIds: store.uzumShopId ?? '',
      dateFrom: Math.floor(from.getTime() / 1000),
      dateTo: Math.ceil(to.getTime() / 1000),
    },
    (p) => pickList(p, ['orders', 'financeOrders']),
    { size: UZUM_PAGE_LIMITS.financeOrders ?? 100 },
  );

  /** Uzum tomoni: buyurtma bo'yicha yig'indi */
  interface Side {
    qty: number;
    sell: number;
    commission: number;
    delivery: number;
    profit: number;
    amount: number;
    returns: number;
    statuses: Set<string>;
  }
  const uzum = new Map<string, Side>();
  for (const raw of rows) {
    const r = rec(raw);
    const key = String(r.orderId ?? '');
    if (!key) continue;
    const amount = num(r.amount);
    const returns = num(r.amountReturns);
    const net = amount - returns;
    const cur =
      uzum.get(key) ??
      { qty: 0, sell: 0, commission: 0, delivery: 0, profit: 0, amount: 0, returns: 0, statuses: new Set<string>() };
    cur.amount += amount;
    cur.returns += returns;
    cur.statuses.add(String(r.status ?? '—'));
    // Uzumning o'zi qaytarilganini ayirib hisoblaydi
    if (net > 0) {
      cur.qty += net;
      cur.sell += num(r.sellPrice) * net;
      cur.commission += num(r.commission);
      cur.delivery += num(r.logisticDeliveryFee);
      cur.profit += num(r.sellerProfit);
    }
    uzum.set(key, cur);
  }

  const ours = await prisma.order.findMany({
    where: { storeId: store.id, orderedAt: { gte: from } },
    select: {
      uzumOrderId: true,
      status: true,
      items: { select: { qty: true, revenue: true, commission: true, logistics: true, payout: true, status: true } },
    },
  });
  const mine = new Map<string, { qty: number; revenue: number; commission: number; logistics: number; payout: number; status: string }>();
  for (const o of ours) {
    const agg = { qty: 0, revenue: 0, commission: 0, logistics: 0, payout: 0, status: o.status };
    for (const i of o.items) {
      if (i.status === 'canceled' || i.status === 'returned') continue;
      agg.qty += i.qty;
      agg.revenue += i.revenue;
      agg.commission += i.commission;
      agg.logistics += i.logistics;
      agg.payout += i.payout;
    }
    mine.set(o.uzumOrderId ?? '', agg);
  }

  const keys = [...new Set([...uzum.keys(), ...mine.keys()])];
  let diffPayout = 0;
  let diffSell = 0;
  const bad: string[] = [];

  for (const k of keys) {
    const u = uzum.get(k);
    const m = mine.get(k);
    const up = u?.profit ?? 0;
    const mp = m?.payout ?? 0;
    const us = u?.sell ?? 0;
    const ms = m?.revenue ?? 0;
    if (Math.abs(up - mp) < 1 && Math.abs(us - ms) < 1) continue;
    diffPayout += mp - up;
    diffSell += ms - us;
    bad.push(
      [
        `№ ${k}`,
        `Uzum: dona ${u?.qty ?? 0}/${u?.amount ?? 0} (qayt. ${u?.returns ?? 0})`,
        `sotuv ${money(us)}`,
        `payout ${money(up)}`,
        `[${[...(u?.statuses ?? [])].join(',') || '—'}]`,
        '||',
        `Biz: dona ${m?.qty ?? 0}`,
        `tushum ${money(ms)}`,
        `payout ${money(mp)}`,
        `[${m?.status ?? 'YO‘Q'}]`,
        `→ payout farqi ${money(mp - up)}`,
      ].join(' · '),
    );
  }

  const sum = (f: (s: Side) => number) => [...uzum.values()].reduce((a, s) => a + f(s), 0);
  console.log(`Buyurtmalar: Uzumda ${uzum.size}, bizda ${mine.size}\n`);
  console.log('── Yig‘indilar ──');
  console.log(`  Uzum payout:  ${money(sum((s) => s.profit))}`);
  console.log(`  Bizning payout: ${money([...mine.values()].reduce((a, m) => a + m.payout, 0))}`);
  console.log(`  Uzum sotuv:   ${money(sum((s) => s.sell))}`);
  console.log(`  Bizning tushum: ${money([...mine.values()].reduce((a, m) => a + m.revenue, 0))}`);
  console.log(`\n  FARQ payout: ${money(diffPayout)} · FARQ tushum: ${money(diffSell)}\n`);

  console.log(`── Mos kelmagan buyurtmalar (${bad.length} ta) ──`);
  for (const line of bad) console.log('  ' + line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
