import type { Period } from '@savdoiq/shared';
import { ArrowLeftRight } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('comparePeriod', {
  uz: {
    label: '{range} bilan taqqoslanadi',
    hint: 'Foizdagi o‘zgarishlar va grafikdagi uzuq chiziq — shu oldingi teng davrga nisbatan, o‘sha ta’rifda',
  },
  ru: {
    label: 'Сравнение с {range}',
    hint: 'Изменения в процентах и пунктирная линия на графике — относительно этого предыдущего периода такой же длины',
  },
  en: {
    label: 'Compared with {range}',
    hint: 'Percent changes and the dashed chart line are measured against this previous period of equal length',
  },
});

/**
 * "7–30 sen bilan taqqoslanadi" — sahifadagi "+12%" lar QAYSI davrga
 * nisbatan ekani. Ilgari bu hech qayerda yozilmasdi: "Bu oy" tanlanganda
 * sotuvchi o'tgan oyning butuniga solishtirilyapti deb o'ylardi, aslida esa
 * teng uzunlikdagi oldingi kunlar bilan solishtiriladi.
 */
export function ComparePeriodChip({ period }: { period: Period }) {
  const t = useT('comparePeriod');
  const f = useFormat();

  const parts = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: f.monthShort(iso), y: iso.slice(0, 4) });
  const a = parts(period.from);
  const b = parts(period.to);
  const day = (p: { d: number; m: string }, year?: string) => {
    const s = f.lang === 'en' ? `${p.m} ${p.d}` : `${p.d} ${p.m}`;
    return year ? `${s} ${year}` : s;
  };
  let range: string;
  if (period.from === period.to) range = day(a);
  else if (a.y !== b.y) range = `${day(a, a.y)} – ${day(b, b.y)}`;
  else if (a.m === b.m) range = f.lang === 'en' ? `${a.m} ${a.d}–${b.d}` : `${a.d}–${b.d} ${b.m}`;
  else range = `${day(a)} – ${day(b)}`;

  return (
    <span className="meta-chip tnum" title={t('hint')}>
      <ArrowLeftRight className="h-3.5 w-3.5" />
      {t('label', { range })}
    </span>
  );
}
