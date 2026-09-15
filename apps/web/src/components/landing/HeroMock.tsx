import { motion } from 'framer-motion';
import { Package, Percent, TrendingUp, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui';
import { TrendChart } from '@/components/charts';
import { CHART_COLORS } from '@/lib/theme';
import { useFormat, useT } from '@/i18n';
import { EASE } from './primitives';

/**
 * Hero'dagi mahsulot mokapi — haqiqiy StatCard va TrendChart komponentlaridan yig'ilgan.
 * Ma'lumot statik namunaviy massiv (hech qanday so'rov yuborilmaydi).
 */

const SERIES: Record<string, unknown>[] = [
  { date: '2026-08-21', revenue: 14_200_000, profit: 3_100_000 },
  { date: '2026-08-22', revenue: 16_400_000, profit: 3_650_000 },
  { date: '2026-08-23', revenue: 15_100_000, profit: 3_280_000 },
  { date: '2026-08-24', revenue: 18_900_000, profit: 4_420_000 },
  { date: '2026-08-25', revenue: 17_300_000, profit: 3_980_000 },
  { date: '2026-08-26', revenue: 21_600_000, profit: 5_240_000 },
  { date: '2026-08-27', revenue: 20_100_000, profit: 4_760_000 },
  { date: '2026-08-28', revenue: 23_800_000, profit: 5_910_000 },
  { date: '2026-08-29', revenue: 22_400_000, profit: 5_380_000 },
  { date: '2026-08-30', revenue: 26_700_000, profit: 6_620_000 },
  { date: '2026-08-31', revenue: 25_300_000, profit: 6_140_000 },
  { date: '2026-09-01', revenue: 29_500_000, profit: 7_480_000 },
  { date: '2026-09-02', revenue: 28_100_000, profit: 7_020_000 },
  { date: '2026-09-03', revenue: 32_400_000, profit: 8_360_000 },
];

const REVENUE_SPARK = [14.2, 16.4, 15.1, 18.9, 17.3, 21.6, 20.1, 23.8, 22.4, 26.7, 25.3, 29.5, 28.1, 32.4];
const PROFIT_SPARK = [3.1, 3.65, 3.28, 4.42, 3.98, 5.24, 4.76, 5.91, 5.38, 6.62, 6.14, 7.48, 7.02, 8.36];

const TOP_ROWS: { name: string; sku: string; sold: number; profit: number; tone: 'brand' | 'info' | 'warn' }[] = [
  { name: 'Simsiz quloqchin Pro', sku: 'SP-1042', sold: 318, profit: 12_400_000, tone: 'brand' },
  { name: 'Termokruzhka 500 ml', sku: 'SP-2210', sold: 204, profit: 7_150_000, tone: 'info' },
  { name: 'Kir yuvish geli 3 l', sku: 'SP-3388', sold: 176, profit: 4_820_000, tone: 'warn' },
];

export function HeroMock() {
  const t = useT('landing');
  const f = useFormat();

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
      className="relative"
    >
      {/* orqa nur */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[36px] bg-brand/10 blur-3xl"
      />

      <div className="card relative overflow-hidden p-3.5 shadow-pop sm:p-4">
        <div className="pointer-events-none absolute inset-0 bg-sheen" aria-hidden />

        {/* mokap "brauzer" qatori */}
        <div className="relative mb-3.5 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand/60" />
            <span className="ml-2 truncate font-display text-sm font-bold text-ink">{t('mock.title')}</span>
          </div>
          <span className="chip shrink-0 bg-brand/10 text-brand">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            <span className="hidden sm:inline">{t('mock.live')}</span>
          </span>
        </div>

        {/* KPI */}
        <div className="relative grid grid-cols-2 gap-3">
          <StatCard
            label={t('mock.revenue')}
            value={f.compact(312_800_000)}
            delta={24.6}
            icon={<TrendingUp className="h-4 w-4" />}
            spark={REVENUE_SPARK}
            tone="brand"
          />
          <StatCard
            label={t('mock.profit')}
            value={f.compact(75_260_000)}
            delta={18.2}
            icon={<Wallet className="h-4 w-4" />}
            spark={PROFIT_SPARK}
            tone="info"
          />
        </div>

        {/* Grafik */}
        <div className="relative mt-3 rounded-2xl border border-line bg-surface-2/60 p-3.5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{t('mock.chart')}</p>
            <span className="chip bg-surface-3 text-muted">{t('mock.period')}</span>
          </div>
          <TrendChart
            data={SERIES}
            height={172}
            showLegend={false}
            series={[
              { key: 'revenue', name: t('mock.revenue'), color: CHART_COLORS.brand, money: true },
              { key: 'profit', name: t('mock.profit'), color: CHART_COLORS.info, money: true },
            ]}
          />
        </div>

        {/* Mini jadval */}
        <div className="relative mt-3 overflow-x-auto rounded-2xl border border-line bg-surface-2/60 p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{t('mock.top')}</p>
            <span className="text-2xs uppercase tracking-wider text-muted">{t('mock.profit')}</span>
          </div>
          <ul className="space-y-2">
            {TOP_ROWS.map((r) => (
              <li key={r.sku} className="flex items-center gap-3">
                <span
                  className={
                    r.tone === 'brand'
                      ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/[0.12] text-brand'
                      : r.tone === 'info'
                        ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info/[0.12] text-info'
                        : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn/[0.12] text-warn'
                  }
                >
                  <Package className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-ink">{r.name}</span>
                  <span className="tnum block text-2xs text-muted">
                    {r.sku} · {f.num(r.sold)} {t('mock.units')}
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs font-bold text-ink">{f.compact(r.profit)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Suzuvchi kichik kartochka */}
      <motion.div
        initial={{ opacity: 0, x: -18, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
        className="absolute -bottom-5 -left-3 hidden items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5 shadow-pop sm:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
          <Percent className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-2xs uppercase tracking-wider text-muted">{t('mock.margin')}</span>
          <span className="tnum block font-display text-sm font-extrabold text-ink">24,1%</span>
        </span>
      </motion.div>
    </motion.div>
  );
}
