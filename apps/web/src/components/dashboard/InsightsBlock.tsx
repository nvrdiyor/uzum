import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShieldAlert, Sparkles } from 'lucide-react';
import type { Insight } from '@savdoiq/shared';
import { LEVEL_TONE } from '@/lib/theme';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Card, EmptyState, Skeleton } from '@/components/ui';

const LEVEL_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: ShieldAlert,
} as const;

/**
 * "Aqlli" tavsiyalar bloki — sahifadagi eng ko'zga tashlanadigan qism.
 * Mobil: gorizontal skroll, katta ekranda: 2 ustunli to'r.
 */
export function InsightsBlock({ items, loading }: { items: Insight[]; loading?: boolean }) {
  const t = useT('dashboard');

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="section-title">{t('insights.title')}</h2>
            <p className="text-xs text-muted">{t('insights.subtitle')}</p>
          </div>
        </div>
        {!loading && items.length > 0 ? (
          <span className="chip bg-brand/[0.12] text-brand tnum">{t('insights.count', { n: items.length })}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            className="py-10"
            icon={<CheckCircle2 className="h-6 w-6" />}
            title={t('insights.empty')}
            hint={t('insights.emptyHint')}
          />
        </Card>
      ) : (
        <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
          {items.map((ins, i) => (
            <InsightCard key={ins.id} insight={ins} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const t = useT('dashboard');
  const tone = LEVEL_TONE[insight.level] ?? LEVEL_TONE.info;
  const Icon = LEVEL_ICON[insight.level] ?? Info;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative w-[86%] min-w-[268px] shrink-0 snap-start overflow-hidden rounded-2xl border p-4 md:w-auto md:min-w-0',
        tone.bg,
        tone.border,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface/70', tone.text)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold leading-snug text-ink">{insight.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{insight.body}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {insight.metric ? (
              <span className={cn('tnum text-xs font-semibold', tone.text)}>{insight.metric}</span>
            ) : null}
            {insight.link ? (
              <Link
                to={insight.link}
                className={cn('inline-flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80', tone.text)}
              >
                {t('insights.view')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
