/**
 * Server konsolidan sessiya tokeni olish (diagnostika uchun).
 *
 *   npx tsx apps/api/src/scripts/dev-token.ts <telegramId> [soat]
 *
 * Faqat serverga SSH orqali kira oladigan odam ishlata oladi — ya'ni allaqachon
 * to'liq huquqqa ega. Token qisqa muddatli bo'ladi (standart 1 soat).
 */
import crypto from 'node:crypto';
import { prisma } from '@savdoiq/db';
import { env } from '../env.js';

async function main(): Promise<void> {
  const telegramId = process.argv[2];
  const hours = Math.min(24, Math.max(1, Number(process.argv[3]) || 1));

  if (!telegramId) {
    console.error('Foydalanish: dev-token.ts <telegramId> [soat]');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    console.error(`Foydalanuvchi topilmadi: ${telegramId}`);
    process.exitCode = 1;
    return;
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHmac('sha256', env.sessionSecret).update(token).digest('hex');

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
      userAgent: 'dev-token script',
    },
  });

  console.log(token);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
