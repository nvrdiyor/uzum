import { type ReactNode, useId, useLayoutEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { CHART_COLORS, SERIES_PALETTE, SERIES_OTHER, seriesColor, chartAxisProps, tooltipStyle } from '@/lib/theme';
import { Segmented } from '@/components/ui/primitives';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  autoGranularity,
  bucketize,
  dayNumber,
  extent,
  granularityOptions,
  niceTicks,
  trimLeadingEmpty,
  ymd,
  type Bucket,
  type Granularity,
  type Row,
} from './series';

registerNamespace('charts', {
  uz: {
    'gran.day': 'Kun',
    'gran.week': 'Hafta',
    'gran.month': 'Oy',
    since: '{d} dan oldin ma’lumot yo‘q',
    days: '{n} kun',
    total: 'Jami',
    units: '{n} dona',
    'map.above': 'O‘rtachadan yuqori',
    'map.below': 'O‘rtachadan past',
    'map.avg': 'O‘rtacha {v}',
  },
  ru: {
    'gran.day': 'День',
    'gran.week': 'Неделя',
    'gran.month': 'Месяц',
    since: 'До {d} данных нет',
    days: '{n} дн.',
    total: 'Итого',
    units: '{n} шт.',
    'map.above': 'Выше среднего',
    'map.below': 'Ниже среднего',
    'map.avg': 'Среднее {v}',
  },
  en: {
    'gran.day': 'Day',
    'gran.week': 'Week',
    'gran.month': 'Month',
    since: 'No data before {d}',
    days: '{n} days',
    total: 'Total',
    units: '{n} pcs',
    'map.above': 'Above average',
    'map.below': 'Below average',
    'map.avg': 'Average {v}',
  },
});

export interface SeriesDef {
  key: string;
  name: string;
  color?: string;
  /** Pul formatida ko'rsatilsinmi */
  money?: boolean;
  type?: 'area' | 'line' | 'bar';
  yAxis?: 'left' | 'right';
  /** Manfiy qiymat rangi — masalan zarar ko'rilgan kun qizil bo'lsin */
  negColor?: string;
}

/**
 * Oldingi davr bilan taqqoslash — grafikda xira uzuq chiziq.
 *
 * `rows` joriy `data` bilan INDEKS bo'yicha tekislangan (server oldingi teng
 * davrni kunma-kun beradi: i-qator ↔ joriy davrning i-kuni). Sanalar har xil,
 * shuning uchun qiymat sana bo'yicha emas, tartib bo'yicha qo'shiladi.
 */
export interface CompareDef {
  rows: Record<string, unknown>[];
  /** Qaysi seriya bilan taqqoslanadi — `series[].key` lardan biri, `rows` da ham shu kalit */
  key: string;
  /** Afsona va izohdagi nom ("O‘tgan davr") */
  name: string;
}

/** Taqqoslash qiymati qatorda shu kalitda turadi — sahifa kalitlari bilan to'qnashmaydi */
const CMP = '__cmp';
const CMP_COLOR = 'rgb(var(--c-muted))';
/**
 * Oldingi davrdagi BITTA keskin kun (masalan, bir martalik ulgurji buyurtma)
 * o'qni o'ziga tortib, joriy ustunlarni yassilab yubormasin: eng katta qiymat
 * ikkinchisidan shuncha marta katta va joriy maksimumdan ham baland bo'lsa,
 * u o'q chegarasidan chiqib kesiladi (izohda haqiqiy qiymat ko'rinadi).
 */
const CMP_SPIKE = 3;

interface BaseProps {
  data: Record<string, unknown>[];
  xKey?: string;
  series: SeriesDef[];
  height?: number;
  className?: string;
  /** X o'qi belgilarini sana sifatida formatlash */
  xIsDate?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  stacked?: boolean;
}

/** Tizimda "harakatni kamaytirish" yoqilgan bo'lsa, grafiklar o'sib chiqmaydi */
const ANIMATE =
  typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const GRID_STROKE = 'rgb(var(--c-border))';
const CURSOR_BAND = { fill: 'rgb(var(--c-text) / 0.05)' };
const CURSOR_LINE = { stroke: 'rgb(var(--c-border-strong))', strokeWidth: 1 };
const TIP_WRAPPER = { outline: 'none', zIndex: 20 } as const;

const num = (v: unknown): number => Number(v) || 0;

// ─────────────────────────── Umumiy bo'laklar ───────────────────────────

/**
 * O'q belgisi: «500 ming», «1,25 mln», «-250 ming».
 *
 * `f.compact` bir xonagacha yaxlitlaydi — 1,25 mln «1,3 mln» bo'lib chiqardi
 * va o'q belgisi to'r chizig'i turgan joyni noto'g'ri aytardi. Bu yerda ikki
 * xona saqlanadi, ortiqcha nollar tashlanadi. Bo'sh joy uzilmaydigan —
 * Recharts tor o'qda yozuvni ikki qatorga bo'lib yuborardi («500» / «ming»).
 */
function useAxisLabel() {
  const f = useFormat();
  return (value: number) => {
    const v = Number(value);
    const abs = Math.abs(v);
    const unit = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
    const n = v / unit;
    const text = Number.isInteger(n)
      ? f.num(n)
      : f
          .dec(n, 2)
          .replace(/([.,]\d*?)0+$/, '$1')
          .replace(/[.,]$/, '');
    if (unit === 1) return text;
    // Birlik nomi umumiy formatlagichdan olinadi — til bo'yicha ro'yxat bir joyda qoladi
    const suffix = f.compact(unit).replace(/^[\d.,\s]+/, '');
    return f.lang === 'en' ? `${text}${suffix}` : `${text}\u00a0${suffix}`;
  };
}

/**
 * O'q belgilari va ularga yetadigan o'q kengligi.
 *
 * Belgilar oltitadan oshmaydi, shuning uchun o'qda `interval={0}` bilan
 * hammasi ko'rsatiladi — Recharts o'zi tanlasa birini tashlab yuborib,
 * «0, 10, 20, 40 mln» kabi notekis qator qoldirardi.
 */
function useYScale(min: number, max: number, integers: boolean) {
  const label = useAxisLabel();
  const ticks = niceTicks(min, max, 5, integers);
  const longest = Math.max(...ticks.map((v) => label(v).length));
  return {
    label,
    ticks,
    domain: [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1] as [number, number],
    width: Math.min(88, Math.max(26, Math.round(longest * 6.2 + 14))),
  };
}

/** Sana yozuvlari: «13 okt», «6–12 okt», «okt 2026» */
function useDateLabels() {
  const f = useFormat();
  return useMemo(() => {
    const parse = (v: unknown) => /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
    const mon = (m: RegExpExecArray) => f.monthShort(`${m[1]}-${m[2]}-01`);
    const day = (v: unknown) => {
      const m = parse(v);
      return m ? `${Number(m[3])} ${mon(m)}` : String(v ?? '');
    };
    return {
      day,
      /** Oy nomi; yanvarda yil qo'shiladi — o'qda yil almashgani ko'rinsin */
      month: (v: unknown, withYear = false) => {
        const m = parse(v);
        if (!m) return String(v ?? '');
        return withYear || m[2] === '01' ? `${mon(m)} ${m[1]}` : mon(m);
      },
      range: (from: unknown, to: unknown) => {
        const a = parse(from);
        const b = parse(to);
        if (!a || !b || String(from) === String(to)) return day(from);
        return a[2] === b[2] ? `${Number(a[3])}–${day(to)}` : `${day(from)} – ${day(to)}`;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.lang]);
}

interface TipRow {
  name: string;
  color: string;
  value: string;
  negative?: boolean;
}

/** Izohdagi oldingi davr qatori: o'z sanalari va joriy qiymatdan farqi bilan */
interface TipCompare {
  name: string;
  /** Oldingi davrdagi haqiqiy sana(lar) — "7 sen", "7–13 sen" */
  when: string;
  value: string;
  negative?: boolean;
  /** Joriy qiymat oldingisidan necha foiz farq qiladi; hisoblab bo'lmasa null */
  delta: number | null;
}

/** Grafik ustiga chiqadigan izoh oynasi — barcha grafiklarda bir xil */
function TipCard({
  title,
  sub,
  rows,
  total,
  compare,
}: {
  title: ReactNode;
  sub?: ReactNode;
  rows: TipRow[];
  total?: TipRow;
  compare?: TipCompare;
}) {
  const f = useFormat();
  return (
    <div style={tooltipStyle()} className="min-w-[172px]">
      <p className="mb-1.5 font-semibold text-ink">
        {title}
        {sub ? <span className="font-normal text-muted"> · {sub}</span> : null}
      </p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-6">
            {/* Nom qisqartirilmaydi: oyna kengligi mazmunga moslashadi, `truncate` esa nomni nolga siqib yuborardi */}
            <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className={cn('tnum whitespace-nowrap font-semibold', r.negative ? 'text-danger' : 'text-ink')}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {total ? (
        <div className="mt-1.5 flex items-center justify-between gap-6 border-t border-line pt-1.5">
          <span className="text-muted">{total.name}</span>
          <span className="tnum whitespace-nowrap font-semibold text-ink">{total.value}</span>
        </div>
      ) : null}
      {compare ? (
        // Oldingi davr — alohida qism: sanasi boshqa, uni joriy kun qatorlari bilan aralashtirib bo'lmaydi
        <div className="mt-1.5 border-t border-line pt-1.5">
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 whitespace-nowrap text-muted">
              <span className="w-2.5 shrink-0 border-t-2 border-dashed" style={{ borderColor: CMP_COLOR }} />
              {compare.name}
              <span className="text-2xs">· {compare.when}</span>
            </span>
            <span className={cn('tnum whitespace-nowrap font-semibold', compare.negative ? 'text-danger' : 'text-ink-soft')}>
              {compare.value}
            </span>
          </div>
          {compare.delta !== null ? (
            <p
              className={cn(
                'tnum mt-0.5 text-right text-2xs font-semibold',
                compare.delta > 0 ? 'text-brand-ink' : compare.delta < 0 ? 'text-danger-ink' : 'text-muted',
              )}
            >
              {`${compare.delta > 0 ? '+' : ''}${f.num(compare.delta, Math.abs(compare.delta) >= 100 ? 0 : 1)}%`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface LegendItem {
  name: string;
  color: string;
  value?: ReactNode;
  /** `line` — qiyoslash chizig'i (uzuq chiziqcha), `dot` — seriya */
  mark?: 'dot' | 'line';
}

/**
 * Afsona qatori: seriya nomi yonida davr bo'yicha jami.
 *
 * Recharts'ning o'z afsonasi faqat nom ko'rsatadi; jami summa esa grafikka
 * qaragan odamning birinchi savoli — «shu davrda hammasi qancha bo'ldi?».
 */
function LegendRow({ items, right }: { items: LegendItem[]; right?: ReactNode }) {
  if (!items.length && !right) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
        {items.map((l) => (
          <div key={l.name} className="flex items-center gap-2 text-xs">
            {l.mark === 'line' ? (
              <span className="w-3.5 border-t border-dashed" style={{ borderColor: l.color }} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: l.color }} />
            )}
            <span className="text-muted">{l.name}</span>
            {l.value !== undefined ? <span className="tnum font-semibold text-ink">{l.value}</span> : null}
          </div>
        ))}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{right}</div> : null}
    </div>
  );
}

/**
 * Element kengligi (px).
 *
 * Birinchi o'lchov chizishdan OLDIN olinadi (layout effect): grafik darhol
 * to'g'ri yiriklikda chiqadi, avval kunlik bo'lib ko'rinib keyin haftalikka
 * "sakramaydi". ResizeObserver faqat keyingi o'zgarishlar uchun.
 */
function useWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      // Bir-ikki pikselga o'zgarish (aylantirish chizig'i) qayta hisobga arzimaydi
      setWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

// ─────────────────────────── Ustun shakllari ───────────────────────────

interface BarGeom {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Row;
}

/** Recharts manfiy qiymat uchun manfiy balandlik beradi — bir xil ko'rinishga keltiramiz */
function geom(p: BarGeom) {
  const y = num(p.y);
  const h = num(p.height);
  return { x: num(p.x), w: num(p.width), top: Math.min(y, y + h), h: Math.abs(h), negative: h < 0 };
}

/**
 * Bir tomoni yumaloq ustun: musbati tepadan, manfiysi pastdan.
 *
 * Radius ustun enining yarmidan oshmaydi. Recharts'ning o'z `radius`i bunday
 * holatda yaroqsiz shakl yasab, ustunni UMUMAN chizmasdi: 127 kun 900 px ga
 * sig'dirilganda grafik bo'm-bo'sh chiqardi.
 */
function barPath(x: number, top: number, w: number, h: number, r: number, negative: boolean): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (rr === 0) return `M${x},${top}h${w}v${h}h${-w}Z`;
  return negative
    ? `M${x},${top}h${w}v${h - rr}a${rr},${rr} 0 0 1 ${-rr},${rr}h${-(w - 2 * rr)}a${rr},${rr} 0 0 1 ${-rr},${-rr}Z`
    : `M${x},${top + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - rr}h${-w}Z`;
}

/** Ustun to'ldirilishi: tepada to'q, pastga qarab yengillashadi */
function BarGradient({ id, color }: { id: string; color: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={1} />
      <stop offset="100%" stopColor={color} stopOpacity={0.62} />
    </linearGradient>
  );
}

/** Bir kunning butun kengligi shundan oshmaydi — besh kunlik grafikda ustunlar "devor" bo'lib qolmasin */
const MAX_BAND = 46;

// ─────────────────────────── Oldingi davr bilan taqqoslash ───────────────────────────

interface Merged {
  rows: Row[];
  /** Joriy va oldingi davr orasidagi siljish, kunda; taqqoslash yo'q bo'lsa null */
  shift: number | null;
  /** Joriy seriyaning oxirgi kuni — undan keyingi qatorlarda faqat oldingi davr qiymati bor */
  lastDate: string | null;
}

/**
 * Oldingi davr qiymatlarini joriy qatorlarga INDEKS bo'yicha qo'shadi (CMP kaliti).
 *
 * Oldingi davr uzunroq bo'lishi mumkin: joriy seriya bugun bilan tugaydi,
 * tanlangan davr esa kelajakka cho'zilgan bo'lsa ham. Qolgan kunlar joriy
 * qiymatsiz qator bo'lib qo'shiladi — uzuq chiziq KESILMAYDI va uning jami
 * KPI'lardagi "oldingi davr" bilan teng qoladi.
 */
function withCompare(data: Row[], compare: CompareDef | null | undefined, xKey: string): Merged {
  const prev = compare?.rows;
  const first = dayNumber(data[0]?.[xKey]);
  const last = dayNumber(data[data.length - 1]?.[xKey]);
  const prevFirst = dayNumber(prev?.[0]?.[xKey]);
  if (!compare || !prev?.length || first === null || last === null || prevFirst === null) {
    return { rows: data, shift: null, lastDate: null };
  }
  const len = Math.max(data.length, prev.length);
  const rows: Row[] = [];
  for (let i = 0; i < len; i++) {
    const cur = data[i];
    const p = prev[i];
    const row: Row = cur ? { ...cur } : { [xKey]: ymd(last + (i - data.length + 1)) };
    row[CMP] = p ? num(p[compare.key]) : undefined;
    rows.push(row);
  }
  return {
    rows,
    shift: first - prevFirst,
    lastDate: len > data.length ? String(data[data.length - 1]?.[xKey]) : null,
  };
}

/**
 * Kun katagini yorituvchi kursor. Taqqoslash chizig'i bo'lsa grafik
 * ComposedChart bo'ladi va Recharts kursorni ustun katagi emas, ingichka oq
 * chiziq qilib chizadi — ustunli grafikda esa butun kun yoritilishi kerak
 * (BarChart'dagi kabi). Recharts bu elementga maydon o'lchamlari va
 * kursor nuqtalarini o'zi uzatadi.
 */
function BandCursor({
  points,
  width = 0,
  height = 0,
  top = 0,
  count,
}: {
  points?: { x: number; y: number }[];
  width?: number;
  height?: number;
  top?: number;
  count: number;
}) {
  const x = points?.[0]?.x;
  if (x === undefined || count <= 0) return null;
  const band = width / count;
  return <rect x={x - band / 2} y={top} width={band} height={height} fill={CURSOR_BAND.fill} pointerEvents="none" />;
}

/** Taqqoslash chizig'i o'qdan qancha joy oladi; bitta keskin kun o'qni cho'zmaydi (CMP_SPIKE) */
function compareExtent(rows: Row[], curMax: number): { min: number; max: number; integers: boolean; clipped: boolean } {
  const e = extent(rows, [CMP]);
  const [top = 0, second = 0] = rows
    .map((r) => r[CMP])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => b - a);
  if (top > curMax && second > 0 && top > CMP_SPIKE * second) {
    return { min: e.min, max: Math.max(second, curMax), integers: e.integers, clipped: true };
  }
  return { ...e, clipped: false };
}

// ─────────────────────────── Vaqt grafigi ───────────────────────────

/**
 * Asosiy vaqt grafigi.
 *
 * `variant="area"` — silliq maydon (standart). `variant="bars"` — ustunlar:
 * kunlik sotuv uzuq-uzuq va keskin sakraydigan bo'lsa, maydon tishli
 * arraga o'xshab qoladi, ustun esa har kunni alohida va rost ko'rsatadi.
 *
 * Ustunli ko'rinishda bir nechta seriya "ustun ichida ustun" bo'lib chiziladi:
 * birinchi seriya (masalan tushum) — keng och ustun, qolganlari (sof foyda)
 * uning ichida tor to'q ustun. `stacked` bo'lsa ichkilari ustma-ust yig'iladi.
 *
 * `compare` — oldingi teng davr xira uzuq chiziq bo'lib ustiga chiziladi:
 * haftalik/oylik ko'rinishda u ham o'sha kataklarga yig'iladi, afsonada
 * jami, izohda o'z sanalari va farq foizi bilan.
 */
export function TrendChart({
  data,
  xKey = 'date',
  series,
  height = 300,
  className,
  xIsDate = true,
  showLegend = true,
  showGrid = true,
  stacked,
  variant = 'area',
  compare,
  layered = true,
}: BaseProps & {
  variant?: 'area' | 'bars';
  /**
   * Ustunlarda birinchi seriya keng "tashqi" ustun, qolganlari uning ichida
   * (tushum ichida foyda). `false` — hamma seriya teng huquqli: `stacked`
   * bilan bitta ustunga yig'iladi (masalan, do'konlar kesimida kun jami).
   */
  layered?: boolean;
  /** Sahifa uni useMemo bilan bersin — har chizishda yangi obyekt hisobni qayta boshlaydi */
  compare?: CompareDef | null;
}) {
  const f = useFormat();
  const t = useT('charts');
  const dates = useDateLabels();
  const uid = useId().replace(/:/g, '');
  const [picked, setPicked] = useState<Granularity | null>(null);

  // Sahifalar `series`ni har chizishda yangi massiv qilib beradi — hisobni kalitlar bo'yicha keshlaymiz
  const keySig = series.map((s) => s.key).join('|');

  const [boxRef, width] = useWidth();
  /*
   * Grafikka o'qiladigan holda nechta ustun sig'adi. Bir kunda uch va undan
   * ko'p yonma-yon ustun bo'lsa (tushum, xarajat, foyda), har kunga kengroq joy kerak.
   */
  const dense = variant === 'bars' && !stacked && series.length > 2;
  const maxBars = variant === 'bars' && width > 0 ? Math.max(8, Math.floor((width - 64) / (dense ? 22 : 9))) : 92;

  const prep = useMemo(() => {
    const keys = keySig.split('|');
    const isDates = xIsDate && data.length > 0 && dayNumber(data[0]?.[xKey]) !== null;
    if (!isDates) {
      return {
        rows: data as Bucket[],
        options: ['day'] as Granularity[],
        gran: 'day' as Granularity,
        since: null,
        isDates,
        shift: null,
      };
    }
    const merged = withCompare(data, compare, xKey);
    // Oldingi davr qiymati ham "harakat": boshidagi kunlar faqat ikkalasi ham bo'sh bo'lsa kesiladi
    const sumKeys = merged.shift !== null ? [...keys, CMP] : keys;
    const cut = trimLeadingEmpty(merged.rows, sumKeys);
    const options = granularityOptions(cut.rows.length);
    const gran = picked && options.includes(picked) ? picked : autoGranularity(cut.rows.length, maxBars);
    /*
     * Kesilganda birinchi qator — harakatdan bir kun oldingi bo'sh kun: silliq
     * maydon noldan ko'tarilsin deb qoldiriladi. Ustunlarda va yig'ilgan
     * (haftalik, oylik) ko'rinishda u faqat bo'sh katak bo'lib turardi.
     */
    const lead = cut.trimmed > 0 && (variant === 'bars' || gran !== 'day') ? 1 : 0;
    let rows = bucketize(cut.rows.slice(lead), xKey, sumKeys, gran);
    // Butunlay bugundan keyingi kataklarda joriy seriya yo'q — u nolga "qulab" chizilmasin
    const lastDate = merged.lastDate;
    if (lastDate) {
      rows = rows.map((b) => (b.__from > lastDate ? { ...b, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : b));
    }
    return {
      rows,
      options,
      gran,
      since: cut.trimmed > 0 ? String(cut.rows[1]?.[xKey] ?? '') : null,
      isDates,
      shift: merged.shift,
    };
  }, [data, xKey, keySig, xIsDate, picked, maxBars, variant, compare]);

  const { rows, gran } = prep;
  const bars = variant === 'bars';
  const [outer, ...inner] = series;
  const overlay = bars && layered && series.length > 1;
  const cmp = prep.shift !== null && compare ? { ...compare, shift: prep.shift } : null;
  const cmpSeries = cmp ? series.find((s) => s.key === cmp.key) : undefined;

  // Ustma-ust ko'rinishda tashqi ustun alohida, ichkilari esa (stacked bo'lsa) yig'indi bo'yicha o'lchanadi
  const range = useMemo(() => {
    const keys = keySig.split('|');
    const base = !overlay
      ? extent(rows, keys, Boolean(stacked))
      : (() => {
          const a = extent(rows, keys.slice(0, 1));
          const b = extent(rows, keys.slice(1), Boolean(stacked));
          return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max), integers: a.integers && b.integers };
        })();
    if (prep.shift === null) return { ...base, clipped: false };
    const c = compareExtent(rows, base.max);
    return {
      min: Math.min(base.min, c.min),
      max: Math.max(base.max, c.max),
      integers: base.integers && c.integers,
      clipped: c.clipped,
    };
  }, [rows, keySig, overlay, stacked, prep.shift]);

  const y = useYScale(range.min, range.max, range.integers);
  const axis = chartAxisProps();

  const xTick = (v: string) =>
    !prep.isDates ? String(v) : gran === 'month' ? dates.month(v) : dates.day(v);

  const fmtCmp = (v: number) => (cmpSeries?.money ? f.money(v) : f.num(v));

  const legend: LegendItem[] = showLegend
    ? [
        ...series.map((s, i) => {
          const sum = rows.reduce((acc, r) => acc + num(r[s.key]), 0);
          return { name: s.name, color: s.color ?? seriesColor(i), value: s.money ? f.money(sum) : f.num(sum) };
        }),
        // Oldingi davr jami — KPI'dagi "oldingi" bilan bir xil raqam (server ikkalasini bitta ta'rifda beradi)
        ...(cmp
          ? [
              {
                name: cmp.name,
                color: CMP_COLOR,
                mark: 'line' as const,
                value: fmtCmp(rows.reduce((acc, r) => acc + num(r[CMP]), 0)),
              },
            ]
          : []),
      ]
    : [];

  const controls =
    prep.options.length > 1 || prep.since ? (
      <>
        {prep.since ? <span className="text-2xs text-muted">{t('since', { d: dates.day(prep.since) })}</span> : null}
        {prep.options.length > 1 ? (
          <Segmented<Granularity>
            size="sm"
            value={gran}
            onChange={setPicked}
            options={prep.options.map((g) => ({ value: g, label: t(`gran.${g}`) }))}
          />
        ) : null}
      </>
    ) : null;

  const tooltip = (
    <Tooltip
      isAnimationActive={false}
      wrapperStyle={TIP_WRAPPER}
      cursor={bars ? (cmp ? <BandCursor count={rows.length} /> : CURSOR_BAND) : CURSOR_LINE}
      content={({ active, payload }) => {
        const row = payload?.[0]?.payload as Bucket | undefined;
        if (!active || !row) return null;
        const from = dayNumber(row.__from);
        const to = dayNumber(row.__to);
        const span = prep.isDates ? (to ?? 0) - (from ?? 0) + 1 : 1;

        let compareTip: TipCompare | undefined;
        if (cmp && row[CMP] !== undefined && from !== null && to !== null) {
          const prev = num(row[CMP]);
          const cur = row[cmp.key];
          compareTip = {
            name: cmp.name,
            // Oldingi davr — o'sha kataklar, `shift` kun oldin (oylik katak ham taqvim oyi emas, aynan shu kunlar)
            when: dates.range(ymd(from - cmp.shift), ymd(to - cmp.shift)),
            value: fmtCmp(prev),
            negative: prev < 0,
            // Foiz faqat musbat asosdan: zarardan foydaga o'tishning "+250%" i hech narsa aytmaydi
            delta: cur !== undefined && prev > 0 ? ((num(cur) - prev) / prev) * 100 : null,
          };
        }

        return (
          <TipCard
            title={
              !prep.isDates
                ? String(row[xKey] ?? '')
                : gran === 'month'
                  ? dates.month(row.__from, true)
                  : dates.range(row.__from, row.__to)
            }
            // To'liqmas hafta: necha kun yig'ilgani aytiladi, aks holda past ustun "sotuv tushdi" deb o'qiladi
            sub={gran === 'week' && span < 7 ? t('days', { n: span }) : undefined}
            // Bugundan keyingi katakda joriy qiymat yo'q — "0 so'm" deb ko'rsatilmaydi
            rows={series
              .filter((s) => row[s.key] !== undefined)
              .map((s) => {
                const v = num(row[s.key]);
                return {
                  name: s.name,
                  color: s.color ?? seriesColor(series.indexOf(s)),
                  value: s.money ? f.money(v) : f.num(v),
                  negative: v < 0,
                };
              })}
            compare={compareTip}
          />
        );
      }}
    />
  );

  const common = (
    <>
      {showGrid ? <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.7} /> : null}
      <XAxis dataKey={xKey} {...axis} tickFormatter={xTick} minTickGap={28} tickMargin={8} interval="preserveStartEnd" />
      <YAxis
        {...axis}
        ticks={y.ticks}
        domain={y.domain}
        tickFormatter={y.label}
        width={y.width}
        interval={0}
        // Oldingi davrning bitta keskin kuni o'q chegarasidan chiqib kesiladi (compareExtent)
        allowDataOverflow={range.clipped}
      />
      {range.min < 0 ? <ReferenceLine y={0} stroke="rgb(var(--c-border-strong))" /> : null}
    </>
  );

  // Ustun va maydon ustidan, nuqtasiz: joriy davrdan xira, lekin har ikki mavzuda ko'rinadi
  const compareLine = cmp ? (
    <Line
      dataKey={CMP}
      name={cmp.name}
      type="monotone"
      stroke={CMP_COLOR}
      strokeWidth={1.75}
      strokeDasharray="5 4"
      strokeLinecap="round"
      dot={false}
      activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'rgb(var(--c-surface))', fill: CMP_COLOR }}
      isAnimationActive={ANIMATE}
      animationDuration={600}
    />
  ) : null;

  const margin = { top: 8, right: 8, left: 0, bottom: 0 };
  // Recharts ustun yoki maydon bilan chiziqni faqat ComposedChart'da birga chizadi
  const BarRoot = cmp ? ComposedChart : BarChart;
  const AreaRoot = cmp ? ComposedChart : AreaChart;

  return (
    <div ref={boxRef} className={cn('w-full', className)}>
      <LegendRow items={legend} right={controls} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {bars ? (
            <BarRoot data={rows} margin={margin} barGap={0} barCategoryGap={rows.length > 60 ? '14%' : '22%'}>
              <defs>
                {series.map((s, i) => (
                  <BarGradient key={s.key} id={`bar-${uid}-${s.key}`} color={s.color ?? seriesColor(i)} />
                ))}
                {series.map((s) =>
                  s.negColor ? <BarGradient key={s.key} id={`neg-${uid}-${s.key}`} color={s.negColor} /> : null,
                )}
              </defs>
              {common}
              {tooltip}
              {series.map((s, i) => {
                const color = s.color ?? seriesColor(i);
                const isOuter = overlay && i === 0;
                // Recharts har bir ustunga (yoki ustma-ust guruhga) teng "katak" ajratadi
                const slots = overlay ? 1 + (stacked ? 1 : inner.length) : 1;
                const slot = !overlay || isOuter ? 0 : stacked ? 1 : i;
                const innerSlots = stacked ? 1 : Math.max(1, inner.length);
                const innerIndex = stacked ? 0 : i - 1;

                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    stackId={overlay && !isOuter && stacked ? 'inner' : !overlay && stacked ? 'a' : undefined}
                    isAnimationActive={ANIMATE}
                    animationDuration={450}
                    shape={(p: BarGeom) => {
                      const g = geom(p);
                      if (g.h < 0.5) return <g />;
                      // Kataklar yonma-yon turadi: shu ustunning katagidan butun kun kengligini tiklaymiz
                      const bandW = g.w * slots;
                      const center = g.x - g.w * slot + bandW / 2;
                      const full = Math.min(bandW, MAX_BAND);
                      const fill = g.negative && s.negColor ? `url(#neg-${uid}-${s.key})` : `url(#bar-${uid}-${s.key})`;

                      if (isOuter) {
                        const x = center - full / 2;
                        return (
                          <g>
                            <path d={barPath(x, g.top, full, g.h, 4, g.negative)} fill={color} fillOpacity={0.26} />
                            {/* Tepadagi chiziqcha: och ustunning balandligi aniq o'qilsin */}
                            <rect
                              x={x}
                              y={g.negative ? g.top + g.h - 2 : g.top}
                              width={full}
                              height={Math.min(2, g.h)}
                              rx={1}
                              fill={color}
                              fillOpacity={0.9}
                            />
                          </g>
                        );
                      }

                      if (!overlay) {
                        // Ustma-ust yig'ilganda faqat eng tepadagi bo'lak yumaloqlanadi
                        const top = !stacked || series.slice(i + 1).every((n) => num(p.payload?.[n.key]) <= 0);
                        return <path d={barPath(center - full / 2, g.top, full, g.h, top ? 4 : 0, g.negative)} fill={fill} />;
                      }

                      const region = full * (innerSlots === 1 ? 0.46 : 0.7);
                      const cell = region / innerSlots;
                      const gap = innerSlots > 1 ? Math.min(2, cell * 0.2) : 0;
                      const top = !stacked || series.slice(i + 1).every((n) => num(p.payload?.[n.key]) <= 0);
                      return (
                        <path
                          d={barPath(
                            center - region / 2 + innerIndex * cell + gap / 2,
                            g.top,
                            Math.max(2, cell - gap),
                            g.h,
                            top ? 3 : 0,
                            g.negative,
                          )}
                          fill={fill}
                        />
                      );
                    }}
                  />
                );
              })}
              {compareLine}
            </BarRoot>
          ) : (
            <AreaRoot data={rows} margin={margin}>
              <defs>
                {series.map((s, i) => {
                  const color = s.color ?? seriesColor(i);
                  return (
                    <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              {common}
              {tooltip}
              {series.map((s, i) => {
                const color = s.color ?? seriesColor(i);
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    fill={s.type === 'line' ? 'none' : `url(#grad-${uid}-${s.key})`}
                    stackId={stacked ? 'a' : undefined}
                    dot={false}
                    activeDot={{ r: 4.5, strokeWidth: 2.5, stroke: 'rgb(var(--c-surface))' }}
                    isAnimationActive={ANIMATE}
                    animationDuration={600}
                  />
                );
              })}
              {compareLine}
            </AreaRoot>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Chiziqli grafik — qo'shilmaydigan qiymatlar uchun (masalan kunlik qoldiq) */
export function LinesChart({ data, xKey = 'date', series, height = 280, className, xIsDate = true, showLegend = true }: BaseProps) {
  const f = useFormat();
  const dates = useDateLabels();
  const axis = chartAxisProps();
  const range = extent(
    data,
    series.map((s) => s.key),
  );
  const y = useYScale(range.min, range.max, range.integers);

  return (
    <div className={cn('w-full', className)}>
      <LegendRow items={showLegend ? series.map((s, i) => ({ name: s.name, color: s.color ?? seriesColor(i) })) : []} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.7} />
            <XAxis
              dataKey={xKey}
              {...axis}
              tickFormatter={(v: string) => (xIsDate ? dates.day(v) : String(v))}
              minTickGap={28}
              tickMargin={8}
            />
            <YAxis {...axis} ticks={y.ticks} domain={y.domain} tickFormatter={y.label} width={y.width} interval={0} />
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={TIP_WRAPPER}
              cursor={CURSOR_LINE}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                return (
                  <TipCard
                    title={xIsDate ? dates.day(row[xKey]) : String(row[xKey] ?? '')}
                    rows={series.map((s, i) => ({
                      name: s.name,
                      color: s.color ?? seriesColor(i),
                      value: s.money ? f.money(num(row[s.key])) : f.num(num(row[s.key])),
                    }))}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color ?? seriesColor(i)}
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4.5, strokeWidth: 2.5, stroke: 'rgb(var(--c-surface))' }}
                isAnimationActive={ANIMATE}
                animationDuration={600}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────── Ikki o'qli grafik ───────────────────────────

/** Ikki o'qli grafikning chizig'i (o'ng o'q) */
export interface ComboLineDef {
  key: string;
  name: string;
  color?: string;
  money?: boolean;
  /**
   * Nisbat: katakdagi qiymat = surat ÷ maxraj, masalan o'rtacha narx =
   * tushum ÷ dona. Haftalik/oylik katakda ham qayta shunday hisoblanadi —
   * kunlik narxlarning o'rtachasi emas. Maxraj 0 bo'lgan katakda qiymat yo'q
   * (sotuv bo'lmagan kunning "narxi" o'ylab topilmaydi). Berilmasa — `key` yig'indisi.
   */
  ratioOf?: [string, string];
}

/** Chiziq qiymati qatorda shu kalitda — sahifa kalitlari bilan to'qnashmaydi */
const COMBO_LINE = '__line';

/**
 * O'ng o'q belgilari chap o'qdagi bilan BIR XIL sonda: ikkala o'qning
 * yozuvlari bitta to'r chizig'iga tushadi. Aks holda chap o'q 0–40 ni 4 ga,
 * o'ng o'q 0–60 ming ni 3 ga bo'lib, o'ng yozuvlar chiziqlar orasida "suzib"
 * qolardi. Qadam — 1 / 2 / 2,5 / 5 ning o'n darajasi (niceTicks bilan bir xil).
 */
function alignedTicks(max: number, intervals: number, integers: boolean): number[] {
  const n = Math.max(1, intervals);
  if (!(max > 0)) return Array.from({ length: n + 1 }, (_, i) => i);
  let pow = 10 ** Math.floor(Math.log10(max / n));
  if (integers) pow = Math.max(1, pow);
  let step = pow * 10;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const s = m * pow;
    if (integers && !Number.isInteger(s)) continue;
    if (s * n >= max - 1e-9) {
      step = s;
      break;
    }
  }
  return Array.from({ length: n + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

/** Berilgan belgilar uchun o'q kengligi va yozuv funksiyasi (useYScale bilan bir xil o'lchov) */
function useTickAxis(ticks: number[]) {
  const label = useAxisLabel();
  const longest = Math.max(...ticks.map((v) => label(v).length));
  return {
    label,
    ticks,
    domain: [ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1] as [number, number],
    width: Math.min(88, Math.max(26, Math.round(longest * 6.2 + 14))),
  };
}

/**
 * Ikki o'qli grafik: ustunlar — chap o'q (masalan, sotilgan dona), chiziq —
 * o'ng o'q (o'rtacha narx yoki tushum). Qiymatlar manfiy bo'lmaydi (dona,
 * narx, tushum) — ikkala o'q noldan boshlanadi.
 *
 * Ilgari mahsulot sahifasida dona pul o'qida chizilsa nolga yopishib qolardi
 * (o'ng o'q yo'q edi), shuning uchun u grafik ustida faqat "Dona: N" chipi
 * edi — narx o'zgarganda sotuv qanday o'zgargani ko'rinmasdi (2026-10-24).
 * Kunlik qatorlar TrendChart'dagi kabi: uzoq bo'sh boshlanish kesiladi, tor
 * ekranda haftalarga yig'iladi, yiriklik almashtirgichi bor.
 */
export function ComboChart({
  data,
  xKey = 'date',
  bar,
  line,
  height = 300,
  className,
}: {
  data: Record<string, unknown>[];
  xKey?: string;
  bar: SeriesDef;
  line: ComboLineDef;
  height?: number;
  className?: string;
}) {
  const f = useFormat();
  const t = useT('charts');
  const dates = useDateLabels();
  const uid = useId().replace(/:/g, '');
  const [picked, setPicked] = useState<Granularity | null>(null);
  const [boxRef, width] = useWidth();
  // Ikki o'q yozuvlari uchun joy ayirilgach, bir kunga kamida 9 px
  const maxBars = width > 0 ? Math.max(8, Math.floor((width - 120) / 9)) : 92;

  const ratio = line.ratioOf ?? null;
  const ratioSig = ratio ? ratio.join('/') : '';
  // Takrorsiz: o'rtacha narxda maxraj ("dona") ustun kaliti bilan bir xil — ikki marta qo'shilsa haftalik dona ikki barobar chiqardi
  const sumSig = [...new Set(ratio ? [bar.key, ...ratio] : [bar.key, line.key])].join('|');

  const prep = useMemo(() => {
    const keys = sumSig.split('|');
    const [num0, den0] = ratioSig ? ratioSig.split('/') : [];
    const lineOf = (r: Row): number | undefined => {
      if (!num0 || !den0) return num(r[line.key]);
      const den = num(r[den0]);
      return den > 0 ? num(r[num0]) / den : undefined;
    };
    const isDates = data.length > 0 && dayNumber(data[0]?.[xKey]) !== null;
    if (!isDates) {
      return {
        rows: data.map(
          (r): Row => ({ ...r, __from: String(r[xKey] ?? ''), __to: String(r[xKey] ?? ''), [COMBO_LINE]: lineOf(r) }),
        ),
        options: ['day'] as Granularity[],
        gran: 'day' as Granularity,
        since: null as string | null,
        isDates,
      };
    }
    const cut = trimLeadingEmpty(data, keys);
    const options = granularityOptions(cut.rows.length);
    const gran = picked && options.includes(picked) ? picked : autoGranularity(cut.rows.length, maxBars);
    // Kesilganda birinchi qator — harakatdan oldingi bo'sh kun; ustunli grafikda u faqat bo'sh katak
    const lead = cut.trimmed > 0 ? 1 : 0;
    const rows = bucketize(cut.rows.slice(lead), xKey, keys, gran).map((b): Row => ({ ...b, [COMBO_LINE]: lineOf(b) }));
    return {
      rows,
      options,
      gran,
      since: cut.trimmed > 0 ? String(cut.rows[1]?.[xKey] ?? '') : null,
      isDates,
    };
  }, [data, xKey, sumSig, ratioSig, line.key, picked, maxBars]);

  const { rows, gran } = prep;
  const barExt = extent(rows, [bar.key]);
  const lineValues = rows
    .map((r) => r[COMBO_LINE])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const lineMax = lineValues.length ? Math.max(0, ...lineValues) : 0;
  const lineIntegers = !ratio && lineValues.every((v) => Number.isInteger(v));

  const leftTicks = niceTicks(0, Math.max(0, barExt.max), 5, barExt.integers);
  const yL = useTickAxis(leftTicks);
  const yR = useTickAxis(alignedTicks(lineMax, leftTicks.length - 1, lineIntegers));
  const axis = chartAxisProps();

  const barColor = bar.color ?? seriesColor(0);
  const lineColor = line.color ?? seriesColor(1);
  const fmtBar = (v: number) => (bar.money ? f.money(v) : f.num(v));
  const fmtLine = (v: number) => (line.money ? f.money(v) : f.num(v, ratio ? 1 : 0));

  // Afsona: ustun — davr jami; chiziq — nisbat bo'lsa butun davr bo'yicha (jami surat ÷ jami maxraj), aks holda jami
  const barSum = rows.reduce((acc, r) => acc + num(r[bar.key]), 0);
  const lineSummary = (() => {
    if (!ratio) return rows.reduce((acc, r) => acc + num(r[line.key]), 0);
    const den = rows.reduce((acc, r) => acc + num(r[ratio[1]]), 0);
    return den > 0 ? rows.reduce((acc, r) => acc + num(r[ratio[0]]), 0) / den : null;
  })();
  const legend: LegendItem[] = [
    { name: bar.name, color: barColor, value: fmtBar(barSum) },
    { name: line.name, color: lineColor, mark: 'line', value: lineSummary === null ? '—' : fmtLine(lineSummary) },
  ];

  const xTick = (v: string) => (!prep.isDates ? String(v) : gran === 'month' ? dates.month(v) : dates.day(v));

  const controls =
    prep.options.length > 1 || prep.since ? (
      <>
        {prep.since ? <span className="text-2xs text-muted">{t('since', { d: dates.day(prep.since) })}</span> : null}
        {prep.options.length > 1 ? (
          <Segmented<Granularity>
            size="sm"
            value={gran}
            onChange={setPicked}
            options={prep.options.map((g) => ({ value: g, label: t(`gran.${g}`) }))}
          />
        ) : null}
      </>
    ) : null;

  return (
    <div ref={boxRef} className={cn('w-full', className)}>
      <LegendRow items={legend} right={controls} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={rows.length > 60 ? '14%' : '22%'}>
            <defs>
              <BarGradient id={`combo-${uid}`} color={barColor} />
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.7} />
            <XAxis dataKey={xKey} {...axis} tickFormatter={xTick} minTickGap={28} tickMargin={8} interval="preserveStartEnd" />
            <YAxis yAxisId="left" {...axis} ticks={yL.ticks} domain={yL.domain} tickFormatter={yL.label} width={yL.width} interval={0} />
            <YAxis
              yAxisId="right"
              orientation="right"
              {...axis}
              ticks={yR.ticks}
              domain={yR.domain}
              tickFormatter={yR.label}
              width={yR.width}
              interval={0}
            />
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={TIP_WRAPPER}
              cursor={<BandCursor count={rows.length} />}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (Bucket & Record<string, unknown>) | undefined;
                if (!active || !row) return null;
                const from = dayNumber(row.__from);
                const to = dayNumber(row.__to);
                const span = prep.isDates ? (to ?? 0) - (from ?? 0) + 1 : 1;
                const lv = row[COMBO_LINE];
                return (
                  <TipCard
                    title={
                      !prep.isDates
                        ? String(row[xKey] ?? '')
                        : gran === 'month'
                          ? dates.month(row.__from, true)
                          : dates.range(row.__from, row.__to)
                    }
                    sub={gran === 'week' && span < 7 ? t('days', { n: span }) : undefined}
                    rows={[
                      { name: bar.name, color: barColor, value: fmtBar(num(row[bar.key])) },
                      {
                        name: line.name,
                        color: lineColor,
                        value: typeof lv === 'number' && Number.isFinite(lv) ? fmtLine(lv) : '—',
                      },
                    ]}
                  />
                );
              }}
            />
            <Bar
              yAxisId="left"
              dataKey={bar.key}
              name={bar.name}
              isAnimationActive={ANIMATE}
              animationDuration={450}
              shape={(p: BarGeom) => {
                const g = geom(p);
                if (g.h < 0.5) return <g />;
                const full = Math.min(g.w, MAX_BAND);
                return <path d={barPath(g.x + (g.w - full) / 2, g.top, full, g.h, 4, g.negative)} fill={`url(#combo-${uid})`} />;
              }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={COMBO_LINE}
              name={line.name}
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              // Sotuv bo'lmagan kunda narx yo'q — chiziq uzilmaydi, lekin nuqta faqat haqiqiy qiymatda
              connectNulls
              dot={rows.length <= 45 ? { r: 2.5, strokeWidth: 0, fill: lineColor } : false}
              activeDot={{ r: 4.5, strokeWidth: 2.5, stroke: 'rgb(var(--c-surface))' }}
              isAnimationActive={ANIMATE}
              animationDuration={600}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────── Ustunli grafiklar ───────────────────────────

export function BarsChart({
  data,
  xKey = 'name',
  series,
  height = 280,
  className,
  xIsDate = false,
  showLegend = false,
  stacked,
  horizontal,
}: BaseProps & { horizontal?: boolean }) {
  const f = useFormat();
  const t = useT('charts');
  const dates = useDateLabels();
  const uid = useId().replace(/:/g, '');
  const axis = chartAxisProps();
  const range = extent(
    data,
    series.map((s) => s.key),
    Boolean(stacked),
  );
  const y = useYScale(range.min, range.max, range.integers);

  // Gorizontal ustunlar — reyting: SVG o'qi o'rniga oddiy ro'yxat (nomlar kesilmaydi, bo'sh joy qolmaydi)
  if (horizontal) return <RankBars data={data} xKey={xKey} series={series} className={className} />;

  const xLabel = (v: unknown) => (xIsDate ? dates.day(v) : String(v ?? ''));

  return (
    <div className={cn('w-full', className)}>
      <LegendRow
        items={
          showLegend
            ? series.map((s, i) => {
                const sum = data.reduce((acc, r) => acc + num(r[s.key]), 0);
                return { name: s.name, color: s.color ?? seriesColor(i), value: s.money ? f.money(sum) : f.num(sum) };
              })
            : []
        }
      />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barGap={3}
            barCategoryGap={data.length > 40 ? '14%' : '26%'}
          >
            <defs>
              {series.map((s, i) => (
                <BarGradient key={s.key} id={`bar-${uid}-${s.key}`} color={s.color ?? seriesColor(i)} />
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeOpacity={0.7} />
            <XAxis dataKey={xKey} {...axis} tickFormatter={xLabel} minTickGap={16} tickMargin={8} />
            <YAxis {...axis} ticks={y.ticks} domain={y.domain} tickFormatter={y.label} width={y.width} interval={0} />
            {range.min < 0 ? <ReferenceLine y={0} stroke="rgb(var(--c-border-strong))" /> : null}
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={TIP_WRAPPER}
              cursor={CURSOR_BAND}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Row | undefined;
                if (!active || !row) return null;
                const sum = series.reduce((acc, s) => acc + num(row[s.key]), 0);
                const money = series.every((s) => s.money);
                return (
                  <TipCard
                    title={xLabel(row[xKey])}
                    rows={series.map((s, i) => ({
                      name: s.name,
                      color: s.color ?? seriesColor(i),
                      value: s.money ? f.money(num(row[s.key])) : f.num(num(row[s.key])),
                      negative: num(row[s.key]) < 0,
                    }))}
                    total={
                      stacked && series.length > 1
                        ? { name: t('total'), color: '', value: money ? f.money(sum) : f.num(sum) }
                        : undefined
                    }
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId={stacked ? 'a' : undefined}
                maxBarSize={46}
                isAnimationActive={ANIMATE}
                animationDuration={450}
                shape={(p: BarGeom) => {
                  const g = geom(p);
                  if (g.h < 0.5) return <g />;
                  const top = !stacked || series.slice(i + 1).every((n) => num(p.payload?.[n.key]) <= 0);
                  return (
                    <path d={barPath(g.x, g.top, g.w, g.h, top ? 4 : 0, g.negative)} fill={`url(#bar-${uid}-${s.key})`} />
                  );
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Reyting ro'yxati: nom, summa, ulush va uzunligi eng katta qiymatga nisbatan chiziq.
 *
 * Qator `sub` maydonini bersa (masalan variant yoki SKU), u nom yonida xira
 * yoziladi — bir xil nomli ikki tovar bir-biridan ajraladi.
 */
function RankBars({
  data,
  xKey,
  series,
  className,
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  className?: string;
}) {
  const f = useFormat();
  const s = series[0];
  if (!s) return null;
  const color = s.color ?? seriesColor(0);
  const rows = data.map((d) => ({
    name: String(d[xKey] ?? ''),
    sub: d.sub ? String(d.sub) : '',
    value: num(d[s.key]),
  }));
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const total = rows.reduce((acc, r) => acc + Math.max(0, r.value), 0);

  return (
    <ol className={cn('space-y-3.5', className)}>
      {rows.map((r, i) => (
        <li key={`${r.name}-${r.sub}-${i}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5">
          <span className="tnum pt-px text-xs font-semibold text-muted">{i + 1}</span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              {/* Nom kesiladi, variant esa hech qachon: aks holda uzun nomli tovarning «ЧЕРН» va «БЕЛЫЙ»i bir xil ko'rinardi */}
              <p className="flex min-w-0 text-sm text-ink" title={r.sub ? `${r.name} · ${r.sub}` : r.name}>
                <span className="truncate">{r.name}</span>
                {r.sub ? <span className="shrink-0 whitespace-pre text-muted"> · {r.sub}</span> : null}
              </p>
              <p className={cn('tnum shrink-0 whitespace-nowrap text-sm font-semibold', r.value < 0 ? 'text-danger' : 'text-ink')}>
                {s.money ? f.money(r.value) : f.num(r.value)}
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`,
                  }}
                />
              </div>
              <span className="tnum w-9 shrink-0 text-right text-2xs text-muted">
                {total > 0 && r.value > 0 ? f.pct((r.value / total) * 100, 0) : '—'}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

// ─────────────────────────── Marja xaritasi ───────────────────────────

interface MapPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  sku?: string;
  /** Nuqta yonidagi qisqa yozuv; berilmasa `name` */
  label?: string;
}

/**
 * Marja xaritasi — har bir nuqta bitta mahsulot.
 *
 * Gorizontal o'q: tushum. Vertikal o'q: marja, %. Nuqta kattaligi: sotilgan
 * dona. Bu IKKI O'QLI grafik EMAS — ikkala o'q ham alohida o'lchov, ya'ni
 * bu oddiy tarqoq diagramma; taqiqlangani bitta seriyaga ikkita Y shkalasi
 * qo'yish edi.
 *
 * Nega shu shakl: "qaysi tovar zo'r ketyapti" degan savolning javobi bitta
 * ustunda ko'rinmaydi. Ko'p sotilib, kam foyda beradigan tovar eng xavfli
 * holat va u aynan shu xaritada — o'ngda, lekin pastda — ko'rinadi.
 *
 * O'rtachadan yuqori nuqtalar yashil, pastdagilari sariq: nuqtaning qaysi
 * tomonda turgani chiziqqa tikilmasdan ham ko'rinadi.
 */
export function ScatterMap({
  data,
  height = 300,
  className,
  xLabel,
  yLabel,
  medianY,
}: {
  data: MapPoint[];
  height?: number;
  className?: string;
  xLabel: string;
  yLabel: string;
  /** Qiyoslash chizig'i — masalan o'rtacha marja */
  medianY?: number;
}) {
  const f = useFormat();
  const t = useT('charts');
  const axis = chartAxisProps();
  const axisLabel = useAxisLabel();

  const xTicks = niceTicks(0, Math.max(1, ...data.map((d) => d.x)), 5);
  const xMax = xTicks[xTicks.length - 1] ?? 1;

  /*
   * O'q 0–100% ga cho'zilmaydi, MA'LUMOTGA moslashadi.
   * Marjalar odatda tor oraliqda (masalan 50–65%) bo'ladi va 0–100 shkalada
   * barcha nuqtalar bitta sathda turib qoladi — xarita tekis chiziqqa
   * aylanadi. Chetlaridan zaxira qoldiriladi; qiyoslash chizig'i ham sig'adi.
   */
  const ys = [...data.map((d) => d.y), ...(medianY !== undefined ? [medianY] : [])];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = Math.max(2, (hi - lo) * 0.18);
  // Belgilar dumaloq foizlarda (55, 60, 65…) — Recharts o'zi tanlasa 58 / 65 / 72 / 83 chiqardi
  const yStep = [1, 2, 5, 10, 20, 50].find((s) => (hi - lo + pad * 2) / s <= 5) ?? 50;
  const yMin = Math.floor((lo - pad) / yStep) * yStep;
  const yMax = Math.ceil((hi + pad) / yStep) * yStep;
  const yTicks = Array.from({ length: Math.round((yMax - yMin) / yStep) + 1 }, (_, i) => yMin + i * yStep);

  const labelled = data.length <= 8;
  const short = (text: string) => (text.length > 18 ? `${text.slice(0, 17)}…` : text);

  return (
    <div className={cn('w-full', className)}>
      {medianY !== undefined ? (
        <LegendRow
          items={[
            { name: t('map.above'), color: CHART_COLORS.brand },
            { name: t('map.below'), color: CHART_COLORS.warn },
            { name: t('map.avg', { v: `${f.dec(medianY, 1)}%` }), color: 'rgb(var(--c-muted))', mark: 'line' },
          ]}
        />
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.6} />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              {...axis}
              ticks={xTicks}
              domain={[0, xMax]}
              tickMargin={8}
              tickFormatter={axisLabel}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              {...axis}
              width={44}
              ticks={yTicks}
              interval={0}
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => `${Math.round(Number(v))}%`}
            />
            {/* Nuqta kattaligi — sotilgan dona; afsona chiqarmaymiz, u shovqin */}
            <ZAxis type="number" dataKey="z" range={[90, 520]} />
            {medianY !== undefined ? (
              <>
                {/* O'rtachadan yuqori maydon yengil yashil: "yaxshi tomon" qaysi ekani ko'rinadi */}
                <ReferenceArea y1={medianY} y2={yMax} fill={CHART_COLORS.brand} fillOpacity={0.05} strokeOpacity={0} />
                <ReferenceLine y={medianY} stroke="rgb(var(--c-muted))" strokeOpacity={0.7} strokeDasharray="4 4" />
              </>
            ) : null}
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={TIP_WRAPPER}
              cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as MapPoint | undefined;
                if (!active || !d) return null;
                const good = medianY === undefined || d.y >= medianY;
                return (
                  <TipCard
                    title={<span className="block max-w-[240px] truncate">{d.name}</span>}
                    rows={[
                      { name: xLabel, color: CHART_COLORS.info, value: f.money(d.x) },
                      {
                        name: yLabel,
                        color: good ? CHART_COLORS.brand : CHART_COLORS.warn,
                        value: `${f.dec(d.y, 1)}%`,
                      },
                    ]}
                    total={{ name: d.sku ?? '', color: '', value: t('units', { n: f.num(d.z) }) }}
                  />
                );
              }}
            />
            <Scatter
              data={data}
              isAnimationActive={ANIMATE}
              animationDuration={450}
              shape={(p: { cx?: number; cy?: number; size?: number; payload?: MapPoint }) => {
                const d = p.payload;
                if (!d) return <g />;
                const cx = num(p.cx);
                const cy = num(p.cy);
                const r = Math.sqrt((num(p.size) || 90) / Math.PI);
                const color = medianY === undefined || d.y >= medianY ? CHART_COLORS.brand : CHART_COLORS.warn;
                // O'ng tomondagi nuqtaning yozuvi chapga chiqadi — aks holda grafikdan tashqariga kesiladi
                const left = d.x > xMax * 0.58;
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={r + 5} fill={color} fillOpacity={0.14} />
                    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.92} stroke="rgb(var(--c-surface))" strokeWidth={2} />
                    {labelled ? (
                      <text
                        x={cx + (left ? -(r + 10) : r + 10)}
                        y={cy}
                        dy="0.35em"
                        textAnchor={left ? 'end' : 'start'}
                        fontSize={11}
                        fontWeight={600}
                        fill="rgb(var(--c-text-soft))"
                      >
                        {short(d.label ?? d.name)}
                      </text>
                    ) : null}
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DonutChart({
  data,
  height = 260,
  money = true,
  center,
  className,
  innerRadius = 62,
  outerRadius = 92,
}: {
  data: DonutDatum[];
  height?: number;
  money?: boolean;
  center?: ReactNode;
  className?: string;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const f = useFormat();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            cornerRadius={3}
            stroke="rgb(var(--c-surface))"
            strokeWidth={2}
            isAnimationActive={ANIMATE}
            animationDuration={500}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? seriesColor(i)} />
            ))}
          </Pie>
          <Tooltip
            isAnimationActive={false}
            wrapperStyle={TIP_WRAPPER}
            content={({ active, payload }) => {
              const item = payload?.[0];
              if (!active || !item) return null;
              const v = num(item.value);
              const index = data.findIndex((d) => d.name === item.name);
              return (
                <TipCard
                  title={String(item.name ?? '')}
                  rows={[
                    {
                      name: total ? f.pct((v / total) * 100) : '—',
                      color: data[index]?.color ?? seriesColor(Math.max(0, index)),
                      value: money ? f.money(v) : f.num(v),
                    },
                  ]}
                />
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {center ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {center}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Grafik uchun kartochka qobig'i. `icon`/`tone` — CardHeader bilan bir xil
 * ko'rinish: ilgari grafik kartochkalari ikonkasiz qolib, yonidagi oddiy
 * kartochkalardan "boshqa dizayn"dek ko'rinardi.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  legend,
  icon,
  tone,
  accent,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  legend?: { name: string; color: string; value?: ReactNode }[];
  icon?: ReactNode;
  tone?: 'brand' | 'info' | 'warn' | 'danger' | 'violet' | 'muted';
  /** Tepadagi ohang chizig'i — Card'dagi kabi, berilmasa `tone` bo'lsa chiziladi */
  accent?: boolean;
}) {
  return (
    <div className={cn('card p-5', tone && `tone-${tone}`, (accent ?? Boolean(tone)) && 'card-accent', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="icon-tile mt-0.5 h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</div>
          ) : null}
          <div className="min-w-0">
            <h3 className="section-title">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      {legend?.length ? <LegendRow items={legend} /> : null}
      {children}
    </div>
  );
}

export { CHART_COLORS, SERIES_PALETTE, SERIES_OTHER, seriesColor };
