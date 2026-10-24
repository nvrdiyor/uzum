import type { GoalTargets, GoalsResponse } from '@savdoiq/shared';
import type { Tone } from '@/components/ui';

export type PacedKey = 'revenue' | 'netProfit' | 'units';

export const PACED_KEYS: PacedKey[] = ['revenue', 'netProfit', 'units'];

/** Sur'at bo'yicha ohanglar: ≥100% — reja bo'yicha, 85–100% — biroz orqada, <85% — jiddiy orqada */
const ON_PACE = 1;
const NEAR_PACE = 0.85;

export interface PacedRow {
  key: PacedKey;
  actual: number;
  /** Amaldagi maqsad: saqlangani, bo'lmasa taklif; null — kuzatilmaydi */
  target: number | null;
  forecast: number;
  /** Kuniga kerak — faqat SAQLANGAN maqsad uchun (server hisoblaydi) */
  need: number | null;
  /** Hozircha bajarilgan ulush, chiziq uchun 0..100 */
  fill: number;
  donePct: number | null;
  forecastPct: number | null;
  tone: Tone;
}

/**
 * Sur'at rangi = prognoz ÷ maqsad. Tushum va dona uchun bu aynan "hozirgi
 * natija ÷ bugungacha kutilgani" (prognoz chiziqli). Sof foydada prognoz
 * kutilayotgan davr xarajatlarini hisobga oladi — oy boshida to'langan ish
 * haqi qatorni qizil qilib qo'ymaydi.
 *
 * ATAYLAB xom foiz bo'yicha emas: oyning 5-kunida maqsadning 15% i — reja
 * bo'yicha yurish, lekin xom foizda hamma qator qizil bo'lib qolardi.
 */
export function paceTone(forecast: number, target: number): Tone {
  const r = forecast / target;
  if (r >= ON_PACE) return 'brand';
  if (r >= NEAR_PACE) return 'warn';
  return 'danger';
}

/**
 * Amaldagi maqsadlar. Saqlangan bo'lsa — faqat ular (null kalit "kuzatilmaydi",
 * taklif bilan to'ldirilmaydi: sotuvchi uni ataylab bo'sh qoldirgan).
 * Saqlanmagan bo'lsa — taklif (kartochkada shtrixli "taklif" bo'lib chiqadi).
 */
export function effectiveTargets(g: GoalsResponse): { values: GoalTargets | null; isSuggestion: boolean } {
  if (g.target) return { values: g.target, isSuggestion: false };
  if (g.suggested) return { values: g.suggested, isSuggestion: true };
  return { values: null, isSuggestion: false };
}

export function pacedRows(g: GoalsResponse): PacedRow[] {
  const { values } = effectiveTargets(g);
  return PACED_KEYS.map((key) => {
    const actual = g.actual[key];
    const forecast = g.forecast[key];
    const target = values?.[key] ?? null;
    const valid = target !== null && target > 0;
    return {
      key,
      actual,
      target: valid ? target : null,
      forecast,
      need: g.needPerDay?.[key] ?? null,
      fill: valid ? Math.max(0, Math.min(100, (actual / target) * 100)) : 0,
      donePct: valid ? (actual / target) * 100 : null,
      forecastPct: valid ? (forecast / target) * 100 : null,
      tone: valid ? paceTone(forecast, target) : 'muted',
    };
  });
}

export interface MarginRow {
  actual: number;
  target: number | null;
  /** Hozirgi marja − maqsad, foiz punktida (0,1 gacha) */
  gap: number | null;
  /** Oy oxiriga kutilayotgan marja: sof foyda prognozi ÷ tushum prognozi */
  forecast: number | null;
}

export function marginRow(g: GoalsResponse): MarginRow {
  const { values } = effectiveTargets(g);
  const target = values?.marginPct ?? null;
  return {
    actual: g.actual.marginPct,
    target,
    gap: target !== null ? Math.round((g.actual.marginPct - target) * 10) / 10 : null,
    forecast: g.forecast.revenue > 0 ? (g.forecast.netProfit / g.forecast.revenue) * 100 : null,
  };
}

const TONE_RANK: Partial<Record<Tone, number>> = { danger: 3, warn: 2, brand: 1 };

/** Kartochka chizig'i — eng yomon qator ohangi: muammo bor qator birinchi qarashda sezilsin */
export function overallTone(rows: PacedRow[]): Tone | undefined {
  let worst: Tone | undefined;
  for (const r of rows) {
    if (r.target === null) continue;
    if (!worst || (TONE_RANK[r.tone] ?? 0) > (TONE_RANK[worst] ?? 0)) worst = r.tone;
  }
  return worst;
}

/** Sur'at belgisi — oyning o'tgan ulushi (kasr kunlarda, server bilan bir xil) */
export const paceMarker = (g: GoalsResponse): number => Math.min(100, (g.elapsedDays / g.daysInMonth) * 100);

/** Oxirgi kun: qolgan vaqt 1 kundan kam — "kuniga" emas, "bugun yana" */
export const isLastDay = (g: GoalsResponse): boolean => g.daysInMonth - g.elapsedDays < 1;
