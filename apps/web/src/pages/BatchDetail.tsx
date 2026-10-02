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
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  ChevronDown,
  Landmark,
  Loader2,
  NotebookPen,
  Plane,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import {
  BATCH_MAX_EXTRAS,
  BATCH_MAX_ITEMS,
  calcBatch,
  type BatchDelivery,
  type BatchDetail as BatchDetailData,
  type BatchExtraInput,
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
  toast,
} from '@/components/ui';
import { parseAmount } from '@/components/batches/shared';

interface Row extends BatchItemInput {
  /** Faqat React uchun — serverga yuborilmaydi */
  key: string;
}

interface ExtraRow extends BatchExtraInput {
  key: string;
}

interface Draft {
  id: string;
  name: string;
  rate: number;
  /** Tafsilot bo'lsa — uning yig'indisi, bo'lmasa qo'lda kiritilgan summa */
  extra: number;
  extras: ExtraRow[];
  rows: Row[];
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

/** O'chirilgan qatorni qaytarish mumkin bo'lgan vaqt */
const UNDO_MS = 5_000;

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

const isBlankExtra = (e: ExtraRow) => !e.name.trim() && !e.amount;
const sumExtras = (list: readonly ExtraRow[]) => Math.round(list.reduce((a, e) => a + (e.amount || 0), 0));

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
  return {
    id: d.id,
    name: d.name,
    rate: d.rate,
    extra: d.extra,
    extras: d.extras.map((e) => ({ key: newKey(), name: e.name, amount: e.amount })),
    rows: rows.length ? rows : [blankRow()],
  };
}

// ─────────────────────────── Jamlar ───────────────────────────

/** Tannarx tenglamasining bitta hadi */
function SumTerm({
  label,
  value,
  hint,
  dot,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  dot: string;
  strong?: boolean;
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
          strong ? 'font-title text-[26px] font-semibold text-brand-ink' : 'font-display text-[22px] font-bold text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/** Tenglama belgisi (+ =) — faqat keng ekranda, torda hadlar ustma-ust turadi */
function SumOp({ children }: { children: string }) {
  return (
    <span aria-hidden className="hidden pt-6 text-xl font-light text-muted lg:block">
      {children}
    </span>
  );
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

/**
 * Qo'shimcha xarajat tafsiloti: har bir to'lov izohi bilan alohida qator.
 * O'zgarishlar darhol qoralamaga yoziladi va jadval kabi o'zi saqlanadi.
 */
function ExtrasModal({
  open,
  onClose,
  extras,
  readonly,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  extras: ExtraRow[];
  readonly: boolean;
  onChange: (fn: (list: ExtraRow[]) => ExtraRow[]) => void;
}) {
  const t = useT('batches');
  const f = useFormat();
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);

  const focusCell = (cell: string) =>
    listRef.current?.querySelector<HTMLInputElement>(`[data-cell="${cell}"]`)?.focus();

  // Ochilganda birinchi bo'sh izohga (bo'lmasa birinchisiga) fokus
  useEffect(() => {
    if (!open || readonly) return;
    const timer = window.setTimeout(() => {
      const inputs = [...(listRef.current?.querySelectorAll<HTMLInputElement>('input[data-cell$=":name"]') ?? [])];
      (inputs.find((el) => !el.value) ?? inputs[0])?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open, readonly]);

  // Yangi qator chizilgach unga fokus
  useEffect(() => {
    if (!pendingFocus.current) return;
    focusCell(pendingFocus.current);
    pendingFocus.current = null;
  });

  const patch = (key: string, p: Partial<BatchExtraInput>) =>
    onChange((list) => list.map((e) => (e.key === key ? { ...e, ...p } : e)));
  const add = () => {
    const key = newKey();
    pendingFocus.current = `${key}:name`;
    onChange((list) => [...list, { key, name: '', amount: 0 }]);
  };
  const remove = (key: string) => onChange((list) => list.filter((e) => e.key !== key));
  const canAdd = !readonly && extras.length < BATCH_MAX_EXTRAS;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('extras.title')}
      description={t('extras.hint')}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">
            {t('extras.total')}:{' '}
            <b className="tnum text-base text-ink">
              {f.num(sumExtras(extras))} {t('sum')}
            </b>
          </span>
          <Button onClick={onClose}>{t('extras.done')}</Button>
        </div>
      }
    >
      <div ref={listRef} className="space-y-2">
        {extras.map((e, i) => (
          <div key={e.key} className="flex items-center gap-2">
            <span className="tnum w-5 shrink-0 text-right text-xs text-muted">{i + 1}</span>
            <Input
              data-cell={`${e.key}:name`}
              value={e.name}
              maxLength={120}
              disabled={readonly}
              placeholder={t('extras.namePh')}
              onChange={(ev) => patch(e.key, { name: ev.target.value })}
              onKeyDown={(ev) => {
                if (ev.key !== 'Enter') return;
                ev.preventDefault();
                focusCell(`${e.key}:amount`);
              }}
              className="min-w-0 flex-1"
            />
            <div className="relative w-36 shrink-0 sm:w-44">
              <NumCell
                cell={`${e.key}:amount`}
                value={e.amount}
                integer
                disabled={readonly}
                onChange={(amount) => patch(e.key, { amount })}
                onKeyDown={(ev) => {
                  if (ev.key !== 'Enter') return;
                  ev.preventDefault();
                  const next = extras[i + 1];
                  if (next) focusCell(`${next.key}:name`);
                  else if (canAdd) add();
                }}
                className="input pr-12"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                {t('sum')}
              </span>
            </div>
            {readonly ? null : (
              <button
                type="button"
                title={t('extras.remove')}
                aria-label={t('extras.remove')}
                onClick={() => remove(e.key)}
                className="focusable shrink-0 rounded-md p-1.5 text-muted hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {canAdd ? (
          <div className="pl-7 pt-1">
            <Button variant="soft" size="sm" icon={<Plus className="h-4 w-4" />} onClick={add}>
              {t('extras.add')}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
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

function SaveIndicator({
  state,
  onRetry,
  onReload,
}: {
  state: SaveState;
  onRetry: () => void;
  onReload: () => void;
}) {
  const t = useT('batches');
  if (state === 'idle') return null;
  if (state === 'conflict')
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-danger-ink">
        <AlertTriangle className="h-4 w-4" />
        {t('save.conflict')}
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onReload}>
          {t('save.reload')}
        </Button>
      </span>
    );
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
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [rateLoading, setRateLoading] = useState(false);

  // Serverdan kelgan partiya faqat bir marta formaga o'tadi — keyingi
  // saqlash javoblari yozayotgan foydalanuvchining kursorini buzmasligi kerak
  useEffect(() => {
    if (data && !draft && !isFetching) {
      serverVersion.current = data.updatedAt;
      setDraft(toDraft(data));
    }
  }, [data, draft, isFetching]);

  // ── Avtomatik saqlash ──
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const version = useRef(0);
  const savedVersion = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastName = useRef('');
  /**
   * Sahifa ko'rgan server versiyasi. Saqlashda yuboriladi: partiya boshqa
   * oynada o'zgargan bo'lsa server rad etadi — eski holat yangisini
   * ustidan yozib, qatorlarni o'chirib yubormaydi.
   */
  const serverVersion = useRef<string | null>(null);
  /** Konflikt bo'ldi — sahifa yangilanmaguncha qayta saqlanmaydi */
  const conflicted = useRef(false);
  if (data && !lastName.current) lastName.current = data.name;

  const flush = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const d = draftRef.current;
      const v = version.current;
      if (!d || v === savedVersion.current || !(d.rate > 0) || conflicted.current) return;
      setSaveState('saving');
      try {
        const name = d.name.trim() || lastName.current;
        const saved = await api.put<BatchDetailData>(`/batches/${d.id}`, {
          name,
          rate: d.rate,
          extra: d.extra,
          extras: d.extras.filter((e) => !isBlankExtra(e)).map((e) => ({ name: e.name.trim(), amount: e.amount })),
          items: d.rows.filter((r) => !isBlank(r)).map(({ key: _key, ...item }) => item),
          expectedUpdatedAt: serverVersion.current ?? undefined,
        });
        serverVersion.current = saved.updatedAt;
        lastName.current = saved.name;
        savedVersion.current = v;
        qc.setQueryData(['batch', d.id], saved);
        void qc.invalidateQueries({ queryKey: ['batches'] });
        setSaveState(version.current === v ? 'saved' : 'pending');
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          conflicted.current = true;
          setSaveState('conflict');
          toast.error(t('save.conflict'), err.message);
          return;
        }
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
      // Konfliktda saqlab bo'lmaydi — "Yangilash" bosilganda ogohlantirish chiqmasin
      if (version.current !== savedVersion.current && !conflicted.current) e.preventDefault();
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

  /** Tafsilot o'zgarsa jami xarajat doim uning yig'indisi bo'ladi */
  const setExtras = (fn: (list: ExtraRow[]) => ExtraRow[]) =>
    edit((d) => {
      const extras = fn(d.extras);
      return { ...d, extras, extra: sumExtras(extras) };
    });

  const openExtras = () => {
    const d = draftRef.current;
    // Tafsilot hali yo'q — oldin yozilgan summa birinchi qatorga o'tadi, izohini yozish qoladi
    if (d && canEdit && d.extras.length === 0)
      setExtras(() => [{ key: newKey(), name: '', amount: d.extra }]);
    setExtrasOpen(true);
  };

  const closeExtras = () => {
    setExtrasOpen(false);
    if (draftRef.current?.extras.some(isBlankExtra))
      edit((d) => ({ ...d, extras: d.extras.filter((e) => !isBlankExtra(e)) }));
  };

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
  /*
   * O'chirilgan qator 5 soniya davomida qaytariladi. Avtomatik saqlash
   * o'chirishni darhol yozadi, "Qaytarish" esa qatorni o'sha joyiga qo'yib
   * yana saqlaydi — sahifadan chiqib ketilsa ham holat to'g'ri qoladi.
   */
  const [undo, setUndo] = useState<{ row: Row; index: number; stamp: number } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const removeRow = (key: string) => {
    const rows = draftRef.current?.rows ?? [];
    const index = rows.findIndex((r) => r.key === key);
    const removed = index >= 0 ? rows[index] : undefined;
    edit((d) => {
      const rest = d.rows.filter((r) => r.key !== key);
      return { ...d, rows: rest.length ? rest : [blankRow(d.rows[0])] };
    });
    // Bo'sh qatorni qaytarishning ma'nosi yo'q
    if (removed && !isBlank(removed)) setUndo({ row: removed, index, stamp: Date.now() });
  };

  const undoRemove = () => {
    if (!undo) return;
    const { row, index } = undo;
    edit((d) => {
      // Oxirgi qator o'chirilganda o'rniga qo'yilgan bo'sh qator olib tashlanadi
      const rows = d.rows.length === 1 && isBlank(d.rows[0]) ? [] : [...d.rows];
      rows.splice(Math.min(index, rows.length), 0, row);
      return { ...d, rows };
    });
    setUndo(null);
  };

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
  const filledExtras = draft?.extras.filter((e) => !isBlankExtra(e)) ?? [];

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
        actions={
          <SaveIndicator state={saveState} onRetry={() => void flush()} onReload={() => window.location.reload()} />
        }
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
                {filledExtras.length ? (
                  // Tafsilot bor — summa undan hisoblanadi, bosilsa tafsilot ochiladi
                  <button
                    type="button"
                    title={t('extras.edit')}
                    onClick={openExtras}
                    className="input tnum pr-12 text-right"
                  >
                    {f.num(draft.extra)}
                  </button>
                ) : (
                  <NumCell
                    cell="extra"
                    value={draft.extra}
                    integer
                    disabled={readonly}
                    onChange={(extra) => edit((d) => ({ ...d, extra }))}
                    className="input pr-12"
                  />
                )}
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                  {t('sum')}
                </span>
              </div>
              {filledExtras.length || canEdit ? (
                <button
                  type="button"
                  onClick={openExtras}
                  className="focusable mt-1 flex max-w-full items-center gap-1.5 rounded text-left text-xs font-medium text-brand-ink hover:underline"
                >
                  <NotebookPen className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {filledExtras.length
                      ? t('extras.summary', {
                          n: filledExtras.length,
                          names: filledExtras.map((e) => e.name.trim() || t('extras.noName')).join(', '),
                        })
                      : t('extras.open')}
                  </span>
                </button>
              ) : (
                <span className="mt-1 block text-xs text-muted">{t('f.extraHint')}</span>
              )}
            </div>
          </Card>

          {/*
            ── Jamlar: tannarx qanday yig'ildi ──
            Ilgari beshta alohida kartochka edi va o'rta ekranda uch qatorga
            tushib, jadvalni pastga surardi. Partiyaning mohiyati — tenglama:
            tovarlar + cargo + qo'shimcha = umumiy. Shu bir qatorda.
          */}
          <Card className="p-5 sm:p-6">
            <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)] lg:items-start">
              <SumTerm
                dot="bg-info"
                label={t('kpi.goods')}
                value={f.num(calc.totals.goodsUzs)}
                hint={t('kpi.goodsHint', { cny: f.num(calc.totals.priceCny, 2), rate: f.num(draft.rate, 2) })}
              />
              <SumOp>+</SumOp>
              <SumTerm
                dot="bg-warn"
                label={t('kpi.cargo')}
                value={f.num(calc.totals.cargoUzs)}
                hint={
                  calc.totals.weightKg > 0
                    ? t('kpi.cargoHintKg', {
                        avia: f.num(cargoSplit.avia),
                        avto: f.num(cargoSplit.avto),
                        kg: kgText(calc.totals.weightKg),
                      })
                    : t('kpi.cargoHint', { avia: f.num(cargoSplit.avia), avto: f.num(cargoSplit.avto) })
                }
              />
              <SumOp>+</SumOp>
              <SumTerm
                dot="bg-[rgb(var(--c-slate))]"
                label={t('kpi.extra')}
                value={f.num(calc.totals.extra)}
                hint={
                  calc.totals.extra > 0
                    ? calc.totals.weightKg > 0
                      ? t('kpi.extraPerKg', { sum: f.num(calc.totals.extraPerKg) })
                      : t('kpi.extraNoKg')
                    : t('f.extraHint')
                }
              />
              <SumOp>=</SumOp>
              <SumTerm
                strong
                dot="bg-brand"
                label={t('kpi.total')}
                value={f.num(calc.totals.total)}
                hint={
                  calc.totals.qty > 0
                    ? t('kpi.totalHintQty', { n: filledCount, qty: f.num(calc.totals.qty) })
                    : t('kpi.totalHint', { n: filledCount })
                }
              />
            </div>

            {calc.totals.total > 0 ? (
              <div aria-hidden className="mt-6 flex h-2.5 w-full gap-1">
                {(
                  [
                    [calc.totals.goodsUzs, 'bg-info'],
                    [calc.totals.cargoUzs, 'bg-warn'],
                    [calc.totals.extra, 'bg-[rgb(var(--c-slate))]'],
                  ] as const
                )
                  .filter(([v]) => v > 0)
                  .map(([v, fill], i) => (
                    <div
                      key={fill}
                      className={cn('h-full min-w-[6px] origin-left animate-grow-x rounded-full', fill)}
                      style={{ flex: `${v / calc.totals.total} 1 0%`, animationDelay: `${100 + i * 120}ms` }}
                    />
                  ))}
              </div>
            ) : null}
          </Card>

          {/* ── Jadval ── */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table ref={tableRef} className="w-full min-w-[1480px] border-collapse text-sm">
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
                  <col className="w-[128px]" />
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
                    <th className={cn(th, 'text-right')} title={t('th.unitFullHint')}>
                      {t('th.unitFull')}
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
                        <td className="tnum border-l border-line/60 px-3 py-2.5 text-right font-semibold text-ink">
                          {res.unitCost !== null && res.total ? f.num(res.unitCost) : '—'}
                        </td>
                        <td
                          className="tnum border-l border-line/60 bg-brand/5 px-3 py-2.5 text-right font-bold text-brand-ink"
                          title={
                            !res.total || !r.qty
                              ? undefined
                              : res.unitCostFull === null
                                ? t('row.noKg')
                                : calc.totals.extra > 0
                                  ? t('row.extraShare', { kg: kgText(r.weightKg), sum: f.num(res.extraShare) })
                                  : undefined
                          }
                        >
                          {!res.total || !r.qty ? (
                            '—'
                          ) : res.unitCostFull === null ? (
                            <span className="text-xs font-medium text-warn-ink">{t('row.noKgShort')}</span>
                          ) : (
                            f.num(res.unitCostFull)
                          )}
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
                    <td colSpan={3} />
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

      {/* Tashqi div joylashuv uchun: framer-motion transform'ni o'zi yozadi va -translate-x ni bosib ketardi */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <AnimatePresence>
          {undo ? (
            <motion.div
              key={undo.stamp}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              role="status"
              className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <Trash2 className="h-4 w-4 shrink-0 text-muted" />
                <p className="min-w-0 flex-1 truncate text-sm text-ink">
                  {t('undo.removed', { name: undo.row.name.trim() || t('ph.name') })}
                </p>
                <Button size="sm" variant="soft" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={undoRemove}>
                  {t('undo.restore')}
                </Button>
              </div>
              <motion.div
                className="h-0.5 bg-brand"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: UNDO_MS / 1000, ease: 'linear' }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <ExtrasModal
        open={extrasOpen}
        onClose={closeExtras}
        extras={draft.extras}
        readonly={readonly}
        onChange={setExtras}
      />

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
