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
  badge,
  tone = 'default',
  hintOnFocus = false,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Yorliq qatorining o'ng chetidagi kichik belgi — masalan qiymat manbai ("Sotuvdan") */
  badge?: ReactNode;
  /**
   * Izoh faqat maydonga kirilganda, uning ostida suzib chiqadi. O'n ikkita
   * maydonning har biri ostida doimiy izoh tursa, forma ikki barobar uzayadi
   * va raqamlar matn orasida yo'qolib qoladi.
   */
  hintOnFocus?: boolean;
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
    <div className={cn('group relative min-w-0', className)}>
      <label htmlFor={id} className="label mb-1.5 flex items-center gap-1.5">
        {icon ? <span className="text-muted">{icon}</span> : null}
        {/* Tor ustunda kesilsa — to'liq nomi izohda */}
        <span className="truncate" title={typeof label === 'string' ? label : undefined}>
          {label}
        </span>
        {badge ? <span className="ml-auto shrink-0">{badge}</span> : null}
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
            'input tnum font-semibold',
            /*
             * Brauzerning ↑↓ tugmachalari o'chirilgan: ular o'ngdagi 20 px ni
             * egallab, birlik ("so'm") bilan ustma-ust tushardi va 6 xonali
             * summa kesilardi. Qadam bo'yicha o'zgartirish klaviatura
             * strelkalari bilan ishlayveradi (`step`).
             */
            '[appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none',
            /*
             * Qisqa birlik ("so'm", "%", "kun") uchun o'ngda 48 px yetadi. Ilgari
             * har doim 64 px band qilinardi: telefondagi 2 ustunli formada
             * (360 px) raqamga ~56 px qolib, 6 xonali summa kesilardi (2026-10-24).
             */
            typeof suffix === 'string' && suffix.length <= 4 ? 'pr-12' : 'pr-16',
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
      {!hint ? null : hintOnFocus ? (
        // Joy egallamaydi (absolute) — chiqqanda pastdagi maydonlar sakramaydi
        <p className="pointer-events-none absolute inset-x-0 top-full z-20 mt-1 hidden rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-2xs leading-snug text-ink-soft shadow-pop group-focus-within:block">
          {hint}
        </p>
      ) : (
        <p className="mt-1.5 text-2xs leading-relaxed text-muted">{hint}</p>
      )}
    </div>
  );
}
