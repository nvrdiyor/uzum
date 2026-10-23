import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './primitives';

/**
 * Har bir sahifaning yuqori qismi: ikonka plitkasi + sarlavha + tavsif +
 * kontekst chiplari (`meta`) + o'ng tomonda amallar.
 *
 * Kartochkasiz qoladi — gradientli banner ATAYLAB qaytarilmadi: u har
 * sahifada ekranning 120px ini olib, pastdagi kartochkalar bilan bir xil
 * vaznda turardi. Lekin 2026-10-24 gacha `icon` umuman chizilmas edi va
 * sarlavha keng Unbounded shriftida yolg'iz turardi — sahifalar bir-biridan
 * ajralmas, brend rangi qobiqda ko'rinmas edi. Endi ikonka ohang rangidagi
 * plitkada (yon menyudagi faol band bilan bir xil rang), sarlavha esa
 * interfeysning o'z shrifti Onest'da. Unbounded faqat logotip va asosiy pul
 * raqamlarida qoladi.
 */
export function PageHeader({
  icon,
  tone = 'brand',
  title,
  description,
  meta,
  actions,
  badge,
  className,
  children,
}: {
  icon?: ReactNode;
  /** Ikonka plitkasining rangi (standart — brend) */
  tone?: Tone;
  title: ReactNode;
  description?: ReactNode;
  /**
   * Sarlavha ostidagi kontekst chiplari: davr, ma'lumot yangiligi, tannarx
   * qamrovi. Raqam qaysi davr va qanchalik yangi ma'lumotdan ekani darhol
   * ko'rinsin.
   */
  meta?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('mb-6 pt-1', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <span
              className={cn(
                'icon-tile mt-0.5 hidden h-11 w-11 rounded-xl sm:flex [&_svg]:h-[22px] [&_svg]:w-[22px]',
                `tone-${tone}`,
              )}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-balance font-display text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[26px]">
                {title}
              </h1>
              {badge}
            </div>
            {description ? <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted sm:text-[15px]">{description}</p> : null}
            {/* empty:hidden — chiplar hali hech narsa chizmasa (birinchi sinxrongacha) bo'sh qator qolmasin */}
            {meta ? <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
