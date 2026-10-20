import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from '@/components/icons';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Oyna ochiq paytdagi umumiy xatti-harakat:
 *  - Escape yopadi, orqadagi sahifa aylanmaydi;
 *  - fokus oyna ichiga o'tadi va Tab bilan undan chiqib ketmaydi;
 *  - yopilgach fokus oynani ochgan tugmaga qaytadi.
 * Ilgari fokus orqadagi sahifada qolar, klaviatura va ekran o'quvchi bilan
 * ishlaydigan foydalanuvchi oyna ochilganini sezmasdi.
 */
function useDialog(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>) {
  // onClose har chizishda yangi bo'lishi mumkin — effekt qayta ulanmasin
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Animatsiya boshlanib, panel DOM'ga tushgach fokus beriladi
    const focusTimer = window.setTimeout(() => {
      const el = panel.current;
      if (!el || el.contains(document.activeElement)) return;
      // Telefonda maydonga fokus berilsa klaviatura o'zi ochilib oynani yopadi — u yerda oynaning o'ziga
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      const first = touch ? null : el.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]), select, textarea');
      (first ?? el).focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open, panel]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}) {
  const t = useT('common');
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialog(open, onClose, panel);

  const width = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop focus:outline-none sm:rounded-2xl',
              width,
            )}
          >
            {title ? (
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h3 id={titleId} className="font-display text-lg font-bold text-ink">
                    {title}
                  </h3>
                  {description ? (
                    <p id={descId} className="mt-0.5 text-sm text-muted">
                      {description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('btn.close')}
                  title={t('btn.close')}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer ? <div className="border-t border-line bg-surface-2/50 px-5 py-4">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/** O'ngdan chiquvchi panel (detallar uchun) */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT('common');
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panel);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-pop focus:outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h3 id={titleId} className="min-w-0 font-display text-lg font-bold text-ink">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('btn.close')}
                title={t('btn.close')}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
            {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
