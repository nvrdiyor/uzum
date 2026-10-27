/**
 * Uzum tariflarini ko'rsatish uchun yordamchilar. Raqamlar shared tariffs.ts
 * dan olinadi, matnga qotirilmaydi: tarif o'zgarsa Litrovka kalkulyatori, unit
 * kalkulyator belgilari va Ombor sahifasi bir joydan yangilanadi (2026-10-24).
 */
import { STORAGE_TARIFF, type StorageTariffKind } from '@savdoiq/shared';

/**
 * Qo'llanma sahifalari. Faqat o'zbekcha bor — /manual/ru/... 404 qaytaradi
 * (2026-10-24), shuning uchun ru/en havola matnida til aytiladi.
 */
export const MANUAL_TARIFFS_URL = 'https://seller.uzum.uz/manual/uz/3.tariffs/';
export const MANUAL_STORAGE_URL = 'https://seller.uzum.uz/manual/uz/6.product-preparation/#pullik-saqlash-tariflari';

/** Aylanma guruhlari soni (bepul, 61–180, 181–360, 361+) */
export const TIER_COUNT = STORAGE_TARIFF.standard.tiers.length;

/** Aylanma qaysi guruhga tushadi: 0 — bepul (≤ 60 kun), oxirgisi — 361+ (sotuv yo'q ham shu) */
export function tierIndex(turnover: number): number {
  const i = STORAGE_TARIFF.standard.tiers.findIndex((t) => turnover <= t.upTo);
  return i < 0 ? TIER_COUNT - 1 : i;
}

/** Guruh yorlig'i: "≤ 60", "61–180", "181–360", "361+" — chegaralar tariffs.ts dan */
export function tierLabel(index: number): string {
  const tiers = STORAGE_TARIFF.standard.tiers;
  const tier = tiers[index];
  if (!tier) return '';
  if (index === 0) return `≤ ${tier.upTo}`;
  const from = tiers[index - 1].upTo + 1;
  return Number.isFinite(tier.upTo) ? `${from}–${tier.upTo}` : `${from}+`;
}

/** Guruh stavkasi, so'm / litr / kun (bepul guruhda 0) */
export function tierRate(index: number, kind: StorageTariffKind): number {
  return STORAGE_TARIFF[kind].tiers[index]?.rate ?? 0;
}

/** Pullik guruhlar stavkalari qisqa yozuvda: "12 / 18 / 24" */
export function paidRates(kind: StorageTariffKind): string {
  return STORAGE_TARIFF[kind].tiers
    .filter((t) => t.rate > 0)
    .map((t) => String(t.rate))
    .join(' / ');
}

/**
 * Litr uchun kasr xonalari: "0,15 l", "2,4 l", "57 l". `f.num(v, 2)` hamma
 * joyda ikki xona qo'yardi ("57,00 l"), `f.num(v, 1)` esa 0,15 litrni
 * "0,2" ga yaxlitlab, kichik tovar hajmini buzardi.
 */
export function literDigits(value: number, max = 3): number {
  for (let digits = 0; digits < max; digits += 1) {
    const scaled = value * 10 ** digits;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return digits;
  }
  return max;
}
