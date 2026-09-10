/**
 * Jadval ichidagi raqamli maydon — tannarx va qo'shimcha xarajat uchun.
 * Fokusda toza raqam, fokussiz — mingliklar bo'yicha ajratilgan ko'rinish.
 */
import { forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Foydalanuvchi kiritgan matndan butun son ajratish */
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

export interface CostInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Enter bosilganda — odatda keyingi qatorga o'tish */
  onEnter?: () => void;
  /** Saqlanmagan o'zgarish bor */
  dirty?: boolean;
  /** Qiymat kiritilmagan (diqqat tortadi) */
  warn?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const CostInput = forwardRef<HTMLInputElement, CostInputProps>(function CostInput(
  { value, onChange, onEnter, dirty, warn, ariaLabel, placeholder, className, disabled },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (value ? String(Math.round(value)) : ''));

  useEffect(() => {
    if (!focused) setText(value ? String(Math.round(value)) : '');
  }, [value, focused]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? text : groupDigits(value)}
      onFocus={(e) => {
        const el = e.currentTarget;
        setFocused(true);
        setText(value ? String(Math.round(value)) : '');
        requestAnimationFrame(() => el.select());
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw.replace(/[^\d\s]/g, ''));
        onChange(parseAmount(raw));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter?.();
        }
      }}
      className={cn(
        'tnum w-full min-w-[112px] rounded-lg border px-2.5 py-1.5 text-right text-sm text-ink outline-none',
        'transition-colors placeholder:text-muted focus:border-brand/60 focus:ring-2 focus:ring-brand/20',
        'disabled:opacity-50',
        dirty
          ? 'border-brand/60 bg-brand/10'
          : warn
            ? 'border-warn/50 bg-warn/5'
            : 'border-line bg-surface-2',
        className,
      )}
    />
  );
});
