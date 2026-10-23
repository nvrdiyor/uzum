import { useMemo } from 'react';
import { Clock3, Gauge, ShieldCheck, Wallet } from '@/components/icons';
import type { LossesResponse, LossRow } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ProgressBar,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';

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
      render: (r) => (
        <ProductTitleCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} imageUrl={r.imageUrl} maxWidth={280} />
      ),
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
      {/*
        Sahifadagi boshqa KPI'lar bilan bir xil StatCard: ilgari bu yerda
        o'z plitkalari turardi — boshqa shrift, aksent chiziqsiz va boshqa
        o'lchamdagi belgi bilan, tab almashganda sahifa "boshqa dizayn"ga o'tardi.
      */}
      <StatGrid>
        <StatCard
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="brand"
          label={t('comp.received')}
          value={f.money(receivedAmount)}
          hint={t('comp.receivedHint', { n: received.length })}
        />
        <StatCard
          icon={<Clock3 className="h-5 w-5" />}
          tone="warn"
          label={t('comp.pending')}
          value={f.money(pendingAmount)}
          hint={t('comp.pendingHint', { n: pending.length })}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          tone="danger"
          label={t('comp.rejected')}
          value={f.money(rejectedAmount)}
          hint={t('comp.rejectedHint', { n: rejected.length })}
        />
      </StatGrid>

      <Card>
        <CardHeader
          icon={<Gauge className="h-4 w-4" />}
          title={t('comp.rate')}
          subtitle={t('comp.rateHint')}
          actions={
            <span className="tnum font-display text-2xl font-bold tracking-tight text-ink">{f.pct(coverPct)}</span>
          }
        />
        <CardBody>
          <ProgressBar value={coverPct} tone={coverPct >= 70 ? 'brand' : coverPct >= 35 ? 'warn' : 'danger'} />
        </CardBody>
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
