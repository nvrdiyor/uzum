import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Lightbulb,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Trophy,
  type AppIcon,
} from '@/components/icons';
import type { Insight } from '@savdoiq/shared';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Skeleton, type Tone } from '@/components/ui';

/** Daraja → ohang. Qizil faqat "danger" (zarar, tugagan qoldiq) uchun — ogohlantirish sariq */
const LEVEL: Record<Insight['level'], { tone: Tone; icon: AppIcon }> = {
  danger: { tone: 'danger', icon: ShieldAlert },
  warning: { tone: 'warn', icon: AlertTriangle },
  success: { tone: 'brand', icon: CheckCircle2 },
  info: { tone: 'info', icon: Info },
};

type Kind = 'stock' | 'loss' | 'illiquid' | 'returns' | 'profit' | 'revenue' | 'margin' | 'buyout' | 'sync' | 'check';

/**
 * Tavsiya turi — kartadagi kichik chip ("Qoldiq", "Marja", "Nolikvid").
 * Server matnni faqat o'zbekcha yuboradi, `id` esa barqaror (analytics.ts
 * buildInsights) — tur nomi shundan, uch tilda chiqadi. Noma'lum yangi `id`
 * kelsa `metric` bo'yicha topiladi, u ham bo'lmasa chip chiqmaydi.
 */
const KIND_BY_ID: Record<string, Kind> = {
  stock_ending: 'stock',
  negative_profit: 'loss',
  illiquid_frozen: 'illiquid',
  returns_up: 'returns',
  best_product: 'profit',
  revenue_trend: 'revenue',
  low_margin: 'margin',
  low_buyout: 'buyout',
  no_data: 'sync',
  stock_value: 'stock',
  avg_check: 'check',
  margin_now: 'margin',
};

const KIND_BY_METRIC: Record<string, Kind> = {
  stock: 'stock',
  stockValue: 'stock',
  frozen: 'illiquid',
  returnsRate: 'returns',
  netProfit: 'profit',
  revenue: 'revenue',
  margin: 'margin',
  buyoutRate: 'buyout',
  orders: 'sync',
  avgCheck: 'check',
};

/** Tur belgisi: daraja rangda ko'rinadi, belgi esa "nima haqida" ekanini aytadi */
const KIND_ICON: Record<Kind, AppIcon> = {
  stock: Package,
  loss: TrendingDown,
  illiquid: Snowflake,
  returns: RotateCcw,
  profit: Trophy,
  revenue: TrendingUp,
  margin: Percent,
  buyout: ShoppingBag,
  sync: RefreshCw,
  check: Receipt,
};

function insightKind(ins: Insight): Kind | null {
  return KIND_BY_ID[ins.id] ?? (ins.metric ? KIND_BY_METRIC[ins.metric] : undefined) ?? null;
}

/**
 * Karta kengligi — oxirgi qatorda bo'sh joy qolmasin.
 * Ilgari 5-karta 2 ustunli to'rda yolg'iz qolib, qatorning yarmi bo'sh edi.
 * xl: 6 ustunli to'r — 3 ta karta qatorda (2 dan), 4 ta — 2×2, 5 ta — 3 + 2.
 * md (2 ustun): toq sonda oxirgisi butun qatorni oladi.
 */
function spanClass(i: number, n: number): string {
  const md = n % 2 === 1 && i === n - 1 ? 'md:col-span-2' : '';
  const xl =
    n === 1 ? 'xl:col-span-6' : n === 2 || n === 4 || (n === 5 && i >= 3) ? 'xl:col-span-3' : 'xl:col-span-2';
  return cn(md, xl);
}

/**
 * "Tavsiyalar" — ma'lumotdan topilgan muhim nuqtalar.
 *
 * Ilgari har karta daraja rangiga to'liq bo'yalgan edi (bg-warn/10,
 * bg-danger/10): qorong'i mavzuda ular loyqa jigarrang va qizg'ish
 * bloklarga aylanib, bir-biridan ajralmasdi, 5-karta esa 2 ustunli to'rda
 * yolg'iz qolardi. Endi fon neytral, daraja faqat chap chiziq va belgi
 * plitkasida — ko'z avval rangga emas, sarlavhaga tushadi.
 *
 * Telefonda: gorizontal aylantiriladigan qator; kattaroq ekranda to'r
 * (ustunlar soni kartalar soniga moslanadi — spanClass).
 */
export function InsightsBlock({ items, loading }: { items: Insight[]; loading?: boolean }) {
  const t = useT('dashboard');

  return (
    <section className="space-y-3" aria-labelledby="insights-title">
      {/* Sanoq chipi telefonda ham o'ng yuqorida qoladi — alohida qatorga tushib, yolg'iz turmasin */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
            <Lightbulb />
          </span>
          <div className="min-w-0">
            <h2 id="insights-title" className="section-title">
              {t('insights.title')}
            </h2>
            <p className="text-sm text-muted">{t('insights.subtitle')}</p>
          </div>
        </div>
        {!loading && items.length > 0 ? (
          <span className="meta-chip tnum mt-1 shrink-0">{t('insights.count', { n: items.length })}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6 xl:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-[176px] w-full rounded-2xl', spanClass(i, 3))} />
          ))}
        </div>
      ) : items.length === 0 ? (
        // Bo'sh holat ham ixcham karta — katta bo'sh maydon "nimadir yuklanmadi" deb o'qilardi
        <div className="card tone-brand flex items-center gap-3.5 p-4 sm:p-5">
          <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
            <CheckCircle2 />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-ink">{t('insights.empty')}</p>
            <p className="mt-0.5 text-sm text-muted">{t('insights.emptyHint')}</p>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-6 xl:gap-5">
          {items.map((ins, i) => (
            <InsightCard key={ins.id} insight={ins} className={spanClass(i, items.length)} />
          ))}
        </div>
      )}
    </section>
  );
}

function InsightCard({ insight, className }: { insight: Insight; className?: string }) {
  const t = useT('dashboard');
  const level = LEVEL[insight.level] ?? LEVEL.info;
  const kind = insightKind(insight);
  // Tushum trendi pasaygan bo'lsa belgi ham pastga qarasin
  const Icon =
    kind === 'revenue' && insight.level !== 'success' ? TrendingDown : kind ? KIND_ICON[kind] : level.icon;

  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          {kind ? (
            <span className="inline-flex max-w-full items-center truncate rounded-md bg-surface-3/80 px-1.5 py-0.5 text-2xs font-semibold text-ink-soft">
              {t(`insights.kind.${kind}`)}
            </span>
          ) : null}
          {/* Sarlavha va matn ikki qatorgacha — bir qatordagi kartalar bo'yi bir xil bo'lsin */}
          <p className={cn('line-clamp-2 font-display text-sm font-bold leading-snug text-ink', kind && 'mt-1.5')}>
            {insight.title}
          </p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted" title={insight.body}>
        {insight.body}
      </p>
      {insight.link ? (
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-[rgb(var(--tone-ink))]">
          {t('insights.view')}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      ) : null}
    </>
  );

  /*
   * Chap chet — daraja rangidagi 3px chiziq (border-l), qolgan chegaralar
   * oddiy. hover:border-line-strong chap chiziqni ham kulrangga bo'yamasin
   * deb u hover'da qayta yoziladi.
   */
  const shell = cn(
    'group relative flex w-[86%] min-w-[268px] shrink-0 snap-start flex-col rounded-2xl border border-l-[3px] border-line border-l-[rgb(var(--tone))] bg-surface p-4 shadow-card md:w-auto md:min-w-0',
    `tone-${level.tone}`,
    className,
  );

  // Butun karta bosiladi — ilgari faqat kichik "Ko'rish" yozuvi havola edi
  return insight.link ? (
    <Link
      to={insight.link}
      className={cn(
        shell,
        'transition-colors duration-200 hover:border-line-strong hover:border-l-[rgb(var(--tone))] hover:bg-surface-2/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
      )}
    >
      {content}
    </Link>
  ) : (
    <article className={shell}>{content}</article>
  );
}
