import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Coins, Download, FileText, Hash, PackageX, ShieldCheck } from 'lucide-react';
import type { LossRow, LossesResponse } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  Segmented,
  Select,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { ClaimDraftModal } from '@/components/losses/ClaimDraftModal';
import { CompensationsTab } from '@/components/losses/CompensationsTab';

registerNamespace('losses', {
  uz: {
    title: 'Yo‘qotilgan tovarlar',
    subtitle: 'Ombordagi yo‘qotishlar, shikastlanishlar va Uzum kompensatsiyalari',
    'tab.losses': 'Yo‘qotishlar hisoboti',
    'tab.comp': 'Kompensatsiyalar hisoboti',
    'kpi.skus': 'Yo‘qotishli SKU',
    'kpi.skusHint': 'Kamida bitta yo‘qotish qayd etilgan',
    'kpi.qty': 'Yo‘qotishlar soni',
    'kpi.qtyHint': 'Jami dona',
    'kpi.amount': 'Qaytarish summasi',
    'kpi.amountHint': 'Uzumdan talab qilinadigan summa',
    'kpi.compensated': 'Kompensatsiya olingan',
    'kpi.compHint': 'Qaytarish summasining {pct} qismi',
    'filter.scheme': 'Sxema',
    'filter.status': 'Holat',
    'scheme.all': 'Barchasi',
    'status.all': 'Barcha holatlar',
    'status.open': 'Ochiq',
    'status.claimed': 'Da’vo yuborilgan',
    'status.compensated': 'Kompensatsiya',
    'status.rejected': 'Rad etilgan',
    'type.lost': 'Yo‘qolgan',
    'type.damaged': 'Shikastlangan',
    'type.not_delivered': 'Yetkazilmagan',
    'col.product': 'Mahsulot',
    'col.type': 'Tur',
    'col.scheme': 'Sxema',
    'col.qty': 'Dona',
    'col.amount': 'Summa',
    'col.compensated': 'Kompensatsiya',
    'col.status': 'Holat',
    'col.date': 'Sana',
    'table.title': 'Yo‘qotishlar ro‘yxati',
    'table.pageTotal': 'Sahifadagi jami',
    'btn.claim': 'So‘rov tayyorlash',
    'btn.claimN': 'So‘rov tayyorlash ({n})',
    'btn.copy': 'Nusxa olish',
    'btn.copied': 'Nusxalandi',
    'btn.close': 'Yopish',
    'sel.count': '{n} ta qator tanlandi',
    'sel.clear': 'Tanlovni bekor qilish',
    'claim.title': 'Uzum uchun da’vo matni',
    'claim.descSelected': 'Tanlangan {n} ta yozuv asosida tayyorlandi',
    'claim.descAll': 'Davrdagi barcha ochiq yo‘qotishlar asosida tayyorlandi',
    'claim.hint':
      'Matnni nusxalab, Uzum seller kabinetidagi qo‘llab-quvvatlash bo‘limiga yuboring. Javob odatda 3–5 ish kunida keladi.',
    'claim.support': 'Uzum qo‘llab-quvvatlash',
    'claim.empty': 'Da’vo uchun mos yozuv topilmadi',
    'claim.copiedToast': 'Da’vo matni nusxalandi',
    'claim.copyFailed': 'Nusxa olishning iloji bo‘lmadi',
    'comp.received': 'Olingan kompensatsiya',
    'comp.receivedHint': '{n} ta yozuv bo‘yicha to‘landi',
    'comp.pending': 'Kutilayotgan',
    'comp.pendingHint': '{n} ta yozuv ko‘rib chiqilmoqda',
    'comp.rejected': 'Rad etilgan',
    'comp.rejectedHint': '{n} ta yozuv rad etildi',
    'comp.rate': 'Qoplanish darajasi',
    'comp.rateHint': 'Olingan kompensatsiyaning talab qilingan summaga nisbati',
    'comp.receivedTable': 'Olingan kompensatsiyalar',
    'comp.receivedTableSub': 'Uzum to‘lab bergan yo‘qotishlar tarixi',
    'comp.pendingTable': 'Kutilayotgan kompensatsiyalar',
    'comp.pendingTableSub': 'Da’vo yuborilgan yoki hali rasmiylashtirilmagan yozuvlar',
    'comp.emptyReceived': 'Kompensatsiya hali olinmagan',
    'comp.emptyReceivedHint': 'Da’vo yuborilgandan so‘ng to‘lovlar shu yerda ko‘rinadi',
    'comp.emptyPending': 'Kutilayotgan yozuv yo‘q',
    'comp.emptyPendingHint': 'Barcha yo‘qotishlar yakunlangan',
    'empty.title': 'Yo‘qotishlar topilmadi',
    'empty.hint': 'Tanlangan davr va filtrlar bo‘yicha yo‘qotish qayd etilmagan — bu yaxshi belgi',
    'export.failed': 'Excel faylini yuklab bo‘lmadi',
  },
  ru: {
    title: 'Потерянные товары',
    subtitle: 'Потери на складе, повреждения и компенсации Uzum',
    'tab.losses': 'Отчёт по потерям',
    'tab.comp': 'Отчёт по компенсациям',
    'kpi.skus': 'SKU с потерями',
    'kpi.skusHint': 'Есть хотя бы одна потеря',
    'kpi.qty': 'Количество потерь',
    'kpi.qtyHint': 'Всего штук',
    'kpi.amount': 'Сумма к возврату',
    'kpi.amountHint': 'Сумма требований к Uzum',
    'kpi.compensated': 'Получено компенсаций',
    'kpi.compHint': '{pct} от суммы требований',
    'filter.scheme': 'Схема',
    'filter.status': 'Статус',
    'scheme.all': 'Все',
    'status.all': 'Все статусы',
    'status.open': 'Открыто',
    'status.claimed': 'Претензия отправлена',
    'status.compensated': 'Компенсировано',
    'status.rejected': 'Отклонено',
    'type.lost': 'Утеряно',
    'type.damaged': 'Повреждено',
    'type.not_delivered': 'Не доставлено',
    'col.product': 'Товар',
    'col.type': 'Тип',
    'col.scheme': 'Схема',
    'col.qty': 'Шт.',
    'col.amount': 'Сумма',
    'col.compensated': 'Компенсация',
    'col.status': 'Статус',
    'col.date': 'Дата',
    'table.title': 'Список потерь',
    'table.pageTotal': 'Итого на странице',
    'btn.claim': 'Подготовить претензию',
    'btn.claimN': 'Подготовить претензию ({n})',
    'btn.copy': 'Копировать',
    'btn.copied': 'Скопировано',
    'btn.close': 'Закрыть',
    'sel.count': 'Выбрано строк: {n}',
    'sel.clear': 'Снять выделение',
    'claim.title': 'Текст претензии для Uzum',
    'claim.descSelected': 'Подготовлено по {n} выбранным записям',
    'claim.descAll': 'Подготовлено по всем открытым потерям за период',
    'claim.hint':
      'Скопируйте текст и отправьте в поддержку кабинета продавца Uzum. Ответ обычно приходит за 3–5 рабочих дней.',
    'claim.support': 'Поддержка Uzum',
    'claim.empty': 'Подходящих записей для претензии не найдено',
    'claim.copiedToast': 'Текст претензии скопирован',
    'claim.copyFailed': 'Не удалось скопировать',
    'comp.received': 'Получено компенсаций',
    'comp.receivedHint': 'Выплачено по {n} записям',
    'comp.pending': 'Ожидается',
    'comp.pendingHint': '{n} записей на рассмотрении',
    'comp.rejected': 'Отклонено',
    'comp.rejectedHint': 'Отклонено записей: {n}',
    'comp.rate': 'Уровень возмещения',
    'comp.rateHint': 'Отношение полученной компенсации к заявленной сумме',
    'comp.receivedTable': 'Полученные компенсации',
    'comp.receivedTableSub': 'История выплат Uzum по потерям',
    'comp.pendingTable': 'Ожидаемые компенсации',
    'comp.pendingTableSub': 'Записи с отправленной претензией или ещё не оформленные',
    'comp.emptyReceived': 'Компенсации ещё не получены',
    'comp.emptyReceivedHint': 'После отправки претензии выплаты появятся здесь',
    'comp.emptyPending': 'Нет ожидающих записей',
    'comp.emptyPendingHint': 'Все потери закрыты',
    'empty.title': 'Потери не найдены',
    'empty.hint': 'За выбранный период и фильтры потерь не зафиксировано — это хороший знак',
    'export.failed': 'Не удалось скачать файл Excel',
  },
  en: {
    title: 'Lost items',
    subtitle: 'Warehouse losses, damages and Uzum compensations',
    'tab.losses': 'Losses report',
    'tab.comp': 'Compensations report',
    'kpi.skus': 'SKUs with losses',
    'kpi.skusHint': 'At least one loss recorded',
    'kpi.qty': 'Lost units',
    'kpi.qtyHint': 'Units in total',
    'kpi.amount': 'Claimable amount',
    'kpi.amountHint': 'Amount to claim from Uzum',
    'kpi.compensated': 'Compensated',
    'kpi.compHint': '{pct} of the claimable amount',
    'filter.scheme': 'Scheme',
    'filter.status': 'Status',
    'scheme.all': 'All',
    'status.all': 'All statuses',
    'status.open': 'Open',
    'status.claimed': 'Claim sent',
    'status.compensated': 'Compensated',
    'status.rejected': 'Rejected',
    'type.lost': 'Lost',
    'type.damaged': 'Damaged',
    'type.not_delivered': 'Not delivered',
    'col.product': 'Product',
    'col.type': 'Type',
    'col.scheme': 'Scheme',
    'col.qty': 'Units',
    'col.amount': 'Amount',
    'col.compensated': 'Compensation',
    'col.status': 'Status',
    'col.date': 'Date',
    'table.title': 'Loss records',
    'table.pageTotal': 'Page total',
    'btn.claim': 'Prepare a claim',
    'btn.claimN': 'Prepare a claim ({n})',
    'btn.copy': 'Copy',
    'btn.copied': 'Copied',
    'btn.close': 'Close',
    'sel.count': '{n} rows selected',
    'sel.clear': 'Clear selection',
    'claim.title': 'Claim text for Uzum',
    'claim.descSelected': 'Prepared from {n} selected records',
    'claim.descAll': 'Prepared from every open loss in the period',
    'claim.hint':
      'Copy the text and send it to Uzum seller support. A reply usually arrives within 3–5 business days.',
    'claim.support': 'Uzum support',
    'claim.empty': 'No records match this claim',
    'claim.copiedToast': 'Claim text copied',
    'claim.copyFailed': 'Copying failed',
    'comp.received': 'Compensation received',
    'comp.receivedHint': 'Paid out for {n} records',
    'comp.pending': 'Pending',
    'comp.pendingHint': '{n} records under review',
    'comp.rejected': 'Rejected',
    'comp.rejectedHint': '{n} records rejected',
    'comp.rate': 'Recovery rate',
    'comp.rateHint': 'Compensation received versus the amount claimed',
    'comp.receivedTable': 'Received compensations',
    'comp.receivedTableSub': 'History of payouts from Uzum',
    'comp.pendingTable': 'Pending compensations',
    'comp.pendingTableSub': 'Records with a claim sent or not filed yet',
    'comp.emptyReceived': 'No compensation yet',
    'comp.emptyReceivedHint': 'Payouts appear here once a claim is filed',
    'comp.emptyPending': 'Nothing pending',
    'comp.emptyPendingHint': 'Every loss has been settled',
    'empty.title': 'No losses found',
    'empty.hint': 'Nothing was lost for the selected period and filters — that is a good sign',
    'export.failed': 'Could not download the Excel file',
  },
});

type Tab = 'losses' | 'comp';
type SchemeFilter = 'all' | 'FBO' | 'FBS';
type StatusFilter = 'all' | LossRow['status'];

const STATUS_TONE: Record<LossRow['status'], Tone> = {
  open: 'warn',
  claimed: 'info',
  compensated: 'brand',
  rejected: 'danger',
};

const TYPE_TONE: Record<LossRow['type'], Tone> = {
  lost: 'danger',
  damaged: 'warn',
  not_delivered: 'info',
};

const STATUSES: StatusFilter[] = ['all', 'open', 'claimed', 'compensated', 'rejected'];

export default function Losses() {
  const t = useT('losses');
  const f = useFormat();
  const q = usePeriodQuery();

  const [tab, setTab] = useState<Tab>('losses');
  const [scheme, setScheme] = useState<SchemeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [claimOpen, setClaimOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(
    () => ({
      ...q,
      page,
      pageSize: 25,
      scheme: scheme === 'all' ? undefined : scheme,
      status: status === 'all' ? undefined : status,
    }),
    [q, page, scheme, status],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse-losses', query],
    queryFn: () => api.get<LossesResponse>('/warehouse/losses', query),
  });

  /** Server filtrni qo'llamagan bo'lsa ham natija bir xil bo'lishi uchun mahalliy filtr */
  const rows = useMemo(() => {
    const items = data?.rows.items ?? [];
    return items.filter(
      (r) => (scheme === 'all' || r.scheme === scheme) && (status === 'all' || r.status === status),
    );
  }, [data, scheme, status]);

  const totals = data?.totals ?? { skuCount: 0, qty: 0, amount: 0, compensated: 0 };
  const coverPct = totals.amount > 0 ? (totals.compensated / totals.amount) * 100 : 0;

  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? [] : Array.from(new Set([...selected, ...rows.map((r) => r.id)])));
  const toggleOne = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
    setSelected([]);
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/losses', query);
      downloadBlob(blob, `losses-${q.from}_${q.to}.xlsx`);
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<LossRow>[] = useMemo(
    () => [
      {
        key: 'select',
        width: 44,
        header: <RowCheck checked={allSelected} onChange={toggleAll} />,
        render: (r) => <RowCheck checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} />,
      },
      {
        key: 'product',
        header: t('col.product'),
        width: '30%',
        render: (r) => (
          <ProductCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} imageUrl={r.imageUrl} />
        ),
        sortable: true,
        sortValue: (r) => r.title ?? r.sku ?? '',
      },
      {
        key: 'type',
        header: t('col.type'),
        render: (r) => <Badge tone={TYPE_TONE[r.type]}>{t(`type.${r.type}`)}</Badge>,
        sortValue: (r) => r.type,
      },
      {
        key: 'scheme',
        header: t('col.scheme'),
        hideOnMobile: true,
        render: (r) => <Badge tone={r.scheme === 'FBO' ? 'violet' : 'info'}>{r.scheme}</Badge>,
        sortValue: (r) => r.scheme,
      },
      {
        key: 'qty',
        header: t('col.qty'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.qty)}</span>,
        sortable: true,
        sortValue: (r) => r.qty,
      },
      {
        key: 'amount',
        header: t('col.amount'),
        align: 'right',
        render: (r) => <span className="tnum font-medium text-ink">{f.money(r.amount)}</span>,
        sortable: true,
        sortValue: (r) => r.amount,
      },
      {
        key: 'compensated',
        header: t('col.compensated'),
        align: 'right',
        render: (r) => (
          <span className={cn('tnum', r.compensated > 0 ? 'font-semibold text-brand-ink' : 'text-muted')}>
            {r.compensated > 0 ? f.money(r.compensated) : '—'}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.compensated,
      },
      {
        key: 'status',
        header: t('col.status'),
        render: (r) => (
          <Badge tone={STATUS_TONE[r.status]} dot>
            {t(`status.${r.status}`)}
          </Badge>
        ),
        sortValue: (r) => r.status,
      },
      {
        key: 'date',
        header: t('col.date'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum text-muted">{f.date(r.happenedAt)}</span>,
        sortable: true,
        sortValue: (r) => r.happenedAt,
      },
    ],
    [t, f, selected, allSelected, rows],
  );

  const pageQty = rows.reduce((s, r) => s + r.qty, 0);
  const pageAmount = rows.reduce((s, r) => s + r.amount, 0);
  const pageComp = rows.reduce((s, r) => s + r.compensated, 0);

  return (
    <>
      <PageHeader
        icon={<PackageX className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="losses_report" />}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={onExport}
            >
              Excel
            </Button>
            <Button icon={<FileText className="h-4 w-4" />} onClick={() => setClaimOpen(true)}>
              {selected.length ? t('btn.claimN', { n: selected.length }) : t('btn.claim')}
            </Button>
          </>
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'losses', label: t('tab.losses') },
            { value: 'comp', label: t('tab.comp') },
          ]}
        />
      </PageHeader>

      <FilterBar>
        <Segmented<SchemeFilter>
          size="sm"
          value={scheme}
          onChange={resetPage(setScheme)}
          options={[
            { value: 'all', label: t('scheme.all') },
            { value: 'FBO', label: 'FBO' },
            { value: 'FBS', label: 'FBS' },
          ]}
        />
        {tab === 'losses' ? (
          <Select
            className="h-10 w-auto py-0"
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as StatusFilter)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        ) : null}
        {selected.length ? (
          <div className="flex items-center gap-2">
            <Badge tone="brand">{t('sel.count', { n: selected.length })}</Badge>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              {t('sel.clear')}
            </button>
          </div>
        ) : null}
      </FilterBar>

      <PlanGate feature="losses_report">
        <div className="space-y-5">
          <StatGrid>
            <StatCard
              label={t('kpi.skus')}
              value={f.num(totals.skuCount)}
              hint={t('kpi.skusHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.qty')}
              value={f.num(totals.qty)}
              hint={t('kpi.qtyHint')}
              icon={<Hash className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.amount')}
              value={f.money(totals.amount)}
              hint={t('kpi.amountHint')}
              icon={<Coins className="h-5 w-5" />}
              tone="danger"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.compensated')}
              value={f.money(totals.compensated)}
              hint={t('kpi.compHint', { pct: f.pct(coverPct) })}
              icon={<ShieldCheck className="h-5 w-5" />}
              tone="brand"
              loading={isLoading}
            />
          </StatGrid>

          {isError ? (
            <Card>
              <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
            </Card>
          ) : tab === 'comp' ? (
            <CompensationsTab rows={rows} loading={isLoading} claims={data?.claims} />
          ) : (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                <h3 className="section-title">{t('table.title')}</h3>
                <p className="text-sm text-muted">
                  {f.num(data?.rows.total ?? 0)} {t('common.rows')}
                </p>
              </div>
              <div className="mt-4">
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(r) => r.id}
                  loading={isLoading}
                  empty={<EmptyState icon={<PackageX className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />}
                  pagination={
                    data
                      ? {
                          page: data.rows.page,
                          pages: data.rows.pages,
                          total: data.rows.total,
                          pageSize: data.rows.pageSize,
                          onPage: (p) => setPage(p),
                        }
                      : undefined
                  }
                  footer={
                    rows.length ? (
                      <>
                        <td className="px-4 py-3 eyebrow-lg" colSpan={4}>
                          {t('table.pageTotal')}
                        </td>
                        <td className="tnum px-4 py-3 text-right">{f.num(pageQty)}</td>
                        <td className="tnum px-4 py-3 text-right">{f.money(pageAmount)}</td>
                        <td className="tnum px-4 py-3 text-right text-brand-ink">{f.money(pageComp)}</td>
                        <td className="px-4 py-3" colSpan={2} />
                      </>
                    ) : undefined
                  }
                />
              </div>
            </Card>
          )}
        </div>
      </PlanGate>

      <ClaimDraftModal open={claimOpen} onClose={() => setClaimOpen(false)} ids={selected} query={query} />
    </>
  );
}

/** Jadval qatorini tanlash uchun katakcha */
function RowCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-line bg-surface-2 accent-brand"
    />
  );
}
