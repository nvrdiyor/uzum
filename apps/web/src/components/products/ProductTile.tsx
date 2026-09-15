import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ImageOff, Star } from 'lucide-react';
import type { ProductCard } from '@savdoiq/shared';
import { ProgressBar } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { STATE_STYLE, avgPurchasePrice, coverTone, productState, totalStock } from './types';

/** Mahsulot kartochkasi — "kartochka" ko'rinishi uchun */
export function ProductTile({ product, coverDays }: { product: ProductCard; coverDays: number }) {
  const t = useT('products');
  const f = useFormat();

  const state = productState(product);
  const style = STATE_STYLE[state];
  const stock = totalStock(product);
  const days = product.daysLeft;
  const tone = coverTone(days);
  const coverPct = days === null || days === undefined ? 0 : Math.min(100, (days / Math.max(1, coverDays)) * 100);
  const cost = avgPurchasePrice(product.skus);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="card card-hover group flex flex-col overflow-hidden"
    >
      {/* Rasm */}
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-spring group-hover:scale-[1.05]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <ImageOff className="h-8 w-8" />
          </div>
        )}

        {/* Yumshoq gradient — rasm kartochkaga singib ketadi */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-surface via-surface/35 to-transparent" />

        {/*
          Ilgari ikkala nishon ham alohida absolute edi — tor kartochkada
          (1280px da 4 ustun) ular ustma-ust tushardi. Endi bitta qatorda:
          holat nishoni qisqaradi, reyting esa to'liq qoladi.
        */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span
            className={cn(
              'chip min-w-0 border border-line bg-surface/90 backdrop-blur',
              style.text,
            )}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
            <span className="truncate">{t(`state.${state}`)}</span>
          </span>

          {product.rating > 0 ? (
            <span className="chip shrink-0 border border-line bg-surface/90 text-ink backdrop-blur">
              <Star className="h-3 w-3 text-warn" />
              <span className="tnum">{f.num(product.rating, 1)}</span>
              <span className="text-muted">· {f.num(product.reviewsCount)}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Mazmun */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-h-[3.25rem]">
          <Link
            to={`/products/${product.id}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors hover:text-brand-ink"
            title={product.title}
          >
            {product.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted">
            {product.category ?? t('card.noCategory')} · {t('card.skus', { n: product.skuCount })}
          </p>
        </div>

        {/* Narx / konversiya */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {/* Aksiya bo'lsa: joriy narx + ustidan chizilgan chegirmasiz narx —
                sotuvchi kabinetdagi bilan bir xil ko'radi */}
            <p className="tnum truncate font-display text-lg font-extrabold text-ink">{f.money(product.minPrice)}</p>
            {product.listPrice > product.minPrice ? (
              <p className="tnum truncate text-2xs text-muted">
                <span className="line-through">{f.money(product.listPrice)}</span>
                <span className="ml-1.5 font-semibold text-brand-ink">
                  −{f.pct(((product.listPrice - product.minPrice) / product.listPrice) * 100, 0)}
                </span>
              </p>
            ) : null}
            <p className="truncate text-2xs text-muted">
              {cost > 0 ? `${t('card.cost')}: ${f.money(cost)}` : t('card.noCost')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xs uppercase tracking-wide text-muted">{t('card.conversion')}</p>
            <p className="tnum text-sm font-bold text-ink">{f.pct(product.conversion)}</p>
          </div>
        </div>

        {/* ROI va marja */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-muted">{t('card.roi')}</p>
            <p className={cn('tnum text-sm font-bold', product.roi >= 0 ? 'text-brand-ink' : 'text-danger')}>
              {f.pct(product.roi)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2">
            <p className="text-2xs uppercase tracking-wide text-muted">{t('card.margin')}</p>
            <p className={cn('tnum text-sm font-bold', product.margin >= 0 ? 'text-ink' : 'text-danger')}>
              {f.pct(product.margin)}
            </p>
          </div>
        </div>

        {/* Qoldiqlar */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {(
            [
              ['fbo', product.stockFbo],
              ['fbs', product.stockFbs],
              ['own', product.stockOwn],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-surface-2 px-1.5 py-1.5">
              <p className="text-2xs uppercase tracking-wide text-muted">{t(`card.${key}`)}</p>
              <p className="tnum text-xs font-semibold text-ink-soft">{f.num(value ?? 0)}</p>
            </div>
          ))}
        </div>

        {/* Necha kunga yetadi */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-2xs">
            <span className="text-muted">{t('card.daysLeft')}</span>
            <span className={cn('tnum font-semibold', STATE_STYLE[state].text)}>
              {days === null || days === undefined
                ? t('card.noForecast')
                : t('card.daysValue', { n: f.num(days) })}
            </span>
          </div>
          <ProgressBar value={coverPct} tone={tone} />
          <p className="mt-1.5 text-2xs text-muted">
            {stock > 0
              ? t('card.stockTotal', { n: f.num(stock) })
              : product.needOrder > 0
                ? t('card.needOrder', { n: f.num(product.needOrder) })
                : t('card.noStock')}
          </p>
        </div>

        {/* Pastki qator */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="tnum truncate text-2xs text-muted" title={product.uzumProductId ?? product.id}>
            ID: {product.uzumProductId ?? product.id}
          </span>
          <Link
            to={`/products/${product.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand/10"
          >
            {t('card.details')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

/** Kartochka ko'rinishi uchun yuklanish skeleti */
export function ProductTileSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-square rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-8 w-full" />
        <div className="skeleton h-12 w-full" />
      </div>
    </div>
  );
}
