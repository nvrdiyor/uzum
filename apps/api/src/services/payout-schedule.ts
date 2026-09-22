/**
 * Uzum to'lov jadvali — bitta manba.
 *
 * Kabinetdagi "To'lovlar jadvalini sozlash" to'rtta variant beradi va har
 * birining o'z xizmat haqi bor: tez-tez to'lansa qimmatroq.
 *
 * NEGA QO'LDA SOZLANADI. Uzumning ochiq API'sida (seller-openapi) to'lov
 * jadvali uchun endpoint YO'Q — 29 ta yo'ldan birortasi ham uni bermaydi,
 * xarajatlar ro'yxatida ham pul o'tkazish hodisasi ko'rinmaydi. Ya'ni
 * jadvalni kalitdan o'qib bo'lmaydi va taxmin qilishning iloji ham yo'q.
 * Shuning uchun uni sotuvchi bir marta qayd etadi, biz esa tasdiqlangan
 * yoki tasdiqlanmaganini ochiq ko'rsatamiz.
 *
 * KELAJAKDAGI O'ZGARISH. Uzum jadvalni darhol almashtirmaydi: kabinetda
 * "08.10.2026 dan amal qiladi" deb turadi, eski jadval esa o'sha sanagacha
 * ishlaydi. Shuning uchun bu yerda BITTA rejim emas, sana bo'yicha
 * o'zgaradigan jadval saqlanadi — belgilangan kun kelganda o'zi almashadi
 * va hech kim hech narsa bosishi shart emas.
 *
 * Bu mantiq IKKI joyda kerak — Moliya sahifasidagi "Keyingi to'lov" va Pul
 * kalendari. Ilgari Moliya "keyingi payshanba" deb TAXMIN qilardi va
 * kalendardagi haqiqiy sana bilan zid tushardi.
 */
import { prisma } from '@savdoiq/db';
import {
  DEFAULT_EARLY_FEE_PCT,
  DEFAULT_HOLD_DAYS,
  DEFAULT_PAYOUT_MODE,
  PAYOUT_MODES,
  SCHEDULE_DAYS,
  SCHEDULE_FEE,
  parseISODate,
  toISODate,
  todayInBusinessTz,
  type PayoutMode,
} from '@savdoiq/shared';

/**
 * Bugungi kun — SAVDO MINTAQASI (Asia/Tashkent) bo'yicha.
 *
 * To'lov sanalari kalendar sanalari: jadval "08.10 dan amal qiladi"
 * deganda u Toshkentda 8-oktyabr kirgan zahoti boshlanishi kerak. UTC
 * kunidan foydalanilsa o'zgarish besh soat kechikardi va o'sha oynada
 * eski jadval, eski haq va eski to'lov sanasi ko'rinardi.
 */
export function businessToday(now: Date = new Date()): Date {
  return parseISODate(todayInBusinessTz(now));
}

/** Sozlama kalitlari — kompaniya bo'yicha */
export const PAYOUT_KEYS = {
  mode: 'payout:mode',
  holdDays: 'payout:holdDays',
  earlyFee: 'payout:earlyFeePct',
  /** Kelajakda kuchga kiradigan jadval */
  modeNext: 'payout:modeNext',
  /** U kuchga kiradigan sana (ISO) */
  modeNextFrom: 'payout:modeNextFrom',
  /** Sotuvchi jadvalni oxirgi marta tasdiqlagan payt (ISO) */
  confirmedAt: 'payout:confirmedAt',
} as const;

/**
 * Matnni jadval rejimiga aylantiradi. Noma'lum qiymat — standart rejim.
 *
 * DIQQAT: bu yerda `in` ISHLATILMAYDI. `SCHEDULE_DAYS` oddiy obyekt,
 * ya'ni `'constructor' in SCHEDULE_DAYS` ham rost bo'ladi. Bunday qiymat
 * keyinroq `SCHEDULE_DAYS[mode].includes(...)` da funksiyaga aylanib butun
 * sahifani yiqitardi. Ro'yxat bo'yicha tekshirish bunga yo'l qo'ymaydi.
 */
export function isPayoutMode(value: unknown): value is PayoutMode {
  return typeof value === 'string' && (PAYOUT_MODES as readonly string[]).includes(value);
}

export function asPayoutMode(value: string | null | undefined): PayoutMode {
  return isPayoutMode(value) ? value : DEFAULT_PAYOUT_MODE;
}

/**
 * Sana bo'yicha o'zgaradigan jadval.
 * `nextFrom` kelgunga qadar `mode`, undan keyin `nextMode` ishlaydi.
 */
export interface Schedule {
  mode: PayoutMode;
  nextMode: PayoutMode | null;
  nextFrom: Date | null;
}

export const fixedSchedule = (mode: PayoutMode): Schedule => ({ mode, nextMode: null, nextFrom: null });

/** Berilgan kunda qaysi jadval kuchda */
export function modeOn(date: Date, s: Schedule): PayoutMode {
  if (s.nextMode && s.nextFrom && date.getTime() >= s.nextFrom.getTime()) return s.nextMode;
  return s.mode;
}

/**
 * Berilgan sanadan boshlab jadval bo'yicha eng yaqin to'lov kunini topadi.
 *
 * Pul ochilgan kuniyoq tushmaydi — jadvaldagi navbatdagi sanani kutadi.
 * Masalan 2 haftalik jadvalda (7 va 21) 27-sentyabrda ochilgan summa
 * 7-oktyabrda tushadi.
 *
 * HAR BIR kun uchun jadval alohida tekshiriladi, chunki o'rtada rejim
 * almashishi mumkin: 7-oktyabr hali eski jadvalda (to'lanadi), 8-oktyabrda
 * ochilgan pul esa yangi jadval bo'yicha 14-oktyabrni kutadi.
 */
export function nextPayoutDate(from: Date, schedule: Schedule | PayoutMode): Date {
  const s = typeof schedule === 'string' ? fixedSchedule(schedule) : schedule;
  const d = new Date(from.getTime());

  // Oyiga bir marta + rejim almashishi — 100 kun bemalol yetadi
  for (let i = 0; i < 100; i += 1) {
    const mode = modeOn(d, s);
    if (mode === 'daily') {
      // Dam olish kunlarida to'lov yo'q — dushanbaga suriladi
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) return d;
    } else if (SCHEDULE_DAYS[mode].includes(d.getUTCDate())) {
      return d;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

/** Kompaniyaning jadval sozlamalari */
export interface PayoutRules {
  /** BUGUN kuchda turgan jadval */
  mode: PayoutMode;
  /** Kelajakdagi o'zgarish (hali kelmagan bo'lsa) */
  nextMode: PayoutMode | null;
  nextFrom: string | null;
  holdDays: number;
  earlyFeePct: number;
  scheduleFeePct: number;
  payoutDays: number[];
  /** Sotuvchi jadvalni tasdiqlaganmi yoki standart olinganmi */
  confirmed: boolean;
  /** Hisob-kitob uchun — sana bo'yicha o'zgaradigan shakl */
  schedule: Schedule;
}

/** Faqat `YYYY-MM-DD` — boshqa har qanday qiymat yo'qdek qabul qilinadi */
function asISODate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parseISODate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getPayoutRules(companyId: string, now = new Date()): Promise<PayoutRules> {
  const rows = await prisma.companySetting.findMany({
    where: { companyId, key: { in: Object.values(PAYOUT_KEYS) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const num = (key: string, fallback: number): number => {
    const n = Number(map.get(key));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const stored = asPayoutMode(map.get(PAYOUT_KEYS.mode));
  const nextFromDate = asISODate(map.get(PAYOUT_KEYS.modeNextFrom));
  const nextModeRaw = map.get(PAYOUT_KEYS.modeNext);
  const nextMode = nextFromDate && nextModeRaw ? asPayoutMode(nextModeRaw) : null;

  const schedule: Schedule = { mode: stored, nextMode, nextFrom: nextMode ? nextFromDate : null };

  /*
   * Belgilangan sana kelib bo'lgan bo'lsa, o'zgarish AVTOMATIK kuchga
   * kiradi: bugungi rejim shundan hisoblanadi va ekranda "kelajakdagi
   * o'zgarish" sifatida ko'rsatilmaydi. Bazaga hech narsa yozilmaydi —
   * yozuv o'qishda o'zgarmagani ma'qul, natija baribir bir xil.
   */
  const today = businessToday(now);
  const mode = modeOn(today, schedule);
  const pending = schedule.nextFrom && schedule.nextFrom.getTime() > today.getTime();

  return {
    mode,
    nextMode: pending ? schedule.nextMode : null,
    nextFrom: pending && schedule.nextFrom ? toISODate(schedule.nextFrom) : null,
    holdDays: num(PAYOUT_KEYS.holdDays, DEFAULT_HOLD_DAYS),
    earlyFeePct: num(PAYOUT_KEYS.earlyFee, DEFAULT_EARLY_FEE_PCT),
    scheduleFeePct: SCHEDULE_FEE[mode],
    payoutDays: SCHEDULE_DAYS[mode],
    confirmed: Boolean(map.get(PAYOUT_KEYS.confirmedAt)),
    schedule,
  };
}

/**
 * Eng yaqin to'lov sanasi (ISO) — BUGUN ham hisobga olinadi.
 *
 * Moliya sahifasidagi "Keyingi to'lov" shu yerdan oladi. Ilgari hisob
 * ertadan boshlanardi: to'lov kunining o'zida Moliya keyingi sanani,
 * Pul kalendari esa "bugun tushadi" deb ko'rsatib, bir-biriga zid
 * tushardi — aynan shu funksiya bartaraf etishi kerak bo'lgan holat.
 */
export function nextPayoutFromToday(schedule: Schedule | PayoutMode, now = new Date()): string {
  return toISODate(nextPayoutDate(businessToday(now), schedule));
}
