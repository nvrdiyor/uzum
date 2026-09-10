import { createApp } from './app.js';
import { env, assertProdConfig } from './env.js';
import { startWorker, stopWorker } from './worker/runner.js';
import { prisma } from '@savdoiq/db';

async function main() {
  const problems = assertProdConfig();
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('[api] Konfiguratsiya xatolari:\n' + problems.map((p) => ` • ${p}`).join('\n'));
    process.exit(1);
  }

  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.port, env.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `\n  SavdoIQ API → http://localhost:${env.port}/api/v1` +
        `\n  Uzum rejimi: ${env.uzum.mode}` +
        `\n  Sayt: ${env.webUrl}\n`,
    );
  });

  if (env.sync.inProcessWorker) startWorker();

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[api] ${signal} — to‘xtatilmoqda...`);
    stopWorker();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] ishga tushirishda xatolik:', err);
  process.exit(1);
});
