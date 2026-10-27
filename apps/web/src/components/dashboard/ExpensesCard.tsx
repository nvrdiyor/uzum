import { Receipt } from '@/components/icons';
import { EXPENSE_CATEGORIES, type DashboardResponse } from '@savdoiq/shared';
import { DonutChart, type DonutDatum } from '@/components/charts';
import { Amount, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { pickLocalized, useFormat, useLang, useT } from '@/i18n';
import { COST_COLORS } from '@/lib/theme';
import { cn } from '@/lib/utils';

const KEYS = ['commission', 'logistics', 'marketing', 'storage', 'tax', 'other'] as const;

/**
 * Xarajat turi rangi — butun ilovada bir xil (lib/theme COST_COLORS).
 * Ilgari rang EXPENSE_CATEGORIES dagi HEX dan olinardi: komissiya qizil
 * ("zarar" deb o'qilardi), soliq esa foyda bilan bir xil yashil edi.
 */
const COLOR: Record<(typeof KEYS)[number], string> = {
  commission: COST_COLORS.commission,
  logistics: COST_COLORS.logistics,
  marketing: COST_COLORS.marketing,
  storage: COST_COLORS.storage,
  tax: COST_COLORS.tax,
  other: COST_COLORS.other,
};

/**
 * "Davr xarajatlari" — donut + kategoriyalar ro'yxati.
 *
 * Ro'yxat qatori bitta satr: nom, ulush chizig'i, foiz, summa — ro'yxat
 * balandligi donutga teng. Ilgari nom va summa ikki qavat bo'lib, tor
 * ustunda turardi: kartochka cho'zilib, yonidagi Do'konlar ostida katta bo'sh
 * joy qolardi. `wide` — yonida Do'konlar kartochkasi yo'q (bitta do'kon):
 * kategoriyalar plitkalarga yoyiladi.
 */
export function ExpensesCard({
  data,
  wide,
  className,
}: {
  data: DashboardResponse;
  wide?: boolean;
  className?: string;
}) {
  const t = useT('dashboard');
  const f = useFormat();
  const lang = useLang();

  // Pulsiz ko'rinish shablonida soliq, o'z xarajatlari va jami null keladi (views.ts) —
  // ulush ko'rinib turgan qatorlar yig'indisidan, jami esa "—"
  const total = data.expenses.total;
  const visibleSum = KEYS.reduce((s, id) => s + Math.max(0, data.expenses[id] ?? 0), 0);
  const base = total ?? visibleSum;

  const rows = KEYS.map((id) => {
    const meta = EXPENSE_CATEGORIES.find((c) => c.id === id);
    const amount = data.expenses[id] ?? 0;
    return {
      id,
      label: meta ? pickLocalized(meta.label, lang) : id,
      color: COLOR[id],
      amount,
      share: base > 0 ? (amount / base) * 100 : 0,
    };
  })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const donut: DonutDatum[] = rows.map((r) => ({ name: r.label, value: r.amount, color: r.color }));

  return (
    <Card className={cn('flex flex-col', className)}>
      {/* Binafsha — xarajatning katta qismi Uzum ushlagan pul (MoneyFlow'dagi "Uzum oldi") */}
      <CardHeader
        icon={<Receipt />}
        tone="violet"
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        actions={
          // Telefonda jami donut markazida — sarlavha ostiga alohida qator bo'lib tushmasin
          rows.length > 0 ? (
            <div className="hidden text-right sm:block">
              <p className="eyebrow">{t('expenses.total')}</p>
              <p className="tnum mt-0.5 font-display text-base font-bold text-ink">
                <Amount value={f.money(total, data.currency)} />
              </p>
            </div>
          ) : undefined
        }
      />
      <CardBody className="flex flex-1 items-center">
        {rows.length === 0 ? (
          <EmptyState
            className="w-full py-10"
            icon={<Receipt className="h-6 w-6" />}
            title={t('expenses.empty')}
            hint={t('expenses.emptyHint')}
          />
        ) : (
          <div
            className={cn(
              'grid w-full items-center gap-x-8 gap-y-5 sm:grid-cols-[176px_minmax(0,1fr)]',
              wide && 'lg:grid-cols-[200px_minmax(0,1fr)]',
            )}
          >
            <DonutChart
              data={donut}
              height={176}
              innerRadius={56}
              outerRadius={84}
              center={
                <div>
                  <p className="eyebrow">{t('expenses.total')}</p>
                  <p className="tnum mt-0.5 font-display text-sm font-bold text-ink">{f.compact(total)}</p>
                </div>
              }
            />
            {wide ? (
              /*
                Butun kenglikda bir ustunli ro'yxat cho'zilib, nom va summa
                orasi 700px bo'lib qolardi — kategoriyalar plitkalarda:
                4 tagacha 2×2, ko'prog'i 3 ustun.
              */
              <ul className={cn('grid gap-3 sm:grid-cols-2', rows.length > 4 && 'xl:grid-cols-3')}>
                {rows.map((r) => (
                  <li key={r.id} className="well min-w-0 p-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="truncate" title={r.label}>
                        {r.label}
                      </span>
                      <span className="tnum ml-auto shrink-0 text-muted">{f.pct(r.share)}</span>
                    </p>
                    <p className="tnum mt-1.5 font-display text-[17px] font-bold leading-6 text-ink">
                      <Amount value={f.money(r.amount, data.currency)} />
                    </p>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className="block h-full rounded-full transition-[width] duration-700 ease-spring"
                        style={{ width: `${Math.max(2, r.share)}%`, background: r.color }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2.5">
                {rows.map((r) => (
                  <li key={r.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className="w-[5.5rem] min-w-0 shrink-0 truncate text-ink-soft sm:w-24" title={r.label}>
                      {r.label}
                    </span>
                    {/* Chiziq — jami xarajatdagi ulush; yonidagi foiz bilan bir xil o'lchov. Telefonda joy yo'q */}
                    <span className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3 sm:block">
                      <span
                        className="block h-full rounded-full transition-[width] duration-700 ease-spring"
                        style={{ width: `${Math.max(2, r.share)}%`, background: r.color }}
                      />
                    </span>
                    <span className="tnum ml-auto w-12 shrink-0 text-right text-xs text-muted sm:ml-0">{f.pct(r.share)}</span>
                    <span className="tnum w-[7.5rem] shrink-0 whitespace-nowrap text-right font-semibold text-ink">
                      <Amount value={f.money(r.amount, data.currency)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
