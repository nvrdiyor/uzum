import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SyncStatus } from '@savdoiq/shared';
import { Clock, Loader2 } from '@/components/icons';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';

registerNamespace('trust', {
  uz: {
    syncing: 'Yangilanmoqda…',
    updated: 'Yangilandi: {ago}',
    justNow: 'hozirgina',
    agoMin: '{n} daqiqa oldin',
    agoHour: '{n} soat oldin',
    agoDay: '{n} kun oldin',
    lastOk: 'Oxirgi muvaffaqiyatli sinxron: {at}',
    next: 'Keyingisi: {at}',
    stale: 'Ma’lumot eskirgan bo‘lishi mumkin — Uzum bilan sinxron uzoq vaqt muvaffaqiyatsiz',
  },
  ru: {
    syncing: 'Обновляется…',
    updated: 'Обновлено: {ago}',
    justNow: 'только что',
    agoMin: '{n} мин назад',
    agoHour: '{n} ч назад',
    agoDay: '{n} дн. назад',
    lastOk: 'Последняя успешная синхронизация: {at}',
    next: 'Следующая: {at}',
    stale: 'Данные могли устареть — синхронизация с Uzum давно не проходит',
  },
  en: {
    syncing: 'Updating…',
    updated: 'Updated {ago}',
    justNow: 'just now',
    agoMin: '{n} min ago',
    agoHour: '{n} h ago',
    agoDay: '{n} d ago',
    lastOk: 'Last successful sync: {at}',
    next: 'Next: {at}',
    stale: 'Data may be out of date — sync with Uzum has been failing for a while',
  },
});

/** Shundan eski ma'lumot "eskirgan" deb belgilanadi (eng sekin tarif oralig'i — 60 daqiqa, uch baravari) */
const STALE_MS = 3 * 60 * 60 * 1000;

/**
 * "Ma'lumot qanchalik yangi" chipi — sahifa sarlavhasi ostiga (`PageHeader.meta`).
 *
 * Ilgari raqamlar qachongi ekanini faqat Sozlamalar ichidan bilish mumkin edi,
 * u yerda ham xato bilan tugagan sinxron vaqti chiqardi. 2026-10-22 da Uzum
 * bir necha soat ishlamaganda sotuvchilar eski raqamlarni yangi deb ko'rgan.
 * Chip oxirgi MUVAFFAQIYATLI sinxronni ko'rsatadi va u uzoq bo'lsa
 * ogohlantiradi. So'rov SyncBanner bilan umumiy ('sync-status' keshi).
 */
export function DataFreshness({ className }: { className?: string }) {
  const t = useT('trust');
  const f = useFormat();
  const hasCompany = useSession((s) => Boolean(s.me?.company));
  // "N daqiqa oldin" o'z-o'zidan yangilanib tursin
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { data } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
    enabled: hasCompany,
    refetchInterval: (q) => {
      const s = q.state.data as SyncStatus | undefined;
      return s && (s.status === 'running' || s.status === 'queued') ? 5000 : 60_000;
    },
    staleTime: 3000,
  });

  if (!data) return null;
  const syncing = data.status === 'running' || data.status === 'queued';
  if (!data.lastSuccessAt && !syncing) return null;

  if (!data.lastSuccessAt) {
    return (
      <span className={cn('meta-chip', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
        {t('syncing')}
      </span>
    );
  }

  const at = new Date(data.lastSuccessAt).getTime();
  const diff = Math.max(0, now - at);
  const min = Math.floor(diff / 60_000);
  const ago =
    min < 1
      ? t('justNow')
      : min < 60
        ? t('agoMin', { n: min })
        : min < 60 * 48
          ? t('agoHour', { n: Math.floor(min / 60) })
          : t('agoDay', { n: Math.floor(min / (60 * 24)) });
  const stale = !syncing && diff > STALE_MS;

  const title = [
    t('lastOk', { at: f.dateTime(data.lastSuccessAt) }),
    data.nextSyncAt ? t('next', { at: f.dateTime(data.nextSyncAt) }) : null,
    stale ? t('stale') : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <span
      className={cn('meta-chip', stale && 'border-warn/40 bg-warn/10 text-warn-ink', className)}
      title={title}
    >
      {syncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
      ) : (
        <Clock className={cn('h-3.5 w-3.5', stale ? 'text-warn-ink' : 'text-muted')} />
      )}
      <span className="tnum">{syncing ? t('syncing') : t('updated', { ago })}</span>
    </span>
  );
}
