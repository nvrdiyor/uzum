/**
 * Bitta tarif kartasi — Pricing sahifasining asosiy sotuv elementi.
 */

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { planPrice, type FeatureAccess, type FeatureId, type PlanPublic } from '@savdoiq/shared';
import { Button } from '@/components/ui';
import { useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FEATURE_LABELS, CARD_FEATURES } from './features';
import { FeatureLine, LimitRow, PLAN_ICON } from './atoms';

export type BillingCycle = 'monthly' | 'yearly';

export function PlanCard({
  plan,
  cycle,
  isCurrent,
  index,
  onChoose,
}: {
  plan: PlanPublic;
  cycle: BillingCycle;
  isCurrent: boolean;
  index: number;
  onChoose: (plan: PlanPublic) => void;
}) {
  const t = useT('pricing');
  const f = useFormat();
  const lang = useLang();

  const Icon = PLAN_ICON[plan.id];
  const free = plan.price === 0;
  const yearlyTotal = planPrice(plan.id, 12);
  const perMonth = cycle === 'yearly' ? Math.round(yearlyTotal / 12) : plan.price;
  const discounted = cycle === 'yearly' && plan.yearlyDiscount > 0;
  const featured = plan.badge === 'popular';
  const best = plan.badge === 'best';

  const accessOf = (id: FeatureId): FeatureAccess => plan.features.find((x) => x.id === id)?.access ?? 'off';
  const labelOf = (id: FeatureId): string =>
    FEATURE_LABELS[id]?.[lang] ?? plan.features.find((x) => x.id === id)?.label ?? id;

  const cabinets = plan.limits.cabinets >= 100 ? '∞' : f.num(plan.limits.cabinets);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      <div
        className={cn(
          'card relative flex h-full flex-col p-6 transition-all duration-300 ease-spring',
          isCurrent
            ? 'border-brand/55 shadow-glow'
            : featured
              ? 'border-brand/40 shadow-glow hover:-translate-y-1'
              : 'card-hover hover:-translate-y-1',
        )}
      >
        {plan.badge ? (
          <span
            className={cn(
              'chip absolute -top-3 left-6 font-bold shadow-card',
              featured
                ? 'bg-brand-grad text-white'
                : 'bg-violet/15 text-violet ring-1 ring-inset ring-violet/30',
            )}
          >
            {featured ? t('badge.popular') : t('badge.best')}
          </span>
        ) : null}

        {isCurrent ? (
          <span className="chip absolute -top-3 right-6 bg-surface font-bold text-brand ring-1 ring-inset ring-brand/40">
            <Check className="h-3 w-3" />
            {t('card.current')}
          </span>
        ) : null}

        {/* Sarlavha */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              featured || best || isCurrent ? 'bg-brand/[0.12] text-brand' : 'bg-surface-2 text-muted',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{plan.name}</h3>
        </div>

        <p className="mt-2.5 min-h-[40px] text-sm leading-relaxed text-muted">{plan.tagline}</p>

        {/* Narx */}
        <div className="mt-5 min-h-[86px]">
          {free ? (
            <>
              <p className="font-display text-[34px] font-extrabold leading-none tracking-tight text-ink">
                {t('card.free')}
              </p>
              <p className="mt-2.5 text-xs text-muted">{t('card.trialDays', { days: plan.trialDays ?? 7 })}</p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="tnum font-display text-[34px] font-extrabold leading-none tracking-tight text-ink">
                  {f.num(perMonth)}
                </span>
                <span className="text-sm font-medium text-muted">{t('card.perMonth')}</span>
              </div>
              {discounted ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="tnum text-xs text-muted line-through">{f.num(plan.price)}</span>
                  <span className="chip bg-brand/[0.12] py-0.5 text-2xs font-bold text-brand">
                    −{plan.yearlyDiscount}%
                  </span>
                  <span className="tnum text-2xs text-muted">
                    {t('card.billedYearly', { total: f.money(yearlyTotal) })}
                  </span>
                </div>
              ) : (
                <p className="mt-2.5 text-xs text-muted">{t('card.monthlyNote')}</p>
              )}
            </>
          )}
        </div>

        {/* Tugma */}
        <Button
          className="mt-5 w-full"
          size="lg"
          variant={isCurrent ? 'outline' : featured || best ? 'primary' : 'outline'}
          disabled={isCurrent || free}
          onClick={() => onChoose(plan)}
        >
          {isCurrent ? t('card.currentBtn') : free ? t('card.trialOnly') : t('card.chooseBtn')}
        </Button>

        {/* Limitlar */}
        <div className="mt-5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
          <LimitRow label={t('limit.stores')} value={f.num(plan.limits.stores)} />
          <LimitRow label={t('limit.cabinets')} value={cabinets} />
          <LimitRow label={t('limit.members')} value={f.num(plan.limits.members)} />
          <LimitRow label={t('limit.history')} value={t('limit.historyValue', { n: plan.limits.historyDays })} />
        </div>

        {/* Imkoniyatlar */}
        <ul className="mt-5 space-y-2.5 border-t border-line pt-5">
          {CARD_FEATURES.map((id) => (
            <FeatureLine key={id} access={accessOf(id)} previewLabel={t('access.preview')}>
              {labelOf(id)}
            </FeatureLine>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
