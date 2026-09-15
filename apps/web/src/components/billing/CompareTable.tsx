/**
 * Taqqoslash jadvali: barcha imkoniyatlar × 4 tarif.
 * Birinchi ustun mobilda ham yopishib turadi, jadval o'zi gorizontal siljiydi.
 */

import { Fragment } from 'react';
import type { FeatureAccess, FeatureId, PlanPublic } from '@savdoiq/shared';
import { useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { AccessMark } from './atoms';
import { FEATURE_GROUPS, FEATURE_LABELS } from './features';

export function CompareTable({ plans, currentPlan }: { plans: PlanPublic[]; currentPlan?: string | null }) {
  const t = useT('pricing');
  const f = useFormat();
  const lang = useLang();

  const accessOf = (plan: PlanPublic, id: FeatureId): FeatureAccess =>
    plan.features.find((x) => x.id === id)?.access ?? 'off';

  const limitRows: { key: string; label: string; value: (p: PlanPublic) => string }[] = [
    { key: 'stores', label: t('limit.stores'), value: (p) => f.num(p.limits.stores) },
    {
      key: 'cabinets',
      label: t('limit.cabinets'),
      value: (p) => (p.limits.cabinets >= 100 ? '∞' : f.num(p.limits.cabinets)),
    },
    { key: 'members', label: t('limit.members'), value: (p) => f.num(p.limits.members) },
    { key: 'history', label: t('limit.history'), value: (p) => t('limit.historyValue', { n: p.limits.historyDays }) },
    {
      key: 'sync',
      label: t('limit.sync'),
      value: (p) => t('limit.syncValue', { n: p.limits.syncIntervalMinutes }),
    },
  ];

  const headCell = (p: PlanPublic) => (
    <th
      key={p.id}
      scope="col"
      className={cn(
        'table-head border-b border-line px-3 py-3 text-center',
        p.id === currentPlan && 'text-brand-ink',
      )}
    >
      <span className="block truncate text-xs font-bold normal-case tracking-normal">{p.name}</span>
      <span className="tnum mt-0.5 block text-2xs font-medium normal-case text-muted">
        {p.price === 0 ? t('card.free') : f.compact(p.price)}
      </span>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="table-head sticky left-0 z-20 border-b border-line bg-surface-2 px-4 py-3 text-left"
            >
              {t('compare.feature')}
            </th>
            {plans.map(headCell)}
          </tr>
        </thead>

        <tbody>
          {/* Limitlar */}
          <tr>
            <td
              colSpan={plans.length + 1}
              className="sticky left-0 bg-surface-2/60 px-4 py-2 text-2xs font-bold uppercase tracking-wider text-muted"
            >
              {t('compare.limits')}
            </td>
          </tr>
          {limitRows.map((row) => (
            <tr key={row.key} className="border-b border-line/60">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-sm font-medium text-ink-soft"
              >
                {row.label}
              </th>
              {plans.map((p) => (
                <td key={p.id} className="tnum px-3 py-2.5 text-center text-sm font-semibold text-ink">
                  {row.value(p)}
                </td>
              ))}
            </tr>
          ))}

          {/* Imkoniyatlar guruhlari */}
          {FEATURE_GROUPS.map((group) => (
            <Fragment key={group.id}>
              <tr>
                <td
                  colSpan={plans.length + 1}
                  className="sticky left-0 bg-surface-2/60 px-4 py-2 text-2xs font-bold uppercase tracking-wider text-muted"
                >
                  {group.label[lang]}
                </td>
              </tr>
              {group.items.map((id) => (
                <tr key={id} className="border-b border-line/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left text-sm font-medium text-ink-soft"
                  >
                    {FEATURE_LABELS[id][lang]}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className="px-3 py-2.5 text-center">
                      <AccessMark access={accessOf(p, id)} previewLabel={t('access.preview')} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <AccessMark access="full" previewLabel={t('access.preview')} />
          {t('access.full')}
        </span>
        <span className="flex items-center gap-1.5">
          <AccessMark access="preview" previewLabel={t('access.preview')} />
          {t('access.preview')}
        </span>
        <span className="flex items-center gap-1.5">
          <AccessMark access="off" previewLabel={t('access.preview')} />
          {t('access.off')}
        </span>
      </div>
    </div>
  );
}
