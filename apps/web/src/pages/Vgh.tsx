import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Box, CalendarRange, CheckCircle2, Coins, Info, PackageX, Search } from '@/components/icons';
import { LOGISTICS_FEE, TARIFF_EFFECTIVE_FROM, type VghResponse, type VghRow, type VghStatus } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';
import { useFeature, useStores } from '@/store/session';
import { FilterBar } from '@/components/filters';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';
import { useDebounced } from '@/components/sales/useDebounced';
import { NEUTRAL_TONE } from '@/components/stock/common';
import { DataFreshness } from '@/components/trust/DataFreshness';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Segmented,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';
import { VGH_STATUS_TONE, VGH_STATUS_WEIGHT, fractionDigits, vghStatusKey } from '@/components/vgh/format';
import { VGH_SAMPLE } from '@/components/vgh/sample';
import { TariffExplainer } from '@/components/vgh/TariffExplainer';
import { VolumeCalculator } from '@/components/vgh/VolumeCalculator';
import '@/components/vgh/texts';

const PAGE_SIZE = 25;

/** Server qiymati (`rules.minLines`) kelguncha izohdagi raqam */
const DEFAULT_MIN_LINES = 3;

/** Solishtirib bo'lmagan qatorlar (null) jadvalda saralanganda oxirida turadi */
const NONE = -1e15;

type StatusFilter = 'all' | VghStatus;

const FILTERS: StatusFilter[] = ['all', 'mismatch', 'no_dimensions', 'ok', 'insufficient'];

const EMPTY_COUNTS: Record<VghStatus, number> = { ok: 0, mismatch: 0, no_dimensions: 0, insufficient: 0 };

/**
 * Hajm va VGH — Uzum logistika yig'imini kartochkadagi hajm bo'yicha
 * olyaptimi. Ilgari bu hisobot tarifda sotilardi-yu, sahifasi yo'q edi
 * ("tez kunda"), '/warehouse/vgh' esa aslida aylanma kunlarini qaytarardi
 * (2026-10-24).
 */
export default function Vgh() {
  const t = useT('vgh');
  const f = useFormat();
  const q = usePeriodQuery();
  const multiStore = useStores().length > 1;
  // Tarifda to'liq ochiq bo'lmasa so'rov yuborilmaydi — 402 javobi qulf oynasi ostida xato chizardi
  const access = useFeature('vgh_report');

  const [status, setStatus] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput).trim();

  /*
   * Sahifa raqami o'zi tegishli filtr bilan birga saqlanadi: filtr, davr yoki
   * do'kon o'zgarsa u o'z-o'zidan 1 ga qaytadi. useEffect bilan qaytarilganda
   * avval eski sahifa bilan ortiqcha so'rov ketardi.
   */
  const filterKey = [status, search, q.from, q.to, q.storeId ?? ''].join('|');
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });

  const query = {
    ...q,
    page,
    pageSize: PAGE_SIZE,
    status: status === 'all' ? undefined : status,
    search: search || undefined,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['warehouse-vgh', query],
    queryFn: () => api.get<VghResponse>('/warehouse/vgh', query),
    placeholderData: keepPreviousData,
    enabled: access === 'full',
  });

  return (
    <>
      <PageHeader
        icon={<Box className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="vgh_report" />}
        meta={
          <>
            <span className="meta-chip tnum">
              <CalendarRange className="h-3.5 w-3.5" />
              {f.date(q.from)} — {f.date(q.to)}
            </span>
            <DataFreshness />
          </>
        }
      />

      {/* Telefonda do'kon tanlagichi; holat va qidiruv jadval ustida — KPI holat filtriga bog'liq emas */}
      <FilterBar />

      <div className="space-y-5">
        <PlanGate
          feature="vgh_report"
          previewChildren={<VghReport data={VGH_SAMPLE} status="all" search="" multiStore={false} onPage={() => undefined} />}
        >
          <VghReport
            data={data}
            loading={isLoading}
            fetching={isFetching}
            failed={isError}
            error={error}
            onRetry={() => void refetch()}
            status={status}
            search={search}
            multiStore={multiStore}
            onPage={setPage}
            filters={
              <>
                <Segmented<StatusFilter>
                  value={status}
                  onChange={setStatus}
                  options={FILTERS.map((s) => ({
                    value: s,
                    label: t(`filter.${s}`),
                    count: data ? (s === 'all' ? data.totals.skuCount : data.totals.byStatus[s]) : undefined,
                  }))}
                />
                {/* Nom, SKU kodi, shtrix-kod, Uzum ID yoki havola — server umumiy qoida bilan qidiradi (shared search.ts) */}
                <SkuSearchInput value={searchInput} onChange={setSearchInput} className="w-full sm:w-72" />
              </>
            }
          />
        </PlanGate>

        {/*
          Izoh va kalkulyator tarifdan qat'i nazar ochiq: ularda sotuvchining
          ma'lumoti yo'q, faqat Uzumning ochiq tarifi — sinov tarifida ham
          o'lchamni tekshirib ko'rish mumkin.
        */}
        <div className="grid gap-5 lg:grid-cols-5">
          <TariffExplainer
            className="lg:col-span-3"
            minLines={data?.rules.minLines ?? DEFAULT_MIN_LINES}
            effectiveFrom={data?.rules.effectiveFrom}
          />
          <VolumeCalculator className="lg:col-span-2" />
        </div>
      </div>
    </>
  );
}

/** KPI qatori, tarif eslatmasi va SKU jadvali — sahifa ham, sinovdagi namuna ham shu bilan chiziladi */
function VghReport({
  data,
  loading,
  fetching,
  failed,
  error,
  onRetry,
  status,
  search,
  multiStore,
  onPage,
  filters,
}: {
  data: VghResponse | undefined;
  loading?: boolean;
  fetching?: boolean;
  failed?: boolean;
  error?: unknown;
  onRetry?: () => void;
  status: StatusFilter;
  search: string;
  multiStore: boolean;
  onPage: (page: number) => void;
  /** Holat almashtirgichi va qidiruv — sinovdagi namunada yo'q */
  filters?: ReactNode;
}) {
  const t = useT('vgh');
  const f = useFormat();

  const totals = data?.totals;
  const by = totals?.byStatus ?? EMPTY_COUNTS;
  const minLines = data?.rules.minLines ?? DEFAULT_MIN_LINES;
  const effectiveFrom = data?.rules.effectiveFrom ?? TARIFF_EFFECTIVE_FROM;
  const extraPaid = totals?.extraPaid ?? 0;
  const rows = data?.rows.items ?? [];

  const unitL = t('unit.l');
  const liters = (v: number): string => `${f.num(v, fractionDigits(v))} ${unitL}`;
  const weight = (g: number): string =>
    g >= 1000 ? `${f.num(g / 1000, fractionDigits(g / 1000, 2))} ${t('unit.kg')}` : `${f.num(g)} ${t('unit.g')}`;

  /*
   * Ustunlar tartibi gapdek o'qiladi: kartochka bo'yicha kutilgan → Uzum
   * olgani → xulosa → farq. Telefondagi kartada shu sabab "kutilgan" va
   * "Uzum oldi" yonma-yon, holat va davr farqi ostida turadi.
   */
  const columns: Column<VghRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      render: (r) => (
        <ProductTitleCell
          title={r.title}
          subtitle={multiStore && r.storeTitle ? `${r.sku} · ${r.storeTitle}` : r.sku}
          imageUrl={r.imageUrl}
          maxWidth={240}
          minWidth={140}
        />
      ),
      sortable: true,
      sortValue: (r) => r.title,
    },
    {
      key: 'expected',
      header: t('col.expected'),
      align: 'right',
      render: (r) => {
        const card =
          r.volumeL > 0
            ? r.billableL > 0 && Math.abs(r.billableL - r.volumeL) > 1e-9
              ? `${liters(r.volumeL)} → ${liters(r.billableL)}`
              : liters(r.volumeL)
            : t('cell.flat');
        const sub = [card, r.weightGr > 0 ? weight(r.weightGr) : null].filter(Boolean).join(' · ');
        return (
          <div className="text-right">
            <p className="tnum text-ink">{f.money(r.expectedFee)}</p>
            <p className="tnum text-2xs text-muted">{sub}</p>
          </div>
        );
      },
      sortable: true,
      sortValue: (r) => r.expectedFee,
    },
    {
      key: 'actual',
      header: t('col.actual'),
      align: 'right',
      render: (r) =>
        r.actualFee === null ? (
          <div className="text-right">
            <p className="text-muted">—</p>
            {r.status === 'insufficient' || r.lines > 0 ? (
              <p className="tnum text-2xs text-muted">{t('cell.lines', { n: f.num(r.lines), min: f.num(minLines) })}</p>
            ) : null}
          </div>
        ) : (
          <div className="text-right">
            <p className={cn('tnum font-medium', r.direction === 'over' ? 'text-danger-ink' : 'text-ink')}>
              {f.money(r.actualFee)}
            </p>
            <p className="tnum text-2xs text-muted">{r.actualL !== null ? `≈ ${liters(r.actualL)}` : t('cell.cap')}</p>
          </div>
        ),
      sortable: true,
      sortValue: (r) => r.actualFee ?? NONE,
    },
    {
      key: 'status',
      header: t('col.status'),
      render: (r) => <StatusCell row={r} minLines={minLines} />,
      sortable: true,
      sortValue: (r) => VGH_STATUS_WEIGHT[vghStatusKey(r)],
    },
    {
      key: 'extraUnit',
      header: t('col.extraUnit'),
      align: 'right',
      // 1366px da jadval gorizontal surilmasin — davr farqi asosiy raqam
      hideBelow: 'xl',
      render: (r) => <SignedMoney value={r.extraPerUnit} />,
      sortable: true,
      sortValue: (r) => r.extraPerUnit ?? NONE,
    },
    {
      key: 'units',
      header: t('col.units'),
      align: 'right',
      hideBelow: '2xl',
      render: (r) => <span className="tnum">{f.num(r.units)}</span>,
      sortable: true,
      sortValue: (r) => r.units,
    },
    {
      key: 'extraTotal',
      header: t('col.extraTotal'),
      align: 'right',
      render: (r) => <SignedMoney value={r.extraTotal} strong />,
      sortable: true,
      sortValue: (r) => r.extraTotal ?? NONE,
    },
  ];

  const empty =
    (totals?.skuCount ?? 0) === 0 && !search ? (
      <EmptyState icon={<Box className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
    ) : status === 'mismatch' && !search && by.ok > 0 ? (
      // "Farq bor" bo'sh — bu yaxshi xabar, "topilmadi" emas
      <EmptyState
        icon={<CheckCircle2 className="h-6 w-6 text-brand-ink" />}
        title={t('empty.noMismatch')}
        hint={t('empty.noMismatchHint')}
      />
    ) : (
      <EmptyState icon={<Search className="h-6 w-6" />} title={t('empty.filtered')} hint={t('empty.filteredHint')} />
    );

  return (
    <div className="space-y-5">
      {/*
        Ohanglar: mos — yashil; farq — sariq (ichida ko'p ham, kam ham bor);
        o'lchamsiz tarif — binafsha (Uzum oladigan qism, jadvaldagi nishon
        bilan bir rang); ortiqcha to'lov — qizil, chunki bu yo'qotilgan pul.
        Nol bo'lsa kartochka kulrang — "0 farq" qizil xavf deb o'qilmasin.
      */}
      <StatGrid>
        <StatCard
          label={t('kpi.ok')}
          value={f.num(by.ok)}
          hint={t('kpi.okHint')}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="brand"
          className={by.ok > 0 ? undefined : NEUTRAL_TONE}
          loading={loading}
        />
        <StatCard
          label={t('kpi.mismatch')}
          value={f.num(by.mismatch)}
          hint={totals && totals.over > 0 ? t('kpi.mismatchOver', { n: f.num(totals.over) }) : t('kpi.mismatchHint')}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warn"
          className={by.mismatch > 0 ? undefined : NEUTRAL_TONE}
          loading={loading}
        />
        <StatCard
          label={t('kpi.noDims')}
          value={f.num(by.no_dimensions)}
          hint={t('kpi.noDimsHint', { fee: f.money(LOGISTICS_FEE.noDimensions) })}
          icon={<PackageX className="h-5 w-5" />}
          tone="violet"
          className={by.no_dimensions > 0 ? undefined : NEUTRAL_TONE}
          loading={loading}
        />
        <StatCard
          label={t('kpi.extra')}
          value={f.money(extraPaid)}
          hint={extraPaid > 0 ? t('kpi.extraHint', { n: f.num(totals?.extraUnits ?? 0) }) : t('kpi.extraNone')}
          icon={<Coins className="h-5 w-5" />}
          tone="danger"
          className={extraPaid > 0 ? undefined : NEUTRAL_TONE}
          loading={loading}
        />
      </StatGrid>

      {data && data.period.from < effectiveFrom ? (
        <div className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info/5 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" />
          <p className="text-sm leading-relaxed text-ink-soft">
            {t('notice.beforeTariff', { date: f.date(effectiveFrom) })}
          </p>
        </div>
      ) : null}

      {filters ? <div className="flex flex-wrap items-center gap-2.5">{filters}</div> : null}

      {failed ? (
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />
        </Card>
      ) : (
        <Card>
          <CardHeader
            icon={<Box />}
            title={t('table.title')}
            subtitle={t('table.sub')}
            actions={
              <span className="meta-chip tnum">
                {f.num(data?.rows.total ?? 0)} {t('common.rows')}
              </span>
            }
          />
          <div className={cn('mt-4 transition-opacity', fetching && !loading && 'opacity-70')}>
            <DataTable<VghRow>
              columns={columns}
              rows={rows}
              rowKey={(r) => r.skuId}
              loading={loading}
              empty={empty}
              pagination={
                data
                  ? {
                      page: data.rows.page,
                      pages: data.rows.pages,
                      total: data.rows.total,
                      pageSize: data.rows.pageSize,
                      onPage,
                    }
                  : undefined
              }
            />
          </div>
        </Card>
      )}
    </div>
  );
}

/** Holat nishoni; izohi sichqoncha olib borilganda chiqadi */
function StatusCell({ row, minLines }: { row: VghRow; minLines: number }) {
  const t = useT('vgh');
  const f = useFormat();
  const key = vghStatusKey(row);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge
        tone={VGH_STATUS_TONE[key]}
        dot
        className="whitespace-nowrap"
        title={t(`tip.${key}`, { fee: f.money(LOGISTICS_FEE.noDimensions), min: f.num(minLines) })}
      >
        {t(`status.${key}`)}
      </Badge>
      {/*
        Bizda hajm 0, Uzum esa hajm bo'yicha (50 000 dan kam) olmoqda — demak
        o'lcham Uzum kartochkasida bor, SavdoIQ'ga kelmagan. "50 000 to'laysiz"
        deb qo'rqitmaslik uchun shu yerda aytiladi.
      */}
      {row.status === 'no_dimensions' && row.actualL !== null ? (
        <p className="max-w-[15rem] whitespace-normal text-2xs leading-snug text-muted">{t('cell.uzumHasDims')}</p>
      ) : null}
    </div>
  );
}

/** Ishorali summa: ortiqcha — qizil "+", kam — yashil "−", mos — kulrang 0, solishtirib bo'lmasa — tire */
function SignedMoney({ value, strong }: { value: number | null; strong?: boolean }) {
  const f = useFormat();
  if (value === null) return <span className="text-muted">—</span>;
  if (value === 0) return <span className="tnum text-muted">{f.money(0)}</span>;
  return (
    <span
      className={cn(
        'tnum whitespace-nowrap',
        strong && 'font-semibold',
        value > 0 ? 'text-danger-ink' : 'text-brand-ink',
      )}
    >
      {value > 0 ? '+' : '−'}
      {f.money(Math.abs(value))}
    </span>
  );
}
