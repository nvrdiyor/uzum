/**
 * Xarid foizi — mahsulot kartochkasi, jadval va tafsilot sahifasi uchun
 * bitta qiymat, rang va izoh.
 *
 * Ilgari bu o'rinda "Konversiya" turardi: server uni bozor o'rtachasi (2,5%)
 * va reytingdan to'qirdi — Seller API kartochka ko'rishlarini bermaydi, demak
 * raqam haqiqiy emas edi. Endi davrdagi yakunlangan pozitsiyalardan
 * hisoblangan xarid foizi ko'rsatiladi (2026-10-24).
 */
import type { ProductCard } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('productBuyout', {
  uz: {
    label: 'Xarid foizi',
    // Mahsulot kartochkasidagi tor katak uchun (~50 px) — to'liq nomi izohda
    short: 'Xarid %',
    why: 'Tanlangan davrda xaridor qabul qilgan dona ÷ yakunlangan dona (qabul qilingan + bekor qilingan + qaytarilgan). Hali yo‘ldagi buyurtmalar hisobga kirmaydi.',
    base: 'Yakunlangan: {done} dona, shundan qabul qilingan: {bought}.',
    transit: 'Yo‘lda: {n} dona — yakunlangach hisobga qo‘shiladi.',
    none: 'Davrda yakunlangan buyurtma yo‘q — foiz hali hisoblanmaydi.',
  },
  ru: {
    label: 'Процент выкупа',
    short: 'Выкуп',
    why: 'Выкупленные штуки ÷ завершённые штуки (выкуплено + отменено + возвращено) за выбранный период. Заказы в пути не учитываются.',
    base: 'Завершено: {done} шт., из них выкуплено: {bought}.',
    transit: 'В пути: {n} шт. — войдут в расчёт после завершения.',
    none: 'За период нет завершённых заказов — процент пока не считается.',
  },
  en: {
    label: 'Buyout rate',
    short: 'Buyout',
    why: 'Units accepted by buyers ÷ completed units (accepted + canceled + returned) in the selected period. Orders still in transit are not counted.',
    base: 'Completed: {done} units, accepted: {bought}.',
    transit: 'In transit: {n} units — counted once completed.',
    none: 'No completed orders in this period — the rate cannot be calculated yet.',
  },
});

type BuyoutFields = Pick<ProductCard, 'buyoutRate' | 'buyoutUnits' | 'completedUnits' | 'transitUnits'>;

/** Yakunlangan pozitsiya bo'lmasa null — "0%" "hech kim sotib olmadi" degani bo'lib qolardi */
export function buyoutRateOf(p: BuyoutFields): number | null {
  return typeof p.buyoutRate === 'number' && Number.isFinite(p.buyoutRate) ? p.buyoutRate : null;
}

/** Rang chegaralari Sotuv voronkasidagi bilan bir xil: 70% va 40% */
export function buyoutTone(rate: number | null): 'brand' | 'warn' | 'danger' | undefined {
  if (rate === null) return undefined;
  if (rate >= 70) return 'brand';
  if (rate >= 40) return 'warn';
  return 'danger';
}

const TONE_TEXT = { brand: 'text-brand-ink', warn: 'text-warn-ink', danger: 'text-danger' } as const;

/** Qiymat uchun matn rangi (token klassi); hisoblanmagan bo'lsa — muted */
export function buyoutTextClass(rate: number | null): string {
  const tone = buyoutTone(rate);
  return tone ? TONE_TEXT[tone] : 'text-muted';
}

/**
 * Xarid foizi yozuvlari: sarlavha, qiymat ("—" yoki "86,4%") va izoh (title).
 * Sarlavha har doim oddiy matn — jadvalning telefondagi "Saralash" ro'yxati
 * JSX sarlavhani ko'rsata olmaydi; formula izohi `hint` ichida.
 */
export function useBuyout() {
  const t = useT('productBuyout');
  const f = useFormat();
  return {
    label: t('label'),
    short: t('short'),
    value: (p: BuyoutFields): string => {
      const rate = buyoutRateOf(p);
      return rate === null ? '—' : f.pct(rate);
    },
    /** Formula, asos (necha dona yakunlangan) va yo'ldagi dona — brauzer izohida qatorma-qator */
    hint: (p: BuyoutFields): string => {
      const done = p.completedUnits ?? 0;
      const transit = p.transitUnits ?? 0;
      return [
        t('why'),
        done > 0 ? t('base', { done: f.num(done), bought: f.num(p.buyoutUnits ?? 0) }) : t('none'),
        transit > 0 ? t('transit', { n: f.num(transit) }) : '',
      ]
        .filter(Boolean)
        .join('\n');
    },
  };
}
