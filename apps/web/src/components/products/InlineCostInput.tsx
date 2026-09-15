import { useEffect, useState, type KeyboardEvent } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn, groupDigits } from '@/lib/utils';

const BASE =
  'w-full rounded-lg border bg-surface-2 px-2.5 py-1.5 pr-7 text-right text-sm tnum text-ink placeholder:text-muted ' +
  'transition-colors focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20';

/**
 * Jadval ichida tannarxni to'g'ridan-to'g'ri tahrirlash.
 * Enter yoki fokusni yo'qotganda saqlanadi, Escape — bekor qiladi.
 *
 * Tannarx sahifasidagi `CostInput` dan farqi — bu yerda qiymat darhol
 * saqlanadi va holat nishoni ko'rsatiladi. Nomlari bir xil bo'lgani
 * chalkashtirardi, shuning uchun bu `InlineCostInput` deb ataladi.
 */
export function InlineCostInput({
  value,
  onSave,
  saving,
  saved,
  placeholder,
  className,
  disabled,
}: {
  value: number;
  onSave: (next: number) => void;
  saving?: boolean;
  saved?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState(value > 0 ? String(value) : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setRaw(value > 0 ? String(value) : '');
  }, [value]);

  const commit = () => {
    const next = Math.max(0, Math.round(Number(raw.replace(/\D/g, '')) || 0));
    if (next === value) {
      setRaw(value > 0 ? String(value) : '');
      return;
    }
    onSave(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setRaw(value > 0 ? String(value) : '');
      e.currentTarget.blur();
    }
  };

  const empty = !value || value <= 0;

  return (
    <div className={cn('relative inline-block w-28', className)}>
      <input
        value={focused ? raw : groupDigits(value)}
        inputMode="numeric"
        disabled={disabled || saving}
        placeholder={placeholder}
        onChange={(e) => setRaw(e.target.value.replace(/\D/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={onKeyDown}
        className={cn(BASE, empty ? 'border-warn/50' : 'border-line', disabled && 'opacity-60')}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5 text-brand" />
        ) : null}
      </span>
    </div>
  );
}
