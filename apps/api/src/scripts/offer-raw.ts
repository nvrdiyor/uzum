/**
 * Katalogdagi `specialOffer` obyektini TO'LIQ ko'rsatadi.
 *
 *   npx tsx apps/api/src/scripts/offer-raw.ts
 *
 * Nima uchun kerak: sayt aksiyaga qo'shilgan tovarning JORIY narxini
 * ko'rsatishi kerak, lekin katalogdagi `price` ro'yxat narxini beradi.
 * Chegirmali narx `specialOffer` ichida bormi yoki yo'qmi — shuni aniq
 * bilish kerak, chunki undan narx, marja va ROI hisobi kelib chiqadi.
 *
 * Hech narsani o'zgartirmaydi.
 */
import { prisma } from '@savdoiq/db';
import { decryptSecret } from '../lib/crypto.js';
import { UzumHttp } from '../uzum/http.js';
import { UZUM_PAGE_LIMITS, uzumPath } from '../uzum/endpoints.js';

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

function pickList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const r = rec(payload);
  for (const key of ['payload', 'items', 'content', 'list', 'data', 'result', 'rows', 'products']) {
    const v = r[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const inner = rec(v);
      for (const k of ['items', 'content', 'list', 'rows']) {
        if (Array.isArray(inner[k])) return inner[k] as unknown[];
      }
    }
  }
  const arrays = Object.values(r).filter(Array.isArray) as unknown[][];
  return arrays.length === 1 ? arrays[0] : [];
}

async function main(): Promise<void> {
  const account = await prisma.uzumAccount.findFirst({ where: { status: 'active' } });
  if (!account) {
    console.error('Kabinet topilmadi');
    process.exitCode = 1;
    return;
  }
  const apiKey = decryptSecret(account.apiKeyEnc).trim().replace(/^Bearer\s+/i, '');
  const store = await prisma.store.findFirst({
    where: { companyId: account.companyId },
    select: { uzumShopId: true },
  });
  const shopId = store?.uzumShopId ?? '';

  const http = new UzumHttp({ apiKey });
  const rows = await http.fetchAllPages(
    uzumPath('products', { shopId }),
    { filter: 'ALL', sortBy: 'DEFAULT' },
    (p) => pickList(p),
    { size: UZUM_PAGE_LIMITS.products },
  );

  console.log(`Mahsulot satrlari: ${rows.length}\n`);

  let shown = 0;
  for (const raw of rows) {
    const r = rec(raw);
    const skuList = Array.isArray(r.skuList) ? r.skuList : [];
    for (const s of skuList) {
      const sk = rec(s);
      const offer = sk.specialOffer;
      if (!offer) continue;
      console.log(`── ${String(sk.skuFullTitle ?? sk.skuTitle ?? sk.id)} ──`);
      console.log(`  price        ${String(sk.price)}`);
      console.log(`  marketPrice  ${String(sk.marketPrice)}`);
      console.log(`  specialOffer ${JSON.stringify(offer, null, 2).replace(/\n/g, '\n  ')}`);
      // Chegirmaga o'xshash har qanday maydonni alohida ko'rsatamiz
      const flat = Object.entries(rec(offer));
      const priceish = flat.filter(([k, v]) => /price|amount|discount|sum/i.test(k) && v !== null);
      console.log(`  narxga o'xshash to'ldirilgan maydonlar: ${JSON.stringify(priceish)}`);
      console.log();
      shown += 1;
      if (shown >= 4) {
        await prisma.$disconnect();
        return;
      }
    }
  }
  if (shown === 0) console.log('specialOffer bo‘lgan SKU topilmadi');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
