import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import type { FeatureId } from '@savdoiq/shared';
import { useFeature } from '@/store/session';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from './primitives';

/**
 * Tarif cheklovi.
 * - `full`  → bolalar to'liq ko'rinadi
 * - `preview` → mazmun xiralashadi, ustida qulf oynasi (namunaviy ma'lumot bilan)
 * - `off` → mazmun umuman ko'rsatilmaydi
 */
export function PlanGate({
  feature,
  children,
  /** preview holatida ko'rsatiladigan namunaviy mazmun */
  previewChildren,
  title,
  hint,
  className,
  compact,
}: {
  feature: FeatureId;
  children: ReactNode;
  previewChildren?: ReactNode;
  title?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  const access = useFeature(feature);
  const t = useT('common');

  if (access === 'full') return <>{children}</>;

  const content = access === 'preview' ? (previewChildren ?? children) : null;

  return (
    <div className={cn('relative', className)}>
      {content ? (
        <div className="pointer-events-none select-none blur-[6px] saturate-50" aria-hidden>
          {content}
        </div>
      ) : (
        <div className="min-h-[220px]" />
      )}

      <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full max-w-sm rounded-2xl border border-line bg-surface/95 p-6 text-center shadow-pop backdrop-blur',
            compact && 'max-w-xs p-5',
          )}
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand-ink">
            <Lock className="h-5 w-5" />
          </div>
          <p className="font-display text-base font-bold text-ink">{title ?? t('plan.locked')}</p>
          <p className="mt-1.5 text-sm text-muted">{hint ?? t('plan.lockedHint')}</p>
          <Link to="/pricing" className="mt-5 inline-block">
            <Button icon={<Sparkles className="h-4 w-4" />}>{t('btn.upgrade')}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Sarlavha yonida ko'rsatiladigan kichik "namuna rejimi" belgisi */
export function PreviewBadge({ feature }: { feature: FeatureId }) {
  const access = useFeature(feature);
  const t = useT('common');
  if (access === 'full') return null;
  return (
    <span className="chip bg-warn/10 text-warn-ink">
      <Lock className="h-3 w-3" />
      {t('plan.preview')}
    </span>
  );
}
