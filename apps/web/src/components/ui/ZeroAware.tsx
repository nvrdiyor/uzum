import { cn } from '@/lib/utils';

/**
 * Jadvaldagi raqam: nol bo'lsa rangsiz va xira, aks holda o'z rangida.
 *
 * Qorong'i fonda ko'k yoki sariq "0" larning bir nechtasi qator bo'ylab
 * turganda jadval o'qilmay qolardi — rang faqat mazmunli raqamda kerak.
 */
export function ZeroAware({
  value,
  tone,
  text,
  className,
}: {
  value: number;
  /** Nolga teng bo'lmagan qiymat uchun rang klassi, masalan `text-info` */
  tone: string;
  text: string;
  className?: string;
}) {
  const empty = !value;
  return <span className={cn(empty ? 'text-muted/70' : tone, className)}>{text}</span>;
}
