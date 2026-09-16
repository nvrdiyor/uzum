/**
 * Tarif sahifasining kichik qurilish bloklari.
 */

import type { ReactNode } from 'react';
import { Check, Crown, Eye, Minus, Rocket, Sparkles } from 'lucide-react';
import type { FeatureAccess, PlanId } from '@savdoiq/shared';
import { cn } from '@/lib/utils';

export const PLAN_ICON: Record<PlanId, typeof Sparkles> = {
  trial: Sparkles,
  standard: Rocket,
  vip: Crown,
};

/** Taqqoslash jadvalidagi bitta katak belgisi */
export function AccessMark({ access, previewLabel }: { access: FeatureAccess; previewLabel: string }) {
  if (access === 'full') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/[0.12] text-brand-ink">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (access === 'preview') {
    return (
      <span
        title={previewLabel}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-warn/[0.14] text-warn-ink"
      >
        <Eye className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-muted">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Kartadagi imkoniyat qatori:
 * full → mint belgi, preview → ko'z ikonkasi ("faqat ko'rish"), off → xira.
 */
export function FeatureLine({
  access,
  children,
  previewLabel,
}: {
  access: FeatureAccess;
  children: ReactNode;
  previewLabel: string;
}) {
  return (
    <li className={cn('flex items-start gap-2.5 text-sm', access === 'off' && 'opacity-45')}>
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          access === 'full' && 'bg-brand/15 text-brand-ink',
          access === 'preview' && 'bg-warn/15 text-warn-ink',
          access === 'off' && 'bg-surface-3 text-muted',
        )}
      >
        {access === 'full' ? (
          <Check className="h-3 w-3" />
        ) : access === 'preview' ? (
          <Eye className="h-2.5 w-2.5" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
      </span>
      <span className={cn('min-w-0', access === 'off' ? 'text-muted line-through decoration-1' : 'text-ink-soft')}>
        {children}
        {access === 'preview' ? (
          <span className="ml-1.5 whitespace-nowrap text-2xs font-semibold text-warn-ink">· {previewLabel}</span>
        ) : null}
      </span>
    </li>
  );
}

/** Limitdan foydalanish chizig'i: "Do'kon 2 / 3" */
export function LimitBar({
  label,
  used,
  limit,
  icon,
}: {
  label: ReactNode;
  used: number;
  limit: number;
  icon?: ReactNode;
}) {
  const unlimited = limit >= 100;
  const pct = unlimited ? Math.min(100, used * 4) : limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = !unlimited && pct >= 100 ? 'bg-danger' : !unlimited && pct >= 75 ? 'bg-warn' : 'bg-brand';

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted">
          {icon}
          {label}
        </span>
        <span className="tnum shrink-0 text-xs font-semibold text-ink">
          {used} <span className="text-muted">/ {unlimited ? '∞' : limit}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-spring', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Kartadagi bitta limit satri (do'kon / kabinet / jamoa / tarix) */
export function LimitRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="truncate text-xs text-muted">{label}</span>
      <span className="tnum shrink-0 text-xs font-semibold text-ink">{value}</span>
    </div>
  );
}
