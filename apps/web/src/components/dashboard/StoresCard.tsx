import { Store } from 'lucide-react';
import type { DashboardResponse } from '@savdoiq/shared';
import { Card, CardBody, CardHeader, EmptyState, ProgressBar } from '@/components/ui';
import { useFormat, useT } from '@/i18n';

/** "Do'konlar" — tushum bo'yicha taqsimot */
export function StoresCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const rows = [...data.storesBreakdown].sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const max = rows.length ? Math.max(...rows.map((r) => r.revenue), 1) : 1;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Store className="h-4 w-4" />}
        title={t('stores.title')}
        subtitle={t('stores.subtitle', { n: rows.length })}
      />
      <CardBody className="flex-1 pt-3">
        {rows.length === 0 ? (
          <EmptyState className="py-10" icon={<Store className="h-6 w-6" />} title={t('stores.empty')} hint={t('stores.emptyHint')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="table-head border-b border-line px-3 py-2.5 text-left">{t('stores.col.store')}</th>
                  <th className="table-head border-b border-line px-3 py-2.5 text-right">{t('stores.col.orders')}</th>
                  <th className="table-head border-b border-line px-3 py-2.5 text-right">{t('stores.col.revenue')}</th>
                  <th className="table-head border-b border-line px-3 py-2.5 text-right">{t('stores.col.share')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const share = total > 0 ? (r.revenue / total) * 100 : 0;
                  return (
                    <tr key={r.storeId} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-3">
                        <p className="truncate font-medium text-ink">{r.title}</p>
                        <ProgressBar className="mt-1.5 max-w-[180px]" value={(r.revenue / max) * 100} />
                      </td>
                      <td className="tnum px-3 py-3 text-right text-ink-soft">{f.num(r.orders)}</td>
                      <td className="tnum px-3 py-3 text-right font-semibold text-ink">{f.money(r.revenue, data.currency)}</td>
                      <td className="tnum px-3 py-3 text-right text-muted">{f.pct(share)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
