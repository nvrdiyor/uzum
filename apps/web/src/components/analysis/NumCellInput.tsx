import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const digitsOnly = (s: string): string => s.replace(/[^\d]/g, '');

/**
 * Jadval ichidagi raqamli katak.
 * Bo'sh qiymat = 0 (kiritilmagan). Fokusda tanlanadi, Enter bilan blur bo'ladi.
 */
export function NumCellInput({
  value,
  onChange,
  placeholder,
  tone = 'default',
  width = 116,
  title,
  onEnter,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  tone?: 'default' | 'dirty' | 'missing';
  width?: number;
  title?: string;
  onEnter?: () => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : '');

  useEffect(() => {
    setText(value > 0 ? String(value) : '');
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      title={title}
      value={text}
      placeholder={placeholder}
      style={{ width }}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const next = digitsOnly(e.target.value);
        setText(next);
        onChange(next ? Number(next) : 0);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
          onEnter?.();
        }
      }}
      className={cn(
        'tnum rounded-lg border bg-surface-2 px-2.5 py-1.5 text-right text-sm text-ink transition-colors',
        'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/25',
        tone === 'dirty' && 'border-brand/60 bg-brand/[0.07]',
        tone === 'missing' && 'border-warn/50',
        tone === 'default' && 'border-line focus:border-brand/60',
      )}
    />
  );
}
