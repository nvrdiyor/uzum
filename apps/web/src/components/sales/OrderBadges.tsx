import type { DeliveryType, OrderStatus } from '@savdoiq/shared';
import { Badge, type Tone } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';

registerNamespace('salesMeta', {
  uz: {
    'status.new': 'Yangi',
    'status.processing': 'Jarayonda',
    'status.delivered': 'Yetkazilgan',
    'status.canceled': 'Bekor qilingan',
    'status.returned': 'Qaytarilgan',
    'type.FBO': 'FBO',
    'type.FBS': 'FBS',
    'type.DBS': 'DBS',
    'type.hint.FBO': 'Uzum ombori orqali',
    'type.hint.FBS': 'O‘z omboringizdan',
    'type.hint.DBS': 'O‘zingiz yetkazasiz',
  },
  ru: {
    'status.new': 'Новый',
    'status.processing': 'В обработке',
    'status.delivered': 'Доставлен',
    'status.canceled': 'Отменён',
    'status.returned': 'Возврат',
    'type.FBO': 'FBO',
    'type.FBS': 'FBS',
    'type.DBS': 'DBS',
    'type.hint.FBO': 'Со склада Uzum',
    'type.hint.FBS': 'С вашего склада',
    'type.hint.DBS': 'Доставка продавцом',
  },
  en: {
    'status.new': 'New',
    'status.processing': 'Processing',
    'status.delivered': 'Delivered',
    'status.canceled': 'Canceled',
    'status.returned': 'Returned',
    'type.FBO': 'FBO',
    'type.FBS': 'FBS',
    'type.DBS': 'DBS',
    'type.hint.FBO': 'From the Uzum warehouse',
    'type.hint.FBS': 'From your own warehouse',
    'type.hint.DBS': 'Delivered by the seller',
  },
});

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  new: 'info',
  processing: 'warn',
  delivered: 'brand',
  canceled: 'danger',
  returned: 'violet',
};

export const DELIVERY_TONE: Record<DeliveryType, Tone> = {
  FBO: 'brand',
  FBS: 'info',
  DBS: 'violet',
};

export const ORDER_STATUSES: OrderStatus[] = ['new', 'processing', 'delivered', 'canceled', 'returned'];
export const DELIVERY_TYPES: DeliveryType[] = ['FBO', 'FBS', 'DBS'];

/** Buyurtma holati — rangli belgi */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useT('salesMeta');
  return (
    <Badge tone={ORDER_STATUS_TONE[status] ?? 'muted'} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Yetkazish turi — FBO / FBS / DBS */
export function DeliveryBadge({ type }: { type: DeliveryType }) {
  const t = useT('salesMeta');
  return <Badge tone={DELIVERY_TONE[type] ?? 'muted'}>{t(`type.${type}`)}</Badge>;
}
