import type { ReactNode } from 'react';
import type { FunnelResponse } from '@savdoiq/shared';
import { Hourglass, Info, TrendingDown } from '@/components/icons';
import { Card, CardBody, CardHeader, Delta } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSeesMoney } from '@/lib/view';
import { FUNNEL_LOSS_NS } from './i18n';
import { tokenColor } from './LossFunnel';

/**
 * "Yo'qotilgan qiymat va foyda" — bekor qilingan va qaytgan donalar
 * (yo'ldagilar kirmaydi). Ikki raqam:
 *  - tushum — sotuv narxi × dona (Uzum bunday satrda amount = 0 beradi);
 *  - foyda — server bahosi (funnel.ts lostProfitOf): shu tovarning davrdagi
 *    bekor qilinmagan va qaytmagan donalaridagi o'rtacha sof foyda ×
 *    yo'qotilgan dona. Baholab bo'lmagan donalar soni ochiq yoziladi —
 *    taxmin o'ylab topilmaydi.
 * O'zgarish teskari ma'noda (kamaysa — yaxshi). Davr hali yakunlanmagan bo'lsa
 * ("Dastlabki") yo'ldagilar bekor bo'lishi yoki qaytishi mumkinligi aytiladi:
 * oldingi davr esa yakuniy holatda, shuning uchun bunday paytda kamayish
 * qisman shundan.
 */
export function LostValueCard({ data, className }: { data: FunnelResponse; className?: string }) {
  const t = useT(FUNNEL_LOSS_NS);
  const f = useFormat();
  const { lost, totals } = data;
  const money = (v: number) => t('money', { v: f.compact(v) });
  const seesMoney = useSeesMoney();

  const profitSub =
    lost.profit === null ? t('lost.profitNone') : lost.profit < 0 ? t('lost.profitNegative') : t('lost.profitSub');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader icon={<TrendingDown />} tone="warn" title={t('lost.title')} subtitle={t('lost.subtitle')} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {lost.units === 0 ? (
          <div className="well px-3.5 py-3">
            <p className="text-sm text-muted">{t('lost.none')}</p>
          </div>
        ) : (
          <>
            <div className={cn('grid gap-3', seesMoney ? 'grid-cols-2' : 'grid-cols-1')}>
              <LostTile
                label={t('lost.revenue')}
                hint={t('lost.revenueHint')}
                value={money(lost.amount)}
                full={f.money(lost.amount, data.currency)}
                sub={lost.share !== null ? t('lost.revenueShare', { v: f.pct(lost.share) }) : null}
                delta={lost.amountDeltaPct}
                prev={lost.prevAmount !== null ? money(lost.prevAmount) : null}
              />
              {/* Pulsiz ko'rinish shablonida (Marketolog) yo'qotilgan foyda null — plitka yo'q */}
              {seesMoney ? (
                <LostTile
                  label={t('lost.profit')}
                  hint={t('lost.profitHint')}
                  value={lost.profit === null ? '—' : money(lost.profit)}
                  full={lost.profit === null ? undefined : f.money(lost.profit, data.currency)}
                  sub={profitSub}
                  delta={lost.profitDeltaPct}
                  prev={lost.prevProfit !== null ? money(lost.prevProfit) : null}
                />
              ) : null}
            </div>

            {/* Tur bo'yicha: qaysi biri ko'proq pul olib ketyapti — sabablar kartasi shu turdan boshlanadi */}
            <div>
              <p className="eyebrow">{t('lost.split')}</p>
              <div aria-hidden className="mt-2 flex h-2 w-full gap-[3px]">
                {totals.canceledAmount > 0 ? (
                  <div
                    className="h-full min-w-[4px] rounded-full"
                    style={{ flex: `${totals.canceledAmount} 1 0%`, background: tokenColor('warn') }}
                  />
                ) : null}
                {totals.returnedAmount > 0 ? (
                  <div
                    className="h-full min-w-[4px] rounded-full"
                    style={{ flex: `${totals.returnedAmount} 1 0%`, background: tokenColor('danger') }}
                  />
                ) : null}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'canceled', amount: totals.canceledAmount, units: totals.canceled, color: tokenColor('warn') },
                    { key: 'returned', amount: totals.returnedAmount, units: totals.returned, color: tokenColor('danger') },
                  ] as const
                ).map((x) => (
                  <div key={x.key} className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} />
                      <span className="truncate">{t(`drop.${x.key}`)}</span>
                    </p>
                    <p className="tnum mt-0.5 truncate text-sm font-semibold text-ink" title={f.money(x.amount, data.currency)}>
                      {money(x.amount)}
                    </p>
                    <p className="tnum text-2xs text-muted">{t('units', { n: f.num(x.units) })}</p>
                  </div>
                ))}
              </div>
            </div>

            {lost.unpricedUnits > 0 && lost.profit !== null ? (
              <Note icon={<Info />}>
                {t('lost.unpriced', { n: f.num(lost.unpricedUnits), v: money(lost.unpricedAmount) })}
              </Note>
            ) : null}
            {totals.preliminary && totals.inTransit > 0 ? (
              <Note icon={<Hourglass />} tone="warn">
                {t('lost.prelim', { n: f.num(totals.inTransit) })}
              </Note>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function LostTile({
  label,
  hint,
  value,
  full,
  sub,
  delta,
  prev,
}: {
  label: string;
  hint: string;
  value: string;
  full?: string;
  sub: string | null;
  delta: number | null;
  prev: string | null;
}) {
  const tc = useT('common');
  return (
    <div className="well flex min-w-0 flex-col p-3" title={hint}>
      <p className="truncate text-xs font-medium leading-4 text-ink-soft">{label}</p>
      <p
        className="tnum mt-1 truncate font-display text-xl font-bold leading-7 tracking-[-0.02em] text-ink"
        title={full}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 line-clamp-2 text-2xs leading-4 text-muted">{sub}</p> : null}
      {/* mt-auto — izoh bir yoki ikki qator bo'lsa ham o'zgarish chipi ikki plitkada bir sathda */}
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2.5">
        <Delta value={delta} invert className="px-2 py-0.5 text-2xs" />
        {prev !== null ? (
          <span className="tnum truncate text-2xs text-muted">{tc('common.prevValue', { v: prev })}</span>
        ) : null}
      </div>
    </div>
  );
}

function Note({ icon, tone, children }: { icon: ReactNode; tone?: 'warn'; children: ReactNode }) {
  return (
    <p className="flex gap-2 text-2xs leading-4 text-muted">
      <span
        aria-hidden
        className={cn('mt-px shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5', tone === 'warn' ? 'text-warn-ink' : 'text-muted')}
      >
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}
