/**
 * Diagnostika uchun ochilgan sessiyalarni bekor qilish.
 *
 *   npx tsx apps/api/src/scripts/revoke-dev-tokens.ts
 *
 * `dev-token.ts` yaratgan sessiyalarni o'chiradi — foydalanuvchilarning
 * oddiy sessiyalariga tegilmaydi.
 */
import { prisma } from '@savdoiq/db';

async function main(): Promise<void> {
  const res = await prisma.session.deleteMany({ where: { userAgent: 'dev-token script' } });
  console.log(`Bekor qilingan sessiyalar: ${res.count}`);
}

main()
  .catch((e) => console.error(e instanceof Error ? e.message : e))
  .finally(() => prisma.$disconnect());
