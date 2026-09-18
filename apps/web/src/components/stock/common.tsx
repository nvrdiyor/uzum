import type { ReactNode } from 'react';
import { Badge, ProgressBar, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Qoldiq holati — `packages/shared` dagi StockRow.status bilan bir xil */
export type StockState = 'critical' | 'low' | 'ok' | 'excess' | 'dead';

export const STOCK_STATES: StockState[] = ['critical', 'low', 'ok', 'excess', 'dead'];

export const STATE_TONE: Record<StockState, Tone> = {
  critical: 'danger',
  low: 'warn',
  ok: 'brand',
  excess: 'info',
  dead: 'muted',
};

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand-ink',
  info: 'text-info',
  warn: 'text-warn-ink',
  danger: 'text-danger',
  muted: 'text-muted',
  violet: 'text-violet',
};

/** Rangli holat belgisi (Kritik / Tugayapti / Yetarli / Ortiqcha / Harakatsiz) */
export function StockStatusBadge({ status }: { status: StockState }) {
  const t = useT('common');
  return (
    <Badge tone={STATE_TONE[status]} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Necha kunga yetishiga qarab rang */
export function daysTone(days: number | null | undefined): Tone {
  if (days === null || days === undefined || !Number.isFinite(days)) return 'muted';
  if (days <= 7) return 'danger';
  if (days <= 14) return 'warn';
  if (days <= 90) return 'brand';
  return 'info';
}

/**
 * "Necha kunga yetadi" — raqam + rangli progress.
 * 60 kun to'liq shkala deb olinadi, undan ortig'i 100% ko'rinadi.
 */
export function DaysLeftCell({ days, width = 128 }: { days: number | null | undefined; width?: number }) {
  const t = useT('common');
  const f = useFormat();

  if (days === null || days === undefined || !Number.isFinite(days)) {
    return <span className="text-muted">—</span>;
  }

  const tone = daysTone(days);
  const pct = Math.min(100, Math.max(2, (days / 60) * 100));

  return (
    <div className="ml-auto" style={{ width }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={cn('tnum text-xs font-semibold', TONE_TEXT[tone])}>
          {days > 999 ? '999+' : f.num(Math.round(days))}
        </span>
        <span className="text-2xs text-muted">{t('common.days')}</span>
      </div>
      <ProgressBar value={pct} tone={tone} />
    </div>
  );
}

/** Kichik "yorliq → qiymat" juftligi (drawer/kartochkalar ichida) */
export function MetaRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn('tnum text-sm font-semibold', tone ? TONE_TEXT[tone] : 'text-ink')}>{value}</span>
    </div>
  );
}

/**
 * FBO / FBS / o'z ombori taqqoslash kartochkasi:
 * dona, summa va umumiy qoldiqdagi ulush chizig'i.
 */
export function SchemeShareCard({
  icon,
  title,
  hint,
  units,
  amount,
  share,
  tone = 'brand',
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  units: number;
  amount: number;
  share: number;
  tone?: Tone;
}) {
  const f = useFormat();
  const t = useT('common');

  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate eyebrow-lg">{title}</p>
          <p className="tnum mt-2 font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink">
            {f.num(units)} <span className="text-base font-bold text-muted">{t('common.units')}</span>
          </p>
          <p className="tnum mt-1 text-sm text-ink-soft">{f.money(amount)}</p>
        </div>
        {icon ? (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              tone === 'brand' && 'bg-brand/10 text-brand-ink',
              tone === 'info' && 'bg-info/10 text-info-ink',
              tone === 'violet' && 'bg-violet/10 text-violet-ink',
              tone === 'warn' && 'bg-warn/10 text-warn-ink',
              tone === 'danger' && 'bg-danger/10 text-danger-ink',
              tone === 'muted' && 'bg-surface-3 text-muted',
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{hint ?? t('common.share')}</span>
          <span className={cn('tnum font-semibold', TONE_TEXT[tone])}>{f.pct(share)}</span>
        </div>
        <ProgressBar value={share} tone={tone} />
      </div>
    </div>
  );
}
