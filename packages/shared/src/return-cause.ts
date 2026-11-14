/**
 * Uzum bekor qilish / qaytarish sababi (`returnCause`, asl ruscha matn) —
 * pozitsiya natijasi shundan aniqlanadi (2026-11-14).
 *
 * `/v1/finance/orders` da bekor qilingan va qaytarilgan pozitsiya bir xil
 * keladi (`status: CANCELED`, `amount: 0`, `amountReturns: N`) — farqni faqat
 * sabab beradi (docs/UZUM-API.md 7.5):
 *  • "Отменён до получения" — xaridor tovarni olmasdan bekor qildi;
 *  • "Товара не оказалось в заказе" — BUYURTMADA TOVAR BO'LMAGAN: Uzum uni
 *    omborda topmadi yoki yetkazishda yo'qotdi. Bu xaridor qaytarishi ham,
 *    bekor qilishi ham emas — tovar sotuvchining omboriga QAYTMAYDI. FBO'da
 *    bu Uzum aybi (oferta 8.1): kompensatsiya qo'llanma 6.8 bo'yicha — narx −
 *    komissiya, lekin AVTOMATIK EMAS, da'vo bilan (yig'indi kamida 500 000
 *    so'm, 60 kungacha; «Yo'qotilganlar» bo'limi). FBS'da buyurtmani sotuvchi
 *    yig'adi — Uzum aybi deb bo'lmaydi. Egasining №141386381 buyurtmasi
 *    (2026-11-14): bot uni "Qaytarildi" deb yozgan edi. Jonli bazada 4 ta
 *    shunday pozitsiya: 3 tasi xaridorga topshirilmasdan bekor bo'lgan,
 *    bittasida topshirilgan sana bor (xaridor buyurtmani olgan, tovar ichida
 *    bo'lmagan);
 *  • qolgan sabablar ("Клиент не указал причину", "Брак", "BAD_QUALITY",
 *    "Не подошёл размер"…) — xaridor qaytarishi.
 *
 * Bitta qolip hamma joyda: API (import, qaytarishlar, voronka, tovar balansi,
 * bot) va sayt. Brauzerga ham tushadi — faqat toza funksiya.
 */

/** Xaridor tovarni olmasdan bekor qildi */
const CANCEL_BEFORE_RECEIPT_RE = /до\s+получени|before\s+recei|qabul\s+qilishdan\s+oldin/i;

/**
 * Buyurtmada tovar bo'lmagan — Uzum yo'qotgan. "Не оказалось" so'zi boshqa
 * sababda ham bo'lishi mumkin ("нужного размера не оказалось"), shuning uchun
 * "… в заказе" talab qilinadi.
 */
const MISSING_IN_ORDER_RE =
  /не\s+оказал\S*\s+в\s+заказ|missing\s+(?:from|in)\s+the\s+order|buyurtmada\s+tovar\s+bo\S*lma/i;

/**
 * canceled — xaridor olmasdan bekor qildi; returned — xaridor qaytardi
 * (yoki punktdan olmadi); missing — buyurtmada tovar bo'lmagan (Uzum yo'qotgan).
 */
export type ReturnCauseKind = 'canceled' | 'returned' | 'missing';

/** Sabab "buyurtmada tovar bo'lmagan" (Uzum yo'qotgan, kompensatsiya qiladi) */
export function isMissingInOrder(cause: string | null | undefined): boolean {
  return MISSING_IN_ORDER_RE.test((cause ?? '').trim());
}

/** Sabab "qabul qilishdan oldin bekor qilindi" */
export function isCanceledBeforeReceipt(cause: string | null | undefined): boolean {
  return CANCEL_BEFORE_RECEIPT_RE.test((cause ?? '').trim());
}

/**
 * Sababdan natija turi; sabab bo'lmasa null (chaqiruvchi o'z belgisiga —
 * holat yoki topshirilgan sanaga — qaraydi).
 */
export function returnCauseKind(cause: string | null | undefined): ReturnCauseKind | null {
  const text = (cause ?? '').trim();
  if (!text) return null;
  if (MISSING_IN_ORDER_RE.test(text)) return 'missing';
  if (CANCEL_BEFORE_RECEIPT_RE.test(text)) return 'canceled';
  return 'returned';
}
