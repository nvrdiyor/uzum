/**
 * TOVARNI REJADAN BOSHQARISH — sotuvchi o'zi aytadi: bu tovarni qayta
 * olaymi, yo'qmi.
 *
 * Ilgari rejalashtiruvchi oxirgi 30 kunda sotilgan HAR bir SKU'ga buyurtma
 * tavsiya qilardi. Mavsumiy tovar (magnitli qo'l isitgich) yoki endi
 * olinmaydigan tovar ham "kritik, bugun buyurtma bering" bo'lib turardi —
 * sotuvchi qaror qilib bo'lgan, lekin buni aytadigan joy yo'q edi
 * (egasi, 2026-11-15). Uzumda arxivlash yechim emas: u sotuvni to'xtatadi.
 *
 * Rejimlar (SKU'da saqlanadi, sinxron ularga tegmaydi):
 *  • auto     — odatdagidek: sotuvga qarab buyurtma tavsiya qilinadi;
 *  • pause    — "Hozircha buyurtma berilmaydi": qoldiq sotilaveradi, sotib
 *               olish tavsiya qilinmaydi; sana berilsa — o'sha kuni o'zi qaytadi;
 *  • stop     — "Endi sotib olinmaydi": qoldiq sotib tugatiladi, tugash
 *               ogohlantirishlari ham chiqmaydi;
 *  • seasonal — mavsumiy: faqat ko'rsatilgan oylarda sotiladi. Mavsum
 *               tugashiga ulgurmaydigan partiya tavsiya qilinmaydi, mavsumdan
 *               tashqarida esa keyingi mavsumga o'z vaqtida eslatadi.
 *
 * Bu fayl sof hisob: API (services/plan.ts) ham, Telegram bot ham shundan oladi.
 */
import { addDays, parseISODate, toISODate } from './format.js';

export const SKU_PLAN_MODES = ['auto', 'pause', 'stop', 'seasonal'] as const;
export type SkuPlanMode = (typeof SKU_PLAN_MODES)[number];

export const isSkuPlanMode = (v: unknown): v is SkuPlanMode =>
  typeof v === 'string' && (SKU_PLAN_MODES as readonly string[]).includes(v);

/** Bazadagi qiymat → rejim (noma'lum yoki bo'sh — auto) */
export const toSkuPlanMode = (v: unknown): SkuPlanMode => (isSkuPlanMode(v) ? v : 'auto');

// ─────────────────────────── Mavsum oylari ───────────────────────────

/**
 * "11,12,1,2" → [1, 2, 11, 12]. Takror, noto'g'ri va 1..12 dan tashqari
 * qiymatlar tashlanadi. Hammasi (12 oy) — mavsum emas, bo'sh ro'yxat qaytadi.
 */
export function parseSeasonMonths(raw: string | readonly number[] | null | undefined): number[] {
  if (raw === null || raw === undefined) return [];
  const parts = typeof raw === 'string' ? raw.split(/[^\d]+/) : raw.map(String);
  const set = new Set<number>();
  for (const p of parts) {
    if (!p) continue;
    const n = Number(p);
    if (Number.isInteger(n) && n >= 1 && n <= 12) set.add(n);
  }
  if (set.size === 12) return [];
  return [...set].sort((a, b) => a - b);
}

/** [1, 2, 11, 12] → "1,2,11,12" (bazaga); bo'sh — null */
export function formatSeasonMonths(months: readonly number[]): string | null {
  const list = parseSeasonMonths(months);
  return list.length ? list.join(',') : null;
}

/** Mavsum oynasi: hozirgi (mavsum ichida bo'lsa) yoki keyingi */
export interface SeasonWindow {
  /** Bugun mavsum ichidami */
  inSeason: boolean;
  /** Mavsumning birinchi kuni (hozirgisi yoki keyingisi), "YYYY-MM-DD" */
  start: string;
  /** Mavsumning oxirgi kuni (shu kun ham mavsumga kiradi) */
  end: string;
  /** Bugundan mavsum boshigacha kun (mavsum ichida — 0) */
  daysToStart: number;
  /** Bugundan mavsum oxirigacha QOLGAN sotuv kunlari, bugun ham kiradi */
  daysToEnd: number;
  /** Mavsum uzunligi, kun */
  length: number;
}

const monthStart = (y: number, m: number): Date => new Date(Date.UTC(y, m - 1, 1));
const monthEnd = (y: number, m: number): Date => new Date(Date.UTC(y, m, 0));
const next = (y: number, m: number): [number, number] => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const prev = (y: number, m: number): [number, number] => (m === 1 ? [y - 1, 12] : [y, m - 1]);
const dayDiff = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/**
 * Mavsum ketma-ket oylardan iborat (dekabr → yanvar ham ketma-ket). Bir
 * nechta alohida bo'lak bo'lsa (masalan 3–4 va 10–11), bugunga eng yaqini olinadi.
 * Oylar bo'sh yoki 12 ta bo'lsa — null (mavsumiy emas).
 */
export function seasonWindow(months: readonly number[], today: Date): SeasonWindow | null {
  const set = new Set(parseSeasonMonths(months));
  if (set.size === 0) return null;
  const t = parseISODate(toISODate(today));
  let y = t.getUTCFullYear();
  let m = t.getUTCMonth() + 1;
  const inSeason = set.has(m);
  if (!inSeason) {
    // Keyingi mavsum oyi
    for (let i = 0; i < 12 && !set.has(m); i += 1) [y, m] = next(y, m);
  }
  // Bo'lak boshi: orqaga, oldingi oy ham mavsumda ekan
  let [sy, sm] = [y, m];
  for (let i = 0; i < 11; i += 1) {
    const [py, pm] = prev(sy, sm);
    if (!set.has(pm)) break;
    [sy, sm] = [py, pm];
  }
  // Bo'lak oxiri: oldinga
  let [ey, em] = [y, m];
  for (let i = 0; i < 11; i += 1) {
    const [ny, nm] = next(ey, em);
    if (!set.has(nm)) break;
    [ey, em] = [ny, nm];
  }
  const start = monthStart(sy, sm);
  const end = monthEnd(ey, em);
  return {
    inSeason,
    start: toISODate(start),
    end: toISODate(end),
    daysToStart: inSeason ? 0 : Math.max(0, dayDiff(t, start)),
    daysToEnd: Math.max(0, dayDiff(t, end) + 1),
    length: dayDiff(start, end) + 1,
  };
}

/** Oldingi (tugagan) mavsum: keyingi/hozirgi mavsumdan bir yil oldingisi */
export function previousSeason(months: readonly number[], today: Date): { start: string; end: string } | null {
  const w = seasonWindow(months, today);
  if (!w) return null;
  const start = parseISODate(w.start);
  const end = parseISODate(w.end);
  const shift = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate()));
  // Fevral oxiri kabi kunlar uchun: oy oxiri qayta hisoblanadi
  const prevEnd = monthEnd(end.getUTCFullYear() - 1, end.getUTCMonth() + 1);
  return { start: toISODate(shift(start)), end: toISODate(prevEnd) };
}

// ─────────────────────────── Rejadan to'xtatish ───────────────────────────

/**
 * Nega buyurtma tavsiya qilinmaydi:
 *  • pause       — sotuvchi to'xtatgan (sana bo'lsa — o'sha kungacha);
 *  • stop        — endi sotib olinmaydi;
 *  • off_season  — mavsum emas; keyingi mavsumga buyurtma kuni hali uzoq;
 *  • season_end  — mavsum tugashiga yangi partiya ulgurmaydi.
 */
export type PlanHoldReason = 'pause' | 'stop' | 'off_season' | 'season_end';

export interface SkuPlanSettings {
  mode: SkuPlanMode;
  /** pause: shu kundan boshlab yana avtomatik ("YYYY-MM-DD"); null — muddatsiz */
  pauseUntil: string | null;
  /** seasonal: sotiladigan oylar (1..12) */
  seasonMonths: number[];
}

export const AUTO_PLAN: SkuPlanSettings = { mode: 'auto', pauseUntil: null, seasonMonths: [] };

/** Bazadagi maydonlardan (Sku.planMode, planPauseUntil, seasonMonths) */
export function skuPlanSettings(raw: {
  planMode?: string | null;
  planPauseUntil?: Date | string | null;
  seasonMonths?: string | null;
}): SkuPlanSettings {
  const mode = toSkuPlanMode(raw.planMode);
  const until = raw.planPauseUntil
    ? typeof raw.planPauseUntil === 'string'
      ? raw.planPauseUntil.slice(0, 10)
      : toISODate(raw.planPauseUntil)
    : null;
  const months = parseSeasonMonths(raw.seasonMonths ?? null);
  // Oylari yo'q "mavsumiy" — oddiy tovar
  if (mode === 'seasonal' && months.length === 0) return AUTO_PLAN;
  return { mode, pauseUntil: mode === 'pause' ? until : null, seasonMonths: mode === 'seasonal' ? months : [] };
}

/** Pauza muddati o'tganmi — o'tgan bo'lsa tovar odatdagidek rejalashtiriladi */
export function effectiveMode(s: SkuPlanSettings, today: Date): SkuPlanMode {
  if (s.mode === 'pause' && s.pauseUntil && parseISODate(s.pauseUntil).getTime() <= parseISODate(toISODate(today)).getTime()) {
    return 'auto';
  }
  return s.mode;
}

/**
 * Bot va boshqa soddalashtirilgan hisoblar uchun: bu SKU bo'yicha "tugayapti,
 * buyurtma bering" deyish mumkinmi. Mavsumiy tovarda — faqat mavsum ichida va
 * yangi partiya mavsum tugashidan oldin kelsa.
 */
export function canSuggestReorder(s: SkuPlanSettings, today: Date, leadDays: number): boolean {
  const mode = effectiveMode(s, today);
  if (mode === 'pause' || mode === 'stop') return false;
  if (mode !== 'seasonal') return true;
  const w = seasonWindow(s.seasonMonths, today);
  if (!w) return true;
  return w.inSeason && leadDays < w.daysToEnd;
}

/** Sana yordamchisi: bugundan N kun keyin, "YYYY-MM-DD" */
export const isoInDays = (today: Date, days: number): string => toISODate(addDays(parseISODate(toISODate(today)), days));
