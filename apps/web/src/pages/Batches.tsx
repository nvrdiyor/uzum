import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ChevronDown, ChevronRight, ChevronUp, CircleCheck, GripVertical, Plus, Trash2, Truck, Warehouse, Wallet } from '@/components/icons';
import type { BatchDetail, BatchListResponse, BatchRate, BatchSummary, ShipmentStatus } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  Segmented,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
} from '@/components/ui';
import { parseAmount } from '@/components/batches/shared';
import { BatchEtaCell, BatchStatusCell, CargoStatsCard, ShipmentModal } from '@/components/batches/shipments';
import { cn } from '@/lib/utils';
import { dropLine, useDragReorder } from '@/hooks/useDragReorder';
import { useIsDesktop } from '@/hooks/useMediaQuery';

function CreateModal({ open, onClose: close, nextNo }: { open: boolean; onClose: () => void; nextNo: number }) {
  const t = useT('batches');
  const tc = useT('common');
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [rateText, setRateText] = useState('');

  // Keyingi ochilishda oldingi yozuv qolib ketmasin
  const onClose = () => {
    setName('');
    setRateText('');
    close();
  };

  const rateQuery = useQuery({
    queryKey: ['batches-rate'],
    queryFn: () => api.get<BatchRate>('/batches/rate'),
    enabled: open,
    staleTime: 30 * 60_000,
  });

  const create = useMutation({
    mutationFn: (body: { name: string; rate?: number }) => api.post<BatchDetail>('/batches', body),
    onSuccess: (detail) => {
      qc.setQueryData(['batch', detail.id], detail);
      void qc.invalidateQueries({ queryKey: ['batches'] });
      onClose();
      navigate(`/batches/${detail.id}`);
    },
    onError: (err: unknown) => toast.error(t('error.create'), err instanceof Error ? err.message : undefined),
  });

  const defaultName = t('defaultName', { n: nextNo });
  const cbuRate = rateQuery.data ? Math.round(rateQuery.data.rate * 100) / 100 : undefined;
  const rate = rateText.trim() ? parseAmount(rateText) : cbuRate;
  // Yozilgan, lekin tushunib bo'lmaydigan kurs jimgina MB kursiga almashmasin
  const rateInvalid = rateText.trim() !== '' && !(rate !== undefined && rate > 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (rateInvalid) return;
    create.mutate({ name: name.trim() || defaultName, rate });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('new')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tc('btn.cancel')}
          </Button>
          <Button type="submit" form="batch-create" loading={create.isPending} disabled={rateInvalid}>
            {t('create.submit')}
          </Button>
        </div>
      }
    >
      <form id="batch-create" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">{t('create.name')}</span>
          <Input autoFocus value={name} placeholder={defaultName} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('create.rate')}</span>
          <Input
            inputMode="decimal"
            className={cn('tnum', rateInvalid && 'border-danger/60')}
            value={rateText}
            placeholder={cbuRate !== undefined ? f.num(cbuRate, 2) : '…'}
            onChange={(e) => setRateText(e.target.value)}
          />
          {rateQuery.data ? (
            <span className="mt-1.5 block text-xs text-muted">
              {rateQuery.data.source === 'cbu' && rateQuery.data.updatedAt
                ? t('create.rateHint', { date: f.date(rateQuery.data.updatedAt) })
                : t('create.rateFallback')}
            </span>
          ) : null}
        </label>
      </form>
    </Modal>
  );
}

function DeleteModal({ batch, onClose }: { batch: BatchSummary | null; onClose: () => void }) {
  const t = useT('batches');
  const tc = useT('common');
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: (id: string) => api.del<unknown>(`/batches/${id}`),
    onSuccess: (_res, id) => {
      toast.success(t('deleted'));
      qc.removeQueries({ queryKey: ['batch', id] });
      void qc.invalidateQueries({ queryKey: ['batches'] });
      onClose();
    },
    onError: (err: unknown) => toast.error(t('error.delete'), err instanceof Error ? err.message : undefined),
  });

  return (
    <Modal
      open={batch !== null}
      onClose={onClose}
      title={t('delete.title')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {tc('btn.cancel')}
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => batch && remove.mutate(batch.id)}>
            {tc('btn.delete')}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-soft">
        {batch ? t('delete.text', { name: batch.name, n: batch.totals.items }) : null}
      </p>
    </Modal>
  );
}

export default function Batches() {
  const t = useT('batches');
  const f = useFormat();
  const navigate = useNavigate();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');
  // Telefonda 10 ustunli jadval o'rniga kartalar
  const isDesktop = useIsDesktop();

  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BatchSummary | null>(null);
  const [filter, setFilter] = useState<'all' | ShipmentStatus>('all');
  const [shipId, setShipId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get<BatchListResponse>('/batches'),
  });

  const rows = data?.items ?? [];
  /**
   * Ro'yxatdagi "Umumiy" — tovar + cargo + yo'l kira. Logistika, paket kabi
   * boshqa qo'shimcha xarajatlar bu yerga kirmaydi (ular faqat tovar tannarxida).
   */
  const listTotal = (b: BatchSummary) => b.totals.goodsUzs + b.totals.cargoUzs + b.roadExtra;
  // Modal har doim ro'yxatdagi eng so'nggi holatni ko'rsatadi (saqlangach ham)
  const shipFor = shipId ? (rows.find((b) => b.id === shipId) ?? null) : null;

  /** Holatlar bo'yicha: nechta partiya va qancha pul */
  const byStatus = useMemo(() => {
    const out: Record<ShipmentStatus, { n: number; sum: number }> = {
      warehouse: { n: 0, sum: 0 },
      shipped: { n: 0, sum: 0 },
      arrived: { n: 0, sum: 0 },
    };
    for (const b of rows) {
      out[b.status].n += 1;
      out[b.status].sum += listTotal(b);
    }
    return out;
  }, [rows]);

  const visible = filter === 'all' ? rows : rows.filter((b) => b.status === filter);
  // Tartibni faqat to'liq ro'yxatda o'zgartirish mumkin — filtrlanganda o'rinlar mos kelmaydi
  const canReorder = canEdit && filter === 'all';
  const foot = useMemo(
    () =>
      visible.reduce(
        (a, b) => ({
          items: a.items + b.totals.items,
          cny: a.cny + b.totals.priceCny,
          goods: a.goods + b.totals.goodsUzs,
          cargo: a.cargo + b.totals.cargoUzs,
          total: a.total + listTotal(b),
        }),
        { items: 0, cny: 0, goods: 0, cargo: 0, total: 0 },
      ),
    [visible],
  );

  /*
   * Ro'yxat tartibi. Yangi tartib darhol ekranda ko'rinadi (so'rov kutilmaydi),
   * server rad etsa — eski tartib qaytadi va sabab aytiladi.
   */
  const qc = useQueryClient();
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.put<unknown>('/batches/order', { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['batches'] });
      const prev = qc.getQueryData<BatchListResponse>(['batches']);
      if (prev) {
        const byId = new Map(prev.items.map((b) => [b.id, b]));
        const items = ids.map((id) => byId.get(id)).filter((b): b is BatchSummary => Boolean(b));
        qc.setQueryData<BatchListResponse>(['batches'], { ...prev, items });
      }
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(['batches'], ctx.prev);
      toast.error(t('order.error'), err instanceof ApiError ? err.message : undefined);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['batches'] }),
  });

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const ids = rows.map((b) => b.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    reorder.mutate(ids);
  };
  const drag = useDragReorder(move);

  return (
    <>
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        actions={
          canEdit && rows.length > 0 ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              {t('new')}
            </Button>
          ) : undefined
        }
      />

      <PlanGate feature="cost_price">
        {rows.length > 0 && data ? (
          <StatGrid className="mb-4">
            <StatCard
              label={t('sum.total')}
              value={f.money(data.grand.total)}
              hint={
                data.grand.otherExtra > 0
                  ? t('sum.totalHintOther', {
                      n: rows.length,
                      qty: f.num(data.grand.qty),
                      other: f.money(data.grand.otherExtra),
                    })
                  : t('sum.totalHint', { n: rows.length, qty: f.num(data.grand.qty) })
              }
              icon={<Wallet className="h-5 w-5" />}
              tone="brand"
            />
            {/*
              Holat kartochkalari jadvaldagi holat nishonlari bilan bir rangda
              (batches/shipments.tsx STATUS_TONE): omborda — ko'k, yo'lda —
              za'faron, keldi — firuza. Ilgari "Keldi" binafsha edi, nishon esa yashil.
            */}
            <StatCard
              label={t('status.warehouse')}
              value={t('sum.count', { n: byStatus.warehouse.n })}
              hint={t('sum.countHint', { sum: f.money(byStatus.warehouse.sum) })}
              icon={<Warehouse className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label={t('status.shipped')}
              value={t('sum.count', { n: byStatus.shipped.n })}
              hint={t('sum.countHint', { sum: f.money(byStatus.shipped.sum) })}
              icon={<Truck className="h-5 w-5" />}
              tone="warn"
            />
            <StatCard
              label={t('status.arrived')}
              value={t('sum.count', { n: byStatus.arrived.n })}
              hint={t('sum.countHint', { sum: f.money(byStatus.arrived.sum) })}
              icon={<CircleCheck className="h-5 w-5" />}
              tone="brand"
            />
          </StatGrid>
        ) : null}

        {rows.length > 0 ? (
          <div className="mb-3">
            <Segmented<'all' | ShipmentStatus>
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('filter.all'), count: rows.length },
                { value: 'warehouse', label: t('status.warehouse'), count: byStatus.warehouse.n },
                { value: 'shipped', label: t('status.shipped'), count: byStatus.shipped.n },
                { value: 'arrived', label: t('status.arrived'), count: byStatus.arrived.n },
              ]}
            />
          </div>
        ) : null}

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-5">
              <SkeletonRows rows={5} />
            </div>
          ) : isError ? (
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Boxes className="h-6 w-6" />}
              title={t('empty.title')}
              hint={t('empty.hint')}
              action={
                canEdit ? (
                  <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                    {t('new')}
                  </Button>
                ) : undefined
              }
            />
          ) : !isDesktop ? (
            <>
              <ul className="divide-y divide-line/70">
                {visible.map((b, i) => (
                  <li
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/batches/${b.id}`)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && e.key === 'Enter') navigate(`/batches/${b.id}`);
                    }}
                    className="cursor-pointer px-4 py-3.5 transition-colors focus-visible:bg-surface-2/60 focus-visible:outline-none active:bg-surface-2/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{b.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {f.date(b.createdAt)} · 1 ¥ = {f.num(b.rate, 2)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <p className="tnum whitespace-nowrap text-right font-bold text-ink" title={t('col.totalHint')}>
                          {f.num(listTotal(b))}
                        </p>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </div>
                    </div>
                    {/* Holat va kelish — bosilsa jo'natmalar oynasi, partiya ochilmaydi */}
                    <div className="mt-3 grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
                      <div className="min-w-0">
                        <p className="text-2xs font-medium text-muted">{t('col.status')}</p>
                        <div className="mt-1">
                          <BatchStatusCell batch={b} onClick={canEdit ? () => setShipId(b.id) : undefined} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-2xs font-medium text-muted">{t('col.eta')}</p>
                        <div className="mt-1">
                          <BatchEtaCell batch={b} />
                        </div>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {(
                        [
                          [t('col.items'), t('items', { n: b.totals.items })],
                          [t('col.cny'), f.num(b.totals.priceCny, 2)],
                          [t('col.goods'), f.num(b.totals.goodsUzs)],
                          [t('col.cargo'), f.num(b.totals.cargoUzs)],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="truncate text-2xs font-medium text-muted">{label}</dt>
                          <dd className="tnum mt-0.5 text-ink-soft">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {canEdit ? (
                      <div className="mt-2 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canReorder ? (
                          <>
                            <IconButton
                              label={t('row.moveUp')}
                              disabled={i === 0}
                              className="h-9 w-9 disabled:pointer-events-none disabled:opacity-30"
                              onClick={() => move(i, i - 1)}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              label={t('row.moveDown')}
                              disabled={i === visible.length - 1}
                              className="h-9 w-9 disabled:pointer-events-none disabled:opacity-30"
                              onClick={() => move(i, i + 1)}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </IconButton>
                          </>
                        ) : null}
                        <IconButton label={t('delete.title')} className="h-9 w-9 hover:text-danger" onClick={() => setToDelete(b)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {/* Ko'rinib turgan partiyalar bo'yicha jami */}
              <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t('row.totals')}</p>
                  <p className="tnum text-xs text-muted">
                    {t('items', { n: foot.items })} · {f.num(foot.cny, 2)} ¥
                  </p>
                </div>
                <p className="tnum whitespace-nowrap font-extrabold text-ink">{f.num(foot.total)}</p>
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr>
                    {canEdit ? <th className="table-head w-10 border-b border-line" /> : null}
                    <th className={cn('table-head border-b border-line py-3 text-left', canEdit ? 'pl-1 pr-5' : 'px-5')}>
                      {t('col.name')}
                    </th>
                    <th className="table-head border-b border-line px-4 py-3 text-left">{t('col.status')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-left" title={t('col.etaHint')}>
                      {t('col.eta')}
                    </th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.items')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.cny')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.goods')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.cargo')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right" title={t('col.totalHint')}>
                      {t('col.total')}
                    </th>
                    <th className={cn('table-head border-b border-line px-4 py-3', canEdit ? 'w-40' : 'w-24')} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b, i) => (
                    <tr
                      key={b.id}
                      tabIndex={0}
                      {...(canReorder ? drag.rowProps(i) : {})}
                      onClick={() => navigate(`/batches/${b.id}`)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter') navigate(`/batches/${b.id}`);
                        // Alt+↑/↓ — partiyani ro'yxatda ko'chirish
                        if (canReorder && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                          e.preventDefault();
                          move(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
                        }
                      }}
                      className={cn(
                        'focusable group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60',
                        drag.dragging === i && 'opacity-50',
                        dropLine(drag.dropPosition(i)),
                      )}
                    >
                      {canEdit ? (
                        <td className="py-3.5 pl-3 pr-0">
                          {/* Tutqich: sudrab tartibni o'zgartirish. Bosish partiyani ochib yubormasin */}
                          <span
                            hidden={!canReorder}
                            {...drag.handleProps(i)}
                            title={t('row.drag')}
                            onClick={(e) => e.stopPropagation()}
                            className="flex h-8 w-7 cursor-grab items-center justify-center rounded-md text-muted/60 transition-colors hover:bg-surface-3 hover:text-ink active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                        </td>
                      ) : null}
                      <td className={cn('py-3.5', canEdit ? 'pl-1 pr-5' : 'px-5')}>
                        <p className="font-semibold text-ink">{b.name}</p>
                        <p className="mt-0.5 whitespace-nowrap text-xs text-muted">
                          {f.date(b.createdAt)} · 1 ¥ = {f.num(b.rate, 2)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        {/* Bosilganda jo'natmalar oynasi ochiladi; ko'rish huquqi bo'lsa ham holat ko'rinadi */}
                        <BatchStatusCell batch={b} onClick={canEdit ? () => setShipId(b.id) : undefined} />
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <BatchEtaCell batch={b} />
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-3.5 text-right text-ink-soft">{t('items', { n: b.totals.items })}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.priceCny, 2)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.goodsUzs)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.cargoUzs)}</td>
                      <td className="tnum whitespace-nowrap px-4 py-3.5 text-right font-bold text-ink">{f.num(listTotal(b))}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {canReorder ? (
                            <>
                              <IconButton
                                label={t('row.moveUp')}
                                disabled={i === 0}
                                className="h-8 w-8 border-0 bg-transparent opacity-60 disabled:pointer-events-none disabled:opacity-20 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  move(i, i - 1);
                                }}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label={t('row.moveDown')}
                                disabled={i === visible.length - 1}
                                className="h-8 w-8 border-0 bg-transparent opacity-60 disabled:pointer-events-none disabled:opacity-20 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  move(i, i + 1);
                                }}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </IconButton>
                            </>
                          ) : null}
                          {canEdit ? (
                            <IconButton
                              label={t('delete.title')}
                              className="h-8 w-8 border-0 bg-transparent opacity-60 hover:text-danger group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setToDelete(b);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          ) : null}
                          <ChevronRight className="h-4 w-4 text-muted" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Ko'rinib turgan partiyalar bo'yicha jami */}
                <tfoot>
                  <tr className="border-t border-line bg-surface-2/60">
                    {canEdit ? <td /> : null}
                    <td className={cn('py-3 font-semibold text-ink', canEdit ? 'pl-1 pr-5' : 'px-5')}>{t('row.totals')}</td>
                    <td />
                    <td />
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-soft">{t('items', { n: foot.items })}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-soft">{f.num(foot.cny, 2)}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-soft">{f.num(foot.goods)}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-soft">{f.num(foot.cargo)}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-right font-extrabold text-ink">{f.num(foot.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {rows.length > 0 && data ? (
          <div className="mt-4">
            <CargoStatsCard stats={data.cargoStats} />
          </div>
        ) : null}
      </PlanGate>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} nextNo={rows.length + 1} />
      <DeleteModal batch={toDelete} onClose={() => setToDelete(null)} />
      <ShipmentModal batch={shipFor} onClose={() => setShipId(null)} />
    </>
  );
}
