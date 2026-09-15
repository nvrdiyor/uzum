import type { ReactNode } from 'react';
import { Bell, Building2, KeyRound, Palette, UserRound, Users } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { SECTION_IDS, type SectionId } from './types';

const ICONS: Record<SectionId, ReactNode> = {
  profile: <UserRound className="h-4 w-4" />,
  company: <Building2 className="h-4 w-4" />,
  uzum: <KeyRound className="h-4 w-4" />,
  notifications: <Bell className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  appearance: <Palette className="h-4 w-4" />,
};

/**
 * Bo'limlar navigatsiyasi.
 * Desktop — chapda yopishqoq ustun, mobil — gorizontal skroll qatori.
 */
export function SectionNav({
  active,
  onSelect,
  badges,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  badges?: Partial<Record<SectionId, ReactNode>>;
}) {
  const t = useT('settings');

  return (
    <>
      {/* ── Mobil: gorizontal skroll ── */}
      <div className="-mx-4 mb-4 overflow-x-auto no-scrollbar px-4 sm:-mx-6 sm:px-6 lg:hidden">
        <div className="flex w-max gap-2">
          {SECTION_IDS.map((id) => {
            const on = id === active;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
                  on
                    ? 'border-brand/40 bg-brand/[0.12] text-brand'
                    : 'border-line bg-surface text-muted hover:text-ink',
                )}
              >
                {ICONS[id]}
                {t(`nav.${id}`)}
                {badges?.[id] ?? null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Desktop: yopishqoq ustun ── */}
      <nav className="hidden lg:sticky lg:top-20 lg:block">
        <p className="label px-2">{t('nav.sections')}</p>
        <div className="space-y-1">
          {SECTION_IDS.map((id) => {
            const on = id === active;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={cn(
                  'group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                  on ? 'bg-brand/10 text-brand' : 'text-ink-soft hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                    on ? 'bg-brand/15 text-brand' : 'bg-surface-2 text-muted group-hover:text-ink',
                  )}
                >
                  {ICONS[id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('truncate text-sm font-semibold', on ? 'text-brand' : 'text-ink')}>
                      {t(`nav.${id}`)}
                    </span>
                    {badges?.[id] ?? null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{t(`nav.${id}Hint`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
