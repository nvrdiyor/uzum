import { useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FadeUp } from './primitives';

const ITEMS = [1, 2, 3, 4, 5, 6];

/**
 * Savol-javob bo'limi.
 *
 * IKKI NARSA ATAYLAB SHUNDAY:
 *
 * 1. Savol — `<h3>`. Ilgari u oddiy `<span>` edi, ya'ni saytdagi eng yaxshi
 *    uzun-dumli matnning sarlavha tuzilmasi umuman yo'q edi.
 *
 * 2. Javob HAR DOIM DOM da turadi, faqat CSS bilan yig'iladi
 *    (`grid-template-rows: 0fr → 1fr`). Ilgari u `AnimatePresence` ichida
 *    shart bilan chizilardi: oltitadan beshtasi sahifada umuman bo'lmasdi
 *    va hech bir qidiruv roboti ularni ko'rmasdi. Balandlik animatsiyasi
 *    esa aynan shu ko'rinishda saqlanib qoldi.
 */
export function LandingFaq() {
  const t = useT('landing');
  const [open, setOpen] = useState<number | null>(1);
  const uid = useId();

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-3">
      {ITEMS.map((n, i) => {
        const isOpen = open === n;
        const panelId = `${uid}-faq-${n}`;
        return (
          <FadeUp key={n} delay={i * 0.04}>
            <div className={cn('card overflow-hidden transition-colors duration-300', isOpen && 'border-brand/35')}>
              <h3 className="m-0">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : n)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-[15px] font-bold text-ink sm:text-base"
                >
                  <span>{t(`faq.q${n}`)}</span>
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-spring',
                      isOpen ? 'rotate-45 bg-brand/10 text-brand-ink' : 'bg-surface-2 text-muted',
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              </h3>

              <div
                id={panelId}
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-spring',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{t(`faq.a${n}`)}</p>
                </div>
              </div>
            </div>
          </FadeUp>
        );
      })}
    </div>
  );
}
