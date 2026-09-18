import type { Lang, Period } from './types.js';

const LOCALES: Record<Lang, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };

/**
 * Raqamlar uchun alohida lokal: o'zbek tilida ham razryadlar bo'sh joy bilan,
 * kasr esa vergul bilan ajratiladi (1 250 000,5). Brauzerda uz-UZ ba'zan en-US ga
 * tushib qolgani uchun ru-RU qoidasi ishlatiladi.
 */
const NUMBER_LOCALES: Record<Lang, string> = { uz: 'ru-RU', ru: 'ru-RU', en: 'en-US' };

/** Uzilmas bo'shliqlarni oddiy bo'shliqqa keltirish (barcha brauzerda bir xil ko'rinsin) */
const normalizeSpaces = (s: string): string => s.replace(/[   ]/g, ' ');

export function formatNumber(value: number, lang: Lang = 'uz', digits = 0): string {
  if (!Number.isFinite(value)) return '0';
  return normalizeSpaces(
    new Intl.NumberFormat(NUMBER_LOCALES[lang] ?? 'ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value),
  );
}

/** Koeffitsiyentlar uchun: 0,257 */
export function formatDecimal(value: number, lang: Lang = 'uz', maxDigits = 3): string {
  if (!Number.isFinite(value)) return '0';
  return normalizeSpaces(
    new Intl.NumberFormat(NUMBER_LOCALES[lang] ?? 'ru-RU', {
      minimumFractionDigits: Math.min(2, maxDigits),
      maximumFractionDigits: maxDigits,
    }).format(value),
  );
}

export function formatMoney(value: number, lang: Lang = 'uz', currency = 'UZS'): string {
  const suffix = currency === 'UZS' ? (lang === 'ru' ? 'сум' : lang === 'en' ? 'UZS' : 'so’m') : currency;
  return `${formatNumber(Math.round(value), lang)} ${suffix}`;
}

/** 1 250 000 → "1,25 mln" */
export function formatCompact(value: number, lang: Lang = 'uz'): string {
  const abs = Math.abs(value);
  const units =
    lang === 'ru'
      ? [
          { v: 1e9, s: ' млрд' },
          { v: 1e6, s: ' млн' },
          { v: 1e3, s: ' тыс' },
        ]
      : lang === 'en'
        ? [
            { v: 1e9, s: 'B' },
            { v: 1e6, s: 'M' },
            { v: 1e3, s: 'K' },
          ]
        : [
            { v: 1e9, s: ' mlrd' },
            { v: 1e6, s: ' mln' },
            { v: 1e3, s: ' ming' },
          ];
  for (const u of units) {
    if (abs >= u.v) {
      const n = value / u.v;
      return `${formatNumber(n, lang, n >= 100 ? 0 : 1)}${u.s}`;
    }
  }
  return formatNumber(value, lang);
}

export function formatPercent(value: number, lang: Lang = 'uz', digits = 1): string {
  return `${formatNumber(value, lang, digits)}%`;
}

export function formatDate(value: string | Date, lang: Lang = 'uz'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang] ?? 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Oy qisqartmasi — kalendar belgisi kabi tor joylar uchun.
 * `Intl` ba'zi tillarda nuqtali yoki uzun variant beradi, shuning uchun
 * ro'yxat qo'lda: natija har doim uch harf va bashorat qilinadigan.
 */
const MONTHS_SHORT: Record<Lang, string[]> = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function formatMonthShort(value: string | Date, lang: Lang = 'uz'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return (MONTHS_SHORT[lang] ?? MONTHS_SHORT.uz)[d.getUTCMonth()] ?? '';
}

/** Yilsiz qisqa sana: "07.09" — jadvalda uch ustun sana bo'lganda kerak */
export function formatDateShort(value: string | Date, lang: Lang = 'uz'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang] ?? 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

export function formatDateTime(value: string | Date, lang: Lang = 'uz'): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALES[lang] ?? 'uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDuration(seconds: number, lang: Lang = 'uz'): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const w = {
    uz: { h: 'soat', m: 'daqiqa', s: 'soniya' },
    ru: { h: 'ч', m: 'мин', s: 'сек' },
    en: { h: 'h', m: 'min', s: 'sec' },
  }[lang];
  if (h > 0) return `${h} ${w.h} ${rest} ${w.m}`;
  if (m > 0) return `${m} ${w.m}`;
  return `${s} ${w.s}`;
}

// ─────────────────────────── Sanalar ───────────────────────────

export const toISODate = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseISODate = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function daysBetween(from: string | Date, to: string | Date): number {
  const a = typeof from === 'string' ? parseISODate(from) : from;
  const b = typeof to === 'string' ? parseISODate(to) : to;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function eachDay(period: Period): string[] {
  const out: string[] = [];
  let cur = parseISODate(period.from);
  const end = parseISODate(period.to);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 2000) {
    out.push(toISODate(cur));
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

export type PresetRange =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'last90'
  | 'thisYear';

export function presetPeriod(preset: PresetRange, now = new Date()): Period {
  const today = parseISODate(toISODate(now));
  switch (preset) {
    case 'today':
      return { from: toISODate(today), to: toISODate(today) };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: toISODate(y), to: toISODate(y) };
    }
    case 'last7':
      return { from: toISODate(addDays(today, -6)), to: toISODate(today) };
    case 'last14':
      return { from: toISODate(addDays(today, -13)), to: toISODate(today) };
    case 'last30':
      return { from: toISODate(addDays(today, -29)), to: toISODate(today) };
    case 'last90':
      return { from: toISODate(addDays(today, -89)), to: toISODate(today) };
    case 'thisMonth': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { from: toISODate(first), to: toISODate(today) };
    }
    case 'lastMonth': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: toISODate(first), to: toISODate(last) };
    }
    case 'thisYear': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { from: toISODate(first), to: toISODate(today) };
    }
    default:
      return { from: toISODate(addDays(today, -29)), to: toISODate(today) };
  }
}

/** Oldingi teng uzunlikdagi davr (taqqoslash uchun) */
export function previousPeriod(period: Period): Period {
  const len = daysBetween(period.from, period.to) + 1;
  const from = addDays(parseISODate(period.from), -len);
  const to = addDays(parseISODate(period.to), -len);
  return { from: toISODate(from), to: toISODate(to) };
}

/** { uz, ru, en } shaklidagi obyektdan joriy tilga mos matnni oladi */
export function pickLocalized(
  obj: Partial<Record<Lang, string>> | undefined | null,
  lang: Lang = 'uz',
): string {
  if (!obj) return '';
  return obj[lang] ?? obj.uz ?? obj.ru ?? obj.en ?? '';
}

export function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? '').trim()[0] ?? '';
  const b = (last ?? '').trim()[0] ?? '';
  return (a + b).toUpperCase() || 'U';
}
