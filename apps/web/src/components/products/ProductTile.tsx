import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, PackageX, Star, Truck } from '@/components/icons';
import type { ProductCard } from '@savdoiq/shared';
import { Amount, ProductThumb, ProgressBar } from '@/components/ui';
import { TONE_TEXT } from '@/components/stock/common';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { buyoutRateOf, buyoutTextClass, useBuyout } from './Buyout';
import { ProductTags } from './ProductTags';
import { STATE_STYLE, avgPurchasePrice, coverHorizon, lifecycleState, planTone, totalStock } from './types';
import { ProductVisibilityButton } from './VisibilityButton';

/**
 * Mahsulot kartochkasi — "kartochka" ko'rinishi uchun (2026-10-24 qayta qurildi).
 *
 * Tartib qaror ketma-ketligida, zamonaviy marketpleys panelidagidek:
 *   1. kim: rasm (yoki rangli bosh harflar), nom, narx, variantlar soni;
 *   2. belgilar: reyting, Tannarxsiz, Kam qoldiq, Nolikvid… (holat — faqat
 *      "sotuvda" bo'lmasa: Qoldiqsiz, Arxiv);
 *   3. davr natijasi 2×2: sotildi, tushum, sof foyda (marja), xarid foizi;
 *   4. qoldiq: necha kunga yetadi (Rejalashtiruvchi rangi), FBO/FBS/ombor;
 *   5. qaror: "Buyurtma kerak: N dona", "FBO'ga jo'nating" yoki "Buyurtma shart emas".
 *
 * Ilgari rasm yo'q kartochkada 88 px rangli tasma, rasmlisida esa 4:3 rasm
 * turardi — bir qatordagi kartochkalar har xil balandlikda chiqib, raqamlar
 * bir sathda turmasdi; har kartochkada "Sotuvda" nishoni takrorlanardi.
 * Endi rasm (yoki bosh harflar) sarlavha yonida 64 px plitkada, qaror qatori
 * doim bor — hamma kartochka bir xil tuzilishda. "Necha kunga yetadi" rangi
 * va chizig'i qat'iy 7/14 kun va sahifa tanlagan 30 kun bilan emas —
 * Rejalashtiruvchining holati va kompaniyaning yetkazish + zaxira muddati bilan.
 *
 * Butun kartochka bitta havola (sarlavhaning ::after qatlami), shuning uchun
 * ichidagi tugmalar `relative z-10` bilan undan yuqorida turadi.
 */
export function ProductTile({ product }: { product: ProductCard }) {
  const t = useT('products');
  const f = useFormat();
  const buyout = useBuyout();

  const state = lifecycleState(product);
  const style = STATE_STYLE[state];
  const stock = totalStock(product);
  const plan = product.plan;
  const days = product.daysLeft;
  const tone = planTone(plan, days);
  const horizon = coverHorizon(plan);
  const coverPct = days === null || days === undefined ? 0 : Math.min(100, (days / horizon) * 100);
  const cost = avgPurchasePrice(product.skus);
  const href = `/products/${product.id}`;
  /*
   * Davrda sotilgan, lekin hozir qoldig'i nol variantlar. Mahsulotda 296 dona
   * turgan bo'lsa ham "yetadi" 0 kun bo'ladi (eng tez tugaydigan variant) —
   * kartochka buni "0 kun" emas, "1 ta variant tugagan" deb aytadi.
   */
  const skusOut = product.skus.filter((s) => s.sold > 0 && s.stockFbo + s.stockFbs + s.stockOwn <= 0).length;
  const discount =
    product.listPrice > product.minPrice ? ((product.listPrice - product.minPrice) / product.listPrice) * 100 : 0;
  // Arxivdagi tovarga buyurtma ogohlantirishi kerak emas — u sotuvda emas
  const inactive = state === 'archived' || state === 'hidden';
  const buy = plan?.reorderQty ?? product.needOrder ?? 0;
  const ship = plan?.shipQty ?? 0;
  const perDay = plan && plan.avgDaily > 0 ? plan.avgDaily : 0;
  const coverHint =
    plan && plan.stockoutDate && days !== null && days !== undefined
      ? t('card.coverHint', { date: f.dateShort(plan.stockoutDate) })
      : undefined;
  const daysLabel =
    days === null || days === undefined
      ? t('card.noForecast')
      : days === 0 && stock > 0 && skusOut > 0
        ? t('card.skusOut', { n: f.num(skusOut) })
        : t('card.daysValue', { n: f.num(days) });

  return (
    /*
      Ko'tarilish oddiy CSS transform bilan: ilgari framer-motion har bir
      kartochkaga JS kuzatuvchi qo'yardi va 40 ta kartochkali ro'yxatda
      sichqon yurganda kadr tushardi.
    */
    <article className="card card-hover group relative flex flex-col overflow-hidden transition-[transform,border-color] duration-200 ease-spring hover:-translate-y-0.5">
      {/* 1. Rasm, nom, narx, variantlar */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          <ProductThumb name={product.title} imageUrl={product.imageUrl} style={{ fontSize: 21 }} />
        </div>
        <div className="min-w-0 flex-1">
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
          {/*
            Katta raqam — JORIY narx, u hech qachon kesilmaydi; chizilgani —
            chegirmadan oldingi narx (joy yetmasa u qisqaradi). O'rtacha
            sotilgan narx — tushum ostida.
          */}
          <p className="tnum mt-1 flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 font-display text-[15px] font-bold leading-tight text-ink">
              <Amount value={f.money(product.minPrice)} nowrap />
            </span>
            {discount > 0 ? (
              <span className="min-w-0 truncate text-2xs" title={f.money(product.listPrice)}>
                <span className="font-semibold text-danger-ink">−{f.pct(discount, 0)}</span>
                <span className="ml-1 text-muted line-through">{f.compact(product.listPrice)}</span>
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted" title={product.category ?? undefined}>
            {t('card.variants', { n: f.num(product.skuCount) })} · {product.category ?? t('card.noCategory')}
          </p>
        </div>
      </div>

      {/*
        2. Reyting va belgilar. Holat nishoni faqat "sotuvda" bo'lmasa —
        16 ta kartochkaning har birida "Sotuvda" turishi shovqin edi.
        min-h: belgisiz kartochkada ham pastki bloklar bir sathda turadi.
      */}
      <div className="flex min-h-[1.75rem] flex-wrap items-center gap-1 px-4 pt-3">
        {state !== 'active' ? (
          <span className={cn('chip px-2 py-0.5', style.chip)}>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
            {t(`state.${state}`)}
          </span>
        ) : null}
        {product.rating > 0 ? (
          <span
            className="chip bg-surface-3 px-2 py-0.5 text-ink-soft"
            title={`★ ${f.num(product.rating, 1)} · ${t('card.reviews', { n: f.num(product.reviewsCount) })}`}
          >
            <Star className="h-3 w-3 text-warn" />
            <span className="tnum">{f.num(product.rating, 1)}</span>
          </span>
        ) : null}
        <ProductTags product={product} max={state !== 'active' ? 1 : 2} />
      </div>

      {/*
        3. Davr natijasi 2×2. Har katak ostida o'z asosi: sotildi — kunlik
        sur'at (Rejalashtiruvchi tezligi), tushum — o'rtacha sotilgan narx,
        foyda — marja, xarid foizi — qaytarishlar. Foyda — yagona yashil
        raqam: rang faqat sotuvchida qolgan pulni bildiradi.
      */}
      <div className="well mx-4 mt-2.5 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line/70">
          <TileStat
            label={t('card.sold')}
            value={t('card.units', { n: f.num(product.sold) })}
            sub={perDay > 0 ? t('card.perDay', { n: f.num(perDay, 1) }) : t('card.noSalesShort')}
            title={t('card.perDayHint')}
          />
          <TileStat
            label={t('card.revenue')}
            value={f.compact(product.revenue)}
            sub={product.avgSoldPrice > 0 ? t('card.avgSub', { v: f.compact(product.avgSoldPrice) }) : undefined}
            title={`${f.money(product.revenue)}${product.avgSoldPrice > 0 ? `\n${t('card.priceWhy')}` : ''}`}
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-line/70 border-t border-line/70">
          <TileStat
            label={t('card.profit')}
            value={f.compact(product.profit)}
            valueClass={product.profit < 0 ? 'text-danger' : 'text-brand-ink'}
            sub={product.revenue > 0 ? t('card.marginSub', { pct: f.pct(product.margin) }) : undefined}
            subClass={product.profit < 0 ? 'text-danger' : undefined}
            // Tannarxsiz ROI hisoblanmaydi — "0,0%" chalg'itadi (tafsilot sahifasidagi bilan bir xil)
            title={`${f.money(product.profit)}\n${
              cost > 0 ? `${t('card.roi')} ${f.pct(product.roi)} · ${t('card.cost')} ${f.money(cost)}` : t('card.noCost')
            }`}
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

      {/* 4. Qoldiq */}
      <div className={cn('px-4 pt-3', coverHint && 'cursor-help')} title={coverHint}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-2xs">
          <span className="tnum shrink-0 text-muted">
            {t('card.stock')}{' '}
            <span className={cn('font-semibold', stock > 0 ? 'text-ink' : 'text-danger-ink')}>
              {t('card.units', { n: f.num(stock) })}
            </span>
          </span>
          <span className={cn('tnum min-w-0 truncate font-semibold', TONE_TEXT[tone])}>{daysLabel}</span>
        </div>
        <ProgressBar value={coverPct} tone={tone} />
        <p className="tnum mt-1.5 truncate text-2xs text-muted">
          FBO {f.num(product.stockFbo)} · FBS {f.num(product.stockFbs)} · {t('card.own')} {f.num(product.stockOwn)}
          {plan && plan.inbound > 0 ? ` · ${t('card.inbound', { n: f.num(plan.inbound) })}` : ''}
        </p>
      </div>

      {/*
        5. Qaror — Rejalashtiruvchining o'zi: sotib olish (kritikda qizil),
        o'z ombori/FBS dan FBO'ga jo'natish yoki "buyurtma shart emas". Qator
        doim bor — kartochkalar bir sathda turadi. Ilgari bu yerda "Jami
        qoldiq: N dona" turardi va buyurtma miqdori faqat qoldiq nolga
        tushgandagina chiqardi.
      */}
      {!inactive ? (
        <div className="px-4 pt-2.5">
          {buy > 0 ? (
            <DecisionChip
              tone={plan?.status === 'critical' || stock <= 0 ? 'danger' : 'warn'}
              icon={stock <= 0 ? <PackageX className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              title={plan ? t('card.needHint', { cover: f.num(plan.coverDays), lead: f.num(plan.leadDays) }) : undefined}
            >
              {t('card.needOrder', { n: f.num(buy) })}
            </DecisionChip>
          ) : ship > 0 ? (
            <DecisionChip tone="info" icon={<Truck className="h-3.5 w-3.5" />}>
              {t('card.ship', { n: f.num(ship) })}
            </DecisionChip>
          ) : (
            <DecisionChip
              tone="muted"
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              title={plan ? t('card.needHint', { cover: f.num(plan.coverDays), lead: f.num(plan.leadDays) }) : undefined}
            >
              {t('card.noNeed')}
            </DecisionChip>
          )}
        </div>
      ) : null}

      {/* Qatordagi eng baland kartochkagacha bo'sh joy — pastki qator hamma kartochkada bir sathda */}
      <div className="flex-1" aria-hidden />

      {/* Pastki qator — ID qidiruvda ham ishlaydi */}
      <div className="mx-4 mb-3 mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="tnum truncate text-2xs text-muted" title={t('card.idHint')}>
          ID {product.uzumProductId ?? product.id}
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
    <div className={cn('min-w-0 px-2.5 py-2', title && 'cursor-help')} title={title}>
      {/* Bosh harfli emas: tor katakka "Выручка", "Прибыль" kesilmasdan sig'sin */}
      <p className="truncate text-2xs font-medium text-muted">{label}</p>
      <p className={cn('tnum truncate text-sm font-bold leading-5', valueClass ?? 'text-ink')}>{value}</p>
      <p className={cn('tnum truncate text-2xs', subClass ?? 'text-muted')}>{sub ?? ' '}</p>
    </div>
  );
}

/** Qaror qatori: to'liq kenglikdagi yumshoq rangli chip */
function DecisionChip({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warn' | 'danger' | 'info' | 'muted';
  icon: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <p
      title={title}
      className={cn(
        'tnum flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
        tone === 'danger'
          ? 'bg-danger/10 text-danger-ink'
          : tone === 'warn'
            ? 'bg-warn/10 text-warn-ink'
            : tone === 'info'
              ? 'bg-info/10 text-info-ink'
              : 'bg-surface-2 font-medium text-muted',
        title && 'cursor-help',
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

/** Kartochka ko'rinishi uchun yuklanish skeleti — kartochka bilan bir xil tuzilishda */
export function ProductTileSkeleton() {
  return (
    <div className="card overflow-hidden p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton h-16 w-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="skeleton h-4 w-4/5" />
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      </div>
      <div className="skeleton mt-3 h-5 w-3/5" />
      <div className="skeleton mt-3 h-[7.25rem] w-full rounded-xl" />
      <div className="skeleton mt-3 h-2 w-full" />
      <div className="skeleton mt-2 h-3 w-4/5" />
      <div className="skeleton mt-3 h-8 w-full rounded-lg" />
      <div className="skeleton mt-4 h-4 w-full" />
    </div>
  );
}
