import type { CompareMode, Period } from '@savdoiq/shared';
import { ArrowLeftRight, CalendarOff } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { useUi } from '@/store/ui';

registerNamespace('comparePeriod', {
  uz: {
    label: '{range} bilan taqqoslanadi',
    'label.prevMonth': 'O‘tgan oy: {range} bilan taqqoslanadi',
    'label.prevYear': 'O‘tgan yil: {range} bilan taqqoslanadi',
    hint: 'Foizdagi o‘zgarishlar va grafikdagi uzuq chiziq — shu oldingi teng davrga nisbatan, o‘sha ta’rifda',
    'hint.prevMonth':
      'Foizdagi o‘zgarishlar va grafikdagi uzuq chiziq — o‘tgan oyning o‘sha sanalariga nisbatan, o‘sha ta’rifda. O‘tgan oyda bunday sana bo‘lmasa — oyning oxirgi kuni (31-mart → 28-fevral); butun oy o‘tgan butun oy bilan solishtiriladi',
    'hint.prevYear':
      'Foizdagi o‘zgarishlar va grafikdagi uzuq chiziq — o‘tgan yilning o‘sha sanalariga nisbatan, o‘sha ta’rifda (29-fevral → 28-fevral)',
    none: 'Oldingi davr bilan taqqoslanmaydi',
    'none.prevMonth': 'O‘tgan oy bilan taqqoslanmaydi',
    'none.prevYear': 'O‘tgan yil bilan taqqoslanmaydi',
    noneHint:
      'Oldingi teng davr saqlangan tarixdan tashqarida (birinchi sinxron yoki tarif chegarasi) — u yerdagi nol “sotuv bo‘lmagan” emas, “ma’lumot yo‘q” degani. Shuning uchun foizdagi o‘zgarishlar va grafikdagi uzuq chiziq ko‘rsatilmaydi',
    'noneHint.prevMonth':
      'O‘tgan oyning o‘sha sanalari saqlangan tarixdan tashqarida (birinchi sinxron yoki tarif chegarasi) — u yerdagi nol “sotuv bo‘lmagan” emas, “ma’lumot yo‘q” degani. Shuning uchun foizdagi o‘zgarishlar va grafikdagi uzuq chiziq ko‘rsatilmaydi',
    'noneHint.prevYear':
      'O‘tgan yilning o‘sha sanalari saqlangan tarixdan tashqarida (birinchi sinxron yoki tarif chegarasi) — u yerdagi nol “sotuv bo‘lmagan” emas, “ma’lumot yo‘q” degani. Shuning uchun foizdagi o‘zgarishlar va grafikdagi uzuq chiziq ko‘rsatilmaydi',
    reset: 'Bosing — oldingi teng davr bilan taqqoslashga qaytish',
    // Davr tanlagichidagi rejimlar (components/filters.tsx)
    'mode.title': 'Taqqoslash',
    'mode.prev': 'Oldingi davr',
    'mode.prevMonth': 'O‘tgan oy',
    'mode.prevYear': 'O‘tgan yil',
    'mode.outside': 'Tarifingiz tarixidan tashqarida — taqqoslanmaydi',
  },
  ru: {
    label: 'Сравнение с {range}',
    'label.prevMonth': 'Прошлый месяц: сравнение с {range}',
    'label.prevYear': 'Прошлый год: сравнение с {range}',
    hint: 'Изменения в процентах и пунктирная линия на графике — относительно этого предыдущего периода такой же длины',
    'hint.prevMonth':
      'Изменения в процентах и пунктирная линия на графике — относительно тех же дат прошлого месяца. Если такой даты в прошлом месяце нет — последний день месяца (31 марта → 28 февраля); полный месяц сравнивается с полным прошлым месяцем',
    'hint.prevYear':
      'Изменения в процентах и пунктирная линия на графике — относительно тех же дат прошлого года (29 февраля → 28 февраля)',
    none: 'Без сравнения с прошлым периодом',
    'none.prevMonth': 'Без сравнения с прошлым месяцем',
    'none.prevYear': 'Без сравнения с прошлым годом',
    noneHint:
      'Предыдущий период такой же длины выходит за пределы сохранённой истории (первая синхронизация или лимит тарифа) — ноль там означает «нет данных», а не «не было продаж». Поэтому изменения в процентах и пунктир на графике не показываются',
    'noneHint.prevMonth':
      'Те же даты прошлого месяца выходят за пределы сохранённой истории (первая синхронизация или лимит тарифа) — ноль там означает «нет данных», а не «не было продаж». Поэтому изменения в процентах и пунктир на графике не показываются',
    'noneHint.prevYear':
      'Те же даты прошлого года выходят за пределы сохранённой истории (первая синхронизация или лимит тарифа) — ноль там означает «нет данных», а не «не было продаж». Поэтому изменения в процентах и пунктир на графике не показываются',
    reset: 'Нажмите, чтобы сравнивать с предыдущим периодом',
    'mode.title': 'Сравнение',
    'mode.prev': 'Предыдущий период',
    'mode.prevMonth': 'Прошлый месяц',
    'mode.prevYear': 'Прошлый год',
    'mode.outside': 'За пределами истории тарифа — без сравнения',
  },
  en: {
    label: 'Compared with {range}',
    'label.prevMonth': 'Last month: compared with {range}',
    'label.prevYear': 'Last year: compared with {range}',
    hint: 'Percent changes and the dashed chart line are measured against this previous period of equal length',
    'hint.prevMonth':
      'Percent changes and the dashed chart line are measured against the same dates last month. A date that does not exist there becomes the last day of the month (Mar 31 → Feb 28); a whole month is compared with the whole previous month',
    'hint.prevYear':
      'Percent changes and the dashed chart line are measured against the same dates last year (Feb 29 → Feb 28)',
    none: 'No comparison with the previous period',
    'none.prevMonth': 'No comparison with last month',
    'none.prevYear': 'No comparison with last year',
    noneHint:
      'The previous period of equal length falls outside the stored history (first sync or plan limit) — a zero there means “no data”, not “no sales”. So percent changes and the dashed chart line are hidden',
    'noneHint.prevMonth':
      'The same dates last month fall outside the stored history (first sync or plan limit) — a zero there means “no data”, not “no sales”. So percent changes and the dashed chart line are hidden',
    'noneHint.prevYear':
      'The same dates last year fall outside the stored history (first sync or plan limit) — a zero there means “no data”, not “no sales”. So percent changes and the dashed chart line are hidden',
    reset: 'Click to compare with the previous period instead',
    'mode.title': 'Compare with',
    'mode.prev': 'Previous period',
    'mode.prevMonth': 'Last month',
    'mode.prevYear': 'Last year',
    'mode.outside': 'Outside your plan’s history — no comparison',
  },
});

type RangeFormat = Pick<ReturnType<typeof useFormat>, 'lang' | 'monthShort'>;

/**
 * Qisqa davr yozuvi: "7–30 sen", "28 sen – 4 okt", "31 dek 2025 – 6 yan 2026".
 * `withYear` — yil bir xil bo'lsa ham yoziladi: "O'tgan yil" rejimida
 * "1–24 okt" joriy oktabrdek o'qilardi (davr tanlagichi ham shundan foydalanadi).
 */
export function formatCompareRange(period: Period, f: RangeFormat, withYear = false): string {
  const parts = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: f.monthShort(iso), y: iso.slice(0, 4) });
  const a = parts(period.from);
  const b = parts(period.to);
  const day = (p: { d: number; m: string }, year?: string) => {
    const s = f.lang === 'en' ? `${p.m} ${p.d}` : `${p.d} ${p.m}`;
    return year ? `${s} ${year}` : s;
  };
  const tail = withYear ? ` ${b.y}` : '';
  if (period.from === period.to) return day(a, withYear ? a.y : undefined);
  if (a.y !== b.y) return `${day(a, a.y)} – ${day(b, b.y)}`;
  if (a.m === b.m) return `${f.lang === 'en' ? `${a.m} ${a.d}–${b.d}` : `${a.d}–${b.d} ${b.m}`}${tail}`;
  return `${day(a)} – ${day(b)}${tail}`;
}

/** Rejimga mos kalit: 'prev' — asosiy kalit (eski matnlar o'zgarmaydi), boshqasi — `kalit.rejim` */
const modeKey = (base: string, mode: CompareMode) => (mode === 'prev' ? base : `${base}.${mode}`);

/**
 * "7–30 sen bilan taqqoslanadi" — sahifadagi "+12%" lar QAYSI davrga
 * nisbatan ekani. Ilgari bu hech qayerda yozilmasdi: "Bu oy" tanlanganda
 * sotuvchi o'tgan oyning butuniga solishtirilyapti deb o'ylardi, aslida esa
 * teng uzunlikdagi oldingi kunlar bilan solishtiriladi.
 *
 * Taqqoslash rejimi (davr tanlagichida: oldingi davr / o'tgan oy / o'tgan
 * yil) do'kondan olinadi va yozuvda aytiladi — "O'tgan yil: 1–24 okt 2025
 * bilan taqqoslanadi". Diapazonning o'zi esa doim SERVER javobidan
 * (`comparePeriod`), shuning uchun yozuv raqamlar bilan farq qilmaydi.
 *
 * `period` null — taqqoslash davri saqlangan tarixdan tashqarida (server
 * comparablePeriod): KPI'lardagi tire va yo'q uzuq chiziqning sababi shu
 * yerda aytiladi, aks holda "nega foiz yo'q" degan savol qoladi. Standartdan
 * boshqa rejimda chip tugma bo'ladi va oldingi teng davrga qaytaradi: rejim
 * saqlanadi va hamma sahifaga ta'sir qiladi — "O'tgan yil" ni bir marta
 * tanlagan sotuvchi har sahifada tire ko'rib, sababini qidirib qolmasin
 * (2026-10-24).
 */
export function ComparePeriodChip({ period }: { period: Period | null }) {
  const t = useT('comparePeriod');
  const f = useFormat();
  const mode = useUi((s) => s.compare);
  const setCompare = useUi((s) => s.setCompare);

  if (!period) {
    if (mode !== 'prev') {
      return (
        <button
          type="button"
          onClick={() => setCompare('prev')}
          title={`${t(modeKey('noneHint', mode))}\n${t('reset')}`}
          className="meta-chip focusable transition-[border-color,color] hover:border-line-strong hover:text-ink"
        >
          <CalendarOff className="h-3.5 w-3.5" />
          {t(modeKey('none', mode))}
        </button>
      );
    }
    return (
      <span className="meta-chip" title={t('noneHint')}>
        <CalendarOff className="h-3.5 w-3.5" />
        {t('none')}
      </span>
    );
  }

  const range = formatCompareRange(period, f, mode === 'prevYear');

  return (
    <span className="meta-chip tnum" title={t(modeKey('hint', mode))}>
      <ArrowLeftRight className="h-3.5 w-3.5" />
      {t(modeKey('label', mode), { range })}
    </span>
  );
}
