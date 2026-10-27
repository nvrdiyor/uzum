/**
 * Kategoriyalarning tushumdagi ulushi — halqa va yonida ro'yxat (Kategoriyalarim).
 *
 * Ulush SOTUVCHINING O'Z tushumidagi ulush, bozordagi emas. Halqada eng
 * ko'pi 8 bo'lak: palitra aylantirilmaydi (lib/theme.ts seriesColor) — 9-
 * kategoriya birinchisining rangini olsa, ikkalasi bitta bo'lib ko'rinardi,
 * shuning uchun ettinchidan keyingilari bitta "Boshqalar" bo'lagiga yig'iladi.
 * Ro'yxatda ulush o'zgarishi foiz punktida (taqqoslash davri bo'lsa).
 */
import { useMemo } from 'react';
import type { CategoryRow } from '@savdoiq/shared';
import { DonutChart, SERIES_OTHER, seriesColor } from '@/components/charts';
import { Amount, Delta } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Halqadagi eng ko'p bo'lak (palitra uzunligi) */
const MAX_SLICES = 8;

/** Tushumli kategoriyalar, tushum bo'yicha — halqa va jadvaldagi rang nuqtasi BITTA tartibdan */
const bySales = (rows: CategoryRow[]): CategoryRow[] =>
  rows.filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue);

/**
 * Kategoriya → rang: halqadagi bo'lak rangi bilan aynan bir xil (jadvaldagi
 * nuqta qaysi bo'lak ekanini ko'rsatadi). "Boshqalar" ga tushgani va
 * tushumsizi — neytral rang.
 */
export function categoryColors(rows: CategoryRow[]): Map<string | null, string> {
  const selling = bySales(rows);
  const headSize = selling.length > MAX_SLICES ? MAX_SLICES - 1 : selling.length;
  const out = new Map<string | null, string>();
  selling.forEach((r, i) => out.set(r.category, i < headSize ? seriesColor(i) : SERIES_OTHER));
  return out;
}

interface Slice {
  key: string;
  name: string;
  value: number;
  share: number;
  shareDelta: number | null;
  color: string;
}

export function CategoryShare({
  rows,
  revenue,
  compared,
  className,
}: {
  rows: CategoryRow[];
  /** Jami tushum — halqa markazida */
  revenue: number;
  /** Taqqoslash davri bormi — bo'lmasa ulush o'zgarishi chiqmaydi */
  compared: boolean;
  className?: string;
}) {
  const t = useT('categories');
  const f = useFormat();

  const slices = useMemo<Slice[]>(() => {
    const selling = bySales(rows);
    const named = (r: CategoryRow) => r.category ?? t('uncategorized');
    const head = selling.length > MAX_SLICES ? selling.slice(0, MAX_SLICES - 1) : selling;
    const out: Slice[] = head.map((r, i) => ({
      key: r.category ?? '∅',
      name: named(r),
      value: r.revenue,
      share: r.revenueShare,
      shareDelta: r.deltas.revenueShare,
      color: seriesColor(i),
    }));
    const tail = selling.slice(head.length);
    if (tail.length > 0) {
      const value = tail.reduce((s, r) => s + r.revenue, 0);
      out.push({
        key: '__other',
        name: t('hero.other', { n: tail.length }),
        value,
        share: revenue > 0 ? Math.round((value / revenue) * 10_000) / 100 : 0,
        shareDelta: null,
        color: SERIES_OTHER,
      });
    }
    return out;
  }, [rows, revenue, t]);

  if (slices.length === 0) return null;

  return (
    <div className={cn('grid items-center gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]', className)}>
      <DonutChart
        data={slices.map((s) => ({ name: s.name, value: s.value, color: s.color }))}
        height={180}
        innerRadius={54}
        outerRadius={80}
        center={
          <>
            {/* Markazda — jami tushum ("ulush" sarlavhasi halqa ustida bor, ikki marta yozilmaydi) */}
            <span className="eyebrow">{t('kpi.revenue')}</span>
            <span className="tnum mt-0.5 font-display text-sm font-bold text-ink">{f.compact(revenue)}</span>
          </>
        }
      />
      <ul className="min-w-0 space-y-1.5">
        {slices.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft" title={`${s.name} · ${f.money(s.value)}`}>
              {s.name}
            </span>
            {/*
              Summa faqat juda keng ekranda: 1366 px'da u nomni "P." gacha siqib
              qo'yardi (2026-10-24 skrinshoti). Summa jadvalda va izohda bor.
            */}
            <span className="tnum hidden shrink-0 whitespace-nowrap text-xs text-muted 2xl:inline">
              <Amount value={f.money(s.value)} nowrap />
            </span>
            <span className="tnum w-14 shrink-0 text-right font-semibold text-ink">{f.pct(s.share)}</span>
            {compared ? <Delta value={s.shareDelta} unit="pp" className="shrink-0 px-1.5 py-0.5 text-2xs" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
