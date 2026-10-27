/**
 * Raqobatchilar narxi — karta va xarita uchun umumiy bo'laklar: xavfsiz
 * havola, "N kun oldin", farq chipi va o'rin nishoni (2026-10-24).
 *
 * Pul maydonlari null kelishi mumkin (cheklangan ko'rinishli jamoa a'zosiga
 * server pulni yashiradi) — hammasi '—' bo'lib chiqadi, 0 bo'lib emas.
 */
import { ArrowDownRight, ArrowUpRight, Clock, ExternalLink } from '@/components/icons';
import { COMPETITOR_LIMITS, type CompetitorPosition } from '@savdoiq/shared';
import { Badge, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './texts';

type Fmt = ReturnType<typeof useFormat>;

/** Pul: null / NaN — tire (0 so'm emas: yashirilgan qiymat "bepul" bo'lib ko'rinmasin) */
export function money(f: Fmt, v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? f.money(v) : '—';
}

/** "225 000 – 300 000 so'm" yoki bitta narx */
export function moneyRange(f: Fmt, min: number | null | undefined, max: number | null | undefined): string {
  if (typeof min !== 'number' || !Number.isFinite(min)) return '—';
  if (typeof max !== 'number' || !Number.isFinite(max) || max === min) return f.money(min);
  return `${f.num(min)} – ${f.money(max)}`;
}

/**
 * Narx oralig'i — tor joyda faqat tire oldidan qatorga bo'linadi. Ilgari
 * telefonda "248 000 – 265 / 000 so'm" bo'lib, raqam o'rtasidan uzilardi.
 */
export function MoneyRange({ min, max, className }: { min: number | null | undefined; max: number | null | undefined; className?: string }) {
  const f = useFormat();
  if (typeof min !== 'number' || !Number.isFinite(min)) return <span className={className}>—</span>;
  if (typeof max !== 'number' || !Number.isFinite(max) || max === min) {
    return <span className={cn('whitespace-nowrap', className)}>{f.money(min)}</span>;
  }
  return (
    <span className={className}>
      <span className="whitespace-nowrap">{f.num(min)} –</span> <span className="whitespace-nowrap">{f.money(max)}</span>
    </span>
  );
}

/**
 * Faqat http(s) havola bosiladigan bo'ladi — server ham shuni saqlaydi, bu
 * ikkinchi qavat: bazada qandaydir "javascript:" qolib ketsa ham ishlamasin.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Raqobatchi nomi — havola bo'lsa yangi oynada ochiladi. ATAYLAB oddiy <a>:
 * oldindan ko'rish, rasm yoki favicon so'ralmaydi; noreferrer — Uzum bizning
 * sahifamiz manzilini ko'rmaydi, nofollow — qidiruv tizimlari uchun.
 */
export function CompetitorLink({ title, url, className }: { title: string; url: string | null | undefined; className?: string }) {
  const t = useT('competitors');
  const href = safeHref(url);
  if (!href) return <span className={cn('break-words', className)}>{title}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      referrerPolicy="no-referrer"
      title={t('row.openLink')}
      onClick={(e) => e.stopPropagation()}
      className={cn('focusable inline-flex max-w-full items-baseline gap-1 rounded-sm hover:text-brand-ink hover:underline', className)}
    >
      <span className="min-w-0 break-words">{title}</span>
      <ExternalLink className="h-3 w-3 shrink-0 translate-y-px text-muted" />
    </a>
  );
}

export function useDaysAgo(): (days: number) => string {
  const t = useT('competitors');
  return (days) => (days <= 0 ? t('row.today') : days === 1 ? t('row.yesterday') : t('row.daysAgo', { n: days }));
}

/** "N kun oldin"; 14 kundan eski — sariq, soat belgisi bilan */
export function CheckedAgo({ checkedAt, daysAgo, stale, className }: { checkedAt: string; daysAgo: number; stale: boolean; className?: string }) {
  const t = useT('competitors');
  const f = useFormat();
  const ago = useDaysAgo();
  const hint = [t('row.checkedHint', { date: f.date(checkedAt) }), stale ? t('row.stale', { days: COMPETITOR_LIMITS.staleDays }) : '']
    .filter(Boolean)
    .join('\n');
  return (
    <span
      className={cn('tnum inline-flex cursor-help items-center gap-1 whitespace-nowrap text-xs', stale ? 'font-semibold text-warn-ink' : 'text-muted', className)}
      title={hint}
    >
      {stale ? <Clock className="h-3.5 w-3.5" /> : null}
      {ago(daysAgo)}
    </span>
  );
}

/**
 * Raqobatchi narxi bizning narxdan farqi (`diffPct` = (raqobatchi − biz) ÷ biz):
 * raqobatchi arzon — sariq (xavf), qimmat — yashil, zararsizlikdan past — qizil.
 */
export function DiffChip({
  diffPct,
  ourPrice,
  belowBreakEven,
  className,
}: {
  diffPct: number | null | undefined;
  ourPrice: number | null | undefined;
  belowBreakEven?: boolean | null;
  className?: string;
}) {
  const t = useT('competitors');
  const f = useFormat();
  if (typeof diffPct !== 'number' || !Number.isFinite(diffPct)) return <span className={cn('text-xs text-muted', className)}>—</span>;
  const abs = f.pct(Math.abs(diffPct));
  const text = diffPct < 0 ? t('diff.cheaper', { v: abs }) : diffPct > 0 ? t('diff.pricier', { v: abs }) : t('diff.same');
  const tone: Tone = belowBreakEven ? 'danger' : diffPct < 0 ? 'warn' : diffPct > 0 ? 'brand' : 'muted';
  return (
    <Badge tone={tone} className={cn('tnum whitespace-nowrap', className)} title={t('diff.hint', { our: money(f, ourPrice) })}>
      {text}
    </Badge>
  );
}

/** Oldingi narxga nisbatan yo'nalish: ↑ oshgan, ↓ tushgan */
export function ChangeMark({ change, prevPrice }: { change: 'up' | 'down' | null | undefined; prevPrice: number | null | undefined }) {
  const t = useT('competitors');
  const f = useFormat();
  if (!change) return null;
  const up = change === 'up';
  return (
    <span
      className={cn('tnum inline-flex cursor-help items-center gap-0.5 whitespace-nowrap text-2xs font-medium', up ? 'text-brand-ink' : 'text-warn-ink')}
      title={`${up ? t('row.up') : t('row.down')} · ${t('row.prev', { v: money(f, prevPrice) })}`}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {typeof prevPrice === 'number' ? f.num(prevPrice) : ''}
    </span>
  );
}

export const POSITION_TONE: Record<CompetitorPosition, Tone> = {
  cheaper: 'brand',
  similar: 'info',
  pricier: 'warn',
};

/** Bizning narx medianaga nisbatan: arzonroq / teng / qimmatroq */
export function PositionBadge({ position, className }: { position: CompetitorPosition | null | undefined; className?: string }) {
  const t = useT('competitors');
  const pct = COMPETITOR_LIMITS.similarPct;
  if (!position) {
    return (
      <Badge tone="muted" className={className} title={t('position.unknownHint')}>
        {t('position.unknown')}
      </Badge>
    );
  }
  return (
    <Badge tone={POSITION_TONE[position]} dot className={className} title={t(`position.${position}Hint`, { pct })}>
      {t(`position.${position}`)}
    </Badge>
  );
}

/** Bizning narx medianadan farqi, ishora bilan: "+10,9%" (qimmat — sariq), "−9,3%" (arzon — yashil) */
export function GapValue({ gapPct, className }: { gapPct: number | null | undefined; className?: string }) {
  const f = useFormat();
  if (typeof gapPct !== 'number' || !Number.isFinite(gapPct)) return <span className={cn('text-muted', className)}>—</span>;
  const sign = gapPct > 0 ? '+' : gapPct < 0 ? '−' : '';
  return (
    <span
      className={cn(
        'tnum font-semibold',
        gapPct >= COMPETITOR_LIMITS.similarPct ? 'text-warn-ink' : gapPct <= -COMPETITOR_LIMITS.similarPct ? 'text-brand-ink' : 'text-ink',
        className,
      )}
    >
      {`${sign}${f.pct(Math.abs(gapPct))}`}
    </span>
  );
}
