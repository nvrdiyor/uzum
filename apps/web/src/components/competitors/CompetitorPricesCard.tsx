/**
 * "Raqobatchilar narxi" — mahsulot sahifasidagi karta (2026-10-24).
 *
 * Sotuvchi raqobatchi do'koni va narxini O'ZI yozadi: SavdoIQ havolani
 * ochmaydi va Uzum sahifalarini o'qimaydi (karta sarlavhasi ostida ochiq
 * yozilgan). Biz faqat solishtiramiz: bizning joriy narx, zararsizlik narxi
 * va marja (sahifadagi unit-iqtisodning o'zi, o'sha davr — server
 * services/product-unit.ts) bilan, shkalada va har bir raqobatchi qatorida.
 *
 * O'zgartirishlar oddiy so'rov + bildirishnoma bilan (optimistik emas):
 * narx o'zgarsa server eski narxni `prevPrice` ga o'tkazadi va solishtirishni
 * qayta hisoblaydi — uni saytda taxmin qilib ko'rsatish chalkashtirardi.
 * Pul maydonlari null kelishi mumkin (pulsiz ko'rinish) — '—' chiqadi.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Pencil, Plus, RefreshCw, Tags, Trash2 } from '@/components/icons';
import {
  COMPETITOR_LIMITS,
  toBusinessDate,
  type CompetitorListResponse,
  type CompetitorPriceDto,
} from '@savdoiq/shared';
import { Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, toast, type Tone } from '@/components/ui';
import { variantOf } from '@/components/products/DetailBento';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CompetitorForm, todayBusiness, type CompetitorFormSku, type CompetitorFormValue } from './CompetitorForm';
import { ChangeMark, CheckedAgo, CompetitorLink, DiffChip, MoneyRange, PositionBadge, money } from './common';
import { PriceLadder } from './PriceLadder';
import './texts';

export interface CompetitorCardSku {
  id: string;
  sku: string;
  title: string;
  price?: number | null;
  archived?: boolean;
}

type Editor = { kind: 'add' } | { kind: 'edit'; id: string } | null;

const EMPTY_FORM = (): CompetitorFormValue => ({
  title: '',
  price: '',
  url: '',
  skuId: '',
  checkedAt: todayBusiness(),
  note: '',
});

const formOf = (it: CompetitorPriceDto): CompetitorFormValue => ({
  title: it.title,
  price: typeof it.price === 'number' ? String(Math.round(it.price)) : '',
  url: it.url ?? '',
  skuId: it.skuId ?? '',
  checkedAt: toBusinessDate(new Date(it.checkedAt)),
  note: it.note ?? '',
});

/** Tahrirda faqat o'zgargan maydonlar yuboriladi — narx o'zgarmasa server `prevPrice` ga tegmaydi */
function patchBody(initial: CompetitorFormValue, next: CompetitorFormValue): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (next.title !== initial.title.trim()) body.title = next.title;
  if (next.price !== initial.price) body.price = Number(next.price);
  if (next.url.trim() !== initial.url.trim()) body.url = next.url.trim() || null;
  if (next.skuId !== initial.skuId) body.skuId = next.skuId || null;
  if (next.note.trim() !== initial.note.trim()) body.note = next.note.trim() || null;
  if (next.checkedAt !== initial.checkedAt) body.checkedAt = next.checkedAt;
  return body;
}

export function CompetitorPricesCard({
  productId,
  productTitle,
  skus,
  period,
  className,
}: {
  productId: string;
  productTitle: string;
  skus: CompetitorCardSku[];
  /** Nol foyda narxi va marja davri — sahifaning davr tanlagichi */
  period: { from: string; to: string };
  className?: string;
}) {
  const t = useT('competitors');
  const f = useFormat();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<Editor>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['competitors', productId, period.from, period.to],
    queryFn: () => api.get<CompetitorListResponse>('/competitors', { productId, from: period.from, to: period.to }),
    enabled: Boolean(productId),
  });
  const data = query.data;
  const items = data?.items ?? [];
  const canEdit = data?.canEdit ?? false;
  const limit = data?.limits.maxPerProduct ?? COMPETITOR_LIMITS.maxPerProduct;
  const full = items.length >= limit;
  const be = typeof data?.our.breakEvenPrice === 'number' && data.our.breakEvenPrice > 0 ? data.our.breakEvenPrice : null;

  const formSkus: CompetitorFormSku[] = skus.map((s) => ({
    id: s.id,
    sku: s.sku,
    label: `${variantOf(s.title, productTitle)} · ${s.sku}`,
    price: s.price,
    archived: s.archived,
  }));

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['competitors', productId] });
    void qc.invalidateQueries({ queryKey: ['price-map'] });
  };
  const onError = (err: unknown) => toast.error(t('toast.error'), err instanceof Error ? err.message : undefined);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<CompetitorPriceDto>('/competitors', body),
    onSuccess: () => {
      toast.success(t('toast.added'));
      setEditor(null);
      invalidate();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown>; recheck?: boolean }) =>
      api.patch<CompetitorPriceDto>(`/competitors/${v.id}`, v.body),
    onSuccess: (_res, v) => {
      toast.success(v.recheck ? t('toast.rechecked') : t('toast.saved'));
      if (!v.recheck) setEditor(null);
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/competitors/${id}`),
    onSuccess: () => {
      toast.success(t('toast.deleted'));
      setConfirmId(null);
      invalidate();
    },
    onError,
  });

  const submitAdd = (v: CompetitorFormValue) =>
    create.mutate({
      productId,
      title: v.title,
      price: Number(v.price),
      ...(v.url.trim() ? { url: v.url.trim() } : {}),
      ...(v.skuId ? { skuId: v.skuId } : {}),
      // Bugun — yubormaymiz: server hozirgi vaqtni qo'yadi
      ...(v.checkedAt && v.checkedAt !== todayBusiness() ? { checkedAt: v.checkedAt } : {}),
      ...(v.note.trim() ? { note: v.note.trim() } : {}),
    });

  const stats = data?.stats ?? null;
  const tone: Tone = !stats ? 'muted' : stats.belowBreakEven ? 'danger' : stats.position === 'pricier' ? 'warn' : 'brand';
  const periodText = data ? `${f.dateShort(data.period.from)} – ${f.dateShort(data.period.to)}` : '';
  const margin = data && typeof data.our.margin === 'number' && typeof data.our.price === 'number' && data.our.price > 0 ? data.our.margin : null;

  const addButton =
    canEdit && !full && editor?.kind !== 'add' ? (
      <Button size="sm" variant="soft" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditor({ kind: 'add' })}>
        {t('card.add')}
      </Button>
    ) : null;

  return (
    <Card tone={tone} className={className}>
      <CardHeader
        icon={<Tags />}
        title={t('card.title')}
        subtitle={
          <span className="cursor-help" title={t('manualHint')}>
            {t('manual')}
          </span>
        }
        actions={addButton}
      />
      <CardBody className="space-y-4">
        {query.isLoading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ) : query.isError || !data ? (
          <ErrorState
            message={query.error instanceof Error ? query.error.message : undefined}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <RefWell label={t('ref.our')} hint={t('ref.ourHint')} value={<MoneyRange min={data.our.minPrice} max={data.our.maxPrice} />} />
              <RefWell
                label={t('ref.breakEven')}
                hint={t('ref.breakEvenHint', { period: periodText })}
                value={money(f, data.our.breakEvenPrice)}
                valueClass="text-danger-ink"
                sub={data.our.costMissing ? t('ref.costMissing') : undefined}
                subClass="text-warn-ink"
              />
              <RefWell
                label={t('ref.margin')}
                hint={t('ref.marginHint')}
                value={margin === null ? '—' : f.pct(margin)}
                valueClass={margin !== null && margin < 0 ? 'text-danger-ink' : undefined}
                sub={margin !== null && typeof data.our.price === 'number' ? t('ref.marginAt', { price: f.money(data.our.price) }) : undefined}
              />
              <RefWell
                label={t('ref.competitors')}
                value={stats ? <MoneyRange min={stats.minPrice} max={stats.maxPrice} /> : t('ref.none')}
                valueClass={stats ? undefined : 'text-muted'}
                sub={stats ? `${t('ref.count', { n: f.num(stats.count) })} · ${t('ref.median', { v: money(f, stats.medianPrice) })}` : undefined}
                badge={stats ? <PositionBadge position={stats.position} /> : undefined}
              />
            </div>

            {stats && items.length > 0 ? (
              <PriceLadder
                our={data.our}
                medianPrice={stats.medianPrice}
                points={items.map((it) => ({
                  id: it.id,
                  title: it.title,
                  price: it.price,
                  belowBreakEven: be !== null && typeof it.price === 'number' && it.price < be,
                }))}
              />
            ) : null}

            {editor?.kind === 'add' ? (
              <CompetitorForm
                mode="add"
                initial={EMPTY_FORM()}
                skus={formSkus}
                ourMinPrice={data.our.minPrice}
                breakEven={be}
                saving={create.isPending}
                onSubmit={submitAdd}
                onCancel={() => setEditor(null)}
              />
            ) : null}

            {items.length === 0 && editor?.kind !== 'add' ? (
              <EmptyState
                className="px-2 py-8"
                icon={<Tags className="h-6 w-6" />}
                title={t('empty.title')}
                hint={canEdit ? t('empty.hint') : `${t('manual')}. ${t('empty.readonly')}`}
                action={
                  canEdit ? (
                    <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditor({ kind: 'add' })}>
                      {t('card.add')}
                    </Button>
                  ) : undefined
                }
              />
            ) : null}

            {items.length > 0 ? (
              <ul className="divide-y divide-line/60 border-t border-line/60">
                {items.map((it) =>
                  editor?.kind === 'edit' && editor.id === it.id ? (
                    <li key={it.id} className="py-3">
                      <CompetitorForm
                        mode="edit"
                        initial={formOf(it)}
                        skus={formSkus}
                        ourMinPrice={data.our.minPrice}
                        breakEven={be}
                        saving={update.isPending}
                        onSubmit={(v) => {
                          const body = patchBody(formOf(it), v);
                          if (Object.keys(body).length === 0) setEditor(null);
                          else update.mutate({ id: it.id, body });
                        }}
                        onCancel={() => setEditor(null)}
                      />
                    </li>
                  ) : (
                    <CompetitorRow
                      key={it.id}
                      item={it}
                      productTitle={productTitle}
                      breakEven={be}
                      actions={
                        canEdit ? (
                          confirmId === it.id ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span className="font-medium text-danger-ink">{t('row.deleteConfirm')}</span>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={remove.isPending && remove.variables === it.id}
                                onClick={() => remove.mutate(it.id)}
                              >
                                {t('row.deleteYes')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                                {t('row.deleteNo')}
                              </Button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5">
                              {it.daysAgo > 0 ? (
                                <ActionButton
                                  label={t('row.recheck')}
                                  disabled={update.isPending}
                                  onClick={() => update.mutate({ id: it.id, body: { checkedAt: todayBusiness() }, recheck: true })}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </ActionButton>
                              ) : null}
                              <ActionButton
                                label={t('row.edit')}
                                onClick={() => {
                                  setConfirmId(null);
                                  setEditor({ kind: 'edit', id: it.id });
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </ActionButton>
                              <ActionButton label={t('row.delete')} onClick={() => setConfirmId(it.id)} danger>
                                <Trash2 className="h-4 w-4" />
                              </ActionButton>
                            </span>
                          )
                        ) : null
                      }
                    />
                  ),
                )}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
              <Link
                to="/price-map"
                className="focusable inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
              >
                {t('card.map')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {items.length > 0 ? (
                <span className="tnum text-2xs text-muted" title={t('card.limit', { n: limit })}>
                  {f.num(items.length)} / {f.num(limit)}
                </span>
              ) : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Mos yozuv plitkasi (.well): yorliq, qiymat, izoh */
function RefWell({
  label,
  value,
  hint,
  sub,
  badge,
  valueClass,
  subClass,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  sub?: string;
  badge?: ReactNode;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <div className={cn('well min-w-0 px-3 py-2.5', hint && 'cursor-help')} title={hint}>
      <p className="truncate eyebrow">{label}</p>
      <p className={cn('tnum mt-1 break-words text-[15px] font-bold leading-snug', valueClass ?? 'text-ink')}>{value}</p>
      {sub ? <p className={cn('tnum mt-0.5 text-2xs leading-snug', subClass ?? 'text-muted')}>{sub}</p> : null}
      {badge ? <div className="mt-1.5">{badge}</div> : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focusable inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors disabled:opacity-50',
        danger ? 'hover:bg-danger/10 hover:text-danger-ink' : 'hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function CompetitorRow({
  item,
  productTitle,
  breakEven,
  actions,
}: {
  item: CompetitorPriceDto;
  productTitle: string;
  breakEven: number | null;
  actions: ReactNode;
}) {
  const t = useT('competitors');
  const f = useFormat();
  const below = breakEven !== null && typeof item.price === 'number' && item.price < breakEven;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <CompetitorLink title={item.title} url={item.url} className="text-sm font-semibold text-ink" />
        {item.sku || item.uzumProductId || item.note ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
            {item.sku ? <span>{t('row.variant', { v: variantOf(item.sku.title, productTitle) })}</span> : null}
            {item.uzumProductId ? <span className="tnum">{t('row.uzumId', { id: item.uzumProductId })}</span> : null}
            {item.note ? <span className="min-w-0 break-words italic">{item.note}</span> : null}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:justify-end">
        <span
          className={cn('tnum inline-flex items-center gap-1 whitespace-nowrap text-sm font-bold', below ? 'text-danger-ink' : 'text-ink')}
          title={below ? t('row.belowBreakEven') : undefined}
        >
          {below ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {money(f, item.price)}
        </span>
        <ChangeMark change={item.change} prevPrice={item.prevPrice} />
        <DiffChip diffPct={item.diffPct} ourPrice={item.ourPrice} belowBreakEven={below} />
        <CheckedAgo checkedAt={item.checkedAt} daysAgo={item.daysAgo} stale={item.stale} />
        {actions}
      </div>
    </li>
  );
}
