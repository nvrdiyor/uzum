/**
 * Qarz shakli va yozuv oynasining kichik maydonlari. Ko'rinishi NumberField
 * (unit kalkulyator) bilan bir xil: yorliq — eyebrow-lg, ostida qisqa izoh yoki xato.
 */
import { useId, type ReactNode } from 'react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export function FieldNote({ error, hint }: { error?: string | null; hint?: ReactNode }) {
  if (error) return <p className="mt-1.5 text-2xs font-medium leading-snug text-danger-ink">{error}</p>;
  if (hint) return <p className="mt-1.5 text-2xs leading-relaxed text-muted">{hint}</p>;
  return null;
}

/** Bir nechta variantdan biri — telefonda qatorga sig'masa keyingi qatorga o'tadi (Segmented kabi surilmaydi) */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  label?: ReactNode;
  className?: string;
}) {
  // Ko'rinadigan yorliq guruhning nomi ham bo'lsin: ekran o'quvchi "Har oy, radio" emas, "Qanday qaytarasiz?" bilan o'qisin
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <p id={id} className="label">
          {label}
        </p>
      ) : null}
      <div role="radiogroup" aria-labelledby={label ? id : undefined} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'focusable rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors',
                active
                  ? 'border-brand/60 bg-brand/10 text-brand-ink'
                  : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink',
              )}
            >
              {o.label}
              {o.hint ? <span className="block text-2xs font-normal text-muted">{o.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Butun son maydoni (oylar, kun, foiz): matn shaklda saqlanadi — tozalab, qayta yozish mumkin */
export function CountField({
  label,
  value,
  onChange,
  suffix,
  hint,
  error,
  placeholder,
  decimal,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  suffix?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  placeholder?: string;
  /** Kasr ham mumkin (foiz) */
  decimal?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="label truncate">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn('tnum font-semibold', suffix ? 'pr-12' : undefined, error && 'border-danger/60')}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      <FieldNote error={error} hint={hint} />
    </div>
  );
}

/**
 * Sana maydoni. Brauzer chala yozilgan sanani "" qilib beradi; to'liqligi va
 * kalendarda borligi shaklning o'zida tekshiriladi (isIsoDay) — 5 xonali yil
 * yoki 2026-02-30 serverga ketmaydi.
 */
export function DateField({
  label,
  value,
  onChange,
  min = '2000-01-01',
  max = '9999-12-31',
  hint,
  error,
  aside,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  hint?: ReactNode;
  error?: string | null;
  /** Yorliq qatorining o'ng chetida (masalan, "Sana kelishilmagan" belgisi) */
  aside?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex min-h-[20px] items-center justify-between gap-2">
        <label htmlFor={id} className="eyebrow-lg min-w-0 truncate">
          {label}
        </label>
        {aside ? <span className="shrink-0">{aside}</span> : null}
      </div>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn('tnum', error && 'border-danger/60')}
      />
      <FieldNote error={error} hint={hint} />
    </div>
  );
}

/** Oddiy matn maydoni sarlavhasi bilan */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  error,
  hint,
  list,
  autoFocus,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  error?: string | null;
  hint?: ReactNode;
  /** <datalist> id — tez tanlash uchun takliflar */
  list?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="label truncate">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        list={list}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(error && 'border-danger/60')}
      />
      <FieldNote error={error} hint={hint} />
    </div>
  );
}
