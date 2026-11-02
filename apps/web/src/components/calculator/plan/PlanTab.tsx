import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LOGISTICS_FEE,
  UNIT_PLAN_MAX_ROWS,
  billableLiters,
  calcUnitPlan,
  logisticsFee,
  type UnitPlan,
  type UnitPlanRates,
  type UnitPlanRow,
  type UnitPlanRowResult,
} from '@savdoiq/shared';
import { AlertTriangle, Check, Info, Loader2, Plus, RefreshCw, Ruler, Trash2, Undo2, X } from '@/components/icons';
import { parseAmount } from '@/components/batches/shared';
import { Amount, Badge, Button, Card, ErrorState, Modal, Skeleton, SkeletonRows, toast } from '@/components/ui';
import { api, ApiError, getCompanyId } from '@/lib/api';
import { useFormat, useLang, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { CategoryPicker, useCommissionCategories, usePctText } from '../CategoryPicker';
import { categoryName, findCategory, type CommissionCategory } from '../commissions';
import { litrVolume } from '../litrovka';
import './texts';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

interface Draft {
  rates: UnitPlanRates;
  rows: UnitPlanRow[];
}

const SAVE_DELAY_MS = 700;
/** O'chirilgan qatorni qaytarish mumkin bo'lgan vaqt */
const UNDO_MS = 5_000;
/** Shu vaqt ichidagi ikkinchi "o'chirish" — ikki marta bosish */
const DOUBLE_CLICK_MS = 500;
/** unitPlanSaveSchema chegaralari: undan katta raqam butun saqlashni 400 bilan to'xtatardi */
const MAX_MONEY = 100_000_000_000;
const MAX_UNITS = 100_000_000;
const MAX_LITERS = 100_000;
const MAX_PCT = 100;

let keySeq = 0;
const newKey = () => `r${Date.now().toString(36)}${(keySeq++).toString(36)}`;

const blankRow = (): UnitPlanRow => ({
  id: newKey(),
  name: '',
  categoryId: null,
  categoryName: null,
  commissionPct: null,
  liters: null,
  purchasePrice: null,
  packaging: null,
  price: null,
  monthlyUnits: null,
  goalProfit: null,
});

/** Hech narsa yozilmagan qator saqlanmaydi */
const isBlank = (r: UnitPlanRow) =>
  !r.name.trim() &&
  !r.categoryId &&
  r.commissionPct === null &&
  r.liters === null &&
  r.purchasePrice === null &&
  r.packaging === null &&
  r.price === null &&
  r.monthlyUnits === null &&
  r.goalProfit === null;

const toDraft = (plan: UnitPlan): Draft => ({
  rates: plan.rates,
  rows: plan.rows.length ? plan.rows : [blankRow()],
});

/** Serverga ketadigan jadval. Kalitlar tartibi qat'iy: "o'zgardimi?" JSON bilan solishtiriladi */
const planBody = (d: Draft) => ({
  rates: { taxPct: d.rates.taxPct, withdrawPct: d.rates.withdrawPct, adsPct: d.rates.adsPct },
  rows: d.rows
    .filter((r) => !isBlank(r))
    .map((r) => ({
      id: r.id,
      name: r.name.trim(),
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      commissionPct: r.commissionPct,
      liters: r.liters,
      purchasePrice: r.purchasePrice,
      packaging: r.packaging,
      price: r.price,
      monthlyUnits: r.monthlyUnits,
      goalProfit: r.goalProfit,
    })),
});

/**
 * Oxirgi saqlash. Bo'limdan chiqilganda o'zgarish fonda saqlanadi; darhol qaytilsa
 * GET undan oldin javob berib, eski jadval va eski versiya ko'rinardi — keyingi
 * saqlash esa soxta "boshqa joyda o'zgargan" olardi. Shu sabab GET shuni kutadi.
 */
let lastSave: Promise<void> = Promise.resolve();

/** Sonning kerakli kasri: "12", "2,5", "0,35" — "2,50" emas */
function flexDigits(v: number, max: number): number {
  for (let d = 0; d < max; d += 1) {
    if (Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-6) return d;
  }
  return max;
}

/** Bir kasrga yaxlitlanganda 0: "-0,0%" chiqmasin va qizil bo'lmasin (Excel ham 0,0%) */
const nearZero = (v: number) => Math.round(Math.abs(v) * 10) === 0;

// ─────────────────────────── Kataklar ───────────────────────────

const CELL_BASE =
  'h-full w-full min-w-0 bg-transparent px-3 py-2.5 text-sm text-ink outline-none ' +
  'focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-brand/40 disabled:cursor-default';
const CELL_INPUT = `${CELL_BASE} placeholder:text-muted/50`;
/** Stavkasi yo'q katak: "qo'lda" yozuvi xira bo'lsa, sariq fonda o'qilmasdi */
const CELL_INPUT_WARN = `${CELL_BASE} placeholder:font-medium placeholder:text-warn-ink`;
/** Litr katagida yonida yaxlitlangan litr va chizg'ich turadi */
const CELL_INPUT_TIGHT =
  'h-full w-full min-w-0 flex-1 bg-transparent py-2.5 pl-2 pr-1 text-sm text-ink outline-none placeholder:text-muted/50 ' +
  'focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-brand/40 disabled:cursor-default';

/*
 * Chegaralar qatorda emas, katakda: jadval `border-separate` — yopishqoq sarlavha va
 * ustunlarda `border-collapse` chiziqlari aylantirganda yo'qolib qoladi. Har ustunlar
 * guruhining birinchi katagida chap chiziq quyuqroq, guruhlar ko'zga tashlansin.
 */
const EDITABLE_TD = 'border-b border-l border-b-line/70 border-l-line/60 bg-warn/[0.06] p-0';
const EDITABLE_TD_FIRST = 'border-b border-l border-b-line/70 border-l-line-strong bg-warn/[0.06] p-0';
/** Kategoriyada stavka yo'q: sotuvchi komissiyani o'zi yozishi kerak */
const EDITABLE_TD_WARN = 'border-b border-l border-b-line/70 border-l-line/60 bg-warn/[0.22] p-0';
// Matn rangi ATAYLAB bu yerda emas: `cn` sinflarni birlashtirmaydi, ikkita text-* dan qaysi biri yutishi noma'lum
const AUTO_TD = 'tnum whitespace-nowrap border-b border-l border-b-line/70 border-l-line/60 px-3 py-2.5 text-right';
const AUTO_TD_FIRST = 'tnum whitespace-nowrap border-b border-l border-b-line/70 border-l-line-strong px-3 py-2.5 text-right';
const RESULT_TD = 'tnum whitespace-nowrap border-b border-l border-b-line/70 border-l-line/60 bg-brand/5 px-3 py-2.5 text-right font-semibold';
const RESULT_TD_FIRST =
  'tnum whitespace-nowrap border-b border-l border-b-line/70 border-l-line-strong bg-brand/5 px-3 py-2.5 text-right text-[15px] font-bold';

/** Yopishqoq katak shaffof bo'lolmaydi: ostidan aylanayotgan ustunlar ko'rinardi. Sariq tus — fon ustida gradient */
const STICKY_NAME_TD =
  'sticky left-11 z-10 border-b border-l border-b-line/70 border-l-line/60 p-0 shadow-[2px_0_0_rgb(var(--c-border))] ' +
  '[background:linear-gradient(rgb(var(--c-warn)/0.06),rgb(var(--c-warn)/0.06)),rgb(var(--c-surface))]';

/**
 * Bo'sh bo'lishi mumkin bo'lgan raqam katagi. Partiya jadvalidagi NumCell dan
 * farqi: bu yerda 0 va "kiritilmagan" har xil — sotib olish narxi 0 bilan hisob
 * chiqadi, bo'shi bilan chiqmaydi (calcUnitPlan).
 */
function PlanCell({
  value,
  onChange,
  integer = false,
  format,
  max,
  disabled,
  cell,
  onKeyDown,
  placeholder = '0',
  title,
  label,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
  format?: (v: number) => string;
  max?: number;
  disabled?: boolean;
  cell?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  placeholder?: string;
  title?: string;
  /** Ekran o'quvchi uchun: katakning o'z yorlig'i yo'q, nomi ustun sarlavhasida */
  label?: string;
  className?: string;
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

  const applyText = (raw: string) => {
    // Excel'dan bir necha katak joylansa birinchisi olinadi: raqamlar qo'shilib ketib, ulkan summa chiqardi
    const first = raw.split(/[\t\r\n]/).find((part) => part.trim()) ?? '';
    // Harf kiritilmaydi — tasodifan yozilgan matn narxni jimgina o'zgartirmasin
    const clean = first.replace(/[^\d\s.,]/g, '');
    setText(clean);
    if (!/\d/.test(clean)) {
      onChange(null);
      return;
    }
    const n = parseAmount(clean, integer);
    // Tushunib bo'lmaydigan matnda oxirgi to'g'ri qiymat saqlanadi
    if (Number.isFinite(n)) onChange(max === undefined ? n : Math.min(n, max));
  };

  return (
    <input
      ref={ref}
      data-cell={cell}
      inputMode={integer ? 'numeric' : 'decimal'}
      disabled={disabled}
      title={title}
      aria-label={label}
      value={text ?? (value === null ? '' : format ? format(value) : f.num(value))}
      placeholder={placeholder}
      onFocus={() => {
        selectAll.current = true;
        setText(value === null ? '' : String(value));
      }}
      onBlur={() => setText(null)}
      onChange={(e) => applyText(e.target.value)}
      onPaste={(e) => {
        // Brauzer qator oxirini bo'shliqqa almashtiradi, shuning uchun xom matn shu yerda o'qiladi
        const raw = e.clipboardData.getData('text');
        if (!/[\t\r\n]/.test(raw)) return;
        e.preventDefault();
        applyText(raw);
      }}
      onKeyDown={onKeyDown}
      className={cn(className ?? CELL_INPUT, 'tnum text-right')}
    />
  );
}

/** Jadval tepasidagi yig'indi: partiya sahifasidagi bilan bir xil ko'rinish */
function SumTerm({
  label,
  value,
  hint,
  dot,
  strong,
  danger,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  dot: string;
  strong?: boolean;
  danger?: boolean;
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
          strong ? 'font-title text-[26px] font-semibold' : 'font-display text-[22px] font-bold',
          danger ? 'text-danger' : strong ? 'text-brand-ink' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function SaveIndicator({
  state,
  idle,
  onRetry,
  onReload,
}: {
  state: SaveState;
  /** Hali o'zgarish yo'q paytdagi yozuv: joy oldindan band, birinchi harfda jadval pastga sakramaydi */
  idle?: string;
  onRetry: () => void;
  onReload: () => void;
}) {
  const t = useT('unitPlan');
  if (state === 'idle') return idle ? <span className="text-sm text-muted">{idle}</span> : null;
  if (state === 'conflict')
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-danger-ink">
        <AlertTriangle className="h-4 w-4" />
        {t('save.conflict')}
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onReload}>
          {t('save.reload')}
        </Button>
      </span>
    );
  if (state === 'error')
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-danger-ink">
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

/** Foiz maydoni stavkalar kartochkasida */
function RateField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const f = useFormat();
  return (
    <label className="block min-w-0" title={hint}>
      <span className="label leading-tight">{label}</span>
      <span className="relative block">
        <PlanCell
          value={value}
          max={MAX_PCT}
          disabled={disabled}
          format={(v) => f.num(v, flexDigits(v, 2))}
          onChange={(v) => onChange(v ?? 0)}
          className="input pl-2 pr-6 font-semibold disabled:opacity-70 sm:pl-3 sm:pr-8"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted sm:right-3">%</span>
      </span>
    </label>
  );
}

// ─────────────────────────── O'lchamdan litr ───────────────────────────

function DimsModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (liters: number) => void }) {
  const t = useT('unitPlan');
  const tc = useT('common');
  const f = useFormat();
  const [length, setLength] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLength(null);
    setWidth(null);
    setHeight(null);
  }, [open]);

  // Litrovka hisobi millimetrda (litrovka.ts): sm → mm
  const volume = litrVolume({
    mode: 'mm',
    length: (length ?? 0) * 10,
    width: (width ?? 0) * 10,
    height: (height ?? 0) * 10,
    liters: 0,
    units: 0,
    turnover: 0,
    kind: 'standard',
  });
  /*
   * Yaxlitlash faqat ikkilik hisob shovqinini oladi: 2,0002 l ni Uzum 3 l deb hisoblaydi,
   * 2 ga yaxlitlansa logistika kam chiqardi. Juda kichik hajm esa 0 ga tushib,
   * "kiritilmagan" bo'lib qolmasin.
   */
  const liters = volume > 0 ? Math.max(0.000001, Math.round(volume * 1e6) / 1e6) : 0;
  // Sm o'rniga mm yozilsa shunday chiqadi; server qabul qilmaydi va butun jadval saqlanmay qolardi
  const tooBig = liters > MAX_LITERS;
  const fee = logisticsFee(liters);
  const unit = t('unit.l');

  const apply = () => {
    if (liters > 0 && !tooBig) onApply(liters);
  };
  const onEnter = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    apply();
  };
  const dims: { key: string; label: string; value: number | null; set: (v: number | null) => void }[] = [
    { key: 'length', label: t('dims.length'), value: length, set: setLength },
    { key: 'width', label: t('dims.width'), value: width, set: setWidth },
    { key: 'height', label: t('dims.height'), value: height, set: setHeight },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dims.title')}
      description={t('dims.hint')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tc('btn.cancel')}
          </Button>
          <Button disabled={!(liters > 0) || tooBig} onClick={apply}>
            {t('dims.apply')}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2.5">
        {dims.map((d) => (
          <label key={d.key} className="block min-w-0">
            <span className="label">{d.label}</span>
            <span className="relative block">
              <PlanCell
                value={d.value}
                max={100_000}
                format={(v) => f.num(v, flexDigits(v, 1))}
                onChange={d.set}
                onKeyDown={onEnter}
                className="input pr-8 font-semibold"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
                {t('dims.unit')}
              </span>
            </span>
          </label>
        ))}
      </div>
      {tooBig ? (
        <p className="mt-3 text-xs font-medium text-danger-ink">{t('dims.tooBig', { max: f.num(MAX_LITERS) })}</p>
      ) : liters > 0 ? (
        <dl className="well mt-4 divide-y divide-line/70">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted">{t('dims.volume')}</dt>
            <dd className="tnum font-semibold text-ink">
              {f.num(liters, flexDigits(liters, 4))} {unit}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="font-medium text-ink-soft">{t('dims.billable')}</dt>
            <dd className="tnum font-display text-base font-bold text-ink">
              {f.num(billableLiters(liters))} {unit}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted">{t('dims.logistics')}</dt>
            <dd className="tnum font-semibold text-ink">{f.money(fee ?? 0)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted">{t('dims.empty')}</p>
      )}
    </Modal>
  );
}

// ─────────────────────────── Qator ───────────────────────────

const sameResult = (a: UnitPlanRowResult, b: UnitPlanRowResult) =>
  (Object.keys(a) as (keyof UnitPlanRowResult)[]).every((k) => a[k] === b[k]);

interface RowProps {
  row: UnitPlanRow;
  index: number;
  res: UnitPlanRowResult;
  /** Tanlangan kategoriyaning jadvaldagi stavkasi; undefined — noma'lum (kategoriya yo'q yoki bo'lak yuklanmagan) */
  tableRate: number | null | undefined;
  canEdit: boolean;
  onPatch: (id: string, patch: Partial<UnitPlanRow>) => void;
  onPick: (id: string, category: CommissionCategory | null) => void;
  onRemove: (id: string) => void;
  onKey: (rowIdx: number, col: string, e: KeyboardEvent<HTMLElement>) => void;
  onOpenDims: (id: string) => void;
}

/*
 * Bitta katak o'zgarsa boshqa qatorlar qayta chizilmaydi: 200 qatorda har birida
 * 24 ta katak va tanlagich bor, har harfda hammasi chizilsa yozish sekinlashardi.
 * `res` har hisobda yangi obyekt, shuning uchun qiymatlari solishtiriladi.
 */
const PlanRowView = memo(
  function PlanRowView({ row: r, index: i, res, tableRate, canEdit, onPatch, onPick, onRemove, onKey, onOpenDims }: RowProps) {
    const t = useT('unitPlan');
    const f = useFormat();
    const pctText = usePctText();
    const readonly = !canEdit;

    const money = (v: number | null) => (v === null ? '—' : f.num(v));
    const pct = (v: number | null) => (v === null ? '—' : f.pct(nearZero(v) ? 0 : v));
    const keyFor = (col: string) => (e: KeyboardEvent<HTMLElement>) => onKey(i, col, e);

    const billableDiffers = res.billableLiters !== null && r.liters !== null && res.billableLiters !== r.liters;
    const noRate = Boolean(r.categoryId) && r.commissionPct === null;
    const overridden = tableRate !== undefined && tableRate !== null && r.commissionPct !== tableRate;
    const pctTitle = !r.categoryId
      ? t('pct.none')
      : overridden
        ? t('pct.changed', { pct: pctText(tableRate) })
        : tableRate === null
          ? r.commissionPct === null
            ? t('pct.noRate')
            : t('pct.noRateTyped')
          : typeof tableRate === 'number'
            ? t('pct.table', { pct: pctText(tableRate) })
            : r.commissionPct === null
              ? t('pct.noRate')
              : t('pct.tableUnknown');

    const profitTone = res.profit === null || res.profit === 0 ? 'text-ink' : res.profit > 0 ? 'text-brand-ink' : 'text-danger';
    const rateTone = (v: number | null) => (v !== null && v < 0 && !nearZero(v) ? 'text-danger' : 'text-ink');

    return (
      <tr className="group">
        <td className="tnum sticky left-0 z-10 border-b border-b-line/70 bg-surface px-1 py-2.5 text-center text-muted">{i + 1}</td>
        <td className={STICKY_NAME_TD}>
          <input
            data-cell={`${i}:name`}
            value={r.name}
            maxLength={200}
            disabled={readonly}
            placeholder={t('ph.name')}
            title={r.name || undefined}
            aria-label={t('th.name')}
            onChange={(e) => onPatch(r.id, { name: e.target.value })}
            onKeyDown={keyFor('name')}
            className={cn(CELL_INPUT, 'truncate font-semibold')}
          />
        </td>
        <td className={EDITABLE_TD}>
          <CategoryPicker
            compact
            cell={`${i}:category`}
            value={r.categoryId || r.categoryName ? { id: r.categoryId, name: r.categoryName } : null}
            disabled={readonly}
            placeholder={t('ph.category')}
            ariaLabel={t('th.category')}
            onSelect={(cat) => onPick(r.id, cat)}
            onKeyDown={keyFor('category')}
          />
        </td>
        <td className={EDITABLE_TD}>
          <div className="flex h-full items-center">
            <PlanCell
              cell={`${i}:liters`}
              label={t('th.liters')}
              value={r.liters}
              max={MAX_LITERS}
              format={(v) => f.num(v, flexDigits(v, 4))}
              disabled={readonly}
              onChange={(liters) => onPatch(r.id, { liters })}
              onKeyDown={keyFor('liters')}
              className={CELL_INPUT_TIGHT}
            />
            {billableDiffers ? (
              <span
                className="tnum shrink-0 whitespace-nowrap text-2xs text-muted"
                title={t('liters.billable', { b: f.num(res.billableLiters ?? 0), v: f.num(r.liters ?? 0, flexDigits(r.liters ?? 0, 4)) })}
              >
                → {f.num(res.billableLiters ?? 0)} {t('unit.l')}
              </span>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                title={t('dims.open')}
                aria-label={t('dims.open')}
                onClick={() => onOpenDims(r.id)}
                className="focusable mx-0.5 shrink-0 rounded-md p-1 text-muted hover:text-brand-ink"
              >
                <Ruler className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </td>
        <td className={cn(noRate ? EDITABLE_TD_WARN : EDITABLE_TD, 'relative')}>
          <PlanCell
            cell={`${i}:commissionPct`}
            label={t('th.commissionPct')}
            value={r.commissionPct}
            max={MAX_PCT}
            format={(v) => f.num(v, flexDigits(v, 2))}
            disabled={readonly}
            placeholder={noRate ? t('ph.byHand') : '0'}
            title={pctTitle}
            onChange={(commissionPct) => onPatch(r.id, { commissionPct })}
            onKeyDown={keyFor('commissionPct')}
            className={noRate ? CELL_INPUT_WARN : undefined}
          />
          {overridden ? (
            <span aria-hidden className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warn" />
          ) : null}
        </td>

        <td className={EDITABLE_TD_FIRST}>
          <PlanCell
            cell={`${i}:purchase`}
            label={t('th.purchase')}
            value={r.purchasePrice}
            integer
            max={MAX_MONEY}
            disabled={readonly}
            onChange={(purchasePrice) => onPatch(r.id, { purchasePrice })}
            onKeyDown={keyFor('purchase')}
          />
        </td>
        <td className={EDITABLE_TD}>
          <PlanCell
            cell={`${i}:packaging`}
            label={t('th.packaging')}
            value={r.packaging}
            integer
            max={MAX_MONEY}
            disabled={readonly}
            onChange={(packaging) => onPatch(r.id, { packaging })}
            onKeyDown={keyFor('packaging')}
          />
        </td>
        <td className={EDITABLE_TD}>
          <PlanCell
            cell={`${i}:price`}
            label={t('th.price')}
            value={r.price}
            integer
            max={MAX_MONEY}
            disabled={readonly}
            onChange={(price) => onPatch(r.id, { price })}
            onKeyDown={keyFor('price')}
          />
        </td>

        <td className={cn(AUTO_TD_FIRST, 'text-ink-soft')}>{money(res.commission)}</td>
        <td className={cn(AUTO_TD, 'text-ink-soft')}>{money(res.logistics)}</td>
        <td className={cn(AUTO_TD, 'text-ink-soft')}>{money(res.tax)}</td>
        <td className={cn(AUTO_TD, 'text-ink-soft')}>{money(res.withdraw)}</td>
        <td className={cn(AUTO_TD, 'text-ink-soft')}>{money(res.ads)}</td>
        <td className={cn(AUTO_TD, 'font-medium text-ink')}>{money(res.landedCost)}</td>
        <td className={cn(AUTO_TD, 'font-medium text-ink')}>{money(res.payout)}</td>

        <td className={cn(RESULT_TD_FIRST, profitTone)}>{money(res.profit)}</td>
        <td className={cn(RESULT_TD, rateTone(res.marginPct))}>{pct(res.marginPct)}</td>
        <td className={cn(RESULT_TD, rateTone(res.roiPct))}>{pct(res.roiPct)}</td>

        <td className={EDITABLE_TD_FIRST}>
          <PlanCell
            cell={`${i}:units`}
            label={t('th.units')}
            value={r.monthlyUnits}
            integer
            max={MAX_UNITS}
            disabled={readonly}
            onChange={(monthlyUnits) => onPatch(r.id, { monthlyUnits })}
            onKeyDown={keyFor('units')}
          />
        </td>
        <td className={cn(AUTO_TD, 'font-semibold', res.monthlyProfit !== null && res.monthlyProfit < 0 ? 'text-danger' : 'text-ink')}>
          {money(res.monthlyProfit)}
        </td>
        <td className={EDITABLE_TD}>
          <PlanCell
            cell={`${i}:goal`}
            label={t('th.goal')}
            value={r.goalProfit}
            integer
            max={MAX_MONEY}
            disabled={readonly}
            onChange={(goalProfit) => onPatch(r.id, { goalProfit })}
            onKeyDown={keyFor('goal')}
          />
        </td>
        <td className={cn(AUTO_TD, 'text-ink-soft')}>{money(res.unitsNeeded)}</td>
        <td className={cn(AUTO_TD, 'font-semibold text-ink')}>{money(res.capitalNeeded)}</td>

        <td className="border-b border-l border-b-line/70 border-l-line/60 px-1 text-center">
          {canEdit ? (
            // Sensorli ekranda hover yo'q — tugma doim ko'rinadi
            <button
              type="button"
              title={t('row.delete')}
              aria-label={t('row.delete')}
              onClick={() => onRemove(r.id)}
              className="focusable rounded-md p-1 text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </td>
      </tr>
    );
  },
  (a, b) =>
    a.row === b.row &&
    a.index === b.index &&
    a.tableRate === b.tableRate &&
    a.canEdit === b.canEdit &&
    a.onPatch === b.onPatch &&
    a.onPick === b.onPick &&
    a.onRemove === b.onRemove &&
    a.onKey === b.onKey &&
    a.onOpenDims === b.onOpenDims &&
    sameResult(a.res, b.res),
);

/** Ustun sarlavhasi: izohida formula oddiy so'z bilan */
function Th({
  label,
  hint,
  align = 'right',
  first,
  className,
}: {
  label: string;
  hint: string;
  align?: 'left' | 'right' | 'center';
  /** Ustunlar guruhining birinchisi */
  first?: boolean;
  className?: string;
}) {
  return (
    <th
      title={hint}
      className={cn(
        'table-head top-8 z-20 cursor-help border-b border-b-line px-3 py-2 align-bottom leading-tight',
        first ? 'border-l border-l-line-strong' : 'border-l border-l-line/60',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      {label}
    </th>
  );
}

/** Ustunlar guruhi sarlavhasi */
function GroupTh({ label, dot, span, className }: { label?: string; dot?: string; span: number; className?: string }) {
  return (
    <th
      colSpan={span}
      className={cn(
        'table-head h-8 whitespace-nowrap border-b border-b-line px-3 py-0 text-left text-2xs uppercase tracking-[0.06em]',
        className,
      )}
    >
      {label ? (
        <span className="flex items-center gap-1.5">
          {dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} /> : null}
          {label}
        </span>
      ) : null}
    </th>
  );
}

// ─────────────────────────── Bo'lim ───────────────────────────

/**
 * Tovarlar jadvali: sotuvchilar Excel'da yuritadigan unit-iqtisod varag'i saytda.
 * Har qatorda bitta tovar, tepada uchta umumiy stavka. Barcha raqamlar calcUnitPlan
 * dan (shared unit-plan.ts) — bu yerda formula yo'q.
 *
 * Saqlash partiya jadvali (BatchDetail) bilan bir xil: mahalliy qoralama, 700 ms dan
 * keyin butun jadval bitta PUT bilan, `expectedUpdatedAt` bilan — boshqa oyna
 * yangi qatorlarni o'chirib yubormasin (2026-11-02).
 */
export function PlanTab() {
  const t = useT('unitPlan');
  const f = useFormat();
  const lang = useLang();
  const qc = useQueryClient();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');

  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['unit-plan'],
    queryFn: async () => {
      await lastSave;
      return api.get<UnitPlan>('/unit/plan');
    },
    // Keshdagi nusxa boshqa qurilmada o'zgargan bo'lishi mumkin — har ochilishda yangisi
    refetchOnMount: 'always',
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dimsFor, setDimsFor] = useState<string | null>(null);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const version = useRef(0);
  const savedVersion = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  /** Sahifa ko'rgan server versiyasi: hali saqlanmagan jadvalda null */
  const serverVersion = useRef<string | null>(null);
  /** Konflikt bo'ldi — sahifa yangilanmaguncha qayta saqlanmaydi */
  const conflicted = useRef(false);
  /** Oxirgi saqlangan jadval: faqat bo'sh qator qo'shilsa yoki o'chirish qaytarilsa PUT ketmaydi */
  const lastSaved = useRef('');
  /** Javobi kelmagan saqlashlar: so'rov serverga yetib, yozilgan bo'lishi mumkin */
  const unconfirmed = useRef(new Set<string>());
  /** Bo'limdan chiqilgan: ko'rsatkich yo'q, saqlanmagani faqat xabar bilan aytiladi */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  /** Jadval qaysi kompaniyaniki */
  const loadedCompany = useRef<string | null>(null);

  // Serverdan kelgan jadval faqat bir marta qoralamaga o'tadi — keyingi javoblar yozayotgan kursorni buzmasin
  useEffect(() => {
    if (data && !draft && !isFetching) {
      const next = toDraft(data);
      serverVersion.current = data.updatedAt;
      lastSaved.current = JSON.stringify(planBody(next));
      loadedCompany.current = getCompanyId();
      setDraft(next);
    }
  }, [data, draft, isFetching]);

  const flush = useCallback(() => {
    const showConflict = () => {
      conflicted.current = true;
      setSaveState('conflict');
      toast.error(t('save.conflict'), t('save.conflictHint'));
    };
    const save = async (): Promise<void> => {
      const d = draftRef.current;
      const v = version.current;
      if (!d || v === savedVersion.current || conflicted.current) return;
      /*
       * Partiyada kalit partiyaning o'zi, jadvalda esa kompaniya: kompaniya almashganda
       * sahifa yopilishidagi saqlash eski jadvalni YANGI kompaniyaga yozib yuborardi
       * (ikkalasida ham hali saqlanmagan bo'lsa, versiya tekshiruvi ham ushlamaydi).
       */
      if (loadedCompany.current !== getCompanyId()) {
        showConflict();
        return;
      }
      const body = planBody(d);
      const json = JSON.stringify(body);
      // Javobi kelmagan saqlash bo'lsa, serverda nima turgani noma'lum — so'rov baribir yuboriladi
      if (json === lastSaved.current && unconfirmed.current.size === 0) {
        savedVersion.current = v;
        setSaveState(version.current !== v ? 'pending' : serverVersion.current ? 'saved' : 'idle');
        return;
      }
      setSaveState('saving');
      try {
        const saved = await api.put<UnitPlan>('/unit/plan', { ...body, expectedUpdatedAt: serverVersion.current });
        serverVersion.current = saved.updatedAt;
        lastSaved.current = json;
        savedVersion.current = v;
        unconfirmed.current.clear();
        qc.setQueryData(['unit-plan'], saved);
        setSaveState(version.current === v ? 'saved' : 'pending');
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          /*
           * Oldingi so'rovning javobi yo'qolgan bo'lsa, server o'sha jadvalni allaqachon
           * yozgan va versiya siljigan: bu boshqa joydagi o'zgarish emas. Serverdagi jadval
           * javobsiz qolganlardan biri bo'lsa, uning versiyasi olinadi va saqlash davom etadi.
           */
          if (unconfirmed.current.size > 0) {
            let current: UnitPlan;
            try {
              current = await api.get<UnitPlan>('/unit/plan');
            } catch {
              // Tarmoq hali yo'q: hech narsa aniq emas, "Qayta urinish" qoladi
              setSaveState('error');
              return;
            }
            const written = JSON.stringify(planBody(current));
            if (unconfirmed.current.has(written)) {
              unconfirmed.current.clear();
              serverVersion.current = current.updatedAt;
              lastSaved.current = written;
              await save();
              return;
            }
          }
          showConflict();
          return;
        }
        if (!(err instanceof ApiError) || err.status >= 500) unconfirmed.current.add(json);
        setSaveState('error');
        // Tarmoq uzilganda sahifadagi ko'rsatkich yetadi; 5xx matni (nginx HTML'i) sotuvchiga ko'rsatilmaydi
        if (err instanceof ApiError || !mounted.current) {
          toast.error(t('save.error'), err instanceof ApiError && err.status < 500 ? err.message : undefined);
        }
      }
    };
    chain.current = chain.current.then(save);
    lastSave = chain.current;
    return chain.current;
  }, [qc, t]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick === 0) return undefined;
    const timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [tick, flush]);

  // Bo'limdan yoki sahifadan chiqishda kutilayotgan o'zgarish yo'qolmasin
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      // Konfliktda saqlab bo'lmaydi — "Yangilash" bosilganda ogohlantirish chiqmasin
      if (version.current !== savedVersion.current && !conflicted.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (version.current !== savedVersion.current) void flushRef.current();
    };
  }, []);

  const edit = useCallback(
    (fn: (d: Draft) => Draft) => {
      if (!canEdit) return;
      setDraft((d) => (d ? fn(d) : d));
      version.current += 1;
      // Konfliktdan keyin saqlab bo'lmaydi: "Yangilash" tugmasi yozish bilan yo'qolib qolmasin
      if (!conflicted.current) setSaveState('pending');
      setTick((n) => n + 1);
    },
    [canEdit],
  );

  const onPatch = useCallback(
    (id: string, patch: Partial<UnitPlanRow>) =>
      edit((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
    [edit],
  );

  // ── Kategoriya ──
  const hasCategories = draft?.rows.some((r) => r.categoryId) ?? false;
  const categories = useCommissionCategories(hasCategories);
  const categoriesRef = useRef(categories.data);
  categoriesRef.current = categories.data;
  const langRef = useRef(lang);
  langRef.current = lang;

  const onPick = useCallback(
    (id: string, cat: CommissionCategory | null) =>
      edit((d) => ({
        ...d,
        rows: d.rows.map((r) => {
          if (r.id !== id) return r;
          if (cat) {
            // Jadvalda stavka yo'q bo'lsa komissiya bo'sh qoladi — sotuvchi o'zi yozadi, eski raqam adashtirmaydi
            return { ...r, categoryId: cat.id, categoryName: categoryName(cat, langRef.current), commissionPct: cat.pct };
          }
          // Stavka kategoriyadan kelgan bo'lsa u bilan birga ketadi; qo'lda yozilgani qoladi
          const prev = categoriesRef.current ? findCategory(categoriesRef.current, r.categoryId) : null;
          const fromCategory = prev !== null && prev.pct === r.commissionPct;
          return { ...r, categoryId: null, categoryName: null, commissionPct: fromCategory ? null : r.commissionPct };
        }),
      })),
    [edit],
  );

  // ── Qatorlar ──
  const addRow = useCallback(() => {
    if ((draftRef.current?.rows.length ?? 0) >= UNIT_PLAN_MAX_ROWS) {
      toast.warning(t('rows.limit', { n: UNIT_PLAN_MAX_ROWS }));
      return;
    }
    edit((d) => ({ ...d, rows: [...d.rows, blankRow()] }));
  }, [edit, t]);

  /*
   * O'chirilgan qator 5 soniya davomida qaytariladi. Avtomatik saqlash
   * o'chirishni darhol yozadi, "Qaytarish" esa qatorni o'sha joyiga qo'yib
   * yana saqlaydi — sahifadan chiqib ketilsa ham holat to'g'ri qoladi.
   */
  const [undo, setUndo] = useState<{ row: UnitPlanRow; index: number; stamp: number } | null>(null);
  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const lastRemoveAt = useRef(0);
  const onRemove = useCallback(
    (id: string) => {
      // Qator o'chgach uning o'rniga keyingisi keladi: ikkinchi bosish keyingi qatorni ham o'chirardi
      const now = Date.now();
      if (now - lastRemoveAt.current < DOUBLE_CLICK_MS) return;
      lastRemoveAt.current = now;
      const rows = draftRef.current?.rows ?? [];
      const index = rows.findIndex((r) => r.id === id);
      const removed = index >= 0 ? rows[index] : undefined;
      edit((d) => {
        const rest = d.rows.filter((r) => r.id !== id);
        return { ...d, rows: rest.length ? rest : [blankRow()] };
      });
      // Bo'sh qatorni qaytarishning ma'nosi yo'q
      if (removed && !isBlank(removed)) setUndo({ row: removed, index, stamp: Date.now() });
    },
    [edit],
  );

  const undoRemove = () => {
    if (!undo) return;
    const { row, index } = undo;
    const current = draftRef.current?.rows ?? [];
    // Panel yo'qolayotganda ham bosiladi: ikki marta bosish qatorni ikki qo'shib, saqlashni to'xtatardi
    if (current.some((r) => r.id === row.id)) return;
    if (current.length >= UNIT_PLAN_MAX_ROWS) {
      toast.warning(t('rows.limit', { n: UNIT_PLAN_MAX_ROWS }));
      return;
    }
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
  const focusCell = (cell: string) => tableRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();

  const onKey = useCallback(
    (rowIdx: number, col: string, e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
      e.preventDefault();
      const next = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
      if (next < 0) return;
      if (next < (draftRef.current?.rows.length ?? 0)) {
        focusCell(`${next}:${col}`);
      } else if (canEdit && next < UNIT_PLAN_MAX_ROWS) {
        pendingFocus.current = `${next}:${col}`;
        addRow();
      }
    },
    [addRow, canEdit],
  );

  const rowCount = draft?.rows.length ?? 0;
  useEffect(() => {
    if (!pendingFocus.current) return;
    focusCell(pendingFocus.current);
    pendingFocus.current = null;
  }, [rowCount]);

  /*
   * Yozilayotgan katak yopishqoq ustun yoki sarlavha ostida qolmasin: yarim ko'rinib
   * turgan katak bosilganda brauzer uni surmaydi va yozilgan matn nom ustuni ostida
   * yashirinardi. Telefonda kategoriya katagi ko'rinadigan joydan keng — chap cheti
   * ko'rinib turadi. rAF: fokusdan keyin brauzer o'zi ham suradi, bu undan keyin ishlasin.
   */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const revealCell = useCallback((target: EventTarget) => {
    const td = target instanceof Element ? target.closest('input,button')?.closest('td') : null;
    if (!td) return;
    requestAnimationFrame(() => {
      const box = scrollerRef.current;
      const table = tableRef.current;
      const row = td.parentElement;
      // O'chirish tugmasi bosilgan: qator endi yo'q, o'lchamlari nol va jadval tepaga sakrardi
      if (!box || !table || !td.isConnected || !(row instanceof HTMLTableRowElement)) return;
      const cell = td.getBoundingClientRect();
      const view = box.getBoundingClientRect();
      const stickyName = row.cells[1];

      const headBottom = table.tHead?.rows[1]?.cells[1]?.getBoundingClientRect().bottom ?? view.top;
      const footTop = table.tFoot?.rows[0]?.cells[1]?.getBoundingClientRect().top ?? view.bottom;
      if (cell.top < headBottom) box.scrollTop += cell.top - headBottom;
      else if (cell.bottom > footTop) box.scrollTop += cell.bottom - footTop;

      if (td === stickyName) return;
      const edge = stickyName.getBoundingClientRect().right;
      if (cell.left < edge || cell.width > view.right - edge) box.scrollLeft += cell.left - edge;
      else if (cell.right > view.right) box.scrollLeft += cell.right - view.right;
    });
  }, []);

  // Bosish paytida surilsa, tugma boshqa katak ustida qo'yilib, bosish yo'qolardi — surish `click` da
  const pointerDown = useRef(false);
  useEffect(() => {
    const onUp = () => {
      pointerDown.current = false;
    };
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  const onOpenDims = useCallback((id: string) => setDimsFor(id), []);

  // ── Hisob ──
  const calc = useMemo(() => (draft ? calcUnitPlan(draft.rows, draft.rates) : null), [draft]);

  if (!draft || !calc) {
    if (isError) {
      return (
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        </Card>
      );
    }
    return (
      <div className="space-y-5">
        <Skeleton className="h-[124px] w-full" />
        <Skeleton className="h-[104px] w-full" />
        <Card className="p-5">
          <SkeletonRows rows={4} />
        </Card>
      </div>
    );
  }

  const setRate = (key: keyof UnitPlanRates) => (v: number) => edit((d) => ({ ...d, rates: { ...d.rates, [key]: v } }));
  const filledCount = draft.rows.filter((r) => !isBlank(r)).length;
  const hasMonthly = calc.rows.some((r) => r.monthlyProfit !== null);
  const hasCapital = calc.rows.some((r) => r.capitalNeeded !== null);
  const canAdd = rowCount < UNIT_PLAN_MAX_ROWS;
  const onReload = () => window.location.reload();
  // Bo'linmas bo'shliq: telefonda "5 / 250" bo'lib ikki qatorga ajralardi
  const unbroken = (v: number) => f.num(v).replace(/ /g, '\u00A0');
  const feeVars = {
    base: unbroken(LOGISTICS_FEE.base),
    extra: unbroken(LOGISTICS_FEE.perExtraLiter),
    max: unbroken(LOGISTICS_FEE.max),
  };

  return (
    <div className="space-y-5">
      {/* ── Umumiy stavkalar ── */}
      <Card className="p-5">
        {/* Keng ekrandan boshqa joyda holat yozuvi doim alohida qatorda: uzunligiga qarab sakramasin */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between xl:gap-6">
          <div className="grid w-full grid-cols-3 items-end gap-3 sm:w-auto sm:grid-cols-[repeat(3,11rem)]">
            <RateField
              label={t('rates.tax')}
              hint={t('rates.taxHint')}
              value={draft.rates.taxPct}
              disabled={!canEdit}
              onChange={setRate('taxPct')}
            />
            <RateField
              label={t('rates.withdraw')}
              hint={t('rates.withdrawHint')}
              value={draft.rates.withdrawPct}
              disabled={!canEdit}
              onChange={setRate('withdrawPct')}
            />
            <RateField
              label={t('rates.ads')}
              hint={t('rates.adsHint')}
              value={draft.rates.adsPct}
              disabled={!canEdit}
              onChange={setRate('adsPct')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 xl:min-h-[2.75rem]">
            {canEdit ? null : <Badge tone="muted">{t('readonly')}</Badge>}
            <SaveIndicator
              state={saveState}
              idle={canEdit ? t('save.idle') : undefined}
              onRetry={() => void flush()}
              onReload={onReload}
            />
          </div>
        </div>
        <p className="tnum mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('rates.note', { from: f.num(2.1, 1), to: f.num(billableLiters(2.1)), ...feeVars })}
        </p>
      </Card>

      {/* ── Jamlar ── */}
      <Card className="p-5 sm:p-6">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
          <SumTerm
            dot="bg-info"
            label={t('sum.computed')}
            value={`${f.num(calc.totals.computed)} / ${f.num(filledCount)}`}
            hint={t('sum.computedHint')}
          />
          <SumTerm
            strong
            dot="bg-brand"
            label={t('sum.monthly')}
            value={hasMonthly ? <Amount value={f.money(calc.totals.monthlyProfit)} nowrap /> : '—'}
            danger={calc.totals.monthlyProfit < 0}
            hint={t('sum.monthlyHint')}
          />
          <SumTerm
            dot="bg-warn"
            label={t('sum.capital')}
            value={hasCapital ? <Amount value={f.money(calc.totals.capitalNeeded)} nowrap /> : '—'}
            hint={t('sum.capitalHint')}
          />
        </div>
      </Card>

      {/* ── Jadval ── */}
      <Card className="overflow-hidden">
        {/*
          Yopishqoq ustunlar katakni yopib qo'ymasligi uchun `scroll-p*`: Enter va Tab
          bilan o'tilgan katak ularning ostida qolib ketmaydi. Balandlik chegarasi faqat
          keng ekranda: uzun jadvalda sarlavha va jami ko'rinib turadi, telefonda ichma-ich
          aylanish noqulay. `isolate` — ichki z-index'lar shu yerda qoladi: yopishqoq
          sarlavha sahifa aylanganda ilovaning yuqori paneli ustiga chiqib qolardi.
        */}
        <div
          ref={scrollerRef}
          className="isolate scroll-pb-12 scroll-pl-[172px] scroll-pt-24 overflow-auto sm:scroll-pl-[264px] lg:max-h-[calc(100vh-9rem)]"
        >
          <table
            ref={tableRef}
            onPointerDown={() => {
              pointerDown.current = true;
            }}
            onFocus={(e) => {
              if (!pointerDown.current) revealCell(e.target);
            }}
            onClick={(e) => revealCell(e.target)}
            onInput={(e) => revealCell(e.target)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') revealCell(e.target);
            }}
            className="w-full min-w-[2444px] table-fixed border-separate border-spacing-0 text-sm sm:min-w-[2536px]"
          >
            <colgroup>
              <col className="w-11" />
              <col />
              <col className="w-[280px]" />
              <col className="w-[124px]" />
              <col className="w-[84px]" />
              <col className="w-[112px]" />
              <col className="w-[92px]" />
              <col className="w-[112px]" />
              <col className="w-[92px]" />
              <col className="w-[84px]" />
              <col className="w-[80px]" />
              <col className="w-[84px]" />
              <col className="w-[84px]" />
              <col className="w-[100px]" />
              <col className="w-[108px]" />
              <col className="w-[108px]" />
              <col className="w-[92px]" />
              <col className="w-[76px]" />
              <col className="w-[84px]" />
              <col className="w-[116px]" />
              <col className="w-[112px]" />
              <col className="w-[88px]" />
              <col className="w-[120px]" />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr>
                {/* "Tovar" ikkiga bo'lingan: yopishqoq № va Nomi ustida nomi bilan, qolgani aylanadi */}
                <GroupTh
                  span={2}
                  label={t('group.item')}
                  dot="bg-muted"
                  className="left-0 z-30 shadow-[2px_0_0_rgb(var(--c-border))]"
                />
                <GroupTh span={3} className="z-20" />
                <GroupTh span={3} label={t('group.prices')} dot="bg-warn" className="z-20 border-l border-l-line-strong" />
                <GroupTh span={7} label={t('group.costs')} dot="bg-violet" className="z-20 border-l border-l-line-strong" />
                <GroupTh span={3} label={t('group.result')} dot="bg-brand" className="z-20 border-l border-l-line-strong text-brand-ink" />
                <GroupTh span={5} label={t('group.plan')} dot="bg-info" className="z-20 border-l border-l-line-strong" />
                <GroupTh span={1} className="z-20 border-l border-l-line/60" />
              </tr>
              <tr>
                <th
                  title={t('hint.no')}
                  className="table-head left-0 top-8 z-30 cursor-help border-b border-b-line px-1 py-2 text-center align-bottom leading-tight"
                >
                  {t('th.no')}
                </th>
                <th
                  title={t('hint.name')}
                  className="table-head left-11 top-8 z-30 cursor-help border-b border-l border-b-line border-l-line/60 px-3 py-2 text-left align-bottom leading-tight shadow-[2px_0_0_rgb(var(--c-border))]"
                >
                  {t('th.name')}
                </th>
                <Th label={t('th.category')} hint={t('hint.category')} align="left" />
                <Th label={t('th.liters')} hint={t('hint.liters')} />
                <Th label={t('th.commissionPct')} hint={t('hint.commissionPct')} />
                <Th first label={t('th.purchase')} hint={t('hint.purchase')} />
                <Th label={t('th.packaging')} hint={t('hint.packaging')} />
                <Th label={t('th.price')} hint={t('hint.price')} />
                <Th first label={t('th.commission')} hint={t('hint.commission')} />
                <Th label={t('th.logistics')} hint={t('hint.logistics', feeVars)} />
                <Th label={t('th.tax')} hint={t('hint.tax')} />
                <Th label={t('th.withdraw')} hint={t('hint.withdraw')} />
                <Th label={t('th.ads')} hint={t('hint.ads')} />
                <Th label={t('th.landed')} hint={t('hint.landed')} />
                <Th label={t('th.payout')} hint={t('hint.payout')} />
                <Th first label={t('th.profit')} hint={t('hint.profit')} />
                <Th label={t('th.margin')} hint={t('hint.margin')} />
                <Th label={t('th.roi')} hint={t('hint.roi')} />
                <Th first label={t('th.units')} hint={t('hint.units')} />
                <Th label={t('th.monthly')} hint={t('hint.monthly')} />
                <Th label={t('th.goal')} hint={t('hint.goal')} />
                <Th label={t('th.needed')} hint={t('hint.needed')} />
                <Th label={t('th.capital')} hint={t('hint.capital')} />
                <th className="table-head top-8 z-20 border-b border-l border-b-line border-l-line/60" />
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r, i) => {
                const known = categories.data && r.categoryId ? findCategory(categories.data, r.categoryId) : null;
                return (
                  <PlanRowView
                    key={r.id}
                    row={r}
                    index={i}
                    res={calc.rows[i]}
                    tableRate={known ? known.pct : undefined}
                    canEdit={canEdit}
                    onPatch={onPatch}
                    onPick={onPick}
                    onRemove={onRemove}
                    onKey={onKey}
                    onOpenDims={onOpenDims}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold text-ink">
                <td className="sticky bottom-0 left-0 z-20 bg-surface-2" />
                <td className="sticky bottom-0 left-11 z-20 bg-surface-2 px-3 py-3 shadow-[2px_0_0_rgb(var(--c-border))]">{t('total')}</td>
                <td colSpan={17} className="sticky bottom-0 z-10 bg-surface-2" />
                <td className="tnum sticky bottom-0 z-10 whitespace-nowrap bg-surface-2 px-3 py-3 text-right">
                  <span className={cn(calc.totals.monthlyProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
                    {hasMonthly ? f.num(calc.totals.monthlyProfit) : '—'}
                  </span>
                </td>
                <td colSpan={2} className="sticky bottom-0 z-10 bg-surface-2" />
                <td className="tnum sticky bottom-0 z-10 whitespace-nowrap bg-surface-2 px-3 py-3 text-right">
                  {hasCapital ? f.num(calc.totals.capitalNeeded) : '—'}
                </td>
                <td className="sticky bottom-0 z-10 bg-surface-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {canEdit ? (
              <Button
                variant="soft"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                disabled={!canAdd}
                onClick={() => {
                  pendingFocus.current = `${rowCount}:name`;
                  addRow();
                }}
              >
                {t('row.add')}
              </Button>
            ) : null}
            <span className="tnum text-xs text-muted">{t('rows.count', { n: f.num(rowCount), max: f.num(UNIT_PLAN_MAX_ROWS) })}</span>
            <SaveIndicator state={saveState} onRetry={() => void flush()} onReload={onReload} />
          </div>
          {canEdit ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <span className="h-3 w-3 shrink-0 rounded border border-line bg-warn/[0.12]" />
              {t('tip')}
            </p>
          ) : null}
        </div>
      </Card>

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
                  {undo.row.name.trim() ? t('undo.removed', { name: undo.row.name.trim() }) : t('undo.removedBlank')}
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

      <DimsModal
        open={dimsFor !== null}
        onClose={() => setDimsFor(null)}
        onApply={(liters) => {
          if (dimsFor) onPatch(dimsFor, { liters });
          setDimsFor(null);
        }}
      />
    </div>
  );
}
