import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ProductDetailSku } from './types';

/**
 * "Tannarx kiritilmagan" ogohlantirishi + tezkor kiritish maydoni.
 * Bitta qiymat barcha bo'sh SKU'larga qo'llanadi (POST /products/sku/bulk-cost).
 */
export function MissingCostBanner({
  skus,
  onApply,
  saving,
}: {
  skus: ProductDetailSku[];
  onApply: (purchasePrice: number) => void;
  saving?: boolean;
}) {
  const t = useT('productDetail');
  const [raw, setRaw] = useState('');

  if (!skus.length) return null;

  const value = Math.max(0, Math.round(Number(raw.replace(/\D/g, '')) || 0));

  return (
    <div className="card border-warn/40 bg-warn/5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn-ink">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-ink">{t('cost.missingTitle')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('cost.missingHint', { n: skus.length })}</p>
            <p className="mt-1.5 truncate text-2xs text-muted">
              {skus
                .slice(0, 6)
                .map((s) => s.sku)
                .join(' · ')}
              {skus.length > 6 ? ' …' : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative w-40">
            <input
              value={raw}
              inputMode="numeric"
              placeholder={t('cost.quickPlaceholder')}
              onChange={(e) => setRaw(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && value > 0) onApply(value);
              }}
              className={cn(
                'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm tnum text-ink',
                'placeholder:text-muted focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20',
              )}
            />
          </div>
          <Button size="sm" loading={saving} disabled={value <= 0} onClick={() => onApply(value)}>
            {t('cost.applyAll')}
          </Button>
        </div>
      </div>
    </div>
  );
}
