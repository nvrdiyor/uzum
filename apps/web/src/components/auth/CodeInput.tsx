import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bir martalik kod maydoni: har bir raqam alohida katakda.
 * Fokus avtomatik ko'chadi, nusxa qo'yish (paste) va klaviatura navigatsiyasi qo'llab-quvvatlanadi.
 * Qiymat ixcham satr ko'rinishida saqlanadi ("1234" — chapdan o'ngga to'ladi).
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = false,
  invalid = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Barcha kataklar to'lganda chaqiriladi */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, index))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string, focusIndex: number) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    focusAt(focusIndex);
    if (clean.length === length) onComplete?.(clean);
  };

  /** `index` katagidan boshlab raqamlarni yozadi (bo'sh kataklardan sakrab o'tmaydi) */
  const writeFrom = (index: number, digits: string) => {
    const at = Math.min(index, value.length);
    const chars = value.split('');
    for (let i = 0; i < digits.length && at + i < length; i += 1) chars[at + i] = digits[i];
    commit(chars.join(''), at + digits.length);
  };

  const handleInput = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      commit(value.slice(0, index) + value.slice(index + 1), index);
      return;
    }
    writeFrom(index, digits.slice(0, length - Math.min(index, value.length)));
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        commit(value.slice(0, index) + value.slice(index + 1), index);
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index), index - 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(index + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(Math.min(value.length, length - 1));
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    if (digits.length >= length) commit(digits.slice(0, length), length - 1);
    else writeFrom(index, digits);
  };

  return (
    <div
      className={cn('grid gap-1.5 sm:gap-2.5', className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ''}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={length}
          aria-label={String(i + 1)}
          className={cn(
            'tnum h-12 w-full rounded-xl border text-center font-display text-lg font-extrabold text-ink sm:h-14 sm:text-xl',
            'transition-all duration-200 ease-spring focus:outline-none focus:ring-2 focus:ring-brand/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid
              ? 'border-danger/60 bg-danger/5'
              : value[i]
                ? 'border-brand/45 bg-brand/5 focus:border-brand'
                : 'border-line bg-surface-2 focus:border-brand/60',
          )}
        />
      ))}
    </div>
  );
}
