/**
 * Tariflar bo'yicha tez-tez so'raladigan savollar (akkordeon).
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const ITEMS = [1, 2, 3, 4, 5];

export function PricingFaq() {
  const t = useT('pricing');
  const [open, setOpen] = useState<number | null>(1);

  return (
    <div className="space-y-3">
      {ITEMS.map((n) => {
        const isOpen = open === n;
        return (
          <div
            key={n}
            className={cn(
              'rounded-2xl border bg-surface transition-colors duration-300',
              isOpen ? 'border-brand/35' : 'border-line',
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : n)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="font-display text-[15px] font-bold text-ink">{t(`faq.q${n}`)}</span>
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-spring',
                  isOpen ? 'rotate-45 bg-brand/12 text-brand' : 'bg-surface-2 text-muted',
                )}
              >
                <Plus className="h-4 w-4" />
              </span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  key="a"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{t(`faq.a${n}`)}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
