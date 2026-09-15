/**
 * Uzumdan kelgan ma'lumotlarni qaytadan yig'ish (server konsolidan).
 *
 *   npx tsx apps/api/src/scripts/resync.ts [telegramId|companyId] [--expenses]
 *
 * `--expenses` bayrog'i bilan avval Uzumdan import qilingan xarajat yozuvlari
 * o'chiriladi. Bu kerak bo'ladigan holat: import qoidasi o'zgargan (masalan,
 * buyurtmaga bog'langan yetkazish to'lovlari endi yozilmaydi) va eski satrlar
 * yangi qoidaga mos kelmaydi. Qo'lda kiritilgan xarajatlarga tegilmaydi.
 */
import { prisma } from '@savdoiq/db';

async function main(): Promise<void> {
  const key = process.argv[2];
  const dropExpenses = process.argv.includes('--expenses');

  const company = key
    ? await prisma.company.findFirst({
        where: {
          OR: [{ id: key }, { memberships: { some: { user: { telegramId: key } } } }],
        },
        select: { id: true, name: true },
      })
    : await prisma.company.findFirst({ select: { id: true, name: true } });

  if (!company) {
    console.error('Kompaniya topilmadi');
    process.exitCode = 1;
    return;
  }

  const stores = await prisma.store.findMany({ where: { companyId: company.id }, select: { id: true } });
  if (stores.length === 0) {
    console.error('Do‘kon ulanmagan');
    process.exitCode = 1;
    return;
  }

  console.log(`Kompaniya: ${company.name} (${company.id}), do‘konlar: ${stores.length}`);

  if (dropExpenses) {
    const del = await prisma.expense.deleteMany({ where: { companyId: company.id, source: 'uzum' } });
    console.log(`Uzumdan import qilingan xarajatlar o‘chirildi: ${del.count} ta`);
  }

  // Navbatdagi tugallanmagan ishlarni tozalaymiz — yangi to'liq sinxron qo'yiladi
  await prisma.syncJob.updateMany({
    where: { companyId: company.id, status: { in: ['queued', 'running'] } },
    data: { status: 'failed', error: 'resync skripti bilan almashtirildi', finishedAt: new Date() },
  });

  const job = await prisma.syncJob.create({
    data: { companyId: company.id, type: 'full', status: 'queued', progress: 0, step: 'Navbatda' },
  });

  console.log(`To‘liq sinxronizatsiya navbatga qo‘yildi: ${job.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
