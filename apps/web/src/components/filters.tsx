import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Lock, Store } from 'lucide-react';
import { getPlan, presetPeriod, toISODate } from '@savdoiq/shared';
import { useUi, type PresetKey } from '@/store/ui';
import { usePlan, useStores } from '@/store/session';
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

/** Davr necha kunni qamraydi (ikkala chekka ham kiradi) */
function presetSpan(p: PresetKey): number {
  if (p === 'custom') return 0;
  const { from, to } = presetPeriod(p);
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

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
  const plan = usePlan();
  const ref = useOutsideClose(() => setOpen(false));
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  /**
   * Tarif tarix chuqurligi: server bundan oldingi sanalarni baribir qaytarmaydi,
   * shuning uchun tanlashning ham iloji bo'lmaydi — foydalanuvchi bo'sh jadval
   * o'rniga sababni ko'radi.
   */
  const historyDays = getPlan(plan).limits.historyDays;
  const earliest = useMemo(
    () => toISODate(new Date(Date.now() - historyDays * 86_400_000)),
    [historyDays],
  );
  const today = useMemo(() => toISODate(new Date()), []);

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
            {PRESETS.map((p) => {
              const locked = presetSpan(p) > historyDays;
              return (
                <button
                  key={p}
                  disabled={locked}
                  title={locked ? t('period.locked') : undefined}
                  onClick={() => {
                    if (locked) return;
                    setPreset(p);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                    locked
                      ? 'cursor-not-allowed text-muted opacity-60'
                      : preset === p
                        ? 'bg-brand/10 text-brand-ink'
                        : 'text-ink-soft hover:bg-surface-2',
                  )}
                >
                  {t(`period.${p}`)}
                  {locked ? (
                    <Lock className="h-3 w-3" />
                  ) : preset === p ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-2xs text-muted">{t('period.limit', { n: historyDays })}</p>

          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 eyebrow">{t('period.custom')}</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                min={earliest}
                max={to < today ? to : today}
                onChange={(e) => setFrom(e.target.value)}
                className="input px-2 py-1.5 text-xs"
              />
              <span className="text-muted">—</span>
              <input
                type="date"
                value={to}
                min={from > earliest ? from : earliest}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                className="input px-2 py-1.5 text-xs"
              />
            </div>
            <button
              onClick={() => {
                // Kelajak sanalar va tarif chegarasidan oldingi sanalar kesiladi
                const safeFrom = from < earliest ? earliest : from;
                const safeTo = to > today ? today : to;
                setCustomPeriod(
                  safeFrom > safeTo ? { from: safeTo, to: safeTo } : { from: safeFrom, to: safeTo },
                );
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
              storeId === 'all' ? 'bg-brand/10 text-brand-ink' : 'text-ink-soft hover:bg-surface-2',
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
                storeId === s.id ? 'bg-brand/10 text-brand-ink' : 'text-ink-soft hover:bg-surface-2',
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

/**
 * Sahifa filtrlari qatori.
 *
 * Davr va do'kon tanlagichlari yuqori panelda doimo ko'rinib turadi, shuning
 * uchun bu yerda takrorlanmaydi — ilgari har bir sahifada bir xil ikkita
 * tugma ikki marta chiqardi. Do'kon tanlagichi faqat telefon kengligida
 * qo'shiladi, chunki yuqori panelda u `sm` dan pastda yashiriladi.
 */
export function FilterBar({ children, className }: { children?: React.ReactNode; className?: string }) {
  const stores = useStores();
  const hasChildren = Boolean(children);
  if (!hasChildren && stores.length === 0) return null;

  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center gap-2.5',
        // Qo'shimcha filtrlar bo'lmasa, katta ekranda bu qator umuman chiqmaydi
        !hasChildren && 'sm:hidden',
        className,
      )}
    >
      {stores.length > 0 ? <StoreSwitcher className="sm:hidden" /> : null}
      {children}
    </div>
  );
}

export { presetPeriod };
