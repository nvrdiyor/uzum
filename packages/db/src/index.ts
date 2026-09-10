import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __savdoiqPrisma: PrismaClient | undefined;
}

const logLevels =
  process.env.PRISMA_LOG === 'query'
    ? (['query', 'warn', 'error'] as const)
    : (['warn', 'error'] as const);

export const prisma: PrismaClient =
  globalThis.__savdoiqPrisma ??
  new PrismaClient({
    log: [...logLevels],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__savdoiqPrisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}

export default prisma;
