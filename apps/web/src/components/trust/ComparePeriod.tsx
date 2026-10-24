import type { Period } from '@savdoiq/shared';
import { ArrowLeftRight, CalendarOff } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('comparePeriod', {
  uz: {
    label: '{range} bilan taqqoslanadi',
    hint: 'Foizdagi o‘zgarishlar va grafikdagi uzuq chiziq — shu oldingi teng davrga nisbatan, o‘sha ta’rifda',
    none: 'Oldingi davr bilan taqqoslanmaydi',
    noneHint:
      'Oldingi teng davr saqlangan tarixdan tashqarida (birinchi sinxron yoki tarif chegarasi) — u yerdagi nol “sotuv bo‘lmagan” emas, “ma’lumot yo‘q” degani. Shuning uchun foizdagi o‘zgarishlar va grafikdagi uzuq chiziq ko‘rsatilmaydi',
  },
  ru: {
    label: 'Сравнение с {range}',
    hint: 'Изменения в процентах и пунктирная линия на графике — относительно этого предыдущего периода такой же длины',
    none: 'Без сравнения с прошлым периодом',
    noneHint:
      'Предыдущий период такой же длины выходит за пределы сохранённой истории (первая синхронизация или лимит тарифа) — ноль там означает «нет данных», а не «не было продаж». Поэтому изменения в процентах и пунктир на графике не показываются',
  },
  en: {
    label: 'Compared with {range}',
    hint: 'Percent changes and the dashed chart line are measured against this previous period of equal length',
    none: 'No comparison with the previous period',
    noneHint:
      'The previous period of equal length falls outside the stored history (first sync or plan limit) — a zero there means “no data”, not “no sales”. So percent changes and the dashed chart line are hidden',
  },
});

/**
 * "7–30 sen bilan taqqoslanadi" — sahifadagi "+12%" lar QAYSI davrga
 * nisbatan ekani. Ilgari bu hech qayerda yozilmasdi: "Bu oy" tanlanganda
 * sotuvchi o'tgan oyning butuniga solishtirilyapti deb o'ylardi, aslida esa
 * teng uzunlikdagi oldingi kunlar bilan solishtiriladi.
 *
 * `period` null — oldingi davr saqlangan tarixdan tashqarida (server
 * comparablePeriod): KPI'lardagi tire va yo'q uzuq chiziqning sababi shu
 * yerda aytiladi, aks holda "nega foiz yo'q" degan savol qoladi.
 */
export function ComparePeriodChip({ period }: { period: Period | null }) {
  const t = useT('comparePeriod');
  const f = useFormat();

  if (!period) {
    return (
      <span className="meta-chip" title={t('noneHint')}>
        <CalendarOff className="h-3.5 w-3.5" />
        {t('none')}
      </span>
    );
  }

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
