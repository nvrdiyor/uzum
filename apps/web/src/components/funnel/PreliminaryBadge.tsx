import { Hourglass } from '@/components/icons';
import { Badge } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FUNNEL_LOSS_NS } from './i18n';

/**
 * "Dastlabki · 87% yakunlangan" — sotib olish foizi va yo'qotishlar hali
 * o'zgarishi mumkinligi. Ilgari "Bu oy" davrida yo'ldagi yuzlab dona
 * bo'lsa ham foiz yakuniy raqamdek ko'rsatilardi: u faqat eski buyurtmalardan
 * chiqadi, yo'ldagilar yetib borgach esa o'zgaradi (2026-10-24).
 *
 * Qachon chiqishini server hal qiladi (`totals.preliminary`, funnel.ts
 * PRELIMINARY_BELOW). Foiz PASTGA yaxlitlanadi: 94,6% "95%" bo'lib, 95%
 * chegarasidan o'tgandek ko'rinmasin (CostCoverage chipi bilan bir xil qoida).
 */
export function PreliminaryBadge({
  completedPct,
  inTransit,
  className,
}: {
  completedPct: number;
  inTransit: number;
  className?: string;
}) {
  const t = useT(FUNNEL_LOSS_NS);
  const f = useFormat();
  const p = f.pct(Math.floor(completedPct), 0);
  return (
    <Badge
      tone="warn"
      className={cn('tnum whitespace-nowrap', className)}
      title={t('prelim.hint', { p, n: f.num(inTransit) })}
    >
      <Hourglass className="h-3 w-3 shrink-0" />
      {t('prelim.badge', { p })}
    </Badge>
  );
}
