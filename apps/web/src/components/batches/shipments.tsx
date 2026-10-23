import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plane, Ship, Truck } from '@/components/icons';
import type { BatchListResponse, BatchShipment, BatchSummary, CargoStat, ShipmentStatus } from '@savdoiq/shared';
import { Badge, Button, Card, CardHeader, Input, Modal, Segmented, toast, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './shared';

/*
 * Omborda — ko'k (qoldiq/logistika), yo'lda — za'faron (kutilmoqda), keldi —
 * firuza. Partiyalar sahifasidagi holat kartochkalari ham shu ranglarda;
 * ilgari "Omborda" nishoni kulrang, kartochkasi esa ko'k edi.
 */
export const STATUS_TONE: Record<ShipmentStatus, Tone> = {
  warehouse: 'info',
  shipped: 'warn',
  arrived: 'brand',
};

const STATUSES: ShipmentStatus[] = ['warehouse', 'shipped', 'arrived'];

/** "2026-10-23" → "23.10" */
const shortDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Jadvaldagi holat: nishon + bir qator izoh (necha kun, qachon kutiladi, nechtasi keldi) */
export function BatchStatusCell({ batch, onClick }: { batch: BatchSummary; onClick?: () => void }) {
  const t = useT('batches');
  const groups = batch.shipments;
  const arrived = groups.filter((g) => g.status === 'arrived').length;

  let note = '';
  if (batch.status === 'shipped') {
    // Eng uzoq yo'lda turgani — "necha kundan beri"
    const days = groups
      .filter((g) => g.status === 'shipped')
      .map((g) => g.days)
      .filter((d): d is number => d != null);
    if (days.length) note = t('status.onRoad', { n: Math.max(...days) });
  } else if (batch.status === 'arrived') {
    const days = groups.map((g) => g.days).filter((d): d is number => d != null);
    if (days.length) note = t('status.arrivedIn', { n: Math.max(...days) });
  }
  // Qisman kelgan partiya: nechtasi kelgani alohida aytiladi
  const partial = groups.length > 1 && arrived > 0 && arrived < groups.length;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={t('status.change')}
      className="group/status -m-1 flex flex-col items-start gap-1 rounded-lg p-1 text-left transition-colors hover:bg-surface-3"
    >
      <Badge tone={STATUS_TONE[batch.status]} dot>
        {t(`status.${batch.status}`)}
      </Badge>
      {partial || note ? (
        <span className="tnum whitespace-nowrap text-2xs text-muted">
          {partial ? t('status.partial', { a: arrived, n: groups.length }) : note}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Taxminiy kelish: yo'ldagi HAR jo'natma (har reys) o'z qatorida — sana, necha
 * kun qolgani yoki necha kun kechikayotgani. Bir partiyada 50- va 51-reys bo'lsa,
 * ikkalasi alohida ko'rinadi.
 */
export function BatchEtaCell({ batch }: { batch: BatchSummary }) {
  const t = useT('batches');
  const onRoad = batch.shipments.filter((g) => g.status === 'shipped');

  if (onRoad.length === 0) {
    const arrived = batch.shipments.map((g) => g.arrivedAt).filter((d): d is string => Boolean(d));
    if (batch.status === 'arrived' && arrived.length) {
      const last = arrived.sort().at(-1) as string;
      return <span className="tnum whitespace-nowrap text-xs text-muted">{t('eta.arrived', { date: shortDay(last) })}</span>;
    }
    return <span className="text-muted">—</span>;
  }

  // Partiyada bir nechta jo'natma bo'lsa, har qatorda qaysi biri ekani yoziladi
  const many = batch.shipments.length > 1;
  return (
    <ul className="space-y-1">
      {onRoad.map((g) => {
        const label = g.trip
          ? t('ship.trip', { n: g.trip })
          : many
            ? `${g.cargoName || t('cargo.noName')} ${t(`delivery.${g.delivery}`)}`
            : '';
        const late = g.daysLeft != null && g.daysLeft < 0;
        const mode = t(`delivery.${g.delivery}`).toLowerCase();
        const hint = !g.expectedAt
          ? t('eta.unknownHint', { mode })
          : g.expectedBasis === 'mode'
            ? t('eta.modeHint', { cargo: g.cargoName || t('cargo.noName'), mode })
            : t('eta.cargoHint', { cargo: g.cargoName || t('cargo.noName'), mode });
        return (
          <li key={`${g.cargoName}|${g.delivery}|${g.trip}`} className="flex items-baseline gap-1.5 whitespace-nowrap text-xs" title={hint}>
            {label ? <span className="text-muted">{label}:</span> : null}
            {g.expectedAt ? (
              <>
                <span className={cn('tnum font-semibold', late ? 'text-warn-ink' : 'text-ink')}>
                  {g.expectedBasis === 'mode' ? '≈' : '~'}
                  {shortDay(g.expectedAt)}
                </span>
                <span className={cn('tnum', late ? 'text-warn-ink' : 'text-muted')}>
                  ·{' '}
                  {late
                    ? t('eta.late', { n: -(g.daysLeft as number) })
                    : g.daysLeft === 0
                      ? t('eta.today')
                      : t('eta.left', { n: g.daysLeft ?? 0 })}
                </span>
              </>
            ) : (
              <span className="text-muted">{t('eta.unknown')}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Partiyaning jo'natmalari: har kargo + tur uchun holat va sanalar */
export function ShipmentModal({ batch, onClose }: { batch: BatchSummary | null; onClose: () => void }) {
  const t = useT('batches');
  return (
    <Modal
      open={batch !== null}
      onClose={onClose}
      title={batch ? t('ship.title', { name: batch.name }) : ''}
      description={t('ship.subtitle')}
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t('ship.close')}
          </Button>
        </div>
      }
    >
      {batch && batch.shipments.length === 0 ? (
        <p className="text-sm text-muted">{t('ship.empty')}</p>
      ) : batch ? (
        <div className="space-y-3">
          {batch.shipments.map((g) => (
            <ShipmentEditor key={`${g.cargoName}|${g.delivery}|${g.trip}`} batchId={batch.id} shipment={g} />
          ))}
        </div>
      ) : null}
    </Modal>
  );
}

const todayIso = () => {
  // Savdo kuni (Toshkent, UTC+5) — sana kiritish maydonining standart qiymati
  const d = new Date(Date.now() + 5 * 3_600_000);
  return d.toISOString().slice(0, 10);
};

function ShipmentEditor({ batchId, shipment }: { batchId: string; shipment: BatchShipment }) {
  const t = useT('batches');
  const f = useFormat();
  const qc = useQueryClient();

  const [status, setStatus] = useState<ShipmentStatus>(shipment.status);
  const [shippedAt, setShippedAt] = useState(shipment.shippedAt ?? '');
  const [arrivedAt, setArrivedAt] = useState(shipment.arrivedAt ?? '');

  // Serverdan yangi holat kelsa (boshqa jo'natma saqlangach ro'yxat yangilanadi) — maydonlar ham yangilansin
  useEffect(() => {
    setStatus(shipment.status);
    setShippedAt(shipment.shippedAt ?? '');
    setArrivedAt(shipment.arrivedAt ?? '');
  }, [shipment.status, shipment.shippedAt, shipment.arrivedAt]);

  const onStatus = (next: ShipmentStatus) => {
    setStatus(next);
    // Yangi holatga o'tganda bo'sh sanaga bugungi kun qo'yiladi — sotuvchi faqat kerak bo'lsa o'zgartiradi
    if (next === 'shipped' && !shippedAt) setShippedAt(todayIso());
    if (next === 'arrived' && !arrivedAt) setArrivedAt(todayIso());
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<{ shipments: BatchShipment[]; status: ShipmentStatus; cargoStats: CargoStat[] }>(`/batches/${batchId}/shipment`, {
        cargoName: shipment.cargoName,
        delivery: shipment.delivery,
        trip: shipment.trip,
        status,
        shippedAt: status === 'warehouse' ? null : shippedAt || null,
        arrivedAt: status === 'arrived' ? arrivedAt || null : null,
      }),
    onSuccess: (res) => {
      toast.success(t('ship.saved'));
      // Ro'yxat darhol yangilanadi — modal ichidagi holat ham shu yerdan keladi
      qc.setQueryData<BatchListResponse>(['batches'], (prev) =>
        prev
          ? {
              ...prev,
              cargoStats: res.cargoStats,
              items: prev.items.map((b) => (b.id === batchId ? { ...b, shipments: res.shipments, status: res.status } : b)),
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: ['batches'] });
      void qc.invalidateQueries({ queryKey: ['batch', batchId] });
    },
    onError: (err: unknown) => toast.error(t('ship.error'), err instanceof Error ? err.message : undefined),
  });

  const dirty =
    status !== shipment.status ||
    (status !== 'warehouse' && shippedAt !== (shipment.shippedAt ?? '')) ||
    (status === 'arrived' && arrivedAt !== (shipment.arrivedAt ?? ''));

  // Hisob: keldi — necha kunda; yo'lda — necha kundan beri
  const days =
    status === 'arrived' && shippedAt && arrivedAt
      ? Math.round((Date.parse(arrivedAt) - Date.parse(shippedAt)) / 86_400_000)
      : status === 'shipped' && shippedAt
        ? Math.max(0, Math.round((Date.parse(todayIso()) - Date.parse(shippedAt)) / 86_400_000))
        : null;

  const DeliveryIcon = shipment.delivery === 'avia' ? Plane : Truck;

  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-soft">
            <DeliveryIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {shipment.cargoName || t('cargo.noName')} · {t(`delivery.${shipment.delivery}`)}
              {shipment.trip ? <span className="text-brand-ink"> · {t('ship.trip', { n: shipment.trip })}</span> : null}
            </p>
            <p className="tnum text-xs text-muted">{t('ship.items', { n: shipment.items, qty: f.num(shipment.qty) })}</p>
          </div>
        </div>
        <Segmented<ShipmentStatus>
          size="sm"
          value={status}
          onChange={onStatus}
          options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
        />
      </div>

      {status !== 'warehouse' ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('ship.shippedAt')}</span>
            <Input type="date" value={shippedAt} max={todayIso()} onChange={(e) => setShippedAt(e.target.value)} />
          </label>
          {status === 'arrived' ? (
            <label className="block">
              <span className="label">{t('ship.arrivedAt')}</span>
              <Input
                type="date"
                value={arrivedAt}
                min={shippedAt || undefined}
                max={todayIso()}
                onChange={(e) => setArrivedAt(e.target.value)}
              />
            </label>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('status.chinaHint')}</p>
      )}

      {/* Reys bitta mashina: boshqa partiyalardagi shu reys tovarlari ham shu holatga o'tadi */}
      {shipment.trip ? <p className="mt-2 text-2xs text-muted">{t('ship.tripShared')}</p> : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={cn('text-xs', status === 'arrived' && !shippedAt ? 'text-warn-ink' : 'text-muted')}>
          {status === 'arrived' && !shippedAt
            ? t('ship.noShipDate')
            : days !== null
              ? status === 'arrived'
                ? t('status.arrivedIn', { n: days })
                : t('status.onRoad', { n: days })
              : ''}
          {status === 'shipped' && shipment.expectedAt ? ` · ${t('status.expected', { date: shortDay(shipment.expectedAt) })}` : ''}
        </p>
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          {t('ship.save')}
        </Button>
      </div>
    </div>
  );
}

/** Kargolar: o'rtacha necha kunda olib keladi (kargo + yetkazish turi bo'yicha) */
export function CargoStatsCard({ stats }: { stats: CargoStat[] }) {
  const t = useT('batches');
  const f = useFormat();
  return (
    <Card>
      <CardHeader icon={<Ship className="h-4 w-4" />} title={t('cargo.title')} subtitle={t('cargo.subtitle')} />
      {stats.length === 0 ? (
        <p className="px-5 pb-5 pt-3 text-sm text-muted">
          <span className="font-semibold text-ink-soft">{t('cargo.empty')}.</span> {t('cargo.emptyHint')}
        </p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className="table-head border-b border-line px-5 py-2.5 text-left">{t('cargo.col.cargo')}</th>
                <th className="table-head border-b border-line px-4 py-2.5 text-right">{t('cargo.col.avg')}</th>
                <th className="table-head border-b border-line px-4 py-2.5 text-right">{t('cargo.col.range')}</th>
                <th className="table-head border-b border-line px-4 py-2.5 text-right">{t('cargo.col.arrived')}</th>
                <th className="table-head border-b border-line px-5 py-2.5 text-right">{t('cargo.col.transit')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const Icon = s.delivery === 'avia' ? Plane : Truck;
                return (
                  <tr key={`${s.cargoName}|${s.delivery}`} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <Icon className="h-4 w-4 shrink-0 text-muted" />
                        {s.cargoName || t('cargo.noName')}
                        <span className="font-normal text-muted">· {t(`delivery.${s.delivery}`)}</span>
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right font-bold text-ink">
                      {s.avgDays != null ? t('cargo.days', { n: f.num(s.avgDays, s.avgDays % 1 ? 1 : 0) }) : '—'}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-ink-soft">
                      {s.minDays != null && s.maxDays != null
                        ? s.minDays === s.maxDays
                          ? t('cargo.days', { n: s.minDays })
                          : `${s.minDays} – ${t('cargo.days', { n: s.maxDays })}`
                        : '—'}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-ink-soft">{s.arrived}</td>
                    <td className="tnum px-5 py-3 text-right text-ink-soft">{s.inTransit || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
