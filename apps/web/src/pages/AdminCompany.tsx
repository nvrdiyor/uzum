/**
 * Administrator: bitta kompaniyaning ichi — /admin/companies/:id
 *
 * Faqat o'qish: a'zolar, Uzum kabinetlari, do'konlar va tovarlar (narx,
 * tannarx, qoldiq, Uzum Market'dagi sahifasi). Hech narsa o'zgartirilmaydi.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Boxes,
  Coins,
  ExternalLink,
  ImageOff,
  LayoutDashboard,
  Package,
  ShieldAlert,
  Store,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from '@/components/icons';
import type { AdminCompanyDetail, AdminCompanySkuRow, Paginated } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  Segmented,
  Skeleton,
  StatCard,
  type Column,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('adminCompany', {
  uz: {
    back: 'Administrator',
    created: 'Ochilgan: {date}',
    demo: 'Demo',
    notFound: 'Kompaniya topilmadi',
    'denied.title': 'Ruxsat yo‘q',
    'denied.hint': 'Bu bo‘lim faqat platforma administratorlari uchun. Agar bu xato bo‘lsa, qo‘llab-quvvatlashga yozing.',
    'denied.back': 'Boshqaruv paneliga qaytish',

    'kpi.products': 'Tovarlar',
    'kpi.productsHint': '{n} ta SKU (variant)',
    'kpi.cost': 'Tannarxi kiritilgan',
    'kpi.costHint': '{n} ta SKU’da tannarx yo‘q',
    'kpi.costAll': 'Hammasida bor',
    'kpi.stock': 'Qoldiq',
    'kpi.stockHint': 'Uzum omborlari + o‘z ombori, dona',
    'kpi.stockCost': 'Qoldiq tannarxi',
    'kpi.stockCostHint': 'Qoldiq × (tannarx + qo‘shimcha xarajat)',
    'kpi.noCostUnits': '{n} dona tannarxsiz — hisobga kirmagan',
    'kpi.payout': 'Kutilayotgan tushum',
    'kpi.payoutHint': 'Hammasi joriy narxda sotilsa, Uzum komissiyasi va logistikasidan keyin. Narx bo‘yicha: {v}',
    'kpi.profit': 'Kutilayotgan foyda',
    'kpi.profitHint': 'Tushum − tannarx − soliq',

    'members.title': 'A’zolar',
    'role.owner': 'Egasi',
    'role.manager': 'Menejer',
    'role.viewer': 'Kuzatuvchi',
    'role.member': 'A’zo',

    'stores.title': 'Do‘konlar va Uzum kabineti',
    'stores.none': 'Do‘kon ulanmagan',
    'stores.shop': 'Uzum do‘kon ID: {id}',
    'stores.counts': '{products} ta tovar · {orders} ta buyurtma',
    'stores.lastOrder': 'Oxirgi buyurtma: {date}',
    'cab.none': 'Uzum API kaliti ulanmagan',
    'cab.lastSync': 'Oxirgi sinxron: {date}',
    'cab.never': 'Hali sinxron bo‘lmagan',
    'cab.status.active': 'Ishlayapti',
    'cab.status.pending': 'Tekshirilmoqda',
    'cab.status.invalid': 'Kalit yaroqsiz',
    'cab.status.blocked': 'Uzum rad etdi',

    'products.title': 'Tovarlar',
    'products.search': 'Nomi, SKU yoki Uzum ID',
    'filter.live': 'Sotuvda',
    'filter.noCost': 'Tannarxi yo‘q',
    'filter.archived': 'Arxiv',
    'col.product': 'Tovar',
    'col.store': 'Do‘kon',
    'col.price': 'Narx',
    'col.cost': 'Tannarx',
    'col.stock': 'Qoldiq',
    'col.payout': 'Kutilayotgan tushum',
    'stock.cost': 'tannarx: {v}',
    'payout.unit': '1 donadan: {v}',
    'payout.estimate': 'Bu SKU hali sotilmagan — komissiya va logistika taxminiy',
    'col.uzum': 'Uzum Market',
    'cost.none': 'Kiritilmagan',
    'cost.extra': '+{v} qo‘shimcha',
    'uzum.open': 'Ochish',
    'uzum.noId': 'Uzum ID yo‘q',
    'products.empty': 'Tovar topilmadi',
    'products.emptyHint': 'Qidiruv yoki filtrni o‘zgartiring',
  },
  ru: {
    back: 'Администратор',
    created: 'Создана: {date}',
    demo: 'Демо',
    notFound: 'Компания не найдена',
    'denied.title': 'Нет доступа',
    'denied.hint': 'Раздел доступен только администраторам платформы. Если это ошибка — напишите в поддержку.',
    'denied.back': 'Вернуться на дашборд',

    'kpi.products': 'Товары',
    'kpi.productsHint': 'SKU (вариантов): {n}',
    'kpi.cost': 'Себестоимость указана',
    'kpi.costHint': 'Без себестоимости: {n} SKU',
    'kpi.costAll': 'Указана у всех',
    'kpi.stock': 'Остаток',
    'kpi.stockHint': 'Склады Uzum + свой склад, шт.',
    'kpi.stockCost': 'Остаток по себестоимости',
    'kpi.stockCostHint': 'Остаток × (себестоимость + доп. расходы)',
    'kpi.noCostUnits': '{n} шт. без себестоимости — не учтены',
    'kpi.payout': 'Ожидаемая выручка',
    'kpi.payoutHint': 'Если всё продать по текущей цене, после комиссии и логистики Uzum. По цене: {v}',
    'kpi.profit': 'Ожидаемая прибыль',
    'kpi.profitHint': 'Выручка − себестоимость − налог',

    'members.title': 'Участники',
    'role.owner': 'Владелец',
    'role.manager': 'Менеджер',
    'role.viewer': 'Наблюдатель',
    'role.member': 'Участник',

    'stores.title': 'Магазины и кабинет Uzum',
    'stores.none': 'Магазин не подключён',
    'stores.shop': 'ID магазина Uzum: {id}',
    'stores.counts': 'товаров: {products} · заказов: {orders}',
    'stores.lastOrder': 'Последний заказ: {date}',
    'cab.none': 'API-ключ Uzum не подключён',
    'cab.lastSync': 'Последняя синхронизация: {date}',
    'cab.never': 'Ещё не синхронизировался',
    'cab.status.active': 'Работает',
    'cab.status.pending': 'Проверяется',
    'cab.status.invalid': 'Ключ недействителен',
    'cab.status.blocked': 'Uzum отклонил',

    'products.title': 'Товары',
    'products.search': 'Название, SKU или ID Uzum',
    'filter.live': 'В продаже',
    'filter.noCost': 'Без себестоимости',
    'filter.archived': 'Архив',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.price': 'Цена',
    'col.cost': 'Себестоимость',
    'col.stock': 'Остаток',
    'col.payout': 'Ожидаемая выручка',
    'stock.cost': 'себест.: {v}',
    'payout.unit': 'за 1 шт.: {v}',
    'payout.estimate': 'Этот SKU ещё не продавался — комиссия и логистика оценочные',
    'col.uzum': 'Uzum Market',
    'cost.none': 'Не указана',
    'cost.extra': '+{v} доп.',
    'uzum.open': 'Открыть',
    'uzum.noId': 'Нет ID Uzum',
    'products.empty': 'Товары не найдены',
    'products.emptyHint': 'Измените поиск или фильтр',
  },
  en: {
    back: 'Administrator',
    created: 'Created: {date}',
    demo: 'Demo',
    notFound: 'Company not found',
    'denied.title': 'No access',
    'denied.hint': 'This area is for platform administrators only. If you think this is a mistake, contact support.',
    'denied.back': 'Back to the dashboard',

    'kpi.products': 'Products',
    'kpi.productsHint': '{n} SKUs (variants)',
    'kpi.cost': 'Cost price entered',
    'kpi.costHint': '{n} SKUs without cost price',
    'kpi.costAll': 'Entered for all',
    'kpi.stock': 'Stock',
    'kpi.stockHint': 'Uzum warehouses + own warehouse, units',
    'kpi.stockCost': 'Stock at cost',
    'kpi.stockCostHint': 'Stock × (cost price + extra costs)',
    'kpi.noCostUnits': '{n} units without cost price — not counted',
    'kpi.payout': 'Expected payout',
    'kpi.payoutHint': 'If everything sells at the current price, after Uzum commission and logistics. At price: {v}',
    'kpi.profit': 'Expected profit',
    'kpi.profitHint': 'Payout − cost − tax',

    'members.title': 'Members',
    'role.owner': 'Owner',
    'role.manager': 'Manager',
    'role.viewer': 'Viewer',
    'role.member': 'Member',

    'stores.title': 'Stores and Uzum cabinet',
    'stores.none': 'No store connected',
    'stores.shop': 'Uzum shop ID: {id}',
    'stores.counts': '{products} products · {orders} orders',
    'stores.lastOrder': 'Last order: {date}',
    'cab.none': 'Uzum API key not connected',
    'cab.lastSync': 'Last sync: {date}',
    'cab.never': 'Not synced yet',
    'cab.status.active': 'Working',
    'cab.status.pending': 'Being checked',
    'cab.status.invalid': 'Key invalid',
    'cab.status.blocked': 'Rejected by Uzum',

    'products.title': 'Products',
    'products.search': 'Name, SKU or Uzum ID',
    'filter.live': 'On sale',
    'filter.noCost': 'No cost price',
    'filter.archived': 'Archive',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.price': 'Price',
    'col.cost': 'Cost price',
    'col.stock': 'Stock',
    'col.payout': 'Expected payout',
    'stock.cost': 'cost: {v}',
    'payout.unit': 'per unit: {v}',
    'payout.estimate': 'This SKU has not sold yet — commission and logistics are estimated',
    'col.uzum': 'Uzum Market',
    'cost.none': 'Not entered',
    'cost.extra': '+{v} extra',
    'uzum.open': 'Open',
    'uzum.noId': 'No Uzum ID',
    'products.empty': 'No products found',
    'products.emptyHint': 'Change the search or filter',
  },
});

const PAGE_SIZE = 50;

type Filter = 'live' | 'noCost' | 'archived';

const CABINET_TONE: Record<string, Tone> = { active: 'brand', pending: 'info', invalid: 'danger', blocked: 'warn' };

const errText = (err: unknown): string | undefined => (err instanceof Error ? err.message : undefined);

export default function AdminCompany() {
  const t = useT('adminCompany');
  const ready = useSession((s) => s.ready);
  const isAdmin = useSession((s) => s.me?.user.role === 'admin');

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-xl overflow-hidden bg-aurora">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={t('denied.title')}
          hint={t('denied.hint')}
          action={
            <Link to="/dashboard">
              <Button variant="outline" icon={<LayoutDashboard className="h-4 w-4" />}>
                {t('denied.back')}
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return <CompanyView />;
}

function CompanyView() {
  const t = useT('adminCompany');
  const f = useFormat();
  const { id = '' } = useParams<{ id: string }>();

  const detail = useQuery({
    queryKey: ['admin-company', id],
    queryFn: () => api.get<AdminCompanyDetail>(`/admin/companies/${id}`),
    enabled: Boolean(id),
  });

  const back = (
    <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" />
      {t('back')}
    </Link>
  );

  if (detail.isError) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <ErrorState message={errText(detail.error) ?? t('notFound')} onRetry={() => void detail.refetch()} />
        </Card>
      </div>
    );
  }

  const c = detail.data;
  const noCost = c ? c.totals.skus - c.totals.withCost : 0;

  return (
    <div className="space-y-5">
      {back}
      {c ? (
        <PageHeader
          title={c.name}
          description={t('created', { date: f.date(c.createdAt) })}
          badge={
            <span className="flex items-center gap-1.5">
              <Badge tone={c.planActive ? 'brand' : 'muted'} dot>
                {t(`plan.${c.plan}`)}
                {c.expiresAt ? ` · ${f.date(c.expiresAt)}` : ''}
              </Badge>
              {c.demo ? <Badge tone="warn">{t('demo')}</Badge> : null}
            </span>
          }
        />
      ) : (
        <Skeleton className="h-14 w-72" />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t('kpi.products')}
          value={c ? f.num(c.totals.products) : '—'}
          hint={c ? t('kpi.productsHint', { n: f.num(c.totals.skus) }) : undefined}
          icon={<Package className="h-5 w-5" />}
          tone="brand"
          loading={detail.isLoading}
        />
        <StatCard
          label={t('kpi.cost')}
          value={c ? `${f.num(c.totals.withCost)} / ${f.num(c.totals.skus)}` : '—'}
          hint={c ? (noCost > 0 ? t('kpi.costHint', { n: f.num(noCost) }) : t('kpi.costAll')) : undefined}
          icon={<Tag className="h-5 w-5" />}
          tone={noCost > 0 ? 'warn' : 'brand'}
          loading={detail.isLoading}
        />
        <StatCard
          label={t('kpi.stock')}
          value={c ? f.num(c.totals.stockUnits) : '—'}
          hint={t('kpi.stockHint')}
          icon={<Boxes className="h-5 w-5" />}
          tone="info"
          loading={detail.isLoading}
        />
        <StatCard
          label={t('kpi.stockCost')}
          value={c ? f.money(c.totals.stockCost) : '—'}
          hint={
            c && c.totals.stockUnitsNoCost > 0
              ? t('kpi.noCostUnits', { n: f.num(c.totals.stockUnitsNoCost) })
              : t('kpi.stockCostHint')
          }
          icon={<Coins className="h-5 w-5" />}
          tone="violet"
          loading={detail.isLoading}
        />
        <StatCard
          label={t('kpi.payout')}
          value={c ? f.money(c.totals.stockPayout) : '—'}
          hint={c ? t('kpi.payoutHint', { v: f.money(c.totals.stockRetail) }) : undefined}
          icon={<Wallet className="h-5 w-5" />}
          tone="brand"
          loading={detail.isLoading}
        />
        <StatCard
          label={t('kpi.profit')}
          value={c ? f.money(c.totals.stockProfit) : '—'}
          hint={
            c && c.totals.stockUnitsNoCost > 0
              ? t('kpi.noCostUnits', { n: f.num(c.totals.stockUnitsNoCost) })
              : t('kpi.profitHint')
          }
          icon={<TrendingUp className="h-5 w-5" />}
          tone={c && c.totals.stockProfit < 0 ? 'danger' : 'info'}
          loading={detail.isLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Users className="h-4 w-4" />} title={t('members.title')} />
          <CardBody>
            {c ? (
              <ul className="divide-y divide-line">
                {c.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                      <p className="tnum truncate text-xs text-muted">
                        {m.username ? `@${m.username} · ` : ''}
                        {m.telegramId}
                      </p>
                    </div>
                    <Badge tone={m.role === 'owner' ? 'brand' : 'muted'}>
                      {t(`role.${m.role}`) === `role.${m.role}` ? m.role : t(`role.${m.role}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Store className="h-4 w-4" />} title={t('stores.title')} />
          <CardBody>
            {c ? (
              <div className="space-y-3">
                {c.cabinets.length === 0 ? (
                  <p className="text-sm text-muted">{t('cab.none')}</p>
                ) : (
                  c.cabinets.map((a) => (
                    <div key={a.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{a.label}</span>
                        <Badge tone={CABINET_TONE[a.status] ?? 'muted'} dot>
                          {t(`cab.status.${a.status}`) === `cab.status.${a.status}` ? a.status : t(`cab.status.${a.status}`)}
                        </Badge>
                      </div>
                      <p className="tnum mt-1 text-xs text-muted">
                        {a.lastSyncAt ? t('cab.lastSync', { date: f.date(a.lastSyncAt) }) : t('cab.never')}
                      </p>
                      {a.lastError ? <p className="mt-1 line-clamp-2 text-xs text-danger-ink">{a.lastError}</p> : null}
                    </div>
                  ))
                )}
                {c.stores.length === 0 ? (
                  <p className="text-sm text-muted">{t('stores.none')}</p>
                ) : (
                  c.stores.map((s) => (
                    <div key={s.id} className="rounded-xl border border-line p-3">
                      <p className="text-sm font-medium text-ink">{s.title}</p>
                      <p className="tnum mt-0.5 text-xs text-muted">
                        {s.uzumShopId ? `${t('stores.shop', { id: s.uzumShopId })} · ` : ''}
                        {t('stores.counts', { products: f.num(s.products), orders: f.num(s.orders) })}
                      </p>
                      {s.lastOrderAt ? (
                        <p className="tnum mt-0.5 text-xs text-muted">{t('stores.lastOrder', { date: f.date(s.lastOrderAt) })}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardBody>
        </Card>
      </div>

      <ProductsCard companyId={id} multiStore={(c?.stores.length ?? 0) > 1} />
    </div>
  );
}

function ProductsCard({ companyId, multiStore }: { companyId: string; multiStore: boolean }) {
  const t = useT('adminCompany');
  const f = useFormat();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('live');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const products = useQuery({
    queryKey: ['admin-company-products', companyId, term, filter, page],
    queryFn: () =>
      api.get<Paginated<AdminCompanySkuRow>>(`/admin/companies/${companyId}/products`, {
        search: term || undefined,
        filter: filter === 'live' ? undefined : filter,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  });

  const columns: Column<AdminCompanySkuRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
            {r.imageUrl ? (
              <img src={r.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted">
                <ImageOff className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium text-ink" title={r.title}>
              {r.title}
            </p>
            <p className="truncate text-xs text-muted">
              {r.variant ? `${r.variant} · ` : ''}
              {r.sku}
            </p>
          </div>
        </div>
      ),
    },
    ...(multiStore
      ? [
          {
            key: 'store',
            header: t('col.store'),
            hideOnMobile: true,
            render: (r: AdminCompanySkuRow) => <span className="text-xs text-muted">{r.storeTitle}</span>,
          },
        ]
      : []),
    {
      key: 'price',
      header: t('col.price'),
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className="tnum whitespace-nowrap text-sm text-ink">{r.price > 0 ? f.money(r.price) : '—'}</p>
          {r.oldPrice > r.price && r.price > 0 ? (
            <p className="tnum whitespace-nowrap text-xs text-muted line-through">{f.money(r.oldPrice)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'cost',
      header: t('col.cost'),
      align: 'right',
      render: (r) =>
        r.purchasePrice > 0 ? (
          <div className="text-right">
            <p className="tnum whitespace-nowrap text-sm font-medium text-ink">{f.money(r.purchasePrice)}</p>
            {r.extraCost > 0 ? (
              <p className="tnum whitespace-nowrap text-xs text-muted">{t('cost.extra', { v: f.money(r.extraCost) })}</p>
            ) : null}
          </div>
        ) : (
          <span className="whitespace-nowrap text-xs font-medium text-warn-ink">{t('cost.none')}</span>
        ),
    },
    {
      key: 'stock',
      header: t('col.stock'),
      align: 'right',
      render: (r) => (
        <div className="text-right">
          <p className={cn('tnum text-sm', r.stock === 0 ? 'text-muted' : 'text-ink')}>{f.num(r.stock)}</p>
          {r.stock > 0 && r.stockCost > 0 ? (
            <p className="tnum whitespace-nowrap text-xs text-muted">{t('stock.cost', { v: f.money(r.stockCost) })}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'payout',
      header: t('col.payout'),
      align: 'right',
      render: (r) => (
        <div className="text-right" title={r.payoutSource === 'estimate' ? t('payout.estimate') : undefined}>
          <p className={cn('tnum whitespace-nowrap text-sm', r.stock > 0 ? 'font-medium text-ink' : 'text-muted')}>
            {r.stock > 0 ? f.money(r.stockPayout) : '—'}
          </p>
          {r.payoutPerUnit > 0 ? (
            <p className="tnum whitespace-nowrap text-xs text-muted">
              {r.payoutSource === 'estimate' ? '≈ ' : ''}
              {t('payout.unit', { v: f.money(r.payoutPerUnit) })}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'uzum',
      header: t('col.uzum'),
      align: 'right',
      render: (r) =>
        r.uzumUrl ? (
          <a
            href={r.uzumUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs"
          >
            {t('uzum.open')}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-xs text-muted">{t('uzum.noId')}</span>
        ),
    },
  ];

  const data = products.data;

  return (
    <Card>
      <CardHeader
        icon={<Package className="h-4 w-4" />}
        title={t('products.title')}
        subtitle={data ? `${f.num(data.total)} ${t('common.rows')}` : undefined}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Segmented<Filter>
              size="sm"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'live', label: t('filter.live') },
                { value: 'noCost', label: t('filter.noCost') },
                { value: 'archived', label: t('filter.archived') },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder={t('products.search')} className="w-full sm:w-64" />
          </div>
        }
      />
      <div className="mt-4">
        {products.isError ? (
          <ErrorState message={errText(products.error)} onRetry={() => void products.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(r) => r.id}
            loading={products.isLoading}
            density="compact"
            localSort={false}
            empty={<EmptyState icon={<Package className="h-6 w-6" />} title={t('products.empty')} hint={t('products.emptyHint')} />}
            pagination={
              data && data.pages > 1
                ? { page: data.page, pages: data.pages, total: data.total, pageSize: PAGE_SIZE, onPage: setPage }
                : undefined
            }
          />
        )}
      </div>
    </Card>
  );
}
