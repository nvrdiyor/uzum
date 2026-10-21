import clsx, { type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]): string => clsx(inputs);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 0..100 progress bo'yicha rang */
export function progressTone(p: number): string {
  if (p >= 99) return 'text-brand-ink';
  if (p >= 50) return 'text-info';
  return 'text-warn-ink';
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  el.remove();
  return Promise.resolve();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Foydalanuvchi kiritgan matndan butun son ajratish: "150 000", "125,000 so'm" → 150000, 125000.
 *
 * DIQQAT: regex'dagi teskari chiziqlar (`\D`, `\B`, `\d`) bir marta tahrirda
 * yo'qolgan edi (a595f38) — `/D/g` faqat "D" harfini olib tashlardi va
 * "150 000" deb yozilgan tannarx 0 bo'lib saqlanardi.
 */
export function parseAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits.slice(0, 12));
  return Number.isFinite(n) ? n : 0;
}

/** 1250000 → "1 250 000" */
export function groupDigits(value: number): string {
  if (!value) return '';
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
