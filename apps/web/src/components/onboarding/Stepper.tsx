import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OnboardStepKey = 'company' | 'api_key' | 'syncing';

export const ONBOARD_ORDER: OnboardStepKey[] = ['company', 'api_key', 'syncing'];

/**
 * Uch bosqichli progress indikatori — onboarding'ning barcha ekranlarida bir xil turadi,
 * shuning uchun foydalanuvchi qayerda ekanini doim ko'radi.
 */
export function OnboardStepper({
  current,
  labels,
  className,
}: {
  current: OnboardStepKey;
  labels: Record<OnboardStepKey, string>;
  className?: string;
}) {
  const idx = ONBOARD_ORDER.indexOf(current);

  return (
    <ol className={cn('flex items-center gap-2 sm:gap-3', className)}>
      {ONBOARD_ORDER.map((key, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={key} className="flex flex-1 items-center gap-2 sm:gap-3">
            <span
              className={cn(
                'tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ease-spring',
                done && 'border-brand/50 bg-brand/10 text-brand-ink',
                active && 'border-brand bg-brand/10 text-brand-ink ring-4 ring-brand/10',
                !done && !active && 'border-line bg-surface-2 text-muted',
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                'hidden whitespace-nowrap text-xs font-semibold sm:block',
                active ? 'text-ink' : done ? 'text-ink-soft' : 'text-muted',
              )}
            >
              {labels[key]}
            </span>
            {i < ONBOARD_ORDER.length - 1 ? (
              <span
                className={cn(
                  'h-px flex-1 rounded-full transition-colors duration-500',
                  done ? 'bg-brand/50' : 'bg-line',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
