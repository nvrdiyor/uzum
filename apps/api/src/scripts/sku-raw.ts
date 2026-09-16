/**
 * Katalog javobidagi XOM SKU maydonlarini ko'rish.
 *
 * Hujjatdagi maydonlar ro'yxati OpenAPI sxemasidan olingan — jonli kabinet
 * ularning hammasini yubormasligi mumkin. Yangi maydon qo'shishdan oldin
 * shu skript bilan haqiqatan kelayotganini tekshirish kerak.
 *
 *   npx tsx apps/api/src/scripts/sku-raw.ts
 */
import { prisma } from '@savdoiq/db';
import { decryptSecret } from '../lib/crypto.js';
import { UzumHttp } from '../uzum/http.js';
import { uzumPath } from '../uzum/endpoints.js';
import { env } from '../env.js';

async function main(): Promise<void> {
  const account = await prisma.uzumAccount.findFirst({
    where: { status: 'active' },
    select: { apiKey: true, stores: { select: { uzumShopId: true }, take: 1 } },
  });
  const shopId = account?.stores[0]?.uzumShopId;
  if (!account?.apiKey || !shopId) {
    console.error('Faol kabinet yoki do‘kon topilmadi');
    process.exitCode = 1;
    return;
  }

  const http = new UzumHttp({ baseUrl: env.uzum.baseUrl, apiKey: decryptSecret(account.apiKey) });
  const payload = await http.get<unknown>(uzumPath('products', { shopId }), { page: 0, size: 5 });

  const root = payload as Record<string, unknown>;
  const list = (root.productList ?? root.content ?? root.items) as Record<string, unknown>[] | undefined;
  const product = list?.[0];
  const skus = product?.skuList as Record<string, unknown>[] | undefined;
  const sku = skus?.[0];

  if (!sku) {
    console.error('SKU topilmadi. Javob kalitlari:', Object.keys(root).join(', '));
    process.exitCode = 1;
    return;
  }

  console.log('\n── SKU maydonlari (jonli javob) ──');
  for (const [k, v] of Object.entries(sku)) {
    const shown = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 90) : String(v);
    console.log(`  ${k.padEnd(26)} ${shown}`);
  }

  console.log('\n── Bizni qiziqtirganlar ──');
  for (const k of [
    'previewImage',
    'blocked',
    'blockingReason',
    'quantityDefected',
    'quantityMissing',
    'returnedPercentage',
    'specialOffer',
  ]) {
    const has = k in sku;
    const v = sku[k];
    console.log(`  ${has ? 'BOR ' : 'YO‘Q'} ${k.padEnd(20)} ${has ? JSON.stringify(v).slice(0, 80) : ''}`);
  }
}

void main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
