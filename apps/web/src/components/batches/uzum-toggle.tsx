/**
 * «Uzum uchun» belgisi (2026-11-13). Egasi: "FOR MY bu partiya emas — partiyalar bo'limida
 * belgilash bo'lsin, Uzum uchunligini bilib tursin, belgilasa partiyalar foydasida bo'lsin".
 * Belgisi olingan partiya «Partiya foydasi»da hisoblanmaydi va Uzum sotuvlarini olmaydi.
 *
 * Alohida modul: Partiyalar ro'yxati bitta katakcha uchun butun foyda bo'limini yuklamasin.
 * Jadval saqlanishidan alohida, darhol yoziladi (PUT /batches/:id/uzum — partiya versiyasiga
 * tegmaydi, ochiq jadval saqlashni davom ettiradi).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BatchDetail, BatchListResponse } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui';
import './texts-profit-page';

/** Bir vaqtda bir nechta belgi yozilayotganini bilish uchun */
export const uzumMutationKey = ['batch-uzum'] as const;

/**
 * Ro'yxat va partiya keshi oldindan yangilanadi; xato bo'lsa faqat shu partiya qaytariladi
 * (boshqa belgining kutilayotgan holati buzilmasin). Oxirgi yozuvdan keyin ro'yxat, foyda
 * hisobi (`['batches']` ostida) va partiya qayta so'raladi.
 */
export function useForUzumToggle() {
  const qc = useQueryClient();
  const t = useT('batches');
  const setFlag = (id: string, forUzum: boolean) => {
    qc.setQueryData<BatchListResponse>(['batches'], (d) => (d ? { ...d, items: d.items.map((b) => (b.id === id ? { ...b, forUzum } : b)) } : d));
    qc.setQueryData<BatchDetail>(['batch', id], (d) => (d ? { ...d, forUzum } : d));
  };
  return useMutation({
    mutationKey: uzumMutationKey,
    mutationFn: ({ id, forUzum }: { id: string; forUzum: boolean }) =>
      api.put<{ id: string; forUzum: boolean }>(`/batches/${id}/uzum`, { forUzum }),
    onMutate: async ({ id, forUzum }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['batches'], exact: true }),
        qc.cancelQueries({ queryKey: ['batch', id], exact: true }),
      ]);
      setFlag(id, forUzum);
    },
    onSuccess: (res) => setFlag(res.id, res.forUzum),
    onError: (err, { id, forUzum }) => {
      setFlag(id, !forUzum);
      toast.error(t('uzum.error'), err instanceof Error ? err.message : undefined);
    },
    onSettled: (_res, _err, { id }) => {
      // Boshqa belgi hali yozilmoqda — umumiy qayta so'rov uni eski qiymatga qaytarardi; oxirgisi so'raydi
      if (qc.isMutating({ mutationKey: uzumMutationKey }) > 1) return;
      void qc.invalidateQueries({ queryKey: ['batches'] });
      void qc.invalidateQueries({ queryKey: ['batch', id], exact: true });
    },
  });
}

/**
 * Tahrir huquqi bo'lsa — katakcha (nomi bilan, ekran o'quvchi qaysi partiyaniki ekanini aytsin),
 * aks holda faqat "Uzum uchun emas" yozuvi (odatiy holatda hech narsa). Ro'yxat qatori bosilsa
 * partiya ochiladi — belgi bosilishi u yerga yetmaydi. Yozilayotganda katakcha o'chirilmaydi
 * (fokus yo'qolmasin) — takror bosish e'tiborsiz qoladi.
 */
export function ForUzumToggle({
  id,
  name,
  forUzum,
  canEdit,
  withHint = false,
  className,
}: {
  id: string;
  name: string;
  forUzum: boolean;
  canEdit: boolean;
  withHint?: boolean;
  className?: string;
}) {
  const t = useT('batches');
  const toggle = useForUzumToggle();
  if (!canEdit) {
    return forUzum ? null : <span className={cn('inline-block text-xs font-medium text-muted', className)}>{t('uzum.not')}</span>;
  }
  const busy = toggle.isPending;
  return (
    <label
      title={t('uzum.title')}
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex max-w-full cursor-pointer items-start gap-1.5 text-xs leading-4', className)}
    >
      <input
        type="checkbox"
        checked={forUzum}
        aria-label={`${t('uzum.label')}: ${name}`}
        aria-busy={busy || undefined}
        onChange={(e) => {
          if (!busy) toggle.mutate({ id, forUzum: e.target.checked });
        }}
        className={cn('h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface-2 accent-brand', busy && 'cursor-wait opacity-60')}
      />
      <span className={cn('whitespace-nowrap font-medium', forUzum ? 'text-ink-soft' : 'text-muted line-through decoration-muted/60')}>
        {t('uzum.label')}
      </span>
      {withHint ? <span className="min-w-0 text-muted">— {t(forUzum ? 'uzum.hintOn' : 'uzum.hintOff')}</span> : null}
    </label>
  );
}
