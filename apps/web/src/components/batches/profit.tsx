/**
 * Partiya foydasi (2026-11-12): har partiyaga qancha pul tikilgan, Uzum'dan
 * qancha qaytgan (reklama va soliq ayrilgan) va qancha sof foyda — sotuvlardan
 * avtomatik (server: services/batch-profit.ts, hisob: shared batch-profit.ts).
 * Partiya Uzum qabul qilgan kundan sotuvda; undan oldin — qayerdaligi
 * ("Qabul qilinmoqda, ta'minlash №…").
 *
 * Raqamlar doim SAQLANGAN holatdan (server hisoblaydi): partiya jadvali
 * avtomatik saqlangach `['batches']` yangilanadi va shu so'rovlar ham qayta
 * keladi. Saqlash kutilayotganda raqamlar xiraroq ko'rinadi.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
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
  type BatchStage,
} from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Input, Modal, ProductThumb, ProgressBar, Skeleton, toast, type Tone } from '@/components/ui';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useCanOpen } from '@/lib/view';
// Umumiy partiya matnlari (№, avia/avto, reys) — «Partiya foydasi» sahifasi ularni o'zi yuklamaydi
import './shared';
import './texts-profit';
import './texts-profit-page';

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
export function useDayText() {
  const f = useFormat();
  const year = String(new Date().getFullYear());
  return (iso: string) => (iso.slice(0, 4) === year ? f.dateShort(iso) : f.date(iso));
}

/** Soliq stavkasi: butun bo'lsa kasrsiz ("1%", "1,0%" emas), aks holda bir kasr ("4,5%") */
export function useRateText() {
  const f = useFormat();
  return (v: number) => f.num(v, Number.isInteger(v) ? 0 : 1);
}

// ─────────────────────────── Bosqich ───────────────────────────

/*
 * Partiya qayerda: Xitoyda → yo'lda → keldi → Uzumga yo'lda → qabul qilinmoqda →
 * sotuvda. Sotuv faqat "sotuvda" dan boshlab (Uzum qabul qilgan kundan) yoziladi.
 * Ranglar Yetkazmalar sahifasidagi holatlar bilan bir xil: qabul — binafsha, sotuvda — brend.
 */
export const STAGE_TONE: Record<BatchStage, Tone> = {
  warehouse: 'muted',
  shipped: 'warn',
  arrived: 'info',
  toUzum: 'info',
  accepting: 'violet',
  selling: 'brand',
  soldOut: 'brand',
};

export const isOnSale = (stage: BatchStage) => stage === 'selling' || stage === 'soldOut';

/** Bosqich nishoni; sotuvda bo'lsa — qaysi kundan */
export function StageBadge({ stage, since }: { stage: BatchStage; since?: string | null }) {
  const t = useT('batches');
  const dayText = useDayText();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone={STAGE_TONE[stage]} dot>
        {t(`profit.stage.${stage}`)}
      </Badge>
      {since && stage === 'selling' ? (
        <span className="tnum text-2xs text-muted">{t('profit.stage.since', { date: dayText(since) })}</span>
      ) : null}
    </span>
  );
}

/** Partiya bosqichi bitta jumlada — Uzum ta'minlashi raqami bilan */
export function useStageLine() {
  const t = useT('batches');
  const f = useFormat();
  const dayText = useDayText();
  return (p: Pick<BatchProfitSummary, 'stage' | 'onSaleFrom' | 'supplies' | 'soldOutAt'>): string => {
    const pending = p.supplies.filter((s) => s.status !== 'accepted');
    const accepted = p.supplies.filter((s) => s.status === 'accepted');
    switch (p.stage) {
      case 'accepting': {
        const s = pending.find((x) => x.status === 'accepting') ?? pending[0];
        return s ? t('profit.line.accepting', { code: s.code, n: f.num(s.planned) }) : t('profit.stage.accepting');
      }
      case 'toUzum': {
        const s = pending[0];
        return s ? t('profit.line.toUzum', { code: s.code }) : t('profit.stage.toUzum');
      }
      case 'selling': {
        if (!p.onSaleFrom) return t('profit.stage.selling');
        const s = accepted.find((x) => x.day === p.onSaleFrom) ?? accepted[0];
        return s
          ? t('profit.line.selling', { date: dayText(p.onSaleFrom), code: s.code })
          : t('profit.line.sellingNoCode', { date: dayText(p.onSaleFrom) });
      }
      case 'soldOut':
        return p.soldOutAt ? t('profit.line.soldOut', { date: dayText(p.soldOutAt) }) : t('profit.stage.soldOut');
      default:
        return t(`profit.line.${p.stage}`);
    }
  };
}

// ─────────────────────────── Hisobga kirmagan sotuv ───────────────────────────

/** Hech qaysi partiyaga tushmagan sotuv va reklama — ro'yxat ostida qisqa qator(lar) */
export function UnattributedNote({ un, className }: { un: BatchProfitUnattributed | undefined; className?: string }) {
  const t = useT('batches');
  const f = useFormat();
  if (!un) return null;
  const sales = un.units > 0;
  const ads = un.adUnplaced !== 0;
  if (!sales && !ads) return null;
  const top = un.top.length
    ? t('profit.un.top', { list: un.top.map((x) => `${x.title || x.code} (${f.num(x.units)})`).join(', ') })
    : undefined;
  return (
    <div className={cn('space-y-1', className)}>
      {sales ? (
        <p className="tnum flex items-start gap-2 text-xs leading-relaxed text-muted" title={top}>
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('profit.unattributed', { n: f.num(un.units), sum: f.money(un.moneyBack) })}</span>
        </p>
      ) : null}
      {ads ? (
        <p className="tnum flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Coins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t('profit.un.adsUnplaced', { sum: f.money(un.adUnplaced) })}</span>
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Partiya sahifasi: bitta qator ───────────────────────────

/** Qaytgan pul qayerdan: Uzum to'lovi − reklama − soliq; kutilayotgani */
function useBackTitle() {
  const t = useT('batches');
  const f = useFormat();
  return (x: { payout: number; adFee: number; tax: number; pending: number }) =>
    [
      t('profit.backBreakdown', { payout: f.num(x.payout), ads: f.num(x.adFee), tax: f.num(x.tax) }),
      x.pending > 0 ? t('profit.backPending', { sum: f.num(x.pending) }) : null,
    ]
      .filter(Boolean)
      .join('\n');
}

/**
 * Partiya sahifasidagi tannarx kartochkasi ostida BITTA qator: partiya qayerda va
 * (sotilgan bo'lsa) sof foyda — batafsili «Partiya foydasi» sahifasida.
 *
 * Egasi (2026-11-12): "partiyalar foydasi juda chalkash — alohida sahifa qil".
 * Ilgari bu yerda uchta katta raqam (tikilgan / qaytgan / sof foyda) bor edi:
 * tannarx kartochkasida "Umumiy" va "Tikilgan pul" ikki marta bir xil summa
 * ko'rsatardi. Endi bu kartochka faqat tannarx haqida.
 */
export function ProfitLink({ batchId, pending }: { batchId: string; pending: boolean }) {
  const t = useT('batches');
  const f = useFormat();
  const stageLine = useStageLine();
  const canOpen = useCanOpen();
  const { data, isLoading, isError, refetch } = useBatchProfit(batchId);
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);

  if (isLoading) return <Skeleton className="mt-6 h-6 w-full" />;
  // Foyda hisoblanmasa — tannarx kartochkasi ishlayveradi, xato shu qatorda va qayta urinish bilan
  // (jadval ostidagi "Sotuv va foyda" ham shu so'rovni o'qiydi — u ham qayta keladi)
  if (isError && !data) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-sm text-muted">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn-ink" />
        <span>{t('profit.error')}</span>
        <button type="button" onClick={() => void refetch()} className="focusable rounded font-semibold text-brand-ink hover:underline">
          {t('profit.retry')}
        </button>
      </div>
    );
  }
  if (!data || data.state === 'empty') return null;
  const onSale = isOnSale(data.stage);
  const sold = data.soldQty > 0;

  return (
    <div
      className={cn(
        'mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-sm transition-opacity duration-200',
        pending && 'opacity-60',
      )}
      title={pending ? t('profit.updating') : undefined}
    >
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-muted">
        <Coins className="h-4 w-4 shrink-0" />
        <Badge tone={STAGE_TONE[data.stage]} dot>
          {t(`profit.stage.${data.stage}`)}
        </Badge>
        {sold ? (
          <span className="tnum">
            {data.profit < 0 ? t('pp.fig.loss') : t('profit.profit')}:{' '}
            <span className={cn('whitespace-nowrap font-semibold', data.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.money(Math.abs(data.profit))}</span>
            {' · '}
            {t('profit.sold', { sold: num(data.soldQty), qty: num(data.qty) })}
          </span>
        ) : (
          <span>{data.qty === 0 ? t('pp.fig.noQty') : onSale && data.state === 'unlinked' ? t('profit.line.unlinked') : stageLine(data)}</span>
        )}
      </p>
      {/* Sahifa a'zoning shablonida yopiq bo'lsa — havola yo'q (bosilsa "Bu bo'lim sizga yopiq" chiqardi) */}
      {canOpen('/batch-profit') ? (
        <Link
          to={`/batch-profit#${batchId}`}
          className="focusable inline-flex shrink-0 items-center gap-1 rounded font-semibold text-brand-ink hover:underline"
        >
          {t('pp.title')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
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

/** Yozilishdan qat'i nazar bitta kalit: "Mandarin" va "MANDARIN " — bitta jo'natma (server: batch-keys.ts shipKeyOf) */
const keyText = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
const legKey = (fix: BatchProfitFix) => `${keyText(fix.cargoName)}|${fix.delivery}|${keyText(fix.trip)}`;

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
  const stageLine = useStageLine();
  const rateText = useRateText();
  const { data, isLoading } = useBatchProfit(batchId);
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const [fixFor, setFixFor] = useState<BatchProfitFix | null>(null);
  /*
   * «Partiya foydasi» sahifasidan "Bog'lash" bosilsa — `/batches/:id#profit`:
   * jadval yuklangach shu kartochkaga o'tiladi (bog'lash shu yerda).
   */
  const ready = Boolean(data);
  useEffect(() => {
    if (!ready || window.location.hash !== '#profit') return;
    // Bir kadr keyin — AppLayout'ning "yangi sahifa — tepaga" surishidan keyin (u bizdan keyin ishlaydi)
    const frame = requestAnimationFrame(() => document.getElementById('profit')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [ready]);

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

  // Sana tuzatish — faqat Uzum ta'minlashisiz («Keldi» bo'yicha) partiyada; har jo'natmaga bitta
  const fixes = new Map<string, { fix: BatchProfitFix; units: number }>();
  for (const r of data.rows) {
    if (!r.fix) continue;
    const k = `${r.fix.kind}|${legKey(r.fix)}`;
    const cur = fixes.get(k);
    const units = r.fix.kind === 'arrive' ? r.notMarked : r.beforeArrival;
    if (cur) {
      cur.units += units;
      if (r.fix.date < cur.fix.date) cur.fix = r.fix;
    } else fixes.set(k, { fix: r.fix, units });
  }
  const beforeNoFix = data.rows.reduce((a, r) => a + (r.fix?.kind === 'earlier' ? 0 : r.beforeArrival), 0);
  // Ataylab "Uzumda yo'q" deb belgilanganlar haqida qayta-qayta eslatilmaydi
  const unlinkedNag = data.rows.filter((r) => r.link === 'none' && !r.optedOut && r.qty > 0).length;
  const missing = data.rows.reduce((a, r) => a + r.missingCodes.length, 0);
  const legName = (fix: BatchProfitFix) =>
    [fix.cargoName || t('profit.fix.noCargo'), t(`delivery.${fix.delivery}`), fix.trip ? t('ship.trip', { n: fix.trip }) : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <Card id="profit" className={cn('scroll-mt-20 overflow-hidden transition-opacity duration-200', pending && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold text-ink">
            <Coins className="h-4 w-4 text-brand-ink" />
            {t('profit.card')}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={STAGE_TONE[data.stage]} dot>
              {t(`profit.stage.${data.stage}`)}
            </Badge>
            <span>{stageLine(data)}</span>
          </p>
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

      <ProfitRows
        data={data}
        linkFor={(r) => (canEdit && draftOf(r) && r.link !== 'personal' ? () => setLinkFor(r.index) : undefined)}
      />

      <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">{t('profit.note', { rate: rateText(data.taxRate) })}</p>

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

/**
 * Partiya qatorlari: kompyuterda jadval, telefonda kartochkalar; ostida
 * bo'linmagan xarajat va jami (partiya xulosasi bilan aynan bir xil).
 * Partiya sahifasida — bog'lash tugmasi bilan, «Partiya foydasi» sahifasida — faqat ko'rish.
 */
export function ProfitRows({
  data,
  linkFor,
}: {
  data: BatchProfitDetail;
  /** Qatorni bog'lash oynasini ochuvchi (partiya sahifasida); undefined — tugma yo'q */
  linkFor?: (r: BatchProfitRow) => (() => void) | undefined;
}) {
  const t = useT('batches');
  const f = useFormat();
  const num = (v: number) => f.num(v).replace(/ /g, NBSP);
  const [open, setOpen] = useState<number | null>(null);
  // Telefonda jadval o'rniga har qator — kartochka (ro'yxat sahifasidagidek)
  const isDesktop = useIsDesktop();

  const th = 'table-head border-b border-line px-3 py-3';
  /*
   * Jami — partiya xulosasidan (partiya kartochkasidagi raqamlar bilan aynan bir xil).
   * Qatorlarga tushmagan umumiy xarajat (bo'linmagan qo'shimcha xarajat; soni yo'q va
   * "Uzumda yo'q" qatorlarning foydadan ayrilgan ulushi) alohida qatorda — ustunlar
   * yig'indisi jamiga teng.
   */
  const rowsInvested = data.rows.reduce((a, r) => a + r.invested, 0);
  const overheadRow = { invested: data.invested - rowsInvested, profit: -data.overheadNow };
  const showOverhead = overheadRow.invested !== 0 || overheadRow.profit !== 0;
  const foot = { invested: data.invested, back: data.moneyBack, profit: data.profit, sold: data.soldQty };

  return (
    <>
      {!isDesktop ? (
        <>
          <ul className="divide-y divide-line/70">
            {data.rows.map((r) => {
              const expanded = open === r.index;
              return (
                <ProfitRowCard
                  key={r.index}
                  r={r}
                  skus={data.skus}
                  expanded={expanded}
                  onToggle={() => setOpen(expanded ? null : r.index)}
                  onLink={linkFor?.(r)}
                />
              );
            })}
          </ul>
          {/*
            Jami — ustma-ust: nomi chapda, summa o'ngda. Uchta 8–10 xonali summa 360–375 px da
            yonma-yon sig'masdi — oxirgisi (sof foyda) kartochka chetida kesilib qolardi.
          */}
          <div className="border-t border-line bg-surface-2/60 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">{t('profit.footTotal')}</p>
            <dl className="mt-1.5 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-ink-soft">{t('profit.th.invested')}</dt>
                <dd className="tnum whitespace-nowrap font-semibold text-ink-soft">{f.num(foot.invested)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-ink-soft">{t('profit.th.back')}</dt>
                <dd className="tnum whitespace-nowrap font-semibold text-ink">{f.num(foot.back)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 text-ink-soft">{t('profit.th.profit')}</dt>
                <dd className={cn('tnum whitespace-nowrap font-extrabold', foot.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(foot.profit)}</dd>
              </div>
            </dl>
            {/*
              Bo'linmagan xarajat to'liq (qo'shimcha xarajat + soni yo'q va «Uzumda yo'q» qatorlar puli —
              profit.overheadHint dagi ta'rif) va undan hozirgacha foydadan ayrilgani: ikkalasi bir asosda.
            */}
            {data.overhead > 0 || data.overheadNow !== 0 ? (
              <p className="tnum mt-2 text-xs leading-snug text-muted" title={t('profit.overheadHint')}>
                {t('profit.footOverhead', { invested: num(data.overhead), profit: num(data.overheadNow) })}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[150px]" />
              <col className="w-[120px]" />
              <col className="w-[130px]" />
              <col className="w-[150px]" />
              <col className="w-[140px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={cn(th, 'text-center')}>{t('th.no')}</th>
                <th className={cn(th, 'text-left')}>{t('profit.th.item')}</th>
                <th className={cn(th, 'text-left')}>{t('profit.th.stage')}</th>
                <th className={cn(th, 'text-right')}>{t('profit.th.sold')}</th>
                <th className={cn(th, 'text-right')}>{t('profit.th.invested')}</th>
                <th className={cn(th, 'text-right')}>{t('profit.th.back')}</th>
                <th className={cn(th, 'text-right')}>{t('profit.th.profit')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const expanded = open === r.index;
                return (
                  <ProfitRowView
                    key={r.index}
                    r={r}
                    skus={data.skus}
                    expanded={expanded}
                    onToggle={() => setOpen(expanded ? null : r.index)}
                    onLink={linkFor?.(r)}
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
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
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
              {t('profit.row.units', { n: f.num(o.units) })}
            </span>
            <span
              className={cn('whitespace-nowrap font-medium', o.state === 'unlocked' ? 'text-ink' : 'text-muted')}
              title={[t(`profit.row.state.${o.state}`), o.adFee ? t('profit.row.orderAds', { sum: f.num(o.adFee) }) : null]
                .filter(Boolean)
                .join(' · ')}
            >
              {f.num(o.moneyBack)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qaytgan pul katagi to'ladimi: bog'langan qator sotuvda yoki puli bor (hali sotuvda emas — "—", 0 emas) */
const hasMoney = (r: BatchProfitRow) =>
  (r.link === 'explicit' || r.link === 'name') && (isOnSale(r.stage) || r.sold > 0 || r.moneyBack !== 0);

/** Qator bosqichi — shaxsiy va "Uzumda yo'q" qatorda yo'q */
function RowStage({ r }: { r: BatchProfitRow }) {
  if (r.link === 'personal' || r.optedOut) return <span className="text-muted">—</span>;
  return <StageBadge stage={r.stage} since={r.onSaleFrom} />;
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
  const backTitle = useBackTitle();
  const isLot = r.link === 'explicit' || r.link === 'name';
  const cells: [string, ReactNode][] = [
    [t('profit.th.stage'), <RowStage key="s" r={r} />],
    // Sotilmaydigan (bog'lanmagan, shaxsiy, "Uzumda yo'q") qatorda sotildi — yo'q
    [t('profit.th.sold'), isLot ? `${f.num(r.sold)} / ${f.num(r.qty)}` : '—'],
    [t('profit.th.invested'), r.link === 'personal' ? '—' : f.num(r.invested)],
    [
      t('profit.th.back'),
      hasMoney(r) ? (
        <span title={backTitle({ payout: r.payout, adFee: r.adFee, tax: r.tax, pending: r.pendingBack })}>{f.num(r.moneyBack)}</span>
      ) : (
        '—'
      ),
    ],
    [
      t('profit.th.profit'),
      r.profit !== null && r.sold > 0 ? (
        <span className={cn('font-bold', r.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(r.profit)}</span>
      ) : (
        '—'
      ),
    ],
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
}: {
  r: BatchProfitRow;
  skus: BatchProfitDetail['skus'];
  expanded: boolean;
  onToggle: () => void;
  onLink?: () => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const backTitle = useBackTitle();
  const td = 'px-3 py-3 align-top';
  const num = 'tnum whitespace-nowrap text-right';
  const isLot = r.link === 'explicit' || r.link === 'name';

  return (
    <>
      <tr className="border-b border-line/70 last:border-0">
        <td className={cn(td, 'text-center text-xs text-muted')}>{r.index + 1}</td>
        {/* w-full max-w-0: nom ustun kengligini belgilamaydi — uzun nom "…" bilan qisqaradi */}
        <td className={cn(td, 'w-full max-w-0')}>
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
        <td className={cn(td, 'text-xs')}>
          <RowStage r={r} />
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
          {hasMoney(r) ? (
            <span
              className="font-semibold text-ink"
              title={backTitle({ payout: r.payout, adFee: r.adFee, tax: r.tax, pending: r.pendingBack })}
            >
              {f.num(r.moneyBack)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className={cn(td, num)}>
          {r.profit !== null && r.sold > 0 ? (
            <span className={cn('font-bold', r.profit < 0 ? 'text-danger-ink' : 'text-brand-ink')}>{f.num(r.profit)}</span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-line/70 bg-surface-2/40">
          <td />
          <td colSpan={6} className="px-3 pb-3 pt-1">
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
