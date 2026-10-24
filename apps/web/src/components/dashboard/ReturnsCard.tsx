/**
 * "Qaytarish va bekor qilish" — tanlangan davr bo'yicha (Boshqaruv paneli,
 * Xarajatlar yonidagi o'ng ustun).
 *
 * Raqamlar yagona ta'rifdan (apps/api services/returns.ts summarizeReturns):
 * "Qaytarishlar" sahifasi jamlari va Sotuv voronkasi bilan AYNAN bir xil.
 * Ilgari panel, voronka va sahifa bir davr uchun uch xil foiz ko'rsatardi
 * (2026-10-24). Shuning uchun:
 *  - davr BUYURTMA sanasi bo'yicha (Uzum qaytarish sanasini bermaydi) — bu
 *    sarlavha ostida ochiq yoziladi, aks holda "nega boshqa sahifadagidan
 *    farq qiladi" degan savol tug'iladi;
 *  - o'zgarish foiz PUNKTIDA va teskari ma'noda: ulush kamaysa — yaxshi;
 *  - rang faqat qaytarish ulushida (rates.ts returnsTone, panel tavsiyalari
 *    bilan bir xil chegaralar). Bekor qilish uchun kelishilgan chegara yo'q —
 *    o'ylab topilmadi, raqam neytral;
 *  - qaytarish ulushining asosi (xaridor qabul qilgan + qaytgan dona) 0
 *    bo'lsa — masalan "Bugun" davrida hamma buyurtma hali yo'lda — "0%"
 *    emas, tire: yashil "0%" "qaytarish yo'q" deb o'qilardi.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, MessageSquare, RotateCcw } from '@/components/icons';
import type { DashboardReturnsResponse, ReturnsSummary } from '@savdoiq/shared';
import { Button, Card, CardBody, CardHeader, Delta, PlanGate, ProductThumb, Skeleton, type Tone } from '@/components/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { useReturnReasonLabel } from '@/lib/returnReasons';
import { cn } from '@/lib/utils';
import { useFeature } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { splitProductName } from './productName';
import { returnsTone } from './rates';

const NS = 'dashboardReturns';
/** Panelning "Yangilash" tugmasi shu kalit bilan kartani ham yangilaydi */
export const RETURNS_QUERY_KEY = 'dashboard-returns';

registerNamespace(NS, {
  uz: {
    title: 'Qaytarish va bekor qilish',
    subtitle: 'Buyurtma sanasi bo‘yicha',
    subtitleHint:
      'Uzum qaytarish sanasini bermaydi, shuning uchun davr buyurtma sanasi bo‘yicha — Qaytarishlar sahifasi va Sotuv voronkasidagi raqamlar bilan bir xil',
    returned: 'Qaytarishlar',
    canceled: 'Bekor qilishlar',
    'returned.hint': 'Qaytarish ulushi = qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona)',
    'canceled.hint': 'Bekor qilish ulushi = bekor qilingan dona ÷ buyurtma qilingan barcha dona',
    money: '{v} so‘m',
    units: '{n} dona',
    noBase: 'Xaridorlar hali qabul qilmagan',
    'reason.label': 'Asosiy sabab',
    'reason.share': 'qaytarishlardan',
    'reason.none': 'Xaridorlar sabab ko‘rsatmagan',
    'sku.label': 'Ko‘p qaytgan tovar',
    'sku.hint': '{n} dona qaytdi — shu tovarning qaytarish ulushi {p}',
    noReturns: 'Hozircha qaytarish yo‘q',
    'empty.title': 'Bu davrda buyurtma yo‘q',
    'empty.hint': 'Buyurtmalar kelgach, qaytarish va bekor qilish ulushi shu yerda chiqadi',
    error: 'Qaytarish va bekor qilishlarni yuklab bo‘lmadi',
  },
  ru: {
    title: 'Возвраты и отмены',
    subtitle: 'По дате заказа',
    subtitleHint:
      'Uzum не передаёт дату возврата, поэтому период — по дате заказа: цифры совпадают со страницей возвратов и воронкой продаж',
    returned: 'Возвраты',
    canceled: 'Отмены',
    'returned.hint': 'Доля возвратов = возвращённые шт. ÷ (полученные покупателем + возвращённые шт.)',
    'canceled.hint': 'Доля отмен = отменённые шт. ÷ все заказанные шт.',
    money: '{v} сум',
    units: '{n} шт.',
    noBase: 'Покупатели ещё не получили',
    'reason.label': 'Главная причина',
    'reason.share': 'от возвратов',
    'reason.none': 'Покупатели не указали причину',
    'sku.label': 'Чаще всего возвращают',
    'sku.hint': 'Возвращено: {n} шт. Доля возвратов товара: {p}',
    noReturns: 'Возвратов пока нет',
    'empty.title': 'За период нет заказов',
    'empty.hint': 'Когда появятся заказы, здесь будет доля возвратов и отмен',
    error: 'Не удалось загрузить возвраты и отмены',
  },
  en: {
    title: 'Returns & cancellations',
    subtitle: 'By order date',
    subtitleHint:
      'Uzum doesn’t report return dates, so the period is by order date — the numbers match the Returns page and the sales funnel',
    returned: 'Returns',
    canceled: 'Cancellations',
    'returned.hint': 'Return rate = returned units ÷ (units received by buyers + returned units)',
    'canceled.hint': 'Cancellation rate = cancelled units ÷ all ordered units',
    money: '{v} UZS',
    units: '{n} pcs',
    noBase: 'Not received by buyers yet',
    'reason.label': 'Top reason',
    'reason.share': 'of returns',
    'reason.none': 'Buyers gave no reason',
    'sku.label': 'Most returned',
    'sku.hint': '{n} pcs returned — this product’s return rate is {p}',
    noReturns: 'No returns so far',
    'empty.title': 'No orders in this period',
    'empty.hint': 'Return and cancellation rates will show up here once orders come in',
    error: 'Could not load returns and cancellations',
  },
});

/** Ulush raqamining rangi — "Marja va ROI" halqalaridagi raqamlar bilan bir xil */
const INK: Record<Tone, string> = {
  brand: 'text-brand-ink',
  info: 'text-info-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
  violet: 'text-violet-ink',
  muted: 'text-ink',
};

/** Sabab va tovar qatori — tayyor kartochka va skeletda bir xil, ma'lumot kelganda qator sakramasin */
const ROW = 'flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0';
const MEDIA = 'h-9 w-9 shrink-0 rounded-[10px]';
const LINK =
  'group inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-brand-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50';

type ReturnsData = Pick<DashboardReturnsResponse, 'current' | 'previous' | 'deltaPp'>;

export function ReturnsCard({ className }: { className?: string }) {
  return (
    <PlanGate feature="returns_report" compact className={className} previewChildren={<ReturnsView data={SAMPLE} sample />}>
      <LiveReturnsCard className={className} />
    </PlanGate>
  );
}

function LiveReturnsCard({ className }: { className?: string }) {
  const t = useT(NS);
  const q = usePeriodQuery();
  /*
   * Tarifda yopiq yoki "namuna" bo'lsa server 402 (plan_limit) qaytaradi —
   * so'rov faqat to'liq ruxsatda. PlanGate bu holatda bu komponentni
   * chizmaydi ham, lekin kimdir previewChildren'ni olib tashlasa, xiralashgan
   * kartochka ostidan rad etiladigan so'rovlar ketmasin.
   */
  const full = useFeature('returns_report') === 'full';
  const { data, isError, refetch } = useQuery({
    queryKey: [RETURNS_QUERY_KEY, q],
    queryFn: () => api.get<DashboardReturnsResponse>('/dashboard/returns', q),
    enabled: full,
  });

  // Fon yangilanishi xato bersa ham oxirgi raqamlar qoladi — kartochka xato oynasiga almashmaydi
  if (data) return <ReturnsView data={data} className={className} />;

  if (isError) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <ReturnsHeader />
        <CardBody className="flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-sm text-muted">{t('error')}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t('btn.retry')}
          </Button>
        </CardBody>
      </Card>
    );
  }

  return <ReturnsSkeleton className={className} />;
}

/** Sarlavha ma'lumotga bog'liq emas — skelet va xato holatida ham aynan shu chiziladi */
function ReturnsHeader() {
  const t = useT(NS);
  return (
    <CardHeader
      icon={<RotateCcw />}
      title={t('title')}
      subtitle={<span title={t('subtitleHint')}>{t('subtitle')}</span>}
    />
  );
}

function ReturnsView({ data, className, sample }: { data: ReturnsData; className?: string; sample?: boolean }) {
  const t = useT(NS);
  const tc = useT('common');
  const f = useFormat();
  const reasonLabel = useReturnReasonLabel();
  const { current: c, previous: p, deltaPp } = data;

  // Davrda buyurtma yo'q — katta bo'sh quti emas, ixcham izoh (ustundagi Do'konlar yuqoriga ko'tariladi)
  if (c.orderedUnits === 0) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <ReturnsHeader />
        <CardBody>
          <div className="well px-3.5 py-3">
            <p className="text-sm font-medium text-ink">{t('empty.title')}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">{t('empty.hint')}</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const hasBase = c.soldUnits + c.returned.qty > 0;
  // Kartochka chizig'i qaytarish holatini takrorlaydi (MarginRoiCard'dagi kabi); asos yo'q — tinch
  const tone = hasBase ? returnsTone(c.returned.rate) : undefined;

  const tiles = [
    {
      key: 'returned',
      label: t('returned'),
      hint: t('returned.hint'),
      part: c.returned,
      rate: hasBase ? c.returned.rate : null,
      ink: tone ? INK[tone] : 'text-muted',
      delta: deltaPp?.returned ?? null,
      prev: p?.returned.rate ?? null,
    },
    {
      key: 'canceled',
      label: t('canceled'),
      hint: t('canceled.hint'),
      part: c.canceled,
      rate: c.canceled.rate,
      ink: 'text-ink',
      delta: deltaPp?.canceled ?? null,
      prev: p?.canceled.rate ?? null,
    },
  ];

  const sku = c.topSku ? { ...c.topSku, ...splitProductName(c.topSku) } : null;

  return (
    <Card tone={tone} className={cn('flex flex-col', className)}>
      <ReturnsHeader />
      <CardBody className="flex flex-1 flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((x) => (
            <div key={x.key} className="well flex min-w-0 flex-col p-3" title={x.hint}>
              <p className="truncate text-xs font-medium leading-4 text-ink-soft">{x.label}</p>
              {/* Tor ustunda (1280–1440 px) o'zgarish belgisi raqam ostiga o'tadi — skelet ham shunday */}
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className={cn('tnum font-display text-xl font-bold leading-7 tracking-[-0.02em]', x.ink)}>
                  {x.rate === null ? '—' : f.pct(x.rate)}
                </span>
                {x.rate !== null ? (
                  <span title={x.delta !== null && x.prev !== null ? tc('common.prevValue', { v: f.pct(x.prev) }) : undefined}>
                    <Delta value={x.delta} unit="pp" invert className="px-2 py-0.5 text-2xs" />
                  </span>
                ) : null}
              </div>
              {x.rate === null ? (
                <p className="mt-1 line-clamp-2 text-2xs text-muted">{t('noBase')}</p>
              ) : (
                <>
                  {/*
                    Summa va dona alohida qatorda: bitta "86 dona · 24,3 mln so‘m"
                    qatori tor plitkada ba'zan ikkiga bo'linib, plitkalar bo'yi
                    turlicha bo'lib qolardi. To'liq summa — sichqoncha olib borilganda.
                  */}
                  <p className="tnum mt-1 truncate text-xs font-semibold leading-4 text-ink-soft" title={f.money(x.part.amount)}>
                    {t('money', { v: f.compact(x.part.amount) })}
                  </p>
                  <p className="tnum truncate text-2xs text-muted">{t('units', { n: f.num(x.part.qty) })}</p>
                </>
              )}
            </div>
          ))}
        </div>

        {c.returned.qty === 0 ? (
          <div className="flex items-center gap-3">
            <span className={cn('icon-tile tone-brand [&_svg]:h-[18px] [&_svg]:w-[18px]', MEDIA)} aria-hidden>
              <CheckCircle2 />
            </span>
            <p className="min-w-0 text-sm text-muted">{t('noReturns')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-line/70">
            <li className={ROW}>
              {/* Ohang kartochkadan meros — sabab alohida "xavf" rangiga bo'yalmaydi */}
              <span className={cn('icon-tile [&_svg]:h-[18px] [&_svg]:w-[18px]', MEDIA)} aria-hidden>
                <MessageSquare />
              </span>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{t('reason.label')}</p>
                {/*
                  Sabab kesilmaydi, kerak bo'lsa ikki qatorga o'tadi — u kartaning
                  asosiy xulosasi. Asl (ko'pincha ruscha) matn izohda, sahifadagi kabi.
                */}
                {c.topReason ? (
                  <p className="mt-0.5 line-clamp-2 break-words text-sm font-medium leading-5 text-ink" title={c.topReason.raw}>
                    {reasonLabel(c.topReason.raw)}
                  </p>
                ) : (
                  // Hamma qaytarish sababsiz — server "Клиент не указал причину" ni sabab deb sanamaydi
                  <p className="mt-0.5 truncate text-sm leading-5 text-muted">{t('reason.none')}</p>
                )}
              </div>
              {c.topReason ? (
                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-semibold leading-5 text-ink">{f.pct(c.topReason.share)}</p>
                  <p className="text-2xs text-muted">{t('reason.share')}</p>
                </div>
              ) : null}
            </li>

            {sku ? (
              <li className={ROW}>
                <div className={cn('overflow-hidden border border-line bg-surface-2', MEDIA)}>
                  <ProductThumb name={sku.name} imageUrl={sku.imageUrl} style={{ fontSize: 12 }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{t('sku.label')}</p>
                  {/*
                    Nom — mahsulotniki, variant yonida (TopProductsCard kabi): SKU
                    nomi ko'pincha faqat «ЧЕРН» yoki «41» bo'ladi va qaysi tovar
                    ekani bilinmasdi. Nom kesiladi, variant esa juda uzun bo'lsagina.
                  */}
                  <p
                    className="mt-0.5 flex min-w-0 text-sm font-medium leading-5 text-ink"
                    title={[sku.name, sku.variant, sku.sku].filter(Boolean).join(' · ')}
                  >
                    <span className="truncate">{sku.name}</span>
                    {sku.variant ? (
                      <span className="ml-1 max-w-[60%] shrink-0 truncate font-normal text-muted">· {sku.variant}</span>
                    ) : null}
                  </p>
                </div>
                {/* Tovarning O'Z ulushi: ko'p sotilgani uchun ko'p qaytganmi yoki chindan muammolimi — shundan bilinadi */}
                <div
                  className="shrink-0 text-right"
                  title={t('sku.hint', { n: f.num(sku.qty), p: f.pct(sku.rate) })}
                >
                  <p className={cn('tnum text-sm font-semibold leading-5', INK[returnsTone(sku.rate)])}>{f.pct(sku.rate)}</p>
                  <p className="tnum text-2xs text-muted">{t('units', { n: f.num(sku.qty) })}</p>
                </div>
              </li>
            ) : null}
          </ul>
        )}

        <div className="mt-auto flex justify-end border-t border-line pt-3">
          {/* Namunada havola yo'q: xiralashgan qatlam ostida Tab bilan fokuslanmasin */}
          {sample ? (
            <span className={LINK}>
              {t('btn.more')}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Link to="/returns" className={LINK}>
              {t('btn.more')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Tayyor kartochka bilan bir xil tartib va balandliklar — ma'lumot kelganda ustun sakramasin */
function ReturnsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <ReturnsHeader />
      <CardBody className="flex flex-1 flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="well flex min-w-0 flex-col p-3">
              <Skeleton className="my-0.5 h-3 w-20 max-w-full" />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <Skeleton className="my-0.5 h-6 w-14" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="mb-0.5 mt-1.5 h-3 w-20 max-w-full" />
              <Skeleton className="my-1 h-2 w-12" />
            </div>
          ))}
        </div>
        <ul className="divide-y divide-line/70">
          {[0, 1].map((i) => (
            <li key={i} className={ROW}>
              <Skeleton className={MEDIA} />
              <div className="min-w-0 flex-1">
                <Skeleton className="my-1 h-2 w-20" />
                <Skeleton className="mb-0.5 mt-1 h-4 w-32 max-w-full" />
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <Skeleton className="my-0.5 h-4 w-10" />
                <Skeleton className="my-0.5 h-3 w-14" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex justify-end border-t border-line pt-3">
          <Skeleton className="h-4 w-16" />
        </div>
      </CardBody>
    </Card>
  );
}

/*
 * Tarif "namuna" (preview) rejimida xiralashgan kartochka ostidagi qo'lda
 * yozilgan namuna — sotuvchining ma'lumoti EMAS (u holda server 402
 * qaytaradi, so'rov umuman yuborilmaydi). Haqiqiy kartochka bilan bir xil
 * ko'rinsin deb ReturnsView'ning o'zi chiziladi; raqamlar ta'rifga mos
 * (5,9% = 74 ÷ (1180 + 74), 6,76% = 96 ÷ 1420).
 */
const SAMPLE_CURRENT: ReturnsSummary = {
  soldUnits: 1180,
  orderedUnits: 1420,
  returned: { qty: 74, amount: 9_850_000, rate: 5.9 },
  canceled: { qty: 96, amount: 12_400_000, rate: 6.76 },
  topReason: { raw: 'Не подошёл размер', qty: 31, share: 41.89 },
  topSku: {
    skuId: 'sample',
    productId: 'sample',
    sku: 'RA-41',
    title: '41',
    productTitle: 'Sport krossovka Runner Air',
    imageUrl: null,
    qty: 12,
    amount: 1_980_000,
    rate: 9.84,
  },
};

const SAMPLE: ReturnsData = {
  current: SAMPLE_CURRENT,
  previous: {
    ...SAMPLE_CURRENT,
    returned: { qty: 61, amount: 8_120_000, rate: 5.1 },
    canceled: { qty: 104, amount: 13_300_000, rate: 7.96 },
  },
  deltaPp: { returned: 0.8, canceled: -1.2 },
};
