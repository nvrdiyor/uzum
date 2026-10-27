import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Gauge, Hourglass, Lock, RotateCcw, Star, TrendingDown, TrendingUp } from '@/components/icons';
import type { RadarResponse, RadarSignal, RadarSignalKind } from '@savdoiq/shared';
import { Card, ErrorState, PageHeader, PlanGate, Skeleton, StatCard, StatGrid, type Tone } from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { OwnDataChip, OwnDataNote } from '@/components/growth/OwnData';
import { NewStarRow, ReturnsRow, StockoutRow, VelocityRow } from '@/components/growth/RadarRows';
import { SignalCard } from '@/components/growth/SignalCard';
import '@/components/growth/radarTexts';
import { formatCompareRange } from '@/components/trust/ComparePeriod';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { api } from '@/lib/api';
import { useFeature } from '@/store/session';
import { useUi } from '@/store/ui';
import { useFormat, useT } from '@/i18n';

/** Signal ko'rinishi: sanoq kartochkasi va signal kartochkasi bir xil ikonka va ohangda */
const KIND_VIEW: Record<RadarSignalKind, { icon: ReactNode; tone: Tone; statTone: 'brand' | 'info' | 'warn' | 'danger' | 'violet' }> = {
  accelerating: { icon: <TrendingUp />, tone: 'brand', statTone: 'brand' },
  newStars: { icon: <Star />, tone: 'violet', statTone: 'violet' },
  slowing: { icon: <TrendingDown />, tone: 'info', statTone: 'info' },
  returnsRising: { icon: <RotateCcw />, tone: 'warn', statTone: 'warn' },
  stockout: { icon: <Hourglass />, tone: 'danger', statTone: 'danger' },
};

/** Tartib: avval imkoniyatlar (o'sish bo'limi), keyin xavflar; zaxira — butun kenglikda oxirida */
const ORDER: RadarSignalKind[] = ['accelerating', 'newStars', 'slowing', 'returnsRising', 'stockout'];

const anchor = (kind: RadarSignalKind): string => `radar-${kind}`;

/**
 * Mening radarim — sotuvchining O'Z SKU'lari bo'yicha tezlik, yangi
 * tovar, zaxira va qaytarish signallari (apps/api routes/radar.ts). Bozor
 * ma'lumoti ATAYLAB yo'q — chip va sahifa oxiridagi izoh buni aytadi.
 *
 * Davr tanlagichiga BOG'LIQ EMAS (Boshqaruv panelidagi "Bugun" kabi): oynalar
 * oxirgi to'liq kun bilan tugaydi. Faqat do'kon filtri so'rovga tushadi —
 * shuning uchun so'rov kaliti davrdan emas, do'kondan (2026-10-24).
 *
 * Tarif — 'sales_analytics' (Sotuv tahlili oilasi). Kartalar ichida o'z
 * bo'limining tarifi: "Tez orada tugaydi" — Rejalashtiruvchi, "Qaytarish" —
 * Qaytarishlar hisoboti; yopiq bo'lsa server qatorlarni bermaydi ('locked').
 */
export default function Radar() {
  const t = useT('radar');
  const f = useFormat();
  const storeId = useUi((s) => s.storeId);
  const access = useFeature('sales_analytics');
  const store = storeId === 'all' ? undefined : storeId;

  const query = useQuery({
    queryKey: ['growth-radar', store ?? 'all'],
    queryFn: () => api.get<RadarResponse>('/growth/radar', { storeId: store }),
    enabled: access === 'full',
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        icon={<Gauge className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        meta={
          <>
            {data ? (
              <span className="meta-chip tnum" title={t('meta.windowHint')}>
                <CalendarRange className="h-3.5 w-3.5" />
                {t('meta.window', { range: formatCompareRange(data.windows.recent, f) })}
              </span>
            ) : null}
            <OwnDataChip />
            <DataFreshness />
          </>
        }
      />

      <FilterBar />

      <PlanGate feature="sales_analytics">
        {query.isError ? (
          <Card>
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
            />
          </Card>
        ) : query.isLoading || !data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
              {ORDER.map((k) => (
                <Skeleton key={k} className="h-32 w-full" />
              ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <Skeleton className="h-72 w-full rounded-2xl" />
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          </div>
        ) : (
          <RadarReport data={data} />
        )}
      </PlanGate>
    </>
  );
}

function RadarReport({ data }: { data: RadarResponse }) {
  const t = useT('radar');
  const f = useFormat();
  const th = data.thresholds;

  const rule: Record<RadarSignalKind, string> = {
    accelerating: t('rule.accelerating', { pct: f.num(th.accelMinPct), units: f.num(th.accelMinUnits) }),
    slowing: t('rule.slowing', { pct: f.num(th.slowMinPct), units: f.num(th.slowMinPrevUnits) }),
    newStars: t('rule.newStars', {
      days: f.num(th.newDays),
      units: f.num(th.newMinUnits),
      rate: f.num(th.newMinRate, th.newMinRate >= 10 ? 0 : 1),
    }),
    stockout: t('rule.stockout', { lead: f.num(data.leadDays) }),
    returnsRising: t('rule.returnsRising', {
      pp: f.num(th.returnsMinPp),
      base: f.num(th.returnsMinBase),
      min: f.num(th.returnsMinReturned),
    }),
  };
  const summary: Record<RadarSignalKind, string> = {
    accelerating: t('sum.accelerating', { pct: f.num(th.accelMinPct) }),
    slowing: t('sum.slowing', { pct: f.num(th.slowMinPct) }),
    newStars: t('sum.newStars', { days: f.num(th.newDays) }),
    stockout: t('sum.stockout', { lead: f.num(data.leadDays) }),
    returnsRising: t('sum.returnsRising', { pp: f.num(th.returnsMinPp) }),
  };
  const signals: Record<RadarSignalKind, RadarSignal<unknown>> = {
    accelerating: data.accelerating,
    slowing: data.slowing,
    newStars: data.newStars,
    stockout: data.stockout,
    returnsRising: data.returnsRising,
  };

  const scrollTo = (kind: RadarSignalKind) => {
    document.getElementById(anchor(kind))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-5">
      {/*
        Sanoqlar qatori: har signalda nechta SKU. Bosilsa — o'sha kartaga.
        Nol bo'lsa kartochka ma'no rangini olmaydi — "0 ta tezlashgan" yashil,
        "0 ta tugaydigan" qizil turmasin.
      */}
      <StatGrid>
        {ORDER.map((kind) => {
          const s = signals[kind];
          const view = KIND_VIEW[kind];
          const counted = s.state === 'ready' || s.state === 'locked';
          return (
            <StatCard
              key={kind}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {t(`kind.${kind}`)}
                  {/* Faqat butunlay yopiq bo'lsa; qisman ochiq (`limited`) qulfi kartaning o'zida — yorliq ikki qatorga tushmasin */}
                  {s.state === 'locked' ? <Lock className="h-3 w-3" /> : null}
                </span>
              }
              value={counted ? f.num(s.count) : '—'}
              hint={
                s.state === 'noHistory'
                  ? t('sum.noHistory')
                  : s.state === 'stale'
                    ? t('sum.stale')
                    : s.state === 'locked'
                      ? t('sum.locked')
                      : summary[kind]
              }
              icon={view.icon}
              tone={counted && s.count > 0 ? view.statTone : 'muted'}
              onClick={() => scrollTo(kind)}
            />
          );
        })}
      </StatGrid>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <SignalCard
          id={anchor('accelerating')}
          icon={KIND_VIEW.accelerating.icon}
          tone={KIND_VIEW.accelerating.tone}
          title={t('kind.accelerating')}
          rule={rule.accelerating}
          signal={data.accelerating}
          renderRow={(row) => <VelocityRow row={row} direction="up" />}
          link={{ to: '/products', label: t('link.products') }}
          empty={t('empty.accelerating')}
          emptyHint={t('emptyHint.accelerating')}
          noHistoryHint={t('noHistory.velocity')}
        />
        <SignalCard
          id={anchor('newStars')}
          icon={KIND_VIEW.newStars.icon}
          tone={KIND_VIEW.newStars.tone}
          title={t('kind.newStars')}
          rule={rule.newStars}
          signal={data.newStars}
          renderRow={(row) => <NewStarRow row={row} />}
          link={{ to: '/products', label: t('link.products') }}
          empty={t('empty.newStars')}
          emptyHint={t('emptyHint.newStars', { days: f.num(th.newDays) })}
          noHistoryHint={t('noHistory.newStars', { days: f.num(th.newDays) })}
        />
        <SignalCard
          id={anchor('slowing')}
          icon={KIND_VIEW.slowing.icon}
          tone={KIND_VIEW.slowing.tone}
          title={t('kind.slowing')}
          rule={rule.slowing}
          signal={data.slowing}
          renderRow={(row) => <VelocityRow row={row} direction="down" />}
          link={{ to: '/products', label: t('link.products') }}
          empty={t('empty.slowing')}
          emptyHint={t('emptyHint.slowing')}
          noHistoryHint={t('noHistory.velocity')}
        />
        <SignalCard
          id={anchor('returnsRising')}
          icon={KIND_VIEW.returnsRising.icon}
          tone={KIND_VIEW.returnsRising.tone}
          title={t('kind.returnsRising')}
          rule={rule.returnsRising}
          signal={data.returnsRising}
          renderRow={(row) => <ReturnsRow row={row} />}
          link={{ to: '/returns', label: t('link.returns') }}
          empty={t('empty.returnsRising')}
          emptyHint={t('emptyHint.returnsRising')}
          noHistoryHint={t('noHistory.returns')}
          lockedHint={t('locked.returnsRising')}
        />
        <SignalCard
          id={anchor('stockout')}
          className="xl:col-span-2"
          wide
          icon={KIND_VIEW.stockout.icon}
          tone={KIND_VIEW.stockout.tone}
          title={t('kind.stockout')}
          rule={rule.stockout}
          signal={data.stockout}
          renderRow={(row) => <StockoutRow row={row} />}
          link={{ to: '/planner', label: t('link.planner') }}
          empty={t('empty.stockout')}
          emptyHint={t('emptyHint.stockout')}
          noHistoryHint={t('noHistory.velocity')}
          lockedHint={t('locked.stockout')}
        />
      </div>

      <OwnDataNote>
        <p>{t('note.velocity')}</p>
        <p>{t('note.noise')}</p>
        <p>{t('note.windows')}</p>
      </OwnDataNote>
    </div>
  );
}
