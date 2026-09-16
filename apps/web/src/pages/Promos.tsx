import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Megaphone, Percent, TrendingUp } from 'lucide-react';
import type { PromoRow, PromoSkuRow, PromosResponse } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
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
  Skeleton,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';

registerNamespace('promos', {
  uz: {
    title: 'Aksiyalar',
    subtitle: 'Uzum taklif qilgan kampaniyalar va ularning har donaga ta’siri',
    'kpi.promos': 'Faol kampaniyalar',
    'kpi.matched': 'Mos tovarlar',
    'kpi.joined': 'Qatnashayotgan',
    'kpi.potential': 'Kutilayotgan foyda',
    'kpi.potentialHint': 'Qatnashmagan foydali SKU’lar, 30 kunlik sotuv tezligida',
    'kpi.matchedHint': 'Uzum aksiyaga taklif qilgan SKU soni',
    'kpi.joinedHint': 'Siz allaqachon qo‘shgan tovarlar',
    'card.matched': 'Mos tovarlar',
    'card.joined': 'Qatnashyapti',
    'card.profitable': 'Foydali, lekin qo‘shilmagan',
    'card.discount': 'O‘rtacha chegirma',
    'col.product': 'Mahsulot',
    'col.price': 'Joriy narx',
    'col.promoPrice': 'Aksiya narxi',
    'col.discount': 'Chegirma',
    'col.profitNow': 'Hozirgi foyda',
    'col.profitPromo': 'Aksiyadagi foyda',
    'col.delta': 'Farq',
    'col.margin': 'Marja',
    'col.sold': '30 kun sotuv',
    'col.state': 'Holat',
    'state.joined': 'Qatnashyapti',
    'state.out': 'Qo‘shilmagan',
    'empty.title': 'Hozircha aksiya taklifi yo‘q',
    'empty.hint': 'Uzum yangi kampaniya e’lon qilganda bu yerda ko‘rinadi',
    'table.empty': 'Bu kampaniyada tovar yo‘q',
    hint: 'Foyda bir dona uchun: aksiya narxidan komissiya, yetkazish, tannarx va soliq ayirilgan. Saqlash to‘lovi qo‘shilmagan — u aksiyaga bog‘liq emas.',
    loss: 'Zararga ishlaydi',
    'promo.applied': 'Chegirma joriy narxga singgan — alohida aksiya narxi yo‘q',
  },
  ru: {
    title: 'Акции',
    subtitle: 'Кампании от Uzum и их влияние на прибыль с единицы',
    'kpi.promos': 'Активные кампании',
    'kpi.matched': 'Подходящие товары',
    'kpi.joined': 'Участвуют',
    'kpi.potential': 'Ожидаемая прибыль',
    'kpi.potentialHint': 'Прибыльные SKU вне акции, при текущей скорости продаж',
    'kpi.matchedHint': 'Сколько SKU предложил Uzum',
    'kpi.joinedHint': 'Товары, которые вы уже добавили',
    'card.matched': 'Подходящие',
    'card.joined': 'Участвуют',
    'card.profitable': 'Прибыльные, но не добавлены',
    'card.discount': 'Средняя скидка',
    'col.product': 'Товар',
    'col.price': 'Текущая цена',
    'col.promoPrice': 'Цена акции',
    'col.discount': 'Скидка',
    'col.profitNow': 'Прибыль сейчас',
    'col.profitPromo': 'Прибыль в акции',
    'col.delta': 'Разница',
    'col.margin': 'Маржа',
    'col.sold': 'Продажи 30 дн',
    'col.state': 'Статус',
    'state.joined': 'Участвует',
    'state.out': 'Не добавлен',
    'empty.title': 'Пока нет предложений',
    'empty.hint': 'Когда Uzum объявит кампанию, она появится здесь',
    'table.empty': 'В этой кампании нет товаров',
    hint: 'Прибыль на единицу: из цены акции вычтены комиссия, доставка, себестоимость и налог. Хранение не учтено — оно не зависит от акции.',
    loss: 'В убыток',
    'promo.applied': 'Скидка уже в текущей цене — отдельной цены акции нет',
  },
  en: {
    title: 'Promotions',
    subtitle: 'Uzum campaigns and what they do to your per-unit profit',
    'kpi.promos': 'Active campaigns',
    'kpi.matched': 'Matched products',
    'kpi.joined': 'Participating',
    'kpi.potential': 'Expected profit',
    'kpi.potentialHint': 'Profitable SKUs not yet in, at the last 30 days’ pace',
    'kpi.matchedHint': 'SKUs Uzum offered for a promotion',
    'kpi.joinedHint': 'Products you already added',
    'card.matched': 'Matched',
    'card.joined': 'Participating',
    'card.profitable': 'Profitable but not added',
    'card.discount': 'Average discount',
    'col.product': 'Product',
    'col.price': 'Current price',
    'col.promoPrice': 'Promo price',
    'col.discount': 'Discount',
    'col.profitNow': 'Profit now',
    'col.profitPromo': 'Profit in promo',
    'col.delta': 'Difference',
    'col.margin': 'Margin',
    'col.sold': 'Sold in 30d',
    'col.state': 'State',
    'state.joined': 'Participating',
    'state.out': 'Not added',
    'empty.title': 'No promotion offers yet',
    'empty.hint': 'When Uzum announces a campaign it will show up here',
    'table.empty': 'No products in this campaign',
    hint: 'Per-unit profit: promo price minus commission, delivery, cost price and tax. Storage is excluded — it does not depend on the promo.',
    loss: 'Runs at a loss',
    'promo.applied': 'The discount is already in the current price',
  },
});

export default function Promos() {
  const t = useT('promos');
  const f = useFormat();
  const q = usePeriodQuery();

  const [openPromo, setOpenPromo] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['promos', q],
    queryFn: () => api.get<PromosResponse>('/marketing/promos', q),
  });

  const promos = data?.promos ?? [];
  const active = useMemo(
    () => promos.find((p) => p.name === openPromo) ?? promos[0],
    [promos, openPromo],
  );

  const columns: Column<PromoSkuRow>[] = [
    {
      key: 'title',
      header: t('col.product'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
    },
    {
      key: 'state',
      header: t('col.state'),
      render: (r) => (
        <Badge tone={r.joined ? 'brand' : 'muted'} dot>
          {r.joined ? t('state.joined') : t('state.out')}
        </Badge>
      ),
    },
    { key: 'price', header: t('col.price'), align: 'right', render: (r) => <span className="tnum">{f.money(r.price)}</span> },
    {
      key: 'promoPrice',
      header: t('col.promoPrice'),
      align: 'right',
      // Qatnashayotgan tovarda alohida aksiya narxi bo'lmaydi — u joriy narxga singgan
      render: (r) =>
        r.promoPrice > 0 ? (
          <span className="tnum font-semibold">{f.money(r.promoPrice)}</span>
        ) : (
          <span className="text-muted" title={t('promo.applied')}>
            —
          </span>
        ),
    },
    {
      key: 'discountPct',
      header: t('col.discount'),
      align: 'right',
      render: (r) =>
        r.promoPrice > 0 ? (
          <span className="tnum text-warn-ink">−{f.pct(r.discountPct, 0)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'profitNow',
      header: t('col.profitNow'),
      align: 'right',
      render: (r) => <span className="tnum text-muted">{f.money(r.profitNow)}</span>,
    },
    {
      key: 'profitPromo',
      header: t('col.profitPromo'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum font-semibold', r.profitPromo >= 0 ? 'text-brand-ink' : 'text-danger')}>
          {f.money(r.profitPromo)}
        </span>
      ),
    },
    {
      key: 'marginPromo',
      header: t('col.margin'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.marginPromo >= 0 ? 'text-ink' : 'text-danger')}>{f.pct(r.marginPromo)}</span>
      ),
    },
    {
      key: 'unitsSold',
      header: t('col.sold'),
      align: 'right',
      render: (r) => <span className="tnum">{f.num(r.unitsSold)}</span>,
    },
  ];

  if (isError) {
    return (
      <>
        <PageHeader icon={<Megaphone className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="promos" />}
      />

      <PlanGate feature="promos">
        <StatGrid>
          <StatCard
            label={t('kpi.promos')}
            value={f.num(data?.totals.promos ?? 0)}
            icon={<Megaphone className="h-5 w-5" />}
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.matched')}
            value={f.num(data?.totals.matched ?? 0)}
            hint={t('kpi.matchedHint')}
            icon={<Percent className="h-5 w-5" />}
            tone="info"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.joined')}
            value={f.num(data?.totals.joined ?? 0)}
            hint={t('kpi.joinedHint')}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="brand"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.potential')}
            value={f.money(data?.totals.potentialProfit ?? 0)}
            hint={t('kpi.potentialHint')}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="violet"
            loading={isLoading}
          />
        </StatGrid>

        {isLoading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : promos.length === 0 ? (
          <Card className="mt-5">
            <EmptyState icon={<Megaphone className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
          </Card>
        ) : (
          <>
            {/* Kampaniya kartochkalari — bosilganda pastdagi jadval almashadi */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {promos.map((p) => (
                <PromoCard
                  key={p.name}
                  promo={p}
                  active={active?.name === p.name}
                  onClick={() => setOpenPromo(p.name)}
                />
              ))}
            </div>

            {active ? (
              <Card className="mt-5">
                <CardHeader
                  icon={<Percent className="h-4 w-4" />}
                  title={active.name}
                  subtitle={t('hint')}
                />
                <DataTable<PromoSkuRow>
                  columns={columns}
                  rows={active.rows}
                  rowKey={(r) => r.skuId}
                  empty={<EmptyState icon={<Megaphone className="h-6 w-6" />} title={t('table.empty')} />}
                />
              </Card>
            ) : null}
          </>
        )}
      </PlanGate>
    </>
  );
}

/** Bitta kampaniya kartochkasi */
function PromoCard({ promo, active, onClick }: { promo: PromoRow; active: boolean; onClick: () => void }) {
  const t = useT('promos');
  const f = useFormat();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card card-hover p-4 text-left transition-all',
        active && 'border-line-strong ring-2 ring-brand/40',
      )}
    >
      <p className="line-clamp-2 font-display text-sm font-bold leading-snug text-ink">{promo.name}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-2xs">
        <Stat label={t('card.matched')} value={f.num(promo.matched)} />
        <Stat label={t('card.joined')} value={f.num(promo.joined)} tone="brand" />
        <Stat label={t('card.profitable')} value={f.num(promo.profitable)} tone="violet" />
        <Stat label={t('card.discount')} value={f.pct(promo.avgDiscountPct, 0)} tone="warn" />
      </div>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'violet' | 'warn' }) {
  const color =
    tone === 'brand' ? 'text-brand-ink' : tone === 'violet' ? 'text-violet-ink' : tone === 'warn' ? 'text-warn-ink' : 'text-ink';
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-2.5 py-2">
      <p className="truncate uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('tnum mt-0.5 text-sm font-bold', color)}>{value}</p>
    </div>
  );
}
