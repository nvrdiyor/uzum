/**
 * «Partiya foydasi» (2026-11-12). Egasi: "partiyalar foydasi juda chalkash!!!!
 * juda tushunarsiz — alohida sidebar qil, Partiyalar tagidan «Partiya foydasi»".
 *
 * Har partiya — bitta kartochka, egasining so'zlari bilan: "shuncha tovar,
 * shuncha pul chiqib ketdi, undan sof foyda buncha; 3-partiya hali bormadi —
 * qabul jarayonida". To'rtta raqam chapdan o'ngga: Sarflangan pul → Sotildi →
 * Qaytgan pul → Sof foyda. Hali sotuvda bo'lmagan partiya — sarflangan pul va
 * qayerda ekanligi bitta jumlada. «Batafsil» — hisob chek ko'rinishida
 * (Uzum to'lovi − reklama − soliq = qaytgan pul; − sotilganlar tannarxi = sof
 * foyda) va tovarlar bo'yicha qatorlar.
 *
 * Raqamlar partiya sahifasi bilan bir manbadan: GET /batches/profit (hisob —
 * shared batch-profit.ts). Tovarlar bo'yicha qatorlar «Batafsil» ochilganda
 * yuklanadi (GET /batches/:id/profit). Bog'lash va sana tuzatish — partiya
 * sahifasida, jadval bilan birga saqlanadi: bu yerdan o'sha joyga havola.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BatchListResponse, BatchProfitFix, BatchProfitSummary, BatchProfitUnattributed, BatchSummary } from '@savdoiq/shared';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Coins,
  Hourglass,
  Info,
  Link2,
  Package,
  Wallet,
} from '@/components/icons';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { useCanOpen } from '@/lib/view';
import {
  Amount,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  ProgressBar,
  Skeleton,
  StatCard,
  StatGrid,
} from '@/components/ui';
import { DataFreshness } from '@/components/trust/DataFreshness';
import {
  ProfitRows,
  STAGE_TONE,
  UnattributedNote,
  isOnSale,
  useBatchProfit,
  useBatchProfitList,
  useDayText,
  useRateText,
  useStageLine,
} from '@/components/batches/profit';

/** Bo'linmas bo'shliq — raqam ("1 234 567") qatorga bo'linib ketmasin */
const NBSP = String.fromCharCode(0xa0);
/** Ayirish belgisi (U+2212) — chekdagi "−500 000" */
const MINUS = String.fromCharCode(0x2212);

/**
 * Foiz: kichigi bir kasr bilan ("4,5"), kattasi butun ("72"). Pastga yaxlitlanadi —
 * 99,96% "100%" bo'lib, pul hali to'liq qaytmagan bo'lsa ham qaytgandek ko'rinmasin.
 */
function usePct() {
  const f = useFormat();
  // +1e-9: (2 900 000 / 10 000 000) × 100 = 28,999999… — aniq 29% "28%" bo'lib qolmasin
  return (v: number) => (Math.abs(v) < 10 ? f.num(Math.floor(v * 10 + 1e-9) / 10, 1) : f.num(Math.floor(v + 1e-9), 0));
}

interface Item {
  b: BatchSummary;
  p: BatchProfitSummary;
}

export default function BatchProfit() {
  const t = useT('batches');
  const f = useFormat();
  const pct = usePct();
  const navigate = useNavigate();
  const canOpen = useCanOpen();
  const { hash } = useLocation();
  // Buzuq havola ("#%") sahifani yiqitmasin — shunchaki hech narsa ochilmaydi
  const target = useMemo(() => {
    if (hash.length <= 1) return null;
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return null;
    }
  }, [hash]);

  // Ro'yxat Partiyalar sahifasi bilan bitta kesh: nomi, tartibi, tovar soni
  const listQ = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get<BatchListResponse>('/batches'),
  });
  const hasBatches = (listQ.data?.items.length ?? 0) > 0;
  const profitQ = useBatchProfitList(hasBatches);

  /** Partiyalar tartibida; hisoblashga narsasi yo'q (bo'sh) partiya ko'rsatilmaydi */
  const items = useMemo<Item[]>(() => {
    const byId = new Map((profitQ.data?.items ?? []).map((p) => [p.batchId, p]));
    const out: Item[] = [];
    for (const b of listQ.data?.items ?? []) {
      const p = byId.get(b.id);
      if (p && p.state !== 'empty') out.push({ b, p });
    }
    return out;
  }, [listQ.data, profitQ.data]);

  /** Yuqoridagi to'rt raqam — pastdagi kartochkalar yig'indisi (aynan ular) */
  const sum = useMemo(
    () =>
      items.reduce(
        (a, { p }) => ({
          invested: a.invested + p.invested,
          back: a.back + p.moneyBack,
          profit: a.profit + p.profit,
          ads: a.ads + p.adFee,
          qty: a.qty + p.qty,
          sold: a.sold + p.soldQty,
          // Brak va yo'qolgan — tovarda emas: tannarxi foydadan ayrilgan
          lost: a.lost + (p.lostQty ?? 0),
          lossCost: a.lossCost + (p.lossCost ?? 0),
          inGoods: a.inGoods + (p.invested - p.cogs - (p.lossCost ?? 0) - p.overheadNow),
          unlinked: a.unlinked + p.unlinkedQty,
          paidBack: a.paidBack + (p.state === 'paidBack' ? 1 : 0),
        }),
        { invested: 0, back: 0, profit: 0, ads: 0, qty: 0, sold: 0, lost: 0, lossCost: 0, inGoods: 0, unlinked: 0, paidBack: 0 },
      ),
    [items],
  );

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(target ? [target] : []));
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Partiya sahifasidan `#id` bilan kelinganda — o'sha partiya ochiq va ko'rinib turadi
  const ready = items.length > 0;
  useEffect(() => {
    if (!target || !ready) return;
    setOpen((s) => (s.has(target) ? s : new Set([...s, target])));
    /*
     * Bir kadr keyin: AppLayout yo'l o'zgarganda sahifani tepaga suradi va uning
     * effekti bizdan KEYIN ishlaydi (ota effekti bolanikidan keyin). Ma'lumot
     * keshda bo'lsa, o'sha surish bizning surishimizni bekor qilardi.
     */
    const frame = requestAnimationFrame(() =>
      document.getElementById(`batch-${target}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [target, ready]);

  const loading = listQ.isLoading || (hasBatches && profitQ.isLoading);
  const failed = listQ.isError || (hasBatches && profitQ.isError && !profitQ.data);
  const failure = listQ.error ?? profitQ.error;
  const unsold = Math.max(0, sum.qty - sum.sold - sum.lost);
  // Izohdagi raqam qatorga bo'linmasin ("1 067" — "1" va "067" emas)
  const nb = (s: string) => s.replace(/ /g, NBSP);

  return (
    <>
      <PageHeader icon={<Coins className="h-5 w-5" />} title={t('pp.title')} description={t('pp.subtitle')} meta={<DataFreshness />} />

      <PlanGate feature="cost_price">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-[116px] w-full rounded-2xl" />
            <Skeleton className="h-[200px] w-full rounded-2xl" />
            <Skeleton className="h-[200px] w-full rounded-2xl" />
          </div>
        ) : failed ? (
          <Card>
            <ErrorState
              message={failure instanceof Error ? failure.message : undefined}
              onRetry={() => {
                void listQ.refetch();
                void profitQ.refetch();
              }}
            />
          </Card>
        ) : items.length === 0 || !profitQ.data ? (
          <Card>
            <EmptyState
              icon={<Coins className="h-6 w-6" />}
              title={t('pp.empty.title')}
              hint={t('pp.empty.hint')}
              action={
                canOpen('/batches') ? (
                  <Button variant="outline" iconRight={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/batches')}>
                    {t('pp.empty.action')}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <HowCounted taxRate={profitQ.data.taxRate} un={profitQ.data.unattributed} />

            {/*
              Har izohda bitta fakt: telefonda izoh ikki qatorga qisqartiriladi (StatCard),
              ikkinchi fakt (reklama, o'zini oqlaganlar) — pastki qatorda, kesilmaydi.
            */}
            <StatGrid className="mb-5">
              <StatCard
                label={t('pp.sum.invested')}
                value={f.money(sum.invested)}
                hint={t('pp.sum.investedHint', { n: items.length, qty: nb(f.num(sum.qty)) })}
                icon={<Wallet className="h-5 w-5" />}
                tone="muted"
              />
              <StatCard
                label={t('pp.sum.back')}
                value={f.money(sum.back)}
                hint={sum.invested > 0 ? t('pp.sum.backHint', { pct: pct((sum.back / sum.invested) * 100) }) : undefined}
                footer={sum.ads !== 0 ? t('profit.statAds', { sum: nb(f.money(sum.ads)) }) : undefined}
                icon={<Banknote className="h-5 w-5" />}
                tone="info"
              />
              <StatCard
                label={sum.profit < 0 ? t('pp.sum.loss') : t('pp.sum.profit')}
                value={f.money(Math.abs(sum.profit))}
                hint={t('pp.sum.profitHint', { n: nb(f.num(sum.sold)) })}
                footer={
                  [
                    sum.lossCost !== 0 ? t('pp.sum.lossCost', { sum: nb(`${MINUS}${f.money(sum.lossCost)}`) }) : null,
                    sum.paidBack > 0 ? t('pp.sum.paidBack', { n: sum.paidBack }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                icon={<Coins className="h-5 w-5" />}
                tone={sum.profit < 0 ? 'danger' : 'brand'}
              />
              <StatCard
                label={t('pp.sum.inGoods')}
                value={f.money(Math.max(0, sum.inGoods))}
                // Bog'lanmagan donalar ham shu yerda: ular sotilgan bo'lishi mumkin, faqat hisobga kirmagan
                hint={t(sum.unlinked > 0 ? 'pp.sum.inGoodsHintU' : 'pp.sum.inGoodsHint', { n: nb(f.num(unsold)) })}
                icon={<Package className="h-5 w-5" />}
                tone="violet"
              />
            </StatGrid>

            <div className="space-y-4">
              {items.map(({ b, p }) => (
                <BatchCard key={b.id} b={b} p={p} taxRate={profitQ.data!.taxRate} open={open.has(b.id)} onToggle={() => toggle(b.id)} />
              ))}
            </div>
          </>
        )}
      </PlanGate>
    </>
  );
}

// ─────────────────────────── Qanday hisoblanadi ───────────────────────────

/** Bitta qator — qanday hisoblanadi; «Batafsil» bosilsa — har so'z nimani anglatadi */
function HowCounted({ taxRate, un }: { taxRate: number; un: BatchProfitUnattributed }) {
  const t = useT('batches');
  const rateText = useRateText();
  const [more, setMore] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" />
        <p className="min-w-0 flex-1 leading-relaxed text-ink-soft">
          {t('pp.how')}{' '}
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="focusable whitespace-nowrap rounded font-semibold text-brand-ink hover:underline"
          >
            {more ? t('pp.howLess') : t('pp.howMore')}
          </button>
        </p>
      </div>
      {more ? (
        <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-muted sm:pl-[26px]">
          <p>{t('pp.how.invested')}</p>
          <p>{t('pp.how.back', { rate: rateText(taxRate) })}</p>
          <p>{t('pp.how.profit')}</p>
          <p>{t('pp.how.out')}</p>
          <p>{t('pp.how.storage')}</p>
          <UnattributedNote un={un} className="pt-1" />
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Partiya kartochkasi ───────────────────────────

/** Bitta raqam: nomi, qiymati va ostida bir qator izoh */
function Figure({
  label,
  value,
  hint,
  tone,
  title,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'gain' | 'loss';
  title?: string;
  children?: ReactNode;
}) {
  return (
    /*
     * container: raqam o'lchami ustun kengligiga moslashadi (StatCard kabi) — 1024 px da
     * to'rt ustun (~150 px) va telefonda ikki ustunda ham 9 xonali summa qo'shni ustunga
     * chiqib ketmaydi. "so'm" — kichik harf bilan (Amount).
     */
    <div className="min-w-0 [container-type:inline-size]" title={title}>
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          'tnum mt-1 whitespace-nowrap font-display text-[clamp(15px,11cqi,22px)] font-bold leading-tight tracking-[-0.01em]',
          tone === 'gain' ? 'text-brand-ink' : tone === 'loss' ? 'text-danger-ink' : 'text-ink',
        )}
      >
        <Amount value={value} nowrap />
      </p>
      {children}
      {hint ? <p className="tnum mt-1 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Partiya donalari qayerda (egasi: "2-partiyada 12 dona bor deyapti — nima qoldi?"):
 * sotildi, Uzum'da sotuvda, brak, yo'qolgan, qaytish yo'lida... — bitta chiziq va
 * izoh, faqat bor turlari. Yig'indisi partiya donasiga teng (shared summarize).
 */
const UNIT_PARTS: readonly { key: string; of: (p: BatchProfitSummary) => number; cls: string }[] = [
  { key: 'sold', of: (p) => p.soldQty, cls: 'bg-brand' },
  { key: 'onSale', of: (p) => p.onSaleQty ?? 0, cls: 'bg-info' },
  { key: 'elsewhere', of: (p) => p.elsewhereQty ?? 0, cls: 'bg-info/40' },
  { key: 'returning', of: (p) => p.out?.returning ?? 0, cls: 'bg-violet/55' },
  { key: 'toSeller', of: (p) => p.out?.toSeller ?? 0, cls: 'bg-violet' },
  { key: 'defect', of: (p) => p.out?.defect ?? 0, cls: 'bg-danger' },
  { key: 'lost', of: (p) => p.out?.lost ?? 0, cls: 'bg-danger/45' },
  { key: 'missing', of: (p) => p.missingQty ?? 0, cls: 'bg-warn' },
  { key: 'rest', of: (p) => p.restQty ?? 0, cls: 'bg-ink/30' },
  { key: 'transit', of: (p) => p.transitQty, cls: 'bg-muted/40' },
  // Bog'lanmagan — chiziqli (noma'lum): "hali sotuvda emas" kulrangidan ajralib tursin
  { key: 'unlinked', of: (p) => p.unlinkedQty, cls: 'bg-[repeating-linear-gradient(135deg,rgb(var(--c-muted)/0.6)_0_2px,transparent_2px_4px)]' },
];

function UnitsStrip({ p }: { p: BatchProfitSummary }) {
  const t = useT('batches');
  const f = useFormat();
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);
  const parts = UNIT_PARTS.map((x) => ({ ...x, n: Math.max(0, x.of(p)) })).filter((x) => x.n > 0);
  const total = parts.reduce((a, x) => a + x.n, 0);
  if (total === 0) return null;
  return (
    <div className="border-t border-line px-4 py-3 sm:px-5">
      <p className="tnum text-xs font-semibold text-ink-soft">{t('pp.u.title', { n: num(p.qty) })}</p>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={parts.map((x) => `${t(`pp.u.${x.key}`)} ${x.n}`).join(', ')}
      >
        {parts.map((x) => (
          <span key={x.key} className={cn('h-full', x.cls)} style={{ width: `${(x.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {parts.map((x) => (
          <li key={x.key} className="flex items-center gap-1.5" title={t(`pp.u.${x.key}Hint`)}>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', x.cls)} aria-hidden />
            <span className="text-muted">{t(`pp.u.${x.key}`)}</span>
            <span className="tnum font-semibold text-ink">{num(x.n)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BatchCard({
  b,
  p,
  taxRate,
  open,
  onToggle,
}: {
  b: BatchSummary;
  p: BatchProfitSummary;
  taxRate: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const pct = usePct();
  const dayText = useDayText();
  const stageLine = useStageLine();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');
  const canOpen = useCanOpen();
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);

  const onSale = isOnSale(p.stage);
  const hasMoney = p.soldQty > 0 || p.moneyBack !== 0;
  // Foyda/zarar bor: sotuv yoki brak/yo'qolgan (sotuvsiz ham zarar — tannarxi ayrilgan)
  const hasResult = hasMoney || (p.lostQty ?? 0) > 0;
  // Hali sotuvda emas va hech narsa sotilmagan — to'rt raqam o'rniga: qancha sarflangan va qayerda
  const waiting = !onSale && !hasResult;
  const loss = p.profit < 0;
  const soldPct = p.qty > 0 ? Math.min(100, (p.soldQty / p.qty) * 100) : 0;
  /*
   * Foiz xom summalardan (serverniki bir kasrgacha yaxlitlangan: 99,96% → "100%"
   * ko'rinib qolardi). Sarflangan pul 0 bo'lsa — foiz yo'q (0% emas).
   */
  const backPct = p.invested > 0 ? (p.moneyBack / p.invested) * 100 : null;
  /*
   * Nechtasi sotilgani bilinmaydi: donasi yozilmagan yoki birorta tovari Uzum'dagi
   * tovarga bog'lanmagan — "0 / N" (go'yo hech narsa sotilmagan) deb ko'rsatilmaydi.
   * Qolgan holatda donalar qayerdaligi — kartochkadagi chiziqda (`UnitsStrip`).
   */
  const soldUnknown = p.qty === 0 || p.unlinkedQty >= p.qty;
  /** Pul yo'q — nega: soni yozilmagan, bog'lanmagan yoki rostdan hali sotilmagan */
  const why = p.qty === 0 ? t('pp.fig.noQty') : p.state === 'unlinked' ? t('pp.fig.unlinked') : t('pp.fig.noSales');
  const leftText = p.qty === 0 ? t('pp.fig.noQty') : t('pp.fig.allUnlinked', { n: num(p.unlinkedQty) });
  // Shaxsiy/namuna va «Uzumda yo'q» qatorlar donaga kirmaydi — "xil tovar" ham ularsiz (ikkalasi bir xil narsani sanasin)
  const kinds = Math.max(0, b.totals.items - p.personalRows - p.optedOutRows);
  const fixLink = 'focusable inline-flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-brand-ink hover:underline';
  const canFix = canEdit && canOpen(`/batches/${b.id}`);
  /*
   * Kutish izohi bosqichga qarab: Xitoyda / yo'lda — avval «Keldi» belgilanadi (busiz
   * Uzum qabul qilsa ham sotuv partiyaga yozilmaydi); keldi / Uzumga yo'lda / qabulda —
   * Uzum qabulini kutadi. «Keldi» tuzatishi kutilayotgan bo'lsa — o'shani aytadi.
   */
  // Hech bir qatori sotila olmaydi (soni yo'q yoki birortasi bog'lanmagan) — avval o'shani aytadi
  const waitHint =
    p.qty === 0
      ? t('pp.wait.noQty')
      : p.unlinkedQty >= p.qty
        ? t('pp.wait.unlinked')
        : p.fixes.length
          ? t(p.fixes.some((x) => x.kind === 'arrive') ? 'pp.wait.fixed' : 'pp.wait.fixDate')
          : p.stage === 'warehouse' || p.stage === 'shipped'
            ? t('pp.wait.keldi')
            : t('pp.wait.hint');
  const legName = (fix: BatchProfitFix) =>
    [fix.cargoName || t('profit.fix.noCargo'), t(`delivery.${fix.delivery}`), fix.trip ? t('ship.trip', { n: fix.trip }) : null]
      .filter(Boolean)
      .join(' · ');
  const fixText = (fix: BatchProfitFix) =>
    t(fix.kind === 'earlier' ? 'pp.fix.earlier' : fix.basis === 'invoice' ? 'pp.fix.arriveInvoice' : 'pp.fix.arriveSale', {
      leg: legName(fix),
      date: dayText(fix.date),
    });

  return (
    <Card id={`batch-${b.id}`} className="scroll-mt-20 overflow-hidden">
      {/* Nomi, holati, nechta tovar */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h2 className="min-w-0 truncate text-base font-semibold text-ink">{b.name}</h2>
            <Badge tone={STAGE_TONE[p.stage]} dot title={stageLine(p)}>
              {t(`profit.stage.${p.stage}`)}
            </Badge>
            {p.stage === 'selling' && p.onSaleFrom ? (
              <span className="tnum text-xs text-muted">{t('profit.stage.since', { date: dayText(p.onSaleFrom) })}</span>
            ) : null}
          </div>
          <p className="tnum mt-1 text-xs text-muted">{t('pp.card.meta', { items: num(kinds), qty: num(p.qty) })}</p>
        </div>
        {canOpen(`/batches/${b.id}`) ? (
          <Link to={`/batches/${b.id}`} className={fixLink}>
            {t('pp.card.open')}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {waiting ? (
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:items-center sm:px-5">
          <Figure label={t('pp.fig.invested')} value={f.money(p.invested)} hint={t('pp.fig.investedHint')} />
          <div className="flex items-start gap-2.5 rounded-xl bg-surface-2/70 px-4 py-3">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-ink">{stageLine(p)}</p>
              <p className="mt-1 text-xs text-muted">{waitHint}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:px-5 lg:grid-cols-4">
          <Figure label={t('pp.fig.invested')} value={f.money(p.invested)} hint={t('pp.fig.investedHint')} />
          <Figure label={t('pp.fig.sold')} value={soldUnknown ? '—' : t('pp.fig.soldOf', { sold: num(p.soldQty), qty: num(p.qty) })}>
            {soldUnknown ? null : <ProgressBar value={soldPct} tone={soldPct >= 100 ? 'brand' : 'info'} className="mt-2 max-w-[180px]" />}
            {/* Qolgani qayerda — pastdagi chiziqda; bu yerda faqat sotilgani bilinmaydigan holat */}
            {soldUnknown ? <p className="tnum mt-1.5 text-xs leading-snug text-muted">{leftText}</p> : null}
          </Figure>
          <Figure
            label={t('pp.fig.back')}
            value={hasMoney ? f.money(p.moneyBack) : '—'}
            // "To'liq qaytdi" — faqat rostdan qaytgan bo'lsa (yaxlitlangan 100% emas): o'zini oqlaganlar soni bilan bir xil
            hint={
              !hasMoney
                ? why
                : p.state === 'paidBack'
                  ? t('pp.fig.backFull')
                  : backPct !== null
                    ? t('pp.fig.backHint', { pct: pct(backPct) })
                    : undefined
            }
          />
          <Figure
            label={loss ? t('pp.fig.loss') : t('pp.fig.profit')}
            value={hasResult ? f.money(Math.abs(p.profit)) : '—'}
            tone={hasResult ? (loss ? 'loss' : 'gain') : undefined}
            hint={
              hasResult
                ? (p.lostQty ?? 0) > 0
                  ? t('pp.fig.profitHintLoss', { n: num(p.soldQty), lost: num(p.lostQty) })
                  : t('pp.fig.profitHint', { n: num(p.soldQty) })
                : why
            }
          />
        </div>
      )}

      {/* Donalar qayerda: sotildi, sotuvda, brak, yo'qolgan... (egasi: "nima qoldi?") */}
      {!waiting && !soldUnknown ? <UnitsStrip p={p} /> : null}

      {/* Hisobga to'liq kirmayotgan narsa — tuzatish partiya sahifasida */}
      {p.unlinkedRows > 0 || p.noQtyRows > 0 || p.fixes.length > 0 ? (
        <ul className="space-y-2 border-t border-line bg-warn/[0.05] px-4 py-2.5 text-sm sm:px-5">
          {/* «Keldi» belgilanmagan yoki kech yozilgan — partiya sahifasida bir bosishda tuzatiladi */}
          {p.fixes.map((fix) => (
            <li key={`${fix.kind}|${fix.cargoName}|${fix.delivery}|${fix.trip}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-start gap-2 text-ink-soft">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                {fixText(fix)}
              </span>
              {canFix ? (
                <Link to={`/batches/${b.id}#profit`} className={fixLink}>
                  {t('pp.warn.open')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </li>
          ))}
          {p.unlinkedRows > 0 ? (
            <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-start gap-2 text-ink-soft">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                {t('pp.warn.unlinked', { n: num(p.unlinkedRows) })}
              </span>
              {canFix ? (
                <Link to={`/batches/${b.id}#profit`} className={fixLink}>
                  {t('pp.warn.fix')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </li>
          ) : null}
          {p.noQtyRows > 0 ? (
            <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-start gap-2 text-ink-soft">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                {t('pp.warn.noQty', { n: num(p.noQtyRows) })}
              </span>
              {canFix ? (
                <Link to={`/batches/${b.id}`} className={fixLink}>
                  {t('pp.warn.open')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="focusable flex w-full items-center gap-1.5 border-t border-line px-4 py-2.5 text-left text-sm font-semibold text-brand-ink transition-colors hover:bg-surface-2/60 sm:px-5"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {open ? t('pp.less') : t('pp.more')}
      </button>
      {open ? <BatchDetails id={b.id} p={p} taxRate={taxRate} showReceipt={hasResult} /> : null}
    </Card>
  );
}

// ─────────────────────────── Batafsil: chek va tovarlar ───────────────────────────

function BatchDetails({ id, p, taxRate, showReceipt }: { id: string; p: BatchProfitSummary; taxRate: number; showReceipt: boolean }) {
  const t = useT('batches');
  const { data, isLoading, isError, refetch } = useBatchProfit(id);
  return (
    <div className="border-t border-line">
      {showReceipt ? <Receipt p={p} taxRate={taxRate} /> : null}
      <div className={cn(showReceipt && 'border-t border-line')}>
        <p className="px-4 pb-2 pt-3 text-xs font-semibold text-ink-soft sm:px-5">{t('pp.rows.title')}</p>
        {isLoading ? (
          <div className="px-4 pb-4 sm:px-5">
            <Skeleton className="h-[96px] w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex items-center gap-3 px-4 pb-4 text-sm text-muted sm:px-5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink" />
            <span>{t('profit.error')}</span>
            <button type="button" onClick={() => void refetch()} className="focusable rounded font-semibold text-brand-ink hover:underline">
              {t('profit.retry')}
            </button>
          </div>
        ) : (
          <div className="border-t border-line">
            <ProfitRows data={data} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hisob — chek ko'rinishida, har qatori o'z belgisi bilan: Uzum to'lovi − reklama −
 * soliq = qaytgan pul; − sotilganlar tannarxi = sof foyda. Tannarxga partiyaning
 * bo'linmagan xarajati ulushi ham kiradi ("shundan …" deb ko'rsatiladi) — shunda
 * sahifa tepasidagi formula aynan shu sonni beradi. Ostida — qolgan donalar
 * tannarxi (pul hali tovarda). Ko'rsatilgan raqamlar yig'indisi doim aynan teng:
 * to'lov va tannarx shu qatorlardan chiqariladi.
 */
function Receipt({ p, taxRate }: { p: BatchProfitSummary; taxRate: number }) {
  const t = useT('batches');
  const f = useFormat();
  const rateText = useRateText();
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);
  /** Ayiriladigan summa: musbat — "−X", manfiy (qaytarilgan) — "+X" */
  const minus = (v: number) => (v === 0 ? '0' : v > 0 ? `${MINUS}${num(v)}` : `+${num(-v)}`);

  const back = Math.round(p.moneyBack);
  const ads = Math.round(p.adFee);
  const tax = Math.round(p.tax);
  const payout = back + ads + tax;
  const over = Math.round(p.overheadNow);
  const profit = Math.round(p.profit);
  const lostQty = p.lostQty ?? 0;
  /*
   * Bo'linmagan xarajat tugagan donalarga (sotilgan + zarar bo'lgan) tushadi: uning sotilganlar
   * ulushi "Sotilgan N dona tannarxi" ichida, qolgani — brak va yo'qolgan qatorida. Ikki qator
   * yig'indisi aynan qaytgan − foyda: chekdagi raqamlar doim teng.
   */
  const cogs = Math.round(p.cogs);
  const lossBase = Math.round(p.lossCost ?? 0);
  const overSold = cogs + lossBase > 0 ? Math.round((over * cogs) / (cogs + lossBase)) : lostQty > 0 ? 0 : over;
  const cost = cogs + overSold;
  const lossCost = back - profit - cost;
  const rest = Math.round(p.invested) - cost - lossCost;
  const restQty = Math.max(0, p.qty - p.soldQty - lostQty);
  const pending = p.back.held + p.back.transit;

  const line = 'flex items-baseline justify-between gap-4 py-1';
  const amount = 'tnum shrink-0 whitespace-nowrap text-right';
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-xs font-semibold text-ink-soft">{t('pp.r.title')}</p>
      <div className="mt-2 max-w-xl text-sm">
        <div className={line}>
          <span className="min-w-0 text-ink-soft">
            {t('pp.r.payout')} <span className="text-xs text-muted">({t('pp.r.payoutHint')})</span>
          </span>
          <span className={cn(amount, 'text-ink-soft')}>{num(payout)}</span>
        </div>
        {ads !== 0 ? (
          <div className={line}>
            <span className="min-w-0 text-ink-soft">{t('pp.r.ads')}</span>
            <span className={cn(amount, 'text-ink-soft')}>{minus(ads)}</span>
          </div>
        ) : null}
        {tax !== 0 ? (
          <div className={line}>
            <span className="min-w-0 text-ink-soft">{t('pp.r.tax', { rate: rateText(taxRate) })}</span>
            <span className={cn(amount, 'text-ink-soft')}>{minus(tax)}</span>
          </div>
        ) : null}
        <div className={cn(line, 'border-t border-line pt-1.5 font-semibold')}>
          <span className="min-w-0 text-ink">
            {t('pp.r.back')}
            {pending > 0 ? <span className="ml-1.5 text-xs font-normal text-muted">({t('pp.r.pending', { sum: num(pending) })})</span> : null}
          </span>
          <span className={cn(amount, 'text-ink')}>{num(back)}</span>
        </div>
        {p.soldQty > 0 || cost !== 0 ? (
          <div className={line}>
            <span className="min-w-0 text-ink-soft">
              {t('pp.r.cogs', { n: num(p.soldQty) })}
              {overSold !== 0 ? (
                <span className="ml-1.5 text-xs text-muted" title={t('profit.overheadHint')}>
                  ({t('pp.r.cogsOver', { sum: num(overSold) })})
                </span>
              ) : null}
            </span>
            <span className={cn(amount, 'text-ink-soft')}>{minus(cost)}</span>
          </div>
        ) : null}
        {lossCost !== 0 || lostQty > 0 ? (
          <div className={line}>
            <span className="min-w-0 text-ink-soft">
              {t('pp.r.lossCost', { n: num(lostQty) })} <span className="text-xs text-muted">({t('pp.r.lossHint')})</span>
            </span>
            <span className={cn(amount, 'text-danger-ink')}>{minus(lossCost)}</span>
          </div>
        ) : null}
        <div className={cn(line, 'border-t border-line pt-1.5 font-bold')}>
          <span className="min-w-0 text-ink">{profit < 0 ? t('pp.r.loss') : t('pp.r.profit')}</span>
          <span className={cn(amount, profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{num(Math.abs(profit))}</span>
        </div>
        {restQty > 0 || rest !== 0 ? (
          <div className={cn(line, 'mt-1 text-muted')}>
            <span className="min-w-0">
              {t('pp.r.rest', { n: num(restQty) })} <span className="text-xs">({t(p.unlinkedQty > 0 ? 'pp.r.restHintU' : 'pp.r.restHint')})</span>
            </span>
            <span className={amount}>{num(Math.max(0, rest))}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
