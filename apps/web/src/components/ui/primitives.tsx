import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, Loader2, Minus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────── Card ───────────────────────────

export function Card({ className, children, hover, ...rest }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn('card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="section-title truncate">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// ─────────────────────────── Button ───────────────────────────

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  soft: 'btn bg-brand/12 text-brand hover:bg-brand/20',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: '',
  lg: 'px-5 py-3 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(VARIANT[variant], SIZE[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function IconButton({
  className,
  children,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted',
        'transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─────────────────────────── Badge / Chip ───────────────────────────

export type Tone = 'brand' | 'info' | 'warn' | 'danger' | 'muted' | 'violet';

const TONE_CLASS: Record<Tone, string> = {
  brand: 'bg-brand/12 text-brand',
  info: 'bg-info/12 text-info',
  warn: 'bg-warn/14 text-warn',
  danger: 'bg-danger/12 text-danger',
  muted: 'bg-surface-3 text-muted',
  violet: 'bg-violet/12 text-violet',
};

export function Badge({
  tone = 'muted',
  children,
  className,
  dot,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
  /** Sichqoncha olib borilganda ko'rinadigan to'liq izoh */
  title?: string;
}) {
  return (
    <span className={cn('chip', TONE_CLASS[tone], className)} title={title}>
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', `bg-current`)} /> : null}
      {children}
    </span>
  );
}

/** O'zgarish ko'rsatkichi: +12,4% ▲ */
export function Delta({
  value,
  className,
  suffix = '%',
  invert = false,
  compact = false,
}: {
  value: number | null | undefined;
  className?: string;
  suffix?: string;
  /** Kamayish yaxshi bo'lgan holatlar uchun (masalan, xarajat) */
  invert?: boolean;
  compact?: boolean;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn('chip bg-surface-3 text-muted', className)}>
        <Minus className="h-3 w-3" />
        {compact ? '' : '—'}
      </span>
    );
  }
  const positive = value > 0;
  const good = invert ? !positive : positive;
  const neutral = value === 0;
  return (
    <span
      className={cn(
        'chip tnum',
        neutral ? 'bg-surface-3 text-muted' : good ? 'bg-brand/12 text-brand' : 'bg-danger/12 text-danger',
        className,
      )}
    >
      {neutral ? (
        <Minus className="h-3 w-3" />
      ) : positive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {`${positive ? '+' : ''}${value.toFixed(1)}${suffix}`}
    </span>
  );
}

// ─────────────────────────── Inputs ───────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn('input', className)} {...rest} />;
});

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        className="input pl-9 pr-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'input cursor-pointer appearance-none bg-[length:14px] bg-[right_0.75rem_center] bg-no-repeat pr-9',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238F99AA' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        {label ? <span className="block text-sm font-medium text-ink">{label}</span> : null}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-spring',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

// ─────────────────────────── Segmented ───────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg font-semibold transition-all duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn('ml-1.5 rounded-md px-1.5 py-0.5 text-2xs tnum', active ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-muted')}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────── Progress ───────────────────────────

export function ProgressBar({
  value,
  className,
  tone = 'brand',
  showLabel,
}: {
  value: number;
  className?: string;
  tone?: Tone;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const bar: Record<Tone, string> = {
    brand: 'bg-brand',
    info: 'bg-info',
    warn: 'bg-warn',
    danger: 'bg-danger',
    muted: 'bg-muted',
    violet: 'bg-violet',
  };
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-spring', bar[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel ? <span className="tnum w-10 text-right text-xs text-muted">{Math.round(pct)}%</span> : null}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-surface-3))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-brand))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ─────────────────────────── Skeleton / holatlar ───────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      ) : null}
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel = 'Qayta urinish' }: { message?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <EmptyState
      icon={<X className="h-6 w-6" />}
      title="Xatolik yuz berdi"
      hint={message}
      action={onRetry ? <Button variant="outline" onClick={onRetry}>{retryLabel}</Button> : undefined}
    />
  );
}

// ─────────────────────────── Boshqalar ───────────────────────────

export function Avatar({ src, name, size = 36 }: { src?: string | null; name?: string | null; size?: number }) {
  const letters = (name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return src ? (
    <img
      src={src}
      alt={name ?? ''}
      width={size}
      height={size}
      className="rounded-full object-cover ring-2 ring-line"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex items-center justify-center rounded-full bg-brand-grad font-display text-sm font-bold text-white"
      style={{ width: size, height: size }}
    >
      {letters}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('hairline', className)} />;
}

export function CheckItem({ children, ok = true }: { children: ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-muted',
        )}
      >
        {ok ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </span>
      <span className={ok ? 'text-ink-soft' : 'text-muted'}>{children}</span>
    </li>
  );
}

/** Kichik sparkline grafik (SVG) */
export function Sparkline({
  data,
  width = 96,
  height = 32,
  tone = 'brand',
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'brand' | 'danger' | 'info' | 'warn';
  className?: string;
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} className={className} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - ((v - min) / span) * (height - 4) - 2}`);
  const color = {
    brand: 'rgb(var(--c-brand))',
    danger: 'rgb(var(--c-danger))',
    info: 'rgb(var(--c-info))',
    warn: 'rgb(var(--c-warn))',
  }[tone];
  const id = `spark-${tone}-${data.length}-${Math.round(max)}`;
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
    </svg>
  );
}
