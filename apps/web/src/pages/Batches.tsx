import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { BatchDetail, BatchListResponse, BatchRate, BatchSummary } from '@savdoiq/shared';
import { api } from '@/lib/api';
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
  SkeletonRows,
  toast,
} from '@/components/ui';
import { parseAmount } from '@/components/batches/shared';
import { cn } from '@/lib/utils';

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

  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BatchSummary | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get<BatchListResponse>('/batches'),
  });

  const rows = data?.items ?? [];

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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr>
                    <th className="table-head border-b border-line px-5 py-3 text-left">{t('col.name')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.items')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.cny')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.goods')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.cargo')}</th>
                    <th className="table-head border-b border-line px-4 py-3 text-right">{t('col.total')}</th>
                    <th className="table-head w-24 border-b border-line px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr
                      key={b.id}
                      tabIndex={0}
                      onClick={() => navigate(`/batches/${b.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/batches/${b.id}`);
                      }}
                      className="focusable group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60"
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-ink">{b.name}</p>
                        <p className="mt-0.5 whitespace-nowrap text-xs text-muted">
                          {f.date(b.createdAt)} · 1 ¥ = {f.num(b.rate, 2)}
                        </p>
                      </td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-soft">{t('items', { n: b.totals.items })}</td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.priceCny, 2)}</td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.goodsUzs)}</td>
                      <td className="tnum px-4 py-3.5 text-right text-ink-soft">{f.num(b.totals.cargoUzs)}</td>
                      <td className="tnum px-4 py-3.5 text-right font-bold text-ink">{f.num(b.totals.total)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
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
              </table>
            </div>
          )}
        </Card>
      </PlanGate>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} nextNo={rows.length + 1} />
      <DeleteModal batch={toDelete} onClose={() => setToDelete(null)} />
    </>
  );
}
