import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/components/ui';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { FieldSource, SourceKind } from './unitSources';
import './texts';

/** Belgi rangi: Uzum tarifi — ko'k (Uzum'dan kelgan), o'z ma'lumotingiz — brend, taxmin — kulrang */
const TONE: Record<SourceKind, Tone> = { tariff: 'info', data: 'brand', estimate: 'muted' };

/**
 * Qiymat manbai belgisi. Formula sichqoncha olib borilganda (`title`) va
 * maydon tanlanganda izohda (`SourceHint`) ko'rinadi — telefonda sichqoncha yo'q.
 */
export function SourceBadge({ source, className }: { source: FieldSource; className?: string }) {
  const t = useT('calcSource');
  const label = t(`kind.${source.kind}`);
  return (
    <Badge tone={TONE[source.kind]} className={cn('max-w-full px-1.5 py-0 text-2xs', className)} title={`${label}: ${source.formula}`}>
      <span className="truncate">{label}</span>
    </Badge>
  );
}

/**
 * Maydon ostidagi belgi uchun joy. Belgi faqat qiymat avtomatik bo'lganda
 * turadi; joy esa doim band — aks holda birinchi tugma bosilishi bilan belgi
 * yo'qolib, pastdagi forma yuqoriga sakrardi.
 */
export function SourceSlot({ source }: { source?: FieldSource }) {
  return <div className="mt-1.5 flex h-5 min-w-0 items-center">{source ? <SourceBadge source={source} /> : null}</div>;
}

/** Maydon izohi + manba formulasi (izoh maydon tanlanganda chiqadi) */
export function SourceHint({ hint, source }: { hint: ReactNode; source?: FieldSource }) {
  const t = useT('calcSource');
  if (!source) return <>{hint}</>;
  return (
    <>
      {hint}
      <span className="mt-1 block border-t border-line/70 pt-1 text-ink">
        <span className="font-semibold">{t(`kind.${source.kind}`)}:</span> {source.formula}
      </span>
    </>
  );
}
