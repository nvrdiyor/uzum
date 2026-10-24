import { useCallback } from 'react';
import { registerNamespace, useT } from '@/i18n';

/*
 * Qaytarish sababi tarjimasi — "Qaytarishlar" sahifasi va Boshqaruv
 * panelidagi "Qaytarish va bekor qilish" kartasi BIR XIL qoidadan
 * foydalanadi. Ilgari qoidalar sahifa ichida edi: karta ularni ko'rmay,
 * ruscha xom matnni chiqargan bo'lardi (2026-10-24).
 *
 * Tarjimalar alohida nomlar fazosida: sahifa kechiktirib yuklanadi, uning
 * 'returns' tarjimalari esa panel ochilganda hali ro'yxatda bo'lmaydi.
 */
registerNamespace('returnReasons', {
  uz: {
    'reason.unknown': 'Sabab ko‘rsatilmagan',
    'reason.cancelBeforeReceipt': 'Qabul qilishdan oldin bekor qilindi',
    'reason.sizeMismatch': 'O‘lchami to‘g‘ri kelmadi',
    'reason.noReason': 'Xaridor sabab ko‘rsatmadi',
    'reason.missingItem': 'Buyurtmada tovar bo‘lmagan',
  },
  ru: {
    'reason.unknown': 'Причина не указана',
    'reason.cancelBeforeReceipt': 'Отменён до получения',
    'reason.sizeMismatch': 'Не подошёл размер',
    'reason.noReason': 'Клиент не указал причину',
    'reason.missingItem': 'Товара не оказалось в заказе',
  },
  en: {
    'reason.unknown': 'Reason not provided',
    'reason.cancelBeforeReceipt': 'Cancelled before receipt',
    'reason.sizeMismatch': 'Size didn’t fit',
    'reason.noReason': 'Buyer gave no reason',
    'reason.missingItem': 'Item missing from the order',
  },
});

export type ReturnReasonKey = 'cancelBeforeReceipt' | 'sizeMismatch' | 'noReason' | 'missingItem';

/**
 * Uzum sababni asl (ruscha) matnda yuboradi. Ko'p uchraydiganlari tarjima
 * qilinadi, qolgani o'zgarishsiz ko'rsatiladi. `noReason` naqshi serverdagi
 * "eng ko'p sabab" tanlovida ham bor (apps/api services/returns.ts
 * NO_REASON_TEXT) — o'zgarsa ikkalasi birga o'zgartiriladi.
 */
const REASON_RULES: ReadonlyArray<readonly [RegExp, ReturnReasonKey]> = [
  [/до\s+получени/i, 'cancelBeforeReceipt'],
  [/размер/i, 'sizeMismatch'],
  [/не\s+указал\s+причин/i, 'noReason'],
  [/не\s+оказалось/i, 'missingItem'],
];

/** Server sababsiz yozuvlarni shu matn bilan guruhlaydi (routes/warehouse.ts NO_REASON) */
const SERVER_NO_REASON = 'Sabab ko‘rsatilmagan';

/** Asl matn → tanish sabab kaliti; bo'sh yoki sababsiz — 'unknown'; tanish emas — null */
export function returnReasonKey(raw: string | null | undefined): ReturnReasonKey | 'unknown' | null {
  const value = raw?.trim();
  if (!value || value === SERVER_NO_REASON) return 'unknown';
  return REASON_RULES.find(([re]) => re.test(value))?.[1] ?? null;
}

/** Sabab joriy tilda: tanishi tarjima qilinadi, notanishi asl matnicha qoladi */
export function useReturnReasonLabel(): (raw: string | null | undefined) => string {
  const t = useT('returnReasons');
  return useCallback(
    (raw: string | null | undefined) => {
      const key = returnReasonKey(raw);
      return key ? t(`reason.${key}`) : (raw ?? '').trim();
    },
    [t],
  );
}
