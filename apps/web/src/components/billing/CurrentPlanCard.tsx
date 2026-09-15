/**
 * Joriy tarif kartasi: holat, tugash sanasi, qolgan kunlar va limitlardan foydalanish.
 */

import type { ReactNode } from 'react';
import { Building2, CalendarClock, Store, Users } from 'lucide-react';
import type { MeResponse, SubscriptionSummary } from '@savdoiq/shared';
import { Badge, ProgressBar, Skeleton, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { LimitBar, PLAN_ICON } from './atoms';

const STATUS_TONE: Record<SubscriptionSummary['status'], Tone> = {
  active: 'brand',
  pending: 'warn',
  expired: 'danger',
  canceled: 'muted',
};

function daysBetween(a: string, b: string): number {
  const from = new Date(a).getTime();
  const to = new Date(b).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

export function CurrentPlanCard({
  subscription,
  planName,
  limits,
  loading,
  actions,
}: {
  subscription: SubscriptionSummary | null;
  planName: string;
  limits: MeResponse['limits'] | null;
  loading?: boolean;
  actions?: ReactNode;
}) {
  const t = useT('pricing');
  const f = useFormat();

  if (loading) {
    return (
      <div className="card bg-aurora p-5 sm:p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-4 h-3 w-full" />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const Icon = PLAN_ICON[subscription?.plan ?? 'trial'];
  const total = subscription ? daysBetween(subscription.startedAt, subscription.expiresAt) : 0;
  const left = Math.max(0, subscription?.daysLeft ?? 0);
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const tone: Tone = left <= 3 ? 'danger' : left <= 7 ? 'warn' : 'brand';
  const expired = subscription?.status === 'expired' || left === 0;

  return (
    <div className="card overflow-hidden bg-aurora p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-on-brand shadow-[0_8px_24px_-10px_rgb(var(--c-brand)/0.9)]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">{t('current.eyebrow')}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">{planName}</h2>
              {subscription ? (
                <Badge tone={STATUS_TONE[subscription.status]} dot>
                  {t(`status.${subscription.status}`)}
                </Badge>
              ) : null}
              {subscription?.isTrial ? <Badge tone="violet">{t('current.trial')}</Badge> : null}
            </div>
            {subscription ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                {expired
                  ? t('current.expiredAt', { date: f.date(subscription.expiresAt) })
                  : t('current.until', { date: f.date(subscription.expiresAt) })}
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted">{t('current.none')}</p>
            )}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {/* Qolgan kunlar */}
      {subscription ? (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-muted">{t('current.daysLeft')}</span>
            <span
              className={cn(
                'tnum font-display text-sm font-extrabold',
                tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn-ink' : 'text-brand-ink',
              )}
            >
              {t('current.daysValue', { n: left })}
            </span>
          </div>
          <ProgressBar value={pct} tone={tone} className="mt-2" />
        </div>
      ) : null}

      {/* Limitlar */}
      {limits ? (
        <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
          <LimitBar
            label={t('limit.stores')}
            used={limits.used.stores}
            limit={limits.stores}
            icon={<Store className="h-3.5 w-3.5" />}
          />
          <LimitBar
            label={t('limit.cabinets')}
            used={limits.used.cabinets}
            limit={limits.cabinets}
            icon={<Building2 className="h-3.5 w-3.5" />}
          />
          <LimitBar
            label={t('limit.members')}
            used={limits.used.members}
            limit={limits.members}
            icon={<Users className="h-3.5 w-3.5" />}
          />
        </div>
      ) : null}
    </div>
  );
}
