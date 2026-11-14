/**
 * Uzum yechib olish (to'lov) haqi — xarajat satri NOMIDAN aniqlanadi (2026-11-14).
 *
 * `/v1/finance/expenses` da "Har hafta yechib olish xizmati uchun to‘lov"
 * (jadval bo'yicha to'lov haqi, 1%) va "Shoshilinch yechib olish xizmati uchun
 * to‘lov" (erta yechish, 2,5%) reklama bilan BIR XIL manba va kodda keladi
 * (source "Marketing", code У000120). Shuning uchun ular reklama bo'lib
 * yozilardi va hisobotlarda reklama sarfini oshirib ko'rsatardi — egasining
 * kompaniyasida 25.10 dan 14.11 gacha 79 659 so'm. Farqni faqat nom beradi.
 *
 * Bitta qolip hamma joyda: API (live.ts toifa, importer id, to'lovlar tarixi)
 * va bir martalik ko'chirish skripti. Brauzerga ham tushadi — shuning uchun
 * bu faylda faqat toza funksiya, Node moduli yo'q.
 *
 * Ehtiyot:
 *  • reklama satrida ham "… so'm yechib oldik" iborasi bor, ruschada "вывод в
 *    ТОП" — reklama. Shuning uchun naqsh "yechib olish xizmati" yoki muddat
 *    so'zi + "yechib olish"ni, ruschada "вывод средств" yoki muddat so'zi +
 *    "вывод"ni talab qiladi. Muddat so'zidan keyin ham "вывод в ТОП" / "вывод
 *    товара" (reklama, ombordan chiqarish) haq emas ("Срочный вывод в ТОП");
 *  • mahsulot ID'si bor satr (reklama) hech qachon haq emas.
 */

/** Yechib olish haqi satri */
const PAYOUT_FEE_RE =
  /yechib\s+olish\s+xizmat|(?:shoshilinch|tezkor|ertaroq|erta|har\s+(?:hafta|kun|oy|ikki\s+hafta)\S*)\s+yechib\s+olish|вывод\S*\s+(?:денежных\s+)?средств|(?:досрочн|срочн|еженедельн|ежедневн|ежемесячн|двухнедельн)\S*\s+вывод(?!\S*\s+(?:в\s+топ|товар))|withdraw\S*\s+(?:service|fee)|(?:early|urgent|instant|weekly|daily|biweekly|monthly)\s+withdraw/i;

/**
 * Erta (shoshilinch) yechish — faqat PAYOUT_FEE_RE mos kelgandan keyin.
 * Uzum kabinetida xizmat "Ertaroq yechib olish" deb ham ataladi.
 */
const EARLY_FEE_RE = /shoshilinch|tezkor|ertaroq|\berta\b|досрочн|срочн|\b(?:early|urgent|instant)\b/i;

/** Reklama satri: mahsulot ID'si bor (api pnl.ts adProductId bilan bir qolip) */
const AD_PRODUCT_RE = /(?:tovar\s+IDsi|ID\s+товара|товара\s+ID|product\s+ID)\D{0,6}\d{4,}/i;

/**
 * scheduled — jadval bo'yicha to'lov haqi (har hafta/kun/ikki hafta);
 * early — erta (shoshilinch) yechish haqi.
 */
export type PayoutFeeKind = 'scheduled' | 'early';

/** Xarajat satri nomi Uzum yechib olish haqimi; bo'lsa — qaysi turi, bo'lmasa null */
export function payoutFeeKind(note: string | null | undefined): PayoutFeeKind | null {
  const text = (note ?? '').trim();
  if (!text || !PAYOUT_FEE_RE.test(text) || AD_PRODUCT_RE.test(text)) return null;
  return EARLY_FEE_RE.test(text) ? 'early' : 'scheduled';
}
