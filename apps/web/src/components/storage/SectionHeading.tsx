import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * Pullik saqlash sahifasi ikki bo'limdan iborat: "bugungi holat" (aylanma,
 * davrga bog'liq emas) va "Uzum ushlagan to'lov" (tanlangan davr). Har biri
 * o'z sarlavhasi va chiplari bilan — davr filtri qaysi qismga ta'sir qilishi
 * ko'rinib tursin.
 */

/** Tailwind faqat to'liq yozilgan klassni yig'adi — ohang klassi ro'yxatdan olinadi */
const TONE_CLASS = {
  pink: 'tone-pink',
  violet: 'tone-violet',
} as const;

export function SectionHeading({
  id,
  icon,
  title,
  subtitle,
  meta,
  tone,
  className,
}: {
  id?: string;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** O'ng tomondagi chiplar (davr, holat) */
  meta?: ReactNode;
  tone: keyof typeof TONE_CLASS;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'icon-tile mt-0.5 h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
            TONE_CLASS[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={id} className="section-title">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </div>
  );
}
