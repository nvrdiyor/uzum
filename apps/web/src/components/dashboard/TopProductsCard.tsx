import { Link } from 'react-router-dom';
import { ArrowRight, Trophy } from 'lucide-react';
import type { TopProductRow } from '@savdoiq/shared';
import { Badge, Card, CardHeader, DataTable, EmptyState, ProductCell, ProgressBar, type Column } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

function marginTone(margin: number): 'brand' | 'warn' | 'danger' {
  if (margin >= 20) return 'brand';
  if (margin >= 8) return 'warn';
  return 'danger';
}

/** "Top mahsulotlar" — davr bo'yicha eng ko'p tushum keltirganlar */
export function TopProductsCard({ rows, loading }: { rows: TopProductRow[]; loading?: boolean }) {
  const t = useT('dashboard');
  const f = useFormat();

  const columns: Column<TopProductRow>[] = [
    {
      key: 'title',
      header: t('top.col.product'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
    },
    {
      key: 'units',
      header: t('top.col.sold'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.units,
      render: (r) => f.num(r.units),
    },
    {
      key: 'revenue',
      header: t('top.col.revenue'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.revenue,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.revenue)}</span>,
    },
    {
      key: 'profit',
      header: t('top.col.profit'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.profit,
      render: (r) => <span className={cn('font-semibold', r.profit >= 0 ? 'text-brand-ink' : 'text-danger')}>{f.money(r.profit)}</span>,
    },
    {
      key: 'margin',
      header: t('top.col.margin'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.margin,
      render: (r) => <Badge tone={marginTone(r.margin)}>{f.pct(r.margin)}</Badge>,
    },
    {
      key: 'share',
      header: t('top.col.share'),
      align: 'right',
      hideOnMobile: true,
      width: 160,
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <ProgressBar className="w-20" value={r.share} />
          <span className="tnum w-12 text-right text-xs text-muted">{f.pct(r.share)}</span>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Trophy className="h-4 w-4" />}
        title={t('top.title')}
        subtitle={t('top.subtitle')}
        actions={
          <Link
            to="/products"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-ink transition-opacity hover:opacity-80"
          >
            {t('top.all')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="mt-4">
        <DataTable<TopProductRow>
          columns={columns}
          rows={rows}
          loading={loading}
          rowKey={(r) => r.skuId}
          empty={<EmptyState icon={<Trophy className="h-6 w-6" />} title={t('top.empty')} hint={t('top.emptyHint')} />}
        />
      </div>
    </Card>
  );
}
