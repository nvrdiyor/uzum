/**
 * Partiya foydasi (2026-11-12): har partiyaga qancha pul tikilgan, Uzum'dan
 * qancha qaytgan va qancha foyda — sotuvlardan avtomatik (server:
 * services/batch-profit.ts, hisob: shared batch-profit.ts).
 *
 * Raqamlar doim SAQLANGAN holatdan (server hisoblaydi): partiya jadvali
 * avtomatik saqlangach `['batches']` yangilanadi va shu so'rovlar ham qayta
 * keladi. Saqlash kutilayotganda raqamlar xiraroq ko'rinadi.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Link2,
  Loader2,
  Search,
  X,
} from '@/components/icons';
import {
  BATCH_MAX_SKU_CODES,
  normSkuCode,
  rowNameKey,
  type BatchProfitDetail,
  type BatchProfitFix,
  type BatchProfitListResponse,
  type BatchProfitRow,
  type BatchProfitSummary,
  type BatchProfitUnattributed,
  type BatchSkuOption,
  type BatchSkuSearchResponse,
} from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Input, Modal, ProductThumb, ProgressBar, Skeleton, toast } from '@/components/ui';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import './texts-profit';

/** Bo'linmas bo'shliq — raqam ("1 234 567") qatorga bo'linib ketmasin */
const NBSP = String.fromCharCode(0xa0);

// ─────────────────────────── So'rovlar ───────────────────────────

/*
 * Kalitlar `['batches', ...]` ostida: partiya saqlanganda, jo'natma holati
 * o'zgarganda, partiya qo'shilganda yoki o'chirilganda mavjud
 * `invalidateQueries(['batches'])` ularni ham yangilaydi.
 */
export const profitListKey = ['batches', 'profit'] as const;
export const profitKey = (id: string) => ['batches', 'profit', id] as const;

/*
 * `signal`: avtomatik saqlash ketma-ket bo'lsa, eskirgan so'rov bekor qilinadi —
 * brauzer javobni kutib o'tirmaydi (server o'zi bir xil hisobni keshdan beradi).
 */
export function useBatchProfitList(enabled: boolean) {
  return useQuery({
    queryKey: profitListKey,
    queryFn: ({ signal }) => api.get<BatchProfitListResponse>('/batches/profit', undefined, signal),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useBatchProfit(id: string) {
  return useQuery({
    queryKey: profitKey(id),
    queryFn: ({ signal }) => api.get<BatchProfitDetail>(`/batches/${id}/profit`, undefined, signal),
    enabled: Boolean(id),
    placeholderData: (prev) => prev,
  });
}

/** Sana: joriy yil bo'lsa qisqa ("03.09"), boshqa yil bo'lsa yili bilan — "01.06" 2025 yilniki ekani ko'rinsin */
function useDayText() {
  const f = useFormat();
  const year = String(new Date().getFullYear());
  return (iso: string) => (iso.slice(0, 4) === year ? f.dateShort(iso) : f.date(iso));
}

/** Foiz: kichigi bir kasr bilan ("4,5%"), kattasi butun ("72%") */
const pctText = (f: ReturnType<typeof useFormat>, v: number) => f.num(v, Math.abs(v) < 10 ? 1 : 0);

// ─────────────────────────── Ro'yxat sahifasi ───────────────────────────

/** "Qaytgan pul" katagi: summa va tikilganning necha foizi qaytgani */
export function ProfitBackCell({ p, loading }: { p: BatchProfitSummary | undefined; loading: boolean }) {
  const t = useT('batches');
  const f = useFormat();
  if (!p) return loading ? <Skeleton className="ml-auto h-4 w-20" /> : <span className="text-muted">—</span>;
  if (p.state === 'empty') return <span className="text-muted">—</span>;
  if (p.moneyBack === 0 && p.soldQty === 0) {
    if (p.state === 'waiting') return <span className="text-xs text-muted">{t('profit.state.waiting')}</span>;
    if (p.state === 'unlinked') return <span className="text-xs font-semibold text-warn-ink">{t('profit.state.unlinked')}</span>;
  }
  const pct = p.paybackPct ?? 0;
  return (
    <div
      className="inline-flex flex-col items-end"
      title={t('profit.cellTitle', { invested: f.num(p.invested), back: f.num(p.moneyBack), pct: pctText(f, pct) })}
    >
      <span className="font-semibold text-ink">{f.num(p.moneyBack)}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <ProgressBar value={pct} tone={pct >= 100 ? 'brand' : 'info'} className="w-12" />
        <span className="text-2xs text-muted">{pctText(f, pct)}%</span>
      </span>
    </div>
  );
}

/** "Foyda" katagi: sotilgan donadan foyda va ROI */
export function ProfitCell({ p, loading }: { p: BatchProfitSummary | undefined; loading: boolean }) {
  const t = useT('batches');
  const f = useFormat();
  if (!p) return loading ? <Skeleton className="ml-auto h-4 w-16" /> : <span className="text-muted">—</span>;
  if (p.state === 'empty' || p.state === 'waiting' || p.state === 'unlinked') {
    if (p.soldQty === 0) return <span className="text-muted">—</span>;
  }
  if (p.soldQty === 0) return <span className="text-xs text-muted">{t('profit.state.noSales')}</span>;
  return (
    <div className="inline-flex flex-col items-end">
      <span className={cn('font-bold', p.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(p.profit)}</span>
      {p.roi !== null ? <span className="text-2xs text-muted">{t('profit.roi', { pct: f.num(p.roi, 1) })}</span> : null}
    </div>
  );
}

/** Hech qaysi partiyaga tushmagan sotuv — ro'yxat ostida bitta qator */
export function UnattributedNote({ un, className }: { un: BatchProfitUnattributed | undefined; className?: string }) {
  const t = useT('batches');
  const f = useFormat();
  if (!un || un.units <= 0) return null;
  const parts = [
    un.opening > 0 ? t('profit.un.opening', { n: f.num(un.opening) }) : null,
    un.beforeArrival > 0 ? t('profit.un.before', { n: f.num(un.beforeArrival) }) : null,
    un.notMarked > 0 ? t('profit.un.notMarked', { n: f.num(un.notMarked) }) : null,
    un.overTracked > 0 ? t('profit.un.over', { n: f.num(un.overTracked) }) : null,
  ].filter(Boolean);
  const top = un.top.length
    ? t('profit.un.top', { list: un.top.map((x) => `${x.title || x.code} (${f.num(x.units)})`).join(', ') })
    : undefined;
  return (
    <p className={cn('tnum flex items-start gap-2 text-xs leading-relaxed text-muted', className)} title={top}>
      <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {t('profit.unattributed', { n: f.num(un.units), sum: f.money(un.moneyBack) })}
        {parts.length ? ` — ${parts.join(' · ')}` : ''}
      </span>
    </p>
  );
}

// ─────────────────────────── Partiya sahifasi: uch raqam ───────────────────────────

function Term({
  label,
  value,
  dot,
  strong,
  tone,
  children,
}: {
  label: string;
  value: string;
  dot: string;
  strong?: boolean;
  tone?: 'loss';
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          'tnum mt-2 whitespace-nowrap leading-none tracking-[-0.02em]',
          strong ? 'font-title text-[26px] font-semibold' : 'font-display text-[22px] font-bold text-ink',
          strong && (tone === 'loss' ? 'text-danger-ink' : 'text-brand-ink'),
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

/**
 * Tannarx tenglamasi kartochkasining pastki qismi: tikilgan → qaytgan → foyda.
 * Jadvalni pastga deyarli surmaydi (bitta qator), batafsili jadval ostidagi
 * "Sotuv va foyda" kartochkasida.
 */
export function ProfitStrip({ batchId, pending }: { batchId: string; pending: boolean }) {
  const t = useT('batches');
  const f = useFormat();
  const { data, isLoading, isError, refetch } = useBatchProfit(batchId);
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);

  if (isLoading) return <Skeleton className="mt-6 h-[76px] w-full" />;
  if (isError || !data) {
    return (
      <div className="mt-6 flex items-center gap-3 border-t border-line pt-5 text-sm text-muted">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink" />
        <span>{t('profit.error')}</span>
        <button type="button" onClick={() => void refetch()} className="focusable rounded font-semibold text-brand-ink hover:underline">
          {t('profit.retry')}
        </button>
      </div>
    );
  }
  if (data.state === 'empty') return null;

  const pct = data.paybackPct ?? 0;
  const pendingBack = data.back.held + data.back.transit;
  const nothingYet = data.soldQty === 0 && data.moneyBack === 0;

  const facts = [
    data.qty > 0 ? t('profit.sold', { sold: num(data.soldQty), qty: num(data.qty) }) : null,
    data.leftQty > 0 ? t('profit.left', { n: num(data.leftQty), sum: num(data.leftCost) }) : null,
    data.transitQty > 0 ? t('profit.transit', { n: num(data.transitQty) }) : null,
    data.unlinkedQty > 0 ? t('profit.unlinkedQty', { n: num(data.unlinkedQty) }) : null,
    data.soldOutAt ? t('profit.soldOut', { date: f.dateShort(data.soldOutAt) }) : null,
  ].filter(Boolean);
  const outcome =
    data.state === 'paidBack'
      ? { text: t('profit.paidBack', { sum: num(data.moneyBack - data.invested) }), tone: 'text-brand-ink font-semibold' }
      : !nothingYet
        ? {
            text:
              data.breakEvenQty !== null
                ? t('profit.toPaybackQty', { sum: num(data.toPayback), n: num(data.breakEvenQty) })
                : t('profit.toPayback', { sum: num(data.toPayback) }),
            tone: 'text-ink-soft',
          }
        : null;
  const forecast =
    data.expectedProfit !== null && !data.soldOutAt
      ? data.expectedProfit >= 0
        ? t('profit.forecast', { sum: num(data.expectedProfit) })
        : t('profit.forecastLoss', { sum: num(-data.expectedProfit) })
      : null;

  return (
    <div className={cn('mt-6 border-t border-line pt-5 transition-opacity duration-200', pending && 'opacity-60')} title={pending ? t('profit.updating') : undefined}>
      {nothingYet && (data.state === 'waiting' || data.state === 'unlinked') ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Coins className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold text-ink">{t('profit.invested')}: </span>
            <span className="tnum font-semibold text-ink">{f.money(data.invested)}</span>
            {' · '}
            {data.state === 'waiting' ? t('profit.waitingLine') : t('profit.unlinkedLine')}
          </span>
        </p>
      ) : (
        <div className="grid gap-x-5 gap-y-5 sm:grid-cols-3">
          <Term label={t('profit.invested')} value={f.money(data.invested)} dot="bg-[rgb(var(--c-slate))]">
            <p className="mt-2 text-xs leading-snug text-muted">
              {t('profit.investedHint')}
              {data.personalCost > 0 ? ` · ${t('profit.investedPersonal', { sum: num(data.personalCost) })}` : ''}
            </p>
          </Term>
          <Term label={t('profit.back')} value={f.money(data.moneyBack)} dot="bg-info">
            <ProgressBar value={pct} tone={pct >= 100 ? 'brand' : 'info'} className="mt-2.5 max-w-[220px]" />
            <p className="tnum mt-1.5 text-xs leading-snug text-muted">
              {t('profit.payback', { pct: pctText(f, pct) })}
              {pendingBack > 0 ? ` · ${t('profit.backPending', { sum: num(pendingBack) })}` : ''}
            </p>
          </Term>
          <Term label={t('profit.profit')} value={f.money(data.profit)} dot="bg-brand" strong tone={data.profit < 0 ? 'loss' : undefined}>
            <p className="tnum mt-2 text-xs leading-snug text-muted">
              {data.roi !== null ? `${t('profit.roi', { pct: f.num(data.roi, 1) })} · ` : ''}
              {data.overheadNow > 0
                ? t('profit.profitHintOverhead', { cogs: num(data.cogs), over: num(data.overheadNow) })
                : t('profit.profitHint', { cogs: num(data.cogs) })}
            </p>
          </Term>
        </div>
      )}
      {facts.length || outcome || forecast ? (
        <p className="tnum mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {facts.map((x) => (
            <span key={x as string}>{x}</span>
          ))}
          {outcome ? <span className={outcome.tone}>{outcome.text}</span> : null}
          {forecast ? <span>{forecast}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Partiya sahifasi: qatorlar ───────────────────────────

/** Jadvaldagi (saqlanmagan bo'lishi mumkin) qator — bog'lash uchun */
export interface ProfitDraftRow {
  key: string;
  name: string;
  /** null — tegilmagan; [] — ataylab bog'lanmagan */
  skuCodes: string[] | null;
}

const legKey = (fix: BatchProfitFix) => `${fix.cargoName}|${fix.delivery}|${fix.trip}`;

export function ProfitCard({
  batchId,
  rows,
  canEdit,
  pending,
  onLink,
}: {
  batchId: string;
  /** Jadvaldagi bo'sh bo'lmagan qatorlar, tartibi bilan (saqlanganda server ham shu tartibni oladi) */
  rows: readonly ProfitDraftRow[];
  canEdit: boolean;
  pending: boolean;
  /** codes: ro'yxat — tanlangan kodlar; [] — "Uzumda yo'q"; null — avtomatik (nomi bo'yicha) */
  onLink: (key: string, codes: string[] | null) => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const dayText = useDayText();
  const { data, isLoading } = useBatchProfit(batchId);
  const [open, setOpen] = useState<number | null>(null);
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const [fixFor, setFixFor] = useState<BatchProfitFix | null>(null);
  // Telefonda 8 ustunli jadval o'rniga har qator — kartochka (ro'yxat sahifasidagidek)
  const isDesktop = useIsDesktop();

  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-[120px] w-full" />
      </Card>
    );
  }
  if (!data || data.rows.length === 0) return null;

  /** Server qatori va jadval qatori bitta tovarmi (saqlanmagan o'zgarish bo'lsa — yo'q) */
  const draftOf = (r: BatchProfitRow): ProfitDraftRow | null => {
    const d = rows[r.index];
    return d && rowNameKey(d.name) === rowNameKey(r.name) ? d : null;
  };
  const mismatched = data.rows.filter((r) => !draftOf(r)).length + Math.max(0, rows.length - data.rows.length);

  // Ogohlantirishlar: sana tuzatish — har jo'natmaga bitta
  const fixes = new Map<string, { fix: BatchProfitFix; units: number; firstSale: string | null }>();
  for (const r of data.rows) {
    if (!r.fix) continue;
    const k = `${r.fix.kind}|${legKey(r.fix)}`;
    const cur = fixes.get(k);
    const units = r.fix.kind === 'arrive' ? r.notMarked : r.beforeArrival;
    if (cur) {
      cur.units += units;
      if (r.fix.date < cur.fix.date) cur.fix = r.fix;
    } else fixes.set(k, { fix: r.fix, units, firstSale: r.firstSaleAt });
  }
  const beforeNoFix = data.rows.reduce((a, r) => a + (r.fix?.kind === 'earlier' ? 0 : r.beforeArrival), 0);
  // Ataylab "Uzumda yo'q" deb belgilanganlar haqida qayta-qayta eslatilmaydi
  const unlinkedNag = data.rows.filter((r) => r.link === 'none' && !r.optedOut && r.qty > 0).length;
  const missing = data.rows.reduce((a, r) => a + r.missingCodes.length, 0);
  const legName = (fix: BatchProfitFix) =>
    [fix.cargoName || t('profit.fix.noCargo'), t(`delivery.${fix.delivery}`), fix.trip ? t('ship.trip', { n: fix.trip }) : null]
      .filter(Boolean)
      .join(' · ');

  const th = 'table-head border-b border-line px-3 py-3';
  /*
   * Jami — partiya xulosasidan (yuqoridagi uch raqam bilan aynan bir xil). Qatorlarga
   * tushmagan umumiy xarajat (bo'linmagan qo'shimcha xarajat; soni yo'q va "Uzumda
   * yo'q" qatorlarning foydadan ayrilgan ulushi) alohida qatorda — ustunlar yig'indisi jamiga teng.
   */
  const rowsInvested = data.rows.reduce((a, r) => a + r.invested, 0);
  const overheadRow = { invested: data.invested - rowsInvested, profit: -data.overheadNow };
  const showOverhead = overheadRow.invested !== 0 || overheadRow.profit !== 0;
  const foot = { invested: data.invested, back: data.moneyBack, profit: data.profit, sold: data.soldQty };

  return (
    <Card className={cn('overflow-hidden transition-opacity duration-200', pending && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <Coins className="h-4 w-4 text-brand-ink" />
            {t('profit.card')}
          </h3>
          <p className="mt-1 text-xs text-muted">{t('profit.cardHint')}</p>
        </div>
        {data.syncedAt ? <p className="text-2xs text-muted">{t('profit.synced', { date: f.dateTime(data.syncedAt) })}</p> : null}
      </div>

      {/* Ogohlantirishlar va bir bosishda tuzatish */}
      {fixes.size || beforeNoFix || unlinkedNag || missing || data.noQtyRows ? (
        <ul className="space-y-2 border-b border-line bg-warn/[0.04] px-5 py-3 text-sm">
          {[...fixes.values()].map(({ fix, units }) => (
            <li key={`${fix.kind}|${legKey(fix)}`} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-start gap-2 text-ink-soft">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                <span>
                  {fix.kind === 'earlier'
                    ? t('profit.fix.earlier', {
                        leg: legName(fix),
                        arrived: dayText(data.rows.find((r) => r.fix && legKey(r.fix) === legKey(fix))?.arrivedAt ?? fix.date),
                        date: dayText(fix.date),
                      })
                    : fix.basis === 'invoice'
                      ? t('profit.fix.arriveInvoice', { leg: legName(fix), date: dayText(fix.date) })
                      : t('profit.fix.arriveSale', { leg: legName(fix), n: f.num(units), date: dayText(fix.date) })}
                </span>
              </span>
              {canEdit ? (
                <Button size="sm" variant="outline" icon={<Check className="h-3.5 w-3.5" />} onClick={() => setFixFor(fix)}>
                  {fix.kind === 'earlier'
                    ? t('profit.fix.applyEarlier', { date: dayText(fix.date) })
                    : t('profit.fix.apply', { date: dayText(fix.date) })}
                </Button>
              ) : null}
            </li>
          ))}
          {beforeNoFix > 0 ? (
            <li className="flex items-start gap-2 text-ink-soft">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
              <span>{t('profit.warn.before', { n: f.num(beforeNoFix) })}</span>
            </li>
          ) : null}
          {unlinkedNag > 0 ? (
            <li className="flex items-start gap-2 text-ink-soft">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
              <span>{t('profit.warn.unlinked', { n: f.num(unlinkedNag) })}</span>
            </li>
          ) : null}
          {missing > 0 ? (
            <li className="flex items-start gap-2 text-ink-soft">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
              <span>{t('profit.warn.missing', { n: f.num(missing) })}</span>
            </li>
          ) : null}
          {data.noQtyRows > 0 ? (
            <li className="flex items-start gap-2 text-ink-soft">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
              <span>{t('profit.warn.noQty', { n: f.num(data.noQtyRows) })}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {canEdit && mismatched > 0 ? (
        <p className="border-b border-line px-5 py-2 text-xs text-muted">{t('profit.row.pending', { n: f.num(mismatched) })}</p>
      ) : null}

      {!isDesktop ? (
        <>
          <ul className="divide-y divide-line/70">
            {data.rows.map((r) => {
              const draft = draftOf(r);
              const expanded = open === r.index;
              return (
                <ProfitRowCard
                  key={r.index}
                  r={r}
                  skus={data.skus}
                  expanded={expanded}
                  onToggle={() => setOpen(expanded ? null : r.index)}
                  onLink={canEdit && draft && r.link !== 'personal' ? () => setLinkFor(r.index) : undefined}
                />
              );
            })}
          </ul>
          {/* Ikkala qatorda bir xil ustunlar: tikilgan · qaytgan · foyda (yuqoridagi kartochkalardagidek) */}
          <div className="border-t border-line bg-surface-2/60 px-4 py-3 text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-3 gap-y-1.5">
              <span />
              <span className="text-right text-2xs font-medium text-muted">{t('profit.th.invested')}</span>
              <span className="text-right text-2xs font-medium text-muted">{t('profit.th.back')}</span>
              <span className="text-right text-2xs font-medium text-muted">{t('profit.th.profit')}</span>
              {showOverhead ? (
                <>
                  <span className="truncate text-ink-soft" title={t('profit.overheadHint')}>
                    {t('profit.overhead')}
                  </span>
                  <span className="tnum text-right text-ink-soft">{overheadRow.invested ? f.num(overheadRow.invested) : '—'}</span>
                  <span className="tnum text-right text-muted">—</span>
                  <span className="tnum text-right text-ink-soft">{overheadRow.profit ? f.num(overheadRow.profit) : '—'}</span>
                </>
              ) : null}
              <span className="font-semibold text-ink">{t('profit.footTotal')}</span>
              <span className="tnum text-right font-semibold text-ink-soft">{f.num(foot.invested)}</span>
              <span className="tnum text-right font-semibold text-ink">{f.num(foot.back)}</span>
              <span className={cn('tnum text-right font-extrabold', foot.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>
                {f.num(foot.profit)}
              </span>
            </div>
          </div>
        </>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead>
            <tr>
              <th className={cn(th, 'text-center')}>{t('th.no')}</th>
              <th className={cn(th, 'text-left')}>{t('profit.th.item')}</th>
              <th className={cn(th, 'text-left')}>{t('profit.th.arrived')}</th>
              <th className={cn(th, 'text-right')}>{t('profit.th.sold')}</th>
              <th className={cn(th, 'text-right')}>{t('profit.th.invested')}</th>
              <th className={cn(th, 'text-right')}>{t('profit.th.back')}</th>
              <th className={cn(th, 'text-right')}>{t('profit.th.profit')}</th>
              <th className={cn(th, 'text-right')}>{t('profit.th.left')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const draft = draftOf(r);
              const expanded = open === r.index;
              const isLot = r.link === 'explicit' || r.link === 'name';
              return (
                <ProfitRowView
                  key={r.index}
                  r={r}
                  skus={data.skus}
                  expanded={expanded}
                  onToggle={() => setOpen(expanded ? null : r.index)}
                  onLink={canEdit && draft && r.link !== 'personal' ? () => setLinkFor(r.index) : undefined}
                  isLot={isLot}
                />
              );
            })}
          </tbody>
          <tfoot>
            {showOverhead ? (
              <tr className="border-t border-line">
                <td />
                <td className="px-3 py-2.5 text-ink-soft" title={t('profit.overheadHint')}>
                  {t('profit.overhead')}
                </td>
                <td />
                <td />
                <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink-soft">
                  {overheadRow.invested ? f.num(overheadRow.invested) : '—'}
                </td>
                <td />
                <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink-soft">
                  {overheadRow.profit ? f.num(overheadRow.profit) : '—'}
                </td>
                <td />
              </tr>
            ) : null}
            <tr className="border-t border-line bg-surface-2/60">
              <td />
              <td className="px-3 py-3 font-semibold text-ink">{t('profit.footTotal')}</td>
              <td />
              <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-ink-soft">{f.num(foot.sold)}</td>
              <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-ink-soft">{f.num(foot.invested)}</td>
              <td className="tnum whitespace-nowrap px-3 py-3 text-right font-semibold text-ink">{f.num(foot.back)}</td>
              <td className={cn('tnum whitespace-nowrap px-3 py-3 text-right font-extrabold', foot.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>
                {f.num(foot.profit)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      )}

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">{t('profit.note', { rate: f.num(data.taxRate, 1) })}</p>

      {linkFor !== null
        ? (() => {
            const r = data.rows.find((x) => x.index === linkFor);
            const draft = r ? draftOf(r) : null;
            if (!r || !draft) return null;
            return (
              <SkuLinkModal
                open
                name={draft.name}
                // Tegilmagan qatorda — faqat server ham "nomi bo'yicha" desa (saqlash kutilayotganda eski kodlar qaytmasin)
                initial={draft.skuCodes ?? (r.link === 'name' ? r.codes : [])}
                state={draft.skuCodes === null ? 'auto' : draft.skuCodes.length ? 'codes' : 'none'}
                onClose={() => setLinkFor(null)}
                onSave={(codes) => {
                  onLink(draft.key, codes);
                  setLinkFor(null);
                }}
              />
            );
          })()
        : null}
      <FixModal batchId={batchId} fix={fixFor} onClose={() => setFixFor(null)} legName={fixFor ? legName(fixFor) : ''} />
    </Card>
  );
}

/** Qator qaysi Uzum tovar(lar)iga bog'langani: rasmli chiplar, "nomi bo'yicha", bog'lash tugmasi */
function LinkChips({ r, skus, onLink }: { r: BatchProfitRow; skus: BatchProfitDetail['skus']; onLink?: () => void }) {
  const t = useT('batches');
  const missing = new Set(r.missingCodes.map(normSkuCode));
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {r.link === 'personal' ? (
        <Badge tone="muted" title={t('profit.link.personalHint')}>
          {t('profit.link.personal')}
        </Badge>
      ) : r.codes.length ? (
        <>
          {r.codes.map((code) => {
            const sku = skus[normSkuCode(code)];
            const gone = missing.has(normSkuCode(code));
            return (
              <span
                key={code}
                title={gone ? t('profit.link.missingHint') : `${sku?.title ?? code} · ${code}${sku?.stores.length ? ` · ${sku.stores.join(', ')}` : ''}`}
                className={cn(
                  'inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border px-1.5 py-0.5 text-2xs',
                  gone ? 'border-warn/40 bg-warn/10 text-warn-ink' : 'border-line bg-surface-2 text-ink-soft',
                )}
              >
                <span className="h-4 w-4 shrink-0 overflow-hidden rounded">
                  <ProductThumb name={sku?.title ?? code} imageUrl={sku?.imageUrl} className="text-[8px]" />
                </span>
                <span className="truncate">{gone ? `${code} · ${t('profit.link.missing')}` : (sku?.title ?? code)}</span>
              </span>
            );
          })}
          {r.link === 'name' && r.linkFrom ? (
            <span className="text-2xs text-muted" title={t('profit.link.byNameHint', { batch: r.linkFrom.batchName })}>
              {t('profit.link.byName', { batch: r.linkFrom.batchName })}
            </span>
          ) : null}
        </>
      ) : r.optedOut ? (
        <Badge tone="muted" title={t('profit.link.optedOutHint')}>
          {t('profit.link.optedOut')}
        </Badge>
      ) : (
        <span className="text-2xs font-medium text-warn-ink">{t('profit.link.none')}</span>
      )}
      {onLink ? (
        <button
          type="button"
          onClick={onLink}
          className={cn(
            'focusable inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-2xs font-semibold',
            r.codes.length ? 'text-muted hover:bg-surface-3 hover:text-ink' : 'bg-brand/10 text-brand-ink hover:bg-brand/15',
          )}
        >
          <Link2 className="h-3 w-3" />
          {r.codes.length ? t('profit.link.edit') : t('profit.link.button')}
        </button>
      ) : null}
    </div>
  );
}

/** Qatorning sotuvlari — kabinet bilan solishtirish uchun buyurtma raqami bilan */
function OrdersList({ r, className }: { r: BatchProfitRow; className?: string }) {
  const t = useT('batches');
  const f = useFormat();
  return (
    <div className={className}>
      <p className="mb-1.5 text-2xs font-medium text-muted">
        {t('profit.row.orders', { n: f.num(r.ordersTotal) })}
        {r.ordersTotal > r.orders.length ? ` · ${t('profit.row.ordersMore', { n: f.num(r.orders.length) })}` : ''}
      </p>
      <ul className="grid gap-x-8 gap-y-0.5 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {r.orders.map((o, i) => (
          <li key={`${o.orderNo ?? 'x'}-${o.day}-${i}`} className="tnum flex items-center justify-between gap-3 border-b border-line/40 py-1">
            <span className="min-w-0 truncate text-ink-soft">
              {f.dateShort(o.day)} · {o.orderNo ? t('profit.row.order', { no: o.orderNo }) : t('profit.row.noOrder')} ·{' '}
              {t('profit.row.left', { n: f.num(o.units) })}
            </span>
            <span
              className={cn('whitespace-nowrap font-medium', o.state === 'unlocked' ? 'text-ink' : 'text-muted')}
              title={t(`profit.row.state.${o.state}`)}
            >
              {f.num(o.moneyBack)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Telefonda bitta qator — kartochka */
function ProfitRowCard({
  r,
  skus,
  expanded,
  onToggle,
  onLink,
}: {
  r: BatchProfitRow;
  skus: BatchProfitDetail['skus'];
  expanded: boolean;
  onToggle: () => void;
  onLink?: () => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const isLot = r.link === 'explicit' || r.link === 'name';
  const cells: [string, ReactNode][] = [
    // Sotilmaydigan (bog'lanmagan, shaxsiy, "Uzumda yo'q") qatorda sotildi — yo'q
    [t('profit.th.sold'), isLot ? `${f.num(r.sold)} / ${f.num(r.qty)}` : '—'],
    [t('profit.th.invested'), r.link === 'personal' ? '—' : f.num(r.invested)],
    [t('profit.th.back'), isLot ? f.num(r.moneyBack) : '—'],
    [
      t('profit.th.profit'),
      r.profit !== null && r.sold > 0 ? (
        <span className={cn('font-bold', r.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(r.profit)}</span>
      ) : (
        '—'
      ),
    ],
    [
      t('profit.th.left'),
      isLot
        ? r.legStatus === 'arrived'
          ? t('profit.row.left', { n: f.num(r.left) })
          : t('profit.transit', { n: f.num(r.left) })
        : r.link === 'personal' || r.optedOut
          ? '—'
          : t('profit.row.unknown'),
    ],
    [t('profit.th.arrived'), r.arrivedAt ? f.dateShort(r.arrivedAt) : t(`status.${r.legStatus}`)],
  ];
  return (
    <li className="px-4 py-3.5">
      <p className="font-semibold text-ink">
        <span className="mr-1.5 text-xs font-normal text-muted">{r.index + 1}.</span>
        {r.name || '—'}
      </p>
      <LinkChips r={r} skus={skus} onLink={onLink} />
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {cells.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-2xs font-medium text-muted">{label}</dt>
            <dd className="tnum mt-0.5 text-ink-soft">{value}</dd>
          </div>
        ))}
      </dl>
      {r.orders.length ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="focusable mt-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-ink"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {t('profit.row.orders', { n: f.num(r.ordersTotal) })}
        </button>
      ) : null}
      {expanded ? <OrdersList r={r} className="mt-2" /> : null}
    </li>
  );
}

function ProfitRowView({
  r,
  skus,
  expanded,
  onToggle,
  onLink,
  isLot,
}: {
  r: BatchProfitRow;
  skus: BatchProfitDetail['skus'];
  expanded: boolean;
  onToggle: () => void;
  onLink?: () => void;
  isLot: boolean;
}) {
  const t = useT('batches');
  const f = useFormat();
  const td = 'px-3 py-3 align-top';
  const num = 'tnum whitespace-nowrap text-right';

  return (
    <>
      <tr className="border-b border-line/70 last:border-0">
        <td className={cn(td, 'text-center text-xs text-muted')}>{r.index + 1}</td>
        <td className={td}>
          <div className="flex min-w-0 items-start gap-2">
            {r.orders.length ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="focusable -ml-1 mt-0.5 rounded p-0.5 text-muted hover:bg-surface-3 hover:text-ink"
                title={t('profit.row.orders', { n: f.num(r.ordersTotal) })}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink" title={r.name}>
                {r.name || '—'}
              </p>
              <LinkChips r={r} skus={skus} onLink={onLink} />
            </div>
          </div>
        </td>
        <td className={cn(td, 'whitespace-nowrap text-xs')}>
          {r.arrivedAt ? (
            <span className="tnum text-ink-soft">{f.dateShort(r.arrivedAt)}</span>
          ) : (
            <span className="text-muted">{t(`status.${r.legStatus}`)}</span>
          )}
        </td>
        <td className={cn(td, num)}>
          {isLot ? (
            <div className="inline-flex flex-col items-end">
              <span className="text-ink">
                {f.num(r.sold)} / {f.num(r.qty)}
              </span>
              {r.qty > 0 ? <ProgressBar value={(r.sold / r.qty) * 100} tone={r.sold >= r.qty ? 'brand' : 'info'} className="mt-1 w-16" /> : null}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className={cn(td, num, 'text-ink-soft')}>{r.link === 'personal' ? <span className="text-muted">—</span> : f.num(r.invested)}</td>
        <td className={cn(td, num)}>
          {isLot ? (
            <div className="inline-flex flex-col items-end">
              <span className="font-semibold text-ink">{f.num(r.moneyBack)}</span>
              {r.pendingBack > 0 ? <span className="text-2xs text-muted">{t('profit.backPending', { sum: f.num(r.pendingBack) })}</span> : null}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className={cn(td, num)}>
          {r.profit !== null && r.sold > 0 ? (
            <div className="inline-flex flex-col items-end">
              <span className={cn('font-bold', r.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(r.profit)}</span>
              {r.roi !== null ? <span className="text-2xs text-muted">{t('profit.roi', { pct: f.num(r.roi, 1) })}</span> : null}
            </div>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className={cn(td, num)}>
          {isLot ? (
            r.legStatus === 'arrived' ? (
              <div className="inline-flex flex-col items-end">
                <span className="text-ink-soft">{t('profit.row.left', { n: f.num(r.left) })}</span>
                {r.left > 0 ? <span className="text-2xs text-muted">{t('profit.row.leftCost', { sum: f.num(r.leftCost) })}</span> : null}
              </div>
            ) : (
              <span className="text-xs text-muted">{t('profit.transit', { n: f.num(r.left) })}</span>
            )
          ) : r.link === 'personal' || r.optedOut ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="text-xs text-muted">{t('profit.row.unknown')}</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-line/70 bg-surface-2/40">
          <td />
          <td colSpan={7} className="px-3 pb-3 pt-1">
            <OrdersList r={r} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ─────────────────────────── Bog'lash oynasi ───────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * Qator Uzum'dagi qaysi tovar(lar). Natijalar mahsulot bo'yicha guruhlanadi:
 * bir tovarning ranglari, o'lchamlari bitta bosishda tanlanadi.
 */
export function SkuLinkModal({
  open,
  name,
  initial,
  state,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  /** Oynada oldindan belgilangan kodlar (tanlangan yoki nomi bo'yicha olingan) */
  initial: readonly string[];
  /** Qatorning hozirgi holati: avtomatik (tegilmagan), tanlangan kodlar yoki "Uzumda yo'q" */
  state: 'auto' | 'codes' | 'none';
  onClose: () => void;
  /** Ro'yxat — tanlangan kodlar; [] — "Uzumda yo'q"; null — avtomatik (nomi bo'yicha) */
  onSave: (codes: string[] | null) => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const [q, setQ] = useState(name);
  const [picked, setPicked] = useState<string[]>(() => [...initial]);
  const sameAsInitial =
    picked.length === initial.length && picked.every((c) => initial.some((x) => normSkuCode(x) === normSkuCode(c)));
  // Hech narsa tanlanmagan bo'lsa "Saqlash" yo'q: "Uzumda yo'q" — alohida, nomi bilan aytilgan tanlov.
  // Nomi bo'yicha bog'langan qatorni xuddi shu tovarlar bilan saqlash — tasdiqlash (endi o'zgarmaydi).
  const canSave = picked.length > 0 && !(state === 'codes' && sameAsInitial);
  const query = useDebounced(q.trim(), 250);
  // Kalit `['batches']` ostida EMAS: har avtomatik saqlashda qidiruv qayta yuklanmasin
  const search = useQuery({
    queryKey: ['batch-skus', query],
    queryFn: () => api.get<BatchSkuSearchResponse>(`/batches/skus?take=60&q=${encodeURIComponent(query)}`),
    enabled: open,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const has = (code: string) => picked.some((c) => normSkuCode(c) === normSkuCode(code));
  const toggle = (code: string) =>
    setPicked((list) => {
      if (list.some((c) => normSkuCode(c) === normSkuCode(code))) return list.filter((c) => normSkuCode(c) !== normSkuCode(code));
      if (list.length >= BATCH_MAX_SKU_CODES) {
        toast.warning(t('profit.link.max', { n: BATCH_MAX_SKU_CODES }));
        return list;
      }
      return [...list, code];
    });

  const groups = useMemo(() => {
    const out = new Map<string, { title: string; items: BatchSkuOption[] }>();
    for (const o of search.data?.items ?? []) {
      const g = out.get(o.productId) ?? { title: o.productTitle, items: [] };
      g.items.push(o);
      out.set(o.productId, g);
    }
    return [...out.entries()];
  }, [search.data]);

  const selectGroup = (items: BatchSkuOption[]) =>
    setPicked((list) => {
      const add = items.map((o) => o.code).filter((c) => !list.some((x) => normSkuCode(x) === normSkuCode(c)));
      const next = [...list, ...add];
      if (next.length > BATCH_MAX_SKU_CODES) toast.warning(t('profit.link.max', { n: BATCH_MAX_SKU_CODES }));
      return next.slice(0, BATCH_MAX_SKU_CODES);
    });

  const titleOf = (code: string) => search.data?.items.find((o) => normSkuCode(o.code) === normSkuCode(code))?.title;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('profit.link.title')}
      description={t('profit.link.subtitle', { name: name || '—' })}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {state !== 'none' ? (
              <Button variant="ghost" title={t('profit.link.optOutHint')} onClick={() => onSave([])}>
                {t('profit.link.optOut')}
              </Button>
            ) : null}
            {state !== 'auto' ? (
              <Button variant="ghost" title={t('profit.link.autoHint')} onClick={() => onSave(null)}>
                {t('profit.link.auto')}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('profit.link.cancel')}
            </Button>
            <Button disabled={!canSave} onClick={() => onSave(picked)}>
              {t('profit.link.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={q}
          placeholder={t('profit.link.search')}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      {picked.length ? (
        <div className="mt-3">
          <p className="text-2xs font-medium text-muted">{t('profit.link.selected', { n: picked.length })}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {picked.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className="focusable inline-flex max-w-[260px] items-center gap-1 rounded-lg bg-brand/10 px-2 py-1 text-xs font-medium text-brand-ink hover:bg-brand/15"
                title={code}
              >
                <span className="truncate">{titleOf(code) ?? code}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 max-h-[46vh] overflow-y-auto rounded-xl border border-line">
        {search.isLoading ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('profit.link.loading')}
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">{t('profit.link.empty')}</p>
        ) : (
          <>
            {search.data?.match === 'tokens' ? <p className="border-b border-line px-4 py-2 text-xs text-muted">{t('profit.link.tokens')}</p> : null}
            {groups.map(([id, g]) => (
              <div key={id} className="border-b border-line/70 last:border-0">
                <div className="flex items-center justify-between gap-3 bg-surface-2/60 px-4 py-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-ink-soft">{g.title}</p>
                  {g.items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => selectGroup(g.items)}
                      className="focusable shrink-0 rounded text-2xs font-semibold text-brand-ink hover:underline"
                    >
                      {t('profit.link.selectAll')}
                    </button>
                  ) : null}
                </div>
                <ul>
                  {g.items.map((o) => {
                    const on = has(o.code);
                    return (
                      <li key={o.code}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2/60',
                            on && 'bg-brand/[0.06]',
                          )}
                        >
                          <input type="checkbox" checked={on} onChange={() => toggle(o.code)} className="h-4 w-4 shrink-0 accent-[rgb(var(--c-brand))]" />
                          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                            <ProductThumb name={o.title} imageUrl={o.imageUrl} className="text-xs" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{o.title}</span>
                            <span className="block truncate text-2xs text-muted">
                              {o.code}
                              {o.stores.length > 1 ? ` · ${o.stores.join(', ')}` : ''}
                              {o.linkedRows > 0 ? ` · ${t('profit.link.linkedRows', { n: f.num(o.linkedRows) })}` : ''}
                            </span>
                          </span>
                          {o.archived ? <Badge tone="muted">{t('profit.link.archived')}</Badge> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────── Kelgan sanani tuzatish ───────────────────────────

/** Bugun — savdo kuni (Toshkent, UTC+5) */
const todayIso = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

function FixModal({
  batchId,
  fix,
  legName,
  onClose,
}: {
  batchId: string;
  fix: BatchProfitFix | null;
  legName: string;
  onClose: () => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  useEffect(() => {
    if (fix) setDate(fix.date);
  }, [fix]);

  const save = useMutation({
    mutationFn: (body: { fix: BatchProfitFix; date: string }) =>
      api.put<unknown>(`/batches/${batchId}/shipment`, {
        cargoName: body.fix.cargoName,
        delivery: body.fix.delivery,
        trip: body.fix.trip,
        status: 'arrived',
        shippedAt: body.fix.shippedAt,
        arrivedAt: body.date,
      }),
    onSuccess: () => {
      toast.success(t('profit.fix.saved'));
      void qc.invalidateQueries({ queryKey: ['batches'] });
      void qc.invalidateQueries({ queryKey: ['batch', batchId] });
      onClose();
    },
    onError: (err: unknown) => toast.error(t('profit.fix.error'), err instanceof Error ? err.message : undefined),
  });

  return (
    <Modal
      open={Boolean(fix)}
      onClose={onClose}
      size="sm"
      title={t('profit.fix.title')}
      description={t('profit.fix.subtitle')}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('profit.link.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!fix || !date} onClick={() => fix && save.mutate({ fix, date })}>
            {t('profit.fix.save')}
          </Button>
        </div>
      }
    >
      {fix ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-ink">{legName}</p>
          {fix.shippedAt ? <p className="tnum text-xs text-muted">{t('profit.fix.shipped', { date: f.dateShort(fix.shippedAt) })}</p> : null}
          <label className="block">
            <span className="label">{t('profit.fix.date')}</span>
            <Input type="date" value={date} min={fix.shippedAt ?? undefined} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <p className="text-xs text-muted">{fix.basis === 'invoice' ? t('profit.fix.basisInvoice') : t('profit.fix.basisSale')}</p>
        </div>
      ) : null}
    </Modal>
  );
}
