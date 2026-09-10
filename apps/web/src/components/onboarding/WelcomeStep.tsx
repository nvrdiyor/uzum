import { motion } from 'framer-motion';
import { ArrowRight, Building2, Clock3, KeyRound, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const BLOCKS = [
  { key: 'c', icon: Building2, tone: 'bg-brand/10 text-brand' },
  { key: 'k', icon: KeyRound, tone: 'bg-info/10 text-info' },
  { key: 's', icon: RefreshCw, tone: 'bg-violet/10 text-violet' },
] as const;

/** 1-qadam: tanishtiruv ekrani — nima bo'lishini oldindan aytadi. */
export function WelcomeStep({ name, onStart }: { name: string; onStart: () => void }) {
  const t = useT('onboarding');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="card overflow-hidden bg-aurora"
    >
      <div className="px-6 py-8 text-center sm:px-10 sm:py-10">
        <span className="chip mx-auto bg-brand/12 text-brand">
          <Sparkles className="h-3.5 w-3.5" />
          {t('welcome.badge')}
        </span>

        <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {t('welcome.hello', { name })}
        </h1>
        <p className="mx-auto mt-2.5 max-w-md text-balance text-sm text-muted">{t('welcome.subtitle')}</p>

        <div className="mt-7 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {BLOCKS.map((b, i) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={b.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.06 * (i + 1), ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-line bg-surface-2/60 p-4"
              >
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', b.tone)}>
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">{t(`welcome.${b.key}.title`)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t(`welcome.${b.key}.body`)}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button size="lg" onClick={onStart} iconRight={<ArrowRight className="h-4 w-4" />}>
            {t('welcome.start')}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock3 className="h-3.5 w-3.5" />
            {t('welcome.time')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
