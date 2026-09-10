import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Kalkulyator formasi uchun raqamli maydon: sarlavha, qisqa izoh va o'lchov birligi.
 * Ichkarida matn holati saqlanadi — foydalanuvchi maydonni tozalab, qayta yozishi mumkin.
 */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step,
  icon,
  tone = 'default',
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  suffix?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'danger';
  className?: string;
}) {
  const id = useId();
  const [raw, setRaw] = useState<string>(() => String(value));

  // Tashqaridan (SKU standartlari yoki ssenariy) qiymat kelganda matnni yangilaymiz
  useEffect(() => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed !== value) setRaw(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: string) => {
    setRaw(next);
    if (next.trim() === '' || next === '-') return;
    const parsed = Number(next.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    let clamped = parsed;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    onChange(clamped);
  };

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="label mb-1.5 flex items-center gap-1.5">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          type="number"
          min={min}
          max={max}
          step={step}
          value={raw}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setRaw(String(value))}
          className={cn(
            'input tnum pr-16 font-semibold',
            tone === 'brand' && 'border-brand/40 text-brand',
            tone === 'danger' && 'border-danger/40 text-danger',
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1.5 text-2xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
