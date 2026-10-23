import { useMemo, useState, type ReactNode } from 'react';
import { Clock3, Info, Scale } from '@/components/icons';
import type { StockBalanceRow, StockBalanceState, StockBalanceSummary, StuckOrderRow } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Modal,
  ProductCell,
  Skeleton,
  type Column,
  type Tone,
} from '@/components/ui';
import { BalanceEvidence, CompensationBreakdown } from './BalanceEvidence';
import './texts';

/** Uzoq yo'ldagi buyurtmalardan dastlab nechta ko'rsatiladi */
const STUCK_PREVIEW = 8;

const STATE_TONE: Record<StockBalanceState, Tone> = {
  ok: 'brand',
  loss: 'danger',
  waiting: 'warn',
  settling: 'muted',
  incomplete: 'muted',
};

/**
 * "Tovar balansi" tabi — yo'qotish qanday hisoblanganini ko'rsatadi.
 *
 * Uzum yo'qolgan tovarlar ro'yxatini bermaydi, shuning uchun raqam bu yerda
 * hisoblanadi. Sotuvchi unga ishonishi uchun har bir had (qabul, sotuv,
 * qoldiq) Uzum kabinetidagi bilan solishtirsa bo'ladigan ko'rinishda turadi.
 */
export function BalanceTab({ balance, loading }: { balance?: StockBalanceSummary; loading: boolean }) {
  const t = useT('losses');
  const f = useFormat();
  const [open, setOpen] = useState<StockBalanceRow | null>(null);
  const [last, setLast] = useState<StockBalanceRow | null>(null);
  const shown = open ?? last;

  const rows = balance?.rows ?? [];
  const totals = balance?.totals;
  const returned = useMemo(() => rows.reduce((s, r) => s + r.returnedToSeller, 0), [rows]);
  const held = useMemo(() => rows.reduce((s, r) => s + r.held, 0), [rows]);

  const columns: Column<StockBalanceRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        width: '30%',
        render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
        sortable: true,
        sortValue: (r) => r.title,
      },
      {
        key: 'accepted',
        header: t('bal.accepted'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.accepted)}</span>,
        sortable: true,
        sortValue: (r) => r.accepted,
      },
      {
        key: 'sold',
        header: t('bal.sold'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.sold)}</span>,
        sortable: true,
        sortValue: (r) => r.sold,
      },
      {
        key: 'onHand',
        header: t('bal.onHand'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.onHand)}</span>,
        sortable: true,
        sortValue: (r) => r.onHand,
      },
      {
        key: 'inReturn',
        header: t('bal.inReturn'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => (
          <span className={cn('tnum', r.inReturn > 0 ? 'font-medium text-warn-ink' : 'text-muted')}>
            {r.inReturn > 0 ? f.num(r.inReturn) : '—'}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.inReturn,
      },
      {
        key: 'unaccounted',
        header: t('bal.unaccounted'),
        align: 'right',
        render: (r) => (
          <span className={cn('tnum', r.unaccounted > 0 ? 'font-semibold text-danger-ink' : 'text-muted')}>
            {r.unaccounted > 0 ? f.num(r.unaccounted) : '—'}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.unaccounted,
      },
      {
        key: 'amount',
        header: t('bal.col.amount'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => (
          <span className={cn('tnum', r.amount > 0 ? 'text-ink' : 'text-muted')}>
            {r.amount > 0 ? f.money(r.amount) : '—'}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.amount,
      },
      {
        key: 'state',
        header: t('bal.col.state'),
        render: (r) => (
          <Badge tone={STATE_TONE[r.state]} dot>
            {t(`bal.state.${r.state}`)}
          </Badge>
        ),
        sortValue: (r) => r.state,
      },
    ],
    [t, f],
  );

  if (loading && !balance) {
    return (
      <Card className="space-y-4 p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  if (!totals || rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<Scale className="h-6 w-6" />} title={t('bal.empty.title')} hint={t('bal.empty.hint')} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/*
        Tenglama: qabul − sotilgan − omborda = qaytish yo'lida + hisobda yo'q.
        Ranglar tizim bo'yicha: Uzumga tegishli (ombor) — binafsha, kutilayotgan —
        za'faron, yo'qotish — qizil. Nol bo'lgan ixtiyoriy hadlar ko'rsatilmaydi.
      */}
      {/* Sarlavha boshqa kartochkalardagi kabi CardHeader bilan (belgi plitkasi + sana chipi) */}
      <Card>
        <CardHeader
          icon={<Scale className="h-4 w-4" />}
          title={t('bal.title')}
          subtitle={t('bal.subtitle')}
          actions={
            balance?.asOf ? (
              <span className="meta-chip tnum">{t('bal.asOf', { date: f.date(balance.asOf) })}</span>
            ) : null
          }
        />
        <div className="flex flex-wrap items-start gap-x-5 gap-y-5 p-5 pt-5 sm:px-6 sm:pb-6">
          <Term dot="bg-info" label={t('bal.accepted')} value={f.num(totals.accepted)} hint={t('bal.acceptedHint')} />
          <Op>−</Op>
          <Term dot="bg-brand" label={t('bal.sold')} value={f.num(totals.sold)} hint={t('bal.soldHint')} />
          {returned > 0 ? (
            <>
              <Op>−</Op>
              <Term dot="bg-brand" label={t('bal.returned')} value={f.num(returned)} hint={t('bal.returnedHint')} />
            </>
          ) : null}
          <Op>−</Op>
          <Term dot="bg-violet" label={t('bal.onHand')} value={f.num(totals.onHand)} hint={t('bal.onHandHint')} />
          {held > 0 ? (
            <>
              <Op>−</Op>
              <Term dot="bg-violet" label={t('bal.held')} value={f.num(held)} hint={t('bal.heldHint')} />
            </>
          ) : null}
          <Op>=</Op>
          {totals.inReturn > 0 ? (
            <>
              <Term dot="bg-warn" label={t('bal.inReturn')} value={f.num(totals.inReturn)} hint={t('bal.inReturnHint')} />
              <Op>+</Op>
            </>
          ) : null}
          <Term
            dot={totals.unaccounted > 0 ? 'bg-danger' : 'bg-brand'}
            label={t('bal.unaccounted')}
            value={f.num(totals.unaccounted)}
            hint={
              totals.unaccounted > 0
                ? t('bal.unaccountedHint', { amount: f.money(totals.amount) })
                : t('bal.unaccountedZero')
            }
            strong
            danger={totals.unaccounted > 0}
          />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Scale className="h-4 w-4" />} title={t('bal.table')} subtitle={t('bal.tableSub')} />
        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.skuId}
            loading={loading}
            localSort
            onRowClick={(r) => {
              setLast(r);
              setOpen(r);
            }}
          />
        </div>
      </Card>

      {balance.stuck.length ? <StuckOrders rows={balance.stuck} days={balance.rules.stuckDays} /> : null}

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/50 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t('bal.how.title')}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {t('bal.how.text', { days: balance.rules.cancelWaitDays })}
          </p>
        </div>
      </div>

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        size="md"
        title={shown?.title ?? '—'}
        description={shown?.sku}
      >
        {shown ? (
          <div className="space-y-5">
            <Badge tone={STATE_TONE[shown.state]} dot>
              {t(`bal.state.${shown.state}`)}
            </Badge>
            {shown.state === 'settling' || shown.state === 'incomplete' ? (
              <p className="text-sm text-muted">{t(`bal.state.${shown.state}Hint`)}</p>
            ) : null}
            <BalanceEvidence data={shown} />
            {shown.comp && shown.unaccounted > 0 ? (
              <CompensationBreakdown comp={shown.comp} qty={shown.unaccounted} />
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** Tenglamaning bitta hadi */
function Term({
  dot,
  label,
  value,
  hint,
  strong,
  danger,
}: {
  dot: string;
  label: string;
  value: string;
  hint: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="min-w-[8.5rem] flex-1">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          'tnum mt-2 whitespace-nowrap leading-none tracking-[-0.02em]',
          strong ? 'font-title text-[26px] font-semibold' : 'font-display text-[22px] font-bold text-ink',
          strong && (danger ? 'text-danger-ink' : 'text-brand-ink'),
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-snug text-muted">{hint}</p>
    </div>
  );
}

/** Tenglama belgisi — faqat keng ekranda; torda hadlar ustma-ust turadi */
function Op({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="hidden pt-6 text-xl font-light text-muted lg:block">
      {children}
    </span>
  );
}

/** Uzoq vaqt xaridorga topshirilmagan buyurtmalar — yo'qotish emas, kuzatuv ro'yxati */
function StuckOrders({ rows, days }: { rows: StuckOrderRow[]; days: number }) {
  const t = useT('losses');
  const f = useFormat();
  // Ro'yxat uzun bo'lsa sahifani bosib ketmasin — eng eskilari, qolgani so'rov bilan
  const [all, setAll] = useState(false);
  const visible = all ? rows : rows.slice(0, STUCK_PREVIEW);

  const columns: Column<StuckOrderRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: '38%',
      render: (r) => <ProductCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} imageUrl={r.imageUrl} />,
    },
    {
      key: 'order',
      header: t('stuck.order'),
      render: (r) => <span className="tnum font-medium text-ink">№{r.orderId}</span>,
    },
    {
      key: 'ordered',
      header: t('stuck.ordered'),
      hideOnMobile: true,
      render: (r) => <span className="tnum text-muted">{f.date(r.orderedAt)}</span>,
    },
    {
      key: 'qty',
      header: t('col.qty'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => <span className="tnum">{f.num(r.qty)}</span>,
    },
    {
      key: 'amount',
      header: t('col.amount'),
      align: 'right',
      render: (r) => <span className="tnum">{f.money(r.amount)}</span>,
    },
    {
      key: 'days',
      header: t('stuck.days'),
      align: 'right',
      render: (r) => <Badge tone="warn">{t('stuck.daysN', { n: r.days })}</Badge>,
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Clock3 className="h-4 w-4" />}
        title={t('stuck.title')}
        subtitle={t('stuck.sub', { days })}
      />
      <div className="mt-4">
        <DataTable columns={columns} rows={visible} rowKey={(r) => `${r.orderId}-${r.sku ?? ''}`} />
      </div>
      {rows.length > STUCK_PREVIEW ? (
        <div className="border-t border-line px-5 py-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? t('stuck.less') : t('stuck.more', { n: rows.length - STUCK_PREVIEW })}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
