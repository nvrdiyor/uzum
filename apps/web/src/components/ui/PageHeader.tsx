import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Har bir sahifaning yuqori qismi: sarlavha + tavsif + o'ng tomonda amallar.
 *
 * Kartochkasiz: sarlavha to'g'ridan-to'g'ri fonda turadi. Ilgari bu gradientli
 * kartochka va ikonka plitkasi edi — har sahifada ekranning 120px ini olib,
 * pastdagi kartochkalar bilan bir xil vaznda turardi. Endi sahifaning yagona
 * katta yozuvi shu (Unbounded), qolgani tinch.
 *
 * `icon` mosligi uchun qabul qilinadi, lekin chizilmaydi: sahifa ikonkasi
 * yon menyuda allaqachon turibdi.
 */
export function PageHeader({
  title,
  description,
  actions,
  badge,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('mb-6 pt-1', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-balance font-title text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink sm:text-[28px]">
              {title}
            </h1>
            {badge}
          </div>
          {description ? <p className="mt-2 max-w-[70ch] text-[15px] leading-6 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
