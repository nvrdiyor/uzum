/**
 * "E‘tibor talab qiladi" — "Mahsulot foydasi" sahifasidagi kartalar.
 *
 * Kartalarni server tanlaydi (services/product-profit.ts): eng ko'pi 4 ta,
 * pul ta'siri bo'yicha, har biri boshqa tur va boshqa mahsulot. Server faqat
 * raqam yuboradi — matn shu yerda, uch tilda. Ilgari bunday xulosalar
 * serverda o'zbekcha yig'ilardi va ruscha interfeysda ham o'zbekcha qolardi
 * (Boshqaruv panelidagi "Davr xulosalari").
 *
 * Butun karta mahsulot sahifasiga olib boradi (cho'zilgan havola); "yana N ta"
 * tugmasi esa jadvaldagi o'sha bo'limni ochadi — ichma-ich havola bo'lmasin
 * deb u havola ustida alohida qatlamda turadi.
 */
import { Link } from 'react-router-dom';
import type { ProductProfitAttention, ProductProfitFlag, ProductProfitRow } from '@savdoiq/shared';
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  Scale,
  ShoppingBag,
  Tag,
  TrendingDown,
  Trophy,
  type AppIcon,
} from '@/components/icons';
import { ProductThumb, Skeleton, type Tone } from '@/components/ui';
import { registerNamespace, useFormat, useT, type TFunc } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('productProfitAttention', {
  uz: {
    title: 'E‘tibor talab qiladi',
    subtitle: 'Eng katta summadan boshlab. Kartani bosing — mahsulot sahifasi ochiladi.',
    'kind.profitLeader': 'Foyda yetakchisi',
    'kind.topSeller': 'Eng ko‘p sotilgan',
    'kind.lowBuyout': 'Past xarid',
    'kind.checkEconomics': 'Iqtisodini tekshiring',
    'kind.noCost': 'Tannarxsiz',
    'kind.lossMaker': 'Zarar',
    'profitLeader.main': '{v} sof foyda',
    'profitLeader.sub': 'Marja {margin} · foydali mahsulotlar foydasining {share} qismi. Qoldig‘i tugab qolmasin.',
    'topSeller.main': '{n} dona sotildi',
    'topSeller.sub': 'Sotilgan donalarning {share} qismi · 1 donadan {perUnit} qoladi.',
    'lowBuyout.main': 'Xarid {rate} — o‘rtachadan {gap} p.p. past',
    'lowBuyout.sub': '{lost} dona bekor qilindi yoki qaytdi (≈ {impact} tushum). Do‘kon o‘rtachasi {storeRate}.',
    'lowBuyout.subNoImpact': '{lost} dona bekor qilindi yoki qaytdi. Do‘kon o‘rtachasi {storeRate}.',
    'checkEconomics.main': 'Marja {margin} — {revenue} tushumdan',
    'checkEconomics.sub': '1 donadan atigi {perUnit} qoladi. Narx, komissiya va logistikani tekshiring.',
    'noCost.main': '{revenue} sotuv tannarxsiz',
    'noCost.sub': '{units} dona · tannarxsiz SKU: {skus}. Foyda haqiqiydan katta ko‘rinadi.',
    'lossMaker.main': 'Zarar: {v}',
    'lossMaker.subAds': 'Reklama {ads} — usiz {withoutAds} foyda qolardi.',
    'lossMaker.subNoSales': 'Davrda sotuv yo‘q, reklama uchun {ads} yechildi.',
    'lossMaker.sub': 'Har donadan {perUnit} zarar. Narx yoki tannarxni qayta ko‘rib chiqing.',
    more: 'Yana {n} ta — «{tab}»',
  },
  ru: {
    title: 'Требует внимания',
    subtitle: 'Сначала самые крупные суммы. Нажмите на карточку — откроется страница товара.',
    'kind.profitLeader': 'Лидер по прибыли',
    'kind.topSeller': 'Хит продаж',
    'kind.lowBuyout': 'Низкий выкуп',
    'kind.checkEconomics': 'Проверьте экономику',
    'kind.noCost': 'Без себестоимости',
    'kind.lossMaker': 'Убыток',
    'profitLeader.main': 'Чистая прибыль {v}',
    'profitLeader.sub': 'Маржа {margin} · доля в прибыли прибыльных товаров — {share}. Не допускайте, чтобы закончился остаток.',
    'topSeller.main': 'Продано: {n} шт.',
    'topSeller.sub': 'Доля в проданных штуках — {share} · с 1 шт. остаётся {perUnit}.',
    'lowBuyout.main': 'Выкуп {rate} — на {gap} п.п. ниже среднего',
    'lowBuyout.sub': 'Отменено или возвращено: {lost} шт. (≈ {impact} выручки). В среднем по магазину {storeRate}.',
    'lowBuyout.subNoImpact': 'Отменено или возвращено: {lost} шт. В среднем по магазину {storeRate}.',
    'checkEconomics.main': 'Маржа {margin} при выручке {revenue}',
    'checkEconomics.sub': 'С 1 шт. остаётся всего {perUnit}. Проверьте цену, комиссию и логистику.',
    'noCost.main': 'Продажи без себестоимости: {revenue}',
    'noCost.sub': '{units} шт. · SKU без себестоимости: {skus}. Прибыль выглядит больше реальной.',
    'lossMaker.main': 'Убыток: {v}',
    'lossMaker.subAds': 'Реклама {ads} — без неё осталась бы прибыль {withoutAds}.',
    'lossMaker.subNoSales': 'Продаж за период нет, за рекламу списано {ads}.',
    'lossMaker.sub': 'Убыток с 1 шт.: {perUnit}. Пересмотрите цену или себестоимость.',
    more: 'Ещё: {n} — «{tab}»',
  },
  en: {
    title: 'Needs attention',
    subtitle: 'Biggest amounts first. Click a card to open the product.',
    'kind.profitLeader': 'Profit leader',
    'kind.topSeller': 'Top seller',
    'kind.lowBuyout': 'Low buyout',
    'kind.checkEconomics': 'Check the economics',
    'kind.noCost': 'No cost price',
    'kind.lossMaker': 'Loss-maker',
    'profitLeader.main': '{v} net profit',
    'profitLeader.sub': 'Margin {margin} · {share} of the profit from profitable products. Keep it in stock.',
    'topSeller.main': '{n} units sold',
    'topSeller.sub': '{share} of all units sold · {perUnit} left per unit.',
    'lowBuyout.main': 'Buyout {rate} — {gap} pp below average',
    'lowBuyout.sub': '{lost} units cancelled or returned (≈ {impact} of revenue). Store average {storeRate}.',
    'lowBuyout.subNoImpact': '{lost} units cancelled or returned. Store average {storeRate}.',
    'checkEconomics.main': 'Margin {margin} on {revenue} of revenue',
    'checkEconomics.sub': 'Only {perUnit} left per unit. Check the price, commission and logistics.',
    'noCost.main': '{revenue} of sales without cost price',
    'noCost.sub': '{units} units · SKUs without cost: {skus}. Profit looks higher than it is.',
    'lossMaker.main': 'Loss: {v}',
    'lossMaker.subAds': 'Ads cost {ads} — without them {withoutAds} profit would remain.',
    'lossMaker.subNoSales': 'No sales this period, {ads} charged for ads.',
    'lossMaker.sub': '{perUnit} lost per unit. Review the price or the cost price.',
    more: '{n} more in “{tab}”',
  },
});

type Kind = ProductProfitAttention['kind'];

/** Tur → rang va belgi. Qizil faqat zarar uchun; yutuqlar brend va ko'k, ogohlantirishlar za'faron */
const KIND: Record<Kind, { tone: Tone; icon: AppIcon }> = {
  profitLeader: { tone: 'brand', icon: Trophy },
  topSeller: { tone: 'info', icon: Flame },
  lowBuyout: { tone: 'warn', icon: ShoppingBag },
  checkEconomics: { tone: 'warn', icon: Scale },
  noCost: { tone: 'warn', icon: Tag },
  lossMaker: { tone: 'danger', icon: TrendingDown },
};

/** Muammo kartasi qaysi bo'limga olib boradi ("yana N ta" tugmasi) */
const KIND_TAB: Partial<Record<Kind, ProductProfitFlag>> = {
  lowBuyout: 'lowBuyout',
  checkEconomics: 'lowMargin',
  noCost: 'noCost',
  lossMaker: 'loss',
};

/**
 * Karta tarmog'i kartalar soniga qarab: 3 ta bo'lsa md'da oxirgisi butun
 * qatorni oladi — 2 ustunli to'rda yolg'iz qolib, qatorning yarmi bo'sh turmasin.
 * Klasslar to'liq yozilgan: Tailwind shablon qatoridan yasalganini ko'rmaydi.
 */
const GRID: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 xl:grid-cols-3',
  4: 'md:grid-cols-2 xl:grid-cols-4',
};

type Format = ReturnType<typeof useFormat>;

/** Karta matni: asosiy qator (summa bilan) va izoh — server raqamlaridan, tanlangan tilda */
function describe(a: ProductProfitAttention, row: ProductProfitRow | undefined, t: TFunc, f: Format): { main: string; sub: string } {
  switch (a.kind) {
    case 'profitLeader':
      return {
        main: t('profitLeader.main', { v: f.money(a.values.netProfit) }),
        sub: t('profitLeader.sub', { margin: f.pct(a.values.margin), share: f.pct(a.values.share) }),
      };
    case 'topSeller':
      return {
        main: t('topSeller.main', { n: f.num(a.values.units) }),
        sub: t('topSeller.sub', { share: f.pct(a.values.share), perUnit: f.money(a.values.perUnit) }),
      };
    case 'lowBuyout': {
      const vars = {
        rate: f.pct(a.values.rate),
        gap: f.num(a.values.gap, 1),
        lost: f.num(a.values.lost),
        impact: f.money(a.values.impact),
        storeRate: f.pct(a.values.storeRate),
      };
      return {
        main: t('lowBuyout.main', vars),
        sub: t(a.values.impact > 0 ? 'lowBuyout.sub' : 'lowBuyout.subNoImpact', vars),
      };
    }
    case 'checkEconomics':
      return {
        main: t('checkEconomics.main', { margin: f.pct(a.values.margin), revenue: f.money(a.values.revenue) }),
        sub: t('checkEconomics.sub', { perUnit: f.money(a.values.perUnit) }),
      };
    case 'noCost':
      return {
        main: t('noCost.main', { revenue: f.money(a.values.revenue) }),
        sub: t('noCost.sub', { units: f.num(a.values.units), skus: f.num(a.values.skus) }),
      };
    case 'lossMaker': {
      const { netProfit, ads, perUnit } = a.values;
      const withoutAds = netProfit + ads;
      // Reklama zararga aylantirgan bo'lsa — aynan shuni aytamiz: tovarning o'zi foydali
      const sub =
        ads > 0 && (row?.units ?? 0) === 0
          ? t('lossMaker.subNoSales', { ads: f.money(ads) })
          : ads > 0 && withoutAds >= 0
            ? t('lossMaker.subAds', { ads: f.money(ads), withoutAds: f.money(withoutAds) })
            : t('lossMaker.sub', { perUnit: f.money(Math.abs(perUnit)) });
      return { main: t('lossMaker.main', { v: f.money(Math.abs(netProfit)) }), sub };
    }
  }
}

export function ProfitAttention({
  items,
  rows,
  loading,
  onShowTab,
  tabLabel,
}: {
  items: ProductProfitAttention[];
  /** Mahsulot nomi va rasmi — kartada id'dan topiladi */
  rows: ProductProfitRow[];
  loading?: boolean;
  /** "Yana N ta" tugmasi — jadvaldagi bo'limni ochadi */
  onShowTab?: (flag: ProductProfitFlag) => void;
  /** Bo'lim nomi (sahifa tablari bilan bir xil) */
  tabLabel: (flag: ProductProfitFlag) => string;
}) {
  const t = useT('productProfitAttention');

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[156px] w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  // Ko'rsatadigan narsa bo'lmasa bo'lim umuman chiqmaydi — bo'sh sarlavha "nimadir yuklanmadi" deb o'qilardi
  if (items.length === 0) return null;

  const byId = new Map(rows.map((r) => [r.productId, r]));
  const n = Math.min(items.length, 4);

  return (
    <section className="space-y-3" aria-labelledby="profit-attention-title">
      <div className="flex min-w-0 items-center gap-3">
        <span className="icon-tile tone-warn h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
          <AlertTriangle />
        </span>
        <div className="min-w-0">
          <h2 id="profit-attention-title" className="section-title">
            {t('title')}
          </h2>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
      </div>

      {/* Telefonda gorizontal aylantiriladigan qator, kattaroq ekranda to'r */}
      <div
        className={cn(
          'no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1',
          'md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0',
          GRID[n],
        )}
      >
        {items.slice(0, 4).map((a, i) => (
          <AttentionCard
            key={`${a.kind}:${a.productId}`}
            item={a}
            row={byId.get(a.productId)}
            single={n === 1}
            // 3 ta kartada oxirgisi md'da butun qatorni oladi, xl'da yana bitta ustun
            className={n === 3 && i === 2 ? 'md:col-span-2 xl:col-span-1' : undefined}
            onShowTab={onShowTab}
            tabLabel={tabLabel}
          />
        ))}
      </div>
    </section>
  );
}

function AttentionCard({
  item,
  row,
  single,
  className,
  onShowTab,
  tabLabel,
}: {
  item: ProductProfitAttention;
  row: ProductProfitRow | undefined;
  /** Yagona karta telefonda ham butun kenglikda */
  single: boolean;
  className?: string;
  onShowTab?: (flag: ProductProfitFlag) => void;
  tabLabel: (flag: ProductProfitFlag) => string;
}) {
  const t = useT('productProfitAttention');
  const f = useFormat();
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  const { main, sub } = describe(item, row, t, f);
  const tab = KIND_TAB[item.kind];
  const more = 'more' in item.values ? item.values.more : 0;
  const title = row?.title ?? '—';

  return (
    <article
      className={cn(
        /*
         * Fon neytral, ma'no — chap chiziq va belgi plitkasida (Boshqaruv
         * panelidagi "Davr xulosalari" kartalari bilan bir xil): to'liq
         * bo'yalgan kartalar qorong'i mavzuda loyqa bloklarga aylanardi.
         */
        'group relative flex shrink-0 snap-start flex-col rounded-2xl border border-l-[3px] border-line border-l-[rgb(var(--tone))] bg-surface p-4 shadow-card',
        'transition-colors duration-200 hover:border-line-strong hover:border-l-[rgb(var(--tone))] hover:bg-surface-2/40',
        'focus-within:ring-2 focus-within:ring-brand/50',
        single ? 'w-full' : 'w-[86%] min-w-[260px]',
        'md:w-auto md:min-w-0',
        `tone-${kind.tone}`,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <span className="inline-flex max-w-full items-center truncate rounded-md bg-surface-3/80 px-1.5 py-0.5 text-2xs font-semibold text-ink-soft">
            {t(`kind.${item.kind}`)}
          </span>
          {/* Cho'zilgan havola: after: qatlami butun kartani qoplaydi — karta istalgan joyidan bosiladi */}
          <Link
            to={`/products/${item.productId}`}
            className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-soft after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            title={title}
          >
            <span className="h-5 w-5 shrink-0 overflow-hidden rounded border border-line bg-surface-2" aria-hidden>
              <ProductThumb name={title} imageUrl={row?.imageUrl} style={{ fontSize: 8 }} />
            </span>
            <span className="truncate">{title}</span>
          </Link>
        </div>
      </div>

      <p className="tnum mt-3 line-clamp-2 font-display text-[15px] font-bold leading-snug text-ink">{main}</p>
      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted" title={sub}>
        {sub}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {tab && more > 0 && onShowTab ? (
          // Havola qatlamidan yuqorida (relative z-10) — bosilganda mahsulot sahifasi emas, bo'lim ochiladi
          <button
            type="button"
            onClick={() => onShowTab(tab)}
            className="relative z-10 rounded-md text-xs font-semibold text-[rgb(var(--tone-ink))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {t('more', { n: f.num(more), tab: tabLabel(tab) })}
          </button>
        ) : (
          <span />
        )}
        <ArrowRight
          className="h-4 w-4 shrink-0 text-[rgb(var(--tone-ink))] transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </article>
  );
}
