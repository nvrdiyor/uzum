/**
 * Mahsulotning SKU variantlari (rang, o'lcham) — "Mahsulot foydasi" jadvalida
 * qator ochilganda, yon panelda va kartochkada.
 *
 * Mahsulot qatori variantlarni bitta yig'indiga aralashtiradi: to'rt rangli
 * krossovka jami foydada bo'lsa ham, bitta rangi zararda, boshqasi
 * tannarxsiz yoki ko'p qaytariladigan bo'lishi mumkin — qatorda bu
 * ko'rinmasdi (2026-10-24). Belgilar (zarar, past marja, tannarxsiz, past
 * xarid) serverdan — mahsulot bo'limlari bilan bitta qoida.
 */
import type { ProductProfitRow, ProductProfitVariant } from '@savdoiq/shared';
import { Tag } from '@/components/icons';
import { Badge } from '@/components/ui';
import { useBuyout } from '@/components/products/Buyout';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('productProfitVariants', {
  uz: {
    title: 'SKU variantlari',
    inactive: 'Davrda sotilmagan SKU: {n}',
    'col.variant': 'Variant',
    'col.units': 'Sotildi',
    'col.revenue': 'Tushum',
    'col.profit': 'Sof foyda',
    'col.margin': 'Marja',
    perUnit: '1 donadan {v}',
    units: '{n} dona',
    margin: 'marja {v}',
    buyout: 'xarid',
    noCost: 'Tannarxsiz',
    noCostTitle: 'Tannarx kiritilmagan — bu variantning foydasi haqiqiydan katta ko‘rinadi',
    lowBuyoutTitle: 'Xarid foizi do‘kon o‘rtachasidan sezilarli past',
  },
  ru: {
    title: 'Варианты SKU',
    inactive: 'SKU без продаж за период: {n}',
    'col.variant': 'Вариант',
    'col.units': 'Продано',
    'col.revenue': 'Выручка',
    'col.profit': 'Чистая прибыль',
    'col.margin': 'Маржа',
    perUnit: 'С 1 шт. {v}',
    units: '{n} шт.',
    margin: 'маржа {v}',
    buyout: 'выкуп',
    noCost: 'Без себестоимости',
    noCostTitle: 'Себестоимость не указана — прибыль этого варианта выглядит больше реальной',
    lowBuyoutTitle: 'Выкуп заметно ниже среднего по магазину',
  },
  en: {
    title: 'SKU variants',
    inactive: 'SKUs without sales this period: {n}',
    'col.variant': 'Variant',
    'col.units': 'Sold',
    'col.revenue': 'Revenue',
    'col.profit': 'Net profit',
    'col.margin': 'Margin',
    perUnit: '{v} per unit',
    units: '{n} units',
    margin: 'margin {v}',
    buyout: 'buyout',
    noCost: 'No cost price',
    noCostTitle: 'No cost price — this variant’s profit looks higher than it is',
    lowBuyoutTitle: 'Buyout rate is well below the store average',
  },
});

/** Marja belgisi: zarar — qizil, past marja — za'faron, qolgani — brend (mahsulot qatoridagi bilan bir xil) */
export function marginTone(p: { margin: number; flags: readonly string[] }): 'danger' | 'warn' | 'brand' {
  if (p.margin < 0 || p.flags.includes('loss')) return 'danger';
  return p.flags.includes('lowMargin') ? 'warn' : 'brand';
}

/** Variantlar ro'yxatini ko'rsatish kerakmi: bir nechta SKU va kamida bittasida harakat */
export function hasVariants(row: Pick<ProductProfitRow, 'skuCount' | 'variants'>): boolean {
  return row.skuCount > 1 && row.variants.length > 0;
}

export function ProfitVariants({
  row,
  layout = 'auto',
  className,
}: {
  row: ProductProfitRow;
  /**
   * 'auto' — kompyuterda jadval, telefonda ro'yxat (jadval qatori ochilganda);
   * 'list' — tor joy uchun (yon panel, kartochka) har doim ro'yxat.
   */
  layout?: 'auto' | 'list';
  className?: string;
}) {
  const t = useT('productProfitVariants');
  const isDesktop = useIsDesktop();
  const inactive = Math.max(0, row.skuCount - row.variants.length);
  const asTable = layout === 'auto' && isDesktop;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="eyebrow">{t('title')}</p>
        {inactive > 0 ? <p className="tnum text-2xs text-muted">{t('inactive', { n: inactive })}</p> : null}
      </div>
      {asTable ? <VariantTable variants={row.variants} /> : <VariantList variants={row.variants} />}
    </div>
  );
}

function VariantName({ v }: { v: ProductProfitVariant }) {
  const t = useT('productProfitVariants');
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="min-w-0 truncate text-sm font-medium text-ink" title={v.title}>
          {v.variant ?? v.title}
        </span>
        {v.flags.includes('noCost') ? (
          <Badge tone="warn" className="px-1.5 py-0" title={t('noCostTitle')}>
            <Tag className="h-3 w-3" />
            {t('noCost')}
          </Badge>
        ) : null}
      </div>
      <p className="tnum truncate text-2xs text-muted">{v.sku}</p>
    </div>
  );
}

function BuyoutValue({ v, className }: { v: ProductProfitVariant; className?: string }) {
  const t = useT('productProfitVariants');
  const b = useBuyout();
  const low = v.flags.includes('lowBuyout');
  return (
    <span
      className={cn('tnum whitespace-nowrap', low ? 'font-semibold text-warn-ink' : v.buyoutRate === null ? 'text-muted' : 'text-ink-soft', className)}
      title={low ? `${t('lowBuyoutTitle')}\n${b.hint(v)}` : b.hint(v)}
    >
      {b.value(v)}
    </span>
  );
}

/** Kompyuterdagi ochilgan qator: ixcham ichki jadval, ustunlar asosiy jadvaldagi tartibda */
function VariantTable({ variants }: { variants: ProductProfitVariant[] }) {
  const t = useT('productProfitVariants');
  const f = useFormat();
  const b = useBuyout();
  const th = 'px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted';
  const td = 'px-3 py-2 align-middle';
  return (
    <div className="overflow-hidden rounded-xl border border-line/70 bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2/60">
            <th className={cn(th, 'text-left')}>{t('col.variant')}</th>
            <th className={cn(th, 'text-right')}>{t('col.units')}</th>
            <th className={cn(th, 'text-right')}>{t('col.revenue')}</th>
            <th className={cn(th, 'text-right')}>{t('col.profit')}</th>
            <th className={cn(th, 'text-right')}>{t('col.margin')}</th>
            <th className={cn(th, 'text-right')}>{b.short}</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.skuId} className="border-t border-line/60">
              <td className={td}>
                {/* Kenglik chegarasi ichki blokda: katakdagi max-width'ni brauzer avtomatik jadvalda e'tiborsiz qoldiradi */}
                <div className="max-w-[18rem]">
                  <VariantName v={v} />
                </div>
              </td>
              <td className={cn(td, 'tnum whitespace-nowrap text-right text-ink-soft')}>{f.num(v.units)}</td>
              <td className={cn(td, 'tnum whitespace-nowrap text-right text-ink')}>{f.money(v.revenue)}</td>
              <td className={cn(td, 'whitespace-nowrap text-right')}>
                <p className={cn('tnum font-semibold', v.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
                  {f.money(v.netProfit)}
                </p>
                {v.units > 0 ? (
                  <p className="tnum text-2xs text-muted">{t('perUnit', { v: f.money(v.perUnitProfit) })}</p>
                ) : null}
              </td>
              <td className={cn(td, 'text-right')}>
                <Badge tone={marginTone(v)} className="px-2 py-0.5">
                  <span className="tnum">{f.pct(v.margin)}</span>
                </Badge>
              </td>
              <td className={cn(td, 'text-right')}>
                <BuyoutValue v={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tor joy (telefon, yon panel, kartochka): har variant ikki qatorda — nom va foyda, ostida sanoqlar */
function VariantList({ variants }: { variants: ProductProfitVariant[] }) {
  const t = useT('productProfitVariants');
  const f = useFormat();
  return (
    <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70 bg-surface">
      {variants.map((v) => (
        <li key={v.skuId} className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <VariantName v={v} />
            <p className="tnum mt-0.5 truncate text-2xs text-ink-soft">
              {t('units', { n: f.num(v.units) })} · {f.money(v.revenue)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn('tnum text-sm font-semibold', v.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.money(v.netProfit)}
            </p>
            <p className="tnum text-2xs text-muted">
              <span className={cn(marginTone(v) === 'brand' ? undefined : marginTone(v) === 'danger' ? 'text-danger' : 'text-warn-ink')}>
                {t('margin', { v: f.pct(v.margin) })}
              </span>
              {' · '}
              {t('buyout')} <BuyoutValue v={v} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
