import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Crown, Rocket, Sparkles } from 'lucide-react';
import { PLANS, PLAN_ORDER, planPrice, pickLocalized, type PlanId } from '@savdoiq/shared';
import { Button, CheckItem, Segmented } from '@/components/ui';
import { useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FadeUp } from './primitives';

type Billing = 'monthly' | 'yearly';

const BULLETS: Record<PlanId, string[]> = {
  trial: ['plan.trial.1', 'plan.trial.2', 'plan.trial.3', 'plan.trial.4'],
  standard: ['plan.standard.1', 'plan.standard.2', 'plan.standard.3', 'plan.standard.4', 'plan.standard.5'],
  vip: ['plan.vip.1', 'plan.vip.2', 'plan.vip.3', 'plan.vip.4', 'plan.vip.5'],
  // 'expired' PLAN_ORDER da yo'q — bu ro'yxat hech qachon o'qilmaydi
  expired: [],
};

const PLAN_ICON: Record<PlanId, typeof Rocket> = {
  trial: Sparkles,
  standard: Rocket,
  vip: Crown,
  expired: Clock,
};

const MAX_DISCOUNT = Math.max(...PLAN_ORDER.map((id) => PLANS[id].yearlyDiscount));

export function LandingPricing() {
  const t = useT('landing');
  const tc = useT('common');
  const f = useFormat();
  const lang = useLang();
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <div>
      <FadeUp className="flex flex-col items-center gap-4">
        <Segmented<Billing>
          options={[
            { value: 'monthly', label: t('pricing.monthly') },
            { value: 'yearly', label: t('pricing.yearly') },
          ]}
          value={billing}
          onChange={setBilling}
        />
        <span className="chip bg-brand/10 text-brand-ink">{t('pricing.save', { pct: MAX_DISCOUNT })}</span>
      </FadeUp>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((id, i) => {
          const plan = PLANS[id];
          const Icon = PLAN_ICON[id];
          const featured = plan.badge === 'popular';
          const yearlyTotal = planPrice(id, 12);
          const perMonth = billing === 'yearly' ? Math.round(yearlyTotal / 12) : plan.price;
          const free = plan.price === 0;
          const discounted = billing === 'yearly' && plan.yearlyDiscount > 0;

          return (
            <FadeUp key={id} delay={i * 0.07} className="h-full">
              <div
                className={cn(
                  'card relative flex h-full flex-col p-6',
                  featured ? 'border-brand/45 shadow-glow' : 'card-hover',
                )}
              >
                {plan.badge ? (
                  <span
                    className={cn(
                      'chip absolute -top-3 left-6 font-bold',
                      featured ? 'bg-brand-grad text-on-brand' : 'bg-violet/15 text-violet-ink ring-1 ring-inset ring-violet/30',
                    )}
                  >
                    {featured ? t('pricing.popular') : t('pricing.best')}
                  </span>
                ) : null}

                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl',
                      featured ? 'bg-brand/[0.12] text-brand-ink' : 'bg-surface-2 text-muted',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-lg font-extrabold tracking-tight text-ink">{tc(`plan.${id}`)}</h3>
                </div>

                <p className="mt-2.5 min-h-[40px] text-sm leading-relaxed text-muted">
                  {pickLocalized(plan.tagline, lang)}
                </p>

                <div className="mt-5">
                  {free ? (
                    <>
                      <p className="font-display text-[32px] font-extrabold leading-none tracking-tight text-ink">
                        {t('pricing.free')}
                      </p>
                      <p className="mt-2 text-xs text-muted">{t('pricing.days', { days: plan.trialDays ?? 7 })}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="tnum font-display text-[32px] font-extrabold leading-none tracking-tight text-ink">
                          {f.compact(perMonth)}
                        </span>
                        <span className="text-sm text-muted">{t('pricing.perMonth')}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        {discounted ? t('pricing.billedYearly', { total: f.money(yearlyTotal) }) : f.money(plan.price)}
                      </p>
                    </>
                  )}
                </div>

                <Link to="/login" className="mt-5 block">
                  <Button className="w-full" variant={featured ? 'primary' : 'outline'}>
                    {free ? t('pricing.ctaTrial') : t('pricing.cta')}
                  </Button>
                </Link>

                <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                  <CheckItem>{t('pricing.stores', { n: plan.limits.stores })}</CheckItem>
                  <CheckItem>
                    {plan.limits.cabinets >= 100
                      ? t('pricing.cabinetsInf')
                      : t('pricing.cabinets', { n: plan.limits.cabinets })}
                  </CheckItem>
                  <CheckItem>{t('pricing.members', { n: plan.limits.members })}</CheckItem>
                  {BULLETS[id].map((k) => (
                    <CheckItem key={k}>{t(k)}</CheckItem>
                  ))}
                </ul>
              </div>
            </FadeUp>
          );
        })}
      </div>

      <FadeUp delay={0.1}>
        <p className="mt-8 text-center text-xs text-muted">{t('pricing.note')}</p>
      </FadeUp>
    </div>
  );
}
