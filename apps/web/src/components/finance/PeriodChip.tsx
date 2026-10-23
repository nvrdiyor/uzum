import { CalendarDays } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';

registerNamespace('financeUi', {
  uz: { period: 'Tanlangan davr — yuqoridagi davr tanlagichidan' },
  ru: { period: 'Выбранный период — из переключателя периода вверху' },
  en: { period: 'Selected period — from the period switcher above' },
});

/**
 * Sahifa sarlavhasi ostidagi davr chipi (`PageHeader.meta`).
 *
 * Yuqori paneldagi tanlagich faqat "Shu oy" deb yozadi — raqamlar aynan
 * qaysi kunlardan ekani esa ko'rinmasdi. Moliya sahifalarida bu muhim:
 * oy boshida "Shu oy" ikki-uch kunlik ma'lumot bo'lishi mumkin.
 */
export function PeriodChip({ className }: { className?: string }) {
  const t = useT('financeUi');
  const f = useFormat();
  const { from, to } = usePeriodQuery();
  return (
    <span className={cn('meta-chip', className)} title={t('period')}>
      <CalendarDays className="h-3.5 w-3.5" />
      <span className="tnum">{from === to ? f.date(from) : `${f.date(from)} — ${f.date(to)}`}</span>
    </span>
  );
}
