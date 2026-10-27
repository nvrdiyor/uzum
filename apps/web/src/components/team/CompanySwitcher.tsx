import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { asMemberView, viewHomePath, type CompanySummary } from '@savdoiq/shared';
import { Building2, Check, Loader2 } from '@/components/icons';
import { Badge, toast, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';
import './i18n';

export const ROLE_TONE: Record<CompanySummary['role'], Tone> = {
  owner: 'brand',
  manager: 'info',
  viewer: 'muted',
};

/**
 * Kompaniyani almashtirish. Tartib muhim: avval sessiya yangi kompaniya bilan
 * qayta o'qiladi (x-company-id), keyin react-query keshi to'liq tozalanadi —
 * eski kompaniyaning raqamlari bir lahza ham yangisining sahifasida
 * ko'rinmasin — va bosh sahifaga o'tiladi (Omborchida — Qoldiqlar). Tanlangan
 * do'kon eski kompaniyaniki, shuning uchun "Barcha do'konlar" ga qaytadi.
 */
export function useSwitchCompany() {
  const t = useT('team');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const switchCompany = useSession((s) => s.switchCompany);
  const setStoreId = useUi((s) => s.setStoreId);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (companyId: string) => {
      setBusy(companyId);
      try {
        await switchCompany(companyId);
        const company = useSession.getState().me?.company;
        if (!company || company.id !== companyId) throw new Error('switch_failed');
        setStoreId('all');
        qc.clear();
        navigate(viewHomePath(company.role === 'owner' ? null : asMemberView(company.view)));
        return true;
      } catch {
        toast.error(t('sw.err'));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [navigate, qc, setStoreId, switchCompany, t],
  );

  return { run, busy };
}

/**
 * Kompaniyalar ro'yxati — profil menyusida va mobil menyuda. Faqat 2 va undan
 * ko'p kompaniya bo'lganda chiziladi (bittasida tanlash ma'nosiz).
 */
export function CompanySwitcher({ onDone, className }: { onDone?: () => void; className?: string }) {
  const t = useT('team');
  const companies = useSession((s) => s.me?.companies ?? []);
  const activeId = useSession((s) => s.me?.company?.id ?? null);
  const { run, busy } = useSwitchCompany();

  if (companies.length < 2) return null;

  return (
    <div className={className}>
      <p className="eyebrow px-3 pb-1.5 pt-1 text-muted/80">{t('sw.title')}</p>
      <ul className="space-y-px" role="list">
        {companies.map((c) => {
          const active = c.id === activeId;
          const view = c.role === 'owner' ? null : asMemberView(c.view);
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy !== null}
                aria-current={active ? 'true' : undefined}
                title={active ? t('sw.current') : c.name}
                onClick={async () => {
                  if (active) {
                    onDone?.();
                    return;
                  }
                  const ok = await run(c.id);
                  if (ok) onDone?.();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-60',
                  active ? 'bg-brand/10 text-ink' : 'text-ink-soft hover:bg-surface-2',
                )}
              >
                <Building2 className={cn('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-muted')} />
                <span className="min-w-0 flex-1">
                  {/* Nom ikki qatorgacha — tor mobil menyuda ham qaysi kompaniya ekani o'qilsin */}
                  <span className={cn('line-clamp-2 block break-words leading-snug', active && 'font-semibold')}>{c.name}</span>
                  {view ? <span className="block truncate text-2xs text-muted">{t(`view.${view}`)}</span> : null}
                </span>
                <Badge tone={ROLE_TONE[c.role]} className="shrink-0">
                  {t(`role.${c.role}`)}
                </Badge>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {busy === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  ) : active ? (
                    <Check className="h-4 w-4 text-brand" />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
