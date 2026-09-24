import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  Landmark,
  Loader2,
  Plane,
  Plus,
  Receipt,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import {
  BATCH_MAX_ITEMS,
  calcBatch,
  type BatchDelivery,
  type BatchDetail as BatchDetailData,
  type BatchItemInput,
  type BatchRate,
} from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  Skeleton,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
} from '@/components/ui';
import { parseAmount } from '@/components/batches/shared';

interface Row extends BatchItemInput {
  /** Faqat React uchun — serverga yuborilmaydi */
  key: string;
}

interface Draft {
  id: string;
  name: string;
  rate: number;
  extra: number;
  rows: Row[];
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const SAVE_DELAY_MS = 700;
const NEW_CARGO = '__new__';
const DELIVERIES: BatchDelivery[] = ['avia', 'avto'];

let keySeq = 0;
const newKey = () => `r${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function blankRow(prev?: Row): Row {
  // Kargo va yetkazish turi odatda butun partiya uchun bir xil — oldingi qatordan olinadi
  return {
    key: newKey(),
    name: '',
    trackCode: '',
    qty: 0,
    priceCny: 0,
    cargoName: prev?.cargoName ?? '',
    delivery: prev?.delivery ?? 'avto',
    weightKg: 0,
    cargoCost: 0,
  };
}

/** Hech narsa yozilmagan qator saqlanmaydi (kargo va yetkazish oldingi qatordan meros) */
const isBlank = (r: Row) =>
  !r.name.trim() && !r.trackCode.trim() && !r.qty && !r.priceCny && !r.weightKg && !r.cargoCost;

function toDraft(d: BatchDetailData): Draft {
  const rows = d.items.map(({ id, name, trackCode, qty, priceCny, cargoName, delivery, weightKg, cargoCost }) => ({
    key: id,
    name,
    trackCode,
    qty,
    priceCny,
    cargoName,
    delivery,
    weightKg,
    cargoCost,
  }));
  return { id: d.id, name: d.name, rate: d.rate, extra: d.extra, rows: rows.length ? rows : [blankRow()] };
}

// ─────────────────────────── Kataklar ───────────────────────────

const CELL_INPUT =
  'h-full w-full min-w-0 bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/50 ' +
  'focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-brand/40 disabled:cursor-default';

/** Sariq katak — sotuvchi to'ldiradi (Excel'dagi odatiy belgi) */
const EDITABLE_TD = 'border-l border-line/60 bg-warn/[0.06] p-0';

function NumCell({
  value,
  onChange,
  digits = 0,
  integer = false,
  disabled,
  cell,
  onKeyDown,
  className,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  digits?: number;
  integer?: boolean;
  disabled?: boolean;
  cell: string;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** Jadvaldan tashqarida — oddiy maydon ko'rinishi */
  className?: string;
  /** Kasr qismi o'zgaruvchan bo'lsa (kg: "12" va "0,35") — `digits` o'rniga */
  format?: (v: number) => string;
}) {
  const f = useFormat();
  const ref = useRef<HTMLInputElement>(null);
  /** null — tahrirlanmayapti, formatlangan qiymat ko'rinadi */
  const [text, setText] = useState<string | null>(null);
  const selectAll = useRef(false);

  // Fokusda formatlangan qiymat xom raqamga almashadi — belgilash shundan
  // KEYIN bo'lishi kerak, aks holda yangi raqam eskisining oxiriga qo'shilardi
  useLayoutEffect(() => {
    if (!selectAll.current) return;
    selectAll.current = false;
    ref.current?.select();
  }, [text]);

  return (
    <input
      ref={ref}
      data-cell={cell}
      inputMode={integer ? 'numeric' : 'decimal'}
      disabled={disabled}
      value={text ?? (value ? (format ? format(value) : f.num(value, digits)) : '')}
      placeholder="0"
      onFocus={() => {
        selectAll.current = true;
        setText(value ? String(value) : '');
      }}
      onBlur={() => setText(null)}
      onChange={(e) => {
        // Harf kiritilmaydi — tasodifan yozilgan matn narxni jimgina 0 ga aylantirmasin
        const clean = e.target.value.replace(/[^\d\s.,]/g, '');
        setText(clean);
        const n = parseAmount(clean, integer);
        // Tushunib bo'lmaydigan matnda oxirgi to'g'ri qiymat saqlanadi
        if (Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={onKeyDown}
      className={cn(className ?? CELL_INPUT, 'tnum text-right')}
    />
  );
}

function NewCargoModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const t = useT('batches');
  const tc = useT('common');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ro'yxat yopilgach brauzer fokusni <select>ga qaytaradi va autoFocus'ni
  // bosib ketadi — shunda yozilgan matn jadvaldagi katakka tushardi
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  const close = () => {
    setName('');
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    onAdd(v);
    setName('');
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('cargo.newTitle')}
      description={t('cargo.newHint')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {tc('btn.cancel')}
          </Button>
          <Button type="submit" form="cargo-new" disabled={!name.trim()}>
            {t('cargo.add')}
          </Button>
        </div>
      }
    >
      <form id="cargo-new" onSubmit={submit}>
        <Input
          ref={inputRef}
          autoFocus
          value={name}
          maxLength={60}
          placeholder="TEZ-TEZ"
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Modal>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const t = useT('batches');
  if (state === 'idle') return null;
  if (state === 'error')
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-danger-ink">
        <AlertTriangle className="h-4 w-4" />
        {t('save.error')}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('save.retry')}
        </Button>
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted" aria-live="polite">
      {state === 'saving' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === 'saved' ? (
        <Check className="h-4 w-4 text-brand" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-warn" />
      )}
      {t(`save.${state}`)}
    </span>
  );
}

// ─────────────────────────── Sahifa ───────────────────────────

/**
 * Har bir partiya o'z holati bilan ochiladi: bir partiyadan boshqasiga
 * o'tganda saqlanmagan o'zgarish boshqa partiyaga yozilib ketmasligi uchun.
 */
export default function BatchDetailRoute() {
  const { id = '' } = useParams<{ id: string }>();
  return <BatchDetail key={id} id={id} />;
}

function BatchDetail({ id }: { id: string }) {
  const t = useT('batches');
  const f = useFormat();
  // Og'irlik keraklicha kasr bilan: "12", "2,5", "0,35" — "2,50" emas
  const kgText = (v: number) => {
    const digits = [0, 1, 2].find((d) => Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-6) ?? 2;
    return f.num(v, digits);
  };
  const qc = useQueryClient();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');

  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => api.get<BatchDetailData>(`/batches/${id}`),
    enabled: Boolean(id),
    // Keshdagi nusxa boshqa qurilmada o'zgargan bo'lishi mumkin — har ochilishda yangisi
    refetchOnMount: 'always',
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [addedCargo, setAddedCargo] = useState<string[]>([]);
  const [cargoFor, setCargoFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [rateLoading, setRateLoading] = useState(false);

  // Serverdan kelgan partiya faqat bir marta formaga o'tadi — keyingi
  // saqlash javoblari yozayotgan foydalanuvchining kursorini buzmasligi kerak
  useEffect(() => {
    if (data && !draft && !isFetching) setDraft(toDraft(data));
  }, [data, draft, isFetching]);

  // ── Avtomatik saqlash ──
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const version = useRef(0);
  const savedVersion = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastName = useRef('');
  if (data && !lastName.current) lastName.current = data.name;

  const flush = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const d = draftRef.current;
      const v = version.current;
      if (!d || v === savedVersion.current || !(d.rate > 0)) return;
      setSaveState('saving');
      try {
        const name = d.name.trim() || lastName.current;
        const saved = await api.put<BatchDetailData>(`/batches/${d.id}`, {
          name,
          rate: d.rate,
          extra: d.extra,
          items: d.rows.filter((r) => !isBlank(r)).map(({ key: _key, ...item }) => item),
        });
        lastName.current = saved.name;
        savedVersion.current = v;
        qc.setQueryData(['batch', d.id], saved);
        void qc.invalidateQueries({ queryKey: ['batches'] });
        setSaveState(version.current === v ? 'saved' : 'pending');
      } catch (err) {
        setSaveState('error');
        if (err instanceof ApiError) toast.error(t('save.error'), err.message);
      }
    });
    return chain.current;
  }, [qc, t]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return;
    const timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [tick, flush]);

  // Sahifadan chiqishda kutilayotgan o'zgarish yo'qolmasin
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (version.current !== savedVersion.current) void flush();
    };
  }, [flush]);

  const edit = useCallback(
    (fn: (d: Draft) => Draft) => {
      if (!canEdit) return;
      setDraft((d) => (d ? fn(d) : d));
      version.current += 1;
      setSaveState('pending');
      setTick((n) => n + 1);
    },
    [canEdit],
  );

  const patchRow = (key: string, p: Partial<BatchItemInput>) =>
    edit((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...p } : r)) }));

  const canAdd = (draft?.rows.length ?? 0) < BATCH_MAX_ITEMS;
  const addRow = () => {
    if (!canAdd) {
      toast.warning(t('rows.limit', { n: BATCH_MAX_ITEMS }));
      return;
    }
    edit((d) => ({ ...d, rows: [...d.rows, blankRow(d.rows[d.rows.length - 1])] }));
  };
  const removeRow = (key: string) =>
    edit((d) => {
      const rows = d.rows.filter((r) => r.key !== key);
      return { ...d, rows: rows.length ? rows : [blankRow(d.rows[0])] };
    });

  // ── Klaviatura: Enter — pastga, oxirgi qatorda yangi qator ──
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusCell = (cell: string) =>
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();

  const onCellKey = (rowIdx: number, col: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !draft) return;
    e.preventDefault();
    const next = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
    if (next < 0) return;
    if (next < draft.rows.length) {
      focusCell(`${next}:${col}`);
    } else if (canEdit && canAdd) {
      pendingFocus.current = `${next}:${col}`;
      addRow();
    }
  };

  const rowCount = draft?.rows.length ?? 0;
  useEffect(() => {
    if (!pendingFocus.current) return;
    focusCell(pendingFocus.current);
    pendingFocus.current = null;
  }, [rowCount]);

  const applyCbuRate = async () => {
    setRateLoading(true);
    try {
      const r = await qc.fetchQuery({
        queryKey: ['batches-rate'],
        queryFn: () => api.get<BatchRate>('/batches/rate'),
        staleTime: 30 * 60_000,
      });
      const rate = Math.round(r.rate * 100) / 100;
      edit((d) => ({ ...d, rate }));
    } catch (err) {
      toast.error(t('save.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setRateLoading(false);
    }
  };

  // ── Hisob ──
  const calc = useMemo(() => (draft ? calcBatch(draft.rate, draft.extra, draft.rows) : null), [draft]);
  const cargoSplit = useMemo(() => {
    const split = { avia: 0, avto: 0 };
    draft?.rows.forEach((r) => (split[r.delivery] += Math.round(r.cargoCost || 0)));
    return split;
  }, [draft]);
  const filledCount = draft?.rows.filter((r) => !isBlank(r)).length ?? 0;

  const cargoOptions = useMemo(() => {
    const set = new Set<string>([...(data?.cargoNames ?? []), ...addedCargo]);
    draft?.rows.forEach((r) => r.cargoName && set.add(r.cargoName));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data?.cargoNames, addedCargo, draft]);

  const notFound = isError && error instanceof ApiError && error.status === 404;
  const readonly = !canEdit;

  const back = (
    <Link to="/batches" className="focusable mb-3 inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" />
      {t('back')}
    </Link>
  );

  if (notFound || (isError && !draft)) {
    return (
      <>
        {back}
        <Card>
          {notFound ? (
            <EmptyState icon={<Boxes className="h-6 w-6" />} title={t('notFound')} />
          ) : (
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          )}
        </Card>
      </>
    );
  }

  if (!draft || !calc) {
    return (
      <>
        {back}
        <Skeleton className="mb-5 h-[92px] w-full" />
        <div className="space-y-5">
          <Skeleton className="h-[88px] w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[118px] w-full" />
            ))}
          </div>
          <Card className="p-5">
            <SkeletonRows rows={6} />
          </Card>
        </div>
      </>
    );
  }

  const th = 'table-head border-b border-line px-3 py-3 whitespace-nowrap';

  return (
    <>
      {back}
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title={draft.name.trim() || lastName.current}
        description={t('subtitle')}
        badge={readonly ? <Badge tone="muted">{t('readonly')}</Badge> : undefined}
        actions={<SaveIndicator state={saveState} onRetry={() => void flush()} />}
      />

      <PlanGate feature="cost_price">
        <div className="space-y-5">
          {/* ── Partiya sozlamalari ── */}
          <Card className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block min-w-0">
              <span className="label">{t('f.name')}</span>
              <Input
                value={draft.name}
                maxLength={80}
                disabled={readonly}
                onChange={(e) => {
                  const name = e.target.value;
                  edit((d) => ({ ...d, name }));
                }}
              />
            </label>
            <div className="min-w-0">
              <span className="label">{t('f.rate')}</span>
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <NumCell
                    cell="rate"
                    value={draft.rate}
                    digits={2}
                    disabled={readonly}
                    onChange={(rate) => edit((d) => ({ ...d, rate }))}
                    className={cn('input pr-12', !(draft.rate > 0) && 'border-danger/60')}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                    {t('sum')}
                  </span>
                </div>
                {canEdit ? (
                  <Button
                    variant="outline"
                    className="shrink-0 px-3"
                    title={t('rate.cbuHint')}
                    loading={rateLoading}
                    icon={<Landmark className="h-4 w-4" />}
                    onClick={() => void applyCbuRate()}
                  >
                    {t('rate.cbu')}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="min-w-0">
              <span className="label">{t('f.extra')}</span>
              <div className="relative">
                <NumCell
                  cell="extra"
                  value={draft.extra}
                  integer
                  disabled={readonly}
                  onChange={(extra) => edit((d) => ({ ...d, extra }))}
                  className="input pr-12"
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                  {t('sum')}
                </span>
              </div>
              <span className="mt-1 block text-xs text-muted">{t('f.extraHint')}</span>
            </div>
          </Card>

          {/* ── Jamlar ── */}
          <StatGrid>
            <StatCard
              label={t('kpi.cny')}
              value={<span className="whitespace-nowrap">{f.num(calc.totals.priceCny, 2)} ¥</span>}
              icon={<CircleDollarSign className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label={t('kpi.goods')}
              value={<span className="whitespace-nowrap">{f.num(calc.totals.goodsUzs)}</span>}
              hint={t('kpi.goodsHint', { cny: f.num(calc.totals.priceCny, 2), rate: f.num(draft.rate, 2) })}
              icon={<Wallet className="h-5 w-5" />}
              tone="violet"
            />
            <StatCard
              label={t('kpi.cargo')}
              value={<span className="whitespace-nowrap">{f.num(calc.totals.cargoUzs)}</span>}
              hint={
                calc.totals.weightKg > 0
                  ? t('kpi.cargoHintKg', {
                      avia: f.num(cargoSplit.avia),
                      avto: f.num(cargoSplit.avto),
                      kg: kgText(calc.totals.weightKg),
                    })
                  : t('kpi.cargoHint', { avia: f.num(cargoSplit.avia), avto: f.num(cargoSplit.avto) })
              }
              icon={<Truck className="h-5 w-5" />}
              tone="warn"
            />
            <StatCard
              label={t('kpi.extra')}
              value={<span className="whitespace-nowrap">{f.num(calc.totals.extra)}</span>}
              hint={t('f.extraHint')}
              icon={<Receipt className="h-5 w-5" />}
              tone="danger"
            />
            <StatCard
              label={t('kpi.total')}
              value={<span className="whitespace-nowrap text-brand-ink">{f.num(calc.totals.total)}</span>}
              hint={
                calc.totals.qty > 0
                  ? t('kpi.totalHintQty', { n: filledCount, qty: f.num(calc.totals.qty) })
                  : t('kpi.totalHint', { n: filledCount })
              }
              icon={<Boxes className="h-5 w-5" />}
              tone="brand"
            />
          </StatGrid>

          {/* ── Jadval ── */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table ref={tableRef} className="w-full min-w-[1360px] border-collapse text-sm">
                <colgroup>
                  <col className="w-11" />
                  <col />
                  <col className="w-[112px]" />
                  <col className="w-[72px]" />
                  <col className="w-[100px]" />
                  <col className="w-[108px]" />
                  <col className="w-[136px]" />
                  <col className="w-[136px]" />
                  <col className="w-[80px]" />
                  <col className="w-[112px]" />
                  <col className="w-[124px]" />
                  <col className="w-[116px]" />
                  <col className="w-11" />
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(th, 'text-center')}>{t('th.no')}</th>
                    <th className={cn(th, 'text-left')}>{t('th.name')}</th>
                    <th className={cn(th, 'text-left')}>{t('th.track')}</th>
                    <th className={cn(th, 'text-right')}>{t('th.qty')}</th>
                    <th className={cn(th, 'text-right')} title={t('th.cnyHint')}>
                      {t('th.cny')}
                    </th>
                    <th className={cn(th, 'text-right')}>{t('th.uzs')}</th>
                    <th className={cn(th, 'text-left')}>{t('th.cargoName')}</th>
                    <th className={cn(th, 'text-center')}>{t('th.delivery')}</th>
                    <th className={cn(th, 'text-right')}>{t('th.kg')}</th>
                    <th className={cn(th, 'text-right')}>{t('th.cargo')}</th>
                    <th className={cn(th, 'text-right')}>{t('th.total')}</th>
                    <th className={cn(th, 'text-right')} title={t('th.unitHint')}>
                      {t('th.unit')}
                    </th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((r, i) => {
                    const res = calc.rows[i];
                    return (
                      <tr key={r.key} className="group border-b border-line/70">
                        <td className="tnum px-2 py-2.5 text-center text-muted">{i + 1}</td>
                        <td className={EDITABLE_TD}>
                          <input
                            data-cell={`${i}:name`}
                            value={r.name}
                            maxLength={200}
                            disabled={readonly}
                            placeholder={t('ph.name')}
                            title={r.name || undefined}
                            onChange={(e) => patchRow(r.key, { name: e.target.value })}
                            onKeyDown={onCellKey(i, 'name')}
                            className={cn(CELL_INPUT, 'font-semibold')}
                          />
                        </td>
                        <td className={EDITABLE_TD}>
                          <input
                            data-cell={`${i}:track`}
                            value={r.trackCode}
                            maxLength={64}
                            disabled={readonly}
                            placeholder={t('ph.track')}
                            onChange={(e) => patchRow(r.key, { trackCode: e.target.value })}
                            onKeyDown={onCellKey(i, 'track')}
                            className={cn(CELL_INPUT, 'tnum')}
                          />
                        </td>
                        <td className={EDITABLE_TD}>
                          <NumCell
                            cell={`${i}:qty`}
                            value={r.qty}
                            integer
                            disabled={readonly}
                            onChange={(qty) => patchRow(r.key, { qty })}
                            onKeyDown={onCellKey(i, 'qty')}
                          />
                        </td>
                        <td className={EDITABLE_TD}>
                          <NumCell
                            cell={`${i}:cny`}
                            value={r.priceCny}
                            digits={2}
                            disabled={readonly}
                            onChange={(priceCny) => patchRow(r.key, { priceCny })}
                            onKeyDown={onCellKey(i, 'cny')}
                          />
                        </td>
                        <td className="tnum border-l border-line/60 px-3 py-2.5 text-right text-ink-soft">
                          {res.priceUzs ? f.num(res.priceUzs) : '—'}
                        </td>
                        <td className={cn(EDITABLE_TD, 'relative')}>
                          <select
                            data-cell={`${i}:cargoName`}
                            value={r.cargoName}
                            disabled={readonly}
                            onChange={(e) => {
                              if (e.target.value === NEW_CARGO) setCargoFor(r.key);
                              else patchRow(r.key, { cargoName: e.target.value });
                            }}
                            onKeyDown={onCellKey(i, 'cargoName')}
                            className={cn(
                              CELL_INPUT,
                              'cursor-pointer appearance-none pr-8',
                              !r.cargoName && 'text-muted',
                            )}
                          >
                            <option value="">{t('cargo.pick')}</option>
                            {cargoOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            <option value={NEW_CARGO}>{t('cargo.new')}</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                        </td>
                        <td className={cn(EDITABLE_TD, 'px-2 text-center')}>
                          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label={t('th.delivery')}>
                            {DELIVERIES.map((d) => {
                              const on = r.delivery === d;
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  disabled={readonly}
                                  onClick={() => patchRow(r.key, { delivery: d })}
                                  className={cn(
                                    'focusable inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
                                    on
                                      ? d === 'avia'
                                        ? 'bg-info/15 text-info-ink'
                                        : 'bg-brand/15 text-brand-ink'
                                      : 'text-muted hover:text-ink',
                                  )}
                                >
                                  {d === 'avia' ? <Plane className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                                  {t(`delivery.${d}`)}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className={EDITABLE_TD}>
                          <NumCell
                            cell={`${i}:kg`}
                            value={r.weightKg}
                            format={kgText}
                            disabled={readonly}
                            onChange={(weightKg) => patchRow(r.key, { weightKg })}
                            onKeyDown={onCellKey(i, 'kg')}
                          />
                        </td>
                        <td className={EDITABLE_TD}>
                          <NumCell
                            cell={`${i}:cargo`}
                            value={r.cargoCost}
                            integer
                            disabled={readonly}
                            onChange={(cargoCost) => patchRow(r.key, { cargoCost })}
                            onKeyDown={onCellKey(i, 'cargo')}
                          />
                        </td>
                        <td className="tnum border-l border-line/60 px-3 py-2.5 text-right font-bold text-ink">
                          {res.total ? f.num(res.total) : '—'}
                        </td>
                        <td className="tnum border-l border-line/60 px-3 py-2.5 text-right font-semibold text-brand-ink">
                          {res.unitCost !== null && res.total ? f.num(res.unitCost) : '—'}
                        </td>
                        <td className="px-1 text-center">
                          {canEdit ? (
                            <button
                              type="button"
                              title={t('row.delete')}
                              aria-label={t('row.delete')}
                              onClick={() => removeRow(r.key)}
                              className="focusable rounded-md p-1.5 text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2/70 font-bold text-ink">
                    <td />
                    <td className="px-3 py-3" colSpan={2}>
                      {t('total')}
                    </td>
                    <td className="tnum px-3 py-3 text-right">{calc.totals.qty ? f.num(calc.totals.qty) : ''}</td>
                    <td className="tnum px-3 py-3 text-right">{f.num(calc.totals.priceCny, 2)}</td>
                    <td className="tnum px-3 py-3 text-right">{f.num(calc.totals.goodsUzs)}</td>
                    <td colSpan={2} />
                    <td className="tnum px-3 py-3 text-right">
                      {calc.totals.weightKg ? kgText(calc.totals.weightKg) : ''}
                    </td>
                    <td className="tnum px-3 py-3 text-right">{f.num(calc.totals.cargoUzs)}</td>
                    <td className="tnum px-3 py-3 text-right text-brand-ink">
                      {f.num(calc.totals.goodsUzs + calc.totals.cargoUzs)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
              {canEdit ? (
                <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} disabled={!canAdd}
                  onClick={() => {
                    pendingFocus.current = `${rowCount}:name`;
                    addRow();
                  }}
                >
                  {t('row.add')}
                </Button>
              ) : (
                <span />
              )}
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="h-3 w-3 shrink-0 rounded border border-line bg-warn/[0.12]" />
                {t('tip')}
              </p>
            </div>
          </Card>
        </div>
      </PlanGate>

      <NewCargoModal
        open={cargoFor !== null}
        onClose={() => setCargoFor(null)}
        onAdd={(name) => {
          setAddedCargo((list) => (list.includes(name) ? list : [...list, name]));
          if (cargoFor) patchRow(cargoFor, { cargoName: name });
          setCargoFor(null);
        }}
      />
    </>
  );
}
