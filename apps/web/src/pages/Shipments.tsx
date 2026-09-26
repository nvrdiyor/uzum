import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  Boxes,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Package,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type { Paginated, ProductsResponse, ShipmentItemRow, ShipmentRow } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useStores } from '@/store/session';
import { cn } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('shipments', {
  uz: {
    title: 'Yetkazmalar',
    subtitle: 'Omborga jo‘natmalarni rejalashtiring va qabulini kuzating',

    'kpi.total': 'Jami yetkazmalar',
    'kpi.totalHint': 'Tanlangan davr bo‘yicha',
    'kpi.transit': 'Yo‘lda',
    'kpi.transitHint': 'Jo‘natilgan, hali qabul qilinmagan',
    'kpi.accepted': 'Qabul qilingan',
    'kpi.acceptedHint': 'Omborga to‘liq tushgan',
    'kpi.value': 'Jami qiymat',
    'kpi.valueHint': 'Pozitsiyalar tannarxi bo‘yicha',

    'filter.all': 'Barchasi',
    'filter.draft': 'Qoralama',
    'filter.planned': 'Rejalashtirilgan',
    'filter.in_transit': 'Yo‘lda',
    'filter.accepted': 'Qabul qilingan',
    'filter.canceled': 'Bekor qilingan',

    'status.draft': 'Qoralama',
    'status.planned': 'Rejalashtirilgan',
    'status.in_transit': 'Yo‘lda',
    'status.accepted': 'Qabul qilingan',
    'source.uzum': 'Uzum',
    'source.uzumTitle': 'Uzum nakladnoyidan avtomatik olingan',
    'source.readonly': 'Bu yetkazma Uzum nakladnoyidan olingan. Uni Uzum kabinetida o‘zgartiring — bu yerda har sinxronda yangilanadi.',
    'status.canceled': 'Bekor qilingan',

    'table.title': 'Yetkazmalar ro‘yxati',
    'col.code': 'Kod',
    'col.destination': 'Yo‘nalish',
    'col.status': 'Holat',
    'col.date': 'Sana',
    'col.items': 'Pozitsiya',
    'col.units': 'Dona',
    'col.value': 'Tannarx qiymati',

    'btn.create': 'Yetkazma yaratish',
    'btn.next': 'Keyingi holat: {s}',
    'btn.cancel': 'Bekor qilish',
    'btn.delete': 'O‘chirish',

    'empty.title': 'Hali yetkazma yo‘q',
    'empty.hint': 'Rejalashtiruvchi tavsiyalaridan yetkazma yarating — nima va qancha kerakligini u hisoblab beradi',
    'empty.planner': 'Rejalashtiruvchiga o‘tish',
    'empty.filtered': 'Bu filtr bo‘yicha yetkazma topilmadi',
    'empty.filteredHint': 'Boshqa holatni tanlang yoki davrni kengaytiring',

    'form.title': 'Yangi yetkazma',
    'form.subtitle': 'Do‘kon, yo‘nalish va pozitsiyalarni belgilang',
    'form.store': 'Do‘kon',
    'form.storeAny': 'Tanlanmagan',
    'form.code': 'Kod',
    'form.codeHint': 'Bo‘sh qoldirsangiz avtomatik beriladi',
    'form.destination': 'Yo‘nalish',
    'form.destinationPh': 'Masalan: Toshkent FBO ombori',
    'form.date': 'Rejalashtirilgan sana',
    'form.note': 'Izoh',
    'form.notePh': 'Ixtiyoriy: mashina, quti turi, mas’ul shaxs',
    'form.items': 'Pozitsiyalar',
    'form.search': 'SKU yoki nomi bo‘yicha qidiring',
    'form.searchHint': 'Qo‘shish uchun ro‘yxatdan tanlang',
    'form.searchShort': 'Kamida 2 ta belgi kiriting',
    'form.searchEmpty': 'Hech narsa topilmadi',
    'form.qty': 'Miqdor',
    'form.boxes': 'Quti',
    'form.noItems': 'Pozitsiya qo‘shilmagan',
    'form.totalItems': 'Pozitsiya',
    'form.totalUnits': 'Jami dona',
    'form.totalValue': 'Tannarx qiymati',
    'form.submit': 'Yaratish',
    'form.added': 'Bu SKU allaqachon qo‘shilgan',

    'detail.title': 'Yetkazma {code}',
    'detail.info': 'Ma’lumot',
    'detail.items': 'Pozitsiyalar',
    'detail.note': 'Izoh',
    'detail.accepted': 'Qabul qilindi',
    'detail.noItems': 'Bu yetkazmada pozitsiya yo‘q',
    'detail.noItemsHint': 'Pozitsiyalar ro‘yxati mavjud emas',
    'detail.plannedAt': 'Rejalashtirilgan',
    'detail.acceptedAt': 'Qabul sanasi',

    'del.title': 'Yetkazmani o‘chirish',
    'del.body': '{code} yetkazmasi butunlay o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.',
    'del.confirm': 'Ha, o‘chirilsin',

    'toast.created': 'Yetkazma yaratildi',
    'toast.createErr': 'Yetkazmani yaratib bo‘lmadi',
    'toast.status': 'Holat yangilandi',
    'toast.statusErr': 'Holatni o‘zgartirib bo‘lmadi',
    'toast.deleted': 'Yetkazma o‘chirildi',
    'toast.deleteErr': 'O‘chirib bo‘lmadi',
    'toast.needItems': 'Kamida bitta pozitsiya qo‘shing',
  },
  ru: {
    title: 'Поставки',
    subtitle: 'Планируйте отгрузки на склад и следите за приёмкой',

    'kpi.total': 'Всего поставок',
    'kpi.totalHint': 'За выбранный период',
    'kpi.transit': 'В пути',
    'kpi.transitHint': 'Отправлены, ещё не приняты',
    'kpi.accepted': 'Принято',
    'kpi.acceptedHint': 'Полностью поступили на склад',
    'kpi.value': 'Общая стоимость',
    'kpi.valueHint': 'По себестоимости позиций',

    'filter.all': 'Все',
    'filter.draft': 'Черновик',
    'filter.planned': 'Запланировано',
    'filter.in_transit': 'В пути',
    'filter.accepted': 'Принято',
    'filter.canceled': 'Отменено',

    'status.draft': 'Черновик',
    'status.planned': 'Запланировано',
    'status.in_transit': 'В пути',
    'status.accepted': 'Принято',
    'source.uzum': 'Uzum',
    'source.uzumTitle': 'Загружено автоматически из накладной Uzum',
    'source.readonly': 'Поставка загружена из накладной Uzum. Меняйте её в кабинете Uzum — здесь она обновляется при каждой синхронизации.',
    'status.canceled': 'Отменено',

    'table.title': 'Список поставок',
    'col.code': 'Код',
    'col.destination': 'Направление',
    'col.status': 'Статус',
    'col.date': 'Дата',
    'col.items': 'Позиций',
    'col.units': 'Штук',
    'col.value': 'Стоимость',

    'btn.create': 'Создать поставку',
    'btn.next': 'Следующий статус: {s}',
    'btn.cancel': 'Отменить',
    'btn.delete': 'Удалить',

    'empty.title': 'Поставок пока нет',
    'empty.hint': 'Создайте поставку по рекомендациям планировщика — он посчитает, что и сколько нужно',
    'empty.planner': 'Перейти в планировщик',
    'empty.filtered': 'По этому фильтру поставок нет',
    'empty.filteredHint': 'Выберите другой статус или расширьте период',

    'form.title': 'Новая поставка',
    'form.subtitle': 'Укажите магазин, направление и позиции',
    'form.store': 'Магазин',
    'form.storeAny': 'Не выбран',
    'form.code': 'Код',
    'form.codeHint': 'Если оставить пустым — присвоится автоматически',
    'form.destination': 'Направление',
    'form.destinationPh': 'Например: склад FBO Ташкент',
    'form.date': 'Плановая дата',
    'form.note': 'Комментарий',
    'form.notePh': 'Необязательно: машина, тип коробок, ответственный',
    'form.items': 'Позиции',
    'form.search': 'Поиск по SKU или названию',
    'form.searchHint': 'Выберите из списка, чтобы добавить',
    'form.searchShort': 'Введите минимум 2 символа',
    'form.searchEmpty': 'Ничего не найдено',
    'form.qty': 'Количество',
    'form.boxes': 'Коробок',
    'form.noItems': 'Позиции не добавлены',
    'form.totalItems': 'Позиций',
    'form.totalUnits': 'Всего штук',
    'form.totalValue': 'Стоимость',
    'form.submit': 'Создать',
    'form.added': 'Этот SKU уже добавлен',

    'detail.title': 'Поставка {code}',
    'detail.info': 'Информация',
    'detail.items': 'Позиции',
    'detail.note': 'Комментарий',
    'detail.accepted': 'Принято',
    'detail.noItems': 'В поставке нет позиций',
    'detail.noItemsHint': 'Список позиций недоступен',
    'detail.plannedAt': 'Запланировано',
    'detail.acceptedAt': 'Дата приёмки',

    'del.title': 'Удалить поставку',
    'del.body': 'Поставка {code} будет удалена безвозвратно.',
    'del.confirm': 'Да, удалить',

    'toast.created': 'Поставка создана',
    'toast.createErr': 'Не удалось создать поставку',
    'toast.status': 'Статус обновлён',
    'toast.statusErr': 'Не удалось изменить статус',
    'toast.deleted': 'Поставка удалена',
    'toast.deleteErr': 'Не удалось удалить',
    'toast.needItems': 'Добавьте хотя бы одну позицию',
  },
  en: {
    title: 'Shipments',
    subtitle: 'Plan deliveries to the warehouse and track their acceptance',

    'kpi.total': 'Total shipments',
    'kpi.totalHint': 'For the selected period',
    'kpi.transit': 'In transit',
    'kpi.transitHint': 'Sent but not accepted yet',
    'kpi.accepted': 'Accepted',
    'kpi.acceptedHint': 'Fully received at the warehouse',
    'kpi.value': 'Total value',
    'kpi.valueHint': 'At the cost price of the items',

    'filter.all': 'All',
    'filter.draft': 'Draft',
    'filter.planned': 'Planned',
    'filter.in_transit': 'In transit',
    'filter.accepted': 'Accepted',
    'filter.canceled': 'Canceled',

    'status.draft': 'Draft',
    'status.planned': 'Planned',
    'status.in_transit': 'In transit',
    'status.accepted': 'Accepted',
    'source.uzum': 'Uzum',
    'source.uzumTitle': 'Imported automatically from an Uzum invoice',
    'source.readonly': 'This shipment comes from an Uzum invoice. Change it in the Uzum cabinet — it refreshes here on every sync.',
    'status.canceled': 'Canceled',

    'table.title': 'Shipment list',
    'col.code': 'Code',
    'col.destination': 'Destination',
    'col.status': 'Status',
    'col.date': 'Date',
    'col.items': 'Items',
    'col.units': 'Units',
    'col.value': 'Cost value',

    'btn.create': 'Create shipment',
    'btn.next': 'Next status: {s}',
    'btn.cancel': 'Cancel',
    'btn.delete': 'Delete',

    'empty.title': 'No shipments yet',
    'empty.hint': 'Create one from the planner recommendations — it works out what to send and how much',
    'empty.planner': 'Open the planner',
    'empty.filtered': 'No shipments match this filter',
    'empty.filteredHint': 'Pick another status or widen the period',

    'form.title': 'New shipment',
    'form.subtitle': 'Choose the store, the destination and the items',
    'form.store': 'Store',
    'form.storeAny': 'Not selected',
    'form.code': 'Code',
    'form.codeHint': 'Left empty, it is generated automatically',
    'form.destination': 'Destination',
    'form.destinationPh': 'For example: Tashkent FBO warehouse',
    'form.date': 'Planned date',
    'form.note': 'Note',
    'form.notePh': 'Optional: vehicle, box type, person in charge',
    'form.items': 'Items',
    'form.search': 'Search by SKU or name',
    'form.searchHint': 'Pick from the list to add it',
    'form.searchShort': 'Type at least 2 characters',
    'form.searchEmpty': 'Nothing found',
    'form.qty': 'Quantity',
    'form.boxes': 'Boxes',
    'form.noItems': 'No items added',
    'form.totalItems': 'Items',
    'form.totalUnits': 'Total units',
    'form.totalValue': 'Cost value',
    'form.submit': 'Create',
    'form.added': 'This SKU is already on the list',

    'detail.title': 'Shipment {code}',
    'detail.info': 'Details',
    'detail.items': 'Items',
    'detail.note': 'Note',
    'detail.accepted': 'Accepted',
    'detail.noItems': 'This shipment has no items',
    'detail.noItemsHint': 'The item list is not available',
    'detail.plannedAt': 'Planned',
    'detail.acceptedAt': 'Accepted on',

    'del.title': 'Delete shipment',
    'del.body': 'Shipment {code} will be removed permanently. This cannot be undone.',
    'del.confirm': 'Yes, delete it',

    'toast.created': 'Shipment created',
    'toast.createErr': 'Could not create the shipment',
    'toast.status': 'Status updated',
    'toast.statusErr': 'Could not change the status',
    'toast.deleted': 'Shipment deleted',
    'toast.deleteErr': 'Could not delete it',
    'toast.needItems': 'Add at least one item',
  },
});

type ShipmentStatus = ShipmentRow['status'];
type FilterKey = 'all' | ShipmentStatus;

/** Ro'yxat javobi massiv yoki sahifalangan konvert bo'lishi mumkin */
type ShipmentsPayload = ShipmentRow[] | Paginated<ShipmentRow>;

function toRows(payload: ShipmentsPayload | undefined): ShipmentRow[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.items;
}

const STATUS_TONE: Record<ShipmentStatus, Tone> = {
  draft: 'muted',
  planned: 'info',
  in_transit: 'warn',
  accepted: 'brand',
  canceled: 'danger',
};

/** Ketma-ket holat zanjiri */
const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  draft: 'planned',
  planned: 'in_transit',
  in_transit: 'accepted',
};

const FILTERS: FilterKey[] = ['all', 'draft', 'planned', 'in_transit', 'accepted', 'canceled'];

interface DraftItem {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  purchasePrice: number;
  qty: number;
  boxes: number;
}

interface SkuOption {
  skuId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  purchasePrice: number;
}

export default function Shipments() {
  const t = useT('shipments');
  const f = useFormat();
  const qc = useQueryClient();
  const q = usePeriodQuery();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const shipments = useQuery({
    queryKey: ['shipments', q],
    queryFn: () => api.get<ShipmentsPayload>('/warehouse/shipments', q),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => toRows(shipments.data), [shipments.data]);

  const visibleRows = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const totals = useMemo(
    () => ({
      count: rows.length,
      transit: rows.filter((r) => r.status === 'in_transit').length,
      accepted: rows.filter((r) => r.status === 'accepted').length,
      value: rows.reduce((s, r) => s + r.costValue, 0),
    }),
    [rows],
  );

  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);
  const toDelete = useMemo(() => rows.find((r) => r.id === deleteId) ?? null, [rows, deleteId]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['shipments'] });

  const changeStatus = useMutation({
    mutationFn: (vars: { id: string; status: ShipmentStatus }) =>
      api.patch<unknown>(`/warehouse/shipments/${vars.id}`, { status: vars.status }),
    onSuccess: () => {
      toast.success(t('toast.status'));
      invalidate();
    },
    onError: (err: unknown) => toast.error(t('toast.statusErr'), err instanceof Error ? err.message : undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<unknown>(`/warehouse/shipments/${id}`),
    onSuccess: () => {
      toast.success(t('toast.deleted'));
      setDeleteId(null);
      setDetailId(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(t('toast.deleteErr'), err instanceof Error ? err.message : undefined),
  });

  const columns: Column<ShipmentRow>[] = [
    {
      key: 'code',
      header: t('col.code'),
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-ink">
            <Truck className="h-4 w-4" />
          </span>
          <span className="font-semibold text-ink">{r.code}</span>
          {r.source === 'uzum' ? (
            <Badge tone="violet" title={t('source.uzumTitle')}>
              {t('source.uzum')}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'destination',
      header: t('col.destination'),
      hideOnMobile: true,
      render: (r) =>
        r.destination ? (
          <span className="inline-flex items-center gap-1.5 text-ink-soft">
            <MapPin className="h-3.5 w-3.5 text-muted" />
            {r.destination}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('col.status'),
      align: 'center',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status]} dot>
          {t(`status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: t('col.date'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.acceptedAt ?? r.plannedAt ?? '',
      render: (r) => {
        const date = r.acceptedAt ?? r.plannedAt;
        return date ? <span className="tnum text-ink-soft">{f.date(date)}</span> : <span className="text-muted">—</span>;
      },
    },
    {
      key: 'itemsCount',
      header: t('col.items'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.itemsCount,
      render: (r) => <span className="tnum">{f.num(r.itemsCount)}</span>,
    },
    {
      key: 'unitsCount',
      header: t('col.units'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.unitsCount,
      render: (r) => <span className="tnum">{f.num(r.unitsCount)}</span>,
    },
    {
      key: 'costValue',
      header: t('col.value'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.costValue,
      render: (r) => <span className="tnum font-semibold text-ink">{f.money(r.costValue)}</span>,
    },
  ];

  const nextStatus = detail ? NEXT_STATUS[detail.status] : undefined;

  return (
    <>
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="shipments" />}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            {t('btn.create')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="shipments">
        {shipments.isError ? (
          <Card>
            <ErrorState
              message={shipments.error instanceof Error ? shipments.error.message : undefined}
              onRetry={() => void shipments.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <StatGrid>
              <StatCard
                label={t('kpi.total')}
                value={f.num(totals.count)}
                hint={t('kpi.totalHint')}
                icon={<Package className="h-5 w-5" />}
                loading={shipments.isLoading}
              />
              <StatCard
                label={t('kpi.transit')}
                value={f.num(totals.transit)}
                hint={t('kpi.transitHint')}
                icon={<Truck className="h-5 w-5" />}
                tone="warn"
                loading={shipments.isLoading}
              />
              <StatCard
                label={t('kpi.accepted')}
                value={f.num(totals.accepted)}
                hint={t('kpi.acceptedHint')}
                icon={<CheckCircle2 className="h-5 w-5" />}
                tone="brand"
                loading={shipments.isLoading}
              />
              <StatCard
                label={t('kpi.value')}
                value={f.money(totals.value)}
                hint={t('kpi.valueHint')}
                icon={<Boxes className="h-5 w-5" />}
                tone="info"
                loading={shipments.isLoading}
              />
            </StatGrid>

            <Card className="overflow-hidden">
              <CardHeader
                title={t('table.title')}
                actions={
                  <div className="max-w-full overflow-x-auto no-scrollbar">
                    <Segmented<FilterKey>
                      size="sm"
                      value={filter}
                      onChange={setFilter}
                      options={FILTERS.map((key) => ({
                        value: key,
                        label: t(`filter.${key}`),
                        count:
                          key === 'all' ? rows.length : rows.filter((r) => r.status === key).length,
                      }))}
                    />
                  </div>
                }
              />
              <div className={cn('mt-3', shipments.isFetching && !shipments.isLoading && 'opacity-70')}>
                <DataTable<ShipmentRow>
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(r) => r.id}
                  loading={shipments.isLoading}
                  density="compact"
                  onRowClick={(r) => setDetailId(r.id)}
                  empty={
                    rows.length === 0 ? (
                      <EmptyState
                        icon={<PackagePlus className="h-6 w-6" />}
                        title={t('empty.title')}
                        hint={t('empty.hint')}
                        action={
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Link to="/planner">
                              <Button variant="outline" icon={<Sparkles className="h-4 w-4" />}>
                                {t('empty.planner')}
                              </Button>
                            </Link>
                            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                              {t('btn.create')}
                            </Button>
                          </div>
                        }
                      />
                    ) : (
                      <EmptyState
                        icon={<Package className="h-6 w-6" />}
                        title={t('empty.filtered')}
                        hint={t('empty.filteredHint')}
                        action={
                          <Button variant="outline" onClick={() => setFilter('all')}>
                            {t('filter.all')}
                          </Button>
                        }
                      />
                    )
                  }
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>

      {/* ── Yetkazma yaratish ── */}
      <CreateShipmentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={invalidate} />

      {/* ── Tafsilot ── */}
      <Drawer
        open={detail !== null}
        onClose={() => setDetailId(null)}
        title={detail ? t('detail.title', { code: detail.code }) : ''}
        footer={
          detail?.source === 'uzum' ? (
            <p className="text-sm text-muted">{t('source.readonly')}</p>
          ) : detail ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="text-danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setDeleteId(detail.id)}
              >
                {t('btn.delete')}
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                {detail.status !== 'canceled' && detail.status !== 'accepted' ? (
                  <Button
                    variant="outline"
                    icon={<Ban className="h-4 w-4" />}
                    loading={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ id: detail.id, status: 'canceled' })}
                  >
                    {t('btn.cancel')}
                  </Button>
                ) : null}
                {nextStatus ? (
                  <Button
                    iconRight={<ArrowRight className="h-4 w-4" />}
                    loading={changeStatus.isPending}
                    onClick={() => changeStatus.mutate({ id: detail.id, status: nextStatus })}
                  >
                    {t('btn.next', { s: t(`status.${nextStatus}`) })}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null
        }
      >
        {detail ? <ShipmentDetail row={detail} /> : null}
      </Drawer>

      {/* ── O'chirishni tasdiqlash ── */}
      <Modal
        open={toDelete !== null}
        onClose={() => setDeleteId(null)}
        size="sm"
        title={t('del.title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              {t('btn.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              {t('del.confirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">{t('del.body', { code: toDelete?.code ?? '' })}</p>
      </Modal>
    </>
  );
}

// ─────────────────────────── Tafsilot paneli ───────────────────────────

function ShipmentDetail({ row }: { row: ShipmentRow }) {
  const t = useT('shipments');
  const f = useFormat();
  const items = row.items ?? [];

  const info: { label: string; value: ReactNode }[] = [
    {
      label: t('col.status'),
      value: (
        <Badge tone={STATUS_TONE[row.status]} dot>
          {t(`status.${row.status}`)}
        </Badge>
      ),
    },
    { label: t('col.destination'), value: row.destination ?? '—' },
    { label: t('detail.plannedAt'), value: row.plannedAt ? f.date(row.plannedAt) : '—' },
    { label: t('detail.acceptedAt'), value: row.acceptedAt ? f.date(row.acceptedAt) : '—' },
    { label: t('col.items'), value: <span className="tnum">{f.num(row.itemsCount)}</span> },
    { label: t('col.units'), value: <span className="tnum">{f.num(row.unitsCount)}</span> },
    { label: t('col.value'), value: <span className="tnum">{f.money(row.costValue)}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
        <p className="mb-3 eyebrow-lg">{t('detail.info')}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {info.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted">{item.label}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {row.note ? (
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-1.5 eyebrow-lg">{t('detail.note')}</p>
          <p className="text-sm text-ink-soft">{row.note}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-3 eyebrow-lg">{t('detail.items')}</p>
        {items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={t('detail.noItems')}
            hint={t('detail.noItemsHint')}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="table-head px-3 py-2 text-left">{t('form.items')}</th>
                  <th className="table-head px-3 py-2 text-right">{t('form.qty')}</th>
                  <th className="table-head px-3 py-2 text-right">{t('detail.accepted')}</th>
                  <th className="table-head px-3 py-2 text-right">{t('form.boxes')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: ShipmentItemRow) => (
                  <tr key={item.id} className="border-t border-line/60">
                    <td className="px-3 py-2.5">
                      <p className="truncate font-medium text-ink">{item.title}</p>
                      <p className="text-xs text-muted">{item.sku}</p>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">{f.num(item.qty)}</td>
                    <td
                      className={cn(
                        'tnum px-3 py-2.5 text-right',
                        item.accepted >= item.qty ? 'text-brand-ink' : 'text-muted',
                      )}
                    >
                      {f.num(item.accepted)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-soft">{f.num(item.boxes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Yaratish oynasi ───────────────────────────

function CreateShipmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT('shipments');
  const f = useFormat();
  const stores = useStores();

  const [storeId, setStoreId] = useState('');
  const [code, setCode] = useState('');
  const [destination, setDestination] = useState('');
  const [plannedAt, setPlannedAt] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    if (!open) return;
    setStoreId('');
    setCode('');
    setDestination('');
    setPlannedAt('');
    setNote('');
    setItems([]);
    setSearch('');
    setDebounced('');
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const catalog = useQuery({
    queryKey: ['shipment-sku-search', debounced, storeId],
    queryFn: () =>
      api.get<ProductsResponse>('/products', {
        search: debounced,
        storeId: storeId || undefined,
        page: 1,
        pageSize: 20,
      }),
    enabled: open && debounced.length >= 2,
  });

  const options = useMemo<SkuOption[]>(() => {
    const out: SkuOption[] = [];
    for (const product of catalog.data?.items.items ?? []) {
      for (const sku of product.skus ?? []) {
        out.push({
          skuId: sku.id,
          sku: sku.sku,
          title: sku.title || product.title,
          imageUrl: product.imageUrl,
          purchasePrice: sku.purchasePrice,
        });
      }
    }
    return out.slice(0, 30);
  }, [catalog.data]);

  const addItem = (option: SkuOption) => {
    if (items.some((i) => i.skuId === option.skuId)) {
      toast.info(t('form.added'));
      return;
    }
    setItems((prev) => [...prev, { ...option, qty: 1, boxes: 0 }]);
    setSearch('');
    setDebounced('');
  };

  const patchItem = (skuId: string, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((i) => (i.skuId === skuId ? { ...i, ...patch } : i)));

  const removeItem = (skuId: string) => setItems((prev) => prev.filter((i) => i.skuId !== skuId));

  const totals = useMemo(
    () => ({
      units: items.reduce((s, i) => s + i.qty, 0),
      value: items.reduce((s, i) => s + i.qty * i.purchasePrice, 0),
    }),
    [items],
  );

  const create = useMutation({
    mutationFn: () =>
      api.post<unknown>('/warehouse/shipments', {
        code: code.trim() || undefined,
        storeId: storeId || undefined,
        destination: destination.trim() || undefined,
        plannedAt: plannedAt || undefined,
        note: note.trim() || undefined,
        items: items.map((i) => ({ skuId: i.skuId, qty: i.qty, boxes: i.boxes })),
      }),
    onSuccess: () => {
      toast.success(t('toast.created'));
      onCreated();
      onClose();
    },
    onError: (err: unknown) => toast.error(t('toast.createErr'), err instanceof Error ? err.message : undefined),
  });

  const submit = () => {
    if (items.length === 0) {
      toast.warning(t('toast.needItems'));
      return;
    }
    create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('form.title')}
      description={t('form.subtitle')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span>
              {t('form.totalItems')}: <span className="tnum font-semibold text-ink">{items.length}</span>
            </span>
            <span>
              {t('form.totalUnits')}: <span className="tnum font-semibold text-ink">{f.num(totals.units)}</span>
            </span>
            <span>
              {t('form.totalValue')}: <span className="tnum font-semibold text-brand-ink">{f.money(totals.value)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('btn.cancel')}
            </Button>
            <Button
              icon={<PackagePlus className="h-4 w-4" />}
              loading={create.isPending}
              disabled={items.length === 0}
              onClick={submit}
            >
              {t('form.submit')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="label">{t('form.store')}</span>
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">{t('form.storeAny')}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="label">{t('form.code')}</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('form.codeHint')} />
          </div>
          <div>
            <span className="label">{t('form.destination')}</span>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t('form.destinationPh')}
            />
          </div>
          <div>
            <span className="label">{t('form.date')}</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="date"
                value={plannedAt}
                onChange={(e) => setPlannedAt(e.target.value)}
                aria-label={t('form.date')}
                className="input pr-10"
              />
            </div>
          </div>
        </div>

        <div>
          <span className="label">{t('form.note')}</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('form.notePh')}
            className="input resize-none"
          />
        </div>

        {/* SKU qidiruv */}
        <div>
          <span className="label">{t('form.items')}</span>
          <SearchInput value={search} onChange={setSearch} placeholder={t('form.search')} />

          {debounced.length >= 2 ? (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface-2/50 p-1.5">
              {catalog.isLoading ? (
                <p className="px-3 py-4 text-center text-xs text-muted">{t('common.loading')}</p>
              ) : options.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted">{t('form.searchEmpty')}</p>
              ) : (
                options.map((option) => (
                  <button
                    key={option.skuId}
                    type="button"
                    onClick={() => addItem(option)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <ProductCell title={option.title} subtitle={option.sku} imageUrl={option.imageUrl} size={32} />
                    </div>
                    <span className="tnum shrink-0 text-xs text-muted">{f.money(option.purchasePrice)}</span>
                    <Plus className="h-4 w-4 shrink-0 text-brand" />
                  </button>
                ))
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              {search.trim().length > 0 ? t('form.searchShort') : t('form.searchHint')}
            </p>
          )}
        </div>

        {/* Tanlangan pozitsiyalar */}
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            {t('form.noItems')}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.skuId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-2.5"
              >
                <div className="min-w-[160px] flex-1">
                  <ProductCell title={item.title} subtitle={item.sku} imageUrl={item.imageUrl} size={34} />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  {t('form.qty')}
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => patchItem(item.skuId, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className="input tnum w-20 px-2 py-1.5 text-right text-sm"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  {t('form.boxes')}
                  <input
                    type="number"
                    min={0}
                    value={item.boxes}
                    onChange={(e) => patchItem(item.skuId, { boxes: Math.max(0, Number(e.target.value) || 0) })}
                    className="input tnum w-20 px-2 py-1.5 text-right text-sm"
                  />
                </label>
                <span className="tnum min-w-[7rem] whitespace-nowrap text-right text-sm font-semibold text-ink">
                  {f.money(item.qty * item.purchasePrice)}
                </span>
                <IconButton label={t('btn.delete')} className="h-8 w-8" onClick={() => removeItem(item.skuId)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
