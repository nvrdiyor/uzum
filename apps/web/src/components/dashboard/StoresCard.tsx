import { Store } from '@/components/icons';
import type { DashboardResponse } from '@savdoiq/shared';
import { Amount, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { useFormat, useT } from '@/i18n';

/**
 * Do'kon ulushining rangi: tushum rangi (grafikdagi "Tushum" — ko'k)ning
 * to'yinganlik zinalari. Kategorik palitra ATAYLAB olinmadi — yonidagi
 * xarajatlar donutida to'q sariq "Marketing", bu yerda esa do'kon bo'lib,
 * bitta rang ikki ma'no tashirdi.
 */
const SHADE = [1, 0.62, 0.4, 0.26, 0.18];
const shade = (i: number) => `rgb(var(--c-info) / ${SHADE[Math.min(i, SHADE.length - 1)]})`;

/**
 * "Do'konlar" — tushum bo'yicha taqsimot.
 *
 * Ilgari 4 ustunli jadval edi: yarim kenglikdagi kartochkada ichki
 * gorizontal aylantirish paydo bo'lardi, ikki qator ostida esa katta bo'sh
 * joy qolardi. Endi ulush tasmasi va ixcham ro'yxat.
 */
export function StoresCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const rows = [...data.storesBreakdown].sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Store />}
        tone="info"
        title={t('stores.title')}
        subtitle={t('stores.subtitle', { n: rows.length })}
      />
      <CardBody className="flex-1">
        {rows.length === 0 ? (
          <EmptyState className="py-10" icon={<Store className="h-6 w-6" />} title={t('stores.empty')} hint={t('stores.emptyHint')} />
        ) : (
          <>
            <div
              role="img"
              aria-label={rows.map((r) => `${r.title} ${f.pct(share(r.revenue))}`).join(', ')}
              className="flex h-2.5 w-full gap-1"
            >
              {rows
                .filter((r) => r.revenue > 0)
                .map((r, i) => (
                  <div
                    key={r.storeId}
                    className="h-full min-w-[6px] origin-left animate-grow-x rounded-full"
                    style={{ flex: `${share(r.revenue)} 1 0%`, background: shade(i), animationDelay: `${120 + i * 120}ms` }}
                  />
                ))}
            </div>

            <ul className="mt-4 divide-y divide-line/70">
              {rows.map((r, i) => (
                <li key={r.storeId} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: shade(i) }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={r.title}>
                      {r.title}
                    </p>
                    <p className="tnum mt-0.5 text-xs text-muted">{t('stores.orders', { n: f.num(r.orders) })}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum whitespace-nowrap text-sm font-semibold text-ink">
                      <Amount value={f.money(r.revenue, data.currency)} />
                    </p>
                    <p className="tnum mt-0.5 text-xs text-muted">{f.pct(share(r.revenue))}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}
