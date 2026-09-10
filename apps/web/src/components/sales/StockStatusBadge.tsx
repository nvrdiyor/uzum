import { STATUS_TONE, type StatusTone } from '@/lib/theme';
import { useLang } from '@/i18n';
import { cn } from '@/lib/utils';

/** Qoldiq holati uchun yagona rangli belgi (STATUS_TONE bo'yicha) */
export function StockStatusBadge({ status, className }: { status: StatusTone; className?: string }) {
  const lang = useLang();
  const tone = STATUS_TONE[status] ?? STATUS_TONE.ok;

  return (
    <span className={cn('chip', tone.bg, tone.text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {tone.label[lang] ?? tone.label.uz}
    </span>
  );
}
