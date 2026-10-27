import type { VghRow } from '@savdoiq/shared';
import type { Tone } from '@/components/ui';

/**
 * Litr va kilogrammdagi kasr xonalari: "0,15 l", "2,4 l", "28 l". Umumiy
 * `f.num(v, 2)` hamma joyda ikki xona qo'yib "28,00 l" yozardi, `f.num(v, 1)`
 * esa 0,15 litrni "0,2" ga yaxlitlab, kichik tovar hajmini buzardi.
 */
export function fractionDigits(value: number, max = 3): number {
  for (let digits = 0; digits < max; digits += 1) {
    const scaled = value * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return digits;
  }
  return max;
}

/** Bo'linmas bo'shliq — manbada ko'rinmas belgi turmasin, kod bilan yasaladi */
const NBSP = String.fromCharCode(0xa0);

/**
 * Raqam va birlikni bir qatorda ushlaydi. Umumiy formatlovchi raqam
 * guruhlarini oddiy bo'shliq bilan ajratadi, matn ichida esa "1 000 000"
 * yoki "50 000 so'm" qator oxirida bo'linib ketardi (telefonda ko'rilgan).
 */
export function keepTogether(text: string): string {
  return text.split(' ').join(NBSP);
}

/** Jadval va filtr uchun holat kaliti: mismatch yo'nalishi bilan ikkiga bo'linadi */
export type VghStatusKey = 'ok' | 'over' | 'under' | 'no_dimensions' | 'insufficient';

export function vghStatusKey(row: Pick<VghRow, 'status' | 'direction'>): VghStatusKey {
  if (row.status === 'mismatch') return row.direction === 'under' ? 'under' : 'over';
  return row.status;
}

/**
 * Ohanglar ma'no bo'yicha: qizil — pul ortiqcha ketmoqda (yo'qotish),
 * binafsha — o'lchamsiz tarif (Uzum oladigan qism, KPI kartochkasi bilan bir
 * rangda), ko'k — kam olinmoqda (ziyon yo'q, ma'lumot uchun), yashil — mos,
 * kulrang — solishtirib bo'lmadi.
 */
export const VGH_STATUS_TONE: Record<VghStatusKey, Tone> = {
  ok: 'brand',
  over: 'danger',
  under: 'info',
  no_dimensions: 'violet',
  insufficient: 'muted',
};

/** Jadvaldagi "Holat" ustunini saralash: pul ketayotgani birinchi (kamayish tartibida) */
export const VGH_STATUS_WEIGHT: Record<VghStatusKey, number> = {
  over: 4,
  no_dimensions: 3,
  under: 2,
  insufficient: 1,
  ok: 0,
};
