import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Har bir sahifaning yuqori qismi: ikonka + sarlavha + tavsif + o'ng tomonda amallar.
 * Fon — yumshoq "aurora" gradient, sayt uslubining asosiy belgisi.
 */
export function PageHeader({
  icon,
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
    <div
      className={cn(
        'relative mb-5 overflow-hidden rounded-2xl border border-line bg-surface bg-aurora px-5 py-5 sm:px-6',
        className,
      )}
    >
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-on-brand shadow-[0_8px_24px_-10px_rgb(var(--c-brand)/0.9)]">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
              {badge}
            </div>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative mt-4">{children}</div> : null}
    </div>
  );
}
