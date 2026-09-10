import { Receipt } from 'lucide-react';
import { EXPENSE_CATEGORIES, type DashboardResponse } from '@savdoiq/shared';
import { DonutChart, type DonutDatum } from '@/components/charts';
import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { pickLocalized, useFormat, useLang, useT } from '@/i18n';

const KEYS = ['commission', 'logistics', 'marketing', 'storage', 'tax', 'other'] as const;

/** "Davr xarajatlari" — donut + kategoriyalar ro'yxati */
export function ExpensesCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();
  const lang = useLang();

  const total = data.expenses.total;

  const rows = KEYS.map((id) => {
    const meta = EXPENSE_CATEGORIES.find((c) => c.id === id);
    const amount = data.expenses[id] ?? 0;
    return {
      id,
      label: meta ? pickLocalized(meta.label, lang) : id,
      color: meta?.color ?? '#94a3b8',
      amount,
      share: total > 0 ? (amount / total) * 100 : 0,
    };
  })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const donut: DonutDatum[] = rows.map((r) => ({ name: r.label, value: r.amount, color: r.color }));

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Receipt className="h-4 w-4" />}
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        actions={
          <div className="text-right">
            <p className="text-2xs uppercase tracking-wider text-muted">{t('expenses.total')}</p>
            <p className="tnum font-display text-base font-extrabold text-ink">{f.money(total, data.currency)}</p>
          </div>
        }
      />
      <CardBody className="flex-1 pt-3">
        {rows.length === 0 ? (
          <EmptyState className="py-10" icon={<Receipt className="h-6 w-6" />} title={t('expenses.empty')} hint={t('expenses.emptyHint')} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:items-center">
            <DonutChart
              data={donut}
              height={210}
              innerRadius={56}
              outerRadius={86}
              center={
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted">{t('expenses.total')}</p>
                  <p className="tnum font-display text-sm font-extrabold text-ink">{f.compact(total)}</p>
                </div>
              }
            />
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{r.label}</span>
                  <span className="tnum shrink-0 text-sm font-semibold text-ink">{f.money(r.amount, data.currency)}</span>
                  <span className="tnum w-12 shrink-0 text-right text-xs text-muted">{f.pct(r.share)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
