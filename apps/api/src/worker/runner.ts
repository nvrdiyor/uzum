/**
 * Sinxronizatsiya ishchisi (worker).
 *
 * Ikki taymer bilan ishlaydi:
 *  • har `SYNC_POLL_MS` (env.sync.pollMs) — `runDueJobs()`: navbatdagi joblarni bajaradi;
 *  • har daqiqada — `scheduleRecurring()`: tarif oralig'i bo'yicha avtomatik sinxronlarni qo'yadi.
 *
 * `runDueJobs()` job tugagunicha (~30 daqiqa) `Promise` ushlab turadi, shuning uchun
 * qayta kirishdan himoya (lock bayrog'i) majburiy — aks holda bir job ustma-ust bajarilardi.
 * Barcha xatolar yutiladi va log qilinadi: ishchi hech qachon jarayonni qulatmaydi.
 *
 * DIQQAT: `startWorker` / `stopWorker` nomlari `src/index.ts` da ishlatiladi — o'zgartirmang.
 */
import { env } from '../env.js';
import { runDueJobs, scheduleRecurring } from '../services/sync.js';

/** Avtomatik sinxronlarni rejalashtirish oralig'i */
const RECURRING_MS = 60_000;
/** Poll oralig'ining pastki chegarasi (bazani ortiqcha yuklamaslik uchun) */
const MIN_POLL_MS = 500;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let recurringTimer: ReturnType<typeof setInterval> | null = null;

/** Qayta kirishdan himoya: oldingi sikl tugamaguncha yangisi boshlanmaydi */
let pollBusy = false;
let recurringBusy = false;

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[worker] ${message}`);
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[worker] ${message}`);
}

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Noma’lum xatolik';

/** Navbatdagi joblarni bajarish sikli */
async function pollTick(): Promise<void> {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const count = await runDueJobs();
    if (count > 0) log(`${count} ta sinxronizatsiya bajarildi`);
  } catch (err) {
    warn(`navbatni bajarishda xatolik: ${errorMessage(err)}`);
  } finally {
    pollBusy = false;
  }
}

/** Avtomatik (rejali) sinxronlarni navbatga qo'yish sikli */
async function recurringTick(): Promise<void> {
  if (recurringBusy) return;
  recurringBusy = true;
  try {
    const queued = await scheduleRecurring();
    if (queued > 0) log(`${queued} ta rejali sinxronizatsiya navbatga qo‘yildi`);
  } catch (err) {
    warn(`rejalashtirishda xatolik: ${errorMessage(err)}`);
  } finally {
    recurringBusy = false;
  }
}

/** Ishchini ishga tushiradi (takroriy chaqiruv e'tiborsiz qoldiriladi) */
export function startWorker(): void {
  if (pollTimer) return;

  const pollMs = Math.max(MIN_POLL_MS, Math.round(env.sync.pollMs));
  pollTimer = setInterval(() => void pollTick(), pollMs);
  recurringTimer = setInterval(() => void recurringTick(), RECURRING_MS);

  log(
    `ishga tushdi — poll ${pollMs} ms, tezlik x${env.sync.speedFactor}, ` +
      `bir vaqtda ${env.sync.concurrency} ta job, Uzum rejimi: ${env.uzum.mode}`,
  );

  // Birinchi siklni kutmasdan boshlaymiz
  void pollTick();
  void recurringTick();
}

/** Ishchini to'xtatadi (bajarilayotgan job oxirigacha yetkaziladi) */
export function stopWorker(): void {
  const wasRunning = pollTimer !== null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
  }
  if (wasRunning) log('to‘xtatildi');
}

/** Ishchi hozir ishlayaptimi (sog'liq tekshiruvi uchun) */
export function isWorkerRunning(): boolean {
  return pollTimer !== null;
}
