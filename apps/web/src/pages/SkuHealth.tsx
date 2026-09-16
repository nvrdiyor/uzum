import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, HeartPulse, PackageX, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import type { SkuHealthIssue, SkuHealthResponse, SkuHealthRow } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import { useDebounced } from '@/components/sales/useDebounced';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  SearchInput,
  Segmented,
  StatCard,
  StatGrid,
  type Column,
  type Tone,
} from '@/components/ui';

const PAGE_SIZE = 50;

registerNamespace('skuHealth', {
  uz: {
    title: 'SKU holati',
    subtitle: 'Bloklangan kartochkalar, brak, yo‘qolgan tovar va qaytarishlar',
    'kpi.healthy': 'Muammosiz',
    'kpi.blocked': 'Bloklangan',
    'kpi.returns': 'Yuqori qaytarish',
    'kpi.loss': 'Yo‘qotilgan qiymat',
    'kpi.healthyHint': 'Hech qanday muammo topilmadi',
    'kpi.blockedHint': 'Uzum kartochkani sotuvdan olib qo‘ygan',
    'kpi.returnsHint': '20% dan ortiq qaytarilgan',
    'kpi.lossHint': 'Brak va yo‘qolgan donalar, tannarx bo‘yicha',
    'col.product': 'Mahsulot',
    'col.state': 'Holat',
    'col.returns': 'Qaytarish',
    'col.defected': 'Brak',
    'col.missing': 'Yo‘qolgan',
    'col.loss': 'Yo‘qotish',
    'col.stock': 'Qoldiq',
    'filter.all': 'Barchasi',
    'filter.issues': 'Faqat muammolilar',
    'filter.search': 'SKU yoki nom',
    'issue.blocked': 'Bloklangan',
    'issue.archived': 'Arxivda',
    'issue.high_returns': 'Ko‘p qaytariladi',
    'issue.defected': 'Brak bor',
    'issue.missing': 'Yo‘qolgan',
    'issue.no_cost': 'Tannarx yo‘q',
    'issue.ok': 'Yaxshi',
    'empty.title': 'SKU topilmadi',
    'empty.hint': 'Qidiruvni o‘zgartiring yoki filtrni oching',
    hint: 'Ma’lumot Uzum katalogidan: bloklash sababi, brak va yo‘qolgan donalar hamda qaytarishlar ulushi.',
  },
  ru: {
    title: 'Состояние SKU',
    subtitle: 'Заблокированные карточки, брак, потери и возвраты',
    'kpi.healthy': 'Без проблем',
    'kpi.blocked': 'Заблокировано',
    'kpi.returns': 'Высокий возврат',
    'kpi.loss': 'Потерянная стоимость',
    'kpi.healthyHint': 'Проблем не найдено',
    'kpi.blockedHint': 'Uzum снял карточку с продажи',
    'kpi.returnsHint': 'Возврат более 20%',
    'kpi.lossHint': 'Брак и потери, по себестоимости',
    'col.product': 'Товар',
    'col.state': 'Статус',
    'col.returns': 'Возврат',
    'col.defected': 'Брак',
    'col.missing': 'Потеряно',
    'col.loss': 'Потери',
    'col.stock': 'Остаток',
    'filter.all': 'Все',
    'filter.issues': 'Только с проблемами',
    'filter.search': 'SKU или название',
    'issue.blocked': 'Заблокирован',
    'issue.archived': 'В архиве',
    'issue.high_returns': 'Частые возвраты',
    'issue.defected': 'Есть брак',
    'issue.missing': 'Потеряно',
    'issue.no_cost': 'Нет себестоимости',
    'issue.ok': 'Хорошо',
    'empty.title': 'SKU не найдены',
    'empty.hint': 'Измените поиск или снимите фильтр',
    hint: 'Данные из каталога Uzum: причина блокировки, брак и потери, доля возвратов.',
  },
  en: {
    title: 'SKU health',
    subtitle: 'Blocked cards, defects, missing stock and returns',
    'kpi.healthy': 'Healthy',
    'kpi.blocked': 'Blocked',
    'kpi.returns': 'High returns',
    'kpi.loss': 'Lost value',
    'kpi.healthyHint': 'No issues found',
    'kpi.blockedHint': 'Uzum pulled the card from sale',
    'kpi.returnsHint': 'Returned more than 20%',
    'kpi.lossHint': 'Defective and missing units, at cost',
    'col.product': 'Product',
    'col.state': 'State',
    'col.returns': 'Returns',
    'col.defected': 'Defective',
    'col.missing': 'Missing',
    'col.loss': 'Loss',
    'col.stock': 'Stock',
    'filter.all': 'All',
    'filter.issues': 'Issues only',
    'filter.search': 'SKU or title',
    'issue.blocked': 'Blocked',
    'issue.archived': 'Archived',
    'issue.high_returns': 'Often returned',
    'issue.defected': 'Has defects',
    'issue.missing': 'Missing',
    'issue.no_cost': 'No cost price',
    'issue.ok': 'Good',
    'empty.title': 'No SKUs found',
    'empty.hint': 'Change the search or clear the filter',
    hint: 'From the Uzum catalogue: blocking reason, defective and missing units, and the return rate.',
  },
});

const ISSUE_TONE: Record<SkuHealthIssue, Tone> = {
  blocked: 'danger',
  archived: 'muted',
  high_returns: 'warn',
  defected: 'danger',
  missing: 'warn',
  no_cost: 'info',
  ok: 'brand',
};

type Filter = 'all' | 'issues';

export default function SkuHealth() {
  const t = useT('skuHealth');
  const f = useFormat();
  const q = usePeriodQuery();

  const [filter, setFilter] = useState<Filter>('issues');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filter, search, q.storeId]);

  const query = { ...q, page, pageSize: PAGE_SIZE, issues: filter === 'issues' ? 1 : undefined, search: search || undefined };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sku-health', query],
    queryFn: () => api.get<SkuHealthResponse>('/marketing/sku-health', query),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows.items ?? [];
  const totals = data?.totals;

  const columns: Column<SkuHealthRow>[] = [
    {
      key: 'title',
      header: t('col.product'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
    },
    {
      key: 'issues',
      header: t('col.state'),
      render: (r) => (
        <div className="flex min-w-0 flex-wrap gap-1">
          {r.issues.map((i) => (
            <Badge key={i} tone={ISSUE_TONE[i]} dot>
              {t(`issue.${i}`)}
            </Badge>
          ))}
          {r.blockingReason ? <p className="w-full text-2xs leading-snug text-muted">{r.blockingReason}</p> : null}
        </div>
      ),
    },
    {
      key: 'returnedPct',
      header: t('col.returns'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.returnedPct >= 20 ? 'text-warn-ink font-semibold' : 'text-ink')}>
          {f.pct(r.returnedPct)}
        </span>
      ),
    },
    {
      key: 'qtyDefected',
      header: t('col.defected'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.qtyDefected > 0 ? 'text-danger font-semibold' : 'text-muted')}>
          {f.num(r.qtyDefected)}
        </span>
      ),
    },
    {
      key: 'qtyMissing',
      header: t('col.missing'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.qtyMissing > 0 ? 'text-warn-ink font-semibold' : 'text-muted')}>
          {f.num(r.qtyMissing)}
        </span>
      ),
    },
    {
      key: 'lossValue',
      header: t('col.loss'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.lossValue > 0 ? 'text-danger font-semibold' : 'text-muted')}>
          {f.money(r.lossValue)}
        </span>
      ),
    },
    { key: 'stock', header: t('col.stock'), align: 'right', render: (r) => <span className="tnum">{f.num(r.stock)}</span> },
  ];

  if (isError) {
    return (
      <>
        <PageHeader icon={<HeartPulse className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={<HeartPulse className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="sku_health" />}
      />

      <PlanGate feature="sku_health">
        <StatGrid>
          <StatCard
            label={t('kpi.healthy')}
            value={f.num(totals?.healthy ?? 0)}
            hint={t('kpi.healthyHint')}
            icon={<HeartPulse className="h-5 w-5" />}
            tone="brand"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.blocked')}
            value={f.num(totals?.blocked ?? 0)}
            hint={t('kpi.blockedHint')}
            icon={<Ban className="h-5 w-5" />}
            tone={totals && totals.blocked > 0 ? 'danger' : undefined}
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.returns')}
            value={f.num(totals?.highReturns ?? 0)}
            hint={t('kpi.returnsHint')}
            icon={<RotateCcw className="h-5 w-5" />}
            tone="warn"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.loss')}
            value={f.money(totals?.lossValue ?? 0)}
            hint={t('kpi.lossHint')}
            icon={<PackageX className="h-5 w-5" />}
            tone={totals && totals.lossValue > 0 ? 'danger' : undefined}
            loading={isLoading}
          />
        </StatGrid>

        <FilterBar>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'issues', label: t('filter.issues') },
              { value: 'all', label: t('filter.all') },
            ]}
          />
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t('filter.search')}
            className="w-full sm:w-64"
          />
        </FilterBar>

        <Card className="mt-4">
          <CardHeader icon={<ShieldAlert className="h-4 w-4" />} title={t('title')} subtitle={t('hint')} />
          <DataTable<SkuHealthRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.skuId}
            loading={isLoading}
            pagination={{
              page: data?.rows.page ?? 1,
              pages: data?.rows.pages ?? 1,
              total: data?.rows.total ?? 0,
              onPage: setPage,
            }}
            empty={<EmptyState icon={<Search className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />}
          />
        </Card>
      </PlanGate>
    </>
  );
}
