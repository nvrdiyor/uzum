import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '@savdoiq/shared';
import { formatDuration } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useLang } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Sinxronizatsiya jarayoni ustki qatorda ko'rinadi.
 * Birinchi to'liq yig'ish ~30 daqiqa davom etadi — foydalanuvchi saytdan foydalanaverishi mumkin.
 */
export function SyncBanner() {
  const hasCompany = useSession((s) => Boolean(s.me?.company));
  const lang = useLang();

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

  if (!data || (data.status !== 'running' && data.status !== 'queued')) return null;

  const text = {
    uz: { title: 'Ma’lumotlar yig‘ilmoqda', left: 'qoldi', view: 'Batafsil' },
    ru: { title: 'Синхронизация данных', left: 'осталось', view: 'Подробнее' },
    en: { title: 'Syncing your data', left: 'left', view: 'Details' },
  }[lang];

  return (
    <div className="border-b border-line bg-brand/[0.06]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
        <p className="text-sm font-medium text-ink">
          {text.title}
          <span className="ml-2 text-muted">{data.message ?? ''}</span>
        </p>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-surface-3 sm:block">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700 ease-spring"
              style={{ width: `${data.progress}%` }}
            />
          </div>
          <span className="tnum text-xs font-semibold text-brand">{data.progress}%</span>
          <span className={cn('hidden text-xs text-muted md:inline')}>
            ~{formatDuration(data.etaSeconds, lang)} {text.left}
          </span>
          <Link to="/onboarding" className="chip bg-brand/[0.12] text-brand">
            <RefreshCw className="h-3 w-3" />
            {text.view}
          </Link>
        </div>
      </div>
    </div>
  );
}
