/**
 * Moliya raqamlarini bazadagi ma'lumot bo'yicha tekshirish.
 *
 *   npx tsx apps/api/src/scripts/finance-check.ts <companyId>
 *
 * Uzum kabinetidagi "Umumiy balans" bilan solishtirish uchun — hech narsani
 * o'zgartirmaydi.
 */
import { prisma } from '@savdoiq/db';

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');

async function main(): Promise<void> {
  const companyId = process.argv[2];
  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } })
    : await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) {
    console.error('Kompaniya topilmadi');
    process.exitCode = 1;
    return;
  }

  const stores = await prisma.store.findMany({ where: { companyId: company.id }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);

  const job = await prisma.syncJob.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, progress: true, step: true, error: true },
  });
  console.log(`Kompaniya: ${company.name}`);
  console.log(`Oxirgi sinxron: ${job?.status} ${job?.progress}% · ${job?.step}${job?.error ? ` · ${job.error}` : ''}\n`);

  const sales = await prisma.orderItem.aggregate({
    _sum: { revenue: true, commission: true, logistics: true, payout: true, netProfit: true },
    _count: true,
    where: { status: { notIn: ['canceled', 'returned'] }, order: { storeId: { in: storeIds } } },
  });

  const bySource = await prisma.expense.groupBy({
    by: ['source', 'category'],
    _sum: { amount: true },
    _count: true,
    where: { companyId: company.id },
  });

  const storage = await prisma.storageFee.aggregate({
    _sum: { amount: true },
    where: { storeId: { in: storeIds } },
  });

  const revenue = sales._sum.revenue ?? 0;
  const commission = sales._sum.commission ?? 0;
  const logistics = sales._sum.logistics ?? 0;
  const payout = sales._sum.payout ?? 0;

  console.log('── Buyurtma satrlari ──');
  console.log(`  satrlar:            ${sales._count}`);
  console.log(`  tushum:             ${money(revenue)}`);
  console.log(`  komissiya:          ${money(commission)}`);
  console.log(`  yetkazish (satrda): ${money(logistics)}`);
  console.log(`  yechib olish uchun: ${money(payout)}`);

  console.log('\n── Xarajatlar ──');
  let uzumAll = 0;
  for (const g of bySource.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))) {
    const sum = g._sum.amount ?? 0;
    if (g.source === 'uzum' || g.source === 'uzum-payout') uzumAll += sum;
    console.log(`  ${String(g.source).padEnd(14)} ${String(g.category).padEnd(12)} ${String(g._count).padStart(3)} ta · ${money(sum).padStart(12)}`);
  }
  const storageSum = storage._sum.amount ?? 0;
  console.log(`  ${'storageFee'.padEnd(14)} ${''.padEnd(12)}     · ${money(storageSum).padStart(12)}`);

  const balance = revenue - commission - uzumAll - storageSum;
  console.log('\n── Umumiy balans ──');
  console.log(`  ${money(revenue)} − ${money(commission)} − ${money(uzumAll + storageSum)} = ${money(balance)}`);
  console.log('\n  Uzum kabinetidagi "Umumiy balans" bilan solishtiring.');
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
