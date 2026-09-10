/**
 * Mustaqil sinxronizatsiya ishchisi — alohida jarayon.
 *
 * Qachon kerak: `SYNC_IN_PROCESS=false` bo'lganda API faqat so'rovlarga xizmat qiladi,
 * og'ir yig'ish esa shu jarayonda ketadi (masalan, PM2/Docker'da ikkinchi konteyner).
 *
 *   npm run worker --workspace @savdoiq/api
 *
 * Joblar bazada atomik ravishda "band" qilinadi (`status: queued → running`),
 * shuning uchun bir nechta ishchi jarayon bo'lsa ham bitta job ikki marta bajarilmaydi.
 */
import { prisma } from '@savdoiq/db';
import { env } from '../env.js';
import { startWorker, stopWorker } from './runner.js';

let shuttingDown = false;

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[worker] ${message}`);
}

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : String(err);

async function main(): Promise<void> {
  await prisma.$connect();

  log(
    `mustaqil ishchi ishga tushmoqda — Uzum rejimi: ${env.uzum.mode}, ` +
      `tezlik x${env.sync.speedFactor}, poll ${env.sync.pollMs} ms`,
  );

  if (env.sync.inProcessWorker) {
    // eslint-disable-next-line no-console
    console.warn(
      '[worker] DIQQAT: SYNC_IN_PROCESS=true — API jarayoni ham ishchi ishga tushiradi. ' +
        'Ikki marta ishlamasligi uchun .env da SYNC_IN_PROCESS=false qiling.',
    );
  }

  startWorker();
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`${signal} — to‘xtatilmoqda...`);
  stopWorker();
  try {
    await prisma.$disconnect();
  } catch (err) {
    log(`bazadan uzilishda xatolik: ${errorMessage(err)}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Kutilmagan xatolar ishchini qulatmasin — faqat log qilamiz
process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[worker] ushlanmagan rad etish:', errorMessage(reason));
});
process.on('uncaughtException', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[worker] ushlanmagan xatolik:', errorMessage(err));
});

void main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[worker] ishga tushirishda xatolik:', errorMessage(err));
  process.exit(1);
});
