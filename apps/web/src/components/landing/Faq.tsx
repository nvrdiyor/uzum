import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { EASE, FadeUp } from './primitives';

const ITEMS = [1, 2, 3, 4, 5, 6];

export function LandingFaq() {
  const t = useT('landing');
  const [open, setOpen] = useState<number | null>(1);

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-3">
      {ITEMS.map((n, i) => {
        const isOpen = open === n;
        return (
          <FadeUp key={n} delay={i * 0.04}>
            <div
              className={cn(
                'card overflow-hidden transition-colors duration-300',
                isOpen && 'border-brand/35',
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : n)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-display text-[15px] font-bold text-ink sm:text-base">{t(`faq.q${n}`)}</span>
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-spring',
                    isOpen ? 'rotate-45 bg-brand/10 text-brand-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  <Plus className="h-4 w-4" />
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{t(`faq.a${n}`)}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </FadeUp>
        );
      })}
    </div>
  );
}
