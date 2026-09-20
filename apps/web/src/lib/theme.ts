/**
 * Grafiklar va status ranglari.
 * Bir joyda saqlanadi — barcha sahifalar shu palitradan foydalanadi.
 */

/*
 * Grafik ranglari mavzuga ergashadi.
 *
 * SVG taqdimot atributi (fill, stroke) CSS o'zgaruvchisini qabul qiladi,
 * shuning uchun Recharts ga to'g'ridan-to'g'ri uzatish mumkin. Ilgari bu
 * yerda qorong'i mavzuga moslangan HEX turardi va yorug' mavzuda chiziqlar
 * oq fonda yo'qolib ketardi.
 */
export const CHART_COLORS = {
  brand: 'rgb(var(--c-brand))',
  brand2: 'rgb(var(--c-brand-2))',
  violet: 'rgb(var(--c-violet))',
  info: 'rgb(var(--c-info))',
  warn: 'rgb(var(--c-warn))',
  danger: 'rgb(var(--c-danger))',
  teal: 'rgb(var(--c-teal))',
  pink: 'rgb(var(--c-pink))',
  lime: 'rgb(var(--c-lime))',
  slate: 'rgb(var(--c-slate))',
} as const;

/**
 * Kategorik seriyalar palitrasi — «bu qaysi narsa» degan savolga javob beradi.
 *
 * Holat ranglaridan (brand, warn, danger) ATAYLAB ajratilgan: holat rangi
 * band bo'lgan ma'noni tashiydi va uni «to'rtinchi seriya» sifatida qayta
 * ishlatish mumkin emas.
 *
 * Tartib tekshirgich bilan tasdiqlangan — o'zgartirilsa qayta tekshirilishi
 * shart, chunki ajralish aynan QO'SHNI juftliklar bo'yicha o'lchanadi.
 */
export const SERIES_PALETTE = [
  'rgb(var(--sc-1))',
  'rgb(var(--sc-2))',
  'rgb(var(--sc-3))',
  'rgb(var(--sc-4))',
  'rgb(var(--sc-5))',
  'rgb(var(--sc-6))',
  'rgb(var(--sc-7))',
  'rgb(var(--sc-8))',
];

/** Sakkizdan keyingi hamma narsa — bitta neytral «Boshqa» rangi */
export const SERIES_OTHER = 'rgb(var(--c-slate))';

/**
 * Seriya rangi.
 *
 * Palitra AYLANTIRILMAYDI: to'qqizinchi seriya birinchisining rangini
 * olsa, ikkalasi bir xil narsa bo'lib ko'rinadi. Sakkizdan keyingilari
 * neytral rangga tushadi — chaqiruvchi ularni «Boshqa» ga yig'ishi kerak.
 */
export function seriesColor(index: number): string {
  return SERIES_PALETTE[index] ?? SERIES_OTHER;
}

export const LEVEL_TONE = {
  info: { bg: 'bg-info/10', border: 'border-info/25', text: 'text-info-ink' },
  success: { bg: 'bg-brand/10', border: 'border-brand/25', text: 'text-brand-ink' },
  warning: { bg: 'bg-warn/10', border: 'border-warn/25', text: 'text-warn-ink' },
  danger: { bg: 'bg-danger/10', border: 'border-danger/25', text: 'text-danger-ink' },
} as const;

export function chartAxisProps() {
  return {
    stroke: 'rgb(var(--c-border))',
    tick: { fill: 'rgb(var(--c-muted))', fontSize: 11 },
    tickLine: false,
    axisLine: false,
  } as const;
}

export function tooltipStyle(): React.CSSProperties {
  return {
    background: 'rgb(var(--c-surface))',
    border: '1px solid rgb(var(--c-border-strong))',
    borderRadius: 12,
    boxShadow: '0 8px 40px -12px rgb(var(--c-shadow) / calc(var(--sh-2) + 0.1))',
    fontSize: 12,
    color: 'rgb(var(--c-text))',
    padding: '10px 12px',
  };
}

/**
 * Izoh ichidagi QATOR matni.
 *
 * Recharts har bir qatorga seriya rangini INLINE `color` qilib beradi —
 * masalan tannarx uchun to'q kulrang. Qorong'i fonda bunday matn deyarli
 * ko'rinmaydi. Shuning uchun rangni majburan o'qiladigan qilib qo'yamiz
 * (rang nuqtasi `recharts` ning o'z belgisida qoladi).
 */
export function tooltipItemStyle(): React.CSSProperties {
  return { color: 'rgb(var(--c-text))', fontWeight: 600, padding: 0 };
}

/** Izoh sarlavhasi (sana yoki kategoriya nomi) */
export function tooltipLabelStyle(): React.CSSProperties {
  return { color: 'rgb(var(--c-muted))', fontWeight: 600, marginBottom: 4 };
}
