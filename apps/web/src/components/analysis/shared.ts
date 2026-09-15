import { CHART_COLORS } from '@/lib/theme';
import type { Tone } from '@/components/ui';

export type AbcGroupKey = 'A' | 'B' | 'C';
export type XyzGroupKey = 'X' | 'Y' | 'Z';

/** ABC guruh ranglari: A — mint, B — amber, C — qizil */
export const ABC_CHART_COLOR: Record<AbcGroupKey, string> = {
  A: CHART_COLORS.brand,
  B: CHART_COLORS.warn,
  C: CHART_COLORS.danger,
};

/** Badge/chip uchun ton */
export const ABC_TONE: Record<AbcGroupKey, Tone> = {
  A: 'brand',
  B: 'warn',
  C: 'danger',
};

/** Issiqlik jadvali va halqa uchun CSS o'zgaruvchi nomi */
export const ABC_CSS_VAR: Record<AbcGroupKey, string> = {
  A: '--c-brand',
  B: '--c-warn',
  C: '--c-danger',
};

/**
 * Rangli plastinka USTIDAGI matn uchun to'q variantlar — oddiy rang
 * 14% tiniq fonda 2,63:1 gacha tushardi.
 */
export const ABC_INK_VAR: Record<AbcGroupKey, string> = {
  A: '--c-brand-ink',
  B: '--c-warn-ink',
  C: '--c-danger-ink',
};

export const XYZ_KEYS: XyzGroupKey[] = ['X', 'Y', 'Z'];
export const ABC_KEYS: AbcGroupKey[] = ['A', 'B', 'C'];

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
