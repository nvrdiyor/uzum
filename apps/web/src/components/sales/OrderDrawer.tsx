import type { ReactNode } from 'react';
import { Calendar, Hash, MapPin, Package } from 'lucide-react';
import type { OrderRow } from '@savdoiq/shared';
import { Drawer } from '@/components/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { DeliveryBadge, OrderStatusBadge } from './OrderBadges';

registerNamespace('salesOrder', {
  uz: {
    title: 'Buyurtma tafsiloti',
    orderId: 'Buyurtma ID',
    date: 'Sana va vaqt',
    city: 'Shahar',
    qty: 'Miqdor',
    unit: 'dona',
    money: 'Moliyaviy tafsilot',
    sellPrice: 'Sotish narxi',
    purchasePrice: 'Xarid narxi (tannarx)',
    revenue: 'Tushum',
    commission: 'Komissiya',
    logistics: 'Logistika',
    payout: 'To‘lovga',
    netProfit: 'Sof foyda',
    margin: 'Marja',
    noCity: 'Ko‘rsatilmagan',
    noSku: 'SKU yo‘q',
  },
  ru: {
    title: 'Детали заказа',
    orderId: 'ID заказа',
    date: 'Дата и время',
    city: 'Город',
    qty: 'Количество',
    unit: 'шт',
    money: 'Финансовая детализация',
    sellPrice: 'Цена продажи',
    purchasePrice: 'Закупочная цена',
    revenue: 'Выручка',
    commission: 'Комиссия',
    logistics: 'Логистика',
    payout: 'К выплате',
    netProfit: 'Чистая прибыль',
    margin: 'Маржа',
    noCity: 'Не указан',
    noSku: 'Без SKU',
  },
  en: {
    title: 'Order details',
    orderId: 'Order ID',
    date: 'Date and time',
    city: 'City',
    qty: 'Quantity',
    unit: 'pcs',
    money: 'Financial breakdown',
    sellPrice: 'Selling price',
    purchasePrice: 'Purchase price',
    revenue: 'Revenue',
    commission: 'Commission',
    logistics: 'Logistics',
    payout: 'Payout',
    netProfit: 'Net profit',
    margin: 'Margin',
    noCity: 'Not specified',
    noSku: 'No SKU',
  },
});

function MetaItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <p className="tnum mt-1 truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  negative,
  strong,
  tone,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
  tone?: 'danger' | 'brand';
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 last:border-0">
      <span className={cn('text-sm', strong ? 'font-semibold text-ink' : 'text-muted')}>{label}</span>
      <span
        className={cn(
          'tnum text-sm',
          strong ? 'font-display text-base font-extrabold' : 'font-medium',
          tone === 'danger' ? 'text-danger' : tone === 'brand' ? 'text-brand' : 'text-ink-soft',
        )}
      >
        {negative ? '−' : ''}
        {value}
      </span>
    </div>
  );
}

/** Jadval qatoriga bosilganda ochiladigan buyurtma kartochkasi */
export function OrderDrawer({ order, onClose }: { order: OrderRow | null; onClose: () => void }) {
  const t = useT('salesOrder');
  const f = useFormat();

  return (
    <Drawer open={Boolean(order)} onClose={onClose} title={t('title')}>
      {order ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
              {order.imageUrl ? (
                <img src={order.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted">
                  <Package className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-display text-base font-bold leading-snug text-ink">{order.title}</p>
              <p className="mt-0.5 text-xs text-muted">{order.sku ?? t('noSku')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={order.status} />
                <DeliveryBadge type={order.deliveryType} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetaItem
              icon={<Hash className="h-3 w-3" />}
              label={t('orderId')}
              value={order.uzumOrderId ?? order.id}
            />
            <MetaItem
              icon={<Calendar className="h-3 w-3" />}
              label={t('date')}
              value={f.dateTime(order.orderedAt)}
            />
            <MetaItem
              icon={<MapPin className="h-3 w-3" />}
              label={t('city')}
              value={order.buyerCity ?? t('noCity')}
            />
            <MetaItem
              icon={<Package className="h-3 w-3" />}
              label={t('qty')}
              value={`${f.num(order.qty)} ${t('unit')}`}
            />
          </div>

          <div className="card p-5">
            <h4 className="section-title mb-2 text-base">{t('money')}</h4>
            <MoneyRow label={t('sellPrice')} value={f.money(order.sellPrice)} />
            <MoneyRow label={t('purchasePrice')} value={f.money(order.purchasePrice)} />
            <MoneyRow label={t('revenue')} value={f.money(order.revenue)} />
            <MoneyRow label={t('commission')} value={f.money(order.commission)} negative tone="danger" />
            <MoneyRow label={t('logistics')} value={f.money(order.logistics)} negative tone="danger" />
            <MoneyRow label={t('payout')} value={f.money(order.payout)} />
            <MoneyRow
              label={t('netProfit')}
              value={f.money(order.netProfit)}
              strong
              tone={order.netProfit < 0 ? 'danger' : 'brand'}
            />
            <MoneyRow
              label={t('margin')}
              value={f.pct(order.margin)}
              tone={order.margin < 0 ? 'danger' : undefined}
            />
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
