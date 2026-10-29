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
 * TARIX YUKLASH (backfill, 2026-10-24). Tarif tarixi chuqurlashganda (sinov
 * 60 kun → standart/VIP 365 kun) yetishmagan oraliq alohida 'backfill' jobida,
 * 30 kunlik bo'laklarda, eng yangisidan eskisiga qarab yuklanadi. Bo'lak fonda
 * ketadi va oddiy sinxronlarni kutdirmaydi, xabar yubormaydi, qayerda
 * to'xtagani `CompanySetting` dagi `history.coverage:<kabinet>` da saqlanadi —
 * jarayon qayta ishga tushsa ham o'sha joydan davom etadi.
 *
 * DIQQAT: bu fayldagi eksport nomlari boshqa modullarda ishlatiladi — o'zgartirmang:
 *   `enqueueSync`, `getSyncStatus`, `runDueJobs`, `cancelSync`, `scheduleRecurring`,
 *   `scheduleHistoryBackfill`, `waitForBackfill`.
 */
import { prisma } from '@savdoiq/db';
import type { Prisma, Subscription, SyncJob } from '@savdoiq/db';
import {
  PLANS,
  SYNC_STEPS,
  addDays,
  formatMoney,
  getPlan,
  hasFeature,
  resolvePlan,
  round,
  toISODate,
  todayInBusinessTz,
  type HistoryCoverage,
  type LossKind,
  type PlanId,
  type SyncStatus,
  type SyncStepId,
} from '@savdoiq/shared';
import { env } from '../env.js';
import { decryptSecret } from '../lib/crypto.js';
import { randomBytes } from 'node:crypto';
import { createUzumClient, resolveUzumMode } from '../uzum/client.js';
import { UZUM_MAX_PAGES, UZUM_PAGE_LIMITS } from '../uzum/endpoints.js';
import { UzumApiError, describeUzumError, isTemporaryUzumError, listMeta, markList } from '../uzum/http.js';
import type {
  UzumClient,
  UzumClientOptions,
  UzumExpense,
  UzumListMeta,
  UzumOrder,
  UzumStorageFee,
} from '../uzum/types.js';
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
  type OrderImportOptions,
  type OrdersImportResult,
} from './importer.js';

// ─────────────────────────── Sozlamalar ───────────────────────────

/** Sinxronizatsiya turi. 'backfill' — tarif ochgan, lekin hali yuklanmagan tarixni yuklash */
export type SyncJobType = 'full' | 'incremental' | 'backfill';

/** Oddiy (navbatdagi) sinxron turlari — tarix yuklash o'z yo'li bilan (`scheduleHistoryBackfill`) qo'yiladi */
export type RegularSyncType = Exclude<SyncJobType, 'backfill'>;

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

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * Bitta so'rov oynasida Uzum beradigan qatorlar chegarasi. `fetchAllPages`
 * (uzum/http.ts) ko'pi bilan UZUM_MAX_PAGES sahifa o'qiydi va keyin JIM
 * to'xtaydi: katta do'konning 365 kunlik buyurtmalari bitta oynada so'ralsa,
 * 10 000 qatordan keyingisi xatosiz tushib qolardi (2026-10-24).
 */
const ORDER_ROW_CAP = UZUM_MAX_PAGES * UZUM_PAGE_LIMITS.financeOrders;
/**
 * Shuncha kungacha bo'lgan oraliq BITTA so'rov bilan o'qiladi — ilgarigidek.
 * Oddiy oraliq sinxron (14 kun) Uzum'ga o'zgarishdan oldingidan ko'p so'rov
 * yubormasligi shart: oyna faqat javob HAQIQATAN kesilganda bo'linadi.
 */
const SINGLE_WINDOW_DAYS = 30;
/**
 * Bazadagi taxmin shundan oshsa, oraliq sinxron oynasi oldindan bo'linadi
 * (oshmasa — bitta oyna, ilgarigidek). Chegaraga juda yaqin: taxmin aniq
 * (o'sha buyurtmalar bazada bor), farq faqat oxirgi sinxrondan keyingi sotuvlar.
 */
const SINGLE_WINDOW_MAX_ROWS = Math.floor(ORDER_ROW_CAP * 0.95);
/** Oldindan bo'lishda har oyna shuncha qatorga mo'ljallanadi — kesilishdan zaxira bilan */
const PLAN_TARGET_ROWS = Math.floor(ORDER_ROW_CAP * 0.8);
/** Zichligi noma'lum uzun oraliq (birinchi to'liq sinxron) avval shuncha so'nggi kun bilan o'lchanadi */
const PROBE_DAYS = 7;
/** Tarix yuklashning bitta bo'lagi — bitta ishga tushishda o'qiladigan oraliq, kun */
const BACKFILL_CHUNK_DAYS = 30;
/** Tarix bo'laklari orasidagi tanaffus — navbatdagi boshqa joblar oldinga o'tsin */
const BACKFILL_PAUSE_MS = 3_000;
/** Tarif chegarasidan shundan kam kun yetishmasa yuklash boshlanmaydi (kun chegarasi siljishi) */
const BACKFILL_MIN_GAP_DAYS = 2;
/** Tarix jobi shu oraliqda "tirik" belgisini yangilaydi — butun bo'lak davomida (`reviveStaleJobs`) */
const HEARTBEAT_MS = 15_000;
/**
 * Vaqtinchalik xatodan (Uzum javob bermadi, 429/5xx, taymaut, aloqa) keyin
 * kutish, daqiqa — ketma-ket xato sari uzayadi. Bunday xato urinish
 * (`attempts`) sanalmaydi: bir daqiqalik uzilish tarixni "yiqilgan" qilib qo'ymasin.
 */
const BACKFILL_RETRY_MINUTES = [2, 5, 15, 30, 60, 120, 240, 360];
/** Shuncha ketma-ket vaqtinchalik xatodan keyin (~1,5 sutka) yuklash "yiqilgan" bo'ladi */
const BACKFILL_MAX_TRANSIENT = 12;
/** Haqiqiy xatodan keyin kutish (urinish raqami bo'yicha), daqiqa */
const BACKFILL_HARD_RETRY_MINUTES = [5, 30];
/** Yiqilgan yuklashni rejalashtiruvchi shuncha vaqtdan keyin o'zi qayta boshlaydi */
const BACKFILL_FAILED_COOLDOWN_MS = 6 * 3_600_000;
/** Yetkazish haqi buyurtmadan necha kun keyin kelishi mumkin — bazadagi topshirish kechikishidan, shu chegarada */
const PICKUP_DELAY_MIN_DAYS = 7;
const PICKUP_DELAY_MAX_DAYS = 45;
/** Buyurtmasi hali yuklanmagan yetkazish haqlari — do'kon bo'yicha ko'pi bilan shuncha (eng eskisi tashlanadi) */
const DELIVERY_MEMO_CAP = 50_000;
/** Eski birinchi sinxron oynasida shundan ko'p pozitsiya — u Uzum chegarasiga yetib kesilgan bo'lishi mumkin */
const SUSPECT_ROWS = Math.floor(ORDER_ROW_CAP * 0.9);
/** Birlashtirilgan bildirishnoma ro'yxatlari chegarasi — importerdagi NEW_SALES_CAP bilan bir xil */
const NOTICE_CAP = 50;

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

/**
 * Tarix bo'lagi navbatdagi oddiy sinxronga yo'l beradi (xato emas): bo'lak
 * keyingi oyna oldidan to'xtaydi, tugallanmagan bo'lak keyin qaytadan o'qiladi.
 */
class SyncYieldError extends Error {
  constructor(message = 'Navbatdagi sinxron tugashini kutmoqda') {
    super(message);
    this.name = 'SyncYieldError';
  }
}

/** Tarix yuklash vaqtincha to'xtaydi (xato emas): tungi soatlar yoki soatlik so'rovlar chegarasi */
class BackfillPause extends Error {
  constructor(
    readonly reason: 'night' | 'budget',
    readonly until: Date,
  ) {
    super(reason === 'night' ? 'Tungi soatlar — tarix yuklash to‘xtatildi' : 'Soatlik so‘rovlar chegarasi');
    this.name = 'BackfillPause';
  }
}

/**
 * Vaqtinchalik nosozlik (aloqa, Uzum javob bermadi yoki javob chala). Oddiy
 * sinxron uchun oddiy xato bilan bir xil; tarix yuklash esa oraliqni
 * belgilamaydi, urinish sanamaydi va uzayib boruvchi tanaffus bilan qaytadi.
 */
class TransientSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientSyncError';
  }
}

/** Qamrov yozuvini boshqa jarayon o'zgartirib qo'ydi — o'qib, qaytadan urinish kerak */
class CoverageConflict extends Error {
  constructor() {
    super('Tarix qamrovi yozuvi bir vaqtda o‘zgartirildi');
    this.name = 'CoverageConflict';
  }
}

// ─────────────────────────── Vaqt oynalari ───────────────────────────

/** UTC yarim tuni — Uzum xarajati va saqlash to'lovi shu kun kaliti bilan yig'iladi (importer `dayStart`) */
function utcDayStart(d: Date): Date {
  return new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);
}

/** "2026-10-24" — log va job matni uchun (UTC kuni) */
const dayOf = (d: Date): string => toISODate(d);

/** So'rov oynasi; ikkala chegara ham kiradi (`to` — keyingi oyna boshidan 1 ms oldin) */
interface TimeWindow {
  from: Date;
  to: Date;
}

/** Oyna uzunligi, kun (kamida bir soat) */
const spanDays = (w: TimeWindow): number => Math.max(1 / 24, (w.to.getTime() - w.from.getTime() + 1) / DAY_MS);

/**
 * Oynalarni qanday rejalash: 'single' — bitta oyna (ilgarigidek); null —
 * zichlik noma'lum, avval so'nggi `PROBE_DAYS` kun o'lchanadi; son — bazadan
 * ma'lum zichlik (qator/kun), 0 — bitta oynaga sig'adi.
 */
type WindowPlan = 'single' | number | null;

/**
 * [range] ni ENG YANGI oynadan boshlab aylanib chiqadi.
 *
 * Odatda — BITTA oyna, ilgarigidek. Ilgari har sinxron 30 kunlik oynadan
 * boshlanib, javob 85% ga to'lsa ikkiga bo'linardi: katta do'konda har
 * bo'linish 200 sahifani behuda o'qirdi va oraliq sinxron Uzum'ga 3–6 barobar
 * ko'p murojaat qilardi (2026-10-24 tekshiruvi). Endi oyna faqat ikki holda
 * bo'linadi: bazadagi zichlik oldindan shuni ko'rsatsa (`plan` — son) yoki
 * Uzum javobi HAQIQATAN kesilsa (`fetchWindow`).
 *
 * Rejali oynalar har biri ~`PLAN_TARGET_ROWS` qatorga mo'ljallanadi va keyingi
 * oyna uzunligi oldingisida ko'rilgan zichlikdan yangilanadi. Zichlik noma'lum
 * bo'lsa (birinchi to'liq sinxron) avval so'nggi kunlar o'qiladi — bu ham
 * ma'lumot, behuda so'rov emas. Chegaralar UTC yarim tunida: bir kun ikki
 * oynaga bo'linmaydi (xarajat va saqlash KUN bo'yicha yig'ilib ustidan yoziladi).
 * `visit` qaytaradi: oynadagi qatorlar soni.
 */
async function walkWindows(
  range: TimeWindow,
  plan: WindowPlan,
  visit: (w: TimeWindow) => Promise<number>,
  targetRows: number = PLAN_TARGET_ROWS,
): Promise<void> {
  const start = range.from.getTime();
  let end = range.to.getTime();
  /** null — qolgani bitta oyna; 'probe' — avval o'lchash; son — qator/kun */
  let rate: number | 'probe' | null = plan === 'single' || plan === 0 ? null : plan === null ? 'probe' : plan;
  while (end >= start) {
    const days = rate === null ? null : rate === 'probe' ? PROBE_DAYS : Math.max(1, Math.floor(targetRows / rate));
    const aligned = days === null ? start : Math.floor(end / DAY_MS) * DAY_MS - (days - 1) * DAY_MS;
    const lo = aligned <= start ? start : aligned;
    const w: TimeWindow = { from: new Date(lo), to: new Date(end) };
    const rows = await visit(w);
    if (rate !== null) {
      const seen = rows / spanDays(w);
      // Bo'sh oyna (sotuv yo'q kunlar) — qolgani bitta oyna; zich bo'lsa kesilish `fetchWindow` da ushlanadi
      rate = seen > 0 ? seen : null;
    }
    end = lo - 1;
  }
}

/**
 * Bazadagi ma'lumotdan oraliqdagi Uzum qatorlari taxmini: buyurtmada —
 * pozitsiyalar (`finance/orders` qatori), moliyada — yetkazilgan buyurtmalar
 * (har biriga yetkazish to'lovi satri), saqlash satrlari va kuniga ~2 boshqa
 * to'lov. Do'konda umuman buyurtma bo'lmasa — null (zichlik noma'lum).
 */
async function predictRows(storeId: string, kind: 'orders' | 'finance', range: TimeWindow): Promise<number | null> {
  if (kind === 'orders') {
    const items = await prisma.orderItem.count({
      where: { order: { storeId, orderedAt: { gte: range.from, lte: range.to } } },
    });
    if (items > 0) return items;
  } else {
    const [delivered, fees] = await Promise.all([
      prisma.order.count({ where: { storeId, deliveredAt: { gte: range.from, lte: range.to } } }),
      prisma.storageFee.count({ where: { storeId, date: { gte: range.from, lte: range.to } } }),
    ]);
    if (delivered + fees > 0) return delivered + fees + Math.ceil(spanDays(range)) * 2;
  }
  const any = await prisma.order.findFirst({ where: { storeId }, select: { id: true } });
  return any ? 0 : null;
}

/**
 * Oddiy sinxron oynasi rejasi: `SINGLE_WINDOW_DAYS` gacha — bitta oyna (taxmin
 * so'ralmaydi ham); uzunroq oraliq bazadagi taxmin bitta oynaga sig'sa — yana
 * bitta oyna, sig'masa — zichlik bo'yicha bo'linadi.
 */
async function regularPlan(storeId: string, kind: 'orders' | 'finance', range: TimeWindow): Promise<WindowPlan> {
  if (spanDays(range) <= SINGLE_WINDOW_DAYS) return 'single';
  const rows = await predictRows(storeId, kind, range);
  if (rows === null) return null;
  return rows <= SINGLE_WINDOW_MAX_ROWS ? 0 : rows / spanDays(range);
}

/**
 * Bitta oynani o'qiydi. Uzum javobi KESILGAN bo'lsa (`truncated` — sahifalar
 * chegarasi, uzum/http.ts) natija tashlanadi va oyna qismlarga bo'linib qayta
 * so'raladi. Qism soni kesilgan javobdagi qatorlar sanasidan taxmin qilinadi:
 * Uzum qatorlarni sana bo'yicha tartiblab beradi, 10 000 qator egallagan vaqt
 * zichlikni ko'rsatadi — qismlar odatda birinchi urinishda sig'adi (ikkiga
 * bo'lib ko'r-ko'rona tushishdan kam so'rov). `minSpanMs` dan qisqa oyna
 * bo'linmaydi — logga yoziladi. Xato (`failed`) belgisi saqlanib qaytadi:
 * oddiy sinxron uni ilgarigidek o'tkazib yuboradi, tarix yuklash esa oynani belgilamaydi.
 */
async function fetchWindow<T>(
  w: TimeWindow,
  fetch: (x: TimeWindow) => Promise<T[]>,
  timeOf: (item: T) => number,
  opts: { minSpanMs: number; alignMs: number; label: string },
): Promise<T[]> {
  const items = await fetch(w);
  const meta = listMeta(items);
  if (!meta.truncated || meta.failed) return items;

  const lo = w.from.getTime();
  const hi = w.to.getTime();
  const span = hi - lo + 1;
  if (span <= opts.minSpanMs) {
    log(
      `${opts.label}: ${dayOf(w.from)}…${dayOf(w.to)} — Uzum javobi kesilgan va oynani bundan ` +
        'qisqartirib bo‘lmaydi: ma’lumot chala bo‘lishi mumkin',
    );
    return items;
  }

  let first = Infinity;
  let last = -Infinity;
  for (const item of items) {
    const t = timeOf(item);
    if (!Number.isFinite(t)) continue;
    if (t < first) first = t;
    if (t > last) last = t;
  }
  const covered = Number.isFinite(first) ? Math.min(span, Math.max(opts.alignMs, last - first + 1)) : span;
  const pieces = Math.max(2, Math.ceil(((items.length / covered) * span) / PLAN_TARGET_ROWS));
  const cuts = new Set<number>();
  for (let i = 1; i < pieces; i += 1) {
    const cut = Math.floor((lo + (span * i) / pieces) / opts.alignMs) * opts.alignMs;
    if (cut > lo && cut <= hi) cuts.add(cut);
  }
  if (cuts.size === 0) cuts.add(lo + opts.alignMs);
  const starts = [lo, ...[...cuts].sort((a, b) => a - b)];
  log(
    `${opts.label}: ${dayOf(w.from)}…${dayOf(w.to)} — Uzum javobi ${items.length} qatorda kesildi, ` +
      `oyna ${starts.length} qismga bo‘linib qayta so‘raladi`,
  );

  const out: T[] = [];
  let truncated = false;
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const to = i === starts.length - 1 ? hi : starts[i + 1] - 1;
    const part = await fetchWindow({ from: new Date(starts[i]), to: new Date(to) }, fetch, timeOf, opts);
    const m = listMeta(part);
    for (const item of part) out.push(item);
    if (m.failed) return markList(out, { failed: m.failed, truncated });
    truncated ||= m.truncated === true;
  }
  return markList(out, { truncated });
}

/** Buyurtmalar oynasi: kesilsa soat aniqligida bo'linadi (buyurtma vaqti aniq keladi) */
async function fetchOrdersWindow(client: UzumClient, shopId: string, w: TimeWindow, label: string): Promise<UzumOrder[]> {
  const list = await fetchWindow(w, (x) => client.getOrders(shopId, x.from, x.to), (o) => Date.parse(o.orderedAt), {
    minSpanMs: HOUR_MS,
    alignMs: HOUR_MS,
    label: `${label}: buyurtmalar (do‘kon ${shopId})`,
  });
  // Qismlar kesishmaydi — bu faqat ehtiyot: bitta buyurtma ikki marta yozilmasin
  const seen = new Set<string>();
  return markList(
    list.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true))),
    listMeta(list),
  );
}

/** Xarajat yoki saqlash satri — kesilganda ikkalasi birga qayta so'raladi (Uzumda bitta ro'yxat) */
type FinanceRow = { e: UzumExpense } | { f: UzumStorageFee };

/**
 * Xarajatlar va saqlash to'lovlari oynasi. Jonli klientda ikkalasi bitta xom
 * so'rovni bo'lishadi (live.ts `expenseMemo`), to'liqlik belgisi ham bitta.
 * Faqat KUN chegarasida bo'linadi: demo klient kun aniqligidagi sanalarni kun
 * bo'yicha taqqoslaydi, kun ichida bo'linsa o'sha kun ikki marta qo'shilardi.
 */
async function fetchFinanceWindow(
  client: UzumClient,
  shopId: string,
  w: TimeWindow,
  label: string,
): Promise<{ expenses: UzumExpense[]; fees: UzumStorageFee[]; meta: UzumListMeta }> {
  const rows = await fetchWindow<FinanceRow>(
    w,
    async (x) => {
      const [expenses, fees] = await Promise.all([
        client.getExpenses(shopId, x.from, x.to),
        client.getStorageFees(shopId, x.from, x.to),
      ]);
      const a = listMeta(expenses);
      const b = listMeta(fees);
      return markList<FinanceRow>([...expenses.map((e) => ({ e })), ...fees.map((f) => ({ f }))], {
        truncated: a.truncated || b.truncated,
        failed: a.failed ?? b.failed,
      });
    },
    (r) => Date.parse(`${('e' in r ? r.e.date : r.f.date).slice(0, 10)}T00:00:00.000Z`),
    { minSpanMs: DAY_MS, alignMs: DAY_MS, label: `${label}: xarajatlar (do‘kon ${shopId})` },
  );
  const expenses: UzumExpense[] = [];
  const fees: UzumStorageFee[] = [];
  for (const r of rows) {
    if ('e' in r) expenses.push(r.e);
    else fees.push(r.f);
  }
  return { expenses, fees, meta: listMeta(rows) };
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
  /*
   * Tarix yuklash (backfill) bu yerdagi "joriy sinxron" emas: u soatlab fonda
   * ketishi mumkin va asosiy kartani band qilib qo'ymasligi kerak — uning
   * holati alohida `history` maydonida.
   */
  const [job, doneCount, accounts] = await Promise.all([
    prisma.syncJob.findFirst({ where: { companyId, type: { not: 'backfill' } }, orderBy: { createdAt: 'desc' } }),
    prisma.syncJob.count({ where: { companyId, status: 'done', type: { not: 'backfill' } } }),
    prisma.uzumAccount.findMany({
      where: { companyId },
      select: { id: true, status: true, lastSyncAt: true, nextSyncAt: true },
    }),
  ]);
  // Qo'shimcha ma'lumot: hisoblab bo'lmasa asosiy holat baribir qaytadi
  const history = await loadHistoryCoverage(companyId, accounts).catch((err: unknown) => {
    log(`tarix qamrovi hisoblanmadi (${companyId}): ${errorMessage(err)}`);
    return null;
  });

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
      history,
    };
  }

  // "Birinchi yig'ish" — muvaffaqiyatli tugagan sinxron hali bo'lmagan
  // (yoki hozirgi jobning o'zi shu birinchi muvaffaqiyatli sinxron).
  const firstRun = doneCount <= (job.status === 'done' ? 1 : 0);
  return { ...toSyncStatus(job, firstRun, freshness), history };
}

// ─────────────────────────── Navbat ───────────────────────────

/**
 * Sinxronizatsiyani navbatga qo'yadi.
 * Kompaniyada allaqachon `queued`/`running` job bo'lsa — **o'sha job qaytariladi**
 * (takroriy bosishlar yangi jarayon boshlamaydi).
 *
 * `type` berilmasa: birinchi marta — `full`, keyingilari — `incremental`.
 *
 * Tarix yuklash (backfill) jobi bu yerda hisobga olinmaydi: u fonda ketadi va
 * oddiy sinxronni to'sib qo'ymasligi kerak (navbatda oddiy sinxron ko'rsa, o'zi
 * yo'l beradi — `yieldIfBusy`).
 */
export async function enqueueSync(
  companyId: string,
  uzumAccountId?: string | null,
  type?: RegularSyncType,
): Promise<SyncJob> {
  const active = await prisma.syncJob.findFirst({
    where: { companyId, status: { in: ['queued', 'running'] }, type: { not: 'backfill' } },
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

  const doneCount = await prisma.syncJob.count({ where: { companyId, status: 'done', type: { not: 'backfill' } } });
  const jobType: RegularSyncType = type ?? (doneCount === 0 ? 'full' : 'incremental');

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
 * Tarix yuklashga tegilmaydi — "Bekor qilish" tugmasi ekrandagi sinxron uchun.
 */
export async function cancelSync(companyId: string): Promise<boolean> {
  const res = await prisma.syncJob.updateMany({
    where: { companyId, status: { in: ['queued', 'running'] }, type: { not: 'backfill' } },
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

      /*
       * Tarif boshqa yo'l bilan chuqurlashgan bo'lsa ham (masalan, botdagi /grant
       * `activatePlan` ni chaqirmaydi) tarix yetib olsin. Faqat qamrovi yozilgan
       * kabinetlar: eski kabinetlarda qamrov taxmin qilinadi va u faqat aniq
       * so'rov (tarif o'zgarishi, tugma) bilan boshlanadi.
       */
      try {
        await scheduleHistoryBackfill(account.companyId, { accountId: account.id, reason: 'auto', planId });
      } catch (err) {
        log(`tarix tekshiruvi xatosi (${account.id}): ${errorMessage(err)}`);
      }

      // Tarix yuklash oddiy sinxronni to'smaydi — u navbatda oddiy sinxronni ko'rsa o'zi yo'l beradi
      const busy = await prisma.syncJob.findFirst({
        where: { companyId: account.companyId, status: { in: ['queued', 'running'] }, type: { not: 'backfill' } },
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
  /** Ma'lumot yig'ish oynasi (UTC yarim tunidan — xarajat kunlari butun o'qilsin) */
  from: Date;
  to: Date;
  /**
   * Buyurtmalar oynasi boshi. Oraliq sinxronda — ilgarigidek aniq vaqt (kun
   * boshiga surilmaydi): buyurtma kun bo'yicha yig'ilmaydi, surish esa Uzum'ga
   * ortiqcha so'rov bo'lardi. To'liq sinxronda `from` bilan bir xil (qamrov aniq bo'lsin).
   */
  ordersFrom: Date;
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
    /*
     * Oraliq progress — faqat ko'rinish uchun: yozib bo'lmasa (SQLite'da ish
     * bazani band qilib turgan payt "Socket timeout"), keyingi taktda yana
     * urinadi. Ilgari bu xato butun sinxronni yiqitardi, ish esa fonda davom
     * etib, qayta urinish bilan bir vaqtda bazaga yozardi.
     */
    try {
      await writeProgress(run, index, Date.now() - startedAt, false, state.detail);
      await assertNotCanceled(run.jobId);
    } catch (err) {
      if (err instanceof SyncCanceledError) throw err;
      log(`job ${run.jobId}: progress yozilmadi (${errorMessage(err).split('\n').pop()}) — davom etadi`);
    }
  }

  if (state.error !== null) throw state.error;
  run.stepMs[index] = Date.now() - startedAt;
  await writeProgress(run, index, run.stepMs[index], true, state.detail);
  await assertNotCanceled(run.jobId);
}

// ─────────────────────────── Bosqichlar ───────────────────────────

/**
 * 1. API kalitni tekshirish va klientni tayyorlash.
 * `clientOpts` / `wrap` — faqat tarix yuklash uchun: sekin RPS, so'rovlar hisobi.
 */
async function stepAuth(
  run: SyncRun,
  setDetail: (t: string) => void,
  clientOpts: Partial<UzumClientOptions> = {},
  wrap: (client: UzumClient) => UzumClient = (client) => client,
): Promise<void> {
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

  const client = wrap(createUzumClient({ ...clientOpts, apiKey, apiSecret, seed: account.id }));
  const check = await client.verify();
  if (!check.ok) {
    const message = check.message ?? 'Uzum API kaliti qabul qilinmadi';
    // Aloqa uzilishi yoki Uzum to'sig'i kalitning aybi emas: kabinet faol qoladi,
    // keyingi rejali sinxron o'zi qayta urinadi. Faqat haqiqiy rad etish — "yaroqsiz".
    if (check.temporary) throw withDiagnostic(new TransientSyncError(message), check.diagnostic);
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
    // Tartib barqaror bo'lishi shart: birinchisi sotuvchi darajasidagi to'lovlarni oladi (`ownExpenses`)
    orderBy: [{ createdAt: 'asc' }, { uzumShopId: 'asc' }],
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
  const today = todayInBusinessTz();
  for (const sale of single) {
    const more = sale.positions > 1 ? ` va yana ${sale.positions - 1} ta mahsulot` : '';
    /*
     * Buyurtma berilgan vaqt (Uzumdagi "Yaratish sanasi") — Telegram ko'rsatadigan
     * xabar vaqti sinxron vaqti, u buyurtmadan 30 daqiqagacha kech bo'lishi mumkin.
     * Yarim tundan keyingi sinxronda kechagi buyurtma kelsa, sana ham yoziladi.
     */
    const day = todayInBusinessTz(sale.orderedAt);
    const when = `${day === today ? '' : `${day.slice(8, 10)}.${day.slice(5, 7)} `}${tashkentTime(sale.orderedAt)}`;
    await notifyCompanyOwners(run.companyId, {
      type: 'success',
      requireFlag: 'notifyOrders',
      title: `Sotildi: ${sale.title}`,
      body: `${sale.qty} dona · ${formatMoney(sale.amount, 'uz')}${more}
Buyurtma vaqti: ${when}
Do‘kon: ${storeTitle} · №${sale.uzumOrderId}`,
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
      body: complete ? `Do‘kon: ${storeTitle} · jami ${formatMoney(sum, 'uz')}` : `Do‘kon: ${storeTitle}`,
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
Do‘kon: ${storeTitle} · №${change.uzumOrderId}`,
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
      body: `Do‘kon: ${storeTitle}`,
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
Do‘kon: ${storeTitle} · №${order.uzumOrderId}`,
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
      body: `Do‘kon: ${storeTitle}`,
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

const emptyOrdersResult = (): OrdersImportResult => ({
  created: 0,
  updated: 0,
  newSales: [],
  newSalesTotal: 0,
  changes: [],
  changesTotal: 0,
  accepted: [],
  acceptedTotal: 0,
});

/** Oynalar natijasini bitta qiladi: ro'yxatlar importerdagidek 50 ta bilan cheklanadi, sonlar esa to'liq */
function mergeOrderResults(a: OrdersImportResult, b: OrdersImportResult): OrdersImportResult {
  return {
    created: a.created + b.created,
    updated: a.updated + b.updated,
    newSales: [...a.newSales, ...b.newSales].slice(0, NOTICE_CAP),
    newSalesTotal: a.newSalesTotal + b.newSalesTotal,
    changes: [...a.changes, ...b.changes].slice(0, NOTICE_CAP),
    changesTotal: a.changesTotal + b.changesTotal,
    accepted: [...a.accepted, ...b.accepted].slice(0, NOTICE_CAP),
    acceptedTotal: a.acceptedTotal + b.acceptedTotal,
  };
}

/** Moliyaviy pozitsiyalar soni — Uzum `finance/orders` qatori bitta pozitsiya */
const orderRows = (orders: UzumOrder[]): number =>
  orders.reduce((s, o) => s + Math.max(1, o.items?.length ?? 0), 0);

/**
 * Oddiy sinxron: do'konning [range] dagi buyurtmalari (`walkWindows` — odatda
 * bitta oyna, ilgarigidek). Uzum javobi kesilsa oyna bo'linadi (`fetchWindow`):
 * ilgari katta do'konning 365 kunlik to'liq sinxroni 10 000 qatorda jim
 * kesilardi. Natijalar bitta yig'indiga qo'shiladi — xabarlar avvalgidek
 * do'kon bo'yicha bir marta yuboriladi.
 */
async function importOrderRange(
  run: SyncRun,
  client: UzumClient,
  store: { id: string; uzumShopId: string },
  range: TimeWindow,
  options: OrderImportOptions,
  onProgress?: () => void,
): Promise<OrdersImportResult> {
  let result = emptyOrdersResult();
  await walkWindows(range, await regularPlan(store.id, 'orders', range), async (w) => {
    const orders = await fetchOrdersWindow(client, store.uzumShopId, w, `job ${run.jobId}`);
    const res = await upsertOrders(store.id, orders, options);
    result = mergeOrderResults(result, res);
    run.totals.orders += countOf(res);
    onProgress?.();
    return orderRows(orders);
  });
  return result;
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
    const res = await importOrderRange(
      run,
      client,
      store,
      // Buyurtmalar ilgarigidek aniq vaqtdan (kun boshiga surilmaydi) — so'rovlar soni o'zgarmasin
      { from: run.ordersFrom, to: run.to },
      { taxRate: run.taxRate, collectNew, collectNewSince, acceptedSince },
      () => setDetail(`${run.totals.orders} ta buyurtma yuklandi`),
    );

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

  assertDataAccess(run, client);

  if (lockedNewOrders > 0 || lockedChanged) {
    try {
      await notifyLockedOrders(run, lockedNewOrders, lockedChanged);
    } catch (err) {
      log(`job ${run.jobId}: tarif taklifi yuborilmadi — ${errorMessage(err)}`);
    }
  }
}

/**
 * Kalit faqat do'kon ro'yxatini beryapti: mahsulot va buyurtmalarni Uzum HAR
 * BIR do'kon uchun 401/403 bilan rad etdi. 2026-10-28: sotuvchi ikkinchi
 * do'kon ochgach eski kalit `/v1/shops` dan boshqa hamma joyda "403 Token not
 * found" qaytardi — sinxron 0 ta buyurtma bilan "tugadi" deb yozaverdi, sotuv
 * xabarlari to'xtadi, sotuvchi esa hech narsa bilmadi. Endi bu kalit xatosi:
 * kabinet 'invalid' bo'ladi va egasiga xabar boradi (failJob).
 * Faqat bitta bo'lim yopiq bo'lsa (masalan, moliya) — avvalgidek jim o'tkaziladi.
 */
function assertDataAccess(run: SyncRun, client: UzumClient): void {
  const denied = client.deniedAccess?.bind(client);
  if (!denied || run.stores.length === 0) return;
  if (!run.stores.every((s) => denied('products', s.uzumShopId) && denied('orders', s.uzumShopId))) return;
  throw new UzumAuthError(
    'Uzum API kalit do‘kon ma’lumotlarini bermayapti (HTTP 403) — Uzum kabinetida yangi kalit yarating, unda barcha do‘konlarni belgilang',
  );
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

/** `applyActualLogistics` ga bir chaqiruvda shuncha buyurtma — IN ro'yxati SQLite/PostgreSQL parametr chegarasidan oshmasin */
const LOGISTICS_BATCH_ORDERS = 2_000;

/**
 * Sotuvchi darajasidagi to'lovlar (Uzum satrida `shopId` yo'q — `sellerLevel`)
 * har bir do'kon so'rovida takrorlanadi: ular faqat kabinetning birinchi
 * do'koniga (`reloadStores` tartibi) yoziladi. 2026-10-29: ikkinchi do'kon
 * ulangach, yechib olish haqlari ikkala do'konga yozilib, balans ikki marta
 * kamaydi.
 */
function ownExpenses(run: SyncRun, storeId: string, expenses: UzumExpense[]): UzumExpense[] {
  if (storeId === run.stores[0]?.id) return expenses;
  return markList(
    expenses.filter((e) => !e.sellerLevel),
    listMeta(expenses),
  );
}

/**
 * Do'konning [range] dagi xarajat va saqlash to'lovlarini oynama-oyna yozadi.
 *
 * Yetkazish to'lovlari (buyurtma raqami bilan kelgan satrlar) butun oraliq
 * bo'yicha yig'ilib, oxirida qo'llanadi: bitta buyurtmaning satrlari ikki
 * oynaga tushsa ham keyingi oyna oldingisining yig'indisini ustidan yozmaydi.
 * Qaytaradi: oxirgi kunlardagi xarajatlar — erta yechish haqi uchun (`earlyFeeFrom`).
 */
async function importFinanceRange(
  run: SyncRun,
  client: UzumClient,
  store: { id: string; uzumShopId: string },
  range: TimeWindow,
  onProgress?: () => void,
): Promise<UzumExpense[]> {
  const delivery = new Map<string, number>();
  const recent: UzumExpense[] = [];
  const recentSince = toISODate(addDays(new Date(), -3));

  await walkWindows(range, await regularPlan(store.id, 'finance', range), async (w) => {
    const window = await fetchFinanceWindow(client, store.uzumShopId, w, `job ${run.jobId}`);
    const expenses = ownExpenses(run, store.id, window.expenses);
    const fees = window.fees;
    const expRes = await upsertExpenses(run.companyId, store.id, expenses);
    const feeRes = await upsertStorageFees(store.id, fees);
    collectDeliveries(delivery, expenses);
    for (const e of expenses) if (e.date >= recentSince) recent.push(e);
    run.totals.expenses += countOf(expRes);
    run.totals.storage += countOf(feeRes);
    onProgress?.();
    return expenses.length + fees.length;
  });

  await applyDeliveries(store.id, delivery);
  return recent;
}

/** Buyurtma raqami bilan kelgan yetkazish to'lovlari — buyurtma bo'yicha yig'indi */
function collectDeliveries(into: Map<string, number>, expenses: UzumExpense[]): void {
  for (const e of expenses) {
    if (!e.deliveryOrderId) continue;
    const amount = Number.isFinite(e.amount) ? e.amount : 0;
    into.set(e.deliveryOrderId, (into.get(e.deliveryOrderId) ?? 0) + amount);
  }
}

/**
 * Buyurtma logistikasi — nominal tarif emas, Uzum haqiqatda ushlagani (aksiyada 0).
 * Har buyurtmaga bitta yig'ma satr: `applyActualLogistics` satrlarni buyurtma
 * bo'yicha qo'shadi, bazada yo'q buyurtmani o'tkazib yuboradi.
 */
async function applyDeliveries(storeId: string, delivery: Map<string, number>): Promise<void> {
  const ids = [...delivery.keys()];
  for (let i = 0; i < ids.length; i += LOGISTICS_BATCH_ORDERS) {
    const batch = ids.slice(i, i + LOGISTICS_BATCH_ORDERS).map(
      (id): UzumExpense => ({ date: '', category: 'logistics', amount: delivery.get(id) ?? 0, deliveryOrderId: id }),
    );
    await applyActualLogistics(storeId, batch);
  }
}

/** 6. Moliya: xarajatlar va pullik saqlash */
async function stepFinance(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  for (const store of run.stores) {
    const recent = await importFinanceRange(run, client, store, { from: run.from, to: run.to }, () =>
      setDetail(`Xarajatlar: ${run.totals.expenses} · saqlash: ${run.totals.storage}`),
    );
    // Buyurtmalar shu paytgacha yozilgan — yechib olingan summa oshgan bo'lsa to'lovlar tarixiga tushadi
    await recordPayout(run.companyId, store.id, earlyFeeFrom(recent));
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

/**
 * Sharhlar mahsulot bo'yicha o'qiladi — faqat katalogda sharhi yoki reytingi
 * bor mahsulotlar so'raladi (Uzum `feedbackQuantity` ni beradi). Shunda yuzlab
 * mahsulotli do'konda ham har sinxronda ortiqcha so'rov ketmaydi.
 */
async function reviewProductIds(storeId: string): Promise<string[]> {
  const products = await prisma.product.findMany({
    where: { storeId, uzumProductId: { not: null }, OR: [{ reviewsCount: { gt: 0 } }, { rating: { gt: 0 } }] },
    select: { uzumProductId: true },
  });
  return products.map((p) => p.uzumProductId).filter((id): id is string => Boolean(id));
}

/** 8. Sharhlar */
async function stepReviews(run: SyncRun, setDetail: (t: string) => void): Promise<void> {
  const client = requireClient(run);
  const since = run.type === 'full' ? run.from : addDays(run.to, -REVIEW_REFRESH_DAYS);
  for (const store of run.stores) {
    const productIds = await reviewProductIds(store.id);
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

/** Mahsulot reytingi va sharhlar soni — bazadagi sharhlardan. Qaytaradi: yangilangan mahsulotlar soni */
async function refreshProductRatings(storeIds: string[]): Promise<number> {
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
  return products;
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

  const products = await refreshProductRatings(storeIds);
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
async function prepareRun(job: SyncJob, type: RegularSyncType): Promise<SyncRun> {
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
  let rawFrom = addDays(to, -historyDays);

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
  if (oldestOpen && oldestOpen.orderedAt < rawFrom) {
    rawFrom = oldestOpen.orderedAt < historyFloor ? historyFloor : oldestOpen.orderedAt;
  }

  /*
   * Moliya oynasi UTC YARIM TUNIDAN boshlanadi (2026-10-24). Xarajat va saqlash
   * to'lovi KUN bo'yicha yig'ilib, bazadagi yig'indining ustidan yoziladi
   * (importer: do'kon + kun + toifa kaliti). Ilgari oyna boshi kun o'rtasiga
   * tushardi va o'sha birinchi kun faqat qisman o'qilib, to'liq yig'indini
   * kamaytirib yozardi; oyna har sinxronda surilgani uchun navbat bilan har kun
   * shu "birinchi kun" bo'lib, eski kunlarning xarajati asta-sekin yo'qolardi.
   */
  const from = utcDayStart(rawFrom);

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
    ordersFrom: type === 'full' ? from : rawFrom,
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
  /*
   * To'liq sinxron oynasi — kabinet tarixining qamrovi. Tarif shu orada
   * chuqurlashgan bo'lsa (masalan, birinchi yig'ish ketayotganda to'lov
   * qilingan), yetishmagan oraliq darhol navbatga qo'yiladi.
   */
  if (run.type === 'full') {
    try {
      await noteFullCoverage(run);
      await scheduleHistoryBackfill(run.companyId, { accountId: run.accountId, reason: 'full' });
    } catch (err) {
      log(`job ${run.jobId}: tarix qamrovi yozilmadi — ${errorMessage(err)}`);
    }
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

/** Bitta jobni to'liq bajaradi (tarix jobida — bitta bo'lagini). Hech qachon exception tashlamaydi. */
async function runJob(job: SyncJob): Promise<void> {
  if (job.type === 'backfill') return runBackfillSlice(job);
  const type: RegularSyncType = job.type === 'incremental' ? 'incremental' : 'full';
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

    /*
     * Tarix yuklash uzilib qolgan bo'lsa (jarayon qayta ishga tushdi, xato),
     * u yozib ulgurgan eski buyurtmalarning puli hali "oldingi to'lovlar"ga
     * qo'shilmagan va tovar balansi ular bilan jim hisoblanmagan bo'lishi
     * mumkin. Shu sinxron ularni "bugun o'tkazilgan to'lov" yoki "yo'qotish
     * aniqlandi" deb ko'rsatmasin — avval yopiladi. Xato sinxronni to'xtatmaydi.
     */
    try {
      await settleBackfill(current);
    } catch (err) {
      log(`job ${job.id}: tarix qoldig‘i yopilmadi — ${errorMessage(err)}`);
    }

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
    where: { status: 'running', updatedAt: { lt: cutoff }, type: { not: 'backfill' } },
    data: { status: 'queued', message: 'Uzilgan jarayon qayta navbatga qo‘yildi', startedAt: null },
  });
  // Tarix jobi saqlangan joyidan davom etadi — boshlangan vaqti (umumiy davomiylik) saqlanadi
  await prisma.syncJob.updateMany({
    where: { status: 'running', updatedAt: { lt: cutoff }, type: 'backfill' },
    data: { status: 'queued', message: 'Uzilgan tarix yuklash saqlangan joyidan davom etadi' },
  });
}

/** Shu jarayonda fonda ketayotgan tarix bo'lagi — bir vaqtda bittadan ortiq emas */
let backfillTask: Promise<void> | null = null;

/**
 * Navbatdagi joblarni oladi, atomik ravishda 'running' qiladi va bosqichma-bosqich bajaradi.
 * Qaytaradi: bajarilgan joblar soni. Jarayon davomida `Promise` ushlab turiladi —
 * shuning uchun ishchi (`worker/runner.ts`) qayta kirishdan himoyalangan bo'lishi shart.
 *
 * Tarix yuklash (backfill) bo'lagi ATAYLAB kutilmaydi — fonda ketadi. Kutilsa,
 * katta do'konning 30 kunlik bo'lagi (bir necha daqiqa) ishchi siklini band
 * qilib, boshqa kompaniyalarning soatlik sinxronini ham kechiktirardi.
 * Bo'lak faqat bo'sh joy qolganda va kompaniyaning o'zida navbatdagi oddiy
 * sinxron bo'lmaganda olinadi; tarix yuklanayotgan kompaniyaning oddiy
 * sinxroni esa bo'lak tugashini kutadi — bitta kompaniya ma'lumotiga ikki
 * job bir vaqtda yozmasin (bo'lak navbatni ko'rib, keyingi oyna oldidan o'zi
 * to'xtaydi — `yieldIfBusy`).
 */
export async function runDueJobs(): Promise<number> {
  await reviveStaleJobs();

  const backfilling = await prisma.syncJob.findMany({
    where: { type: 'backfill', status: 'running' },
    select: { companyId: true },
  });
  const busy = [...new Set(backfilling.map((b) => b.companyId))];

  const due = await prisma.syncJob.findMany({
    where: {
      status: 'queued',
      scheduledAt: { lte: new Date() },
      type: { not: 'backfill' },
      ...(busy.length > 0 ? { companyId: { notIn: busy } } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    take: CONCURRENCY,
    select: { id: true },
  });

  const claimed: SyncJob[] = [];
  for (const d of due) {
    const job = await claimJob(d.id);
    if (job) claimed.push(job);
  }

  if (!backfillTask && claimed.length < CONCURRENCY) {
    const slice = await claimBackfillSlice(new Set(claimed.map((j) => j.companyId)));
    if (slice) {
      backfillTask = runJob(slice).finally(() => {
        backfillTask = null;
      });
    }
  }

  if (claimed.length === 0) return 0;
  await Promise.all(claimed.map((job) => runJob(job)));
  return claimed.length;
}

/**
 * Fonda ketayotgan tarix bo'lagi tugashini kutadi. Ishchi buni ishlatmaydi —
 * skriptlar va testlar uchun (`runDueJobs` dan keyin ma'lumot o'qishdan oldin).
 */
export async function waitForBackfill(): Promise<void> {
  if (backfillTask) await backfillTask;
}

/**
 * Navbatdagi tarix bo'lagini "band" qiladi. Shartlar — hammasi Uzum'ni
 * asrash uchun (2026-10-11 da Uzum server manzilimizni to'sib qo'ygan):
 *  • tinch soatlarda (`SYNC_BACKFILL_QUIET_HOURS`, standart 00:00–09:00 Toshkent,
 *    tungi sinxron jadvali bilan bir xil) — hech qachon;
 *  • butun tizimda (barcha ishchi jarayonlarda) bir vaqtda bittadan ortiq emas;
 *  • oxirgi 60 daqiqadagi tarix so'rovlari soatlik chegaraga yetgan bo'lsa — yo'q;
 *  • kompaniyada navbatdagi yoki ketayotgan oddiy sinxron bo'lsa — o'tkazib yuboriladi.
 */
async function claimBackfillSlice(skip: Set<string>): Promise<SyncJob | null> {
  const now = new Date();
  if (quietUntil(now)) return null;
  if ((await prisma.syncJob.count({ where: { type: 'backfill', status: 'running' } })) > 0) return null;
  if (sumLedger(await backfillLedger(now), now) >= backfillHourlyCap()) return null;

  const candidates = await prisma.syncJob.findMany({
    where: { type: 'backfill', status: 'queued', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
    select: { id: true, companyId: true },
  });
  for (const c of candidates) {
    if (skip.has(c.companyId)) continue;
    const regular = await prisma.syncJob.findFirst({
      where: { companyId: c.companyId, type: { not: 'backfill' }, status: { in: ['queued', 'running'] } },
      select: { id: true },
    });
    if (regular) continue;
    const job = await claimJob(c.id, true);
    if (!job) continue;
    // Boshqa jarayon xuddi shu lahzada boshqa bo'lakni olgan bo'lsa — id'si kichigi qoladi, bittasi qaytadi
    const rival = await prisma.syncJob.findFirst({
      where: { type: 'backfill', status: 'running', id: { lt: job.id } },
      select: { id: true },
    });
    if (rival) {
      await prisma.syncJob.updateMany({ where: { id: job.id, status: 'running' }, data: { status: 'queued' } });
      return null;
    }
    return job;
  }
  return null;
}

/**
 * Jobni atomik ravishda "band" qiladi: faqat `queued` holatdagi yozuv `running` ga o'tadi.
 * Bir nechta ishchi jarayon bo'lsa ham bitta job ikki marta bajarilmaydi.
 *
 * `slice` — tarix jobining navbatdagi bo'lagi: progress, bosqich va boshlangan
 * vaqt bo'laklar orasida saqlanadi (job butun yuklash davomida bitta). Har
 * egallashda `payload` ga yangi IJARA belgisi yoziladi: job uzilgan deb qayta
 * navbatga qo'yilib, boshqa bo'lak uni olsa, eskisi (aslida tirik bo'lsa ham)
 * belgisi mos kelmay qolganini ko'rib, jobga ham, qamrovga ham tegmay to'xtaydi.
 */
async function claimJob(id: string, slice = false): Promise<SyncJob | null> {
  const res = await prisma.syncJob.updateMany({
    where: { id, status: 'queued' },
    data: slice
      ? { status: 'running', error: null }
      : {
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
  const job = await prisma.syncJob.findUnique({ where: { id } });
  if (!job || !slice) return job;
  const payload: JobPayload = { ...parseJobPayload(job.payload), lease: randomBytes(8).toString('hex') };
  return prisma.syncJob.update({
    where: { id },
    data: { startedAt: job.startedAt ?? new Date(), payload: JSON.stringify(payload) },
  });
}

// ─────────────────────────── Tarix yuklash (backfill) ───────────────────────────
//
// Tarif tarixi chuqurlashganda (sinov 60 kun → standart/VIP 365 kun) yetishmagan
// oraliq 'backfill' jobida yuklanadi. Asosiy qoidalar (2026-10-24 tekshiruvidan):
//  • Uzum'ga yuk: sekin RPS (`SYNC_BACKFILL_RPS`, standart 1), soatlik chegara
//    (`SYNC_BACKFILL_HOURLY_CAP`, standart 1 200), tinch soatlarda (00:00–09:00)
//    yurmaydi, butun tizimda bir vaqtda bitta.
//  • Har OYNA o'zicha yakunlanadi va qamrovga belgilanadi: navbatda oddiy sinxron
//    paydo bo'lsa, keyingi oyna oldidan to'xtaladi va bajarilgan ish yo'qolmaydi.
//  • Uzum xatosi yoki chala javob — oyna belgilanmaydi, keyinroq qayta o'qiladi.
//  • Pul va xabarlar: tarixdan YANGI yozilgan buyurtmalarning withdrawnProfit'i
//    "oldingi to'lovlar"ga qo'shiladi, tovar balansi jim yangilanadi. Yozishdan
//    oldin belgi saqlanadi — jarayon uzilsa ham keyingi urinish yoki oddiy
//    sinxron aynan nima yozilganini biladi va avval uni yopadi.

/** Uzilib qolgan bo'lak: job boshqa bo'lakka o'tgan (ijara belgisi o'zgargan) — hech narsaga tegmay to'xtaydi */
class LeaseLost extends Error {
  constructor() {
    super('Tarix jobini boshqa jarayon oldi');
    this.name = 'LeaseLost';
  }
}

/** Tarix jobi `payload` i: ijara belgisi va oxirgi daqiqalardagi so'rovlar hisobi */
interface JobPayload {
  lease?: string;
  /** [daqiqa (epoch / 60 000), so'rovlar] — soatlik chegara barcha jarayonlar bo'yicha shundan sanaladi */
  reqs?: Array<[number, number]>;
}

function parseJobPayload(value: string | null | undefined): JobPayload {
  if (!value) return {};
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;
    const reqs = Array.isArray(r.reqs)
      ? (r.reqs as unknown[]).filter(
          (x): x is [number, number] =>
            Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === 'number' && Number.isFinite(n)),
        )
      : undefined;
    return { ...(typeof r.lease === 'string' ? { lease: r.lease } : {}), ...(reqs ? { reqs } : {}) };
  } catch {
    return {};
  }
}

// ─── Uzum'ga yuk chegaralari ───

/** Toshkent — UTC+5, yozgi vaqtga o'tmaydi (sync-schedule.ts bilan bir xil) */
const TZ_OFFSET_MS = 5 * HOUR_MS;

/** Tinch soatlar [boshi, oxiri) Toshkent vaqtida; teng bo'lsa — tinch soat yo'q */
function quietHours(): [number, number] | null {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(env.sync.backfillQuietHours ?? '');
  if (!m) return [0, 9];
  const start = Number(m[1]) % 24;
  const end = Math.min(24, Number(m[2]));
  return start === end ? null : [start, end];
}

/** Hozir tinch soatlar ichida bo'lsa — ular tugaydigan payt, aks holda null */
function quietUntil(at: Date = new Date()): Date | null {
  const q = quietHours();
  if (!q) return null;
  const [start, end] = q;
  const local = new Date(at.getTime() + TZ_OFFSET_MS);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const inside = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!inside) return null;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_OFFSET_MS;
  let until = midnight + end * HOUR_MS;
  if (until <= at.getTime()) until += DAY_MS;
  return new Date(until);
}

/** "14:20" — Toshkent vaqti (job matni uchun) */
const tashkentTime = (d: Date): string => new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(11, 16);

const backfillHourlyCap = (): number => Math.max(1, Math.round(env.sync.backfillHourlyCap) || 1);

const minuteOf = (t: number): number => Math.floor(t / 60_000);

/** Oxirgi 60 daqiqadagi tarix so'rovlari — barcha tarix joblari bo'yicha (har biri o'z hisobini `payload` da saqlaydi) */
async function backfillLedger(now: Date, exceptJobId?: string): Promise<Map<number, number>> {
  const jobs = await prisma.syncJob.findMany({
    where: {
      type: 'backfill',
      updatedAt: { gte: new Date(now.getTime() - 61 * 60_000) },
      ...(exceptJobId ? { id: { not: exceptJobId } } : {}),
    },
    select: { payload: true },
  });
  const first = minuteOf(now.getTime()) - 59;
  const out = new Map<number, number>();
  for (const j of jobs) {
    for (const [m, n] of parseJobPayload(j.payload).reqs ?? []) if (m >= first) out.set(m, (out.get(m) ?? 0) + n);
  }
  return out;
}

function sumLedger(ledger: Map<number, number>, now: Date): number {
  const first = minuteOf(now.getTime()) - 59;
  let n = 0;
  for (const [m, c] of ledger) if (m >= first) n += c;
  return n;
}

/**
 * Tarix yuklashning so'rovlar hisobi. Jonli klientda har HTTP urinishdan oldin
 * (`onRequest`, qayta urinishlar ham), demo'da har chaqiruvda `tick()`. Oxirgi
 * 60 daqiqada chegaraga yetilgan bo'lsa so'rov KETMAYDI (qayta urinilmaydigan
 * xato), `exhausted` belgisi qo'yiladi va bo'lak chegara bo'shaguncha to'xtaydi.
 */
class BackfillMeter {
  /** Shu bo'lakdagi so'rovlar: daqiqa → son */
  private readonly own = new Map<number, number>();
  exhausted = false;

  constructor(
    /** Boshqa tarix joblari (oxirgi soat) */
    private readonly others: Map<number, number>,
    /** Shu jobning oldingi bo'laklari */
    private readonly mine: Map<number, number>,
    private readonly cap: number,
  ) {}

  static async load(job: SyncJob, now = new Date()): Promise<BackfillMeter> {
    const others = await backfillLedger(now, job.id);
    const mine = new Map<number, number>(parseJobPayload(job.payload).reqs ?? []);
    return new BackfillMeter(others, mine, backfillHourlyCap());
  }

  private buckets(now: number): Map<number, number> {
    const first = minuteOf(now) - 59;
    const out = new Map<number, number>();
    for (const map of [this.others, this.mine, this.own]) {
      for (const [m, c] of map) if (m >= first) out.set(m, (out.get(m) ?? 0) + c);
    }
    return out;
  }

  used(now = Date.now()): number {
    let n = 0;
    for (const c of this.buckets(now).values()) n += c;
    return n;
  }

  remaining(now = Date.now()): number {
    return Math.max(0, this.cap - this.used(now));
  }

  /** Kamida `need` ta so'rovga joy qachon bo'shaydi */
  freeAt(need: number, now = Date.now()): Date {
    const buckets = this.buckets(now);
    let excess = this.used(now) + Math.min(Math.max(1, need), this.cap) - this.cap;
    if (excess <= 0) return new Date(now);
    for (const m of [...buckets.keys()].sort((a, b) => a - b)) {
      excess -= buckets.get(m) ?? 0;
      if (excess <= 0) return new Date((m + 60) * 60_000);
    }
    return new Date(now + HOUR_MS);
  }

  /** So'rovdan oldin chaqiriladi; chegara to'lgan bo'lsa so'rov ketmaydi */
  tick = (): void => {
    const now = Date.now();
    if (this.used(now) >= this.cap) {
      this.exhausted = true;
      throw new UzumApiError({
        status: 0,
        code: 'rate_limited',
        message: 'Tarix yuklash: soatlik so‘rovlar chegarasi',
        retryable: false,
      });
    }
    const m = minuteOf(now);
    this.own.set(m, (this.own.get(m) ?? 0) + 1);
  };

  /** Shu bo'lakda yuborilgan so'rovlar */
  get spent(): number {
    let n = 0;
    for (const c of this.own.values()) n += c;
    return n;
  }

  /** `payload.reqs` — shu jobning oxirgi soatdagi hisobi */
  reqs(now = Date.now()): Array<[number, number]> {
    const first = minuteOf(now) - 59;
    const merged = new Map<number, number>();
    for (const map of [this.mine, this.own]) for (const [m, c] of map) if (m >= first) merged.set(m, (merged.get(m) ?? 0) + c);
    return [...merged.entries()].sort((a, b) => a[0] - b[0]);
  }
}

/**
 * Demo klient HTTP so'rov yubormaydi: tarix yuklash hisobi va soatlik chegara
 * demo'da ham bir xil ishlashi uchun har chaqiruv bitta so'rov sanaladi.
 * Chegara to'lsa, jonli klient kabi bo'sh ro'yxat `failed` belgisi bilan qaytadi.
 */
function meterDemoCalls(client: UzumClient, meter: BackfillMeter): UzumClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        try {
          meter.tick();
        } catch (err) {
          if (prop === 'verify') return Promise.resolve({ ok: false, temporary: true, message: errorMessage(err) });
          return Promise.resolve(markList([], { failed: errorMessage(err) }));
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/** Oyna uchun taxminiy so'rovlar: buyurtma + xarajat sahifalari, FBS ro'yxati va tekshiruvlar */
const estimateRequests = (rows: number): number => Math.ceil(Math.max(0, rows) / 50) * 2 + 4;

/** Bitta oyna ko'pi bilan soatlik chegaraning yarmini olsin — aks holda oyna hech qachon sig'masdi */
const backfillTargetRows = (): number =>
  Math.max(50, Math.min(PLAN_TARGET_ROWS, Math.floor(((backfillHourlyCap() / 2 - 4) / 2) * 50)));

// ─── Qamrov holati ───

/** Kabinet tarixi qamrovi saqlanadigan sozlama kaliti */
const coverageKey = (accountId: string): string => `history.coverage:${accountId}`;
/** Buyurtmasi hali yuklanmagan yetkazish to'lovlari (alohida — asosiy yozuv kichik qolsin) */
const deliveryKey = (accountId: string): string => `history.delivery:${accountId}`;

type CoverageStatus = HistoryCoverage['status'];
type PauseReason = NonNullable<HistoryCoverage['pauseReason']>;

/**
 * `history.coverage:<kabinet>` qiymati (JSON).
 *
 * `from` — kabinetning BARCHA do'konlari shu UTC yarim tunidan beri to'liq
 * o'qilgan; yuklash davomida oynama-oyna orqaga suriladi va ayni paytda davom
 * ettirish nuqtasi ham. `stores` — do'kon bo'yicha qamrov (ATAYLAB alohida:
 * sinovda bitta do'kon ulanadi, VIP'ga o'tgach ikkinchisini oraliq sinxron
 * ulaydi va u faqat so'nggi ~14 kunni oladi). `until` — yuklash
 * boshlangandagi yuqori chegara (progress va yakuniy bosqich shunga).
 *
 * Yozuv faqat solishtirib-almashtirish (CAS) bilan yoziladi (`casCoverage`).
 */
interface CoverageState {
  from: string;
  /** Do'kon id → shu paytdan beri to'liq (yozilmagan do'kon — `storeTop` taxmini) */
  stores: Record<string, string>;
  /** Qamrovni belgilagan to'liq sinxron tugagan payt: undan keyin ulangan do'kon — "kech ulangan" */
  fullAt: string | null;
  /** Bu imkoniyatdan oldingi kabinet uchun taxmin — rejalashtiruvchi bunga tayanib o'zi yuklash boshlamaydi */
  derived: boolean;
  /** Eski birinchi to'liq sinxron Uzum chegarasiga yetib kesilgan bo'lishi mumkin */
  suspect: boolean;
  status: CoverageStatus;
  /** Yuklash qaysi sanagacha boradi — tarif chegarasi (UTC yarim tuni) */
  target: string | null;
  until: string | null;
  jobId: string | null;
  error: string | null;
  /** Belgilangan oynalar va ularga ketgan vaqt — qolgan vaqt taxmini uchun */
  windows: number;
  spentMs: number;
  /**
   * Do'kon → yozishdan OLDINGI eng yangi `Order.createdAt` (bazaning o'z
   * qiymati — soatlar farqi xalaqit bermaydi). Shundan keyin yaratilgan va
   * qamrovdan eski buyurtma — tarix yozgani: puli "oldingi to'lovlar"ga qo'shiladi.
   */
  marks: Record<string, string>;
  /** Tovar balansi jim qayta hisoblanishi kerak bo'lgan do'konlar */
  dirty: string[];
  /** Yangi tomondagi chegarasi (mavjud qamrov bilan) moliyasi kechikish bilan qayta o'qilgan do'konlar */
  edges: string[];
  /** Ketma-ket vaqtinchalik xatolar — kutish shundan uzayadi */
  transient: number;
  pausedUntil: string | null;
  pauseReason: PauseReason | null;
  failedAt: string | null;
  updatedAt: string;
}

const COVERAGE_STATUSES: CoverageStatus[] = ['idle', 'queued', 'running', 'done', 'failed'];
const PAUSE_REASONS: PauseReason[] = ['night', 'budget', 'retry'];

const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function parseCoverage(value: string | null | undefined): CoverageState | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isIsoDate(r.from)) return null;
    const num = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
    const isoMap = (v: unknown): Record<string, string> => {
      const out: Record<string, string> = {};
      if (v && typeof v === 'object') for (const [k, at] of Object.entries(v as Record<string, unknown>)) if (isIsoDate(at)) out[k] = at;
      return out;
    };
    const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
      from: r.from,
      stores: isoMap(r.stores),
      fullAt: isIsoDate(r.fullAt) ? r.fullAt : null,
      derived: r.derived === true,
      suspect: r.suspect === true,
      status: COVERAGE_STATUSES.includes(r.status as CoverageStatus) ? (r.status as CoverageStatus) : 'idle',
      target: isIsoDate(r.target) ? r.target : null,
      until: isIsoDate(r.until) ? r.until : null,
      jobId: typeof r.jobId === 'string' ? r.jobId : null,
      error: typeof r.error === 'string' ? r.error : null,
      windows: Math.max(0, num(r.windows, 0)),
      spentMs: Math.max(0, num(r.spentMs, 0)),
      marks: isoMap(r.marks),
      dirty: ids(r.dirty),
      edges: ids(r.edges),
      transient: Math.max(0, num(r.transient, 0)),
      pausedUntil: isIsoDate(r.pausedUntil) ? r.pausedUntil : null,
      pauseReason: PAUSE_REASONS.includes(r.pauseReason as PauseReason) ? (r.pauseReason as PauseReason) : null,
      failedAt: isIsoDate(r.failedAt) ? r.failedAt : null,
      updatedAt: isIsoDate(r.updatedAt) ? r.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

const serializeCoverage = (s: CoverageState): string => JSON.stringify({ ...s, updatedAt: new Date().toISOString() });

const cloneCoverage = (s: CoverageState): CoverageState => ({
  ...s,
  stores: { ...s.stores },
  marks: { ...s.marks },
  dirty: [...s.dirty],
  edges: [...s.edges],
});

const freshCoverage = (from: Date, fullAt: Date | null = null): CoverageState => ({
  from: from.toISOString(),
  stores: {},
  fullAt: fullAt ? fullAt.toISOString() : null,
  derived: false,
  suspect: false,
  status: 'idle',
  target: null,
  until: null,
  jobId: null,
  error: null,
  windows: 0,
  spentMs: 0,
  marks: {},
  dirty: [],
  edges: [],
  transient: 0,
  pausedUntil: null,
  pauseReason: null,
  failedAt: null,
  updatedAt: new Date().toISOString(),
});

async function readCoverageRaw(
  companyId: string,
  accountId: string,
): Promise<{ raw: string | null; state: CoverageState | null }> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: coverageKey(accountId) } },
    select: { value: true },
  });
  return { raw: row?.value ?? null, state: parseCoverage(row?.value) };
}

async function readCoverage(companyId: string, accountId: string): Promise<CoverageState | null> {
  return (await readCoverageRaw(companyId, accountId)).state;
}

/**
 * Qamrov yozuvini solishtirib-almashtirib yozadi (compare-and-swap): o'qilgandan
 * beri boshqa jarayon o'zgartirgan bo'lsa — `CoverageConflict`, hech narsa
 * yozilmaydi. `extra` (masalan, "oldingi to'lovlar") shu tranzaksiyada.
 * Ikki bo'lak bir jobni olib qolganda ham pul ikki marta qo'shilmaydi.
 */
async function casCoverage(
  companyId: string,
  accountId: string,
  raw: string | null,
  next: CoverageState,
  extra?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  const key = coverageKey(accountId);
  const value = serializeCoverage(next);
  await prisma.$transaction(async (tx) => {
    if (raw === null) {
      try {
        await tx.companySetting.create({ data: { companyId, key, value } });
      } catch {
        // Bir vaqtda boshqasi yaratdi (companyId + key — unique)
        throw new CoverageConflict();
      }
    } else {
      const res = await tx.companySetting.updateMany({ where: { companyId, key, value: raw }, data: { value } });
      if (res.count !== 1) throw new CoverageConflict();
    }
    if (extra) await extra(tx);
  });
}

/** O'qib-o'zgartirib CAS bilan yozadi (to'qnashuvda qayta o'qiydi). `mutate` null qaytarsa — yozmaydi */
async function updateCoverage(
  companyId: string,
  accountId: string,
  mutate: (state: CoverageState | null) => CoverageState | null,
  extra?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<CoverageState | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { raw, state } = await readCoverageRaw(companyId, accountId);
    const next = mutate(state ? cloneCoverage(state) : null);
    if (!next) return state;
    try {
      await casCoverage(companyId, accountId, raw, next, extra);
      return next;
    } catch (err) {
      if (!(err instanceof CoverageConflict)) throw err;
    }
  }
  throw new CoverageConflict();
}

/** Tarif ruxsat bergan tarix boshi — UTC yarim tuni (to'liq sinxron oynasi bilan bir xil) */
function historyFloorFor(planId: PlanId, now: Date = new Date()): Date {
  return utcDayStart(addDays(now, -Math.min(getPlan(planId).limits.historyDays, MAX_HISTORY_DAYS)));
}

/** Eng qisqa tarif oynasi (kun) — eski kabinet qamrovini taxmin qilishda ehtiyot chegarasi */
const MIN_PLAN_HISTORY_DAYS = Math.min(...Object.values(PLANS).map((p) => p.limits.historyDays));

/**
 * Qamrov yozuvi bo'lmagan (bu imkoniyatdan OLDIN sinxronlangan) kabinet uchun
 * taxmin. Birinchi muvaffaqiyatli to'liq sinxron kamida eng qisqa tarif oynasini
 * (30 kun) olgan, bazadagi barcha buyurtmalar esa qamrov ichida — demak haqiqiy
 * qamrov boshi ikkalasidan ham kech emas: yuklash hech narsani tashlab ketmaydi.
 *
 * Bitta taxmin bilan tuzatib bo'lmaydigan holat — `suspect`: eski to'liq sinxron
 * butun oynani BITTA so'rovda o'qigan va katta do'konda 10 000 qatorda jim
 * kesilgan bo'lishi mumkin (o'sha sinxron yozgan pozitsiyalar chegaraga yaqin).
 * Bunday kabinetga "Tarixni qayta tekshirish" taklif qilinadi.
 */
async function deriveCoverage(companyId: string, accountId: string): Promise<CoverageState | null> {
  const [firstFull, oldest] = await Promise.all([
    prisma.syncJob.findFirst({
      where: { companyId, type: 'full', status: 'done', OR: [{ uzumAccountId: accountId }, { uzumAccountId: null }] },
      orderBy: { createdAt: 'asc' },
      select: { startedAt: true, createdAt: true, finishedAt: true },
    }),
    prisma.order.findFirst({
      where: { store: { companyId, uzumAccountId: accountId } },
      orderBy: { orderedAt: 'asc' },
      select: { orderedAt: true },
    }),
  ]);
  const candidates: number[] = [];
  if (firstFull) candidates.push(addDays(firstFull.startedAt ?? firstFull.createdAt, -MIN_PLAN_HISTORY_DAYS).getTime());
  if (oldest) candidates.push(oldest.orderedAt.getTime());
  if (candidates.length === 0) return null;
  const state = freshCoverage(utcDayStart(new Date(Math.min(...candidates))), firstFull?.finishedAt ?? null);
  state.derived = true;
  if (firstFull?.finishedAt) {
    // O'sha sinxron yozgan pozitsiyalar (keyin kelganlari emas) Uzum chegarasiga yaqinmi
    const imported = await prisma.orderItem.count({
      where: {
        order: {
          store: { companyId, uzumAccountId: accountId },
          createdAt: { lte: firstFull.finishedAt },
          orderedAt: { lte: firstFull.startedAt ?? firstFull.createdAt },
        },
      },
    });
    state.suspect = imported >= SUSPECT_ROWS;
  }
  return state;
}

/** Kabinetning Uzum do'konlari (ulanish vaqti bilan — kech ulanganini aniqlash uchun) */
interface AccountStore {
  id: string;
  uzumShopId: string;
  title: string;
  createdAt: Date;
}

async function accountStores(companyId: string, accountId: string): Promise<AccountStore[]> {
  const rows = await prisma.store.findMany({
    where: { companyId, uzumAccountId: accountId },
    select: { id: true, uzumShopId: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.filter((r): r is AccountStore => Boolean(r.uzumShopId));
}

/**
 * Do'kon tarixi qachondan beri to'liq. Yozilgani bo'lmasa: qamrovni belgilagan
 * to'liq sinxrondan KEYIN ulangan do'konni oraliq sinxron ulagan — u faqat
 * so'nggi kunlarni olgan, shuning uchun ulangan kunidan oldingisi yo'q deb olinadi.
 */
function storeTop(state: CoverageState, store: { id: string; createdAt: Date }): number {
  const known = state.stores[store.id];
  if (known) return Date.parse(known);
  const base = Date.parse(state.from);
  const fullAt = state.fullAt ? Date.parse(state.fullAt) : null;
  if (fullAt !== null && store.createdAt.getTime() <= fullAt) return base;
  return Math.max(base, utcDayStart(store.createdAt).getTime());
}

/** Kabinet qamrovi — eng kam qamrovli do'kon bo'yicha (do'kon yo'q bo'lsa — yozilgan sana) */
function coverageStart(state: CoverageState, stores: { id: string; createdAt: Date }[]): number {
  if (stores.length === 0) return Date.parse(state.from);
  return Math.max(...stores.map((s) => storeTop(state, s)));
}

/**
 * Har do'kon qamrovini yozuvga aniq ko'chiradi va `from` ni eng kam qamrovli
 * do'konga tenglaydi. Tartib muhim: `from` o'zgargach, yozilmagan do'kon
 * qamrovi undan taxmin qilinadi (`storeTop`) — shuning uchun avval hammasi yoziladi.
 */
function materializeCoverage(state: CoverageState, stores: { id: string; createdAt: Date }[]): CoverageState {
  const next = cloneCoverage(state);
  for (const s of stores) next.stores[s.id] = new Date(storeTop(state, s)).toISOString();
  next.from = new Date(coverageStart(next, stores)).toISOString();
  return next;
}

/** To'liq sinxron tugadi: uning do'konlari shu oynagacha to'liq (oldingi chuqurroq qamrov saqlanadi) */
async function noteFullCoverage(run: SyncRun): Promise<void> {
  const stores = await accountStores(run.companyId, run.accountId);
  const derived = (await readCoverage(run.companyId, run.accountId))
    ? null
    : await deriveCoverage(run.companyId, run.accountId);
  const synced = new Set(run.stores.map((s) => s.id));
  await updateCoverage(run.companyId, run.accountId, (current) => {
    const state = current ?? derived ?? freshCoverage(run.from);
    const next = cloneCoverage(state);
    for (const s of stores) {
      const top = synced.has(s.id) ? Math.min(storeTop(state, s), run.from.getTime()) : storeTop(state, s);
      next.stores[s.id] = new Date(top).toISOString();
    }
    next.fullAt = new Date().toISOString();
    next.derived = false;
    next.from = new Date(
      stores.length > 0 ? coverageStart(next, stores) : Math.min(Date.parse(state.from), run.from.getTime()),
    ).toISOString();
    return next;
  });
}

// ─── Pul va tovar balansi: tarix yozganini yopish ───

/** Belgidan keyin bazaga YANGI yozilgan, `top` dan eski buyurtmalarning yechib berilgan puli (balans to'plami) */
async function historicWithdrawn(storeId: string, mark: Date, top: Date): Promise<number> {
  const agg = await prisma.orderItem.aggregate({
    _sum: { withdrawn: true },
    where: {
      status: { notIn: ['canceled', 'returned'] },
      order: { storeId, createdAt: { gt: mark }, orderedAt: { lt: top } },
    },
  });
  return round(agg._sum.withdrawn ?? 0);
}

/**
 * Tarixdan kelgan buyurtmalarning `withdrawnProfit` i — Uzum ularni oylar oldin
 * to'lagan. To'lovlar tarixi esa yig'indining O'SISHINI yangi to'lov deb yozadi
 * (payout-history.ts): u "bugun o'tkazilgan to'lov" bo'lib chiqardi. Shuning
 * uchun tarix boshidagi "oldingi to'lovlar" qatoriga qo'shiladi. Do'konda hali
 * birorta yozuv bo'lmasa — hech narsa: birinchi `recordPayout` hammasini o'zi shunday yozadi.
 */
async function addEarlierPayout(tx: Prisma.TransactionClient, storeId: string, amount: number): Promise<void> {
  const first = await tx.payoutRecord.findFirst({ where: { storeId }, orderBy: { date: 'asc' }, select: { date: true } });
  if (!first) return;
  const earlier = await tx.payoutRecord.findFirst({
    where: { storeId, kind: 'earlier' },
    orderBy: { date: 'asc' },
    select: { id: true, amount: true },
  });
  if (earlier) {
    await tx.payoutRecord.update({ where: { id: earlier.id }, data: { amount: round(earlier.amount + amount) } });
  } else {
    await tx.payoutRecord.create({ data: { storeId, date: first.date, amount: round(amount), kind: 'earlier' } });
  }
}

/**
 * Do'kon belgisini yopadi: belgidan keyin YANGI yozilgan eski buyurtmalarning
 * puli "oldingi to'lovlar"ga qo'shiladi va `patch` (qamrov, tozalik) bilan
 * birga BITTA tranzaksiyada yoziladi. Yozuv o'zgargan bo'lsa (CAS) — qaytadan
 * o'qiladi: bir buyurtma puli ikki marta qo'shilmaydi.
 */
async function settleStore(
  companyId: string,
  accountId: string,
  storeId: string,
  opts: { patch?: (s: CoverageState) => void; extra?: (tx: Prisma.TransactionClient) => Promise<void> } = {},
): Promise<{ state: CoverageState | null; absorbed: number }> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { raw, state } = await readCoverageRaw(companyId, accountId);
    if (!state) return { state: null, absorbed: 0 };
    const mark = state.marks[storeId];
    const top = state.stores[storeId];
    const absorbed = mark && top ? await historicWithdrawn(storeId, new Date(mark), new Date(top)) : 0;
    const next = cloneCoverage(state);
    delete next.marks[storeId];
    opts.patch?.(next);
    try {
      await casCoverage(companyId, accountId, raw, next, async (tx) => {
        if (absorbed >= 1) await addEarlierPayout(tx, storeId, absorbed);
        if (opts.extra) await opts.extra(tx);
      });
      return { state: next, absorbed };
    } catch (err) {
      if (!(err instanceof CoverageConflict)) throw err;
    }
  }
  throw new CoverageConflict();
}

/**
 * Tovar balansi tarixdan kelgan buyurtmalar bilan qayta hisoblanadi — JIM.
 * Eski buyurtmalar balansdagi farqni o'zgartiradi; buni keyingi oddiy sinxron
 * ko'rsa, sotuvchiga "yo'qotish aniqlandi / topildi" deb yangilik sifatida xabar
 * berardi, holbuki bu tarix. Qaytaradi: muvaffaqiyatlimi (yo'q bo'lsa — do'kon "kir" qoladi).
 */
async function silentLossSync(storeId: string, label: string): Promise<boolean> {
  try {
    await syncLossRecords(storeId);
    return true;
  } catch (err) {
    log(`${label} (tarix): tovar balansi hisoblanmadi — ${errorMessage(err)}`);
    return false;
  }
}

/** "Kir" do'kon balansini jim yangilaydi va belgisini oladi */
async function cleanDirty(companyId: string, accountId: string, storeId: string, label: string): Promise<CoverageState | null> {
  if (!(await silentLossSync(storeId, label))) return readCoverage(companyId, accountId);
  return updateCoverage(companyId, accountId, (s) => {
    if (!s || !s.dirty.includes(storeId)) return null;
    s.dirty = s.dirty.filter((x) => x !== storeId);
    return s;
  });
}

/**
 * Uzilib qolgan tarix urinishining qoldig'i: ochiq belgilar yopiladi (puli
 * "oldingi to'lovlar"ga), "kir" do'konlar balansi jim yangilanadi. Tarix
 * bo'lagi boshida ham, ODDIY SINXRON boshida ham chaqiriladi — qaysi biri
 * birinchi kelsa, sotuvchiga tarix yangilik bo'lib ko'rinmaydi.
 */
async function recoverPending(companyId: string, accountId: string, label: string): Promise<void> {
  const state = await readCoverage(companyId, accountId);
  if (!state) return;
  for (const storeId of Object.keys(state.marks)) {
    const { absorbed } = await settleStore(companyId, accountId, storeId);
    if (absorbed > 0) log(`${label}: uzilgan tarix yuklashidan ${absorbed} so‘m "oldingi to‘lovlar"ga qo‘shildi`);
  }
  const fresh = await readCoverage(companyId, accountId);
  for (const storeId of fresh?.dirty ?? []) await cleanDirty(companyId, accountId, storeId, label);
}

/** Oddiy sinxron boshida: shu kabinetning uzilgan tarix qoldig'ini yopadi (bo'lmasa — bitta o'qish) */
async function settleBackfill(run: SyncRun): Promise<void> {
  const state = await readCoverage(run.companyId, run.accountId);
  if (!state || (Object.keys(state.marks).length === 0 && state.dirty.length === 0)) return;
  await recoverPending(run.companyId, run.accountId, `job ${run.jobId}`);
}

// ─── Yetkazish to'lovlari xotirasi ───

/** Do'kon → buyurtma raqami → [yetkazish haqi, satr kuni YYYY-MM-DD] */
type DeliveryMemo = Map<string, Map<string, [number, string]>>;

async function readDeliveries(companyId: string, accountId: string): Promise<DeliveryMemo> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: deliveryKey(accountId) } },
    select: { value: true },
  });
  const memo: DeliveryMemo = new Map();
  if (!row?.value) return memo;
  try {
    const raw = JSON.parse(row.value) as Record<string, unknown>;
    for (const [storeId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      const m = new Map<string, [number, string]>();
      for (const e of list as unknown[]) {
        if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number' && typeof e[2] === 'string') {
          m.set(e[0], [e[1], e[2]]);
        }
      }
      memo.set(storeId, m);
    }
  } catch {
    // Buzilgan yozuv — bo'sh xotira (eng yomoni: bir necha buyurtmada nominal logistika qoladi)
  }
  return memo;
}

const serializeDeliveries = (memo: DeliveryMemo): string =>
  JSON.stringify(Object.fromEntries([...memo].map(([s, m]) => [s, [...m].map(([id, [a, d]]) => [id, a, d])])));

/**
 * Bazadagi topshirish kechikishidan (99-foizlik): yetkazish to'lovi satri
 * buyurtmadan shuncha kun keyin kelishi mumkin. Mavjud qamrov bilan chegarada
 * moliya shuncha kun oldinga o'qiladi (xotiradagi satrlar esa doim 45 kun saqlanadi).
 */
async function pickupDelayDays(storeId: string): Promise<number> {
  const rows = await prisma.order.findMany({
    where: { storeId, deliveredAt: { not: null } },
    orderBy: { orderedAt: 'desc' },
    take: 2_000,
    select: { orderedAt: true, deliveredAt: true },
  });
  const delays = rows
    .map((r) => ((r.deliveredAt?.getTime() ?? 0) - r.orderedAt.getTime()) / DAY_MS)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  if (delays.length < 20) return 14;
  const p99 = delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.99))];
  return clamp(Math.ceil(p99) + 2, PICKUP_DELAY_MIN_DAYS, PICKUP_DELAY_MAX_DAYS);
}

/** Tarix oralig'i (bazada hali yo'q) uchun zichlik — do'konning eng eski 30 kunlik ma'lumotidan, qator/kun */
async function backfillDensity(storeId: string): Promise<number | null> {
  const oldest = await prisma.order.findFirst({ where: { storeId }, orderBy: { orderedAt: 'asc' }, select: { orderedAt: true } });
  if (!oldest) return null;
  const to = new Date(oldest.orderedAt.getTime() + 30 * DAY_MS - 1);
  const [items, fees] = await Promise.all([
    prisma.orderItem.count({ where: { order: { storeId, orderedAt: { gte: oldest.orderedAt, lte: to } } } }),
    prisma.storageFee.count({ where: { storeId, date: { gte: oldest.orderedAt, lte: to } } }),
  ]);
  return (items + fees) / 30;
}

// ─── Bo'lak ───

/** Bitta bo'lak davomidagi holat */
interface SliceCtx {
  job: SyncJob;
  lease: string;
  leaseLost: boolean;
  run: SyncRun;
  client: UzumClient;
  meter: BackfillMeter;
  stores: AccountStore[];
  /** Oxirgi yozilgan qamrov (har yozuvdan keyin yangilanadi) */
  state: CoverageState;
  deliveries: DeliveryMemo;
  pickup: Map<string, number>;
  /** Shu oynada xotiradan qo'llangan yetkazish to'lovlari — oynaning o'z satrlari bilan qo'shiladi */
  applied: Map<string, number>;
  detail: string;
  windowStartedAt: number;
}

const fenceOf = (job: SyncJob, lease: string) => ({ id: job.id, status: 'running', payload: { contains: lease } });
/** Hisob hali yuklanmagan bo'lsa — jobning oldingi so'rovlari yo'qolmasin (soatlik chegara ulardan sanaladi) */
const payloadOf = (lease: string, meter: BackfillMeter | null, job?: SyncJob): string =>
  JSON.stringify({ lease, reqs: meter?.reqs() ?? (job ? parseJobPayload(job.payload).reqs : undefined) ?? [] } satisfies JobPayload);

/** Tarix bo'lagi uchun SyncRun — `stepAuth` va import yordamchilari shuni oladi */
function backfillRun(job: SyncJob, companyId: string, accountId: string, planId: PlanId, taxRate: number, range: TimeWindow): SyncRun {
  return {
    jobId: job.id,
    companyId,
    accountId,
    type: 'backfill',
    planId,
    syncIntervalMinutes: getPlan(planId).limits.syncIntervalMinutes,
    taxRate,
    from: range.from,
    to: range.to,
    ordersFrom: range.from,
    client: null,
    stores: [],
    profile: DEFAULT_PROFILE,
    calibrated: false,
    startedMs: Date.now(),
    stepMs: [],
    totals: emptyTotals(),
  };
}

/** Yuklash progressi: [target, until] oralig'ining o'qilgan qismi; qolgan vaqt — kun boshiga ketgan vaqtdan */
function backfillProgress(state: CoverageState): { progress: number; etaSeconds: number } {
  const from = Date.parse(state.from);
  const until = state.until ? Math.max(Date.parse(state.until), from) : from;
  const target = state.target ? Math.min(Date.parse(state.target), from) : from;
  const total = until - target;
  const done = until - from;
  const progress = total > 0 ? clamp(Math.round((done / total) * 100), 0, 99) : 99;
  const etaSeconds = done > 0 && state.spentMs > 0 ? Math.round(((state.spentMs / done) * (from - target)) / 1000) : 0;
  return { progress, etaSeconds };
}

async function writeBackfillProgress(ctx: SliceCtx, step: SyncStepId): Promise<void> {
  const p = backfillProgress(ctx.state);
  const res = await prisma.syncJob.updateMany({
    where: fenceOf(ctx.job, ctx.lease),
    data: {
      step,
      stepIndex: Math.max(0, SYNC_STEPS.findIndex((s) => s.id === step)),
      progress: p.progress,
      etaSeconds: p.etaSeconds,
      message: ctx.detail,
      payload: payloadOf(ctx.lease, ctx.meter),
    },
  });
  if (res.count === 0) throw new LeaseLost();
}

/**
 * Har oyna (va har bosqich) oldidan: job hali shu bo'lakniki ekani (ijara),
 * navbatda oddiy sinxron yo'qligi, tinch soat emasligi va soatlik chegarada
 * keyingi oynaga joy borligi. Biror shart buzilsa — bajarilgan oynalar
 * belgilangan holda to'xtaladi.
 */
async function checkpoint(ctx: SliceCtx, need: number): Promise<void> {
  if (ctx.leaseLost) throw new LeaseLost();
  const [me, regular] = await Promise.all([
    prisma.syncJob.findUnique({ where: { id: ctx.job.id }, select: { status: true, payload: true } }),
    prisma.syncJob.findFirst({
      where: { companyId: ctx.job.companyId, type: { not: 'backfill' }, status: { in: ['queued', 'running'] } },
      select: { id: true },
    }),
  ]);
  if (!me || me.status === 'canceled') throw new SyncCanceledError('Tarix yuklash bekor qilindi');
  if (me.status !== 'running' || parseJobPayload(me.payload).lease !== ctx.lease) throw new LeaseLost();
  if (regular) throw new SyncYieldError();
  const night = quietUntil();
  if (night) throw new BackfillPause('night', night);
  const want = Math.min(need, backfillHourlyCap());
  if (ctx.meter.remaining() < want) throw new BackfillPause('budget', ctx.meter.freeAt(want));
}

/** Uzum javobi chala — oyna belgilanmaydi (chegara bo'lsa tanaffus, aks holda vaqtinchalik xato) */
function stopIfIncomplete(ctx: SliceCtx, meta: UzumListMeta): void {
  if (!meta.failed) return;
  if (ctx.meter.exhausted) throw new BackfillPause('budget', ctx.meter.freeAt(1));
  throw new TransientSyncError(`Uzum javobi chala: ${meta.failed}`);
}

async function pickupDays(ctx: SliceCtx, storeId: string): Promise<number> {
  let days = ctx.pickup.get(storeId);
  if (days === undefined) {
    days = await pickupDelayDays(storeId);
    ctx.pickup.set(storeId, days);
  }
  return days;
}

/** Xotiradagi yetkazish to'lovlari: buyurtmasi endi shu oynada yozilganlari qo'llanadi va o'chiriladi */
async function applyRemembered(ctx: SliceCtx, storeId: string, w: TimeWindow, top: number): Promise<void> {
  ctx.applied = new Map();
  const memo = ctx.deliveries.get(storeId);
  if (!memo || memo.size === 0) return;
  const ids = [...memo.keys()];
  for (let i = 0; i < ids.length; i += LOGISTICS_BATCH_ORDERS) {
    const rows = await prisma.order.findMany({
      where: {
        storeId,
        uzumOrderId: { in: ids.slice(i, i + LOGISTICS_BATCH_ORDERS) },
        orderedAt: { gte: w.from, lt: new Date(top) },
      },
      select: { uzumOrderId: true },
    });
    for (const r of rows) {
      const entry = r.uzumOrderId ? memo.get(r.uzumOrderId) : undefined;
      if (!r.uzumOrderId || !entry) continue;
      ctx.applied.set(r.uzumOrderId, entry[0]);
      memo.delete(r.uzumOrderId);
    }
  }
  await applyDeliveries(storeId, ctx.applied);
}

/**
 * Oynaning yetkazish to'lovlari. Buyurtmasi bazada bo'lib, shu yoki yangiroq
 * oynada bo'lsa — darhol qo'llanadi. Buyurtma hali yuklanmagan yoki eskiroq
 * oynada QAYTA yoziladigan bo'lsa (import logistikani nominalga qaytaradi) —
 * eslab qolinadi va o'sha oyna yozilgach qo'llanadi. Ilgari yangi tomonda faqat
 * 7 kun oldinga qaralardi: kechikib kelgan to'lov (7 kundan ko'p) hech qachon
 * buyurtmasini topmasdi.
 */
async function rememberDeliveries(ctx: SliceCtx, storeId: string, w: TimeWindow, expenses: UzumExpense[]): Promise<void> {
  const rows = new Map<string, [number, string]>();
  for (const e of expenses) {
    if (!e.deliveryOrderId) continue;
    const amount = Number.isFinite(e.amount) ? e.amount : 0;
    const day = e.date.slice(0, 10);
    const cur = rows.get(e.deliveryOrderId);
    rows.set(e.deliveryOrderId, cur ? [cur[0] + amount, cur[1] > day ? cur[1] : day] : [amount, day]);
  }
  const memo = ctx.deliveries.get(storeId) ?? new Map<string, [number, string]>();
  const now = new Map<string, number>();
  const ids = [...rows.keys()];
  for (let i = 0; i < ids.length; i += LOGISTICS_BATCH_ORDERS) {
    const batch = ids.slice(i, i + LOGISTICS_BATCH_ORDERS);
    const found = await prisma.order.findMany({
      where: { storeId, uzumOrderId: { in: batch } },
      select: { uzumOrderId: true, orderedAt: true },
    });
    const orderedAt = new Map(found.map((f) => [f.uzumOrderId ?? '', f.orderedAt.getTime()]));
    for (const id of batch) {
      const [amount, day] = rows.get(id) ?? [0, ''];
      const at = orderedAt.get(id);
      if (at !== undefined && at >= w.from.getTime()) {
        now.set(id, amount + (ctx.applied.get(id) ?? 0));
      } else {
        const prev = memo.get(id);
        memo.set(id, prev ? [prev[0] + amount, prev[1] > day ? prev[1] : day] : [amount, day]);
      }
    }
  }
  await applyDeliveries(storeId, now);

  /*
   * Satr kunidan eng uzun kechikish (45 kun) oldin ham buyurtma topilmagan
   * bo'lsa — u bu do'konniki emas. Bu yerda do'konning o'z 99-foizligi EMAS,
   * yuqori chegara: xotirada saqlash Uzum'ga so'rov talab qilmaydi, 99-foizlik
   * esa sekin topshirilgan bir necha buyurtmani kam baholab, ularning haqiqiy
   * logistikasini yo'qotardi (99-foizlik faqat chegaradagi oldinga o'qishda — u so'rov).
   */
  const keep = PICKUP_DELAY_MAX_DAYS * DAY_MS;
  for (const [id, [, day]] of memo) if (Date.parse(`${day}T00:00:00.000Z`) - keep >= w.from.getTime()) memo.delete(id);
  if (memo.size > DELIVERY_MEMO_CAP) {
    const drop = [...memo.entries()].sort((a, b) => a[1][1].localeCompare(b[1][1])).slice(0, memo.size - DELIVERY_MEMO_CAP);
    for (const [id] of drop) memo.delete(id);
    log(`job ${ctx.job.id} (tarix): yetkazish xotirasi chegarasi — ${drop.length} ta eski satr tashlandi`);
  }
  ctx.deliveries.set(storeId, memo);
}

/**
 * Belgi — oyna yozuvlaridan OLDIN saqlanadi: jarayon o'rtada uzilsa ham keyingi
 * urinish yoki oddiy sinxron aynan nima yozilganini biladi. Do'kon shu
 * yozuvning o'zida "kir" deb belgilanadi — tovar balansi ham, yozuv qayerda
 * to'xtaganidan qat'i nazar, oddiy sinxron xabar berishidan oldin jim yangilanadi.
 */
async function openMark(ctx: SliceCtx, storeId: string, top: Date): Promise<void> {
  if (ctx.state.marks[storeId] && ctx.state.dirty.includes(storeId)) return;
  const agg = await prisma.order.aggregate({ _max: { createdAt: true }, where: { storeId, orderedAt: { lt: top } } });
  const mark = (agg._max.createdAt ?? new Date(0)).toISOString();
  const next = await updateCoverage(ctx.run.companyId, ctx.run.accountId, (s) => {
    if (!s) return null;
    if (!s.marks[storeId]) s.marks[storeId] = mark;
    if (!s.dirty.includes(storeId)) s.dirty.push(storeId);
    return s;
  });
  if (next) ctx.state = next;
}

/** Oyna tugadi: qamrov, "oldingi to'lovlar" va yetkazish xotirasi — bitta tranzaksiyada */
async function stampWindow(ctx: SliceCtx, storeId: string, w: TimeWindow): Promise<void> {
  const memoValue = serializeDeliveries(ctx.deliveries);
  const { companyId, accountId } = ctx.run;
  const spent = Date.now() - ctx.windowStartedAt;
  const { state, absorbed } = await settleStore(companyId, accountId, storeId, {
    patch: (s) => {
      s.stores[storeId] = w.from.toISOString();
      if (!s.dirty.includes(storeId)) s.dirty.push(storeId);
      if (!s.edges.includes(storeId)) s.edges.push(storeId);
      s.windows += 1;
      s.spentMs += spent;
      s.transient = 0;
      s.error = null;
      s.pausedUntil = null;
      s.pauseReason = null;
      s.from = new Date(coverageStart(s, ctx.stores)).toISOString();
    },
    extra: async (tx) => {
      await tx.companySetting.upsert({
        where: { companyId_key: { companyId, key: deliveryKey(accountId) } },
        create: { companyId, key: deliveryKey(accountId), value: memoValue },
        update: { value: memoValue },
      });
    },
  });
  if (state) ctx.state = state;
  if (absorbed > 0) log(`job ${ctx.job.id} (tarix): ${absorbed} so‘m tarixiy to‘lov "oldingi to‘lovlar"ga qo‘shildi`);
}

/**
 * Bitta oyna: buyurtmalar, so'ng moliya; oxirida qamrovga belgilanadi. Xabar
 * yuborilmaydi (`collectNew` o'chiq). Uzum javobi chala bo'lsa oyna
 * belgilanmaydi — xato bilan chiqiladi va keyinroq qaytadan o'qiladi.
 * Qaytaradi: oynadagi qatorlar (keyingi oyna uzunligi uchun).
 */
async function backfillWindow(ctx: SliceCtx, store: AccountStore, w: TimeWindow, rate: number | null): Promise<number> {
  const top = Date.parse(ctx.state.stores[store.id] ?? ctx.state.from);
  const rows = rate === null ? backfillTargetRows() : rate * spanDays(w);
  await checkpoint(ctx, estimateRequests(rows));
  ctx.windowStartedAt = Date.now();
  ctx.detail = `Tarix ${dayOf(w.from)}…${dayOf(w.to)} · ${store.title}: buyurtmalar`;
  await writeBackfillProgress(ctx, 'orders');
  await openMark(ctx, store.id, new Date(top));

  const orders = await fetchOrdersWindow(ctx.client, store.uzumShopId, w, `job ${ctx.job.id}`);
  stopIfIncomplete(ctx, listMeta(orders));
  ctx.run.totals.orders += countOf(await upsertOrders(store.id, orders, { taxRate: ctx.run.taxRate, collectNew: false }));
  await applyRemembered(ctx, store.id, w, top);

  // Mavjud qamrov bilan chegarada moliya yetkazish kechikishicha oldinga o'qiladi (kunlar butun)
  ctx.detail = `Tarix ${dayOf(w.from)}…${dayOf(w.to)} · ${store.title}: moliya`;
  await writeBackfillProgress(ctx, 'finance');
  const lookahead = ctx.state.edges.includes(store.id) ? 0 : (await pickupDays(ctx, store.id)) * DAY_MS;
  const todayEnd = utcDayStart(new Date()).getTime() - 1;
  const financeTo = new Date(Math.max(w.to.getTime(), Math.min(w.to.getTime() + lookahead, todayEnd)));
  const fin = await fetchFinanceWindow(ctx.client, store.uzumShopId, { from: w.from, to: financeTo }, `job ${ctx.job.id}`);
  stopIfIncomplete(ctx, fin.meta);
  const finExpenses = ownExpenses(ctx.run, store.id, fin.expenses);
  ctx.run.totals.expenses += countOf(await upsertExpenses(ctx.run.companyId, store.id, finExpenses));
  ctx.run.totals.storage += countOf(await upsertStorageFees(store.id, fin.fees));
  await rememberDeliveries(ctx, store.id, w, finExpenses);

  await stampWindow(ctx, store.id, w);
  return Math.max(orderRows(orders), fin.expenses.length + fin.fees.length);
}

/**
 * Yakuniy bosqich: qaytarish nakladnoylari, yo'qotishlar va sharhlar yuklangan
 * oraliq bo'yicha BIR MARTA (jonli Uzum qaytarishlarni sanadan qat'i nazar
 * butunligicha beradi — har oynada qayta so'rash ortiqcha), so'ng mahsulot
 * reytinglari qayta hisoblanadi. Sharhlar ixtiyoriy: vitrina javob bermasa ham yakunlanadi.
 */
async function finalizeBackfill(ctx: SliceCtx): Promise<void> {
  const { client, run } = ctx;
  const from = new Date(ctx.state.from);
  const until = new Date(Date.parse(ctx.state.until ?? ctx.state.from) - 1);
  const now = new Date();
  for (const store of ctx.stores) {
    await checkpoint(ctx, 4);
    ctx.detail = `Tarix: qaytarishlar · ${store.title}`;
    await writeBackfillProgress(ctx, 'returns');
    if (until.getTime() >= from.getTime()) {
      const [returns, losses] = await Promise.all([
        client.getReturns(store.uzumShopId, from, until),
        client.getLosses(store.uzumShopId, from, until),
      ]);
      stopIfIncomplete(ctx, listMeta(returns));
      stopIfIncomplete(ctx, listMeta(losses));
      run.totals.returns += countOf(await upsertReturns(store.id, returns));
      run.totals.losses += countOf(await upsertLosses(store.id, losses));
    }
    await silentLossSync(store.id, `job ${ctx.job.id}`);

    await checkpoint(ctx, 4);
    ctx.detail = `Tarix: sharhlar · ${store.title}`;
    await writeBackfillProgress(ctx, 'reviews');
    const reviews = await client.getReviews(store.uzumShopId, from, now, await reviewProductIds(store.id));
    if (!listMeta(reviews).failed) run.totals.reviews += countOf(await upsertReviews(store.id, reviews));
  }
  await refreshProductRatings(ctx.stores.map((s) => s.id));
}

/** Tarix jobini yakunlaydi — bildirishnomasiz (sotuvchi buni so'ramagan, u fonda ketgan) */
async function completeBackfill(
  job: SyncJob,
  lease: string,
  meter: BackfillMeter | null,
  patch: ((s: CoverageState) => void) | null,
  message: string,
  jobStatus: 'done' | 'canceled' = 'done',
): Promise<void> {
  const res = await prisma.syncJob.updateMany({
    where: fenceOf(job, lease),
    data: {
      status: jobStatus,
      ...(jobStatus === 'done' ? { progress: 100, step: 'done', stepIndex: SYNC_STEPS.length } : {}),
      message,
      error: null,
      etaSeconds: 0,
      finishedAt: new Date(),
      payload: payloadOf(lease, meter, job),
    },
  });
  if (res.count === 0) return;
  if (patch && job.uzumAccountId) {
    await updateCoverage(job.companyId, job.uzumAccountId, (s) => {
      if (!s) return null;
      patch(s);
      s.jobId = job.id;
      return s;
    });
  }
  log(`job ${job.id} (tarix) ${jobStatus === 'done' ? 'tugadi' : 'to‘xtatildi'} — ${message}`);
}

/**
 * Tarix bo'lagi to'xtadi. Hech biri sotuvchiga xabar yubormaydi va kabinet
 * holatini o'zgartirmaydi: kalit rostdan yaroqsiz bo'lsa, buni oddiy sinxron
 * aniqlaydi va o'zi xabar beradi. Job yozuvi faqat ijara belgisi mos kelsa yoziladi.
 *  • navbatda oddiy sinxron — darhol qaytadi (bajarilgan oynalar belgilangan);
 *  • tinch soat / soatlik chegara — o'sha vaqtgacha tanaffus (urinish emas);
 *  • vaqtinchalik xato (Uzum, aloqa, chala javob) — 2, 5, 15 … 360 daqiqa
 *    tanaffus, urinish sanalmaydi; 12 tadan keyin "yiqilgan";
 *  • boshqa xato — 5 va 30 daqiqadan keyin qayta, uchinchisida "yiqilgan".
 *    Yiqilgan yuklashni rejalashtiruvchi 6 soatdan keyin o'zi qayta boshlaydi.
 */
async function failBackfill(job: SyncJob, lease: string, meter: BackfillMeter | null, err: unknown): Promise<void> {
  if (err instanceof LeaseLost) {
    log(`job ${job.id} (tarix): job boshqa jarayonga o‘tgan — bu bo‘lak to‘xtadi`);
    return;
  }
  const fence = fenceOf(job, lease);
  const payload = payloadOf(lease, meter, job);
  const accountId = job.uzumAccountId;
  const patchState = async (patch: (s: CoverageState) => void): Promise<void> => {
    if (!accountId) return;
    await updateCoverage(job.companyId, accountId, (s) => {
      if (!s) return null;
      patch(s);
      return s;
    });
  };

  if (err instanceof SyncYieldError) {
    await prisma.syncJob.updateMany({
      where: fence,
      data: { status: 'queued', scheduledAt: new Date(Date.now() + BACKFILL_PAUSE_MS), message: err.message, payload },
    });
    log(`job ${job.id} (tarix): navbatdagi sinxronga yo‘l berildi`);
    return;
  }

  const pause = err instanceof BackfillPause ? err : meter?.exhausted ? new BackfillPause('budget', meter.freeAt(1)) : null;
  if (pause) {
    const what = pause.reason === 'night' ? 'Tungi soatlar' : 'Uzum so‘rovlari soatlik chegarasi';
    await prisma.syncJob.updateMany({
      where: fence,
      data: { status: 'queued', scheduledAt: pause.until, message: `${what} — ${tashkentTime(pause.until)} da davom etadi`, payload },
    });
    await patchState((s) => {
      s.pausedUntil = pause.until.toISOString();
      s.pauseReason = pause.reason;
    });
    log(`job ${job.id} (tarix): ${what.toLowerCase()} — ${pause.until.toISOString()} gacha tanaffus`);
    return;
  }

  if (err instanceof SyncCanceledError) {
    await prisma.syncJob.updateMany({
      where: { id: job.id, status: { in: ['queued', 'running'] } },
      data: { status: 'canceled', message: err.message, etaSeconds: 0, finishedAt: new Date(), payload },
    });
    await patchState((s) => {
      s.status = 'idle';
      s.pausedUntil = null;
      s.pauseReason = null;
    });
    log(`job ${job.id} (tarix) to‘xtatildi: ${err.message}`);
    return;
  }

  const message = errorMessage(err);
  const diagnostic = diagnosticOf(err);
  const transient =
    err instanceof TransientSyncError ||
    err instanceof CoverageConflict ||
    (err instanceof UzumApiError && isTemporaryUzumError(err));
  const state = accountId ? await readCoverage(job.companyId, accountId) : null;
  const streak = (state?.transient ?? 0) + 1;

  let retryMinutes: number | null = null;
  let attempts = job.attempts;
  if (transient && streak <= BACKFILL_MAX_TRANSIENT) {
    retryMinutes = BACKFILL_RETRY_MINUTES[Math.min(streak - 1, BACKFILL_RETRY_MINUTES.length - 1)];
  } else if (!transient) {
    attempts += 1;
    if (attempts < MAX_ATTEMPTS) retryMinutes = BACKFILL_HARD_RETRY_MINUTES[Math.min(attempts - 1, BACKFILL_HARD_RETRY_MINUTES.length - 1)];
  }

  if (retryMinutes !== null) {
    const until = new Date(Date.now() + retryMinutes * 60_000);
    await prisma.syncJob.updateMany({
      where: fence,
      data: {
        status: 'queued',
        attempts,
        error: message,
        message: `Xatolik: ${message}. ${tashkentTime(until)} da qayta uriniladi`,
        scheduledAt: until,
        payload,
      },
    });
    await patchState((s) => {
      if (transient) s.transient = streak;
      s.error = message;
      s.pausedUntil = until.toISOString();
      s.pauseReason = 'retry';
    });
    log(
      `job ${job.id} (tarix) ${transient ? `vaqtinchalik xato (${streak}/${BACKFILL_MAX_TRANSIENT})` : `xato (${attempts}/${MAX_ATTEMPTS})`}: ` +
        `${message} — ${retryMinutes} daqiqadan keyin${diagnostic ? ` ${diagnostic}` : ''}`,
    );
    return;
  }

  await prisma.syncJob.updateMany({
    where: fence,
    data: { status: 'failed', attempts, error: message, message: 'Tarixni yuklab bo‘lmadi', etaSeconds: 0, finishedAt: new Date(), payload },
  });
  await patchState((s) => {
    s.status = 'failed';
    s.error = message;
    s.failedAt = new Date().toISOString();
    s.transient = 0;
    s.pausedUntil = null;
    s.pauseReason = null;
  });
  log(`job ${job.id} (tarix) muvaffaqiyatsiz: ${message}${diagnostic ? ` ${diagnostic}` : ''}`);
}

/**
 * Tarix jobining bitta bo'lagi: ko'pi bilan bitta 30 kunlik bo'lak (har
 * do'kon o'z oralig'ida, oynama-oyna) yoki yakuniy bosqich. Keyin job qisqa
 * tanaffus bilan navbatga qaytadi. Hech qachon exception tashlamaydi.
 */
async function runBackfillSlice(job: SyncJob): Promise<void> {
  const lease = parseJobPayload(job.payload).lease ?? '';
  let meter: BackfillMeter | null = null;
  let ctx: SliceCtx | null = null;
  let detail = 'Tarix yuklash boshlanmoqda';
  let leaseLost = false;
  // Butun bo'lak davomida "tirik" belgisi — har qadamda (Uzum, baza, tovar balansi) alohida emas
  const heartbeat = setInterval(() => {
    void prisma.syncJob
      .updateMany({ where: fenceOf(job, lease), data: { payload: payloadOf(lease, meter, job), message: ctx?.detail ?? detail } })
      .then((res) => {
        if (res.count === 0) {
          leaseLost = true;
          if (ctx) ctx.leaseLost = true;
        }
      })
      .catch(() => undefined);
  }, HEARTBEAT_MS);

  try {
    if (!lease) throw new LeaseLost();
    meter = await BackfillMeter.load(job);
    const company = await prisma.company.findUnique({ where: { id: job.companyId }, include: { subscription: true } });
    const account =
      company && job.uzumAccountId
        ? await prisma.uzumAccount.findFirst({ where: { id: job.uzumAccountId, companyId: company.id } })
        : null;
    if (!company || !account) throw new SyncCanceledError('Uzum kabineti topilmadi — tarix yuklash to‘xtatildi');

    const night = quietUntil();
    if (night) throw new BackfillPause('night', night);

    // Uzilgan urinish qoldig'i — har narsadan oldin (puli va tovar balansi jim yopiladi)
    await recoverPending(company.id, account.id, `job ${job.id}`);

    const base = (await readCoverage(company.id, account.id)) ?? (await deriveCoverage(company.id, account.id));
    if (!base) {
      await completeBackfill(job, lease, meter, null, 'Hali to‘liq sinxron bo‘lmagan — tarix u bilan birga yuklanadi');
      return;
    }

    const planId = activePlanId(company.subscription);
    if (planId === 'expired') {
      // Obuna tiklansa (`activatePlan` yoki rejalashtiruvchi) yuklash shu joyidan davom etadi
      await completeBackfill(job, lease, meter, (s) => {
        s.status = 'idle';
        s.pausedUntil = null;
        s.pauseReason = null;
      }, 'Obuna muddati tugagan — tarix yuklash to‘xtatildi', 'canceled');
      return;
    }

    const floor = historyFloorFor(planId);
    const stores = await accountStores(company.id, account.id);
    if (stores.length === 0) {
      // Do'koni yo'q kabinetda yuklanadigan narsa yo'q; keyin ulangan do'kon o'z qamrovi bilan keladi (`storeTop`)
      await updateCoverage(company.id, account.id, (s) => ({ ...(s ?? base), from: floor.toISOString(), status: 'done' }));
      await completeBackfill(job, lease, meter, null, 'Kabinetda do‘kon yo‘q');
      return;
    }

    // Kech ulangan do'kon qamrovni yangi tomonga surishi mumkin — progress oralig'i ham kengayadi
    const state = await updateCoverage(company.id, account.id, (current) => {
      const s = materializeCoverage(current ?? base, stores);
      const cursor = Date.parse(s.from);
      s.status = 'running';
      s.jobId = job.id;
      s.target = floor.toISOString();
      s.until = new Date(s.until ? Math.max(Date.parse(s.until), cursor) : cursor).toISOString();
      s.derived = false;
      s.pausedUntil = null;
      s.pauseReason = null;
      return s;
    });
    if (!state) throw new CoverageConflict();

    const run = backfillRun(job, company.id, account.id, planId, company.taxRate, { from: floor, to: new Date() });
    const activeMeter = meter;
    // Jonli klient: sekin RPS va har HTTP so'rov hisobi; demo: har chaqiruv hisobi
    await stepAuth(
      run,
      () => undefined,
      { rpsLimit: env.sync.backfillRps, onRequest: activeMeter.tick },
      resolveUzumMode() === 'demo' ? (c) => meterDemoCalls(c, activeMeter) : undefined,
    );
    run.stores = stores.map(({ id, uzumShopId, title }) => ({ id, uzumShopId, title }));
    ctx = {
      job,
      lease,
      leaseLost,
      run,
      client: requireClient(run),
      meter: activeMeter,
      stores,
      state,
      deliveries: await readDeliveries(company.id, account.id),
      pickup: new Map(),
      applied: new Map(),
      detail,
      windowStartedAt: Date.now(),
    };
    const slice = ctx;

    const cursor = Date.parse(state.from);
    if (cursor > floor.getTime()) {
      const chunk: TimeWindow = {
        from: new Date(Math.max(floor.getTime(), cursor - BACKFILL_CHUNK_DAYS * DAY_MS)),
        to: new Date(cursor - 1),
      };
      for (const store of stores) {
        // Har do'kon faqat o'zida yo'q qismini o'qiydi: qamrovi bo'lak ichida tugasa — o'sha joygacha
        const top = Date.parse(slice.state.stores[store.id] ?? slice.state.from);
        if (top <= chunk.from.getTime()) continue;
        const range: TimeWindow = { from: chunk.from, to: new Date(Math.min(chunk.to.getTime(), top - 1)) };
        const density = await backfillDensity(store.id);
        let rate: number | null = density;
        await walkWindows(range, density, async (w) => {
          const rows = await backfillWindow(slice, store, w, rate);
          rate = rows / spanDays(w);
          return rows;
        }, backfillTargetRows());
        // Do'kon qismi tugadi — tovar balansi darhol jim yangilanadi
        const cleaned = await cleanDirty(company.id, account.id, store.id, `job ${job.id}`);
        if (cleaned) slice.state = cleaned;
      }

      const p = backfillProgress(slice.state);
      // Keyingi bo'lak qisqa tanaffusdan keyin — navbatdagi boshqa joblar oldinga o'tsin
      await prisma.syncJob.updateMany({
        where: fenceOf(job, lease),
        data: {
          status: 'queued',
          attempts: 0,
          error: null,
          scheduledAt: new Date(Date.now() + BACKFILL_PAUSE_MS),
          progress: p.progress,
          etaSeconds: p.etaSeconds,
          message: `Tarix ${dayOf(new Date(slice.state.from))} gacha yuklandi`,
          payload: payloadOf(lease, activeMeter),
        },
      });
      log(
        `job ${job.id} (tarix): ${dayOf(chunk.from)}…${dayOf(chunk.to)} yuklandi — buyurtmalar: ${run.totals.orders}, ` +
          `xarajatlar: ${run.totals.expenses}, saqlash: ${run.totals.storage}, so‘rovlar: ${activeMeter.spent}`,
      );
      return;
    }

    await finalizeBackfill(slice);
    await prisma.companySetting.deleteMany({ where: { companyId: company.id, key: deliveryKey(account.id) } });
    await completeBackfill(job, lease, activeMeter, (s) => {
      s.status = 'done';
      s.marks = {};
      s.dirty = [];
      s.edges = [];
      s.error = null;
      s.transient = 0;
      s.pausedUntil = null;
      s.pauseReason = null;
      s.failedAt = null;
      s.suspect = false;
    }, `Tarix yuklandi: ${dayOf(new Date(slice.state.from))} dan`);
  } catch (err) {
    try {
      await failBackfill(job, lease, meter, leaseLost || ctx?.leaseLost ? new LeaseLost() : err);
    } catch (inner) {
      log(`job ${job.id} (tarix) holatini yozib bo‘lmadi: ${errorMessage(inner)}`);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

// ─── Navbatga qo'yish va holat ───

export interface BackfillRequest {
  /** Faqat shu kabinet; berilmasa — kompaniyaning barcha kabinetlari */
  accountId?: string | null;
  /**
   * plan — tarif o'zgardi · full — to'liq sinxron tugadi · manual — sotuvchi
   * tugmani bosdi · auto — rejalashtiruvchi tekshiruvi: faqat haqiqiy qamrov
   * yozuvi bo'lgan kabinetlar, yiqilgan yuklash esa 6 soatlik tanaffusdan keyin.
   */
  reason: 'plan' | 'full' | 'manual' | 'auto';
  /** Chaqiruvchi tarifni allaqachon bilsa — qayta o'qilmaydi */
  planId?: PlanId;
  /**
   * Butun tarif oralig'ini QAYTA o'qish (faqat 'manual'): eski kabinetning
   * birinchi sinxroni Uzum chegarasida kesilgan bo'lsa yoki kunlik xarajatlar
   * eski xato bilan kamayib qolgan bo'lsa — oxirgi 14 kundan eskisi qaytadan yuklanadi.
   */
  rescan?: boolean;
}

/**
 * Tarif ruxsat bergan, lekin hali yuklanmagan tarixni yuklashni navbatga qo'yadi.
 * Kabinet bo'yicha: allaqachon navbatda yoki ketayotgan bo'lsa yangisi yaratilmaydi;
 * tarix to'liq bo'lsa yoki hali birinchi to'liq sinxron bo'lmagan bo'lsa — hech narsa.
 * Qaytaradi: navbatdagi (yangi yoki mavjud) tarix joblari soni.
 */
export async function scheduleHistoryBackfill(companyId: string, req: BackfillRequest): Promise<number> {
  const accounts = await prisma.uzumAccount.findMany({
    where: { companyId, ...(req.accountId ? { id: req.accountId } : {}), status: { notIn: ['invalid', 'disabled'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (accounts.length === 0) return 0;

  // Rejalashtiruvchi buni har kabinet uchun chaqiradi — qamrovi yo'q kabinetda boshqa so'rov qilinmaydi
  const states = new Map<string, CoverageState | null>();
  for (const a of accounts) states.set(a.id, await readCoverage(companyId, a.id));
  if (req.reason === 'auto' && [...states.values()].every((s) => !s || s.derived)) return 0;

  const planId = req.planId ?? activePlanId(await prisma.subscription.findUnique({ where: { companyId } }));
  if (planId === 'expired') return 0;
  const now = new Date();
  const floor = historyFloorFor(planId, now);

  let queued = 0;
  for (const a of accounts) {
    const known = states.get(a.id) ?? null;
    if (req.reason === 'auto' && (!known || known.derived)) continue;
    if (
      req.reason === 'auto' &&
      known?.status === 'failed' &&
      now.getTime() - Date.parse(known.failedAt ?? known.updatedAt) < BACKFILL_FAILED_COOLDOWN_MS
    ) {
      continue;
    }

    const active = await prisma.syncJob.findFirst({
      where: { companyId, uzumAccountId: a.id, type: 'backfill', status: { in: ['queued', 'running'] } },
      select: { id: true },
    });
    if (active) {
      queued += 1;
      continue;
    }

    // Hali to'liq sinxron bo'lmagan — o'sha sinxronning o'zi tarifdagi tarixni oladi
    const base = known ?? (await deriveCoverage(companyId, a.id));
    if (!base) continue;
    const stores = await accountStores(companyId, a.id);
    if (req.rescan) {
      // Qayta tekshirishdan oldin uzilgan urinish qoldig'i yopiladi — aks holda qamrov surilgach pul hisobi adashardi
      await recoverPending(companyId, a.id, `tarix (${a.id})`);
    }
    let state = materializeCoverage((await readCoverage(companyId, a.id)) ?? base, stores);
    if (req.rescan && req.reason === 'manual') {
      const horizon = utcDayStart(addDays(now, -INCREMENTAL_DAYS)).getTime();
      for (const s of stores) state.stores[s.id] = new Date(Math.max(Date.parse(state.stores[s.id] ?? state.from), horizon)).toISOString();
      state.from = new Date(coverageStart(state, stores)).toISOString();
      state.until = null;
      state.edges = [];
      state.windows = 0;
      state.spentMs = 0;
    }
    const from = new Date(state.from);
    if (from.getTime() - floor.getTime() < BACKFILL_MIN_GAP_DAYS * DAY_MS) continue;

    // Yarim yo'lda qolgan yuklash davom ettiriladi: yuqori chegara saqlanadi
    const resume = !req.rescan && state.until && ['queued', 'running', 'failed'].includes(state.status);
    state = {
      ...state,
      derived: false,
      status: 'queued',
      target: floor.toISOString(),
      until: resume && state.until && Date.parse(state.until) > from.getTime() ? state.until : from.toISOString(),
      jobId: null,
      error: null,
      transient: 0,
      failedAt: null,
      pausedUntil: null,
      pauseReason: null,
      ...(resume ? {} : { windows: 0, spentMs: 0 }),
    };
    // Holat jobdan OLDIN yoziladi: boshqa ishchi yangi jobni darhol olsa ham, eski holatni ko'rmasin
    const write = state;
    await updateCoverage(companyId, a.id, () => write);

    const job = await prisma.syncJob.create({
      data: {
        companyId,
        uzumAccountId: a.id,
        type: 'backfill',
        status: 'queued',
        progress: 0,
        step: 'queued',
        stepIndex: 0,
        totalSteps: SYNC_STEPS.length,
        message: 'Tarix navbatda — oddiy sinxronlardan keyin boshlanadi',
        etaSeconds: 0,
        scheduledAt: now,
      },
    });
    await updateCoverage(companyId, a.id, (s) => (s && !s.jobId ? { ...s, jobId: job.id } : null));
    log(`job ${job.id} (tarix): ${dayOf(floor)}…${dayOf(from)} navbatga qo‘yildi (${req.reason}${req.rescan ? ', qayta tekshirish' : ''})`);
    queued += 1;
  }
  return queued;
}

/** Eski kabinet taxmini: holat har necha soniyada so'raladi, taxmin esa sekin o'zgaradi */
const derivedCache = new Map<string, { at: number; state: CoverageState | null }>();
const DERIVED_TTL_MS = 10 * 60_000;

async function derivedCoverage(companyId: string, accountId: string): Promise<CoverageState | null> {
  const hit = derivedCache.get(accountId);
  if (hit && Date.now() - hit.at < DERIVED_TTL_MS) return hit.state;
  const state = await deriveCoverage(companyId, accountId);
  derivedCache.set(accountId, { at: Date.now(), state });
  if (derivedCache.size > 500) {
    const oldest = derivedCache.keys().next().value;
    if (oldest !== undefined) derivedCache.delete(oldest);
  }
  return state;
}

/**
 * `SyncStatus.history`: kompaniya kabinetlari bo'yicha tarix qamrovi. Bir nechta
 * kabinet bo'lsa — eng kam qamrovlisi hal qiladi (sana ham, yetishmagan kunlar ham).
 * Faqat o'qiydi: qamrovi yozilmagan eski kabinet taxmini bazaga yozilmaydi.
 */
async function loadHistoryCoverage(
  companyId: string,
  accounts: { id: string; status: string }[],
): Promise<HistoryCoverage | null> {
  const usable = accounts.filter((a) => a.status !== 'disabled');
  if (usable.length === 0) return null;

  const [subscription, settings, jobs, stores] = await Promise.all([
    prisma.subscription.findUnique({ where: { companyId } }),
    prisma.companySetting.findMany({
      where: { companyId, key: { in: usable.map((a) => coverageKey(a.id)) } },
      select: { key: true, value: true },
    }),
    prisma.syncJob.findMany({
      where: { companyId, type: 'backfill', status: { in: ['queued', 'running'] } },
      select: { status: true, progress: true, etaSeconds: true, startedAt: true },
    }),
    prisma.store.findMany({
      where: { companyId, uzumAccountId: { in: usable.map((a) => a.id) }, uzumShopId: { not: null } },
      select: { id: true, uzumAccountId: true, createdAt: true },
    }),
  ]);
  const planId = activePlanId(subscription);
  const floor = historyFloorFor(planId);
  const states = new Map(settings.map((s) => [s.key, parseCoverage(s.value)]));
  const now = Date.now();

  let from: number | null = null;
  let missing = 0;
  /** Yuklab bo'ladigan yetishmovchilik: kaliti rad etilgan kabinet uchun tugma ma'nosiz */
  let fixable = 0;
  let failed: string | null = null;
  let done = false;
  let suspect = false;
  let rescannable = false;
  let pausedUntil: string | null = null;
  let pauseReason: PauseReason | null = null;
  for (const a of usable) {
    const state = states.get(coverageKey(a.id)) ?? (await derivedCoverage(companyId, a.id));
    if (!state) continue;
    const start = coverageStart(
      state,
      stores.filter((s) => s.uzumAccountId === a.id),
    );
    from = from === null ? start : Math.max(from, start);
    const gap = Math.max(0, Math.round((start - floor.getTime()) / DAY_MS));
    if (gap >= BACKFILL_MIN_GAP_DAYS) missing = Math.max(missing, gap);
    if (gap >= BACKFILL_MIN_GAP_DAYS && a.status !== 'invalid') fixable = Math.max(fixable, gap);
    if (a.status !== 'invalid') rescannable = true;
    if (state.status === 'failed') failed = state.error ?? 'Tarixni yuklab bo‘lmadi';
    if (state.status === 'done') done = true;
    if (state.suspect) suspect = true;
    if (state.pausedUntil && Date.parse(state.pausedUntil) > now && state.pauseReason) {
      pausedUntil = state.pausedUntil;
      pauseReason = state.pauseReason;
    }
  }

  // Bo'laklar orasida job 'queued' bo'ladi — boshlangan bo'lsa, foydalanuvchi uchun u "yuklanmoqda"
  const started = jobs.some((j) => j.status === 'running' || j.startedAt !== null);
  const status: HistoryCoverage['status'] = started
    ? 'running'
    : jobs.length > 0
      ? 'queued'
      : failed && missing > 0
        ? 'failed'
        : done && missing === 0
          ? 'done'
          : 'idle';
  if (jobs.length === 0) {
    pausedUntil = null;
    pauseReason = null;
  } else if (!pauseReason) {
    const night = quietUntil();
    if (night) {
      pausedUntil = night.toISOString();
      pauseReason = 'night';
    }
  }

  return {
    from: from === null ? null : toISODate(new Date(from)),
    floor: toISODate(floor),
    planDays: Math.min(getPlan(planId).limits.historyDays, MAX_HISTORY_DAYS),
    missingDays: missing,
    status,
    progress: jobs.length > 0 ? Math.round(jobs.reduce((s, j) => s + j.progress, 0) / jobs.length) : status === 'done' ? 100 : 0,
    etaSeconds: jobs.reduce((m, j) => Math.max(m, Math.round(j.etaSeconds)), 0),
    error: status === 'failed' ? failed : null,
    canBackfill: fixable > 0 && planId !== 'expired' && jobs.length === 0,
    pausedUntil,
    pauseReason,
    suspectGap: suspect,
    canRescan: rescannable && from !== null && planId !== 'expired' && jobs.length === 0,
  };
}

