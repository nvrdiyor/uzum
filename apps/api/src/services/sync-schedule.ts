/**
 * Avtomatik sinxron qachon yuradi.
 *
 * Kunduzi (09:00–24:00, Toshkent vaqti) — tarif oralig'i bo'yicha. Kechasi
 * (00:00–09:00) savdo kam, har 10–20 daqiqada Uzum'ga murojaat qilish esa
 * ortiqcha yuk: 2026-yil 11-oktabrda Uzum server manzilimizni to'sib qo'ygan.
 * Shuning uchun kechasi faqat ikki marta — 03:00 va 06:00 da — yuriladi,
 * 09:00 da kunduzgi tartib qaytadi.
 *
 * Uzum ochiq API'sida "sotuv bo'ldi" degan xabar (webhook) yo'q, ya'ni
 * sotuvni faqat so'rab bilish mumkin — sinxronni voqeaga bog'lab bo'lmaydi.
 *
 * Qo'lda boshlangan sinxronga bu cheklov taalluqli emas.
 */

/** Asia/Tashkent — UTC+5, yozgi vaqtga o'tmaydi */
const TZ_OFFSET_MS = 5 * 3_600_000;
/** Tun shu soatda tugaydi (mahalliy vaqt); 00:00 da boshlanadi */
const NIGHT_END_HOUR = 9;
/** Tungi sinxronlar (mahalliy soat) */
const NIGHT_SLOT_HOURS = [3, 6];

/**
 * `from` paytidan keyingi avtomatik sinxron vaqti.
 * Oddiy holatda `from + interval`; u tunga to'g'ri kelsa — eng yaqin tungi
 * vaqtga yoki, ular o'tib bo'lgan bo'lsa, 09:00 ga suriladi.
 */
export function nextAutoSyncAt(from: Date, intervalMinutes: number): Date {
  const candidate = from.getTime() + Math.max(1, intervalMinutes) * 60_000;

  // Mahalliy "devor soati"ni UTC maydonlari orqali o'qiymiz
  const local = new Date(candidate + TZ_OFFSET_MS);
  if (local.getUTCHours() >= NIGHT_END_HOUR) return new Date(candidate);

  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_OFFSET_MS;
  for (const hour of [...NIGHT_SLOT_HOURS, NIGHT_END_HOUR]) {
    const slot = localMidnight + hour * 3_600_000;
    if (slot >= candidate) return new Date(slot);
  }
  return new Date(candidate);
}
