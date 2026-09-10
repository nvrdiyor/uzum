import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  timeout?: number;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 10);
    set({ items: [...get().items, { ...t, id }] });
    const timeout = t.timeout ?? 4200;
    if (timeout > 0) setTimeout(() => get().dismiss(id), timeout);
    return id;
  },
  dismiss: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}));

export const toast = {
  success: (title: string, body?: string) => useToastStore.getState().push({ tone: 'success', title, body }),
  error: (title: string, body?: string) => useToastStore.getState().push({ tone: 'error', title, body }),
  info: (title: string, body?: string) => useToastStore.getState().push({ tone: 'info', title, body }),
  warning: (title: string, body?: string) => useToastStore.getState().push({ tone: 'warning', title, body }),
};

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TONE = {
  success: 'text-brand',
  error: 'text-danger',
  info: 'text-info',
  warning: 'text-warn',
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-pop"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', TONE[t.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body ? <p className="mt-0.5 text-xs text-muted">{t.body}</p> : null}
              </div>
              <button onClick={() => dismiss(t.id)} className="rounded-md p-1 text-muted hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
