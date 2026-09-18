/**
 * Uzum to'lov jadvali — bitta manba.
 *
 * Kabinetdagi "To'lovlar jadvalini sozlash" to'rtta variant beradi va har
 * birining o'z xizmat haqi bor: tez-tez to'lansa qimmatroq.
 *
 * Bu mantiq IKKI joyda kerak — Moliya sahifasidagi "Keyingi to'lov" va Pul
 * kalendari. Ilgari Moliya "keyingi payshanba" deb TAXMIN qilardi va
 * kalendardagi haqiqiy sana bilan zid tushardi.
 */
import { prisma } from '@savdoiq/db';
import { parseISODate, toISODate, type PayoutMode } from '@savdoiq/shared';

/** Sozlama kalitlari — kompaniya bo'yicha */
export const PAYOUT_KEYS = {
  mode: 'payout:mode',
  holdDays: 'payout:holdDays',
  earlyFee: 'payout:earlyFeePct',
} as const;

/** Oy ichidagi to'lov sanalari (`daily` — har ish kuni, sana bilan emas) */
export const SCHEDULE_DAYS: Record<PayoutMode, number[]> = {
  daily: [],
  weekly: [7, 14, 21, 28],
  biweekly: [7, 21],
  monthly: [7],
};

/** Jadval uchun xizmat haqi, % */
export const SCHEDULE_FEE: Record<PayoutMode, number> = {
  daily: 1.5,
  weekly: 1,
  biweekly: 0,
  monthly: 0,
};

export const DEFAULT_MODE: PayoutMode = 'biweekly';
/** Uzumning joriy sharti: tovar qabul qilingandan keyin 10 kun */
export const DEFAULT_HOLD_DAYS = 10;
/** Tezkor (erta) yechib olish xizmat haqi */
export const DEFAULT_EARLY_FEE_PCT = 2.5;

export function asPayoutMode(value: string | null | undefined): PayoutMode {
  const v = (value ?? '') as PayoutMode;
  return v in SCHEDULE_DAYS ? v : DEFAULT_MODE;
}

/**
 * Berilgan sanadan boshlab jadval bo'yicha eng yaqin to'lov kunini topadi.
 *
 * Pul ochilgan kuniyoq tushmaydi — jadvaldagi navbatdagi sanani kutadi.
 * Masalan 2 haftalik jadvalda (7 va 21) 27-sentyabrda ochilgan summa
 * 7-oktyabrda tushadi.
 */
export function nextPayoutDate(from: Date, mode: PayoutMode): Date {
  const d = new Date(from.getTime());

  if (mode === 'daily') {
    // Dam olish kunlarida to'lov yo'q — dushanbaga suriladi
    for (let i = 0; i < 7; i += 1) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) return d;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }

  const days = SCHEDULE_DAYS[mode];
  // Ko'pi bilan ikki oy oldinga qaraymiz — jadvalda albatta kun topiladi
  for (let i = 0; i < 70; i += 1) {
    if (days.includes(d.getUTCDate())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Kompaniyaning jadval sozlamalari */
export interface PayoutRules {
  mode: PayoutMode;
  holdDays: number;
  earlyFeePct: number;
  scheduleFeePct: number;
  payoutDays: number[];
}

export async function getPayoutRules(companyId: string): Promise<PayoutRules> {
  const rows = await prisma.companySetting.findMany({
    where: { companyId, key: { in: Object.values(PAYOUT_KEYS) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const num = (key: string, fallback: number): number => {
    const n = Number(map.get(key));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const mode = asPayoutMode(map.get(PAYOUT_KEYS.mode));
  return {
    mode,
    holdDays: num(PAYOUT_KEYS.holdDays, DEFAULT_HOLD_DAYS),
    earlyFeePct: num(PAYOUT_KEYS.earlyFee, DEFAULT_EARLY_FEE_PCT),
    scheduleFeePct: SCHEDULE_FEE[mode],
    payoutDays: SCHEDULE_DAYS[mode],
  };
}

/**
 * Bugundan keyingi eng yaqin to'lov sanasi (ISO).
 * Moliya sahifasidagi "Keyingi to'lov" shu yerdan oladi.
 */
export function nextPayoutFromToday(mode: PayoutMode, now = new Date()): string {
  const today = parseISODate(toISODate(now));
  const tomorrow = new Date(today.getTime());
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return toISODate(nextPayoutDate(tomorrow, mode));
}
