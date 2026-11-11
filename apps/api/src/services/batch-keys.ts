/**
 * Partiya jo'natmasining kalitlari — marshrut (routes/batches.ts) va partiya
 * foydasi (services/batch-profit.ts) bir xil qoida bilan topsin.
 */

/** Kargo nomi qanday yozilganidan qat'i nazar bitta kalit: "Tez-tez " va "TEZ-TEZ" — bitta kargo */
export const cargoKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toUpperCase();
/** Reys raqami: "50", " 50 " va "50" — bitta reys */
export const tripKeyOf = (trip: string): string => trip.trim().replace(/\s+/g, ' ').toUpperCase();
/**
 * Jo'natmaning saqlanadigan kaliti: kargo, reys bo'lsa unga qo'shilgan — "TEZ-TEZ#50".
 * Reyssiz jo'natma kaliti avvalgidek faqat kargo: oldin kiritilgan holatlar yo'qolmaydi.
 */
export const shipKeyOf = (cargoName: string, trip: string): string => {
  const t = tripKeyOf(trip);
  return t ? `${cargoKeyOf(cargoName)}#${t}` : cargoKeyOf(cargoName);
};
