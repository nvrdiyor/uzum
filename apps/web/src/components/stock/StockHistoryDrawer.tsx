import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Lightbulb, PackagePlus, TrendingDown } from 'lucide-react';
import { addDays, parseISODate, toISODate, type StockRow } from '@savdoiq/shared';
import { Button, Drawer, ErrorState, ProductCell, Skeleton, EmptyState } from '@/components/ui';
import { LinesChart, CHART_COLORS } from '@/components/charts';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { DaysLeftCell, MetaRow, StockStatusBadge } from './common';
import type { StockHistoryPoint } from './types';

registerNamespace('stocks', {
  uz: {
    'drawer.title': 'Qoldiq tarixi',
    'drawer.history': 'So‘nggi 60 kun',
    'drawer.historyHint': 'FBO, FBS va o‘z omboringizdagi kunlik qoldiq',
    'drawer.empty': 'Bu SKU bo‘yicha tarix hali yig‘ilmagan',
    'drawer.emptyHint': 'Sinxronizatsiya tugagach, kunlik qoldiqlar shu yerda ko‘rinadi',
    'drawer.recommend': 'Tavsiya',
    'drawer.orderQty': 'Buyurtma qilish tavsiya etiladi',
    'drawer.orderCost': 'Taxminiy tannarx',
    'drawer.cover': '30 kunlik zaxira + 7 kun yetkazib berish muddati hisobga olingan',
    'drawer.enough': 'Qoldiq yetarli — hozircha buyurtma shart emas',
    'drawer.dead': 'Sotuv yo‘q — avval chegirma yoki aksiya bilan sotishni ko‘rib chiqing',
    'drawer.stockout': 'Taxminiy tugash sanasi',
    'drawer.units': 'dona',
    'field.fbo': 'FBO',
    'field.fbs': 'FBS',
    'field.own': 'O‘z ombori',
    'field.reserved': 'Band',
    'field.inTransit': 'Yo‘lda',
    'field.total': 'Jami qoldiq',
    'field.costValue': 'Tannarx qiymati',
    'field.retailValue': 'Chakana qiymat',
    'field.avgDaily': 'Kunlik o‘rtacha sotuv',
    'field.daysLeft': 'Necha kunga yetadi',
    'field.store': 'Do‘kon',
  },
  ru: {
    'drawer.title': 'История остатков',
    'drawer.history': 'Последние 60 дней',
    'drawer.historyHint': 'Ежедневный остаток на FBO, FBS и своём складе',
    'drawer.empty': 'История по этому SKU ещё не собрана',
    'drawer.emptyHint': 'После синхронизации здесь появятся ежедневные остатки',
    'drawer.recommend': 'Рекомендация',
    'drawer.orderQty': 'Рекомендуем заказать',
    'drawer.orderCost': 'Ориентировочная себестоимость',
    'drawer.cover': 'Учтён запас на 30 дней + 7 дней на поставку',
    'drawer.enough': 'Остатка достаточно — заказывать пока не нужно',
    'drawer.dead': 'Продаж нет — сначала рассмотрите скидку или акцию',
    'drawer.stockout': 'Ожидаемая дата обнуления',
    'drawer.units': 'шт',
    'field.fbo': 'FBO',
    'field.fbs': 'FBS',
    'field.own': 'Свой склад',
    'field.reserved': 'Зарезервировано',
    'field.inTransit': 'В пути',
    'field.total': 'Всего остаток',
    'field.costValue': 'Стоимость по себестоимости',
    'field.retailValue': 'Розничная стоимость',
    'field.avgDaily': 'Средние продажи в день',
    'field.daysLeft': 'На сколько дней хватит',
    'field.store': 'Магазин',
  },
  en: {
    'drawer.title': 'Stock history',
    'drawer.history': 'Last 60 days',
    'drawer.historyHint': 'Daily stock across FBO, FBS and your own warehouse',
    'drawer.empty': 'No history collected for this SKU yet',
    'drawer.emptyHint': 'Daily stock levels appear here once the sync completes',
    'drawer.recommend': 'Recommendation',
    'drawer.orderQty': 'Recommended order quantity',
    'drawer.orderCost': 'Estimated cost',
    'drawer.cover': 'Covers 30 days of demand plus a 7-day lead time',
    'drawer.enough': 'Stock is sufficient — no order needed right now',
    'drawer.dead': 'No sales — consider a discount or promo first',
    'drawer.stockout': 'Estimated stock-out date',
    'drawer.units': 'pcs',
    'field.fbo': 'FBO',
    'field.fbs': 'FBS',
    'field.own': 'Own warehouse',
    'field.reserved': 'Reserved',
    'field.inTransit': 'In transit',
    'field.total': 'Total stock',
    'field.costValue': 'Cost value',
    'field.retailValue': 'Retail value',
    'field.avgDaily': 'Average daily sales',
    'field.daysLeft': 'Days of cover',
    'field.store': 'Store',
  },
});

/** Zaxira va yetkazib berish muddati (kun) */
const COVER_DAYS = 30;
const LEAD_DAYS = 7;

export function StockHistoryDrawer({
  row,
  onClose,
  onCreateShipment,
}: {
  row: StockRow | null;
  onClose: () => void;
  onCreateShipment?: (row: StockRow) => void;
}) {
  const t = useT('stocks');
  const f = useFormat();
  const skuId = row?.skuId ?? null;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stocks-history', skuId],
    queryFn: () => api.get<StockHistoryPoint[]>('/stocks/history', { skuId: skuId ?? '', days: 60 }),
    enabled: Boolean(skuId),
  });

  const series = useMemo(
    () =>
      (data ?? []).map((p) => ({
        date: p.date,
        fbo: p.fbo ?? 0,
        fbs: p.fbs ?? 0,
        own: p.own ?? 0,
      })),
    [data],
  );

  const advice = useMemo(() => {
    if (!row) return null;
    const avg = Math.max(0, row.avgDaily ?? 0);
    const need = Math.max(0, Math.ceil(avg * (COVER_DAYS + LEAD_DAYS) - (row.total ?? 0)));
    const unitCost = row.total > 0 ? row.costValue / row.total : 0;
    const stockoutDate =
      avg > 0 && row.daysLeft !== null && Number.isFinite(row.daysLeft)
        ? toISODate(addDays(parseISODate(toISODate(new Date())), Math.round(row.daysLeft)))
        : null;
    return { avg, need, cost: Math.round(need * unitCost), stockoutDate };
  }, [row]);

  return (
    <Drawer open={Boolean(row)} onClose={onClose} title={t('drawer.title')}>
      {row ? (
        <div className="space-y-5">
          <div className="card p-4">
            <ProductCell title={row.title} subtitle={row.sku} imageUrl={row.imageUrl} size={52} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StockStatusBadge status={row.status} />
              <span className="chip bg-surface-3 text-muted">{row.storeTitle}</span>
            </div>
          </div>

          <div className="card px-4 py-1">
            <MetaRow label={t('field.fbo')} value={f.num(row.fbo)} />
            <div className="hairline" />
            <MetaRow label={t('field.fbs')} value={f.num(row.fbs)} />
            <div className="hairline" />
            <MetaRow label={t('field.own')} value={f.num(row.own)} />
            <div className="hairline" />
            <MetaRow label={t('field.reserved')} value={f.num(row.reserved)} />
            <div className="hairline" />
            <MetaRow label={t('field.inTransit')} value={f.num(row.inTransit)} />
            <div className="hairline" />
            <MetaRow label={t('field.total')} value={f.num(row.total)} tone="brand" />
            <div className="hairline" />
            <MetaRow label={t('field.costValue')} value={f.money(row.costValue)} />
            <div className="hairline" />
            <MetaRow label={t('field.retailValue')} value={f.money(row.retailValue)} />
            <div className="hairline" />
            <MetaRow label={t('field.avgDaily')} value={`${f.num(row.avgDaily, 1)} ${t('drawer.units')}`} />
            <div className="hairline" />
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-muted">{t('field.daysLeft')}</span>
              <DaysLeftCell days={row.daysLeft} />
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3">
              <h3 className="section-title">{t('drawer.history')}</h3>
              <p className="mt-0.5 text-sm text-muted">{t('drawer.historyHint')}</p>
            </div>

            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : isError ? (
              <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
            ) : series.length === 0 ? (
              <EmptyState
                icon={<TrendingDown className="h-6 w-6" />}
                title={t('drawer.empty')}
                hint={t('drawer.emptyHint')}
              />
            ) : (
              <LinesChart
                data={series}
                xKey="date"
                height={260}
                series={[
                  { key: 'fbo', name: t('field.fbo'), color: CHART_COLORS.brand },
                  { key: 'fbs', name: t('field.fbs'), color: CHART_COLORS.info },
                  { key: 'own', name: t('field.own'), color: CHART_COLORS.violet },
                ]}
              />
            )}
          </div>

          {advice ? (
            <div className="card border-brand/30 bg-brand/5 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/[0.12] text-brand-ink">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-ink">{t('drawer.recommend')}</p>

                  {advice.avg <= 0 ? (
                    <p className="mt-1.5 text-sm text-muted">{t('drawer.dead')}</p>
                  ) : advice.need <= 0 ? (
                    <p className="mt-1.5 text-sm text-muted">{t('drawer.enough')}</p>
                  ) : (
                    <>
                      <p className="tnum mt-2 font-display text-2xl font-extrabold text-brand">
                        {f.num(advice.need)} <span className="text-base text-ink-soft">{t('drawer.units')}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted">{t('drawer.cover')}</p>
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted">{t('drawer.orderCost')}</span>
                          <span className="tnum font-semibold text-ink">{f.money(advice.cost)}</span>
                        </div>
                        {advice.stockoutDate ? (
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted">{t('drawer.stockout')}</span>
                            <span className="tnum font-semibold text-warn">{f.date(advice.stockoutDate)}</span>
                          </div>
                        ) : null}
                      </div>
                      {onCreateShipment ? (
                        <Button
                          className="mt-4"
                          size="sm"
                          icon={<PackagePlus className="h-3.5 w-3.5" />}
                          onClick={() => onCreateShipment(row)}
                        >
                          {t('drawer.orderQty')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState icon={<Boxes className="h-6 w-6" />} title={t('drawer.empty')} />
      )}
    </Drawer>
  );
}
