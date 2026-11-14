/**
 * "Buyurtmada tovar bo'lmagan" eski yozuvlarini tuzatish — bir martalik (2026-11-14).
 *
 *   npx tsx apps/api/src/scripts/missing-in-order-migrate.ts <companyId> [companyId…] [--apply]
 *
 * `demo_` bilan boshlanadigan kompaniyaga tegilmaydi — faqat test bazasida `--allow-demo` bilan.
 *
 * NIMA UCHUN. Sababi "Товара не оказалось в заказе" bo'lgan pozitsiya —
 * buyurtmada tovar bo'lmagan: Uzum uni yo'qotgan, xaridor olmagan, tovar
 * omborga qaytmaydi, Uzum kompensatsiya to'laydi (shared return-cause.ts).
 * 14.11 gacha importer uni "qaytarilgan" deb yozardi (status 'returned',
 * `returnedAt` bor) va u qaytarish foizini oshirardi. Yangi import uni bekor
 * qilingan deb yozadi, lekin sinxron faqat yaqin buyurtmalarni qayta o'qiydi —
 * eski yozuvlar shu skript bilan tuzatiladi:
 *   • pozitsiya: status 'returned' → 'canceled', `returnedAt` → null
 *     (`canceledAt`, sabab va donalar o'zgarmaydi — tovar balansi ularga tayanadi);
 *   • buyurtma: holati 'returned' bo'lsa va tirik pozitsiyasi qolmagan bo'lsa —
 *     qolgan pozitsiyalaridan biri haqiqatan qaytgan bo'lsa 'returned', aks holda 'canceled'.
 * Pul summalari o'zgarmaydi: bunday pozitsiyada tushum ham, to'lov ham 0.
 *
 * Standart rejim faqat ko'rsatadi. --apply bilan yozadi: kompaniyada sinxron
 * ishlayotgan bo'lsa rad etadi, har yozuv eski qiymati o'zgarmagan bo'lsagina
 * yangilanadi, natija AuditLog'ga yoziladi (action 'maintenance.missing_in_order').
 *
 * TARTIB: avval yangi kod serverga chiqariladi, keyin skript. Eski kod yaqin
 * buyurtmalarni har sinxronda qayta yozib, "qaytarilgan"ni qaytarib qo'yardi.
 * FBO qatorlar sahifada "Uzum yo'qotgan" bo'ladi, FBS/DBS — oddiy bekor qilish.
 */
import { prisma } from '@savdoiq/db';
import { isMissingInOrder } from '@savdoiq/shared';

const USAGE = 'Foydalanish: npx tsx apps/api/src/scripts/missing-in-order-migrate.ts <companyId> [companyId…] [--apply] [--allow-demo]';
const FLAGS = new Set(['--apply', '--allow-demo']);
const LIVE_STATUSES = new Set(['new', 'processing', 'delivered']);

const day = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : '—');

async function busyJob(companyId: string) {
  return prisma.syncJob.findFirst({
    where: { companyId, status: { in: ['queued', 'running'] } },
    select: { id: true, type: true, status: true },
  });
}

interface ItemFix {
  itemId: string;
  orderId: string;
  uzumOrderId: string | null;
  store: string;
  /** FBO — "Uzum yo'qotgan" (kompensatsiya da'vosi), FBS/DBS — oddiy bekor qilish */
  scheme: string;
  sku: string | null;
  returnedQty: number;
  cause: string;
  returnedAt: Date | null;
}

interface OrderFix {
  orderId: string;
  uzumOrderId: string | null;
  from: string;
  to: string;
}

async function migrateCompany(companyId: string, opts: { apply: boolean; allowDemo: boolean }): Promise<void> {
  console.log(`\n═══ ${companyId}`);
  if (companyId.startsWith('demo_') && !opts.allowDemo) {
    console.log('Demo kompaniya — tegilmaydi');
    return;
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) {
    console.error('Kompaniya topilmadi');
    process.exitCode = 1;
    return;
  }
  console.log(`Kompaniya: ${company.name}`);

  // Sabab matni Postgres'da ham, SQLite'da ham bir xil tekshirilsin — bazadan keng olib, shu yerda aniq qoida bilan
  const rows = await prisma.orderItem.findMany({
    where: { status: 'returned', returnCause: { not: null }, order: { store: { companyId } } },
    select: {
      id: true,
      orderId: true,
      skuCode: true,
      returnedQty: true,
      returnCause: true,
      returnedAt: true,
      order: { select: { uzumOrderId: true, status: true, deliveryType: true, store: { select: { title: true } } } },
    },
    orderBy: { orderedAt: 'asc' },
  });
  const items: ItemFix[] = rows
    .filter((r) => isMissingInOrder(r.returnCause))
    .map((r) => ({
      itemId: r.id,
      orderId: r.orderId,
      uzumOrderId: r.order.uzumOrderId,
      store: r.order.store.title,
      scheme: r.order.deliveryType,
      sku: r.skuCode,
      returnedQty: r.returnedQty,
      cause: r.returnCause ?? '',
      returnedAt: r.returnedAt,
    }));

  // Buyurtma holati — tuzatilgan pozitsiyalar bilan qayta hisoblanadi
  const fixedIds = new Set(items.map((i) => i.itemId));
  const orderIds = [...new Set(items.map((i) => i.orderId))];
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, uzumOrderId: true, status: true, items: { select: { id: true, status: true } } },
  });
  const orderFixes: OrderFix[] = [];
  for (const o of orders) {
    if (o.status !== 'returned') continue;
    const statuses = o.items.map((it) => (fixedIds.has(it.id) ? 'canceled' : it.status));
    if (statuses.some((s) => LIVE_STATUSES.has(s))) continue;
    const to = statuses.includes('returned') ? 'returned' : 'canceled';
    if (to !== o.status) orderFixes.push({ orderId: o.id, uzumOrderId: o.uzumOrderId, from: o.status, to });
  }

  console.log(`"Qaytarilgan" deb yozilgan, buyurtmada tovar bo'lmagan pozitsiyalar: ${items.length} ta`);
  for (const i of items) {
    const as = i.scheme === 'FBO' ? 'Uzum yo‘qotgan' : `oddiy bekor qilish (${i.scheme})`;
    console.log(
      `  №${i.uzumOrderId ?? '?'} ${i.store} · ${i.sku ?? '—'} · ${i.returnedQty} dona · returnedAt ${day(i.returnedAt)} → bekor qilingan, ${as} — «${i.cause}»`,
    );
  }
  console.log(`Holati o'zgaradigan buyurtmalar: ${orderFixes.length} ta`);
  for (const o of orderFixes) console.log(`  №${o.uzumOrderId ?? '?'}: ${o.from} → ${o.to}`);

  if (!opts.apply) {
    console.log('Faqat ko‘rsatildi — yozish uchun --apply');
    return;
  }
  if (items.length === 0) return;

  const busy = await busyJob(companyId);
  if (busy) {
    console.error(`Sinxron ${busy.status} (${busy.type}, ${busy.id}) — hech narsa yozilmadi, tugagach qayta ishga tushiring`);
    process.exitCode = 1;
    return;
  }

  /*
   * Hammasi bitta tranzaksiyada, AuditLog ham: jurnalda faqat HAQIQATAN
   * o'zgargan yozuvlar (shu orada sinxron qayta yozgani "o'tkazib yuborildi"
   * ro'yxatida) — undan orqaga qaytarish boshqa yozuvga tegmaydi. Buyurtma
   * holati faqat uning tuzatiladigan hamma pozitsiyasi shu yerda tuzatilgan
   * bo'lsa o'zgaradi.
   */
  const done = await prisma.$transaction(async (tx) => {
    const fixedItems: ItemFix[] = [];
    const skippedItems: string[] = [];
    for (const i of items) {
      // Shart bilan: sinxron shu orada pozitsiyani qayta yozgan bo'lsa — tegilmaydi
      const r = await tx.orderItem.updateMany({
        where: { id: i.itemId, status: 'returned', returnCause: i.cause },
        data: { status: 'canceled', returnedAt: null },
      });
      if (r.count === 1) fixedItems.push(i);
      else skippedItems.push(i.itemId);
    }
    const skippedSet = new Set(skippedItems);
    const fixedOrders: OrderFix[] = [];
    const skippedOrders: string[] = [];
    for (const o of orderFixes) {
      const complete = items.every((i) => i.orderId !== o.orderId || !skippedSet.has(i.itemId));
      const r = complete
        ? await tx.order.updateMany({ where: { id: o.orderId, status: o.from }, data: { status: o.to } })
        : { count: 0 };
      if (r.count === 1) fixedOrders.push(o);
      else skippedOrders.push(o.orderId);
    }
    await tx.auditLog.create({
      data: {
        action: 'maintenance.missing_in_order',
        entity: 'company',
        entityId: companyId,
        // Qaytarish uchun yetarli: har pozitsiyaning eski returnedAt qiymati va buyurtmaning eski holati
        meta: JSON.stringify({
          items: fixedItems.map((i) => ({
            id: i.itemId,
            order: i.uzumOrderId,
            scheme: i.scheme,
            from: 'returned',
            to: 'canceled',
            returnedAt: i.returnedAt?.toISOString() ?? null,
            cause: i.cause,
          })),
          orders: fixedOrders,
          skippedItems,
          skippedOrders,
          itemsFixed: fixedItems.length,
          ordersFixed: fixedOrders.length,
        }),
      },
    });
    return { itemsFixed: fixedItems.length, ordersFixed: fixedOrders.length };
  });

  console.log(`Tuzatildi: ${done.itemsFixed} ta pozitsiya, ${done.ordersFixed} ta buyurtma holati`);
  if (done.itemsFixed !== items.length || done.ordersFixed !== orderFixes.length) {
    console.error('DIQQAT: ba’zi yozuvlar shu orada o‘zgargan — ular tegilmadi, skriptni qayta ishga tushiring');
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a.startsWith('--') && !FLAGS.has(a));
  const ids = args.filter((a) => !a.startsWith('--'));
  if (unknown.length > 0 || ids.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const opts = { apply: args.includes('--apply'), allowDemo: args.includes('--allow-demo') };
  for (const id of ids) await migrateCompany(id, opts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
