/**
 * Mahsulot belgilari: Tannarxsiz, Kam qoldiq, Nolikvid, Ortiqcha zaxira,
 * Zararda va Aksiya. Qoidasi serverda (routes/products.ts `cardFlags`) —
 * sayt faqat chizadi, shuning uchun kartochka, jadval va mahsulot sahifasi
 * bir xil belgini ko'rsatadi (2026-10-24).
 *
 * Rang ma'no bo'yicha: zarar va kam qoldiq — qizil, tannarxsiz — sariq
 * (foyda raqami ishonchsiz), nolikvid va ortiqcha — ko'k (omborda turgan
 * pul), aksiya — binafsha emas, sariq: u sotuvchining chegirmasi, Uzum ulushi emas.
 */
import type { ReactNode } from 'react';
import type { ProductCard, ProductCardFlag } from '@savdoiq/shared';
import { AlertTriangle, BadgePercent, Snowflake, Tag, TrendingDown, Warehouse } from '@/components/icons';
import { Badge, type Tone } from '@/components/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('productTags', {
  uz: {
    noCost: 'Tannarxsiz',
    lowStock: 'Kam qoldiq',
    illiquid: 'Nolikvid',
    excess: 'Ortiqcha zaxira',
    loss: 'Zararda',
    promo: 'Aksiya',
    'hint.noCost': 'Sotuvdagi variantlardan birining tannarxi kiritilmagan — foyda va ROI oshib ko‘rinadi',
    'hint.lowStock': 'Bugun buyurtma berilsa ham tovar kelguncha tugaydi (yetkazish {lead} kun)',
    'hint.illiquid': '30 kundan beri sotilmayapti, qoldiq omborda turibdi',
    'hint.excess': 'Qoldiq 90 kundan ortiqqa yetadi — pul omborda muzlab turibdi',
    'hint.loss': 'Tanlangan davrda sof foyda manfiy',
    'hint.promo': '{name}',
    'hint.promoUntil': '{name} · {date} gacha',
  },
  ru: {
    noCost: 'Без себестоимости',
    lowStock: 'Мало остатка',
    illiquid: 'Неликвид',
    excess: 'Избыток запаса',
    loss: 'Убыток',
    promo: 'Акция',
    'hint.noCost': 'У одного из вариантов в продаже не указана себестоимость — прибыль и ROI завышены',
    'hint.lowStock': 'Даже при заказе сегодня товар закончится до поставки (поставка {lead} дн.)',
    'hint.illiquid': 'Не продаётся 30 дней, остаток лежит на складе',
    'hint.excess': 'Остатка хватит больше чем на 90 дней — деньги заморожены на складе',
    'hint.loss': 'За выбранный период чистая прибыль отрицательная',
    'hint.promo': '{name}',
    'hint.promoUntil': '{name} · до {date}',
  },
  en: {
    noCost: 'No cost price',
    lowStock: 'Low stock',
    illiquid: 'Dead stock',
    excess: 'Overstock',
    loss: 'Loss-making',
    promo: 'Promo',
    'hint.noCost': 'A variant on sale has no cost price — profit and ROI look higher than they are',
    'hint.lowStock': 'Even if ordered today it runs out before the delivery arrives ({lead}-day lead time)',
    'hint.illiquid': 'No sales for 30 days while stock sits in the warehouse',
    'hint.excess': 'Stock lasts more than 90 days — money is frozen in the warehouse',
    'hint.loss': 'Net profit is negative for the selected period',
    'hint.promo': '{name}',
    'hint.promoUntil': '{name} · until {date}',
  },
});

/** Ko'rsatish tartibi: avval pul yo'qotayotganlar, keyin ishonchsiz raqam, keyin ombor */
const ORDER: ProductCardFlag[] = ['loss', 'lowStock', 'noCost', 'illiquid', 'excess'];

const TONE: Record<ProductCardFlag, Tone> = {
  loss: 'danger',
  lowStock: 'danger',
  noCost: 'warn',
  illiquid: 'info',
  excess: 'info',
};

const ICON: Record<ProductCardFlag, ReactNode> = {
  loss: <TrendingDown className="h-3 w-3" />,
  lowStock: <AlertTriangle className="h-3 w-3" />,
  noCost: <Tag className="h-3 w-3" />,
  illiquid: <Snowflake className="h-3 w-3" />,
  excess: <Warehouse className="h-3 w-3" />,
};

/**
 * Belgilar qatori. Belgi bo'lmasa hech narsa chizilmaydi. `max` — tor
 * kartochkada ko'pi bilan shuncha belgi, qolgani "+N" (to'liq ro'yxat izohda).
 */
export function ProductTags({
  product,
  className,
  max,
}: {
  product: Pick<ProductCard, 'flags' | 'promo' | 'plan'>;
  className?: string;
  max?: number;
}) {
  const t = useT('productTags');
  const f = useFormat();
  const flags = ORDER.filter((k) => product.flags?.includes(k));
  const items: { key: string; tone: Tone; icon: ReactNode; label: string; hint: string }[] = flags.map((k) => ({
    key: k,
    tone: TONE[k],
    icon: ICON[k],
    label: t(k),
    hint: t(`hint.${k}`, { lead: f.num(product.plan?.leadDays ?? 7) }),
  }));
  if (product.promo) {
    items.push({
      key: 'promo',
      tone: 'warn',
      icon: <BadgePercent className="h-3 w-3" />,
      label: t('promo'),
      hint: product.promo.endsAt
        ? t('hint.promoUntil', { name: product.promo.name || t('promo'), date: f.dateShort(product.promo.endsAt) })
        : t('hint.promo', { name: product.promo.name || t('promo') }),
    });
  }
  if (items.length === 0) return null;

  // Joy yetmasa: birinchilari (eng muhimi doim ko'rinadi) + "+N"
  const shown = max && items.length > max ? items.slice(0, Math.max(1, max - 1)) : items;
  const rest = items.slice(shown.length);
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((it) => (
        <Badge key={it.key} tone={it.tone} className="px-2 py-0.5" title={it.hint}>
          {it.icon}
          {it.label}
        </Badge>
      ))}
      {rest.length > 0 ? (
        <Badge tone="muted" className="tnum px-2 py-0.5" title={rest.map((r) => r.label).join(' · ')}>
          +{rest.length}
        </Badge>
      ) : null}
    </span>
  );
}
