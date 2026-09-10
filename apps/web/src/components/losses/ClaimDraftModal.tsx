import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';
import { useT } from '@/i18n';
import { Button, ErrorState, Modal, Skeleton, toast } from '@/components/ui';

export const UZUM_SUPPORT_URL = 'https://seller.uzum.uz';

/**
 * Yo'qotilgan tovarlar bo'yicha Uzum'ga yuboriladigan da'vo (claim) matni.
 * Server tayyor matnni qaytaradi — foydalanuvchi nusxa olib, qo'llab-quvvatlashga yuboradi.
 */
export function ClaimDraftModal({
  open,
  onClose,
  ids,
  query,
}: {
  open: boolean;
  onClose: () => void;
  /** Tanlangan qatorlar (bo'sh bo'lsa — server barcha ochiq holatlarni oladi) */
  ids: string[];
  query: Record<string, string | number | undefined>;
}) {
  const t = useT('losses');
  const [copied, setCopied] = useState(false);

  const idsKey = ids.join(',');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['losses-claim-draft', idsKey, query],
    queryFn: () => api.get<{ text: string }>('/warehouse/losses/claim-draft', { ...query, ids: idsKey || undefined }),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const text = data?.text ?? '';

  const onCopy = async () => {
    if (!text) return;
    try {
      await copyToClipboard(text);
      setCopied(true);
      toast.success(t('claim.copiedToast'));
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error(t('claim.copyFailed'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('claim.title')}
      description={ids.length ? t('claim.descSelected', { n: ids.length }) : t('claim.descAll')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={UZUM_SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('claim.support')}
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('btn.close')}
            </Button>
            <Button
              onClick={onCopy}
              disabled={!text}
              icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            >
              {copied ? t('btn.copied') : t('btn.copy')}
            </Button>
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
      ) : text ? (
        <>
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p className="text-xs text-muted">{t('claim.hint')}</p>
          </div>
          <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-4 font-sans text-sm leading-relaxed text-ink-soft">
            {text}
          </pre>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted">{t('claim.empty')}</p>
      )}
    </Modal>
  );
}
