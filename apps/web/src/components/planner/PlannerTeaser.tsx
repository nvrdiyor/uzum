/**
 * Rejalashtiruvchi — tarifda faqat 'preview' bo'lganda (sinov).
 *
 * Ilgari bu yerda butun sahifa xiralashib, ustida qulf oynali oq kartochka
 * turardi: jadval so'rovi 402 qaytarardi va xiralashgan narsa xato kartochkasi
 * edi — sotuvchi nimani yo'qotayotganini ko'rmasdi. Endi uning O'Z eng
 * shoshilinch SKU'lari haqiqiy raqamlar bilan ochiq turadi (server: GET
 * /planner/preview), qolgan reja esa PlanGate `previewChildren` da namunaviy
 * jadval bo'lib xiralashadi — to'liq ro'yxat ma'lumoti brauzerga umuman kelmaydi.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, PackagePlus, Sparkles, Truck } from '@/components/icons';
import type { PlannerPreviewResponse, PlannerRow } from '@savdoiq/shared';
import { Badge, Card, CardHeader, ErrorState, HeroCard, PlanGate, ProductThumb, ProgressBar, Skeleton, type Tone } from '@/components/ui';
import { SkuNameCell } from '@/components/stock/common';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useFeature } from '@/store/session';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { PlannerParams } from './PlannerParams';

registerNamespace('planner', {
  uz: {
    'teaser.eyebrow': 'Sizning ma’lumotlaringiz bo‘yicha',
    'teaser.critical': '{n} ta SKU tovar kelguncha tugaydi',
    'teaser.need': '{n} ta SKU’ni buyurtma qilish vaqti keldi',
    'teaser.calm': 'Hozircha shoshilinch SKU yo‘q',
    'teaser.lost': 'Bugun buyurtma bersangiz ham yetib kelguncha yo‘qotiladi: {v}',
    'teaser.top': 'Eng shoshilinchlari',
    'teaser.out': 'Tugagan',
    'teaser.days': '{n} kunga yetadi',
    'teaser.until': '{date} gacha',
    'teaser.buy': 'Sotib oling: {n} dona',
    'teaser.ship': 'FBO’ga: {n} dona',
    'teaser.noSales': 'Sotuv yo‘q',
    'teaser.lockTitle': 'To‘liq reja — pullik tarifda',
    'teaser.lockHint': 'Yana {n} ta SKU: buyurtma kuni, sotib olish va jo‘natish miqdori, bir bosishda yetkazma va Excel ro‘yxat',
    'teaser.lockHintNone': 'Har SKU uchun buyurtma kuni, sotib olish va jo‘natish miqdori, bir bosishda yetkazma va Excel ro‘yxat',
    'teaser.sampleTitle': 'Buyurtma rejasi',
    'teaser.sampleSub': 'Har SKU uchun qoldiq, sotuv sur’ati va tavsiya',
    'status.critical': 'Kritik',
    'status.ending': 'Buyurtma vaqti',
    'status.enough': 'Yetarli',
    'status.no_action': 'Harakatsiz',
  },
  ru: {
    'teaser.eyebrow': 'По вашим данным',
    'teaser.critical': 'SKU закончатся до прихода товара: {n}',
    'teaser.need': 'Пора заказывать, SKU: {n}',
    'teaser.calm': 'Срочных SKU пока нет',
    'teaser.lost': 'Даже при заказе сегодня до прихода потеряется: {v}',
    'teaser.top': 'Самые срочные',
    'teaser.out': 'Закончился',
    'teaser.days': 'хватит на {n} дн.',
    'teaser.until': 'до {date}',
    'teaser.buy': 'Закупить: {n} шт.',
    'teaser.ship': 'На FBO: {n} шт.',
    'teaser.noSales': 'Нет продаж',
    'teaser.lockTitle': 'Полный план — на платном тарифе',
    'teaser.lockHint': 'Ещё SKU: {n} — день заказа, сколько закупить и отгрузить, поставка в один клик и список в Excel',
    'teaser.lockHintNone': 'День заказа, сколько закупить и отгрузить по каждому SKU, поставка в один клик и список в Excel',
    'teaser.sampleTitle': 'План закупки',
    'teaser.sampleSub': 'Остаток, темп продаж и рекомендация по каждому SKU',
    'status.critical': 'Критично',
    'status.ending': 'Пора заказывать',
    'status.enough': 'Достаточно',
    'status.no_action': 'Без движения',
  },
  en: {
    'teaser.eyebrow': 'Based on your data',
    'teaser.critical': '{n} SKUs run out before new stock arrives',
    'teaser.need': 'Time to reorder {n} SKUs',
    'teaser.calm': 'No urgent SKUs right now',
    'teaser.lost': 'Even if you order today, you lose before arrival: {v}',
    'teaser.top': 'Most urgent',
    'teaser.out': 'Out of stock',
    'teaser.days': 'lasts {n} days',
    'teaser.until': 'until {date}',
    'teaser.buy': 'Buy: {n} pcs',
    'teaser.ship': 'To FBO: {n} pcs',
    'teaser.noSales': 'No sales',
    'teaser.lockTitle': 'Full plan — on a paid plan',
    'teaser.lockHint': '{n} more SKUs: order dates, buy and ship quantities, one-click shipment and an Excel list',
    'teaser.lockHintNone': 'Order dates, buy and ship quantities for every SKU, one-click shipment and an Excel list',
    'teaser.sampleTitle': 'Reorder plan',
    'teaser.sampleSub': 'Stock, sales pace and the recommendation for every SKU',
    'status.critical': 'Critical',
    'status.ending': 'Time to order',
    'status.enough': 'Healthy',
    'status.no_action': 'No movement',
  },
});

export const PLAN_STATUS_TONE: Record<PlannerRow['status'], Tone> = {
  critical: 'danger',
  ending: 'warn',
  enough: 'brand',
  no_action: 'muted',
};

/**
 * Xiralashgan "qolgan reja" — NAMUNA qatorlar (haqiqiy ro'yxat emas): ular
 * faqat jadval shaklini ko'rsatadi, sinov tarifida to'liq reja ma'lumoti
 * serverdan kelmaydi. Kunlar va miqdorlar real rejaga o'xshash taqsimotda.
 */
const SAMPLE: { name: string; days: number; qty: number; tone: Tone }[] = [
  { name: 'Mahsulot A', days: 2, qty: 48, tone: 'danger' },
  { name: 'Mahsulot B', days: 5, qty: 36, tone: 'danger' },
  { name: 'Mahsulot C', days: 11, qty: 24, tone: 'warn' },
  { name: 'Mahsulot D', days: 15, qty: 18, tone: 'warn' },
  { name: 'Mahsulot E', days: 26, qty: 9, tone: 'brand' },
  { name: 'Mahsulot F', days: 41, qty: 0, tone: 'brand' },
];

function SamplePlan() {
  const t = useT('planner');
  return (
    <Card>
      <CardHeader icon={<Sparkles />} title={t('teaser.sampleTitle')} subtitle={t('teaser.sampleSub')} />
      <div className="mt-4 divide-y divide-line border-t border-line">
        {SAMPLE.map((r) => (
          <div key={r.name} className="flex items-center gap-4 px-5 py-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
              <ProductThumb name={r.name} style={{ fontSize: 14 }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{r.name}</p>
              <p className="text-xs text-muted">SKU-0000</p>
            </div>
            <div className="hidden w-32 sm:block">
              <p className="tnum text-sm font-semibold text-ink">
                {r.days} {t('ctrl.days')}
              </p>
              <ProgressBar value={Math.min(100, (r.days / 37) * 100)} tone={r.tone} className="mt-1.5" />
            </div>
            <span className="tnum w-14 text-right font-display text-base font-extrabold text-ink">{r.qty || '—'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Ochiq ko'rinadigan bitta SKU — sotuvchining o'z raqamlari */
function TeaserRow({ row }: { row: PlannerRow }) {
  const t = useT('planner');
  const f = useFormat();
  return (
    <li className="well flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <SkuNameCell
        className="min-w-0 sm:max-w-[22rem]"
        title={row.title}
        subtitle={row.variant ? `${row.variant} · ${row.sku}` : row.sku}
        imageUrl={row.imageUrl}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <Badge tone={PLAN_STATUS_TONE[row.status]} dot>
          {t(`status.${row.status}`)}
        </Badge>
        <span className="tnum text-xs font-semibold text-ink">
          {row.daysLeft === null
            ? t('teaser.noSales')
            : row.daysLeft <= 0 && row.stock <= 0
              ? t('teaser.out')
              : t('teaser.days', { n: f.num(row.daysLeft) })}
          {row.stockoutDate && row.daysLeft !== null && row.daysLeft > 0 ? (
            <span className="font-normal text-muted"> · {t('teaser.until', { date: f.dateShort(row.stockoutDate) })}</span>
          ) : null}
        </span>
        {row.recommendedQty > 0 ? (
          <span className="tnum rounded-lg bg-surface-3 px-2 py-0.5 text-xs font-bold text-ink">
            {t('teaser.buy', { n: f.num(row.recommendedQty) })}
          </span>
        ) : null}
        {row.shipQty > 0 ? (
          <span className="tnum inline-flex items-center gap-1 text-xs font-semibold text-info-ink">
            <Truck className="h-3 w-3" />
            {t('teaser.ship', { n: f.num(row.shipQty) })}
          </span>
        ) : null}
        {row.lostRevenue > 0 ? (
          <span className="tnum text-xs font-semibold text-danger" title={f.money(row.lostRevenue)}>
            −{f.compact(row.lostRevenue)}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function PlannerTeaser() {
  const t = useT('planner');
  const f = useFormat();
  const access = useFeature('planner');
  const q = usePeriodQuery();

  const preview = useQuery({
    queryKey: ['planner-preview', q.storeId ?? 'all'],
    queryFn: () => api.get<PlannerPreviewResponse>('/planner/preview', { storeId: q.storeId }),
    enabled: access === 'preview',
  });

  const data = preview.data;
  const critical = data?.counts.critical ?? 0;
  const urgent = critical + (data?.counts.ending ?? 0);
  const lost = data?.totals.lostRevenue ?? 0;

  return (
    <div className="space-y-5">
      {access === 'preview' ? (
        <HeroCard tone={critical > 0 ? 'danger' : 'brand'} className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="icon-tile h-12 w-12 rounded-2xl [&_svg]:h-6 [&_svg]:w-6" aria-hidden>
                {critical > 0 ? <AlertTriangle /> : <PackagePlus />}
              </span>
              <div className="min-w-0">
                <p className="eyebrow">{t('teaser.eyebrow')}</p>
                {preview.isLoading ? (
                  <Skeleton className="mt-2 h-8 w-64" />
                ) : (
                  <p className="mt-1 font-display text-xl font-bold tracking-[-0.02em] text-ink sm:text-2xl">
                    {critical > 0
                      ? t('teaser.critical', { n: f.num(critical) })
                      : urgent > 0
                        ? t('teaser.need', { n: f.num(urgent) })
                        : t('teaser.calm')}
                  </p>
                )}
                {lost > 0 ? (
                  <p className="tnum mt-1.5 text-sm text-ink-soft">{t('teaser.lost', { v: f.money(lost) })}</p>
                ) : null}
              </div>
            </div>
            <PlannerParams />
          </div>

          {preview.isError ? (
            <div className="mt-4">
              <ErrorState
                message={preview.error instanceof Error ? preview.error.message : undefined}
                onRetry={() => void preview.refetch()}
              />
            </div>
          ) : data && data.rows.length > 0 ? (
            <div className="mt-5">
              <p className="eyebrow mb-2">{t('teaser.top')}</p>
              <ul className={cn('space-y-2', preview.isFetching && 'opacity-70')}>
                {data.rows.map((row) => (
                  <TeaserRow key={row.skuId} row={row} />
                ))}
              </ul>
            </div>
          ) : null}
        </HeroCard>
      ) : null}

      <PlanGate
        feature="planner"
        previewChildren={<SamplePlan />}
        title={t('teaser.lockTitle')}
        hint={
          data && data.more > 0
            ? t('teaser.lockHint', { n: f.num(data.more) })
            : t('teaser.lockHintNone')
        }
      >
        {null}
      </PlanGate>
    </div>
  );
}
