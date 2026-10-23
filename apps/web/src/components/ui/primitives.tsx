import { forwardRef, useId, useMemo, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useFormat, useT } from '@/i18n';
// Faqat sof hisob-kitob (Recharts yo'q) — grafik kutubxonasi asosiy to'plamga tortilmaydi
import { downsample, smoothPath } from '@/components/charts/series';
import { ArrowDownRight, ArrowUpRight, Check, Loader2, Minus, Search, X } from '@/components/icons';
import { cn } from '@/lib/utils';

// ─────────────────────────── Amount ───────────────────────────

/** Formatlangan summaning oxiridagi pul birligi (f.money shunday yozadi) */
const CURRENCY_TAIL = /^(.*\d)(\s+)(so[‘'’ʻ]m|сум|UZS|USD|\$)$/u;

/**
 * "74 920 500 so‘m" → raqam to'liq, "so‘m" kichikroq va xira.
 * Ko'zga birinchi raqam tashlanadi; birlik har kartochkada takrorlangani
 * uchun uni katta yozish shovqin edi. Birlik topilmasa matn o'zgarmaydi.
 */
export function Amount({
  value,
  className,
  nowrap,
}: {
  value: string;
  className?: string;
  /** Tor plitkada birlik alohida qatorga tushmasin (raqam bilan birga kesiladi) */
  nowrap?: boolean;
}) {
  const m = CURRENCY_TAIL.exec(value);
  if (!m) return <span className={className}>{value}</span>;
  return (
    <span className={cn(nowrap && 'whitespace-nowrap', className)}>
      {m[1]}
      {/* Joy yetmasa valyuta keyingi qatorga o'tadi, raqamning o'zi bo'linmaydi */}
      {nowrap ? null : <wbr />}
      <span className="ml-1 font-sans text-[0.55em] font-semibold tracking-normal text-muted">{m[3]}</span>
    </span>
  );
}

// ─────────────────────────── Card ───────────────────────────

/**
 * `tone` — kartochka ma'nosining rangi: tepada ingichka aksent chiziq va
 * sarlavha ikonkasi shu rangda bo'ladi (index.css: .tone-*, .card-accent).
 * Berilmasa kartochka tinch qoladi — hamma kartochka rangli bo'lsa, rang
 * ma'nosini yo'qotadi.
 */
export function Card({
  className,
  children,
  hover,
  tone,
  accent,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean; tone?: Tone; accent?: boolean }) {
  return (
    <div
      className={cn('card', hover && 'card-hover', tone && `tone-${tone}`, (accent ?? Boolean(tone)) && 'card-accent', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Sahifadagi BITTA asosiy kartochka (masalan, sof foyda yoki kalkulyator
 * natijasi): ohang rangidagi yengil yorug'lik va chegara. Ikkinchisini
 * qo'shmang — bir nechta "porlayotgan" kartochka hech birini ajratmaydi.
 */
export function HeroCard({
  tone = 'brand',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div className={cn('hero-card relative', `tone-${tone}`, className)} {...rest}>
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
  tone,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Ikonka plitkasi rangi; berilmasa kartochkaning ohangi (yoki brend) olinadi */
  tone?: Tone;
}) {
  return (
    <div className={cn('card-head flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          /*
            Ilgari kulrang chegarali quti edi — 37 sahifada bir xil kulrang
            belgi turib, kartochkalarni bir-biridan ajratmasdi. Endi ohang
            rangidagi plitka: kartochka nima haqida ekani birinchi qarashda ko'rinadi.
          */
          <div className={cn('icon-tile mt-0.5 h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]', tone && `tone-${tone}`)}>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="section-title truncate">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {/* max-w-full + flex-wrap: tor ekranda tugma va belgilar qatorga bo'linadi, kartochkadan chiqmaydi */}
      {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card-body p-5', className)}>{children}</div>;
}

// ─────────────────────────── Button ───────────────────────────

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  soft: 'btn bg-brand/10 text-brand-ink hover:bg-brand/20',
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
  brand: 'bg-brand/10 text-brand-ink',
  info: 'bg-info/10 text-info-ink',
  warn: 'bg-warn/10 text-warn-ink',
  danger: 'bg-danger/10 text-danger-ink',
  muted: 'bg-surface-3 text-muted',
  violet: 'bg-violet/10 text-violet-ink',
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
  suffix,
  unit = 'pct',
  invert = false,
}: {
  value: number | null | undefined;
  className?: string;
  /** Qo'lda berilgan birlik (berilsa `unit` e'tiborga olinmaydi) */
  suffix?: string;
  /**
   * 'pct' — nisbiy o'zgarish (%), 'pp' — foiz punkti. Marja, ROI, xarid va
   * qaytarish ulushi uchun 'pp': marja 20% dan 25% ga chiqsa bu "+5 p.p.",
   * "+25%" emas — ilgari ikkalasi ham "%" bilan chiqib, sotuvchini adashtirardi.
   */
  unit?: 'pct' | 'pp';
  /** Kamayish yaxshi bo'lgan holatlar uchun (masalan, xarajat) */
  invert?: boolean;
}) {
  const t = useT('common');
  const f = useFormat();
  const tail = suffix ?? (unit === 'pp' ? ` ${t('common.pp')}` : '%');

  /*
   * Taqqoslash uchun oldingi davr ma'lumoti yo'q.
   *
   * Ilgari bu yerda minus IKONKASI va tire birga chiqardi — bitta kichkina
   * plastinkada ikkita chiziq turib, buzilgan kabi ko'rinardi. Endi bitta
   * tire, sababi esa sichqoncha olib borilganda izohda.
   */
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span
        className={cn('chip bg-surface-3 text-muted', className)}
        title={t('common.noCompare')}
      >
        {'—'}
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
        neutral ? 'bg-surface-3 text-muted' : good ? 'bg-brand/10 text-brand-ink' : 'bg-danger/10 text-danger-ink',
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
      {/* Til bo'yicha o'nlik belgi: ilgari toFixed nuqta qo'yardi ("12.4%"), qolgan raqamlar esa vergul bilan edi */}
      {`${positive ? '+' : ''}${f.num(value, 1)}${tail}`}
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
      {/*
        p-0 muhim: <button> ning brauzerdagi standart ichki bo'shlig'i (padding)
        absolyut joylashgan doiraning boshlang'ich nuqtasini o'ngga suradi va u
        yo'lakchadan chiqib ketadi. left-0.5 bilan boshlang'ich nuqta aniq
        belgilanadi: yo'lakcha 44px, doira 20px, ikki chetda 2px — yurish 20px.
      */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border-0 p-0 transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-spring',
            checked ? 'translate-x-5' : 'translate-x-0',
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
    // max-w-full + gorizontal aylantirish: tablar telefon ekranidan keng bo'lsa sahifani surmaydi
    <div className={cn('no-scrollbar inline-flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              // shrink-0 + nowrap: tor ekranda tugmalar sinmaydi, qator suriladi
              'shrink-0 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,box-shadow] duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              /*
                Faol tab brend rangida. Ilgari u kulrang sirt edi va qorong'i
                mavzuda fon bilan ~1,1:1 kontrastda turib, qaysi tab tanlangani
                deyarli ko'rinmasdi.
              */
              active
                ? 'bg-brand/12 text-brand-ink shadow-[inset_0_0_0_1px_rgb(var(--c-brand)/0.32)]'
                : 'text-muted hover:bg-surface/60 hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn('ml-1.5 rounded-md px-1.5 py-0.5 text-2xs tnum', active ? 'bg-brand/10 text-brand-ink' : 'bg-surface-3 text-muted')}>
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

const BAR_TONE: Record<Tone, string> = {
  brand: 'bg-brand',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-muted',
  violet: 'bg-violet',
};

export function ProgressBar({
  value,
  className,
  tone = 'brand',
  showLabel,
  marker,
  markerLabel,
}: {
  value: number;
  className?: string;
  tone?: Tone;
  showLabel?: boolean;
  /**
   * 0..100 dagi tik belgisi — masalan oylik maqsadda "bugungi sur'at":
   * oyning 60% o'tgan bo'lsa belgi 60% da turadi va chiziq undan orqada
   * qolgani darhol ko'rinadi.
   */
  marker?: number | null;
  markerLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const mark = marker === null || marker === undefined ? null : Math.max(0, Math.min(100, marker));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative h-2 flex-1 rounded-full bg-surface-3">
        <div className="h-full overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-[width] duration-700 ease-spring', BAR_TONE[tone])}
            style={{ width: `${pct}%` }}
          />
        </div>
        {mark !== null ? (
          <span
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ink/70"
            style={{ left: `${mark}%` }}
            title={markerLabel}
            aria-hidden
          />
        ) : null}
      </div>
      {showLabel ? <span className="tnum w-10 text-right text-xs text-muted">{Math.round(pct)}%</span> : null}
    </div>
  );
}

const RING_TONE: Record<Tone, string> = {
  brand: 'rgb(var(--c-brand))',
  info: 'rgb(var(--c-info))',
  warn: 'rgb(var(--c-warn))',
  danger: 'rgb(var(--c-danger))',
  muted: 'rgb(var(--c-muted))',
  violet: 'rgb(var(--c-violet))',
};

export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  tone = 'brand',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  /** Ilgari halqa doim brend rangida edi — past marja ham "yashil" ko'rinardi */
  tone?: Tone;
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
          stroke={RING_TONE[tone]}
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

export function ErrorState({
  message,
  onRetry,
  retryLabel,
  title,
}: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
}) {
  // Matnlar qotirilgan emas — rus va ingliz tilida ham to'g'ri chiqadi
  const t = useT('common');
  return (
    <EmptyState
      icon={<X className="h-6 w-6" />}
      title={title ?? t('common.errorTitle')}
      hint={message}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel ?? t('btn.retry')}
          </Button>
        ) : undefined
      }
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
      className="flex items-center justify-center rounded-full bg-brand-grad font-display text-sm font-bold text-on-brand"
      style={{ width: size, height: size }}
    >
      {letters}
    </div>
  );
}

/**
 * Reytingdagi o'rin (top mahsulotlar): 1 — oltin, 2 — kumush, 3 — bronza,
 * qolganlari tinch. Raqamning o'zi oddiy matnda yo'qolib ketardi.
 */
export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const style =
    rank === 1
      ? 'bg-warn/15 text-warn-ink shadow-[inset_0_0_0_1px_rgb(var(--c-warn)/0.35)]'
      : rank === 2
        ? 'bg-surface-3 text-ink-soft shadow-[inset_0_0_0_1px_rgb(var(--c-border-strong))]'
        : rank === 3
          ? 'bg-[rgb(var(--sc-2)/0.14)] text-ink-soft shadow-[inset_0_0_0_1px_rgb(var(--sc-2)/0.4)]'
          : 'bg-surface-2 text-muted';
  return (
    <span
      className={cn(
        'tnum inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold',
        style,
        className,
      )}
    >
      {rank}
    </span>
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
          ok ? 'bg-brand/10 text-brand-ink' : 'bg-surface-3 text-muted',
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
  const id = `spark-${useId().replace(/:/g, '')}`;
  /*
   * Kunlik qator to'g'ridan-to'g'ri chizilmaydi:
   *  - boshidagi uzoq bo'sh davr kesiladi — aks holda 96 px lik chiziqning
   *    deyarli hammasi nol ustida yotadi va oxirida bitta "tikan" qoladi;
   *  - nuqtalar ko'p bo'lsa qo'shni kunlar o'rtachasiga siqiladi — yo'nalish
   *    ko'rinadi, kunlik sakrashlar esa chiziqni arraga aylantirmaydi.
   */
  const values = useMemo(() => {
    const all = data ?? [];
    const first = all.findIndex((v) => v !== 0);
    const cut = first >= 7 && first / all.length > 0.2 ? all.slice(first - 1) : all;
    return downsample(cut, 18);
  }, [data]);

  if (values.length < 2) return <div style={{ width, height }} className={className} />;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  // Oxirgi nuqta doirachasi chetdan kesilmasin
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: pad + i * step,
    y: height - pad - ((v - min) / span) * (height - pad * 2),
  }));
  const line = smoothPath(pts);
  const end = pts[pts.length - 1] as { x: number; y: number };
  const color = {
    brand: 'rgb(var(--c-brand))',
    danger: 'rgb(var(--c-danger))',
    info: 'rgb(var(--c-info))',
    warn: 'rgb(var(--c-warn))',
  }[tone];

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${end.x.toFixed(2)},${height}L${pad},${height}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={end.x} cy={end.y} r="2.5" fill={color} stroke="rgb(var(--c-surface))" strokeWidth="1.5" />
    </svg>
  );
}
