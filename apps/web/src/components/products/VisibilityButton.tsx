/**
 * Arxivdagi tovarni SavdoIQ'da o'chirish va qaytarish.
 *
 * Uzum kabinetida tovarni o'chirib bo'lmaydi — faqat arxivlanadi. O'chirilgan
 * tovar ro'yxatlardan va tannarx jadvalidan chiqadi, "O'chirilganlar"
 * bo'limida turadi. Uzum'dagi kartochkaga tegilmaydi, sotuv tarixi saqlanadi.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { ProductCard } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { registerNamespace, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { Button, toast } from '@/components/ui';
import { isArchivedStatus } from './types';

registerNamespace('productVisibility', {
  uz: {
    hide: 'O‘chirish',
    hideHint: 'Uzum’da arxivdagi tovarni SavdoIQ ro‘yxatlari va tannarx jadvalidan olib tashlash. Istalgan payt qaytarish mumkin',
    restore: 'Qaytarish',
    restoreHint: 'Tovarni ro‘yxatlarga va tannarx jadvaliga qaytarish',
    hidden: '«{name}» o‘chirildi',
    hiddenBody: '“O‘chirilganlar” bo‘limidan istalgan payt qaytarishingiz mumkin. Uzum’dagi kartochkaga tegilmadi.',
    restored: '«{name}» qaytarildi',
    error: 'Bajarilmadi',
  },
  ru: {
    hide: 'Удалить',
    hideHint: 'Убрать архивный товар из списков SavdoIQ и таблицы себестоимости. Можно вернуть в любой момент',
    restore: 'Вернуть',
    restoreHint: 'Вернуть товар в списки и таблицу себестоимости',
    hidden: '«{name}» удалён',
    hiddenBody: 'Вернуть можно в разделе «Удалённые». Карточка в Uzum не затронута.',
    restored: '«{name}» возвращён',
    error: 'Не удалось',
  },
  en: {
    hide: 'Delete',
    hideHint: 'Remove this archived product from SavdoIQ lists and the cost table. You can restore it any time',
    restore: 'Restore',
    restoreHint: 'Bring the product back to lists and the cost table',
    hidden: '“{name}” deleted',
    hiddenBody: 'Restore it any time from the “Deleted” tab. The Uzum listing was not touched.',
    restored: '“{name}” restored',
    error: 'Failed',
  },
});

/** Mahsulotga bog'liq hamma ro'yxat — o'chirilgan tovar ulardan chiqadi */
const AFFECTED_QUERIES = ['products', 'cost-price', 'product', 'sku-health'];

export function ProductVisibilityButton({
  product,
  variant = 'link',
}: {
  product: Pick<ProductCard, 'id' | 'title' | 'status' | 'hidden'>;
  /** link — kartochkadagi kichik tugma, button — sahifa sarlavhasidagi */
  variant?: 'link' | 'button';
}) {
  const t = useT('productVisibility');
  const qc = useQueryClient();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');

  const m = useMutation({
    mutationFn: (hide: boolean) => api.post<unknown>(`/products/${product.id}/${hide ? 'hide' : 'restore'}`),
    onSuccess: (_res, hide) => {
      if (hide) toast.success(t('hidden', { name: product.title }), t('hiddenBody'));
      else toast.success(t('restored', { name: product.title }));
      for (const key of AFFECTED_QUERIES) void qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => toast.error(t('error'), err instanceof ApiError ? err.message : undefined),
  });

  // Faol tovarni o'chirib bo'lmaydi — faqat Uzum'da arxivlangani
  if (!canEdit || (!product.hidden && !isArchivedStatus(product.status))) return null;

  const hide = !product.hidden;
  const label = hide ? t('hide') : t('restore');
  const Icon = hide ? Trash2 : RotateCcw;

  if (variant === 'button')
    return (
      <Button
        variant={hide ? 'outline' : 'soft'}
        size="sm"
        loading={m.isPending}
        icon={<Icon className="h-4 w-4" />}
        title={hide ? t('hideHint') : t('restoreHint')}
        onClick={() => m.mutate(hide)}
      >
        {label}
      </Button>
    );

  return (
    <button
      type="button"
      disabled={m.isPending}
      title={hide ? t('hideHint') : t('restoreHint')}
      onClick={() => m.mutate(hide)}
      className={cn(
        'focusable inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
        hide ? 'text-muted hover:bg-danger/10 hover:text-danger-ink' : 'text-brand-ink hover:bg-brand/10',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
