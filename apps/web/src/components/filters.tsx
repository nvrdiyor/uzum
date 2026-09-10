import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Store } from 'lucide-react';
import { presetPeriod } from '@savdoiq/shared';
import { useUi, type PresetKey } from '@/store/ui';
import { useStores } from '@/store/session';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

const PRESETS: PresetKey[] = [
  'today',
  'yesterday',
  'last7',
  'last14',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisYear',
];

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

/** Davr tanlash — presetlar + qo'lda sana oralig'i */
export function PeriodPicker({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useT('common');
  const f = useFormat();
  const { preset, period, setPreset, setCustomPeriod } = useUi();
  const ref = useOutsideClose(() => setOpen(false));
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  useEffect(() => {
    setFrom(period.from);
    setTo(period.to);
  }, [period.from, period.to]);

  const label = preset === 'custom' ? `${f.date(period.from)} — ${f.date(period.to)}` : t(`period.${preset}`);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
      >
        <Calendar className="h-4 w-4 text-muted" />
        <span className="hidden max-w-[190px] truncate sm:inline">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[300px] rounded-2xl border border-line bg-surface p-3 shadow-pop">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPreset(p);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                  preset === p ? 'bg-brand/12 text-brand' : 'text-ink-soft hover:bg-surface-2',
                )}
              >
                {t(`period.${p}`)}
                {preset === p ? <Check className="h-3 w-3" /> : null}
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">{t('period.custom')}</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="input px-2 py-1.5 text-xs"
              />
              <span className="text-muted">—</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="input px-2 py-1.5 text-xs"
              />
            </div>
            <button
              onClick={() => {
                setCustomPeriod({ from, to });
                setOpen(false);
              }}
              className="btn-primary mt-2.5 w-full py-2 text-xs"
            >
              {t('btn.apply')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Do'kon (magazin) tanlash */
export function StoreSwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useT('common');
  const stores = useStores();
  const { storeId, setStoreId } = useUi();
  const ref = useOutsideClose(() => setOpen(false));

  const current = stores.find((s) => s.id === storeId);
  const label = storeId === 'all' ? t('common.allStores') : (current?.title ?? t('common.store'));

  if (stores.length === 0) return null;

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 max-w-[220px] items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
      >
        <Store className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 max-h-[320px] w-[260px] overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
          <button
            onClick={() => {
              setStoreId('all');
              setOpen(false);
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors',
              storeId === 'all' ? 'bg-brand/12 text-brand' : 'text-ink-soft hover:bg-surface-2',
            )}
          >
            {t('common.allStores')}
            {storeId === 'all' ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStoreId(s.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors',
                storeId === s.id ? 'bg-brand/12 text-brand' : 'text-ink-soft hover:bg-surface-2',
              )}
            >
              <span className="truncate">{s.title}</span>
              {storeId === s.id ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Sahifalarda ishlatish uchun: davr + do'kon filtri bir qatorda */
export function FilterBar({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2.5', className)}>
      <PeriodPicker />
      <StoreSwitcher />
      {children}
    </div>
  );
}

export { presetPeriod };
