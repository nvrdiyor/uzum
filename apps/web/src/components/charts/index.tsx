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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, SERIES_PALETTE, chartAxisProps, tooltipStyle } from '@/lib/theme';
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
              const color = s.color ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
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
            formatter={fmt as never}
            labelFormatter={(l) => (xIsDate ? f.date(String(l)) : String(l))}
            cursor={{ stroke: 'rgb(var(--c-border-strong))', strokeWidth: 1 }}
          />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /> : null}
          {series.map((s, i) => {
            const color = s.color ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
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
          <Tooltip contentStyle={tooltipStyle()} formatter={fmt as never} />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? SERIES_PALETTE[i % SERIES_PALETTE.length]}
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
              <YAxis type="category" dataKey={xKey} {...axis} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} tickFormatter={(v: string) => (xIsDate ? String(v).slice(5) : String(v))} minTickGap={16} />
              <YAxis {...axis} tickFormatter={(v: number) => f.compact(Number(v))} width={58} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle()} formatter={fmt as never} cursor={{ fill: 'rgb(var(--c-surface-2))' }} />
          {showLegend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? SERIES_PALETTE[i % SERIES_PALETTE.length]}
              radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
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
              <Cell key={d.name} fill={d.color ?? SERIES_PALETTE[i % SERIES_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle()}
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

export { CHART_COLORS, SERIES_PALETTE };
