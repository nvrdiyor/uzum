/**
 * Uzum API ulanishini tekshirish (diagnostika).
 *
 *   npx tsx apps/api/src/scripts/uzum-check.ts [companyId]
 *
 * Kompaniyaning saqlangan API kalitini deshifrlab, haqiqiy Uzum API'ga bir nechta
 * so'rov yuboradi va javoblarni ko'rsatadi. Kalitning o'zi hech qachon chop etilmaydi.
 */
import { prisma } from '@savdoiq/db';
import { decryptSecret } from '../lib/crypto.js';
import { createUzumClient } from '../uzum/client.js';
import { env } from '../env.js';

const line = (s = '') => console.log(s);
const head = (s: string) => console.log(`\n[36m▸ ${s}[0m`);
const ok = (s: string) => console.log(`[32m✔ ${s}[0m`);
const bad = (s: string) => console.log(`[31m✘ ${s}[0m`);

async function main(): Promise<void> {
  const companyId = process.argv[2];

  const account = await prisma.uzumAccount.findFirst({
    where: companyId ? { companyId } : {},
    orderBy: { createdAt: 'desc' },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!account) {
    bad('Uzum kabineti topilmadi');
    return;
  }

  line(`Kompaniya : ${account.company.name} (${account.companyId})`);
  line(`Kabinet   : ${account.label} · kalit ${account.keyHint ?? '—'} · holat ${account.status}`);
  line(`Rejim     : ${env.uzum.mode} · base ${env.uzum.baseUrl}`);

  let apiKey: string;
  try {
    apiKey = decryptSecret(account.apiKeyEnc);
    ok(`Kalit deshifrlandi (${apiKey.length} belgi)`);
  } catch (err) {
    bad(`Kalitni deshifrlab bo'lmadi: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const client = createUzumClient({ apiKey, mode: 'live' });

  head('1. verify() — kalit haqiqiyligi');
  const v = await client.verify();
  v.ok ? ok('Kalit ishlayapti') : bad(`Xato: ${v.message ?? 'nomaʼlum'}`);
  if (!v.ok) return;

  head('2. getShops() — do\'konlar');
  const shops = await client.getShops();
  ok(`${shops.length} ta do'kon`);
  shops.slice(0, 5).forEach((s) => line(`   • ${s.id} — ${s.title} ${s.status ? `(${s.status})` : ''}`));
  if (shops.length === 0) return;

  const shopId = shops[0].id;

  head(`3. getProducts(${shopId}) — katalog`);
  const products = await client.getProducts(shopId);
  const skuCount = products.reduce((n, p) => n + p.skus.length, 0);
  ok(`${products.length} ta mahsulot · ${skuCount} ta SKU`);
  products.slice(0, 3).forEach((p) => {
    line(`   • ${p.title} [${p.id}] · ${p.skus.length} SKU · ${p.category ?? '—'}`);
    p.skus.slice(0, 3).forEach((s) =>
      line(
        `       ${s.sku} · narx ${s.price} · tannarx ${s.purchasePrice ?? '—'} · ` +
          `FBO ${s.quantityFbo ?? '—'} · FBS ${s.quantityFbs ?? '—'} · komissiya ${s.commissionPct ?? '—'}%`,
      ),
    );
  });

  head(`4. getStocks(${shopId}) — qoldiqlar`);
  const stocks = await client.getStocks(shopId);
  ok(`${stocks.length} ta qoldiq yozuvi`);
  stocks.slice(0, 3).forEach((s) => line(`   • sku ${s.skuId}: FBO ${s.fbo} · FBS ${s.fbs}`));

  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);

  head(`5. getOrders(${shopId}) — oxirgi 30 kun`);
  const orders = await client.getOrders(shopId, from, to);
  ok(`${orders.length} ta buyurtma`);
  orders.slice(0, 3).forEach((o) =>
    line(`   • ${o.id} · ${o.status} · ${o.deliveryType} · ${o.totalAmount} so'm · ${o.items.length} pozitsiya`),
  );

  head(`6. getReturns / getExpenses / getStorageFees`);
  const [returns, expenses, storage] = await Promise.all([
    client.getReturns(shopId, from, to),
    client.getExpenses(shopId, from, to),
    client.getStorageFees(shopId, from, to),
  ]);
  line(`   qaytarishlar: ${returns.length} · xarajatlar: ${expenses.length} · saqlash: ${storage.length}`);

  line();
  ok('Tekshiruv tugadi');
}

main()
  .catch((err) => {
    bad(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
