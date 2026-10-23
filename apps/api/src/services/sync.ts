/**
 * Sinxronizatsiya xizmati — loyihaning yuragi.
 *
 * API kalit ulangach `SYNC_STEPS` bo'yicha bosqichma-bosqich ma'lumot yig'iladi.
 *
 * VAQT HAQIQIY. Bosqich ishi tugashi bilan keyingisi boshlanadi — sun'iy
 * kutish yo'q. Ilgari har bosqich rejalashtirilgan vaqtini "yashab" o'tardi:
 * to'liq sinxron doim 30 daqiqa, oraliq sinxron doim 150 soniya davom etardi,
 * ekrandagi "~29 daqiqa qoldi" esa ishga emas, shu rejaga qarab sanalardi.
 *
 * Progress va qolgan vaqt shu kabinetning OLDINGI muvaffaqiyatli sinxronida
 * o'lchangan bosqich davomiyliklaridan hisoblanadi (`loadTimings`). Birinchi
 * sinxronda tarix yo'q — o'shanda o'tgan vaqtdan ekstrapolyatsiya qilinadi,
 * yetarli ma'lumot yig'ilmaguncha esa qolgan vaqt "noma'lum" (0) bo'ladi.
 *
 * Haqiqiy ish (Uzum'dan yuklash va bazaga yozish) fonda ketadi, sikl esa har
 * ~2 soniyada `SyncJob` yozuvidagi progress / step / message / etaSeconds ni
 * yangilab turadi.
 *
 * DIQQAT: bu fayldagi eksport nomlari boshqa modullarda ishlatiladi — o'zgartirmang:
 *   `enqueueSync`, `getSyncStatus`, `runDueJobs`, `cancelSync`, `scheduleRecurring`.
 */
import { prisma } from '@savdoiq/db';
import type { Subscription, SyncJob } from '@savdoiq/db';
import {
  SYNC_STEPS,
  addDays,
  formatMoney,
  getPlan,
  hasFeature,
  resolvePlan,
  round,
  todayInBusinessTz,
  type LossKind,
  type PlanId,
  type SyncStatus,
  type SyncStepId,
} from '@savdoiq/shared';
import { env } from '../env.js';
import { decryptSecret } from '../lib/crypto.js';
import { createUzumClient } from '../uzum/client.js';
import { UzumApiError, describeUzumError } from '../uzum/http.js';
import type { UzumClient } from '../uzum/types.js';
import { itemCostChanged, itemCostFields } from './item-cost.js';
import { notifyCompanyOwners } from './notify.js';
import { earlyFeeFrom, recordPayout } from './payout-history.js';
import { getPayoutRules } from './payout-schedule.js';
import { syncLossRecords } from './stock-balance.js';
import { nextAutoSyncAt } from './sync-schedule.js';
import {
  applyActualLogistics,
  upsertExpenses,
  upsertLosses,
  upsertOrders,
  upsertProducts,
  upsertInvoices,
  upsertReturns,
  upsertReviews,
  upsertShops,
  upsertStocks,
  upsertStorageFees,
  type ImportResult,
  type OrdersImportResult,
} from './importer.js';

// ─────────────────────────── Sozlamalar ───────────────────────────

/** Sinxronizatsiya turi */
export type SyncJobType = 'full' | 'incremental';

/** Bazadagi `SyncJob.status` qiymatlari (SyncStatus tipida 'canceled' yo'q — u 'idle' ga o'giriladi) */
type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';

/** Progress necha millisekundda bir marta yangilanadi */
const TICK_MS = 2_000;
/** Obunasi tugagan kabinet shu oraliqda qayta tekshiriladi (avto-sinxron qilinmaydi), daqiqa */
const LAPSED_RECHECK_MINUTES = 60;
/** Nechta urinishdan keyin job 'failed' bo'ladi */
const MAX_ATTEMPTS = 3;
/** Qayta urinishlar orasidagi kutish (urinish raqamiga ko'paytiriladi) */
const RETRY_BACKOFF_MS = 20_000;
/** Shuncha vaqt yangilanmagan 'running' job uzilgan deb hisoblanadi va qayta navbatga qo'yiladi */
const STALE_RUNNING_MS = 5 * 60_000;
/** Inkremental sinxronda nechta kunlik oyna qayta o'qiladi (status o'zgarishlarini ushlash uchun) */
const INCREMENTAL_DAYS = 14;
/**
 * Yetkazilgandan keyin tovar qancha vaqt qaytarilishi mumkin (kun).
 *
 * Uzumning qaytarish muddati + yetkazishdagi kechikish uchun zaxira. Shu
 * muddat ichidagi YETKAZILGAN buyurtmalar ham sinxron oynasiga kiritiladi.
 */
const RETURN_WINDOW_DAYS = 45;
/**
 * "Tovaringiz sotildi" xabari faqat shu vaqt ichida berilgan buyurtmalar uchun.
 *
 * Inkremental sinxron 14 kunlik oynani tortadi. Kompaniyaga YANGI do'kon
 * qo'shilsa, o'sha do'konning 14 kunlik butun tarixi birinchi marta import
 * qilinadi va "yangi" bo'lib ko'rinadi — bu chegara o'shanda spamni to'xtatadi.
 */
const SALE_NOTIFY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Bitta sinxronda ko'pi bilan shuncha alohida sotuv xabari; qolgani — bitta yig'ma */
const SALE_NOTIFY_LIMIT = 8;
/** Bekor qilish va qaytarish xabarlari uchun xuddi shunday chegara */
const CHANGE_NOTIFY_LIMIT = 8;
/** "Xaridor qabul qilib oldi" xabarlari uchun ham */
const ACCEPT_NOTIFY_LIMIT = 8;
/**
 * Faqat shu vaqt ichida topshirilgan buyurtma haqida xabar beriladi.
 *
 * Kechasi sinxronlar orasi uch soatgacha cho'ziladi, shuning uchun chegara
 * keng — bir sutka. Undan eski topshirish (sinxron uzoq to'xtab qolgan yoki
 * kabinet endi ulangan) yangilik emas.
 */
const ACCEPT_NOTIFY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Yo'qotish xabarida nomma-nom sanaladigan tovarlar soni */
const LOSS_NOTIFY_LINES = 6;
/** To'liq sinxronda tarix chuqurligining yuqori chegarasi (kun) */
const MAX_HISTORY_DAYS = 365;
/** Bir sikldа nechta job parallel bajariladi */
const CONCURRENCY = Math.max(1, Math.min(8, Math.round(env.sync.concurrency)));

/**
 * Bosqichlarning standart ULUSHLARI — faqat kabinetning o'z tarixi ham,
 * boshqa kabinetlarniki ham bo'lmagan eng birinchi sinxron uchun.
 * Mutlaq qiymat sifatida ishlatilmaydi.
 */
const DEFAULT_PROFILE: number[] = SYNC_STEPS.map((x) => x.weight);

const VALID_STEPS = new Set<string>(['queued', 'done', ...SYNC_STEPS.map((s) => s.id)]);

/** Ulush bo'yicha taxmin shu qismdan keyin ishonchli: undan oldin qolgan vaqt "noma'lum" */
const MIN_SHARE_FOR_ETA = 0.1;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** O'lchangan bosqich davomiyliklari saqlanadigan sozlama kaliti */
const timingKey = (type: SyncJobType, accountId: string): string => `sync.timing.${type}.${accountId}`;

function parseTimings(value: string | null | undefined): number[] | null {
  if (!value) return null;
  try {
    const arr: unknown = JSON.parse(value);
    if (!Array.isArray(arr) || arr.length !== SYNC_STEPS.length) return null;
    const out = arr.map((x) => Math.max(0, Number(x) || 0));
    return sum(out) > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Bosqich davomiyliklari (ms).
 *
 * `calibrated` — shu kabinetning o'z o'lchovi: mutlaq vaqt sifatida ishoniladi.
 * Aks holda boshqa kabinetning oxirgi o'lchovi (yoki standart ulushlar)
 * faqat NISBAT sifatida olinadi — do'kon hajmi boshqa, vaqt ham boshqa.
 */
async function loadTimings(
  companyId: string,
  accountId: string,
  type: SyncJobType,
): Promise<{ profile: number[]; calibrated: boolean }> {
  const own = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: timingKey(type, accountId) } },
    select: { value: true },
  });
  const mine = parseTimings(own?.value);
  if (mine) return { profile: mine, calibrated: true };

  const other = await prisma.companySetting.findFirst({
    where: { key: { startsWith: `sync.timing.${type}.` } },
    orderBy: { updatedAt: 'desc' },
    select: { value: true },
  });
  return { profile: parseTimings(other?.value) ?? DEFAULT_PROFILE, calibrated: false };
}

/** Shu kabinet uchun kutilayotgan umumiy davomiylik (s); o'lchov bo'lmasa 0 — "noma'lum" */
async function expectedSeconds(companyId: string, accountId: string | null, type: SyncJobType): Promise<number> {
  if (!accountId) return 0;
  const t = await loadTimings(companyId, accountId, type);
  return t.calibrated ? Math.max(1, Math.round(sum(t.profile) / 1000)) : 0;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

const errorMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Noma’lum xatolik';

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[sync] ${message}`);
}

/**
 * Xatoga log uchun texnik tafsilot biriktiradi (endpoint, HTTP status, Uzum
 * javobi). Foydalanuvchiga ko'rinadigan matn va xatti-harakat o'zgarmaydi —
 * faqat `failJob` logi qatoriga qo'shiladi.
 */
function withDiagnostic<T extends Error>(err: T, diagnostic: string | undefined): T {
  if (diagnostic) Object.assign(err, { diagnostic });
  return err;
}

function diagnosticOf(err: unknown): string | null {
  if (err instanceof UzumApiError) return describeUzumError(err);
  const value = err instanceof Error ? (err as Error & { diagnostic?: unknown }).diagnostic : undefined;
  return typeof value === 'string' && value ? value : null;
}

/** Bekor qilinganda tashlanadi (xato emas — foydalanuvchi to'xtatgan) */
class SyncCanceledError extends Error {
  constructor(message = 'Sinxronizatsiya bekor qilindi') {
    super(message);
    this.name = 'SyncCanceledError';
  }
}

/** API kalit yaroqsiz — kabinet holati 'invalid' ga o'tadi */
class UzumAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UzumAuthError';
  }
}

// ─────────────────────────── Holat (SyncStatus) ───────────────────────────

function toStepId(value: string | null | undefined): SyncStepId {
  return VALID_STEPS.has(value ?? '') ? (value as SyncStepId) : 'queued';
}

/**
 * Obuna faol bo'lsa uning tarifi, aks holda 'expired' (`requireCompany` va
 * `/auth/me` bilan bir xil qoida — `resolvePlan`). Ilgari bu yerda ham 'trial'
 * qaytarilardi: muddati tugagan kompaniya qo'lda sinxronda sinov tarixini va
 * sinovdagi bo'limlar xabarlarini olardi.
 */
function activePlanId(subscription: Subscription | null | undefined): PlanId {
  return resolvePlan(subscription);
}

/** Kabinetlardan olinadigan yangilik vaqtlari (SyncStatus.lastSuccessAt / nextSyncAt) */
type SyncFreshness = Pick<SyncStatus, 'lastSuccessAt' | 'nextSyncAt'>;

/** `SyncJob` yozuvini API shartnomasidagi `SyncStatus` ga o'giradi */
function toSyncStatus(job: SyncJob, firstRun: boolean, freshness: SyncFreshness): SyncStatus {
  const raw = job.status as JobStatus;
  // Shartnomada 'canceled' yo'q — bekor qilingan job bo'sh (idle) holat sifatida ko'rsatiladi
  const status: SyncStatus['status'] =
    raw === 'canceled' ? 'idle' : raw === 'running' || raw === 'queued' || raw === 'done' || raw === 'failed' ? raw : 'idle';

  return {
    jobId: job.id,
    status,
    progress: clamp(Math.round(job.progress), 0, 100),
    step: raw === 'done' ? 'done' : toStepId(job.step),
    stepIndex: clamp(job.stepIndex, 0, SYNC_STEPS.length),
    totalSteps: SYNC_STEPS.length,
    message: job.message,
    error: job.error,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    etaSeconds: Math.max(0, Math.round(job.etaSeconds)),
    firstRun,
    ...freshness,
  };
}

/**
 * Kompaniyaning joriy sinxronizatsiya holati.
 * Job umuman bo'lmasa — bo'sh (`idle`) holat; qolgan vaqt noma'lum (0).
 */
export async function getSyncStatus(companyId: string): Promise<SyncStatus> {
  const [job, doneCount, accounts] = await Promise.all([
    prisma.syncJob.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
    prisma.syncJob.count({ where: { companyId, status: 'done' } }),
    prisma.uzumAccount.findMany({ where: { companyId }, select: { status: true, lastSyncAt: true, nextSyncAt: true } }),
  ]);

  /*
   * lastSyncAt faqat muvaffaqiyatli sinxronda yoziladi (finishJob) — shuning
   * uchun "ma'lumot qachon yangilandi" uchun aynan shu olinadi. Keyingi
   * sinxron — faol kabinetlarning eng yaqini.
   */
  let lastSuccess: Date | null = null;
  let nextSync: Date | null = null;
  for (const a of accounts) {
    if (a.lastSyncAt && (!lastSuccess || a.lastSyncAt > lastSuccess)) lastSuccess = a.lastSyncAt;
    if (a.status === 'active' && a.nextSyncAt && (!nextSync || a.nextSyncAt < nextSync)) nextSync = a.nextSyncAt;
  }
  const freshness: SyncFreshness = {
    lastSuccessAt: lastSuccess ? lastSuccess.toISOString() : null,
    nextSyncAt: nextSync ? nextSync.toISOString() : null,
  };

  if (!job) {
    return {
      jobId: null,
      status: 'idle',
      progress: 0,
      step: 'queued',
      stepIndex: 0,
      totalSteps: SYNC_STEPS.length,
      message: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      etaSeconds: 0,
      firstRun: true,
      ...freshness,
    };
  }

  // "Birinchi yig'ish" — muvaffaqiyatli tugagan sinxron hali bo'lmagan
  // (yoki hozirgi jobning o'zi shu birinchi muvaffaqiyatli sinxron).
  const firstRun = doneCount <= (job.status === 'done' ? 1 : 0);
  return toSyncStatus(job, firstRun, freshness);
}

// ─────────────────────────── Navbat ───────────────────────────

/**
 * Sinxronizatsiyani navbatga qo'yadi.
 * Kompaniyada allaqachon `queued`/`running` job bo'lsa — **o'sha job qaytariladi**
 * (takroriy bosishlar yangi jarayon boshlamaydi).
 *
 * `type` berilmasa: birinchi marta — `full`, keyingilari — `incremental`.
 */
export async function enqueueSync(
  companyId: string,
  uzumAccountId?: string | null,
  type?: SyncJobType,
): Promise<SyncJob> {
  const active = await prisma.syncJob.findFirst({
    where: { companyId, status: { in: ['queued', 'running'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) return active;

  const accountId =
    uzumAccountId ??
    (
      await prisma.uzumAccount.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
    )?.id ??
    null;

  const doneCount = await prisma.syncJob.count({ where: { companyId, status: 'done' } });
  const jobType: SyncJobType = type ?? (doneCount === 0 ? 'full' : 'incremental');

  const job = await prisma.syncJob.create({
    data: {
      companyId,
      uzumAccountId: accountId,
      type: jobType,
      status: 'queued',
      progress: 0,
      step: 'queued',
      stepIndex: 0,
      totalSteps: SYNC_STEPS.length,
      message: 'Navbatda — tez orada boshlanadi',
      etaSeconds: await expectedSeconds(companyId, accountId, jobType),
      scheduledAt: new Date(),
    },
  });

  // Birinchi yig'ishda onboarding qadamini "syncing" ga o'tkazamiz
  if (doneCount === 0) {
    try {
      await prisma.company.update({ where: { id: companyId }, data: { onboardStep: 'syncing' } });
    } catch {
      // onboarding qadami muhim emas — jarayon davom etadi
    }
  }

  return job;
}

/**
 * Navbatdagi va bajarilayotgan jobni bekor qiladi.
 * Ishchi har ~2 soniyada bazadan holatni tekshiradi va darhol to'xtaydi.
 */
export async function cancelSync(companyId: string): Promise<boolean> {
  const res = await prisma.syncJob.updateMany({
    where: { companyId, status: { in: ['queued', 'running'] } },
    data: {
      status: 'canceled',
      message: 'Foydalanuvchi tomonidan bekor qilindi',
      finishedAt: new Date(),
      etaSeconds: 0,
    },
  });
  return res.count > 0;
}

/**
 * Tarif oralig'i bo'yicha avtomatik (inkremental) sinxronizatsiyalarni navbatga qo'yadi.
 * Ishchi buni har daqiqada chaqiradi. Qaytaradi: navbatga qo'yilgan joblar soni.
 * Kechasi oraliq siyraklashadi — `nextAutoSyncAt` ga qarang.
 */
export async function scheduleRecurring(): Promise<number> {
  const now = new Date();
  const accounts = await prisma.uzumAccount.findMany({
    where: { status: 'active', nextSyncAt: { lte: now } },
    select: { id: true, companyId: true },
    take: 200,
  });
  if (accounts.length === 0) return 0;

  let queued = 0;

  for (const account of accounts) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: account.companyId },
        include: { subscription: true },
      });
      if (!company) continue;

      const planId = activePlanId(company.subscription);

      /*
       * Obuna tugagan bo'lsa avto-sinxron to'xtaydi (foydalanuvchi qo'lda boshlashi
       * mumkin), lekin kabinet har soatda qayta tekshiriladi. 'expired' tarifining
       * sutkalik oralig'i bu yerda olinmaydi: obuna qaysi yo'l bilan tiklansa ham
       * (sayt, to'lov webhook'i yoki botdagi /grant) sinxron bir soat ichida qaytadi.
       */
      if (!company.subscription || planId === 'expired') {
        await prisma.uzumAccount.update({
          where: { id: account.id },
          data: { nextSyncAt: nextAutoSyncAt(now, LAPSED_RECHECK_MINUTES) },
        });
        continue;
      }

      const intervalMinutes = getPlan(planId).limits.syncIntervalMinutes;

      // Keyingi vaqtni darhol suramiz — takroriy navbatga qo'yishning oldini oladi
      await prisma.uzumAccount.update({
        where: { id: account.id },
        data: {
          nextSyncAt: nextAutoSyncAt(now, intervalMinutes),
          syncIntervalM: intervalMinutes,
        },
      });

      const busy = await prisma.syncJob.findFirst({
        where: { companyId: account.companyId, status: { in: ['queued', 'running'] } },
        select: { id: true },
      });
      if (busy) continue;

      await enqueueSync(account.companyId, account.id, 'incremental');
      queued += 1;
    } catch (err) {
      log(`rejalashtirish xatosi (${account.id}): ${errorMessage(err)}`);
    }
  }

  return queued;
}

// ─────────────────────────── Bajarish ───────────────────────────

/** Bitta jobni bajarish davomidagi umumiy holat */
interface SyncRun {
  jobId: string;
  companyId: string;
  accountId: string;
  type: SyncJobType;
  planId: PlanId;
  syncIntervalMinutes: number;
  taxRate: number;
  /** Ma'lumot yig'ish oynasi */
  from: Date;
  to: Date;
  client: UzumClient | null;
  stores: { id: string; uzumShopId: string; title: string }[];
  /** Bosqichlarning kutilayotgan davomiyligi (ms) yoki ulushlari — `loadTimings` */
  profile: number[];
  /** `profile` shu kabinetning o'z o'lchovimi (mutlaq vaqt sifatida ishonsa bo'ladimi) */
  calibrated: boolean;
  /** Sinxron boshlangan payt (ms) */
  startedMs: number;
  /** Shu sinxronda o'lchangan bosqich davomiyliklari (ms) */
  stepMs: number[];
  totals: {
    shops: number;
    products: number;
    stocks: number;
    orders: number;
    returns: number;
    losses: number;
    storage: number;
    expenses: number;
    reviews: number;
    shipments: number;
  };
}

const emptyTotals = (): SyncRun['totals'] => ({
  shops: 0,
  products: 0,
  stocks: 0,
  orders: 0,
  returns: 0,
  losses: 0,
  storage: 0,
  expenses: 0,
  reviews: 0,
  shipments: 0,
});

const countOf = (r: ImportResult): number => r.created + r.updated;

/** Klient `auth` bosqichida tayyorlanadi — undan keyingi bosqichlar shu yerdan oladi */
function requireClient(run: SyncRun): UzumClient {
  if (!run.client) throw new Error('Uzum klienti tayyor emas');
  return run.client;
}

/** Job bekor qilinganini tekshiradi (har progress yangilanishida) */
async function assertNotCanceled(jobId: string): Promise<void> {
  const row = await prisma.syncJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!row || row.status === 'canceled') throw new SyncCanceledError();
}

/**
 * Progress (0..1) va qolgan vaqt (s; 0 — hali noma'lum).
 *
 * O'z o'lchovi bor kabinetda: o'tgan bosqichlar + joriy bosqichda o'tgan vaqt,
 * kutilgan davomiyliklarga nisbatan. Joriy bosqich kutilgandan uzoq cho'zilsa
 * progress bosqich chegarasida to'xtab turadi — oldinga yugurib ketmaydi.
 *
 * O'lchovsiz (birinchi sinxron): faqat TUGAGAN bosqichlar ulushi sanaladi va
 * qolgan vaqt o'tgan vaqtdan ekstrapolyatsiya qilinadi.
 */
function estimateProgress(
  run: SyncRun,
  index: number,
  elapsedStepMs: number,
  stepDone: boolean,
): { progress: number; etaSeconds: number } {
  const total = sum(run.profile) || 1;
  const before = sum(run.profile.slice(0, index));
  const cur = run.profile[index] ?? 0;
  const after = sum(run.profile.slice(index + 1));

  if (run.calibrated) {
    const inStep = stepDone ? cur : Math.min(elapsedStepMs, cur * 0.95);
    const remaining = after + (stepDone ? 0 : Math.max(0, cur - elapsedStepMs));
    return { progress: (before + inStep) / total, etaSeconds: Math.max(1, Math.round(remaining / 1000)) };
  }

  const progress = (before + (stepDone ? cur : 0)) / total;
  if (progress < MIN_SHARE_FOR_ETA) return { progress, etaSeconds: 0 };
  /*
   * Taxmin oxirgi TUGAGAN bosqich chegarasida olinadi va joriy bosqich
   * davomida kamayib boradi. O'tgan butun vaqtdan olinsa, bosqich cho'zilgan
   * sari qolgan vaqt O'SIB borardi ("1 daqiqa qoldi" → "3 daqiqa qoldi").
   */
  const inStep = stepDone ? 0 : elapsedStepMs;
  const atBoundary = Date.now() - run.startedMs - inStep;
  const remaining = (atBoundary * (1 - progress)) / progress - inStep;
  // Bosqich taxmindan uzoq cho'zildi — "1 soniya qoldi" deb turgandan ko'ra noma'lum degan to'g'ri
  return { progress, etaSeconds: remaining > 0 ? Math.max(1, Math.round(remaining / 1000)) : 0 };
}

/** Bosqich holatini `SyncJob` yozuviga yozadi */
async function writeProgress(
  run: SyncRun,
  index: number,
  elapsedStepMs: number,
  stepDone: boolean,
  detail: string | null,
): Promise<void> {
  const step = SYNC_STEPS[index];
  const est = estimateProgress(run, index, elapsedStepMs, stepDone);

  await prisma.syncJob.update({
    where: { id: run.jobId },
    data: {
      status: 'running',
      progress: clamp(Math.round(est.progress * 100), 0, 99),
      step: step.id,
      stepIndex: index,
      totalSteps: SYNC_STEPS.length,
      message: detail ?? step.hint.uz,
      etaSeconds: est.etaSeconds,
    },
  });
}

/**
 * Bitta bosqichni bajaradi: ish fonda ketadi, sikl har ~2 soniyada progressni
 * yangilaydi va bekor qilinganini tekshiradi. Ish tugashi bilan bosqich ham
 * tugaydi — kutish yo'q; davomiylik o'lchab qo'yiladi.
 */
async function runStep(
  run: SyncRun,
  index: number,
  work: (setDetail: (text: string) => void) => Promise<void>,
): Promise<void> {
  const startedAt = Date.now();

  const state: { done: boolean; error: unknown; detail: string | null } = {
    done: false,
    error: null,
    detail: null,
  };
  const setDetail = (t: string): void => {
    state.detail = t;
  };

  await writeProgress(run, index, 0, false, state.detail);

  // `task` hech qachon rad etilmaydi: xato `state.error` ga yoziladi
  const task = work(setDetail).then(
    () => {
      state.done = true;
    },
    (err: unknown) => {
      state.error = err;
      state.done = true;
    },
  );

  while (!state.done) {
    // Ish tugasa darhol uyg'onadi — TICK_MS ni oxirigacha kutmaydi
    await Promise.race([task, sleep(TICK_MS)]);
    if (state.done) break;
    await writeProgress(run, index, Date.now() - startedAt, false, state.detail);
    await assertNotCanceled(run.jobId);
  }

  if (state.error !== null) throw state.error;
  run.stepMs[index] = Date.now() - startedAt;
  await writeProgress(run, index, run.stepMs[index], true, state.detail);
  await assertNotCanceled(run.jobId);
}

// ─────────────────────────── Bosqichlar ───────────────────────────

/** 1. API kalitni tekshirish va klientni tayyorlash */
async function stepAuth(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const account = await prisma.uzumAccount.findUnique({ where: { id: run.accountId } });
  if (!account) throw new Error('Uzum kabineti topilmadi');

  let apiKey: string;
  try {
    apiKey = decryptSecret(account.apiKeyEnc);
  } catch {
    throw new UzumAuthError('API kalitni ochib bo‘lmadi — kalitni qayta kiriting');
  }

  let apiSecret: string | null = null;
  if (account.apiSecretEnc) {
    try {
      apiSecret = decryptSecret(account.apiSecretEnc);
    } catch {
      apiSecret = null;
    }
  }

  const client = createUzumClient({ apiKey, apiSecret, seed: account.id });
  const check = await client.verify();
  if (!check.ok) {
    const message = check.message ?? 'Uzum API kaliti qabul qilinmadi';
    // Aloqa uzilishi yoki Uzum to'sig'i kalitning aybi emas: kabinet faol qoladi,
    // keyingi rejali sinxron o'zi qayta urinadi. Faqat haqiqiy rad etish — "yaroqsiz".
    if (check.temporary) throw withDiagnostic(new Error(message), check.diagnostic);
    throw withDiagnostic(new UzumAuthError(message), check.diagnostic);
  }

  run.client = client;
  setDetail('API kalit tasdiqlandi');
}

/** Kabinetga tegishli do'konlarni bazadan qayta o'qiydi */
async function reloadStores(run: SyncRun): Promise<void> {
  const rows = await prisma.store.findMany({
    where: { companyId: run.companyId, uzumAccountId: run.accountId },
    select: { id: true, uzumShopId: true, title: true },
    orderBy: { createdAt: 'asc' },
  });
  run.stores = rows
    .filter((r): r is { id: string; uzumShopId: string; title: string } => Boolean(r.uzumShopId))
    .map((r) => ({ id: r.id, uzumShopId: r.uzumShopId, title: r.title }));
}

/** 2. Do'konlar */
async function stepShops(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const shops = await requireClient(run).getShops();
  if (shops.length > 0) {
    const maxStores = getPlan(run.planId).limits.stores;
    const res = await upsertShops(run.companyId, run.accountId, shops, { maxStores });
    run.totals.shops = countOf(res);

    // Tarif chegarasiga tushgan do'konlar — sotuvchi buni bilishi kerak
    if (res.skipped.length > 0) {
      try {
        await notifyCompanyOwners(run.companyId, {
          type: 'warning',
          title: `${res.skipped.length} ta do‘kon ulanmadi`,
          body: `Tarifingizda ${maxStores} ta do‘kon mumkin. Ulanmaganlari: ${res.skipped.slice(0, 5).join(', ')}`,
          link: '/pricing',
          buttonText: 'Tarifni yangilash',
        });
      } catch (err) {
        log(`job ${run.jobId}: do‘kon chegarasi xabari yuborilmadi — ${errorMessage(err)}`);
      }
    }
  }
  await reloadStores(run);
  setDetail(
    run.stores.length > 0
      ? `${run.stores.length} ta do‘kon topildi`
      : 'Kabinetda do‘kon topilmadi — ma’lumot yig‘ilmaydi',
  );
}

/** 3. Mahsulotlar va SKU'lar */
async function stepProducts(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  for (const store of run.stores) {
    const products = await client.getProducts(store.uzumShopId);
    const res = await upsertProducts(store.id, products);
    run.totals.products += countOf(res);
    setDetail(`${run.totals.products} ta mahsulot/SKU yangilandi`);
  }
}

/** 4. Qoldiqlar va Uzum omboriga yetkazmalar (nakladnoylar) */
async function stepStocks(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  for (const store of run.stores) {
    const stocks = await client.getStocks(store.uzumShopId);
    const res = await upsertStocks(store.id, stocks);
    run.totals.stocks += countOf(res);
    setDetail(`${run.totals.stocks} ta qoldiq yozuvi sinxronlandi`);

    // Nakladnoy SKU'larni katalogga bog'laydi — mahsulotlar bosqichidan keyin turishi shart
    const invoices = await client.getInvoices(store.uzumShopId);
    const invRes = await upsertInvoices(run.companyId, store.id, invoices);
    run.totals.shipments += countOf(invRes);
    if (invRes.unlinkedItems > 0) {
      log(`job ${run.jobId}: ${invRes.unlinkedItems} ta nakladnoy pozitsiyasi katalogda topilmadi`);
    }
  }
}

/**
 * Yangi sotuv haqida kompaniya egalariga xabar.
 *
 * Spamdan himoya to'rt qatlamli:
 *  1) faqat inkremental sinxron — birinchi to'liq sinxron 365 kunlik tarixni tortadi;
 *  2) faqat oxirgi `SALE_NOTIFY_MAX_AGE_MS` ichida berilgan buyurtmalar;
 *  3) bitta sinxronda `SALE_NOTIFY_LIMIT` ta xabar — chegara DO'KON bo'yicha emas,
 *     butun yugurish bo'yicha (5 do'konli kompaniyada 5 barobar bo'lib ketmasin);
 *  4) sotuvchi sozlamada o'chirgan bo'lsa — `requireFlag` xabarni yaratmaydi.
 *
 * `budget` — qolgan xabarlar soni; funksiya yangilangan qiymatni qaytaradi.
 */
async function notifyNewSales(
  run: SyncRun,
  storeTitle: string,
  res: OrdersImportResult,
  budget: number,
): Promise<number> {
  // Yosh bo'yicha saralash importerda bajarilgan — bu yerdagilar allaqachon yangi
  const fresh = res.newSales;
  if (fresh.length === 0) return budget;

  const single = fresh.slice(0, Math.max(0, budget));
  for (const sale of single) {
    const more = sale.positions > 1 ? ` va yana ${sale.positions - 1} ta mahsulot` : '';
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      requireFlag: 'notifyOrders',
      title: `Sotildi: ${sale.title}`,
      body: `${sale.qty} dona · ${formatMoney(sale.amount, 'uz')}${more}
${storeTitle} · №${sale.uzumOrderId}`,
      link: `/sales?order=${encodeURIComponent(sale.uzumOrderId)}`,
      buttonText: 'Buyurtmani ko‘rish',
    });
  }

  /*
   * Qolganlari bitta yig'ma xabarda. Son `newSalesTotal` dan olinadi —
   * importer 50 tadan ortig'ini eslab qolmaydi, lekin sanab boradi.
   * Summani esa faqat to'liq ro'yxat bo'lgandagina ko'rsatamiz, aks holda
   * u haqiqiydan kam chiqib, sotuvchini chalg'itardi.
   */
  const restCount = res.newSalesTotal - single.length;
  if (restCount > 0) {
    const complete = res.newSalesTotal === fresh.length;
    const sum = fresh.slice(single.length).reduce((acc, sale) => acc + sale.amount, 0);
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      requireFlag: 'notifyOrders',
      title: `Yana ${restCount} ta sotuv`,
      body: complete ? `${storeTitle} · jami ${formatMoney(sum, 'uz')}` : storeTitle,
      link: '/sales',
      buttonText: 'Sotuvlarni ko‘rish',
    });
  }

  return budget - single.length;
}

/**
 * Buyurtma bekor qilingani yoki qaytarilgani haqida xabar.
 *
 * Sotuv xabari bilan bir xil sozlamaga (`notifyOrders`) bo'ysunadi: "sotildi"
 * deb yozgan bot o'sha buyurtma bekor bo'lganini ham aytishi kerak, aks holda
 * sotuvchi Telegramdagi sotuvlarni sanab, kabinetdagi tushumdan ko'p chiqaradi.
 * Faqat inkremental sinxronda va faqat shu sinxronda ro'y bergan o'zgarish.
 */
async function notifyOrderChanges(
  run: SyncRun,
  storeTitle: string,
  res: OrdersImportResult,
  budget: number,
): Promise<number> {
  if (res.changes.length === 0) return budget;

  const single = res.changes.slice(0, Math.max(0, budget));
  for (const change of single) {
    const returned = change.kind === 'returned';
    const money = change.amount > 0 ? ` · ${formatMoney(change.amount, 'uz')}` : '';
    // Bekor qilishda sabab doim bir xil ("olmasdan bekor qilindi") — faqat qaytarishda foydali
    const cause = returned && change.cause ? `\nSabab: ${change.cause}` : '';
    await notifyCompanyOwners(run.companyId, {
      type: 'warning',
      requireFlag: 'notifyOrders',
      title: `${returned ? 'Qaytarildi' : 'Bekor qilindi'}: ${change.title}`,
      body: `${change.qty} dona${money}${cause}
${storeTitle} · №${change.uzumOrderId}`,
      link: `/returns?kind=${change.kind}`,
      buttonText: returned ? 'Qaytarishlarni ko‘rish' : 'Bekor qilishlarni ko‘rish',
    });
  }

  const restCount = res.changesTotal - single.length;
  if (restCount > 0) {
    await notifyCompanyOwners(run.companyId, {
      type: 'warning',
      requireFlag: 'notifyOrders',
      title: `Yana ${restCount} ta bekor qilish yoki qaytarish`,
      body: storeTitle,
      link: '/returns?kind=all',
      buttonText: 'Ro‘yxatni ko‘rish',
    });
  }

  return budget - single.length;
}

/**
 * Xaridor buyurtmani qabul qilib olgani haqida xabar.
 *
 * Sotuvchi uchun bu "pul soati boshlandi" degani: Uzum pulni topshirilgandan
 * keyin `holdDays` kun ushlab turadi, shuning uchun xabarda ochilish kuni ham
 * aytiladi — Pul kalendaridagi sana bilan bir xil hisob (qabul vaqti + N × 24 soat).
 * Sotuv xabari bilan bir xil sozlamaga (`notifyOrders`) bo'ysunadi.
 */
async function notifyAccepted(
  run: SyncRun,
  storeTitle: string,
  res: OrdersImportResult,
  budget: number,
): Promise<number> {
  if (res.accepted.length === 0) return budget;

  const { holdDays } = await getPayoutRules(run.companyId);
  // Pul kalendari tarifda yopiq bo'lsa, havola yopiq sahifaga emas, buyurtmaning o'ziga olib boradi
  const calendarOpen = hasFeature(run.planId, 'unit_economics');
  const single = res.accepted.slice(0, Math.max(0, budget));
  for (const order of single) {
    const more = order.positions > 1 ? ` va yana ${order.positions - 1} ta mahsulot` : '';
    // "2026-10-23" → "23.10" (Toshkent kuni bo'yicha)
    const unlock = todayInBusinessTz(new Date(order.acceptedAt.getTime() + holdDays * 86_400_000));
    const unlockLabel = `${unlock.slice(8, 10)}.${unlock.slice(5, 7)}`;
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      requireFlag: 'notifyOrders',
      title: `Xaridor qabul qilib oldi: ${order.title}`,
      body: `${order.qty} dona · ${formatMoney(order.amount, 'uz')}${more}
Pul ${unlockLabel} da ochiladi
${storeTitle} · №${order.uzumOrderId}`,
      link: calendarOpen ? '/payout' : `/sales?order=${encodeURIComponent(order.uzumOrderId)}`,
      buttonText: calendarOpen ? 'Pul kalendarini ko‘rish' : 'Buyurtmani ko‘rish',
    });
  }

  const restCount = res.acceptedTotal - single.length;
  if (restCount > 0) {
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      requireFlag: 'notifyOrders',
      title: `Yana ${restCount} ta buyurtma qabul qilib olindi`,
      body: storeTitle,
      link: calendarOpen ? '/payout' : '/sales',
      buttonText: calendarOpen ? 'Pul kalendarini ko‘rish' : 'Sotuvlarni ko‘rish',
    });
  }

  return budget - single.length;
}

/**
 * Tovar balansidagi yangilik: yangi yo'qotish va yana ko'ringan dona.
 * Har biri bitta xabarda, tovarlar nomma-nom — sotuvchi qaysi tovar ekanini
 * sahifaga kirmasdan bilsin.
 */
async function notifyLossChanges(
  run: SyncRun,
  storeTitle: string,
  found: Awaited<ReturnType<typeof syncLossRecords>>,
): Promise<void> {
  if (found.found.length === 0 && found.recovered.length === 0) return;
  // Bo'lim tarifda ochiq bo'lmasa xabar yuborilmaydi — havola yopiq sahifaga olib borardi
  if (!hasFeature(run.planId, 'losses_report')) return;

  const ids = [...new Set([...found.found, ...found.recovered].map((r) => r.skuId))];
  const skus = await prisma.sku.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, title: true } });
  // Nom + SKU kodi: rangi boshqa ikki variantning nomi bir xil bo'lishi mumkin
  const nameOf = new Map(
    skus.map((s) => [s.id, s.title && s.title !== s.sku ? `${s.title.slice(0, 48)} (${s.sku})` : s.sku]),
  );
  const lines = (rows: { skuId: string; qty: number; note?: string }[]): string => {
    const shown = rows.slice(0, LOSS_NOTIFY_LINES).map((r) => `• ${nameOf.get(r.skuId) ?? 'Mahsulot'} — ${r.qty} dona${r.note ?? ''}`);
    if (rows.length > LOSS_NOTIFY_LINES) shown.push(`…va yana ${rows.length - LOSS_NOTIFY_LINES} ta tovar`);
    return shown.join('\n');
  };

  if (found.found.length > 0) {
    const KIND_NOTE: Record<LossKind, string> = {
      balance: '',
      counter: ' (Uzum belgilagan)',
      defect: ' (brak)',
      shortage: ' (qabulda kam chiqqan)',
    };
    const qty = found.found.reduce((s, r) => s + r.qty, 0);
    const amount = found.found.reduce((s, r) => s + r.amount, 0);
    await notifyCompanyOwners(run.companyId, {
      type: 'warning',
      title: `Yo‘qotilgan tovar aniqlandi: ${qty} dona`,
      body: `${lines(found.found.map((r) => ({ ...r, note: KIND_NOTE[r.kind] })))}
${storeTitle} · kompensatsiya taxminan ${formatMoney(amount, 'uz')}`,
      link: '/losses',
      buttonText: 'Tafsilotni ko‘rish',
    });
  }

  if (found.recovered.length > 0) {
    const qty = found.recovered.reduce((s, r) => s + r.qty, 0);
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      title: `Yo‘qolgan tovar topildi: ${qty} dona`,
      body: `${lines(found.recovered)}
${storeTitle} · ombor hisobida yana ko‘rindi`,
      link: '/losses',
      buttonText: 'Balansni ko‘rish',
    });
  }
}

/** 5. Buyurtmalar (eng uzun bosqich) */
async function stepOrders(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  // To'liq sinxronda yangi sotuvlar yig'ilmaydi — o'n minglab buyurtma keladi
  const collectNew = run.type === 'incremental';
  const collectNewSince = new Date(Date.now() - SALE_NOTIFY_MAX_AGE_MS);
  let budget = SALE_NOTIFY_LIMIT;
  let changeBudget = CHANGE_NOTIFY_LIMIT;
  let acceptBudget = ACCEPT_NOTIFY_LIMIT;
  const acceptedSince = new Date(Date.now() - ACCEPT_NOTIFY_MAX_AGE_MS);
  /*
   * Obuna tugagan: har buyurtma haqidagi xabar o'rniga sinxron oxirida bitta
   * taklif. Ilgari tarif tekshirilmasdi — sayt va API yopiq bo'lsa ham har bir
   * sotuv, bekor qilish va topshirish Telegramga summasi bilan kelaverardi.
   */
  const orderNotices = hasFeature(run.planId, 'telegram_notifications');
  /** Obuna tugaganda: shu sinxronda birinchi marta yuklangan buyurtmalar va o'zgarishlar bormi */
  let lockedNewOrders = 0;
  let lockedChanged = false;

  for (const store of run.stores) {
    const orders = await client.getOrders(store.uzumShopId, run.from, run.to);
    const res = await upsertOrders(store.id, orders, {
      taxRate: run.taxRate,
      collectNew,
      collectNewSince,
      acceptedSince,
    });
    run.totals.orders += countOf(res);
    setDetail(`${run.totals.orders} ta buyurtma yuklandi`);

    if (!collectNew) continue;
    if (!orderNotices) {
      /*
       * `res.created` — vaqt filtrisiz. `newSalesTotal` esa faqat so'nggi 6 soatdagi
       * sotuvlarni sanaydi (soatlik avto-sinxron uchun): obunasi tugagan kompaniya
       * faqat qo'lda, ko'pincha kunlar oralab sinxronlaydi va son kam chiqardi.
       */
      lockedNewOrders += res.created;
      lockedChanged ||= res.changesTotal + res.acceptedTotal > 0;
      continue;
    }
    /*
     * Xabar sinxron natijasiga ta'sir qilmaydi: xato bo'lsa bosqich baribir
     * muvaffaqiyatli hisoblanadi, aks holda bitta yiqilgan xabar butun
     * sinxronni qayta urinishga majbur qilardi.
     */
    try {
      budget = await notifyNewSales(run, store.title, res, budget);
      changeBudget = await notifyOrderChanges(run, store.title, res, changeBudget);
      acceptBudget = await notifyAccepted(run, store.title, res, acceptBudget);
    } catch (err) {
      log(`job ${run.jobId}: buyurtma xabari yuborilmadi — ${errorMessage(err)}`);
    }
  }

  if (lockedNewOrders > 0 || lockedChanged) {
    try {
      await notifyLockedOrders(run, lockedNewOrders, lockedChanged);
    } catch (err) {
      log(`job ${run.jobId}: tarif taklifi yuborilmadi — ${errorMessage(err)}`);
    }
  }
}

/**
 * Obunasi tugagan kompaniyaga: buyurtmalarda yangilik borligi — faqat soni,
 * tafsilotsiz (mahsulot, summa, buyurtma raqami yo'q) — va tarifni yangilash
 * taklifi. Bitta sinxronda bitta xabar. Sotuv xabarlari bilan bir xil
 * sozlamaga (`notifyOrders`) bo'ysunadi.
 *
 * O'zgarishlar soni yozilmaydi: hisoblagich buyurtmani emas, pozitsiyani sanaydi.
 */
async function notifyLockedOrders(run: SyncRun, newOrders: number, changed: boolean): Promise<void> {
  const what =
    newOrders > 0
      ? `${newOrders} ta yangi buyurtma yuklandi${changed ? ', mavjudlarida esa o‘zgarishlar bor' : ''}`
      : 'buyurtmalaringizda o‘zgarishlar (bekor qilish, qaytarish yoki topshirish) aniqlandi';
  await notifyCompanyOwners(run.companyId, {
    type: 'warning',
    requireFlag: 'notifyOrders',
    title: 'Buyurtmalarda yangilik bor',
    body: `Oxirgi sinxronda ${what}. Obuna muddati tugagani uchun tafsilotlar va har bir buyurtma haqidagi xabarlar to‘xtatilgan — tarifni yangilasangiz, darhol qaytadi.`,
    link: '/pricing',
    buttonText: 'Tarifni yangilash',
  });
}

/** 6. Moliya: xarajatlar va pullik saqlash */
async function stepFinance(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  for (const store of run.stores) {
    const [expenses, fees] = await Promise.all([
      client.getExpenses(store.uzumShopId, run.from, run.to),
      client.getStorageFees(store.uzumShopId, run.from, run.to),
    ]);
    const expRes = await upsertExpenses(run.companyId, store.id, expenses);
    const feeRes = await upsertStorageFees(store.id, fees);
    // Buyurtma logistikasi — nominal tarif emas, Uzum haqiqatda ushlagani (aksiyada 0)
    await applyActualLogistics(store.id, expenses);
    // Buyurtmalar shu paytgacha yozilgan — yechib olingan summa oshgan bo'lsa to'lovlar tarixiga tushadi
    await recordPayout(run.companyId, store.id, earlyFeeFrom(expenses));
    run.totals.expenses += countOf(expRes);
    run.totals.storage += countOf(feeRes);
    setDetail(`Xarajatlar: ${run.totals.expenses} · saqlash: ${run.totals.storage}`);
  }
}

/** 7. Qaytarishlar va yo'qotishlar */
async function stepReturns(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  for (const store of run.stores) {
    const [returns, losses] = await Promise.all([
      client.getReturns(store.uzumShopId, run.from, run.to),
      client.getLosses(store.uzumShopId, run.from, run.to),
    ]);
    const retRes = await upsertReturns(store.id, returns);
    const lossRes = await upsertLosses(store.id, losses);
    run.totals.returns += countOf(retRes);
    run.totals.losses += countOf(lossRes);

    /*
     * Tovar balansi: Uzum yo'qotishlar ro'yxatini bermaydi, shuning uchun
     * qabul, sotuv va qoldiq shu yerda solishtiriladi. Mahsulot, qoldiq,
     * nakladnoy va buyurtmalar shu sinxronning oldingi bosqichlarida
     * yangilangan — hammasi bir paytga tegishli.
     *
     * Xato sinxronni yiqitmaydi: bu qo'shimcha tahlil, asosiy ma'lumot emas.
     */
    try {
      const found = await syncLossRecords(store.id);
      run.totals.losses += found.created + found.updated;
      await notifyLossChanges(run, store.title, found);
    } catch (err) {
      log(`job ${run.jobId}: tovar balansi hisoblanmadi — ${errorMessage(err)}`);
    }
    setDetail(`Qaytarishlar: ${run.totals.returns} · yo‘qotishlar: ${run.totals.losses}`);
  }
}

/**
 * Oraliq sinxronda sharhlar shu kunlar ichida qayta o'qiladi: sotuvchi eski
 * sharhga Uzum kabinetida keyinroq javob yozsa ham, javob bu yerda paydo bo'lsin.
 */
const REVIEW_REFRESH_DAYS = 30;

/** 8. Sharhlar */
async function stepReviews(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  const since = run.type === 'full' ? run.from : addDays(run.to, -REVIEW_REFRESH_DAYS);
  for (const store of run.stores) {
    /*
     * Sharhlar mahsulot bo'yicha o'qiladi — faqat katalogda sharhi yoki reytingi
     * bor mahsulotlar so'raladi (Uzum `feedbackQuantity` ni beradi). Shunda yuzlab
     * mahsulotli do'konda ham har sinxronda ortiqcha so'rov ketmaydi.
     */
    const products = await prisma.product.findMany({
      where: { storeId: store.id, uzumProductId: { not: null }, OR: [{ reviewsCount: { gt: 0 } }, { rating: { gt: 0 } }] },
      select: { uzumProductId: true },
    });
    const productIds = products.map((p) => p.uzumProductId).filter((id): id is string => Boolean(id));
    const reviews = await client.getReviews(store.uzumShopId, since, run.to, productIds);
    const res = await upsertReviews(store.id, reviews);
    run.totals.reviews += countOf(res);
    setDetail(`${run.totals.reviews} ta sharh yig‘ildi`);
  }
}

/** Bir sinxronda qayta hisoblanadigan buyurtma pozitsiyalarining chegarasi */
const RECALC_FETCH_LIMIT = 5_000;
const RECALC_UPDATE_LIMIT = 2_000;

/**
 * Tannarx o'zgargan pozitsiyalar bo'yicha foydani qayta hisoblaydi.
 *
 * Import paytida `Sku.purchasePrice` hali 0 bo'lishi mumkin (foydalanuvchi keyin kiritadi),
 * shuning uchun har sinxronda davr ichidagi pozitsiyalar joriy tannarx bilan solishtiriladi:
 *     cogs = qty * sku.purchasePrice, otherCost = qty * sku.extraCost
 *     netProfit = payout - cogs - otherCost - revenue * taxRate / 100
 * Hajm cheklangan (eng yangi yozuvlar birinchi) — keyingi sinxronlarda qolganlari yetkaziladi.
 *
 * Formula `item-cost.ts` da — sotuvchi tannarxni saqlaganda products.ts o'sha
 * SKU'ning BUTUN tarixini aynan shu formula bilan darhol qayta hisoblaydi
 * (`recalcSkuOrderItems`). Bu bosqich esa Uzum bergan tannarx va boshqa
 * yo'llar bilan o'zgarganlarini sinxron oynasi ichida tutib qoladi (2026-10-24).
 */
async function recalcOrderItems(run: SyncRun, storeIds: string[]): Promise<number> {
  const skus = await prisma.sku.findMany({
    where: { storeId: { in: storeIds } },
    select: { id: true, purchasePrice: true, extraCost: true },
  });
  const costs = new Map(skus.map((s) => [s.id, { purchasePrice: s.purchasePrice, extraCost: s.extraCost }]));
  if (costs.size === 0) return 0;

  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: run.from }, order: { storeId: { in: storeIds } } },
    select: { id: true, skuId: true, qty: true, revenue: true, payout: true, purchasePrice: true, otherCost: true },
    orderBy: { orderedAt: 'desc' },
    take: RECALC_FETCH_LIMIT,
  });

  let updated = 0;
  for (const it of items) {
    if (updated >= RECALC_UPDATE_LIMIT) break;
    if (!it.skuId) continue;
    const cost = costs.get(it.skuId);
    if (!cost) continue;

    const next = itemCostFields(it, cost, run.taxRate);
    if (!itemCostChanged(it, next)) continue;

    await prisma.orderItem.update({
      where: { id: it.id },
      data: next,
    });
    updated += 1;
  }

  return updated;
}

/**
 * 9. Analitika: hosilaviy ko'rsatkichlarni qayta hisoblash.
 * ABC, unit-iqtisod va prognozlar so'rov paytida hisoblanadi, bu yerda esa bazaga
 * yoziladigan qiymatlar yangilanadi: mahsulot reytingi/sharhlar soni va pozitsiya foydasi.
 */
async function stepAnalytics(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const storeIds = run.stores.map((s) => s.id);
  if (storeIds.length === 0) {
    setDetail('Hisoblash uchun ma’lumot yo‘q');
    return;
  }

  const groups = await prisma.review.groupBy({
    by: ['productId'],
    where: { storeId: { in: storeIds }, productId: { not: null } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  let products = 0;
  for (const g of groups) {
    if (!g.productId) continue;
    try {
      await prisma.product.update({
        where: { id: g.productId },
        data: { rating: round(g._avg.rating ?? 0, 2), reviewsCount: g._count._all },
      });
      products += 1;
    } catch {
      // Mahsulot o'chirilgan bo'lishi mumkin — e'tiborsiz qoldiramiz
    }
  }

  const recalculated = await recalcOrderItems(run, storeIds);
  setDetail(`Qayta hisoblandi: ${products} ta mahsulot, ${recalculated} ta buyurtma pozitsiyasi`);
}

/** Bosqich id'i bo'yicha bajaruvchini tanlaydi */
function executeStep(step: SyncStepId, run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  switch (step) {
    case 'auth':
      return stepAuth(run, setDetail);
    case 'shops':
      return stepShops(run, setDetail);
    case 'products':
      return stepProducts(run, setDetail);
    case 'stocks':
      return stepStocks(run, setDetail);
    case 'orders':
      return stepOrders(run, setDetail);
    case 'finance':
      return stepFinance(run, setDetail);
    case 'returns':
      return stepReturns(run, setDetail);
    case 'reviews':
      return stepReviews(run, setDetail);
    case 'analytics':
      return stepAnalytics(run, setDetail);
    default:
      return Promise.resolve();
  }
}

// ─────────────────────────── Job hayot sikli ───────────────────────────

/** Job uchun kontekst tayyorlaydi (kompaniya, kabinet, tarif, ma'lumot oynasi) */
async function prepareRun(job: SyncJob, type: SyncJobType): Promise<SyncRun> {
  const company = await prisma.company.findUnique({
    where: { id: job.companyId },
    include: { subscription: true },
  });
  if (!company) throw new Error('Kompaniya topilmadi');

  const account = job.uzumAccountId
    ? await prisma.uzumAccount.findFirst({ where: { id: job.uzumAccountId, companyId: company.id } })
    : await prisma.uzumAccount.findFirst({ where: { companyId: company.id }, orderBy: { createdAt: 'asc' } });
  if (!account) throw new UzumAuthError('Uzum kabineti ulanmagan — avval API kalitni kiriting');

  const planId = activePlanId(company.subscription);
  const plan = getPlan(planId);
  const historyDays =
    type === 'full' ? Math.min(plan.limits.historyDays, MAX_HISTORY_DAYS) : INCREMENTAL_DAYS;

  const to = new Date();
  let from = addDays(to, -historyDays);

  /*
   * OYNANI OCHIQ BUYURTMALARGACHA KENGAYTIRAMIZ.
   *
   * Oraliq sinxron oxirgi 14 kunni qayta o'qiydi va oyna BUYURTMA SANASIGA
   * bog'langan. Bekor qilish yoki qaytarish esa ancha keyin sodir bo'ladi:
   * 4-sentabrda berilgan buyurtma 20-sentabrda bekor qilinsa, uning sanasi
   * allaqachon oynadan tashqarida qoladi va biz bekor qilinganini HECH QACHON
   * bilmaymiz — u bazada abadiy "tirik sotuv" bo'lib turaveradi, tushumni va
   * umumiy balansni oshirib ko'rsatadi. Aynan shu sabab kabinetdagi balans
   * bilan saytdagisi farq qilardi.
   *
   * Yechim: yakunlanmagan buyurtmalarning eng eskisigacha orqaga qaraymiz.
   * Yakunlangan (delivered/canceled/returned) buyurtmalar boshqa o'zgarmaydi,
   * shuning uchun ular oynani kengaytirmaydi va so'rov hajmi cheklangan
   * qoladi. Tarif tarixi chegarasidan orqaga o'tmaymiz.
   */
  /*
    * DIQQAT: `delivered` ham kiritilgan.
    *
    * Yetkazilgan buyurtma — aynan qaytarilishi MUMKIN bo'lgan buyurtma:
    * xaridor tovarni olgandan keyin bir necha kun yoki hafta o'tib
    * qaytaradi. Agar uni "yakunlangan" deb hisoblasak, qaytarilganini
    * hech qachon bilmaymiz va u bazada tirik sotuv bo'lib qolaveradi —
    * bekor qilingan buyurtmalarda aynan shu xato bo'lgan edi.
    *
    * Yetkazilganlari cheksiz emas, faqat qaytarish muddati ichidagilari
    * oynani kengaytiradi, shuning uchun so'rov hajmi cheklangan qoladi.
    */
  const returnEdge = addDays(to, -RETURN_WINDOW_DAYS);
  const oldestOpen = await prisma.order.findFirst({
    where: {
      store: { companyId: company.id },
      status: { notIn: ['canceled', 'returned'] },
      OR: [
        { status: { not: 'delivered' } },
        { deliveredAt: { gte: returnEdge } },
        // Yetkazilgan sanasi noma'lum bo'lsa buyurtma sanasiga tayanamiz
        { AND: [{ deliveredAt: null }, { orderedAt: { gte: returnEdge } }] },
      ],
    },
    orderBy: { orderedAt: 'asc' },
    select: { orderedAt: true },
  });
  const historyFloor = addDays(to, -Math.min(plan.limits.historyDays, MAX_HISTORY_DAYS));
  if (oldestOpen && oldestOpen.orderedAt < from) {
    from = oldestOpen.orderedAt < historyFloor ? historyFloor : oldestOpen.orderedAt;
  }

  const timings = await loadTimings(company.id, account.id, type);

  return {
    jobId: job.id,
    companyId: company.id,
    accountId: account.id,
    type,
    planId,
    // Muddati tugagan bo'lsa sutkalik oraliq emas: sinxron davomida to'lov kelsa, keyingisi sutkaga surilmasin
    syncIntervalMinutes: planId === 'expired' ? LAPSED_RECHECK_MINUTES : plan.limits.syncIntervalMinutes,
    taxRate: company.taxRate,
    from,
    to,
    client: null,
    stores: [],
    profile: timings.profile,
    calibrated: timings.calibrated,
    startedMs: Date.now(),
    stepMs: [],
    totals: emptyTotals(),
  };
}

/** Yakuniy xabar matni */
function summaryText(run: SyncRun): string {
  const t = run.totals;
  return [
    `Do‘konlar: ${run.stores.length}`,
    `mahsulot/SKU: ${t.products}`,
    `buyurtmalar: ${t.orders}`,
    `qoldiqlar: ${t.stocks}`,
    `yetkazmalar: ${t.shipments}`,
    `sharhlar: ${t.reviews}`,
  ].join(' · ');
}

/** Muvaffaqiyatli yakun: job, kabinet va kompaniya holatini yangilaydi */
async function finishJob(run: SyncRun): Promise<void> {
  const now = new Date();
  const summary = summaryText(run);

  const job = await prisma.syncJob.update({
    where: { id: run.jobId },
    data: {
      status: 'done',
      progress: 100,
      step: 'done',
      stepIndex: SYNC_STEPS.length,
      totalSteps: SYNC_STEPS.length,
      message: summary,
      error: null,
      etaSeconds: 0,
      finishedAt: now,
    },
    select: { startedAt: true },
  });

  /*
   * Oraliq sinxron BOSHLANGAN paytdan sanaladi: 30 daqiqalik tarifda u har
   * 30 daqiqada yuradi, "30 daqiqa + sinxron davomiyligi"da emas. Sinxron
   * oraliqdan uzoq cho'zilgan bo'lsa (birinchi to'liq yig'ish) — tugagan paytdan.
   */
  const fromStart = nextAutoSyncAt(job.startedAt ?? now, run.syncIntervalMinutes);
  const nextSyncAt = fromStart.getTime() > now.getTime() ? fromStart : nextAutoSyncAt(now, run.syncIntervalMinutes);

  await prisma.uzumAccount.update({
    where: { id: run.accountId },
    data: {
      status: 'active',
      lastError: null,
      lastSyncAt: now,
      nextSyncAt,
      syncIntervalM: run.syncIntervalMinutes,
    },
  });

  // Quyidagilar natijaga ta'sir qilmaydi — xatolik bo'lsa ham job muvaffaqiyatli hisoblanadi
  // Bosqichlar haqiqatda qancha davom etgani — keyingi sinxronning progressi va qolgan vaqti shundan
  try {
    if (run.stepMs.length === SYNC_STEPS.length) {
      const key = timingKey(run.type, run.accountId);
      const value = JSON.stringify(run.stepMs.map((ms) => Math.round(ms)));
      await prisma.companySetting.upsert({
        where: { companyId_key: { companyId: run.companyId, key } },
        create: { companyId: run.companyId, key, value },
        update: { value },
      });
    }
  } catch (err) {
    log(`job ${run.jobId}: davomiylik saqlanmadi — ${errorMessage(err)}`);
  }
  try {
    await prisma.company.update({
      where: { id: run.companyId },
      data: { onboardStep: 'done', onboarded: true },
    });

    // Inkremental (soatlik) sinxronlar haqida xabar yubormaymiz — spam bo'lmasligi uchun
    if (run.type === 'full') {
      await notifyCompanyOwners(run.companyId, {
        type: 'success',
        title: 'Ma’lumotlar tayyor',
        body: `Uzum kabinetingiz sinxronlandi. ${summary}`,
        link: '/dashboard',
      });
    }
  } catch (err) {
    log(`job ${run.jobId}: yakuniy bildirishnoma yuborilmadi — ${errorMessage(err)}`);
  }

  log(`job ${run.jobId} tugadi — ${summary}`);
}

/** Xatolik: 3 martagacha qayta urinish, keyin 'failed' */
async function failJob(
  job: SyncJob,
  run: SyncRun | null,
  err: unknown,
  failedStep: SyncStepId | null = null,
): Promise<void> {
  const jobId = job.id;
  const accountId = run?.accountId ?? job.uzumAccountId ?? null;

  if (err instanceof SyncCanceledError) {
    await prisma.syncJob.updateMany({
      where: { id: jobId, status: { in: ['queued', 'running'] } },
      data: { status: 'canceled', message: err.message, etaSeconds: 0, finishedAt: new Date() },
    });
    log(`job ${jobId} bekor qilindi`);
    return;
  }

  const message = errorMessage(err);
  const attempts = job.attempts + 1;
  const canRetry = attempts < MAX_ATTEMPTS;
  // Faqat log qatori uchun: "[auth] GET /v1/shops → HTTP 503: ..."
  const diagnostic = diagnosticOf(err);
  const detail = diagnostic ? ` [${failedStep ?? 'tayyorlash'}] ${diagnostic}` : '';

  if (canRetry) {
    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        attempts,
        error: message,
        message: `Xatolik: ${message}. Qayta urinish (${attempts}/${MAX_ATTEMPTS})`,
        scheduledAt: new Date(Date.now() + RETRY_BACKOFF_MS * attempts),
        startedAt: null,
      },
    });
    log(`job ${jobId} xato: ${message} — qayta urinish ${attempts}/${MAX_ATTEMPTS}${detail}`);
    return;
  }

  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: 'failed',
      attempts,
      error: message,
      message: 'Sinxronizatsiya bajarilmadi',
      etaSeconds: 0,
      finishedAt: new Date(),
    },
  });

  const keyRejected = err instanceof UzumAuthError;
  /*
   * Vaqtinchalik nosozlikda kabinet faol qoladi va sinxron har oraliqda qayta
   * urinadi — xabar esa faqat BIRINCHI marta yuboriladi. Aks holda Uzum bir
   * necha soat javob bermasa, sotuvchiga har 15 daqiqada bir xil xabar borardi.
   */
  let repeated = false;
  if (accountId) {
    try {
      const before = await prisma.uzumAccount.findUnique({ where: { id: accountId }, select: { lastError: true } });
      repeated = before?.lastError === message;
      await prisma.uzumAccount.update({
        where: { id: accountId },
        data: { lastError: message, ...(keyRejected ? { status: 'invalid' } : {}) },
      });
    } catch {
      // Kabinet o'chirilgan bo'lishi mumkin
    }
  }

  if (keyRejected || !repeated) {
    await notifyCompanyOwners(job.companyId, {
      type: 'danger',
      title: 'Sinxronizatsiya bajarilmadi',
      body: keyRejected
        ? `${message}. API kalitni tekshirib, qayta urinib ko‘ring.`
        : `${message}. Hech narsa qilish shart emas — aloqa tiklanganda sinxron o‘zi davom etadi.`,
      link: '/settings',
    });
  }

  log(`job ${jobId} muvaffaqiyatsiz: ${message}${detail}`);
}

/** Bitta jobni to'liq bajaradi. Hech qachon exception tashlamaydi. */
async function runJob(job: SyncJob): Promise<void> {
  const type: SyncJobType = job.type === 'incremental' ? 'incremental' : 'full';
  let run: SyncRun | null = null;
  /** Qaysi bosqichda yiqildi — faqat log uchun */
  let failedStep: SyncStepId | null = null;

  try {
    run = await prepareRun(job, type);
    const current = run;
    log(
      `job ${job.id} boshlandi (${type}, ` +
        (current.calibrated ? `oldingisi ${Math.round(sum(current.profile) / 1000)} s` : 'davomiyligi hali o‘lchanmagan') +
        ')',
    );

    for (let i = 0; i < SYNC_STEPS.length; i += 1) {
      const step = SYNC_STEPS[i];
      failedStep = step.id;
      await runStep(current, i, (setDetail) => executeStep(step.id, current, setDetail));
    }

    failedStep = null;
    await finishJob(current);
  } catch (err) {
    try {
      await failJob(job, run, err, failedStep);
    } catch (inner) {
      log(`job ${job.id} holatini yozib bo‘lmadi: ${errorMessage(inner)}`);
    }
  }
}

/** Uzilib qolgan (jarayon qulagan) joblarni qayta navbatga qo'yadi */
async function reviveStaleJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  await prisma.syncJob.updateMany({
    where: { status: 'running', updatedAt: { lt: cutoff } },
    data: { status: 'queued', message: 'Uzilgan jarayon qayta navbatga qo‘yildi', startedAt: null },
  });
}

/**
 * Navbatdagi joblarni oladi, atomik ravishda 'running' qiladi va bosqichma-bosqich bajaradi.
 * Qaytaradi: bajarilgan joblar soni. Jarayon davomida `Promise` ushlab turiladi —
 * shuning uchun ishchi (`worker/runner.ts`) qayta kirishdan himoyalangan bo'lishi shart.
 */
export async function runDueJobs(): Promise<number> {
  await reviveStaleJobs();

  const due = await prisma.syncJob.findMany({
    where: { status: 'queued', scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: CONCURRENCY,
    select: { id: true },
  });
  if (due.length === 0) return 0;

  const claimed: SyncJob[] = [];
  for (const d of due) {
    const job = await claimJob(d.id);
    if (job) claimed.push(job);
  }
  if (claimed.length === 0) return 0;

  await Promise.all(claimed.map((job) => runJob(job)));
  return claimed.length;
}

/**
 * Jobni atomik ravishda "band" qiladi: faqat `queued` holatdagi yozuv `running` ga o'tadi.
 * Bir nechta ishchi jarayon bo'lsa ham bitta job ikki marta bajarilmaydi.
 */
async function claimJob(id: string): Promise<SyncJob | null> {
  const res = await prisma.syncJob.updateMany({
    where: { id, status: 'queued' },
    data: {
      status: 'running',
      startedAt: new Date(),
      progress: 0,
      step: SYNC_STEPS[0].id,
      stepIndex: 0,
      totalSteps: SYNC_STEPS.length,
      error: null,
      message: SYNC_STEPS[0].hint.uz,
    },
  });
  if (res.count !== 1) return null;
  return prisma.syncJob.findUnique({ where: { id } });
}
