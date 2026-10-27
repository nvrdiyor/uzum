import type { Lang, Period } from './types.js';

/*
 * Sanalar uchun lokal.
 *
 * Brauzerdagi uz-UZ sanani ISO tartibida beradi — "2026-09-17", qisqa
 * shaklda esa "09-17", ya'ni oy oldinda. O'zbek foydalanuvchi buni teskari
 * o'qiydi. ru-RU qoidasi kutilgan tartibni beradi: 17.09.2026 va 17.09.
 * Raqamlar uchun ham xuddi shu sabab bilan ru-RU ishlatiladi (pastda).
 */
const LOCALES: Record<Lang, string> = { uz: 'ru-RU', ru: 'ru-RU', en: 'en-US' };

/**
 * Raqamlar uchun alohida lokal: o'zbek tilida ham razryadlar bo'sh joy bilan,
 * kasr esa vergul bilan ajratiladi (1 250 000,5). Brauzerda uz-UZ ba'zan en-US ga
 * tushib qolgani uchun ru-RU qoidasi ishlatiladi.
 */
const NUMBER_LOCALES: Record<Lang, string> = { uz: 'ru-RU', ru: 'ru-RU', en: 'en-US' };

/** Uzilmas bo'shliqlarni oddiy bo'shliqqa keltirish (barcha brauzerda bir xil ko'rinsin) */
const normalizeSpaces = (s: string): string => s.replace(/[   ]/g, ' ');

/**
 * `null` — qiymat yo'q yoki ataylab yashirilgan (pulsiz ko'rinish shabloni,
 * views.ts): "0" emas, "—". Ilgari null `Number.isFinite` dan "0" bo'lib
 * o'tardi va yashirilgan foyda "0 so'm" bo'lib ko'rinardi (2026-10-24).
 */
const MISSING = '—';

export function formatNumber(value: number | null | undefined, lang: Lang = 'uz', digits = 0): string {
  if (value === null || value === undefined) return MISSING;
  if (!Number.isFinite(value)) return '0';
  return normalizeSpaces(
    new Intl.NumberFormat(NUMBER_LOCALES[lang] ?? 'ru-RU', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value),
  );
}

/** Koeffitsiyentlar uchun: 0,257 */
export function formatDecimal(value: number | null | undefined, lang: Lang = 'uz', maxDigits = 3): string {
  if (value === null || value === undefined) return MISSING;
  if (!Number.isFinite(value)) return '0';
  return normalizeSpaces(
    new Intl.NumberFormat(NUMBER_LOCALES[lang] ?? 'ru-RU', {
      minimumFractionDigits: Math.min(2, maxDigits),
      maximumFractionDigits: maxDigits,
    }).format(value),
  );
}

export function formatMoney(value: number | null | undefined, lang: Lang = 'uz', currency = 'UZS'): string {
  if (value === null || value === undefined) return MISSING;
  const suffix = currency === 'UZS' ? (lang === 'ru' ? 'сум' : lang === 'en' ? 'UZS' : 'so‘m') : currency;
  return `${formatNumber(Math.round(value), lang)} ${suffix}`;
}

/** 1 250 000 → "1,25 mln" */
export function formatCompact(value: number | null | undefined, lang: Lang = 'uz'): string {
  if (value === null || value === undefined) return MISSING;
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
      // Math.abs: manfiy qiymat ham musbatidek yozilsin — «-250,0 ming» emas, «-250 ming»
      return `${formatNumber(n, lang, Math.abs(n) >= 100 ? 0 : 1)}${u.s}`;
    }
  }
  return formatNumber(value, lang);
}

export function formatPercent(value: number | null | undefined, lang: Lang = 'uz', digits = 1): string {
  if (value === null || value === undefined) return MISSING;
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

/**
 * SAVDO KUNI — Asia/Tashkent (UTC+5, yozgi vaqtga o'tmaydi).
 *
 * Buyurtma vaqtlari bazada UTC'da turadi. Kunni UTC bo'yicha kesish Toshkentda
 * 00:00–05:00 orasida berilgan buyurtmani OLDINGI kunga yozib qo'yardi: jonli
 * do'konda bu har to'qqizinchi buyurtma edi va kunlik tushum Uzum kabinetidagi
 * bilan mos kelmasdi (masalan 07.10: 456 000 ko'rsatilgan, aslida 515 000).
 *
 * Shuning uchun:
 *  • `toBusinessDate`  — vaqt belgisidan savdo kunini oladi (kunlarga ajratish uchun);
 *  • `businessDayStart` — savdo kunining boshlanish paytini beradi (davr chegarasi uchun).
 *
 * Faqat sanadan iborat qiymatlar (xarajat sanasi — 00:00 UTC) ikkalasida ham
 * o'z kunida qoladi: 00:00 UTC Toshkentda o'sha kunning 05:00 i.
 */
export const BUSINESS_TZ_OFFSET_MS = 5 * 3_600_000;

/** Vaqt belgisi → savdo kuni: 2026-10-13T21:30Z → "2026-10-14" */
export const toBusinessDate = (d: Date): string => toISODate(new Date(d.getTime() + BUSINESS_TZ_OFFSET_MS));

/** Savdo kunining boshlanishi: "2026-10-14" → 2026-10-13T19:00:00Z */
export const businessDayStart = (iso: string): Date => new Date(parseISODate(iso).getTime() - BUSINESS_TZ_OFFSET_MS);

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
  | 'thisWeek'
  | 'lastWeek'
  | 'last7'
  | 'last14'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'last90'
  | 'thisYear';

export function presetPeriod(preset: PresetRange, now = new Date()): Period {
  // "Bugun" — savdo kuni bo'yicha: Toshkentda yarim tundan keyin yangi kun boshlanadi, soat 05:00 da emas
  const today = parseISODate(toBusinessDate(now));
  switch (preset) {
    case 'today':
      return { from: toISODate(today), to: toISODate(today) };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: toISODate(y), to: toISODate(y) };
    }
    case 'thisWeek':
    case 'lastWeek': {
      /*
       * Hafta dushanbadan boshlanadi (ISO 8601 — O'zbekistonda ham shunday),
       * kunlar savdo kuni bo'yicha: Toshkentda dushanba 00:00 dan. "Shu hafta" —
       * dushanbadan bugungacha (dushanbaning o'zida bitta kun), "O'tgan hafta" —
       * undan oldingi to'liq dushanba–yakshanba. getUTCDay: 0 — yakshanba.
       */
      const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
      if (preset === 'thisWeek') return { from: toISODate(monday), to: toISODate(today) };
      return { from: toISODate(addDays(monday, -7)), to: toISODate(addDays(monday, -1)) };
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

/** Oldingi teng uzunlikdagi davr — standart taqqoslash ('prev', pastda comparePeriodFor) */
export function previousPeriod(period: Period): Period {
  const len = daysBetween(period.from, period.to) + 1;
  const from = addDays(parseISODate(period.from), -len);
  const to = addDays(parseISODate(period.to), -len);
  return { from: toISODate(from), to: toISODate(to) };
}

/**
 * Taqqoslash rejimi — "+12%" lar va grafikdagi uzuq chiziq QAYSI davrga nisbatan:
 *  • 'prev'      — oldingi teng davr (previousPeriod), standart;
 *  • 'prevMonth' — o'tgan oyning o'sha sanalari;
 *  • 'prevYear'  — o'tgan yilning o'sha sanalari.
 *
 * Ilgari faqat oldingi teng davr bor edi: "Shu oy" (1–24 okt) o'tgan oyning
 * OXIRGI kunlari (7–30 sen) bilan solishtirilardi, "o'tgan oyning shu
 * kunlari" va mavsumiylikni ("o'tgan yilning shu kunlari") esa ko'rib
 * bo'lmasdi — sotuvchilar aynan shuni so'radi (2026-10-24).
 */
export type CompareMode = 'prev' | 'prevMonth' | 'prevYear';

export const COMPARE_MODES: readonly CompareMode[] = ['prev', 'prevMonth', 'prevYear'];

export const isCompareMode = (v: unknown): v is CompareMode =>
  typeof v === 'string' && (COMPARE_MODES as readonly string[]).includes(v);

/** Sanani `months` oyga suradi; o'sha oyda bunday kun bo'lmasa — oyning oxirgi kuni */
function shiftMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  // Date.UTC oyni o'zi o'tkazadi: yanvar − 1 → o'tgan yilning dekabri
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  // Keyingi oyning 0-kuni — shu oyning oxirgi kuni
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toISODate(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
}

/**
 * Taqqoslanadigan davr — sof funksiya; server uni `?compare=` bo'yicha
 * chaqiradi (apps/api lib/period.ts → `range.previous`).
 *
 * 'prevMonth' va 'prevYear' qoidasi:
 *  1. Har chekka alohida 1 (12) oy oldinga suriladi, kun raqami saqlanadi:
 *     1–24 okt → 1–24 sen; 13–19 okt 2026 → 13–19 okt 2025.
 *  2. O'sha oyda bunday kun bo'lmasa — oyning oxirgi kuni: 29–31 mart →
 *     28–28 fevral (kabisa yilida 29–29); 29 fevral − 1 yil → 28 fevral.
 *  3. Davr BUTUN oy(lar) bo'lsa (1-sanadan oy oxirigacha) — taqqoslash ham
 *     butun oy(lar): "O'tgan oy" 1–30 sen → 1–31 avg, fevral 2027 → fevral
 *     2026, kabisa fevrali to'liq. 2-qoidaning o'zi 31-avgustni tashlab
 *     yuborardi (1–30 sen → 1–30 avg).
 *
 * Shuning uchun taqqoslash davri joriydan qisqa yoki uzun bo'lishi MUMKIN
 * (mart ↔ fevral 3 kungacha, 29–31 mart → bitta kun). Bu ATAYLAB: "o'sha
 * sanalar" so'ralgan, teng uzunlik emas. KPI'lar har biri o'z oynasining
 * yig'indisi; grafik seriyalari indeks bo'yicha tekislanadi (ortiqcha kunlar
 * joriy qiymatsiz qator bo'ladi, yetmagani chiziqsiz qoladi). Bir oydan uzun
 * davr 'prevMonth' da o'zi bilan qisman ustma-ust tushadi — bu ham "bir oy
 * oldingi o'sha sanalar". Taqqoslashga yaroqliligini (saqlangan tarix ichidami)
 * bu funksiya hal qilmaydi — server comparablePeriod tekshiradi.
 */
export function comparePeriodFor(period: Period, mode: CompareMode = 'prev'): Period {
  if (mode !== 'prevMonth' && mode !== 'prevYear') return previousPeriod(period);
  const months = mode === 'prevYear' ? -12 : -1;
  const from = shiftMonths(period.from, months);
  const dayAfter = addDays(parseISODate(period.to), 1);
  const wholeMonths = parseISODate(period.from).getUTCDate() === 1 && dayAfter.getUTCDate() === 1;
  // Butun oylar: oxiri — surilgan keyingi oy boshidan bir kun oldin (1-sana hech qachon qisqarmaydi)
  const to = wholeMonths
    ? toISODate(addDays(parseISODate(shiftMonths(toISODate(dayAfter), months)), -1))
    : shiftMonths(period.to, months);
  return { from, to };
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

/**
 * Bugungi sana SAVDO MINTAQASI bo'yicha (Asia/Tashkent), ISO ko'rinishda.
 *
 * NEGA `toISODate(new Date())` emas. U UTC kunini beradi, bizning
 * mintaqa esa UTC+5. Ya'ni Toshkentda 00:00 dan 05:00 gacha server hali
 * "kechagi kun"da turadi. To'lov sanalari — kalendar sanalari: jadval
 * "08.10 dan amal qiladi" deganda u Toshkent bo'yicha 8-oktyabrda
 * boshlanishi kerak, 8-oktyabr soat 05:00 da emas.
 */
export function todayInBusinessTz(now: Date = new Date(), timeZone = 'Asia/Tashkent'): string {
  // en-CA aynan `YYYY-MM-DD` beradi
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
