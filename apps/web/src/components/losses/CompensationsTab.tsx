import { useMemo, type ReactNode } from 'react';
import { Clock3, ShieldCheck, Wallet } from 'lucide-react';
import type { LossesResponse, LossRow } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ProductCell,
  ProgressBar,
  type Column,
} from '@/components/ui';

const STATUS_TONE = {
  open: 'warn',
  claimed: 'info',
  compensated: 'brand',
  rejected: 'danger',
} as const;

/**
 * "Kompensatsiyalar hisoboti" tabi:
 * — olingan kompensatsiyalar tarixi
 * — kutilayotgan (da'vo yuborilgan yoki hali ochiq) summalar
 */
export function CompensationsTab({
  rows,
  loading,
  claims,
}: {
  rows: LossRow[];
  loading: boolean;
  /** Butun davr bo'yicha da'vo jamilari (serverdan) */
  claims?: LossesResponse['claims'];
}) {
  const t = useT('losses');
  const f = useFormat();

  const received = useMemo(() => rows.filter((r) => r.compensated > 0), [rows]);
  const pending = useMemo(
    () => rows.filter((r) => r.compensated <= 0 && (r.status === 'open' || r.status === 'claimed')),
    [rows],
  );
  const rejected = useMemo(() => rows.filter((r) => r.status === 'rejected'), [rows]);

  /**
   * Summalar serverdan — BUTUN davr bo'yicha. Jadval esa joriy sahifani
   * ko'rsatadi, shuning uchun ularni qatorlardan hisoblash noto'g'ri edi:
   * raqamlar sahifa almashganda o'zgarib ketardi va tepadagi KPI bilan
   * mos kelmasdi.
   */
  const receivedAmount = claims?.receivedAmount ?? received.reduce((s, r) => s + r.compensated, 0);
  const pendingAmount = claims?.pendingAmount ?? pending.reduce((s, r) => s + r.amount, 0);
  const rejectedAmount = claims?.rejectedAmount ?? rejected.reduce((s, r) => s + r.amount, 0);
  const claimable = receivedAmount + pendingAmount;
  const coverPct = claimable > 0 ? (receivedAmount / claimable) * 100 : 0;

  const baseCols: Column<LossRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: '34%',
      render: (r) => <ProductCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} imageUrl={r.imageUrl} />,
      sortable: true,
      sortValue: (r) => r.title ?? r.sku ?? '',
    },
    {
      key: 'scheme',
      header: t('col.scheme'),
      hideOnMobile: true,
      render: (r) => <Badge tone={r.scheme === 'FBO' ? 'violet' : 'info'}>{r.scheme}</Badge>,
      sortValue: (r) => r.scheme,
    },
    {
      key: 'qty',
      header: t('col.qty'),
      align: 'right',
      render: (r) => <span className="tnum">{f.num(r.qty)}</span>,
      sortable: true,
      sortValue: (r) => r.qty,
    },
    {
      key: 'amount',
      header: t('col.amount'),
      align: 'right',
      render: (r) => <span className="tnum">{f.money(r.amount)}</span>,
      sortable: true,
      sortValue: (r) => r.amount,
    },
  ];

  const receivedCols: Column<LossRow>[] = [
    ...baseCols,
    {
      key: 'compensated',
      header: t('col.compensated'),
      align: 'right',
      render: (r) => <span className="tnum font-semibold text-brand-ink">{f.money(r.compensated)}</span>,
      sortable: true,
      sortValue: (r) => r.compensated,
    },
    {
      key: 'date',
      header: t('col.date'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => <span className="tnum text-muted">{f.date(r.happenedAt)}</span>,
      sortable: true,
      sortValue: (r) => r.happenedAt,
    },
  ];

  const pendingCols: Column<LossRow>[] = [
    ...baseCols,
    {
      key: 'status',
      header: t('col.status'),
      render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{t(`status.${r.status}`)}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      key: 'date',
      header: t('col.date'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => <span className="tnum text-muted">{f.date(r.happenedAt)}</span>,
      sortable: true,
      sortValue: (r) => r.happenedAt,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryTile
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="brand"
          label={t('comp.received')}
          value={f.money(receivedAmount)}
          hint={t('comp.receivedHint', { n: received.length })}
        />
        <SummaryTile
          icon={<Clock3 className="h-4 w-4" />}
          tone="warn"
          label={t('comp.pending')}
          value={f.money(pendingAmount)}
          hint={t('comp.pendingHint', { n: pending.length })}
        />
        <SummaryTile
          icon={<Wallet className="h-4 w-4" />}
          tone="danger"
          label={t('comp.rejected')}
          value={f.money(rejectedAmount)}
          hint={t('comp.rejectedHint', { n: rejected.length })}
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="section-title">{t('comp.rate')}</p>
            <p className="mt-0.5 text-sm text-muted">{t('comp.rateHint')}</p>
          </div>
          <p className="tnum font-display text-2xl font-extrabold text-ink">{f.pct(coverPct)}</p>
        </div>
        <ProgressBar value={coverPct} tone={coverPct >= 70 ? 'brand' : coverPct >= 35 ? 'warn' : 'danger'} />
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          title={t('comp.receivedTable')}
          subtitle={t('comp.receivedTableSub')}
        />
        <div className="mt-4">
          <DataTable
            columns={receivedCols}
            rows={received}
            rowKey={(r) => r.id}
            loading={loading}
            empty={<EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t('comp.emptyReceived')} hint={t('comp.emptyReceivedHint')} />}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Clock3 className="h-4 w-4" />}
          title={t('comp.pendingTable')}
          subtitle={t('comp.pendingTableSub')}
        />
        <div className="mt-4">
          <DataTable
            columns={pendingCols}
            rows={pending}
            rowKey={(r) => r.id}
            loading={loading}
            empty={<EmptyState icon={<Clock3 className="h-6 w-6" />} title={t('comp.emptyPending')} hint={t('comp.emptyPendingHint')} />}
          />
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: 'brand' | 'warn' | 'danger';
}) {
  const toneClass = {
    brand: 'bg-brand/10 text-brand-ink',
    warn: 'bg-warn/[0.12] text-warn-ink',
    danger: 'bg-danger/10 text-danger-ink',
  }[tone];
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', toneClass)}>{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      </div>
      <p className="tnum mt-3 font-display text-[22px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
