/**
 * 🔄 Qo'lda sinxron — doimiy menyu tugmasi, «📊 Bugungi hisobot» ostidagi
 * tugma va /sync buyrug'i (2026-11-12).
 *
 * Avtomatik sinxron tarif oralig'ida (30–60 daqiqa) yuradi, sotuvchi esa
 * ba'zan aynan hozirgi holatni ko'rmoqchi — masalan, Uzum ta'minlashni qabul
 * qilgan zahoti. Bot job'ni API bilan bitta navbatga (`SyncJob`) qo'yadi, uni
 * API ishchisi bajaradi (api worker/runner.ts — navbatni har 3 soniyada
 * ko'radi). Bot faqat holatni kuzatib, xabarni yangilaydi. Kalit ulanganda
 * ham bot job'ni xuddi shunday qo'yadi (data.ts → connectApiKey).
 *
 * Qoidalar saytdagi `POST /sync/start` (api routes/sync.ts → enqueueSync) bilan bir xil:
 *  • faqat ega va menejer;
 *  • kompaniyada navbatdagi/ketayotgan sinxron bo'lsa yangisi ochilmaydi — o'shanga qo'shiladi;
 *  • kabinet muvaffaqiyatli yig'ilgan bo'lsa — `incremental`, hali yig'ilmagan bo'lsa — `full`.
 * Bot bundan tashqari Uzum'ni asraydi: 2026-10-11 da Uzum server manzilimizni
 * to'sib qo'ygan, tugmani ketma-ket bosish ham o'sha yukni beradi:
 *  • ma'lumot FRESH_MS ichida yangilangan bo'lsa Uzum'ga qayta borilmaydi —
 *    o'sha raqamlar va qachon qayta so'rash mumkinligi ko'rsatiladi;
 *  • oxirgi urinish yaqinda yiqilgan bo'lsa RETRY_AFTER_FAIL_MS kutiladi.
 *
 * Kutayotgan xabarlar `CompanySetting` da ham saqlanadi (`bot:syncWait:<chat>:<xabar>`):
 * bot qayta ishga tushsa (deploy) ham «⏳» xabar osilib qolmaydi. `bot:` kalitlarini
 * sayt o'qimaydi va yozmaydi (api routes/company.ts), tiklashda esa har yozuv
 * qaytadan tekshiriladi — chat o'sha foydalanuvchiniki, u o'sha kompaniyada ega
 * yoki menejer, job o'sha kompaniyaniki.
 */
import { GrammyError, HttpError, type Api, type Bot, type InlineKeyboard } from 'grammy';
import { formatDuration, SYNC_STEPS } from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { tr, type BotLang } from '../i18n.js';
import { escapeHtml, loadCompany, t, type BotCompany, type BotContext } from './context.js';
import { reportKeyboard, siteKeyboard, syncKeyKeyboard, syncRetryKeyboard } from './keyboards.js';
import {
  asOfLine,
  buildReportView,
  canStartSync,
  clock,
  clockAfter,
  loadSyncInfo,
  requireCompany,
} from './report-view.js';
import { isReportPeriod, type ReportPeriod } from '../lib/dashboard-kpi.js';

// ─────────────────────────── Sozlamalar ───────────────────────────

/** Shundan yangi ma'lumot uchun Uzum'ga qayta borilmaydi */
const FRESH_MS = 5 * 60_000;
/** Oxirgi sinxron yiqilgandan keyin qayta urinishgacha kutish (job o'zi 3 marta urinib bo'lgan) */
const RETRY_AFTER_FAIL_MS = 2 * 60_000;
/** API ishchisidagi urinishlar soni — api services/sync.ts `MAX_ATTEMPTS` bilan bir xil */
const JOB_MAX_ATTEMPTS = 3;
/** Kutayotgan xabarlar shu oraliqda tekshiriladi (API ishchisining navbat oralig'i ham 3 s) */
const TICK_MS = 3_000;
/** Bitta xabarni foiz bilan shundan tez-tez tahrirlamaymiz (Telegram cheklovi) */
const EDIT_EVERY_MS = 4_000;
/** Shundan uzoq kutilsa — «odatdagidan uzoq» deb kuzatuv to'xtatiladi */
const WAIT_MAX_MS = 15 * 60_000;
/**
 * Yakuniy xabar Telegram (yoki tarmoq) vaqtincha javob bermagani uchun
 * yetmasa — shu oraliqlardan keyin yana urinamiz: jami 1 + 5 urinish, ~17
 * daqiqa. Doimiy 10 soniya bilan bir daqiqalik uzilish ham natijani yo'qotardi.
 */
const DELIVERY_BACKOFF_MS = [10_000, 30_000, 120_000, 300_000, 600_000];
/** Bitta chatda menyu tugmasini ketma-ket bosish (ikki marta tegish) e'tiborsiz */
const PRESS_GAP_MS = 2_500;
/** Kutayotgan xabar yozuvi: `CompanySetting.key` */
const WAIT_KEY = 'bot:syncWait:';
/** Qayta ishga tushganda shundan ko'p yozuv tiklanmaydi (eng yangilari olinadi) */
const RESTORE_MAX = 200;
/** Tiklash to'liq bo'lmasa (baza bandligi) — shuncha vaqtdan keyin yana urinadi */
const RESTORE_RETRY_MS = 60_000;
/** Natija tracker orqali yetkazilgan (job, chat) — kuzatuvchi (watcher) shuncha vaqt takrorlamaydi */
const DELIVERED_TTL_MS = 10 * 60_000;

const ACTIVE_STATUSES = ['queued', 'running'];

const JOB_SELECT = {
  id: true,
  companyId: true,
  uzumAccountId: true,
  status: true,
  progress: true,
  step: true,
  etaSeconds: true,
  attempts: true,
  finishedAt: true,
} as const;

interface JobRow {
  id: string;
  companyId: string;
  uzumAccountId: string | null;
  status: string;
  progress: number;
  step: string;
  etaSeconds: number;
  attempts: number;
  finishedAt: Date | null;
}

/** Kompaniyaning navbatdagi/ketayotgan ODDIY joblari (tarix yuklash — backfill — bunga kirmaydi) */
const activeWhere = (companyId: string) => ({
  companyId,
  status: { in: ACTIVE_STATUSES },
  type: { not: 'backfill' },
});

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[bot] sinxron: ${message}`);
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[bot] sinxron: ${message}`);
}

const errText = (err: unknown): string => (err instanceof Error && err.message ? err.message : String(err));

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

// ─────────────────────────── Navbatga qo'yish ───────────────────────────

export type SyncDecision =
  /** Yangi job ochildi yoki ketayotganiga qo'shildi */
  | { kind: 'started' | 'joined'; job: JobRow }
  /** Ma'lumot hozirgina yangilangan — Uzum'ga borilmadi */
  | { kind: 'fresh'; lastSyncAt: Date }
  /** Shu kabinetning oxirgi urinishi yaqinda yiqilgan — `retryAt` gacha kutiladi */
  | { kind: 'recent_fail'; failedAt: Date; retryAt: Date }
  /** Barcha kabinetlarning kaliti yaroqsiz — sinxron baribir yiqiladi */
  | { kind: 'key_invalid' }
  | { kind: 'no_account' };

/** Shu kabinetning oxirgi muvaffaqiyatli shu turdagi sinxroni necha soniya davom etgani (bo'lmasa 0) */
async function recentSeconds(companyId: string, accountId: string, type: string): Promise<number> {
  const last = await prisma.syncJob.findFirst({
    where: {
      companyId,
      uzumAccountId: accountId,
      type,
      status: 'done',
      startedAt: { not: null },
      finishedAt: { not: null },
    },
    orderBy: { finishedAt: 'desc' },
    select: { startedAt: true, finishedAt: true },
  });
  if (!last?.startedAt || !last.finishedAt) return 0;
  const seconds = Math.round((last.finishedAt.getTime() - last.startedAt.getTime()) / 1000);
  return seconds > 0 ? Math.min(seconds, 3600) : 0;
}

/**
 * Kompaniya uchun sinxron so'raydi: kerak bo'lsa navbatga job qo'yadi,
 * kerak bo'lmasa sababini qaytaradi. Xabar yubormaydi — faqat qaror.
 */
export async function requestSync(companyId: string, now = new Date()): Promise<SyncDecision> {
  const active = await prisma.syncJob.findFirst({
    where: activeWhere(companyId),
    orderBy: { createdAt: 'desc' },
    select: JOB_SELECT,
  });
  if (active) return { kind: 'joined', job: active };

  const accounts = await prisma.uzumAccount.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, lastSyncAt: true },
  });
  if (accounts.length === 0) return { kind: 'no_account' };

  /*
   * Bitta job bitta kabinetni sinxronlaydi (api prepareRun — `job.uzumAccountId`).
   * Sayt (enqueueSync) kompaniyaning eng birinchi kabinetini oladi, bot esa
   * ishlayotganlar ichidan ENG ESKIRGANINI:
   *  • eski kalit o'chirilib yangisi ulangan kompaniyada birinchi kabinet
   *    'invalid' bo'lib qolgan bo'lishi mumkin — unga job faqat "kalit
   *    yaroqsiz" bilan yiqilardi (2026-10-28, 2026-10-31);
   *  • bir nechta kabinetda "yangi" tekshiruvi aynan sinxronlanadigan kabinetga
   *    qarashi kerak: biri 2 daqiqa, ikkinchisi bir soat oldin yangilangan
   *    bo'lsa, eskisi sinxronlanadi — "yangi" deb rad etilmaydi.
   */
  const live = accounts.filter((a) => a.status === 'active');
  const pool = live.length > 0 ? live : accounts.filter((a) => a.status !== 'invalid');
  if (pool.length === 0) return { kind: 'key_invalid' };
  const syncedAt = (a: { lastSyncAt: Date | null }): number => a.lastSyncAt?.getTime() ?? 0;
  const account = pool.reduce((stalest, a) => (syncedAt(a) < syncedAt(stalest) ? a : stalest));

  if (account.lastSyncAt && now.getTime() - account.lastSyncAt.getTime() < FRESH_MS) {
    return { kind: 'fresh', lastSyncAt: account.lastSyncAt };
  }

  // Aynan shu kabinetning oxirgi urinishi: boshqa kabinetning kaliti yiqilgani sog'lomini to'smaydi
  const last = await prisma.syncJob.findFirst({
    where: { companyId, uzumAccountId: account.id, type: { not: 'backfill' } },
    orderBy: { createdAt: 'desc' },
    select: { status: true, finishedAt: true },
  });
  if (last?.status === 'failed' && last.finishedAt && now.getTime() - last.finishedAt.getTime() < RETRY_AFTER_FAIL_MS) {
    return {
      kind: 'recent_fail',
      failedAt: last.finishedAt,
      retryAt: new Date(last.finishedAt.getTime() + RETRY_AFTER_FAIL_MS),
    };
  }

  const [accountDone, companyDone] = await Promise.all([
    prisma.syncJob.count({
      where: { companyId, uzumAccountId: account.id, status: 'done', type: { not: 'backfill' } },
    }),
    prisma.syncJob.count({ where: { companyId, status: 'done', type: { not: 'backfill' } } }),
  ]);
  // Kabinet hali bir marta ham yig'ilmagan bo'lsa — to'liq (saytda yangi kabinet ham 'full' bilan boshlanadi)
  const type = accountDone > 0 ? 'incremental' : 'full';

  const created = await prisma.syncJob.create({
    data: {
      companyId,
      uzumAccountId: account.id,
      type,
      status: 'queued',
      progress: 0,
      step: 'queued',
      stepIndex: 0,
      totalSteps: SYNC_STEPS.length,
      message: 'Navbatda — tez orada boshlanadi',
      // Taxmin: oxirgi shunday sinxron qancha davom etgani. Ishchi boshlaganda o'zi aniqlaydi
      etaSeconds: await recentSeconds(companyId, account.id, type),
      scheduledAt: now,
    },
    select: JOB_SELECT,
  });

  /*
   * Poyga: shu millisekundlarda rejali sinxron (api scheduleRecurring) yoki
   * saytdagi tugma ham job ochgan bo'lishi mumkin. Ishchi bitta kompaniyaning
   * ikki oddiy jobini parallel bajarib yuborardi — eng birinchisi qoladi,
   * bizniki (hali olinmagan bo'lsa) o'chiriladi.
   */
  const first = await prisma.syncJob.findFirst({
    where: activeWhere(companyId),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: JOB_SELECT,
  });
  if (first && first.id !== created.id) {
    const removed = await prisma.syncJob.deleteMany({ where: { id: created.id, status: 'queued' } });
    if (removed.count === 1) return { kind: 'joined', job: first };
  }

  // Kompaniyaning birinchi yig'ishi — sayt (enqueueSync) kabi onboarding qadami ham "syncing"
  if (companyDone === 0) {
    try {
      await prisma.company.update({ where: { id: companyId }, data: { onboardStep: 'syncing' } });
    } catch {
      // onboarding qadami muhim emas — sinxron baribir ketadi
    }
  }

  log(`job ${created.id} navbatga qo‘yildi (${type}, kompaniya ${companyId})`);
  return { kind: 'started', job: created };
}

// ─────────────────────────── Kutayotgan xabarlar ───────────────────────────

/**
 * 'status' — alohida «⏳ Sinxronlanmoqda…» xabari (menyu, /sync, «Qayta urinish»);
 * 'report' — hisobot xabarining o'zi (uning ostidagi tugma): kutish paytida faqat
 * tugma foizga aylanadi, matn joyida qoladi.
 */
type WaitMode = 'status' | 'report';

/** Bazada saqlanadigan qism — bot qayta ishga tushsa shundan tiklanadi */
interface Waiter {
  jobId: string;
  companyId: string;
  userId: string;
  chatId: number;
  messageId: number;
  lang: BotLang;
  /** Tugagach chiziladigan hisobot davri */
  period: ReportPeriod;
  mode: WaitMode;
  /** ms */
  createdAt: number;
}

/** Xotiradagi holat */
interface LiveWaiter extends Waiter {
  /** Tugmada ko'rsatiladigan foiz — kamaymaydi (qayta urinishda 60% → 0% sakramasin) */
  progress: number;
  /** Tugmada oxirgi chizilgan foiz (-1 — hali chizilmagan) — o'zgarmasa tahrir yuborilmaydi */
  renderedPct: number;
  /** Holat xabarida oxirgi ko'rsatilgan holat va tahrir vaqti */
  shown: string;
  editedAt: number;
  /** Yakuniy xabarni yetkazish urinishlari va keyingi urinish vaqti (ms) */
  attempts: number;
  retryAt: number;
}

const waiters = new Map<string, LiveWaiter>();

const keyOf = (chatId: number, messageId: number): string => `${chatId}:${messageId}`;
const settingKey = (w: Pick<Waiter, 'chatId' | 'messageId'>): string => `${WAIT_KEY}${keyOf(w.chatId, w.messageId)}`;

function pickWaiter(w: Waiter): Waiter {
  return {
    jobId: w.jobId,
    companyId: w.companyId,
    userId: w.userId,
    chatId: w.chatId,
    messageId: w.messageId,
    lang: w.lang,
    period: w.period,
    mode: w.mode,
    createdAt: w.createdAt,
  };
}

function liveWaiter(w: Waiter, progress: number, renderedPct: number, shown: string, editedAt: number): LiveWaiter {
  return { ...pickWaiter(w), progress, renderedPct, shown, editedAt, attempts: 0, retryAt: 0 };
}

/** Bazadagi yozuvni tekshirib o'qiydi (buzilgan yoki eski shakl — null) */
function parseWaiter(raw: string): Waiter | null {
  try {
    const v = JSON.parse(raw) as Partial<Waiter>;
    const ok =
      typeof v.jobId === 'string' &&
      typeof v.companyId === 'string' &&
      typeof v.userId === 'string' &&
      Number.isSafeInteger(v.chatId) &&
      Number.isSafeInteger(v.messageId) &&
      (v.lang === 'uz' || v.lang === 'ru' || v.lang === 'en') &&
      isReportPeriod(v.period) &&
      (v.mode === 'status' || v.mode === 'report') &&
      typeof v.createdAt === 'number' &&
      Number.isFinite(v.createdAt);
    return ok ? pickWaiter(v as Waiter) : null;
  } catch {
    return null;
  }
}

async function persist(w: Waiter): Promise<void> {
  const key = settingKey(w);
  const value = JSON.stringify(pickWaiter(w));
  await prisma.companySetting.upsert({
    where: { companyId_key: { companyId: w.companyId, key } },
    create: { companyId: w.companyId, key, value },
    update: { value },
  });
}

async function forget(w: Waiter): Promise<void> {
  await prisma.companySetting.deleteMany({ where: { companyId: w.companyId, key: settingKey(w) } });
}

/** Holat xabari: foiz o'zgarishi 5 punktdan kichik bo'lsa qayta tahrirlanmaydi */
const shownKey = (job: Pick<JobRow, 'status' | 'step' | 'progress' | 'attempts'>): string =>
  `${job.status}:${job.attempts}:${job.step}:${Math.floor(clampPct(job.progress) / 5)}`;

async function track(w: Waiter, job: JobRow): Promise<void> {
  const pct = clampPct(job.progress);
  waiters.set(keyOf(w.chatId, w.messageId), liveWaiter(w, pct, pct, shownKey(job), Date.now()));
  try {
    await persist(w);
  } catch (err) {
    // Saqlanmasa ham kuzatuv xotirada davom etadi — faqat qayta ishga tushishda yo'qoladi
    warn(`kutish yozuvi saqlanmadi (${w.chatId}): ${errText(err)}`);
  }
}

/** (job, chat) → natija tracker orqali yetkazilgan payt (ms) */
const deliveredTo = new Map<string, number>();

/**
 * Shu chat shu job natijasini tracker'dan oladimi (kutyapti yoki yaqinda
 * olgan). Kuzatuvchi (jobs/watcher.ts) birinchi to'liq sinxron haqida
 * egalarga alohida xabar yuboradi — sinxronni botdan boshlagan egaga o'sha
 * natija ikkinchi marta bormasin (2026-11-12 tekshiruvi).
 */
export function followsJob(jobId: string, chatId: string | number): boolean {
  const chat = String(chatId);
  for (const w of waiters.values()) if (w.jobId === jobId && String(w.chatId) === chat) return true;
  const at = deliveredTo.get(`${jobId}:${chat}`);
  return at !== undefined && Date.now() - at < DELIVERED_TTL_MS;
}

function noteDelivered(w: Waiter): void {
  const now = Date.now();
  deliveredTo.set(`${w.jobId}:${w.chatId}`, now);
  if (deliveredTo.size > 500) {
    for (const [key, at] of deliveredTo) if (now - at > DELIVERED_TTL_MS) deliveredTo.delete(key);
  }
}

/**
 * Bazadagi kutish yozuvini bot o'zi yozganmi: chat o'sha foydalanuvchiniki
 * (bot faqat shaxsiy chatda ishlaydi — chat raqami = Telegram ID), u kompaniyada
 * ega yoki menejer, job bor va o'sha kompaniyaniki. Aks holda yozuv bo'yicha
 * hech kimga hech narsa yozilmaydi — soxta yozuv botni begona (yoki hamkasb)
 * chatiga yozishga majburlay olmasin (2026-11-12 tekshiruvi).
 */
async function trusted(w: Waiter): Promise<boolean> {
  const [user, member, job] = await Promise.all([
    prisma.user.findUnique({ where: { id: w.userId }, select: { telegramId: true, botChatId: true } }),
    prisma.membership.findUnique({
      where: { userId_companyId: { userId: w.userId, companyId: w.companyId } },
      select: { role: true },
    }),
    prisma.syncJob.findUnique({ where: { id: w.jobId }, select: { companyId: true } }),
  ]);
  const chat = String(w.chatId);
  return Boolean(
    user &&
      (user.telegramId === chat || user.botChatId === chat) &&
      canStartSync(member) &&
      job &&
      job.companyId === w.companyId,
  );
}

/**
 * Bot qayta ishga tushganda: bazadagi kutayotgan xabarlarni tekshirib, xotiraga
 * qaytaradi. Eski bo'lsa ham haqiqiy yozuv tiklanadi — keyingi tik uni
 * yakunlaydi (natija yoki «odatdagidan uzoq»): bot uzoq to'xtab qolganda xabar
 * «⏳» da osilib qolmasin. `pending` — tekshirib bo'lmagan (baza xatosi)
 * yozuvlar: ular qoladi va tiklash keyinroq yana yuradi.
 */
export async function restoreSyncWaiters(now = Date.now()): Promise<{ restored: number; pending: number }> {
  const rows = await prisma.companySetting.findMany({
    where: { key: { startsWith: WAIT_KEY } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, companyId: true, key: true, value: true },
  });
  let restored = 0;
  let pending = 0;
  for (const row of rows) {
    try {
      const w = parseWaiter(row.value);
      if (!w || w.companyId !== row.companyId || settingKey(w) !== row.key || w.createdAt > now + 60_000) {
        // Buzilgan yoki bot yozmagan yozuv — o'chiriladi, hech kimga hech narsa yuborilmaydi
        await prisma.companySetting.deleteMany({ where: { id: row.id } });
        continue;
      }
      // Oldingi (chala) tiklashda olingan — xotirada bor
      if (waiters.has(keyOf(w.chatId, w.messageId))) continue;

      if (restored < RESTORE_MAX && (await trusted(w))) {
        waiters.set(keyOf(w.chatId, w.messageId), liveWaiter(w, 0, -1, '', 0));
        restored += 1;
        continue;
      }
      await prisma.companySetting.deleteMany({ where: { id: row.id } });
    } catch (err) {
      pending += 1;
      warn(`kutish yozuvi tekshirilmadi (${row.key}): ${errText(err)}`);
    }
  }
  return { restored, pending };
}

/**
 * Hisobot xabarida davr almashtirildi (`rep:` tugmasi). Shu xabar sinxronni
 * kutayotgan bo'lsa — tugagach yangi tanlangan davr chiziladi, hozircha esa
 * tugma o'rnida foiz qoladi. Qaytaradi: foiz yoki null (xabar kutmayapti).
 */
export function noteReportPeriod(chatId: number, messageId: number, period: ReportPeriod): number | null {
  const w = waiters.get(keyOf(chatId, messageId));
  if (!w || w.mode !== 'report') return null;
  if (w.period !== period) {
    w.period = period;
    void persist(w).catch((err: unknown) => warn(`davr saqlanmadi (${chatId}): ${errText(err)}`));
  }
  return w.progress;
}

/** Shu hisobot xabari hali sinxronni kutyaptimi (davr almashtirish oralig'ida sinxron tugagan bo'lishi mumkin) */
export function isSyncWaiting(chatId: number, messageId: number): boolean {
  return waiters.get(keyOf(chatId, messageId))?.mode === 'report';
}

// ─────────────────────────── Matn va yetkazish ───────────────────────────

/** «⏳ Sinxronlanmoqda… 45% · Qoldiqlar», qayta urinish yoki boshlanmagan bo'lsa — taxminiy davomiylik */
export function statusText(
  lang: BotLang,
  job: Pick<JobRow, 'status' | 'progress' | 'step' | 'etaSeconds' | 'attempts'>,
): string {
  // Urinish yiqilib, job qayta navbatda (api failJob): foiz va ETA o'sha yiqilgan urinishniki
  if (job.status === 'queued' && job.attempts > 0) {
    return tr(lang, 'sync_retrying', { n: Math.min(job.attempts + 1, JOB_MAX_ATTEMPTS), max: JOB_MAX_ATTEMPTS });
  }
  const step = SYNC_STEPS.find((s) => s.id === job.step);
  if (job.status === 'running' && step) {
    return tr(lang, 'sync_progress', { progress: clampPct(job.progress), step: escapeHtml(step.label[lang]) });
  }
  const eta =
    job.etaSeconds >= 5 && job.etaSeconds <= 30 * 60
      ? tr(lang, 'sync_eta', { duration: formatDuration(job.etaSeconds, lang) })
      : '';
  return tr(lang, 'sync_started', { eta });
}

function isNotModified(err: unknown): boolean {
  return err instanceof GrammyError && /message is not modified/i.test(err.description);
}

/**
 * Vaqtinchalik xato (tarmoq, Telegram 429 yoki 5xx) — kamida necha ms kutish
 * kerak (429 da Telegram aytgan `retry_after`, boshqasida 0); doimiy xato
 * (xabar o'chirilgan, bot bloklangan) — null.
 */
function transientDelay(err: unknown): number | null {
  if (err instanceof HttpError) return 0;
  if (err instanceof GrammyError) {
    if (err.error_code === 429) return Math.max(1, err.parameters?.retry_after ?? 10) * 1000;
    if (err.error_code >= 500) return 0;
  }
  return null;
}

type Delivery = { status: 'ok'; messageId: number } | { status: 'retry'; afterMs: number } | { status: 'gone' };

const NO_PREVIEW = { is_disabled: true } as const;

/**
 * Xabarni almashtiradi. Vaqtinchalik xatoda yangi xabar YUBORILMAYDI ('retry'):
 * tarmoq uzilgan bo'lsa tahrir aslida o'tgan bo'lishi mumkin va ikkinchi nusxa
 * chiqardi — qayta urinishda Telegram "not modified" deydi va bu muvaffaqiyat.
 * Xabarni tahrirlab bo'lmasa (o'chirilgan va h.k.) va `fallback` bo'lsa —
 * natija yangi xabar bilan yetkaziladi.
 */
async function deliver(
  api: Api,
  chatId: number,
  messageId: number,
  text: string,
  markup?: InlineKeyboard,
  fallback = true,
): Promise<Delivery> {
  try {
    await api.editMessageText(chatId, messageId, text, {
      parse_mode: 'HTML',
      reply_markup: markup,
      link_preview_options: NO_PREVIEW,
    });
    return { status: 'ok', messageId };
  } catch (err) {
    if (isNotModified(err)) return { status: 'ok', messageId };
    const wait = transientDelay(err);
    if (wait !== null) return { status: 'retry', afterMs: wait };
    if (!fallback) return { status: 'gone' };
  }
  try {
    const sent = await api.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: markup,
      link_preview_options: NO_PREVIEW,
    });
    return { status: 'ok', messageId: sent.message_id };
  } catch (err) {
    // Tarmoq xatosida xabar aslida ketgan bo'lishi mumkin — qayta yuborsak ikki nusxa chiqardi
    if (err instanceof HttpError) return { status: 'gone' };
    const wait = transientDelay(err);
    return wait !== null ? { status: 'retry', afterMs: wait } : { status: 'gone' };
  }
}

async function editMarkup(api: Api, chatId: number, messageId: number, markup: InlineKeyboard): Promise<void> {
  try {
    await api.editMessageReplyMarkup(chatId, messageId, { reply_markup: markup });
  } catch {
    // "not modified" yoki xabar o'chirilgan — kutish baribir davom etadi
  }
}

type Outcome = 'done' | 'failed' | 'canceled' | 'slow';

function bannerFor(lang: BotLang, outcome: Outcome): string {
  switch (outcome) {
    case 'done':
      return tr(lang, 'sync_banner_done');
    case 'failed':
      return tr(lang, 'sync_fail_temp');
    case 'canceled':
      return tr(lang, 'sync_canceled');
    default:
      return tr(lang, 'sync_slow');
  }
}

/**
 * API kalit ishlamay qolganda nima deyiladi. Botdagi «🔑 API kalitni yangilash»
 * kompaniyaning ENG BIRINCHI kabinetini yangilaydi (data.ts connectApiKey) —
 * shuning uchun u faqat kabinet bitta bo'lsa yoki aynan birinchisi yiqilgan
 * bo'lsa taklif qilinadi. Aks holda yangi kalit birinchi (sog'lom) kabinet
 * ustiga yozilib, uning do'konlari jim to'xtab qolardi (2026-11-12 tekshiruvi) —
 * shunda saytdagi Sozlamalar ko'rsatiladi. A'zo kalitni umuman yangilay
 * olmaydi — egasiga aytadi. Kuzatuvchi (jobs/watcher.ts) ham shundan foydalanadi
 * (loadKeyFailInfo + keyFailText).
 */
export interface KeyFailInfo {
  /** Botdagi kalitni yangilash aynan yiqilgan kabinetga tegadimi */
  viaBot: boolean;
  /** Yiqilgan kabinet nomi matnda (bo'sh — noma'lum yoki bitta kabinet) */
  cabinet: string;
}

/** Kalit xabari uchun ma'lumot (bazadan) — matndan alohida: kuzatuvchi uni xabar belgisidan oldin o'qiydi */
export async function loadKeyFailInfo(companyId: string, failedAccountId: string | null): Promise<KeyFailInfo> {
  const accounts = await prisma.uzumAccount.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, keyHint: true },
  });
  if (accounts.length <= 1 || (failedAccountId !== null && failedAccountId === accounts[0]?.id)) {
    return { viaBot: true, cabinet: '' };
  }
  const failed = failedAccountId ? accounts.find((a) => a.id === failedAccountId) : undefined;
  const cabinet = failed
    ? ` (${escapeHtml(failed.label)}${failed.keyHint ? ` …${escapeHtml(failed.keyHint)}` : ''})`
    : '';
  return { viaBot: false, cabinet };
}

export function keyFailText(
  lang: BotLang,
  role: string | undefined,
  info: KeyFailInfo,
): { text: string; markup?: InlineKeyboard } {
  if (role !== 'owner') return { text: tr(lang, 'sync_fail_key_member') };
  return info.viaBot
    ? { text: tr(lang, 'sync_fail_key'), markup: syncKeyKeyboard(lang) }
    : { text: tr(lang, 'sync_fail_key_site', { cabinet: info.cabinet }), markup: siteKeyboard(lang, '/settings') };
}

async function keyFailView(
  lang: BotLang,
  role: string | undefined,
  companyId: string,
  failedAccountId: string | null,
): Promise<{ text: string; markup?: InlineKeyboard }> {
  if (role !== 'owner') return keyFailText(lang, role, { viaBot: false, cabinet: '' });
  return keyFailText(lang, role, await loadKeyFailInfo(companyId, failedAccountId));
}

/**
 * Yakuniy ko'rinish. Har natija (tayyor, yiqildi, bekor, uzoq) hisobot bilan
 * tugaydi: tepada holat qatori, ostida raqamlar va ular qaysi paytniki
 * (report-view.ts asOfLine). Kalit yaroqsiz bo'lsa — faqat shu haqida.
 *
 * Baza xatosi yuqoriga chiqadi — finish() keyinroq qayta uradi. Faqat oxirgi
 * urinishda (`lastTry`) qisqa ko'rinish beriladi: hech narsa yetkazmagandan yaxshi.
 */
async function finalView(
  w: Waiter,
  outcome: Outcome,
  job: JobRow | null,
  lastTry: boolean,
): Promise<{ text: string; markup?: InlineKeyboard }> {
  const banner = bannerFor(w.lang, outcome);
  try {
    const company = await loadCompany(w.userId);
    const own = company && company.id === w.companyId ? company : null;

    if (outcome === 'failed' && job?.uzumAccountId) {
      const account = await prisma.uzumAccount.findUnique({
        where: { id: job.uzumAccountId },
        select: { status: true },
      });
      if (account?.status === 'invalid') return await keyFailView(w.lang, own?.role, w.companyId, job.uzumAccountId);
    }

    if (own) {
      const view = await buildReportView(w.lang, own, w.period, { banner });
      if (view) return view;
    }
  } catch (err) {
    if (!lastTry) throw err;
    warn(`yakuniy hisobot chizilmadi, qisqa ko‘rinish (${w.chatId}): ${errText(err)}`);
  }
  return { text: banner, markup: outcome === 'done' ? siteKeyboard(w.lang) : syncRetryKeyboard(w.lang) };
}

async function finish(api: Api, w: LiveWaiter, outcome: Outcome, job: JobRow | null, now: number): Promise<void> {
  const key = keyOf(w.chatId, w.messageId);
  // Avval xotiradan — shu tik ichida ikkinchi marta yakunlanmasin
  waiters.delete(key);

  const backoff = DELIVERY_BACKOFF_MS[w.attempts];
  let result: Delivery;
  try {
    const view = await finalView(w, outcome, job, backoff === undefined);
    result = await deliver(api, w.chatId, w.messageId, view.text, view.markup);
  } catch (err) {
    warn(`yakuniy xabar tayyorlanmadi (${w.chatId}): ${errText(err)}`);
    result = { status: 'retry', afterMs: 0 };
  }

  // Vaqtinchalik xato — yozuv bazada qoladi, keyingi tiklarda (va qayta ishga tushishda) yana
  if (result.status === 'retry' && backoff !== undefined) {
    waiters.set(key, {
      ...w,
      // Job tugagan — «⏳» tugmasi bosilsa 100% ko'rinsin, 0% emas
      progress: outcome === 'done' ? 100 : w.progress,
      attempts: w.attempts + 1,
      // Hisob tik boshidan emas, xato bo'lgan paytdan: Telegram'ning `retry_after` i qisqarmasin
      retryAt: Math.max(now, Date.now()) + Math.max(backoff, result.afterMs),
    });
    return;
  }
  if (result.status === 'ok') noteDelivered(w);
  await forget(w).catch((err: unknown) => warn(`kutish yozuvi o‘chmadi (${w.chatId}): ${errText(err)}`));
}

async function advance(api: Api, w: LiveWaiter, job: JobRow | null, now: number): Promise<void> {
  if (w.retryAt > now) return;
  if (!job || job.status === 'canceled') return finish(api, w, 'canceled', job, now);
  if (job.status === 'done') return finish(api, w, 'done', job, now);
  if (job.status === 'failed') return finish(api, w, 'failed', job, now);
  if (now - w.createdAt > WAIT_MAX_MS) return finish(api, w, 'slow', job, now);

  // Qayta urinishda ishchi foizni 0 dan boshlaydi — tugmadagi foiz orqaga qaytmaydi
  w.progress = Math.max(w.progress, clampPct(job.progress));
  if (now - w.editedAt < EDIT_EVERY_MS) return;

  if (w.mode === 'status') {
    const shown = shownKey(job);
    if (shown === w.shown) return;
    w.shown = shown;
    w.editedAt = now;
    await deliver(api, w.chatId, w.messageId, statusText(w.lang, job), undefined, false);
    return;
  }
  // Hisobot ostidagi tugmada faqat foiz bor — u o'zgarmagan bo'lsa Telegram'ga bormaymiz
  if (w.progress === w.renderedPct) return;
  w.renderedPct = w.progress;
  w.editedAt = now;
  await editMarkup(
    api,
    w.chatId,
    w.messageId,
    reportKeyboard(w.lang, w.period, { canSync: true, syncProgress: w.progress }),
  );
}

let ticking = false;

/** Kutayotgan xabarlarni bir marta yangilaydi (taymer va testlar uchun) */
export async function runSyncTrackerOnce(api: Api, now = Date.now()): Promise<void> {
  if (ticking || waiters.size === 0) return;
  ticking = true;
  try {
    const list = [...waiters.values()];
    const jobs: JobRow[] = await prisma.syncJob.findMany({
      where: { id: { in: [...new Set(list.map((w) => w.jobId))] } },
      select: JOB_SELECT,
    });
    const byId = new Map(jobs.map((j) => [j.id, j]));
    for (const w of list) {
      try {
        await advance(api, w, byId.get(w.jobId) ?? null, now);
      } catch (err) {
        warn(`xabar yangilanmadi (${w.chatId}): ${errText(err)}`);
      }
    }
  } finally {
    ticking = false;
  }
}

/** Kuzatuvchini ishga tushiradi: avval bazadagi kutishlarni tiklaydi, keyin har TICK_MS da tekshiradi */
export function startSyncTracker(bot: Bot<BotContext>): NodeJS.Timeout {
  let restored = false;
  let restoring = false;
  let restoreTriedAt = 0;
  const tryRestore = (): void => {
    if (restoring) return;
    restoring = true;
    restoreTriedAt = Date.now();
    void restoreSyncWaiters()
      .then(({ restored: n, pending }) => {
        // Tekshirib bo'lmagan yozuv qolsa — keyinroq yana (olinganlari qayta olinmaydi)
        restored = pending === 0;
        if (n > 0) log(`${n} ta kutayotgan xabar tiklandi`);
        if (pending > 0) warn(`${pending} ta yozuv tekshirilmadi — ${RESTORE_RETRY_MS / 1000} s dan keyin yana`);
      })
      .catch((err: unknown) => warn(`kutishlar tiklanmadi, ${RESTORE_RETRY_MS / 1000} s dan keyin yana: ${errText(err)}`))
      .finally(() => {
        restoring = false;
      });
  };
  tryRestore();

  const timer = setInterval(() => {
    if (!restored && Date.now() - restoreTriedAt > RESTORE_RETRY_MS) tryRestore();
    void runSyncTrackerOnce(bot.api).catch((err: unknown) => warn(`kuzatuv xatosi: ${errText(err)}`));
  }, TICK_MS);
  timer.unref();
  return timer;
}

// ─────────────────────────── Tugma va buyruq ───────────────────────────

/** chat → oxirgi bosish (ms): menyu tugmasiga ikki marta tegish ikki xabar ochmasin */
const lastPress = new Map<number, number>();

function tooSoon(chatId: number, now = Date.now()): boolean {
  const prev = lastPress.get(chatId) ?? 0;
  lastPress.set(chatId, now);
  if (lastPress.size > 2000) {
    for (const [id, at] of lastPress) if (now - at > 60_000) lastPress.delete(id);
  }
  return now - prev < PRESS_GAP_MS;
}

type Answer = (text?: string, alert?: boolean) => Promise<void>;

interface Target {
  mode: WaitMode;
  period: ReportPeriod;
  chatId: number;
  /** Bor bo'lsa — o'sha xabar almashtiriladi (callback); yo'q bo'lsa — yangi xabar (menyu, /sync) */
  messageId?: number;
}

/** Qarorni foydalanuvchiga ko'rsatadi va kerak bo'lsa kutishni boshlaydi */
async function present(
  ctx: BotContext,
  who: { userId: string; company: BotCompany },
  decision: SyncDecision,
  target: Target,
  answer: Answer,
): Promise<void> {
  const lang = ctx.sp.lang;
  const { chatId, messageId } = target;

  switch (decision.kind) {
    case 'started':
    case 'joined': {
      const { job } = decision;
      const toast =
        decision.kind === 'started'
          ? t(ctx, 'sync_toast_started')
          : t(ctx, 'sync_toast_running', { progress: clampPct(job.progress) });
      const base = {
        jobId: job.id,
        companyId: who.company.id,
        userId: who.userId,
        chatId,
        lang,
        createdAt: Date.now(),
      };

      // Hisobot ostidagi tugma — matn joyida qoladi, tugma foizga aylanadi.
      // Avval tugma, keyin kuzatuv: aks holda tez tugagan sinxronning yakuniy
      // ko'rinishini kechikkan foiz tugmasi bosib ketishi mumkin edi.
      if (target.mode === 'report' && messageId !== undefined) {
        await answer(toast);
        await editMarkup(
          ctx.api,
          chatId,
          messageId,
          reportKeyboard(lang, target.period, { canSync: true, syncProgress: clampPct(job.progress) }),
        );
        await track({ ...base, messageId, mode: 'report', period: target.period }, job);
        return;
      }

      // «Qayta urinish» — o'sha holat xabari yana «⏳» ga aylanadi
      if (messageId !== undefined) {
        await answer(toast);
        const shown = await deliver(ctx.api, chatId, messageId, statusText(lang, job));
        // Vaqtinchalik xatoda ham kuzatamiz — keyingi tik o'sha xabarni yangilaydi
        if (shown.status !== 'gone') {
          const id = shown.status === 'ok' ? shown.messageId : messageId;
          await track({ ...base, messageId: id, mode: 'status', period: 'today' }, job);
        }
        return;
      }

      // Menyu yoki /sync: shu job uchun holat xabari allaqachon bor bo'lsa — ikkinchisi ochilmaydi
      for (const w of waiters.values()) {
        if (w.chatId === chatId && w.jobId === job.id && w.mode === 'status') {
          await ctx.reply(t(ctx, 'sync_toast_running', { progress: w.progress }));
          return;
        }
      }
      const sent = await ctx.reply(statusText(lang, job), { parse_mode: 'HTML' });
      await track({ ...base, messageId: sent.message_id, mode: 'status', period: 'today' }, job);
      return;
    }

    case 'fresh': {
      const seconds = Math.max(1, (Date.now() - decision.lastSyncAt.getTime()) / 1000);
      const vars = {
        ago: formatDuration(seconds, lang),
        retry: clockAfter(new Date(decision.lastSyncAt.getTime() + FRESH_MS)),
      };

      // Hisobot ostidan: qisqa eslatma va o'sha xabar bazadagi eng so'nggi raqam bilan qayta chiziladi
      if (target.mode === 'report' && messageId !== undefined) {
        await answer(t(ctx, 'sync_toast_fresh', vars));
        const view = await buildReportView(lang, who.company, target.period);
        if (view) await deliver(ctx.api, chatId, messageId, view.text, view.markup, false);
        return;
      }

      const banner = t(ctx, 'sync_banner_fresh', vars);
      const view = await buildReportView(lang, who.company, 'today', { banner });
      const text = view?.text ?? banner;
      if (messageId !== undefined) {
        await answer(t(ctx, 'sync_toast_fresh', vars));
        await deliver(ctx.api, chatId, messageId, text, view?.markup);
        return;
      }
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: view?.markup });
      return;
    }

    case 'recent_fail': {
      const text = t(ctx, 'sync_fail_recent', {
        time: clock(decision.failedAt),
        retry: clockAfter(decision.retryAt),
      });
      if (messageId !== undefined) {
        await answer(text, true);
        return;
      }
      await ctx.reply(text);
      return;
    }

    case 'key_invalid': {
      await answer();
      const view = await keyFailView(lang, who.company.role, who.company.id, null);
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.markup });
      return;
    }

    default:
      await answer();
      await ctx.reply(t(ctx, who.company.role === 'owner' ? 'need_api_key' : 'set_api_owner_only'));
  }
}

/** «🔄 Sinxronlash» menyu tugmasi va /sync buyrug'i */
export async function onSyncCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;

  const companyId = await requireCompany(ctx);
  const { user, company } = ctx.sp;
  if (!companyId || !user || !company) return;

  if (!canStartSync(company)) {
    const asOf = asOfLine(ctx.sp.lang, await loadSyncInfo(companyId));
    await ctx.reply([t(ctx, 'sync_owner_only'), asOf].filter(Boolean).join('\n'));
    return;
  }
  if (tooSoon(chatId)) return;

  const decision = await requestSync(companyId);
  await present(ctx, { userId: user.id, company }, decision, { mode: 'status', period: 'today', chatId }, async () => {
    // Menyu tugmasi — callback emas, javob berish shart emas
  });
}

/**
 * `sync:` callback'lari: `sync:rep:<davr>` (hisobot ostidagi tugma),
 * `sync:menu` («Qayta urinish»), `sync:noop:<davr>` (kutish paytidagi foiz tugmasi).
 * Callback'ga javob (`answerCallbackQuery`) har holda bir marta beriladi —
 * aks holda tugmada soat belgisi osilib qoladi.
 */
export async function onSyncAction(ctx: BotContext, action: string, arg: string): Promise<void> {
  let answered = false;
  const answer: Answer = async (text, alert = false) => {
    if (answered) return;
    answered = true;
    await ctx
      .answerCallbackQuery(text ? { text: [...text].slice(0, 190).join(''), show_alert: alert } : undefined)
      .catch(() => undefined);
  };

  try {
    const message = ctx.callbackQuery?.message;
    const chatId = message?.chat.id;
    const messageId = message?.message_id;
    if (chatId === undefined || messageId === undefined) return;

    if (action === 'noop') {
      const w = waiters.get(keyOf(chatId, messageId));
      if (w) {
        // Job tugagan, faqat yakuniy xabar Telegram'ga yetmay qayta urinilyapti — "ketyapti" demaymiz
        await answer(
          w.attempts > 0 ? t(ctx, 'sync_toast_finishing') : t(ctx, 'sync_toast_running', { progress: w.progress }),
        );
        return;
      }
      /*
       * Foiz tugmasi qolgan, lekin xabar kuzatilmayapti (sinxron tugagan va
       * yakuniy tahrir yetmagan, yoki davr almashtirish bilan poyga): tugma
       * o'lik bo'lib qolmasin — hisobot o'sha davr bilan qayta chiziladi.
       */
      const company = ctx.sp.company;
      if (isReportPeriod(arg) && company && (await requireCompany(ctx))) {
        await answer();
        const view = await buildReportView(ctx.sp.lang, company, arg);
        if (view) await deliver(ctx.api, chatId, messageId, view.text, view.markup, false);
      }
      return;
    }

    const period = action === 'rep' && isReportPeriod(arg) ? arg : null;
    if (action !== 'menu' && !period) return;

    const companyId = await requireCompany(ctx);
    const { user, company } = ctx.sp;
    if (!companyId || !user || !company) return;
    if (!canStartSync(company)) {
      await answer(t(ctx, 'sync_owner_only'), true);
      return;
    }

    const target: Target = period
      ? { mode: 'report', period, chatId, messageId }
      : { mode: 'status', period: 'today', chatId, messageId };
    await present(ctx, { userId: user.id, company }, await requestSync(companyId), target, answer);
  } finally {
    await answer();
  }
}
