import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Lightbulb, PackagePlus, TrendingDown, Truck } from '@/components/icons';
import type { StockRow } from '@savdoiq/shared';
import { Button, Drawer, ErrorState, ProductCell, Skeleton, EmptyState } from '@/components/ui';
import { LinesChart, CHART_COLORS } from '@/components/charts';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
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
    'drawer.cover': '{cover} kunlik zaxira + {lead} kun yetkazib berish muddati — kompaniya sozlamasi, Rejalashtiruvchi bilan bir xil hisob',
    'drawer.buy': 'Sotib olish kerak',
    'drawer.ship': 'Ombordan FBO’ga jo‘nating: {n} dona',
    'drawer.shipOnly': 'Sotib olish shart emas — omboringizdagi tovar yetadi',
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
    'drawer.cover': 'Запас на {cover} дн. + {lead} дн. на поставку — настройка компании, тот же расчёт, что в Планировщике',
    'drawer.buy': 'Нужно закупить',
    'drawer.ship': 'Отгрузить со склада на FBO: {n} шт.',
    'drawer.shipOnly': 'Закупать не нужно — хватит товара на вашем складе',
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
    'drawer.cover': 'Covers {cover} days of demand plus a {lead}-day lead time — company setting, same as the Planner',
    'drawer.buy': 'To buy',
    'drawer.ship': 'Ship from your warehouse to FBO: {n} pcs',
    'drawer.shipOnly': 'No purchase needed — your warehouse stock covers it',
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

  /*
   * Tavsiya — serverdagi Rejalashtiruvchi hisobi (StockRow.plan, services/plan.ts):
   * kompaniyaning yetkazish muddati, tugab turgan kunlarsiz tezlik, yo'ldagi
   * tovar. Ilgari bu yerda o'zi hisoblanardi — 30 + 7 kun qat'iy, oddiy
   * o'rtacha, yo'ldagisiz — va son Rejalashtiruvchidagidan farq qilardi
   * (2026-10-24). Arxivdagi SKU rejada yo'q — tavsiya ham ko'rsatilmaydi.
   */
  const advice = useMemo(() => {
    const plan = row?.plan;
    if (!plan) return null;
    return {
      avg: plan.avgDaily,
      need: plan.reorderQty,
      ship: plan.shipQty,
      cost: plan.purchaseCost,
      stockoutDate: plan.avgDaily > 0 ? plan.stockoutDate : null,
      cover: plan.coverDays,
      lead: plan.leadDays,
    };
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
            <MetaRow label={t('field.total')} value={f.num(row.total)} tone="info" />
            <div className="hairline" />
            <MetaRow label={t('field.costValue')} value={f.money(row.costValue)} />
            <div className="hairline" />
            <MetaRow label={t('field.retailValue')} value={f.money(row.retailValue)} />
            <div className="hairline" />
            <MetaRow label={t('field.avgDaily')} value={`${f.num(row.avgDaily, 1)} ${t('drawer.units')}`} />
            <div className="hairline" />
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-muted">{t('field.daysLeft')}</span>
              <DaysLeftCell days={row.daysLeft} status={row.status} />
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
                // Qoldiq — ombor ranglarida; binafsha faqat Uzum ulushi, yashil — foyda uchun
                series={[
                  { key: 'fbo', name: t('field.fbo'), color: CHART_COLORS.info },
                  { key: 'fbs', name: t('field.fbs'), color: CHART_COLORS.teal },
                  { key: 'own', name: t('field.own'), color: CHART_COLORS.slate },
                ]}
              />
            )}
          </div>

          {advice ? (
            /*
              Tavsiya kartochkasi neytral fonda, ohang — aksent chiziq va ikonka:
              buyurtma kerak bo'lsa sariq, aks holda brend. Ilgari yashil fonli
              blok edi va "buyurtma bering" ham, "hammasi joyida" ham bir xil ko'rinardi.
            */
            <div
              className={cn(
                'card card-accent p-5',
                advice.avg > 0 && (advice.need > 0 || advice.ship > 0) ? 'tone-warn' : 'tone-brand',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4">
                  <Lightbulb />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-ink">{t('drawer.recommend')}</p>

                  {advice.avg <= 0 ? (
                    <p className="mt-1.5 text-sm text-muted">{t('drawer.dead')}</p>
                  ) : advice.need <= 0 && advice.ship <= 0 ? (
                    <p className="mt-1.5 text-sm text-muted">{t('drawer.enough')}</p>
                  ) : (
                    <>
                      {advice.need > 0 ? (
                        <>
                          <p className="mt-1.5 text-xs font-medium text-muted">{t('drawer.buy')}</p>
                          <p className="tnum mt-0.5 font-display text-2xl font-extrabold tracking-tight text-ink">
                            {f.num(advice.need)} <span className="text-base text-ink-soft">{t('drawer.units')}</span>
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-sm text-muted">{t('drawer.shipOnly')}</p>
                      )}
                      {advice.ship > 0 ? (
                        <p className="tnum mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-info-ink">
                          <Truck className="h-4 w-4 shrink-0" />
                          {t('drawer.ship', { n: f.num(advice.ship) })}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted">{t('drawer.cover', { cover: advice.cover, lead: advice.lead })}</p>
                      <div className="mt-3 space-y-1">
                        {advice.need > 0 ? (
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted">{t('drawer.orderCost')}</span>
                            <span className="tnum font-semibold text-ink">{f.money(advice.cost)}</span>
                          </div>
                        ) : null}
                        {advice.stockoutDate ? (
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted">{t('drawer.stockout')}</span>
                            <span className="tnum font-semibold text-warn-ink">{f.date(advice.stockoutDate)}</span>
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
