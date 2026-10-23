import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, PackageX, Star } from '@/components/icons';
import type { ProductCard } from '@savdoiq/shared';
import { Amount, ProductThumb, ProgressBar } from '@/components/ui';
import { TONE_TEXT } from '@/components/stock/common';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { buyoutRateOf, buyoutTextClass, useBuyout } from './Buyout';
import { STATE_STYLE, avgPurchasePrice, coverTone, productState, totalStock } from './types';
import { ProductVisibilityButton } from './VisibilityButton';

/**
 * Mahsulot kartochkasi — "kartochka" ko'rinishi uchun.
 *
 * Tartib qaror qabul qilish ketma-ketligida: holat → nima va qanchaga sotildi →
 * qancha foyda qoldi → qoldiq nechaga yetadi va qancha buyurtma kerak.
 * Butun kartochka bitta havola (sarlavhaning ::after qatlami), shuning uchun
 * ichidagi tugmalar `relative z-10` bilan undan yuqorida turadi.
 */
export function ProductTile({ product, coverDays }: { product: ProductCard; coverDays: number }) {
  const t = useT('products');
  const f = useFormat();
  const buyout = useBuyout();
  // Uzum CDN havolasi vaqt o'tib o'chadi — singan rasm o'rniga ixcham tasmaga o'tamiz
  const [broken, setBroken] = useState(false);

  const state = productState(product);
  const style = STATE_STYLE[state];
  const stock = totalStock(product);
  const days = product.daysLeft;
  const tone = coverTone(days);
  const coverPct = days === null || days === undefined ? 0 : Math.min(100, (days / Math.max(1, coverDays)) * 100);
  const cost = avgPurchasePrice(product.skus);
  const hasImage = Boolean(product.imageUrl) && !broken;
  const href = `/products/${product.id}`;
  /*
   * Davrda sotilgan, lekin hozir qoldig'i nol SKU'lar. Mahsulot jami "26 kunga
   * yetadi" deyishi mumkin, aynan shu variantlar esa allaqachon tugagan —
   * ilgari bu faqat Rejalashtiruvchida ko'rinardi.
   */
  const skusOut = product.skus.filter((s) => s.sold > 0 && s.stockFbo + s.stockFbs + s.stockOwn <= 0).length;
  const discount = product.listPrice > product.minPrice ? ((product.listPrice - product.minPrice) / product.listPrice) * 100 : 0;
  const showAvg =
    product.avgSoldPrice > 0 && Math.abs(product.avgSoldPrice - product.minPrice) >= product.minPrice * 0.01;
  // Ehtiyot zaxirasidan ham kam qolgan bo'lsa buyurtma qatori qizil, aks holda sariq
  const needTone = stock <= 0 || tone === 'danger' ? 'danger' : 'warn';
  // Arxivdagi tovarga buyurtma ogohlantirishi kerak emas — u sotuvda emas
  const inactive = state === 'archived' || state === 'hidden';

  const chips = (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
      <span className={cn('chip min-w-0 border border-line/80 bg-surface/95 shadow-sm', style.text)}>
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
        <span className="truncate">{t(`state.${state}`)}</span>
      </span>
      {/* Sharhlar soni izohda — tor kartochkada holat nishoni kesilib qolmasin */}
      {product.rating > 0 ? (
        <span
          className="pointer-events-auto relative z-10 chip shrink-0 border border-line/80 bg-surface/95 text-ink shadow-sm"
          title={`★ ${f.num(product.rating, 1)} · ${t('card.reviews', { n: f.num(product.reviewsCount) })}`}
        >
          <Star className="h-3 w-3 text-warn" />
          <span className="tnum">{f.num(product.rating, 1)}</span>
        </span>
      ) : null}
    </div>
  );

  return (
    /*
      Ko'tarilish oddiy CSS transform bilan: ilgari framer-motion har bir
      kartochkaga JS kuzatuvchi qo'yardi va 40 ta kartochkali ro'yxatda
      sichqon yurganda kadr tushardi.
    */
    <article className="card card-hover group relative flex flex-col overflow-hidden transition-[transform,border-color] duration-200 ease-spring hover:-translate-y-1">
      {hasImage ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
          <img
            src={product.imageUrl ?? undefined}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 ease-spring group-hover:scale-[1.04]"
          />
          {/* Yumshoq gradient — rasm kartochka matniga singib o'tadi */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface/80 to-transparent" />
          {chips}
        </div>
      ) : (
        /*
          Rasm yo'q — kvadrat kulrang quti o'rniga 88 px'lik rangli tasma va nom
          bosh harflari. Ilgari demo'dagi 16 ta kartochkaning har birida bir xil
          ImageOff qutisi kartochka balandligining 40% ini egallab, sahifa bo'sh
          ko'rinardi (2026-10-24). Harflar pastga surilgan — nishonlarga tegmasin.
        */
        <div className="relative h-[88px] overflow-hidden">
          <ProductThumb
            name={product.title}
            className="text-[26px] tracking-[-0.02em]"
            style={{ alignItems: 'flex-end', paddingBottom: 12 }}
          />
          {/* Yuqoridan yengil yorug'lik — tekis rangli tasma "bo'sh joy"dek ko'rinmasin */}
          <div className="pointer-events-none absolute inset-0 bg-sheen" />
          {chips}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {/* min-h: ikki qatorli nom + kategoriya — qatordagi narxlar bir sathda tursin (telefonda bitta ustun — shart emas) */}
        <div className="sm:min-h-[3.75rem]">
          <Link
            to={href}
            title={product.title}
            className={cn(
              'line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-brand-ink',
              // Butun kartochka shu havola: ::after kartochkani to'liq qoplaydi
              "after:absolute after:inset-0 after:rounded-2xl after:content-['']",
              'focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand/60',
            )}
          >
            {product.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted">
            {product.category ?? t('card.noCategory')} · {t('card.skus', { n: product.skuCount })}
          </p>
        </div>

        {/*
          Narx bloki to'liq kenglikda. Ilgari o'ng tomonda "Xarid foizi" turardi
          va katta yozuvdagi narx "414 000 so'…" bo'lib kesilardi.
          Katta raqam — JORIY narx; chizilgani — chegirmadan oldingi narx;
          o'rtacha sotilgan narx o'z nomi bilan alohida qatorda.
        */}
        {/* min-h: chegirma va o'rtacha narx qatorlari bo'lmagan kartochkada ham pastdagi plitka bir sathda tursin */}
        <div className="min-w-0 sm:min-h-[3.6rem]">
          <p className="tnum truncate font-display text-lg font-extrabold leading-tight tracking-[-0.01em] text-ink">
            <Amount value={f.money(product.minPrice)} />
          </p>
          {discount > 0 || product.promo ? (
            <p className="tnum mt-0.5 truncate text-2xs text-muted" title={product.promo?.name}>
              {discount > 0 ? (
                <>
                  <span className="line-through">{f.money(product.listPrice)}</span>
                  <span className="ml-1 font-semibold text-ink-soft">−{f.pct(discount, 0)}</span>
                </>
              ) : null}
              {product.promo ? (
                <span className="text-warn-ink">
                  {discount > 0 ? ' · ' : ''}
                  {t('card.promo')}
                  {product.promo.endsAt ? ` ${t('card.promoUntil', { date: f.dateShort(product.promo.endsAt) })}` : ''}
                </span>
              ) : null}
            </p>
          ) : null}
          {showAvg ? (
            <p className="tnum truncate text-2xs text-muted" title={t('card.priceWhy')}>
              {t('card.avgPrice')}: {f.money(product.avgSoldPrice)}
            </p>
          ) : null}
        </div>

        {/*
          Davr natijasi bitta ichki plitkada, 2×2: yuqorida pul (tushum va
          foyda), pastda nisbatlar. Har katak ostida o'z asosi: tushum — necha
          dona, foyda — marja, ROI — tannarx, xarid foizi — qaytarishlar.
          Foyda — yagona yashil raqam: rang faqat sotuvchida qolgan pulni bildiradi.
        */}
        <div className="well overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-line/70">
            <TileStat
              label={t('card.revenue')}
              value={f.compact(product.revenue)}
              sub={t('card.units', { n: f.num(product.sold) })}
              title={f.money(product.revenue)}
            />
            <TileStat
              label={t('card.profit')}
              value={f.compact(product.profit)}
              valueClass={product.profit < 0 ? 'text-danger' : 'text-brand-ink'}
              sub={t('card.marginSub', { pct: f.pct(product.margin) })}
              title={f.money(product.profit)}
            />
          </div>
          <div className="grid grid-cols-2 divide-x divide-line/70 border-t border-line/70">
            <TileStat
              label={t('card.roi')}
              // Tannarxsiz ROI hisoblanmaydi — "0,0%" chalg'itadi (tafsilot sahifasidagi bilan bir xil)
              value={cost > 0 ? f.pct(product.roi) : '—'}
              valueClass={cost > 0 ? (product.roi < 0 ? 'text-danger' : 'text-ink') : 'text-muted'}
              sub={cost > 0 ? t('card.costSub', { v: f.num(cost) }) : t('card.costSubNone')}
              subClass={cost > 0 ? undefined : 'font-medium text-warn-ink'}
              title={cost > 0 ? `${t('card.cost')}: ${f.money(cost)}` : t('card.noCost')}
            />
            <TileStat
              label={buyout.short}
              value={buyout.value(product)}
              valueClass={buyoutTextClass(buyoutRateOf(product))}
              sub={t('card.returnsSub', { n: f.num(product.returns) })}
              title={`${buyout.label}\n${buyout.hint(product)}`}
            />
          </div>
        </div>

        {/* Qoldiq: sxemalar, necha kunga yetishi va buyurtma */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['fbo', product.stockFbo],
                ['fbs', product.stockFbs],
                ['own', product.stockOwn],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="well px-1.5 py-1.5 text-center">
                <p className="eyebrow">{t(`card.${key}`)}</p>
                <p className={cn('tnum text-xs font-semibold', (value ?? 0) > 0 ? 'text-ink' : 'text-muted')}>
                  {f.num(value ?? 0)}
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-2xs">
              <span className="text-muted">{t('card.daysLeft')}</span>
              <span className={cn('tnum font-semibold', TONE_TEXT[tone])}>
                {days === null || days === undefined ? t('card.noForecast') : t('card.daysValue', { n: f.num(days) })}
              </span>
            </div>
            <ProgressBar value={coverPct} tone={tone} />
          </div>

          {/*
            Ilgari bu yerda doim "Jami qoldiq: N dona" turardi — u yuqoridagi
            FBO/FBS/Ombor yig'indisini takrorlardi, buyurtma miqdori esa faqat
            qoldiq nolga tushgandagina chiqardi. Endi qator qaror beradi.
          */}
          {!inactive && (stock <= 0 || product.needOrder > 0) ? (
            <StockNote
              tone={needTone}
              icon={stock <= 0 ? <PackageX className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            >
              {stock <= 0 && product.needOrder <= 0
                ? t('card.noStock')
                : t('card.needOrder', { n: f.num(product.needOrder) })}
            </StockNote>
          ) : (
            <p className="tnum text-2xs text-muted">
              {stock > 0 ? t('card.stockTotal', { n: f.num(stock) }) : t('card.noStock')}
            </p>
          )}
          {!inactive && skusOut > 0 && stock > 0 ? (
            <StockNote tone="danger" icon={<PackageX className="h-3.5 w-3.5" />}>
              {t('card.skusOut', { n: f.num(skusOut) })}
            </StockNote>
          ) : null}
        </div>

        {/* Pastki qator */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="tnum truncate text-2xs text-muted" title={product.uzumProductId ?? product.id}>
            ID: {product.uzumProductId ?? product.id}
          </span>
          <span className="relative z-10 flex shrink-0 items-center gap-1">
            <ProductVisibilityButton product={product} />
            {/* Bezak: bosish butun kartochkadagi havolaga tushadi */}
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-ink transition-colors group-hover:bg-brand/10"
            >
              {t('card.details')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

/** Ichki plitkadagi bitta ko'rsatkich: yorliq, qiymat va ixtiyoriy izoh qatori */
function TileStat({
  label,
  value,
  sub,
  valueClass,
  subClass,
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
  title?: string;
}) {
  return (
    <div className={cn('min-w-0 px-2 py-2', title && 'cursor-help')} title={title}>
      {/* Bosh harfli emas: tor katakka "Выручка", "Прибыль" kesilmasdan sig'sin */}
      <p className="truncate text-2xs font-medium text-muted">{label}</p>
      <p className={cn('tnum truncate text-sm font-bold leading-5', valueClass ?? 'text-ink')}>{value}</p>
      {sub ? <p className={cn('tnum truncate text-2xs', subClass ?? 'text-muted')}>{sub}</p> : null}
    </div>
  );
}

function StockNote({ tone, icon, children }: { tone: 'warn' | 'danger'; icon: ReactNode; children: ReactNode }) {
  return (
    <p
      className={cn(
        'tnum flex items-center gap-1.5 text-2xs font-semibold',
        tone === 'danger' ? 'text-danger-ink' : 'text-warn-ink',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

/** Kartochka ko'rinishi uchun yuklanish skeleti — rasmsiz kartochka bilan bir xil o'lchamda */
export function ProductTileSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton h-[88px] rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-6 w-2/5" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-2 w-full" />
      </div>
    </div>
  );
}
