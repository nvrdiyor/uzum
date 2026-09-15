import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartAxisProps, tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from '@/lib/theme';
import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';
import { ABC_CHART_COLOR, type AbcGroupKey } from './shared';

export interface ParetoPoint {
  name: string;
  revenue: number;
  cumulative: number;
  group: AbcGroupKey;
}

/**
 * Pareto: ustunlar — SKU tushumi (guruh rangida), chiziq — kumulyativ ulush (%).
 * 80% va 95% chegaralari ABC guruhlarini ajratadi.
 */
export function ParetoChart({
  data,
  height = 320,
  revenueLabel,
  cumulativeLabel,
  className,
}: {
  data: ParetoPoint[];
  height?: number;
  revenueLabel: string;
  cumulativeLabel: string;
  className?: string;
}) {
  const f = useFormat();
  const axis = chartAxisProps();

  const rows = useMemo(
    () => data.map((d, i) => ({ ...d, rank: i + 1 })),
    [data],
  );

  const nameByRank = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => map.set(r.rank, r.name));
    return map;
  }, [rows]);

  const fmt = (value: number, name: string): [string, string] =>
    name === cumulativeLabel
      ? [f.pct(Number(value)), cumulativeLabel]
      : [f.money(Number(value)), revenueLabel];

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="rank" {...axis} minTickGap={16} />
          <YAxis yAxisId="left" {...axis} tickFormatter={(v: number) => f.compact(Number(v))} width={58} />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            ticks={[0, 25, 50, 80, 95, 100]}
            {...axis}
            tickFormatter={(v: number) => `${v}%`}
            width={44}
          />
          <Tooltip
            contentStyle={tooltipStyle()}
            itemStyle={tooltipItemStyle()}
            labelStyle={tooltipLabelStyle()}
            formatter={fmt as never}
            labelFormatter={(l) => nameByRank.get(Number(l)) ?? `#${l}`}
            cursor={{ fill: 'rgb(var(--c-surface-2))' }}
          />
          <ReferenceLine
            yAxisId="right"
            y={80}
            stroke={ABC_CHART_COLOR.A}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
          <ReferenceLine
            yAxisId="right"
            y={95}
            stroke={ABC_CHART_COLOR.B}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
          />
          <Bar yAxisId="left" dataKey="revenue" name={revenueLabel} radius={[6, 6, 0, 0]} maxBarSize={34}>
            {rows.map((r) => (
              <Cell key={`${r.rank}-${r.name}`} fill={ABC_CHART_COLOR[r.group]} fillOpacity={0.85} />
            ))}
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            name={cumulativeLabel}
            stroke="rgb(var(--c-violet))"
            strokeWidth={2.4}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
