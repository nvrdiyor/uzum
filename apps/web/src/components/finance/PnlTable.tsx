import { Scale } from 'lucide-react';
import { Card, CardHeader, Delta, EmptyState, SkeletonRows } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { isKnownPnlId, type PnlLine } from './financeData';

/**
 * Foyda va zarar (P&L) jadvali.
 * Har bir modda joriy va oldingi davr bo'yicha, o'zgarish foizi bilan.
 * Yakuniy qator (sof foyda) ajratib ko'rsatiladi.
 */
export function PnlTable({
  lines,
  loading,
  currency,
  periodLabel,
  previousLabel,
}: {
  lines: PnlLine[];
  loading?: boolean;
  currency?: string;
  periodLabel?: string;
  previousLabel?: string;
}) {
  const t = useT('finance');
  const f = useFormat();

  const money = (v: number) => f.money(v, currency ?? 'UZS');
  /** Xarajat qatorida minus belgisi faqat haqiqiy summa bo'lsa qo'yiladi */
  const cost = (v: number) => (v === 0 ? money(0) : `− ${money(Math.abs(v))}`);
  const label = (line: PnlLine) => (isKnownPnlId(line.id) ? t(`pnl.${line.id}`) : line.label);

  return (
    <Card>
      <CardHeader
        icon={<Scale className="h-4 w-4" />}
        title={t('pnl.title')}
        subtitle={t('pnl.subtitle')}
      />

      {loading ? (
        <div className="p-5">
          <SkeletonRows rows={8} />
        </div>
      ) : lines.length === 0 ? (
        <EmptyState icon={<Scale className="h-6 w-6" />} title={t('pnl.empty')} hint={t('pnl.emptyHint')} />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="table-head border-b border-line px-4 py-3 text-left">{t('pnl.col.item')}</th>
                <th className="table-head border-b border-line px-4 py-3 text-right">
                  {periodLabel ?? t('pnl.col.current')}
                </th>
                <th className="table-head border-b border-line px-4 py-3 text-right">
                  {previousLabel ?? t('pnl.col.previous')}
                </th>
                <th className="table-head border-b border-line px-4 py-3 text-right">{t('pnl.col.delta')}</th>
                <th className="table-head hidden border-b border-line px-4 py-3 text-right md:table-cell">
                  {t('pnl.col.share')}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isTotal = line.kind === 'total';
                const isSubtotal = line.kind === 'subtotal';
                const isCost = line.kind === 'cost';
                const negative = line.current < 0;

                return (
                  <tr
                    key={line.id}
                    className={cn(
                      'border-b border-line/60 last:border-0',
                      isTotal
                        ? 'border-t border-line-strong bg-surface-2/70 font-bold text-ink'
                        : isSubtotal
                          ? 'border-t border-line bg-surface-2/35 font-semibold text-ink'
                          : 'text-ink-soft',
                    )}
                  >
                    <td
                      className={cn(
                        'px-4 py-3',
                        isTotal ? 'font-display text-base font-extrabold' : isSubtotal ? 'font-display' : '',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            isTotal ? 'bg-brand' : isSubtotal ? 'bg-violet' : isCost ? 'bg-danger/60' : 'bg-info/70',
                          )}
                        />
                        {label(line)}
                      </span>
                    </td>

                    <td
                      className={cn(
                        'tnum px-4 py-3 text-right',
                        isCost || negative ? 'text-danger' : 'text-ink',
                        isTotal && 'font-display text-base font-extrabold',
                        isSubtotal && 'font-display font-bold',
                      )}
                    >
                      {isCost ? cost(line.current) : money(line.current)}
                    </td>

                    <td className={cn('tnum px-4 py-3 text-right text-muted')}>
                      {isCost ? cost(line.previous) : money(line.previous)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex justify-end">
                        <Delta value={line.deltaPct} invert={isCost} />
                      </span>
                    </td>

                    <td className="tnum hidden px-4 py-3 text-right text-muted md:table-cell">
                      {line.share > 0 ? f.pct(line.share) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
