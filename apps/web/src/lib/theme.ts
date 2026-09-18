/**
 * Grafiklar va status ranglari.
 * Bir joyda saqlanadi — barcha sahifalar shu palitradan foydalanadi.
 */

export const CHART_COLORS = {
  brand: '#10D094',
  brand2: '#3CE2BE',
  violet: '#9B80FF',
  info: '#5A96FF',
  warn: '#FFB020',
  danger: '#FF6368',
  teal: '#2DD4BF',
  pink: '#F472B6',
  lime: '#A3E635',
  slate: '#94A3B8',
} as const;

/** Ketma-ket seriyalar uchun tartib */
export const SERIES_PALETTE = [
  CHART_COLORS.brand,
  CHART_COLORS.violet,
  CHART_COLORS.info,
  CHART_COLORS.warn,
  CHART_COLORS.pink,
  CHART_COLORS.teal,
  CHART_COLORS.lime,
  CHART_COLORS.danger,
  CHART_COLORS.slate,
];

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
    boxShadow: '0 8px 40px -12px rgb(0 0 0 / 0.45)',
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
