/**
 * Katalogdan olingan SKU maydonlarini ko'rish.
 *
 *   npx tsx apps/api/src/scripts/sku-check.ts [companyId]
 */
import { prisma } from '@savdoiq/db';

async function main(): Promise<void> {
  const companyId = process.argv[2];
  const store = await prisma.store.findFirst({
    where: companyId ? { companyId } : {},
    select: { id: true, title: true },
  });
  if (!store) {
    console.error('Do‘kon topilmadi');
    process.exitCode = 1;
    return;
  }

  const skus = await prisma.sku.findMany({
    where: { storeId: store.id },
    select: {
      sku: true,
      price: true,
      oldPrice: true,
      purchasePrice: true,
      commissionPct: true,
      storagePerItem: true,
      weightGr: true,
      volumeL: true,
      archived: true,
    },
    orderBy: { sku: 'asc' },
  });

  console.log(`Do‘kon: ${store.title} · ${skus.length} ta SKU\n`);
  for (const s of skus) {
    console.log(
      [
        s.sku.padEnd(26),
        `narx ${String(s.price).padStart(7)}`,
        `eski ${String(s.oldPrice).padStart(7)}`,
        `tannarx ${String(s.purchasePrice).padStart(6)}`,
        `komis ${String(s.commissionPct).padStart(5)}%`,
        `saqlash ${String(s.storagePerItem).padStart(5)}`,
        `${String(s.weightGr).padStart(6)} gr`,
        `${s.volumeL.toFixed(3).padStart(7)} L`,
        s.archived ? 'ARXIV' : '',
      ].join(' · '),
    );
  }

  const items = await prisma.orderItem.aggregate({
    _sum: { qty: true, returnedQty: true },
    where: { order: { storeId: store.id } },
  });
  console.log(`\nSotilgan dona: ${items._sum.qty ?? 0} · qaytarilgan: ${items._sum.returnedQty ?? 0}`);
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
