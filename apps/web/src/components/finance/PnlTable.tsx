import { useMemo } from 'react';
import { Scale } from '@/components/icons';
import { Card, CardHeader, Delta, EmptyState, SkeletonRows } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { CHART_COLORS, COST_COLORS } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { isKnownPnlId, PNL_LINE_COLOR as LINE_COLOR, SUBTOTAL_FILL, type PnlLine } from './financeData';

/*
 * Har bir modda rangi — COST_COLORS bilan bir xil (yonidagi "Tushum qayerga
 * ketdi" va Unit-iqtisod chiziqlari bilan). Ilgari har xarajat qatori bir
 * xil qizil nuqta va QIZIL summa bilan chiqardi — butun jadval "zarar"
 * bo'lib o'qilardi. Endi qizil faqat haqiqiy zararda (manfiy natija).
 * Xarita financeData.ts da — yuqoridagi pul oqimi grafigi ham o'shandan oladi.
 */

interface Span {
  from: number;
  to: number;
}

/**
 * Sharshara: har qator tushumning qaysi oralig'ini egallaydi.
 *
 * Xarajat qatori qolgan summaning o'ng chetidan "tishlab" oladi, oraliq
 * natija esa noldan boshlanadi — qator-qator o'qilganda tushum sof
 * foydagacha qanday erib borishi bir qarashda ko'rinadi (SellerMan'dagi
 * "От выручки к чистой прибыли"), lekin bizda yonida oldingi davr va
 * o'zgarish ham turadi. Hisob yangi emas — P&L qatorlarining o'zi.
 */
function waterfall(lines: PnlLine[]): { spans: Map<string, Span>; lo: number; hi: number } {
  const spans = new Map<string, Span>();
  let run = 0;
  for (const l of lines) {
    if (l.kind === 'income') {
      spans.set(l.id, { from: Math.min(0, l.current), to: Math.max(0, l.current) });
      run = l.current;
    } else if (l.kind === 'cost') {
      const c = Math.abs(l.current);
      spans.set(l.id, { from: run - c, to: run });
      run -= c;
    } else {
      spans.set(l.id, { from: Math.min(0, l.current), to: Math.max(0, l.current) });
      run = l.current;
    }
  }
  const edges = [...spans.values()].flatMap((s) => [s.from, s.to]);
  return { spans, lo: Math.min(0, ...edges), hi: Math.max(0, ...edges) };
}

/**
 * Foyda va zarar (P&L) jadvali.
 * Har bir modda joriy va oldingi davr bo'yicha, o'zgarish foizi va tushumdagi
 * o'rni (sharshara chizig'i) bilan. Yakuniy qator (sof foyda) ajratib ko'rsatiladi.
 */
export function PnlTable({
  lines,
  loading,
  currency,
  periodLabel,
  previousLabel,
  className,
}: {
  lines: PnlLine[];
  loading?: boolean;
  currency?: string;
  periodLabel?: string;
  previousLabel?: string;
  className?: string;
}) {
  const t = useT('finance');
  const tc = useT('common');
  const f = useFormat();

  const money = (v: number) => f.money(v, currency ?? 'UZS');
  /** Xarajat qatorida minus belgisi faqat haqiqiy summa bo'lsa qo'yiladi */
  const cost = (v: number) => (v === 0 ? money(0) : `− ${money(Math.abs(v))}`);
  const label = (line: PnlLine) => (isKnownPnlId(line.id) ? t(`pnl.${line.id}`) : line.label);

  const flow = useMemo(() => waterfall(lines), [lines]);
  const range = flow.hi - flow.lo;
  // Oldingi davr tarixdan tashqarida (server previous: null) — sarlavha "taqqoslab" demasin
  const comparable = lines.length === 0 || lines.some((l) => l.previous !== null);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<Scale className="h-4 w-4" />}
        title={t('pnl.title')}
        subtitle={t(comparable ? 'pnl.subtitle' : 'pnl.subtitleNoCompare')}
      />

      {loading ? (
        <div className="p-5">
          <SkeletonRows rows={8} />
        </div>
      ) : lines.length === 0 ? (
        <EmptyState icon={<Scale className="h-6 w-6" />} title={t('pnl.empty')} hint={t('pnl.emptyHint')} />
      ) : (
        <div className="mt-4 overflow-x-auto">
          {/*
            Telefonda: modda, joriy davr va o'zgarish. "Oldingi davr" ustuni
            1280–1535 px oralig'ida yashiriladi — u yerda jadval sahifaning
            uchdan ikkisida turadi va besh ustun sig'masdi; oldingi summa
            joriy summa ostida kichik qatorda chiqadi.
          */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="table-head border-b border-line px-2 py-3 text-left sm:px-4">{t('pnl.col.item')}</th>
                <th className="table-head border-b border-line px-2 py-3 text-right sm:px-4">
                  {periodLabel ?? t('pnl.col.current')}
                </th>
                <th className="table-head hidden border-b border-line px-2 py-3 text-right sm:table-cell sm:px-4 xl:hidden 2xl:table-cell">
                  {previousLabel ?? t('pnl.col.previous')}
                </th>
                <th className="table-head border-b border-line px-2 py-3 text-right sm:px-4">{t('pnl.col.delta')}</th>
                <th className="table-head hidden border-b border-line px-2 py-3 text-left sm:px-4 md:table-cell">
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
                const span = flow.spans.get(line.id);
                const fill = isTotal
                  ? negative
                    ? CHART_COLORS.danger
                    : COST_COLORS.profit
                  : isSubtotal
                    ? negative
                      ? CHART_COLORS.danger
                      : SUBTOTAL_FILL
                    : (LINE_COLOR[line.id] ?? COST_COLORS.other);

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
                        'px-2 py-2.5 sm:px-4',
                        isTotal ? 'font-display text-sm font-extrabold sm:text-base' : isSubtotal ? 'font-display' : '',
                      )}
                    >
                      <span className="flex items-center gap-2 sm:gap-2.5">
                        <span
                          className={cn('shrink-0 rounded-full', isTotal || isSubtotal ? 'h-2.5 w-2.5' : 'h-2 w-2')}
                          style={{ background: fill }}
                        />
                        {label(line)}
                      </span>
                    </td>

                    <td
                      className={cn(
                        'tnum whitespace-nowrap px-2 py-2.5 text-right sm:px-4',
                        negative && !isCost
                          ? 'text-danger'
                          : isTotal
                            ? 'text-brand-ink'
                            : isCost
                              ? 'text-ink-soft'
                              : 'text-ink',
                        isTotal && 'font-display text-sm font-extrabold sm:text-base',
                        isSubtotal && 'font-display font-bold',
                      )}
                    >
                      {isCost ? cost(line.current) : money(line.current)}
                      {/* Oldingi davr ustuni yashirilgan oraliqda (xl) — summa ostida; taqqoslab bo'lmasa yozilmaydi */}
                      {line.previous !== null ? (
                        <span className="hidden text-2xs font-normal text-muted xl:block 2xl:hidden">
                          {tc('common.prevValue', { v: isCost ? cost(line.previous) : money(line.previous) })}
                        </span>
                      ) : null}
                    </td>

                    <td
                      className="tnum hidden whitespace-nowrap px-2 py-2.5 text-right text-muted sm:table-cell sm:px-4 xl:hidden 2xl:table-cell"
                      // Oldingi davr saqlangan tarixdan tashqarida — "0 so'm" emas, tire (sababi izohda)
                      title={line.previous === null ? tc('common.noCompare') : undefined}
                    >
                      {line.previous === null ? '—' : isCost ? cost(line.previous) : money(line.previous)}
                    </td>

                    <td className="px-2 py-2.5 text-right sm:px-4">
                      <span className="inline-flex justify-end">
                        <Delta value={line.deltaPct} invert={isCost} className="max-sm:px-1.5 max-sm:text-[11px]" />
                      </span>
                    </td>

                    <td className="hidden px-2 py-2.5 sm:px-4 md:table-cell">
                      <span className="flex items-center gap-3">
                        <span className="relative h-2 w-24 shrink-0 rounded-full bg-surface-3/70 lg:w-28" aria-hidden>
                          {span && range > 0 ? (
                            <span
                              className="absolute inset-y-0 rounded-full"
                              style={{
                                left: `${((span.from - flow.lo) / range) * 100}%`,
                                // Juda kichik modda ham ko'rinsin — kamida 3 px
                                width: `max(3px, ${((span.to - span.from) / range) * 100}%)`,
                                background: fill,
                              }}
                            />
                          ) : null}
                        </span>
                        <span className="tnum w-12 shrink-0 text-right text-xs font-normal text-muted">
                          {line.share !== 0 ? f.pct(line.share) : '—'}
                        </span>
                      </span>
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
