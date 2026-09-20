import { type ReactNode, useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  ZAxis,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, SERIES_PALETTE, SERIES_OTHER, seriesColor, chartAxisProps, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from '@/lib/theme';
import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

export interface SeriesDef {
  key: string;
  name: string;
  color?: string;
  /** Pul formatida ko'rsatilsinmi */
  money?: boolean;
  type?: 'area' | 'line' | 'bar';
  yAxis?: 'left' | 'right';
}

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

function useTooltipFormatter(series: SeriesDef[]) {
  const f = useFormat();
  return (value: number, name: string) => {
    const s = series.find((x) => x.name === name || x.key === name);
    return [s?.money ? f.money(Number(value)) : f.num(Number(value)), s?.name ?? name] as [string, string];
  };
}

/** Asosiy trend grafigi — maydonli (area) yoki chiziqli */
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
}: BaseProps) {
  const f = useFormat();
  const uid = useId().replace(/:/g, '');
  const fmt = useTooltipFormatter(series);
  const axis = chartAxisProps();

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? seriesColor(i);
              return (
                <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid ? <CartesianGrid strokeDasharray="3 3" vertical={false} /> : null}
          <XAxis
            dataKey={xKey}
            {...axis}
            tickFormatter={(v: string) => (xIsDate ? String(v).slice(5).replace('-', '.') : String(v))}
            minTickGap={24}
          />
          <YAxis {...axis} tickFormatter={(v: number) => f.compact(Number(v))} width={58} />
          <Tooltip
            contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()}
            formatter={fmt as never}
            labelFormatter={(l) => (xIsDate ? f.date(String(l)) : String(l))}
            cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeWidth: 1 }}
          />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /> : null}
          {series.map((s, i) => {
            const color = s.color ?? seriesColor(i);
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2.4}
                fill={`url(#grad-${uid}-${s.key})`}
                stackId={stacked ? 'a' : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--c-surface))' }}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LinesChart({ data, xKey = 'date', series, height = 280, className, xIsDate = true, showLegend = true }: BaseProps) {
  const f = useFormat();
  const fmt = useTooltipFormatter(series);
  const axis = chartAxisProps();
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axis} tickFormatter={(v: string) => (xIsDate ? String(v).slice(5) : String(v))} minTickGap={24} />
          <YAxis {...axis} tickFormatter={(v: number) => f.compact(Number(v))} width={58} />
          <Tooltip contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()} formatter={fmt as never} />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={2.4}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

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
  const fmt = useTooltipFormatter(series);
  const axis = chartAxisProps();

  /*
   * Burchak radiusi ustun ENIDAN katta bo'lib qolmasligi kerak.
   *
   * Recharts bunday holatda yaroqsiz shakl yasaydi va ustunni UMUMAN
   * chizmaydi: o'qlar, to'r va afsona joyida turadi-yu, ustunlar yo'q.
   * 127 ta kun 900 px ga sig'dirilganda ustun eni ~5 px bo'ladi, radius
   * esa 8 px edi — grafik bo'm-bo'sh chiqardi.
   */
  const radius = data.length > 60 ? 0 : data.length > 30 ? 2 : 4;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, left: horizontal ? 12 : 0, bottom: 0 }}
          barCategoryGap={horizontal ? 6 : '22%'}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={(v: number) => f.compact(Number(v))} />
              {/* interval=0 — har bir ustunning nomi chiqadi; ilgari qismi tushib qolardi */}
              <YAxis
                type="category"
                dataKey={xKey}
                {...axis}
                width={196}
                interval={0}
                tickFormatter={(v: string) => {
                  const text = String(v);
                  return text.length > 32 ? `${text.slice(0, 31)}…` : text;
                }}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} tickFormatter={(v: string) => (xIsDate ? String(v).slice(5) : String(v))} minTickGap={16} />
              <YAxis {...axis} tickFormatter={(v: number) => f.compact(Number(v))} width={58} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()} formatter={fmt as never} cursor={{ fill: 'rgb(var(--c-surface-2))' }} />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? seriesColor(i)}
              radius={horizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0]}
              stackId={stacked ? 'a' : undefined}
              maxBarSize={horizontal ? 22 : 46}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
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
 */
export function ScatterMap({
  data,
  height = 300,
  className,
  xLabel,
  yLabel,
  medianY,
}: {
  data: { x: number; y: number; z: number; name: string; sku?: string }[];
  height?: number;
  className?: string;
  xLabel: string;
  yLabel: string;
  /** Qiyoslash chizig'i — masalan o'rtacha marja */
  medianY?: number;
}) {
  const f = useFormat();
  const axis = chartAxisProps();

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={xLabel}
            {...axis}
            tickFormatter={(v: number) => f.compact(Number(v))}
          />
          {/*
            O'q 0–100% ga cho'zilmaydi, MA'LUMOTGA moslashadi.
            Marjalar odatda tor oraliqda (masalan 50–65%) bo'ladi va
            0–100 shkalada barcha nuqtalar bitta sathda turib qoladi —
            xarita tekis chiziqqa aylanadi va hech narsani taqqoslab
            bo'lmaydi. Chetlaridan 10% zaxira qoldiriladi.
          */}
          <YAxis
            type="number"
            dataKey="y"
            name={yLabel}
            {...axis}
            width={48}
            domain={([min, max]: [number, number]) => {
              const pad = Math.max(2, (max - min) * 0.18);
              return [Math.floor(min - pad), Math.ceil(max + pad)];
            }}
            tickFormatter={(v: number) => `${Math.round(Number(v))}%`}
          />
          {/* Nuqta kattaligi — sotilgan dona; afsona chiqarmaymiz, u shovqin */}
          <ZAxis type="number" dataKey="z" range={[60, 460]} />
          {medianY !== undefined ? (
            <ReferenceLine
              y={medianY}
              stroke="rgb(var(--c-border-strong))"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
          ) : null}
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as { name: string; sku?: string; x: number; y: number; z: number };
              return (
                <div style={tooltipStyle()}>
                  <p style={{ ...tooltipLabelStyle(), maxWidth: 260 }}>{d.name}</p>
                  {d.sku ? <p style={{ ...tooltipLabelStyle(), marginBottom: 6 }}>{d.sku}</p> : null}
                  <p style={tooltipItemStyle()}>
                    {xLabel}: {f.money(d.x)}
                  </p>
                  <p style={tooltipItemStyle()}>
                    {yLabel}: {f.dec(d.y, 1)}%
                  </p>
                  <p style={tooltipItemStyle()}>{f.num(d.z)} dona</p>
                </div>
              );
            }}
          />
          <Scatter data={data} fill={CHART_COLORS.brand} fillOpacity={0.75} stroke="rgb(var(--c-surface))" strokeWidth={2} />
        </ScatterChart>
      </ResponsiveContainer>
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
            stroke="rgb(var(--c-surface))"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? seriesColor(i)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()}
            formatter={(v: number, n: string) => [
              `${money ? f.money(Number(v)) : f.num(Number(v))} · ${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%`,
              n,
            ]}
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

/** Grafik uchun kartochka qobig'i */
export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  legend,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  legend?: { name: string; color: string; value?: ReactNode }[];
}) {
  return (
    <div className={cn('card p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-title">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {legend?.length ? (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
          {legend.map((l) => (
            <div key={l.name} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              <span className="text-muted">{l.name}</span>
              {l.value !== undefined ? <span className="tnum font-semibold text-ink">{l.value}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export { CHART_COLORS, SERIES_PALETTE, SERIES_OTHER, seriesColor };
