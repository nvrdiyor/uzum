import { useMemo } from 'react';
import { EXPENSE_CATEGORIES, deltaPct, type ExpenseCategory } from '@savdoiq/shared';
import { PieChart } from '@/components/icons';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { DonutChart, type DonutDatum } from '@/components/charts';
import { pickLocalized, useFormat, useLang, useT } from '@/i18n';
import { COST_COLORS } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { categoryColor } from './financeData';

interface SplitRow {
  key: string;
  label: string;
  amount: number;
  color: string;
  previous: number | null;
}

/**
 * "Tushum qayerga ketdi" — tannarx, har bir xarajat moddasi va sizga
 * qolgan sof foyda; yig'indisi tushumga teng (tushum = tannarx + jami
 * xarajat + sof foyda — server hisobining o'zi, yangi hisob yo'q).
 *
 * Ilgari bu yerda faqat xarajatlar donuti turardi: tannarx kirmasdi va
 * ulushlar xarajatlar yig'indisiga nisbatan edi — "Ombor 40,7%" ko'rgan
 * sotuvchi tushumining 40% i saqlashga ketdi deb o'ylardi. Endi har qator
 * TUSHUMGA nisbatan va oxirida "Sizga qoldi" — donut boshqaruv panelidagi
 * pul oqimi bilan bir tilda gapiradi.
 */
export function RevenueSplitCard({
  revenue,
  cogs,
  expenses,
  profit,
  previous,
  loading,
  className,
}: {
  revenue: number;
  cogs: number;
  expenses: { category: ExpenseCategory; amount: number }[];
  /** Sof foyda (barcha xarajatdan keyin) */
  profit: number;
  /** Oldingi davr summalari: 'cogs' yoki kategoriya kaliti bo'yicha (P&L'dan) */
  previous: Partial<Record<string, number>>;
  loading?: boolean;
  className?: string;
}) {
  const t = useT('finance');
  const f = useFormat();
  const lang = useLang();

  const rows: SplitRow[] = useMemo(() => {
    const labelOf = (id: ExpenseCategory) => {
      const meta = EXPENSE_CATEGORIES.find((c) => c.id === id);
      return meta ? pickLocalized(meta.label, lang) : id;
    };
    return [
      { key: 'cogs', label: t('exp.cogs'), amount: cogs, color: COST_COLORS.cogs, previous: previous.cogs ?? null },
      ...expenses.map((e) => ({
        key: e.category,
        label: labelOf(e.category),
        amount: e.amount,
        color: categoryColor(e.category),
        previous: previous[e.category] ?? null,
      })),
    ]
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [cogs, expenses, previous, lang, t]);

  const costs = rows.reduce((s, r) => s + r.amount, 0);
  const kept = Math.max(0, profit);
  const loss = profit < 0;
  /*
   * Ulush serverdagi `pct` kabi ikki xonagacha yaxlitlanadi, keyin bitta
   * xonada chiqadi — yonidagi P&L jadvali bilan bir xil son bo'lsin
   * (aks holda 13,25% bir joyda "13,3%", boshqasida "13,2%" bo'lardi).
   */
  const share = (v: number) => (revenue > 0 ? Math.round((v / revenue) * 10_000) / 100 : 0);

  const donut: DonutDatum[] = [
    ...rows.map((r) => ({ name: r.label, value: r.amount, color: r.color })),
    ...(kept > 0 ? [{ name: t('exp.profit'), value: kept, color: COST_COLORS.profit }] : []),
  ];

  /** Sichqoncha olib borilganda: oldingi davr summasi va o'zgarish */
  const prevTitle = (r: SplitRow) => {
    if (r.previous === null) return undefined;
    const d = deltaPct(r.amount, r.previous);
    return `${t('exp.prev', { v: f.money(r.previous) })}${d === null ? '' : ` (${d > 0 ? '+' : ''}${f.num(d, 1)}%)`}`;
  };

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader icon={<PieChart className="h-4 w-4" />} title={t('exp.title')} subtitle={t('exp.subtitle')} />
      <CardBody className="flex flex-1 flex-col">
        {loading ? (
          <Skeleton className="h-[420px] w-full" />
        ) : rows.length === 0 && kept === 0 ? (
          <EmptyState
            className="py-10"
            icon={<PieChart className="h-6 w-6" />}
            title={t('exp.empty')}
            hint={t('exp.emptyHint')}
          />
        ) : (
          // Keng ekranda (xl) kartochka tor ustunda — donut tepada, ro'yxat ostida;
          // planshetda kartochka butun kenglikda — yonma-yon
          <div className="grid flex-1 items-center gap-5 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-1 xl:items-start">
            <DonutChart
              data={donut}
              height={200}
              innerRadius={62}
              outerRadius={90}
              center={
                <div>
                  <p className="eyebrow">{loss ? t('exp.loss') : t('exp.profit')}</p>
                  <p
                    className={cn(
                      'tnum font-display text-lg font-extrabold leading-tight',
                      loss ? 'text-danger' : 'text-brand-ink',
                    )}
                  >
                    {f.pct(share(profit))}
                  </p>
                  <p className="text-2xs text-muted">{t('exp.ofRevenue')}</p>
                </div>
              }
            />

            <div className="min-w-0">
              <ul className="space-y-2.5">
                {rows.map((r) => (
                  <li key={r.key} title={prevTitle(r)}>
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={r.label}>
                        {r.label}
                      </span>
                      <span className="tnum shrink-0 whitespace-nowrap text-sm font-semibold text-ink">
                        {f.money(r.amount)}
                      </span>
                      <span className="tnum w-12 shrink-0 text-right text-xs text-muted">{f.pct(share(r.amount))}</span>
                    </div>
                    <div className="ml-5 mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, share(r.amount))}%`, background: r.color }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Sizga qoldi (yoki zarar) — tushumning qolgan qismi */}
              <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: loss ? 'rgb(var(--c-danger))' : COST_COLORS.profit }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {loss ? t('exp.loss') : t('exp.profit')}
                </span>
                <span
                  className={cn(
                    'tnum shrink-0 whitespace-nowrap text-sm font-bold',
                    loss ? 'text-danger' : 'text-brand-ink',
                  )}
                >
                  {f.money(profit)}
                </span>
                <span className="tnum w-12 shrink-0 text-right text-xs font-semibold text-muted">
                  {f.pct(share(profit))}
                </span>
              </div>
              <p className="tnum mt-2 text-2xs text-muted">
                {t('exp.totalLine', { v: f.money(costs), p: f.pct(share(costs)) })}
              </p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
