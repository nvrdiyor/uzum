/**
 * Qarzlar va kreditlar (2026-11-07): odamdan qarz, bank krediti, kredit karta yoki
 * limit, nasiya. Sotuvchi qarzni bir marta yozadi, keyin faqat "To'ladim" va
 * "Ishlatdim" bilan yuritadi.
 *
 * QOLDIQ SAQLANMAYDI. Har safar qarz shartlari va daftar yozuvlaridan qayta
 * hisoblanadi (`analyzeDebt`) — tarix bilan qoldiq hech qachon farq qilmaydi. Shu
 * toza funksiya serverda ham, shakldagi oldindan ko'rishda ham ishlaydi, shuning
 * uchun raqamlar hamma joyda bir xil. `today` tashqaridan beriladi (Date.now emas).
 *
 * Foiz (Markaziy bank nizomi, ro'yxat raqami 3460, 2023):
 *  • act365 — bank va karta: qoldiq × yillik foiz × kunlar ÷ 365. Pul olingan kun
 *    hisobga kiradi, to'lov kuni kirmaydi;
 *  • m30 — odamdan qarz va nasiya: har to'liq oy uchun yillik ÷ 12 (30E/360, oy
 *    oxiri 30-kun deb olinadi — 31.01 → 28.02 ham to'liq bir oy).
 * Annuitet oylik to'lovi doim i = yillik ÷ 12 bilan: A = S·i / (1 − (1+i)^−n). Har
 * oyning foizi esa haqiqiy kunlar bilan; oxirgi to'lov qoldiqni yopadi.
 *
 * To'lov avval yig'ilgan foizni, keyin asosiy qarzni yopadi (Fuqarolik kodeksi
 * 248-modda). Qaysi oylik to'lovni yopgani — eng eski to'lanmaganidan boshlab, faqat
 * davri boshlangan to'lovlar: ortiqchasi qarzni kamaytiradi (muddat qisqaradi),
 * lekin keyingi oyni "to'langan" qilmaydi — bank keyingi oy ham to'lov kutadi.
 *
 * Hisoblangan raqamlar "taxminiy": banklar 365/366 kun, bayram kunlari va
 * yaxlitlashda farq qiladi. Sotuvchi bank ilovasidagi raqamni "Qoldiqni
 * tenglashtirish" yoki to'lovdagi "shundan foiz" bilan kiritib, hisobni tuzatadi.
 */
import { round } from './calc.js';
import { formatMoney, formatNumber, parseISODate, toISODate } from './format.js';
import type { Lang } from './types.js';

// ─────────────────────────── Turlar va chegaralar ───────────────────────────

/** person — odamdan qarz · bank — bank krediti · card — kredit karta/limit · installment — nasiya, bo'lib to'lash */
export const DEBT_KINDS = ['person', 'bank', 'card', 'installment'] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];

/** lump — bir yo'la · equal — har oy teng (annuitet) · decreasing — kamayib boruvchi · interest — har oy foiz + qarzning minPct% */
export const DEBT_REPAYMENTS = ['lump', 'equal', 'decreasing', 'interest'] as const;
export type DebtRepayment = (typeof DEBT_REPAYMENTS)[number];

/** act365 — kunlik, yil 365 kun (bank, karta) · m30 — oylik, yillik ÷ 12 (odamdan qarz, nasiya) */
export const DEBT_DAY_COUNTS = ['act365', 'm30'] as const;
export type DebtDayCount = (typeof DEBT_DAY_COUNTS)[number];

/** principal — foiz + qarzning N% · total — qarz va foizning N% (Hamkorbank kabi) */
export const DEBT_MIN_BASES = ['principal', 'total'] as const;
export type DebtMinBase = (typeof DEBT_MIN_BASES)[number];

/** draw — yana olindi (kartada: kartadan ishlatildi) · use — olingan puldan ishlatildi · pay — to'landi · adjust — qoldiq bank ilovasidagiga tenglashtirildi */
export const DEBT_ENTRY_KINDS = ['draw', 'use', 'pay', 'adjust'] as const;
export type DebtEntryKind = (typeof DEBT_ENTRY_KINDS)[number];

/** "Nimaga ishlatildi" */
export const DEBT_CATEGORIES = ['goods', 'cargo', 'ads', 'salary', 'rent', 'debt', 'personal', 'other'] as const;
export type DebtCategory = (typeof DEBT_CATEGORIES)[number];

export const DEBT_CURRENCIES = ['UZS', 'USD'] as const;
export type DebtCurrency = (typeof DEBT_CURRENCIES)[number];

export const DEBT_LIMITS = {
  /** Bitta kompaniyada faol (arxivlanmagan) qarzlar soni */
  maxDebts: 100,
  /** Arxivdagilari bilan jami — ro'yxat shu bilan chegaralangan */
  maxDebtsTotal: 300,
  /** Bitta qarzdagi yozuvlar soni */
  maxEntries: 1000,
  /** 100 mlrd — ortiqcha yozilgan nollarni ushlaydi */
  amountMax: 100_000_000_000,
  /** Yillik foiz, % ("oyiga 10%" = 120%) */
  rateMax: 200,
  termMax: 360,
  graceMax: 60,
  lenderMax: 80,
  titleMax: 80,
  noteMax: 300,
  /** Shuncha kun ichidagi to'lov — "yaqin" */
  soonDays: 5,
  /** "30 kunda to'lash kerak" */
  horizonDays: 30,
  /** Sahifadagi "Kelgusi to'lovlar" qatorlari */
  scheduleRows: 12,
  /** Karta minimal to'lovining standart foizi */
  cardMinPct: 10,
  /** Jadval shundan uzoqqa hisoblanmaydi — "faqat foiz" qarz cheksiz aylanmasin */
  projectionMonths: 600,
} as const;

/** Qarz turi bo'yicha standart shartlar — shakl sotuvchidan atama so'ramaydi */
export const DEBT_KIND_DEFAULTS: Record<
  DebtKind,
  { repayment: DebtRepayment; dayCount: DebtDayCount; minPct: number; minBase: DebtMinBase }
> = {
  person: { repayment: 'lump', dayCount: 'm30', minPct: 0, minBase: 'principal' },
  bank: { repayment: 'equal', dayCount: 'act365', minPct: 0, minBase: 'principal' },
  card: { repayment: 'interest', dayCount: 'act365', minPct: DEBT_LIMITS.cardMinPct, minBase: 'principal' },
  installment: { repayment: 'equal', dayCount: 'm30', minPct: 0, minBase: 'principal' },
};

// ─────────────────────────── Tayyor kartalar ───────────────────────────

/**
 * Tayyor kredit kartalar — bank shartlari bo'yicha alohida hisob (hisobot kuni + foizsiz davr).
 * Boshqa kartalar umumiy hisobda qoladi (to'lov kuni + minimal, foizsiz davrsiz).
 */
export const DEBT_CARD_PRODUCTS = ['tbc-osmon', 'infin-black'] as const;
export type DebtCardProduct = (typeof DEBT_CARD_PRODUCTS)[number];

/**
 * Kartadan ishlatish turi: xarid (do'kon, onlayn, QR — foizsiz davr bor) · kartaga o'tkazma · naqd pul ·
 * boshqa to'lov (soliq, rekvizit bo'yicha, kredit to'lovi, hamyon, valyuta — bank naqd deb hisoblaydi).
 * Xariddan boshqasiga foizsiz davr yo'q: foiz shu kundan (naqd stavkasi) + komissiya
 */
export const DEBT_CHANNELS = ['purchase', 'transfer', 'cash', 'other'] as const;
export type DebtChannel = (typeof DEBT_CHANNELS)[number];

export interface CardFeeRule {
  /** Summaning %i */
  pct: number;
  /** Kamida (so'm) */
  min?: number;
  /** Shu sanadan boshlab boshqa foiz (bank e'lon qilgan o'zgarish) */
  changes?: ReadonlyArray<{ from: string; pct: number }>;
}

export interface CardProductRules {
  bank: string;
  name: string;
  network: string;
  currency: DebtCurrency;
  /** individual — mijozning hisobot kuni (ilovadagi to'lov sanasidan); monthStart — har oy 1-sana */
  statement: 'individual' | 'monthStart';
  /** monthStart: hisobot kuni */
  statementDay?: number;
  /** To'lov kuni = hisobot kuni + shuncha kalendar kun */
  dueDays: number;
  /** To'lov kuni shanba/yakshanbaga tushsa — oldingi ish kuni (Infin oferta 2.8); bayramlar — faqat eslatma */
  weekendBack: boolean;
  /** Xaridlar uchun eng uzun foizsiz davr (kun) — ma'lumot uchun */
  graceMaxDays: number;
  /** Yillik foiz oralig'i (mijozga skoring bo'yicha) */
  rateRange: readonly [number, number];
  /** Naqd va o'tkazma foizi alohida bo'lishi mumkin (TBC: pos_rate va cash_rate) */
  separateCashRate: boolean;
  /** Minimal to'lov: asosiy qarzning N% + hisoblangan foiz */
  minPctDefault: number;
  minPctMax: number;
  /** Mijoz o'zgartira oladimi (TBC — shartnomada har kimniki, Infin — hammaga 5%) */
  minPctEditable: boolean;
  /** Asosiy qarzni yopish tartibi: purchaseFirst — avval xaridlar (TBC 5.11), cashFirst — avval foizsiz davrsiz qarz (Infin 3.8) */
  payOrder: 'purchaseFirst' | 'cashFirst';
  /** Oldingi minimal to'lov kechikkan bo'lsa keyingi davrda foiz kechirilmaydi (TBC 5.7.3) */
  noGraceAfterOverdue: boolean;
  /** TBC 5.6: hisobot qarzi to'lov kunigacha to'liq to'lansa, hisobotdan keyingi xarid foizi ham kechiriladi */
  waiveAfterStatement: boolean;
  /** Komissiya (taklif; sotuvchi o'zgartira oladi) */
  fees: { transfer: CardFeeRule; cash: CardFeeRule; other: CardFeeRule };
  /**
   * Kechikish jarimasi (taxminiy): TBC — 1-kun 10%, keyin har kuni 0,4% faqat kechikkan asosiy qarzdan,
   * tarif bo'yicha hisobot sanasidan (backdate); Infin — har kuni 0,25% kechikkan summadan (asosiy + foiz)
   */
  penalty: { firstDayPct: number; dailyPct: number; base: 'principal' | 'amount'; fromStatement: boolean };
  /** Kechikish shuncha kundan oshsa karta muddati tugaguncha bloklanadi (Infin oferta 3.5 — 90); null — qoida yo'q */
  blockAfterOverdueDays: number | null;
  limit: readonly [number, number];
  /** Shartlar shu sanadagi bank hujjatlaridan */
  asOf: string;
  sources: readonly string[];
}

/**
 * Bank hujjatlaridan (tadqiqot 2026-11-07; har qator rasmiy tarif/oferta bandi bilan tekshirilgan).
 * Bank shartlarni bir tomonlama o'zgartira oladi (TBC — 10 kun, Infin — 30 kun oldin xabar bilan).
 */
export const CARD_PRODUCTS: Record<DebtCardProduct, CardProductRules> = {
  'tbc-osmon': {
    bank: 'TBC Bank',
    name: 'Osmon',
    network: 'Mastercard / Humo',
    currency: 'UZS',
    // Hisobot kuni har mijozda o'z kuni (shartnoma 3.6); to'lov — hisobot kunidan keyin 24-kun (3.7)
    statement: 'individual',
    dueDays: 24,
    weekendBack: false,
    graceMaxDays: 55,
    // Tarif 14.09.2026: xaridlar (foizsiz davrdan tashqari) va naqd — 29–50%, har kimga alohida
    rateRange: [29, 50],
    separateCashRate: true,
    // "Asosiy qarzning ko'pi bilan 8% + hisoblangan foizlar" — aniq foiz shartnomada
    minPctDefault: 8,
    minPctMax: 8,
    minPctEditable: true,
    payOrder: 'purchaseFirst',
    noGraceAfterOverdue: true,
    waiveAfterStatement: true,
    // O'tkazma 3,9% (P2P tariflar 05.10.2026); naqd 3%, kamida 90 000 (+ bankomat egasi);
    // boshqa (soliq, rekvizit, kredit...) — Mastercard'da kvazi-naqd 3%, Humo'da 0
    fees: { transfer: { pct: 3.9 }, cash: { pct: 3, min: 90_000 }, other: { pct: 3 } },
    // Kechiksa: 1-kun 10%, keyin kuniga 0,4% kechikkan asosiy qarzdan, hisobot sanasidan (tarif 03.07.2026 dan)
    penalty: { firstDayPct: 10, dailyPct: 0.4, base: 'principal', fromStatement: true },
    blockAfterOverdueDays: null,
    limit: [300_000, 50_000_000],
    asOf: '2026-11-07',
    sources: [
      'https://tbcbank.uz/ru/product/credit-card/',
      'https://minio.tbcbank.uz/prod-tbcbankuz-new/uploads/tbc_credit_card_tariff_mastercard_ru_33e56c0b9c.pdf',
      'https://minio.tbcbank.uz/prod-tbcbankuz-new/uploads/Shablon_dogovora_kreditnoj_karty_2_66cb553424.pdf',
    ],
  },
  'infin-black': {
    bank: 'InfinBANK',
    name: 'Black',
    network: 'Visa',
    currency: 'UZS',
    // Hisobot — har oy 1-sanada (kalendar oyi), to'lov — 20-sanagacha (oferta 2.8)
    statement: 'monthStart',
    statementDay: 1,
    dueDays: 19,
    weekendBack: true,
    graceMaxDays: 50,
    // Oferta 2.6: 25,55–54,75%, qat'iy, barcha operatsiyalarga bir xil
    rateRange: [25.55, 54.75],
    separateCashRate: false,
    // Asosiy qarzning 5% + haqiqiy davr uchun foiz (info varaq 9)
    minPctDefault: 5,
    minPctMax: 5,
    minPctEditable: false,
    payOrder: 'cashFirst',
    noGraceAfterOverdue: false,
    waiveAfterStatement: false,
    // Kartadan kartaga 1% (22.11.2026 dan 2%); naqd O'zbekiston bankomatlarida 0,5%, kamida 5 000 (+ bankomat);
    // boshqa — rekvizit bo'yicha 1% (o'z hisobiga, hamyonga, valyuta — 0)
    fees: {
      transfer: { pct: 1, changes: [{ from: '2026-11-22', pct: 2 }] },
      cash: { pct: 0.5, min: 5_000 },
      other: { pct: 1 },
    },
    // Kuniga 0,25% kechikkan summadan (asosiy + foiz, jarimasiz; oferta 3.3)
    penalty: { firstDayPct: 0, dailyPct: 0.25, base: 'amount', fromStatement: false },
    // Oferta 3.5: minimal to'lov 90 kun va undan ko'p kechiksa — karta muddati tugaguncha bloklanadi (faqat to'ldirish)
    blockAfterOverdueDays: 90,
    limit: [500_000, 100_000_000],
    asOf: '2026-11-07',
    sources: [
      'https://www.infinbank.com/ru/private/credits/overdraft/',
      'https://www.infinbank.com/upload/contracts/infinblack_offert_ru_new.docx',
    ],
  },
};

export const isCardProduct = (v: unknown): v is DebtCardProduct =>
  typeof v === 'string' && (DEBT_CARD_PRODUCTS as readonly string[]).includes(v);

/** Kartadan o'tkazma yoki naqd pul komissiyasi (so'm, butun) — tayyor kartaning tarifi bo'yicha */
export function cardFee(product: DebtCardProduct, channel: DebtChannel, amount: number, date: string): number {
  if (channel === 'purchase' || !(amount > 0)) return 0;
  const rule = CARD_PRODUCTS[product].fees[channel];
  let pct = rule.pct;
  for (const c of rule.changes ?? []) if (date >= c.from) pct = c.pct;
  return Math.round(Math.max((amount * pct) / 100, rule.min ?? 0));
}

/**
 * Kartada kichik qoldiq to'liq yopiladi deb olinadi — "faqat minimal to'lasangiz
 * qachon tugaydi" jadvali cheksiz kamayib bormasin (taxmin; banklarda shunga yaqin).
 */
const MIN_FLOOR: Record<DebtCurrency, number> = { UZS: 100_000, USD: 10 };

/** Hisob uchun qarz shartlari (Debt jadvalidagi maydonlar). Sanalar — YYYY-MM-DD */
export interface DebtTerms {
  kind: DebtKind;
  currency: DebtCurrency;
  /** Olingan summa; kartada — limit */
  amount: number;
  /** Yillik foiz, % (28 = 28%; "oyiga 3%" = 36); 0 — foizsiz */
  annualRate: number;
  dayCount: DebtDayCount;
  repayment: DebtRepayment;
  /** equal/decreasing: to'lovlar soni (avvaldan bor qarzda — qolganlari) */
  termMonths: number | null;
  /** Imtiyozli davr: dastlabki N to'lov faqat foiz */
  graceMonths: number;
  startedOn: string;
  /** Birinchi (avvaldan bor qarzda — keyingi) to'lov kuni; keyingilari har oy shu kunda, qisqa oyda — oy oxiri */
  firstDueOn: string | null;
  /**
   * Har oy to'lov kuni (1–31). Berilmasa — firstDueOn ning kuni. Kerak, chunki 31-kun qisqa
   * oyda kesiladi (30.11) va birinchi sana bo'yicha keyingilari ham 30-ga tushib qolardi.
   */
  payDay?: number | null;
  /** lump — qaytarish sanasi (null — muddatsiz); interest — limit/qarz tugash sanasi */
  dueOn: string | null;
  /** interest: qarzning necha %i */
  minPct: number;
  minBase: DebtMinBase;
  /** Shartnoma yoki bank ilovasidagi oylik to'lov; null — formula */
  monthlyPayment: number | null;
  /** Avvaldan bor qarz va karta: kuzatuv boshidagi asosiy qarz (bank ilovasidan); null — yangi qarz */
  openingBalance: number | null;
  /** Kuzatuv boshlangan savdo kuni: undan oldingi oylik to'lovlar kechikkan deb chiqmaydi */
  trackedFrom: string;
  archivedAt?: string | null;
  /** Tayyor karta (CARD_PRODUCTS) — hisobot kuni va foizsiz davr bilan alohida hisob; null — umumiy karta */
  cardProduct?: DebtCardProduct | null;
  /** Tayyor karta: har oy hisobot kuni 1–31 (qisqa oyda — oy oxiri) */
  statementDay?: number | null;
  /** Tayyor karta: naqd va o'tkazma yillik foizi; null — annualRate */
  cashRate?: number | null;
  /** Tayyor karta: kuzatuv boshida oxirgi hisobot bo'yicha to'lov kunigacha to'lanishi kerak qolgani (null — butun qarz) */
  openingBilled?: number | null;
  /** Tayyor karta: kuzatuv boshida ochiq hisobotning to'lanmagan minimal to'lovi (bank ilovasidan) */
  openingMin?: number | null;
  /** Tayyor karta: qarz oyma-oy to'liq yopilmaydi — boshlang'ich qarz foizli (foizsiz davrsiz) */
  openingRevolving?: boolean | null;
  /** Tayyor karta: kuzatuv boshida muddati o'tgan summa */
  openingOverdue?: number | null;
}

/** Daftar yozuvi — summa qarz valyutasida */
export interface DebtLedgerEntry {
  id?: string;
  kind: DebtEntryKind;
  date: string;
  amount: number;
  category?: string;
  note?: string;
  /** pay: shundan foiz (bank SMS'idan); null — hisoblanadi */
  interest?: number | null;
  /** Bir kundagi yozuvlar tartibi uchun */
  createdAt?: string;
  /** Tayyor karta, draw: xarid (null ham) · o'tkazma · naqd */
  channel?: DebtChannel | null;
  /** Tayyor karta, draw: bank komissiyasi — qarzga qo'shiladi */
  fee?: number | null;
}

export type DebtDueStatus = 'overdue' | 'today' | 'soon' | 'upcoming';

export interface DebtDue {
  /** To'lov raqami: 1 — birinchi (avvaldan bor qarzda — keyingi) to'lov */
  k: number;
  date: string;
  /** To'lov summasi (davr boshida aniqlanadi) */
  amount: number;
  /** shundan foiz va asosiy qarz */
  interest: number;
  principal: number;
  /** Shu to'lovga tushgan pul */
  paid: number;
  /** To'lanishi kerak qolgan qism */
  remaining: number;
  /** Bugundan necha kun (manfiy — kechikkan) */
  daysLeft: number;
  status: DebtDueStatus;
  /** Qarzni yopadigan oxirgi to'lov */
  final: boolean;
  /** "Qanday hisoblandi?": foiz qaysi qoldiqdan, necha kunga */
  explain: { base: number; days: number; dayCount: DebtDayCount; annualRate: number };
  /** Tayyor karta: hisobot va foizsiz davr */
  card?: DebtCardDue;
}

/** Tayyor kartaning to'lovi: hisobot, foizsiz qolish summasi va xavf */
export interface DebtCardDue {
  /** Hisobot (vypiska) sanasi */
  statementDate: string;
  /** Hisobotdagi butun qarz — to'lov kunigacha to'liq to'lansa xaridlar foizsiz */
  statementBalance: number;
  /** Foizsiz qolish uchun yana to'lash kerak (0 — bajarildi) */
  graceLeft: number;
  /**
   * To'liq to'lanmasa to'lov kunining yakunida qo'shiladigan foiz (bundan keyin to'lov bo'lmasa);
   * to'liq to'langan ko'chirmada 0, TBC 5.7.3 da — baribir qo'shiladi
   */
  graceRisk: number;
  /** Hisobot hali chiqmagan — minimal to'lov hozirgi qarzdan taxminan */
  estimate: boolean;
}

export interface DebtScheduleRow {
  date: string;
  payment: number;
  interest: number;
  principal: number;
  /**
   * To'lovdan keyingi asosiy qarz. TBC: muzlatilgan pul foizni yopsa (foizsiz davr yo'qolganda) — shu qatorning
   * foiz qismi o'shancha ko'p, asosiy qismi kam: qatorlar ketma-ket qo'shiladi (oldingi qoldiq − asosiy = qoldiq)
   */
  balance: number;
  status: 'overdue' | 'due' | 'future';
  /**
   * Faqat tayyor kartada: 'charge' — to'lov emas, qarzga foiz qo'shilgan qator (payment 0, interest > 0,
   * principal = −interest, balance oshadi). TBC: foizsiz davr yo'qolganda bugungacha yozilgan to'lovlarning
   * muzlatilgan puli xarid foizini yopadi — bugungi qoldiqdan qaraganda asosiy qarz shuncha oshadi (D+1 sanasi).
   * Yo'q bo'lsa — oddiy to'lov qatori
   */
  kind?: 'charge';
}

export interface DebtEntryResult {
  /** To'lov: shundan foiz va asosiy qarz; boshqa yozuvlarda null */
  split: { interest: number; principal: number } | null;
  /** Yozuvdan keyingi asosiy qarz */
  balanceAfter: number;
  /** Kuzatuvdan oldingi yozuv (eski kreditda) — qoldiqqa ta'sir qilmaydi, faqat jamiga kiradi */
  historical: boolean;
}

export interface DebtCalc {
  /** "Qoldi" — asosiy qarz */
  principal: number;
  /** Bugungacha yig'ilgan, hali to'lanmagan foiz */
  accruedInterest: number;
  /** "Bugun to'liq yopish ≈" */
  payoff: number;
  /** "Oylik foiz" — qoldiq × yillik ÷ 12 */
  monthlyInterest: number;
  /** Olingan pul (yangi qarz: summa + yana olinganlar; karta: kartadan ishlatilganlar) */
  received: number;
  /** "Ishlatildi" */
  used: number;
  /** "Ishlatilmagan" — kartada, nasiyada va ishlatish yozilmagan eski kreditda null */
  unused: number | null;
  /** Kartada bo'sh limit */
  freeLimit: number | null;
  /** Jami to'langan va shundan foiz */
  paid: number;
  interestPaid: number;
  /** Qarzdan ortiq to'langan */
  overpaid: number;
  /** Oylik to'lov (annuitet — shartnomadagi yoki hisoblangan; karta — minimal) */
  monthlyPayment: { amount: number; source: 'contract' | 'calculated' } | null;
  /** Navbatdagi to'lov (kechikkani bo'lsa — o'sha) */
  next: DebtDue | null;
  /** Joriy oy to'lovi to'liq to'langan bo'lsa — o'sha */
  paidDue: DebtDue | null;
  overdue: { count: number; amount: number; days: number } | null;
  /** Jadval bo'yicha qachon tugaydi va yana qancha foiz ketadi; tugamaydigan qarzda null */
  payoffDate: string | null;
  interestLeft: number | null;
  /** To'langan qismi, % (kartada — limitdan band qismi) */
  progressPct: number;
  /** Oylik to'lov davr foizidan kam — qarz kamaymaydi */
  belowInterest: boolean;
  state: 'active' | 'paid' | 'archived';
  /** Tayyor karta: foizsiz davr xavfi, kechikish jarimasi (taxminiy), qarz tarkibi */
  card?: {
    /** Hal bo'lmagan xaridlar foizi, bugungacha yig'ilgani — to'liq to'lansa kechiriladi (xavf: grace.risk) */
    graceRisk: number;
    /** Hisoblangan kechikish jarimasi (taxminiy; to'lanmagan foiz ichida) */
    penalty: number;
    /** Naqd va o'tkazmalardan qarz (foiz darhol) */
    cashDebt: number;
    /** Xaridlardan qarz */
    purchaseDebt: number;
    /**
     * Ochiq hisobot: `left` ni `due` gacha to'lasangiz xaridlar foizsiz qoladi; `risk` — to'liq to'lanmasa
     * to'lov kunining yakunida qo'shiladigan foiz (to'liq to'langanda 0). state 'lost' — TBC 5.7.3 (avvalgi
     * kechikish) sababli baribir kechirilmaydi. state 'none' — bu ko'chirmada foizsiz bo'ladigan narsa yo'q
     * (Infin: xarid yo'q — faqat naqd/o'tkazma yoki eski foizli qarz; TBC: xarid ham, 5.6 bo'yicha kechiriladigan
     * foizli xarid qarzi ham yo'q); unda left 0, risk 0 — "bajarildi" degani EMAS
     */
    grace: { statementDate: string; due: string; balance: number; left: number; risk: number; state: 'open' | 'lost' | 'none' } | null;
    /** Keyingi hisobot va uning to'lov kuni */
    nextStatement: { date: string; due: string };
    /** Faqat minimal to'lansa xaridlarga qo'shiladigan oylik foiz (foizsiz davr yo'qolsa) */
    graceMonthly: number;
    /** Kechikish sababli bank limitni bloklagan (bo'sh limit 0) */
    blocked: boolean;
    /**
     * TBC 5.7.3: shu sanadagi ko'chirmadan boshlab foiz yana kechiriladi (undan oldingilari to'liq to'lansa ham
     * kechirilmaydi) — hozirgi kechikish bugun yopilsa deb. null — cheklov yo'q (yoki Infin)
     */
    waiverFrom: string | null;
    /** Infin oferta 3.5: kechikish 90 kundan oshgan — karta muddati tugaguncha bloklangan (faqat to'ldirish) */
    blockedForGood: boolean;
  };
}

export interface DebtAnalysis {
  calc: DebtCalc;
  /** Kelgusi to'lovlar (kechikkanlari bilan), qarz yopilguncha yoki chegaragacha */
  schedule: DebtScheduleRow[];
  /** Har yozuv uchun — kiritilgan tartibda */
  entries: DebtEntryResult[];
  /** 30 kun ichida to'lanadigan (kechikkani bilan) */
  soon: { amount: number; count: number };
}

// ─────────────────────────── Sanalar va foiz ───────────────────────────

const DAY_MS = 86_400_000;

/** b − a kunlarda, ishorasi bilan (format.ts daysBetween 0 dan pastga tushmaydi) */
export const dayDiff = (a: string, b: string): number =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);

const lastDayOfMonth = (y: number, m0: number): number => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/**
 * Oy qo'shish, kun saqlanadi: 31.01 + 1 → 28.02, 31.01 + 2 → 31.03 (doim asl kundan hisoblanadi).
 * `day` berilsa — kun shu (to'lov kuni 31, birinchi to'lov 30.11 bo'lsa ham keyingilari 31-da).
 */
export function addMonthsAnchored(iso: string, months: number, day?: number | null): string {
  const d = parseISODate(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const y = target.getUTCFullYear();
  const m0 = target.getUTCMonth();
  const want = day != null && day >= 1 && day <= 31 ? day : d.getUTCDate();
  return toISODate(new Date(Date.UTC(y, m0, Math.min(want, lastDayOfMonth(y, m0)))));
}

const maxIso = (a: string, b: string): string => (a > b ? a : b);

/** 30E/360 oylari; oy oxiri 30-kun deb olinadi */
function months30(a: string, b: string): number {
  const x = parseISODate(a);
  const y = parseISODate(b);
  const day = (d: Date) => {
    const n = d.getUTCDate();
    return n === lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth()) ? 30 : Math.min(n, 30);
  };
  return (
    ((y.getUTCFullYear() - x.getUTCFullYear()) * 360 + (y.getUTCMonth() - x.getUTCMonth()) * 30 + day(y) - day(x)) / 30
  );
}

/** [from, to) oralig'idagi foiz; from — hisobga kiradi, to — kirmaydi */
export function interestFor(
  principal: number,
  annualRate: number,
  from: string,
  to: string,
  dayCount: DebtDayCount,
): number {
  if (!(principal > 0) || !(annualRate > 0) || !(to > from)) return 0;
  const r = annualRate / 100;
  if (dayCount === 'm30') return principal * (r / 12) * Math.max(0, months30(from, to));
  return (principal * r * dayDiff(from, to)) / 365;
}

/** Annuitet: A = S·i / (1 − (1+i)^−n), i = yillik ÷ 12; foizsiz — S ÷ n */
export function annuityPayment(principal: number, annualRate: number, months: number): number {
  if (!(principal > 0) || !(months >= 1)) return 0;
  const i = annualRate / 100 / 12;
  if (!(i > 0)) return principal / months;
  return (principal * i) / (1 - Math.pow(1 + i, -months));
}

/** Pul — qarz valyutasida: so'm butun, dollar sentgacha */
export const debtMoney = (v: number, currency: DebtCurrency): number =>
  currency === 'USD' ? round(v, 2) : Math.round(v);

const epsOf = (currency: DebtCurrency): number => (currency === 'USD' ? 0.005 : 0.5);

// ─────────────────────────── To'lov jadvali ───────────────────────────

interface Cycle {
  k: number;
  /** Davr boshi: oldingi to'lov kuni (birinchisida — foiz boshlangan kun) */
  start: string;
  date: string;
  final: boolean;
  /** Summa hisoblangan paytdagi asosiy qarz (kredit — davr boshida, karta — to'lov kunida) */
  base: number;
  amount: number;
  interest: number;
  principal: number;
  paid: number;
  /** Shu to'lovga tushgan to'lovlarning foiz qismi (to'lov avval foizga) — "foiz + asosiy" bo'linishi uchun */
  paidInterest: number;
  /** Kuzatuvdan oldingi oylik to'lov — kechikkan deb chiqmaydi, to'lov unga tushmaydi */
  tracked: boolean;
  /**
   * Karta va "har oy foiz" qarzi: summa to'lov kunidagi qarzdan aniqlanadi (davr ichidagi
   * xaridlar ham kiradi) — `done` bo'lguncha summa noma'lum. Kreditda summa davr boshida.
   */
  dynamic: boolean;
  done: boolean;
  /** Shu davr ichida yig'ilgan foiz */
  accruedInCycle: number;
}

/** Yopish summasiga moslangan to'lov (oxirgi yoki cheklangan): summa va uning foiz/asosiy bo'linishi */
interface DueFix {
  amount: number;
  interest: number;
  principal: number;
}

/** Shartlardan kelib chiqadigan doimiy qiymatlar */
interface Plan {
  monthly: boolean;
  n: number | null;
  grace: number;
  /** Annuitet to'lovi (equal) */
  A: number | null;
  contractA: boolean;
  /** Kamayib boruvchida har oy asosiy qarzdan */
  decPart: number | null;
  dueAt: (k: number) => { date: string; final: boolean } | null;
  /**
   * k-to'lov summasi: davr boshidagi qarz B va davr foizi I bo'yicha. `floorB` — kartada "kichik qoldiq
   * to'liq so'raladi" qoidasi uchun qarz (shu davrdagi to'lovlardan oldingi); berilmasa — B
   */
  amountFor: (k: number, B: number, I: number, final: boolean, floorB?: number) => number;
}

function makePlan(t: DebtTerms, basePrincipal: number): Plan {
  const cur = t.currency;
  const rate = Math.max(0, t.annualRate || 0);
  const repayment = t.repayment;
  const monthly = repayment !== 'lump';
  const n = t.termMonths != null && t.termMonths >= 1 ? Math.floor(t.termMonths) : null;
  const grace = Math.max(0, Math.min(Math.floor(t.graceMonths || 0), n != null ? n - 1 : DEBT_LIMITS.graceMax));
  const contract = t.monthlyPayment != null && t.monthlyPayment > 0 ? t.monthlyPayment : null;
  const A =
    repayment === 'equal'
      ? (contract ?? (n != null ? debtMoney(annuityPayment(basePrincipal, rate, n - grace), cur) : null))
      : null;
  const decPart = repayment === 'decreasing' && n != null ? basePrincipal / Math.max(1, n - grace) : null;
  const minPct = Math.max(0, t.minPct || 0) / 100;

  const dueAt = (k: number): { date: string; final: boolean } | null => {
    if (k < 1) return null;
    if (repayment === 'lump') return k === 1 && t.dueOn ? { date: t.dueOn, final: true } : null;
    if (!t.firstDueOn || k > DEBT_LIMITS.projectionMonths) return null;
    const d = addMonthsAnchored(t.firstDueOn, k - 1, t.payDay);
    if (repayment === 'interest') {
      if (!t.dueOn) return { date: d, final: false };
      // Muddat tugash kuni — oxirgi to'lov: oylik sanalar undan oldin, keyin shu kunning o'zi
      const prev = k > 1 ? addMonthsAnchored(t.firstDueOn, k - 2, t.payDay) : null;
      if (prev != null && prev >= t.dueOn) return null;
      return d >= t.dueOn ? { date: t.dueOn, final: true } : { date: d, final: false };
    }
    if (n != null) return k <= n ? { date: d, final: k === n } : null;
    // "Har oy 2 mln" (muddatsiz) — qarz tugaguncha
    return A != null ? { date: d, final: false } : null;
  };

  const amountFor = (k: number, B: number, I: number, final: boolean, floorB: number = B): number => {
    const all = B + I;
    if (final) return all;
    let amount: number;
    if (repayment === 'equal') amount = k <= grace || A == null ? I : Math.min(A, all);
    else if (repayment === 'decreasing') amount = k <= grace || decPart == null ? I : Math.min(all, decPart + I);
    else if (repayment === 'interest') {
      // "Qarz va foizning N%" faqat N > 0 da; 0% — "faqat foiz" (ilgari 0 so'm chiqib, foiz to'lovsiz yig'ilardi)
      amount = t.minBase === 'total' && minPct > 0 ? Math.min(all, minPct * all) : Math.min(all, minPct * B + I);
      // Kichik qoldiq to'liq so'raladi — lekin shu davrda oldinroq to'langan minimal to'lov qoldiqni chegaradan
      // tushirib, to'lov kuni butun qarzni "kechikkan" qilib qo'ymasin (105 000 → 13 089 to'landi → 83 714 kechikdi)
      if (minPct > 0 && floorB <= MIN_FLOOR[cur]) amount = all;
    } else amount = all;
    return Math.max(0, amount);
  };

  return { monthly, n, grace, A, contractA: contract != null, decPart, dueAt, amountFor };
}

// ─────────────────────────── Asosiy hisob ───────────────────────────

/**
 * Qarzning bugungi holati, kelgusi to'lovlar jadvali va har yozuvning ta'siri.
 * Yozuvlar istalgan tartibda berilishi mumkin — sana, keyin createdAt bo'yicha saralanadi.
 */
export function analyzeDebt(
  terms: DebtTerms,
  entries: ReadonlyArray<DebtLedgerEntry>,
  today: string,
): DebtAnalysis {
  // Tayyor karta (TBC Osmon, Infin Black) — hisobot kuni va foizsiz davr bilan alohida hisob
  if (terms.kind === 'card' && isCardProduct(terms.cardProduct)) return analyzeProductCard(terms, entries, today);
  const cur = terms.currency;
  const m = (v: number) => debtMoney(v, cur);
  const eps = epsOf(cur);
  const isCard = terms.kind === 'card';
  const rate = Math.max(0, terms.annualRate || 0);
  const dc = terms.dayCount;
  const opening = terms.openingBalance != null && terms.openingBalance >= 0 ? terms.openingBalance : null;
  /** Avvaldan bor qarz: bank ilovasidagi hozirgi qoldiq bilan kiritilgan */
  const running = opening != null;
  const basePrincipal = running ? (opening as number) : Math.max(0, terms.amount || 0);
  const plan = makePlan(terms, basePrincipal);

  // Boshlang'ich holat
  let P = running ? (opening as number) : isCard ? 0 : Math.max(0, terms.amount || 0);
  // Eski oylik kreditda foiz oxirgi to'lov kunidan yig'iladi (bank qoldig'i shu kunniki)
  const accrualFrom = running
    ? plan.monthly && terms.firstDueOn
      ? maxIso(terms.startedOn, addMonthsAnchored(terms.firstDueOn, -1, terms.payDay))
      : maxIso(terms.startedOn, terms.trackedFrom)
    : terms.startedOn;
  /** Shundan oldingi yozuvlar qoldiqqa ta'sir qilmaydi (eski kreditda ular bank qoldig'ida bor) */
  const ledgerFrom = running ? terms.trackedFrom : terms.startedOn;

  let accrued = 0;
  let cursor = accrualFrom;
  let received = isCard ? (opening ?? 0) : Math.max(0, terms.amount || 0);
  let used = isCard ? (opening ?? 0) : 0;
  let useCount = 0;
  let paid = 0;
  let interestPaid = 0;
  let overpaid = 0;
  let lastPayDate: string | null = null;
  /** Karta va "har oy foiz": to'lov summasi to'lov kunidagi qarzdan */
  const dynamic = terms.repayment === 'interest';

  // ── Oylik to'lov davrlari ──
  const cycles: Cycle[] = [];
  let exhausted = !plan.monthly;

  const accrueTo = (date: string) => {
    if (date > cursor) {
      const chunk = m(interestFor(P, rate, cursor, date, dc));
      accrued += chunk;
      const open = cycles.length ? cycles[cycles.length - 1] : null;
      if (open && !open.done) open.accruedInCycle += chunk;
      cursor = date;
    }
  };

  /** Davr summasini qotirish: B — hozirgi asosiy qarz, I — davr foizi */
  const fix = (c: Cycle, I: number) => {
    c.base = P;
    // Kichik qoldiq chegarasi shu davrdagi to'lovlardan oldingi qarz bo'yicha (to'langan asosiy qism qaytariladi)
    c.amount = m(plan.amountFor(c.k, P, I, c.final, P + Math.max(0, c.paid - c.paidInterest)));
    c.interest = Math.min(I, c.amount);
    c.principal = m(c.amount - c.interest);
    c.done = true;
  };
  /** Karta: to'lov kunigacha foiz yig'ilib, summa shu kundagi qarzdan aniqlanadi */
  const settle = (c: Cycle) => {
    if (c.done) return;
    accrueTo(c.date);
    fix(c, c.accruedInCycle);
  };
  const openCycle = (start: string): boolean => {
    const k = cycles.length + 1;
    const at = plan.dueAt(k);
    if (!at) {
      exhausted = true;
      return false;
    }
    const c: Cycle = {
      k,
      start,
      date: at.date,
      final: at.final,
      base: P,
      amount: 0,
      interest: 0,
      principal: 0,
      paid: 0,
      paidInterest: 0,
      tracked: at.date >= terms.trackedFrom,
      dynamic,
      done: false,
      accruedInCycle: 0,
    };
    // Kredit: summa davr boshidagi qarzdan va davrning to'liq foizidan (bank grafigi kabi)
    if (!dynamic) fix(c, m(interestFor(P, rate, start, at.date, dc)));
    cycles.push(c);
    return true;
  };
  if (plan.monthly) openCycle(accrualFrom);

  /**
   * To'lov eng eski to'lanmagan, davri boshlangan oylik to'lovlarga tushadi. `ip` — to'lovning foiz qismi:
   * u ham shu tartibda (avval eski oylarga) yoziladi — "foiz + asosiy qarz" bo'linishi haqiqiy bo'lsin
   */
  const allocate = (amount: number, date: string, ip = 0) => {
    let left = amount;
    let ipLeft = ip;
    for (const c of cycles) {
      if (left <= eps) break;
      if (!c.tracked || !(c.start < date)) continue;
      // Karta summasi hali aniqlanmagan — davr ichidagi to'lov hammasi shu oyga. Oxirgi to'lov ham hammasini
      // oladi: uning summasi o'tib kelgan foiz bilan rejadagidan ko'p bo'lishi mumkin (aks holda "tushgan" kam chiqardi)
      const need = c.done && !c.final ? c.amount - c.paid : Number.POSITIVE_INFINITY;
      if (need <= eps) continue;
      const take = Math.min(need, left);
      c.paid += take;
      const ti = Math.min(take, ipLeft);
      c.paidInterest += ti;
      ipLeft -= ti;
      left -= take;
    }
  };

  // ── Yozuvlarni sana bo'yicha qayta o'ynash ──
  const order = entries
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) =>
      a.e.date !== b.e.date
        ? a.e.date < b.e.date
          ? -1
          : 1
        : (a.e.createdAt ?? '') !== (b.e.createdAt ?? '')
          ? (a.e.createdAt ?? '') < (b.e.createdAt ?? '')
            ? -1
            : 1
          : // Bir millisekunddagi yozuvlar — id bo'yicha: bazadan qaytish tartibiga bog'liq bo'lmasin (Postgres)
            (a.e.id ?? '') !== (b.e.id ?? '')
            ? (a.e.id ?? '') < (b.e.id ?? '')
              ? -1
              : 1
            : a.idx - b.idx,
    );
  const results: DebtEntryResult[] = entries.map(() => ({ split: null, balanceAfter: 0, historical: false }));

  const apply = (e: DebtLedgerEntry, idx: number) => {
    const r = results[idx];
    const amount = Math.max(0, e.amount || 0);
    if (e.date < ledgerFrom) {
      // Kuzatuvdan oldingi yozuv: qoldiq bank ilovasidan olingan, unda bu allaqachon bor
      r.historical = true;
      if (e.kind === 'pay') {
        paid += amount;
        interestPaid += Math.min(amount, Math.max(0, e.interest ?? 0));
      } else if (e.kind === 'use' || (isCard && e.kind === 'draw')) {
        used += amount;
        useCount += 1;
      }
      r.balanceAfter = m(P);
      return;
    }
    accrueTo(e.date);
    if (e.kind === 'draw' || (isCard && e.kind === 'use')) {
      P += amount;
      received += amount;
      if (isCard) {
        used += amount;
        useCount += 1;
      }
    } else if (e.kind === 'use') {
      used += amount;
      useCount += 1;
    } else if (e.kind === 'pay') {
      const ip = m(Math.min(amount, e.interest != null ? Math.max(0, e.interest) : accrued));
      accrued = Math.max(0, m(accrued - ip));
      const pp = m(amount - ip);
      P = m(P - pp);
      if (P < 0) {
        overpaid += -P;
        P = 0;
      }
      paid += amount;
      interestPaid += ip;
      lastPayDate = e.date;
      r.split = { interest: ip, principal: pp };
      allocate(amount, e.date, ip);
    } else if (e.kind === 'adjust') {
      // Bank ilovasidagi asosiy qarz; foiz oxirgi to'lov yoki to'lov sanasidan qayta yig'iladi
      P = m(amount);
      let from = maxIso(accrualFrom, lastPayDate ?? accrualFrom);
      for (const c of cycles) if (c.date <= e.date) from = maxIso(from, c.date);
      accrued = m(interestFor(P, rate, from, e.date, dc));
      const open = cycles.length ? cycles[cycles.length - 1] : null;
      if (open && !open.done) open.accruedInCycle = accrued;
      cursor = e.date;
    }
    r.balanceAfter = m(P);
  };

  let i = 0;
  for (let guard = 0; guard < 10_000; guard += 1) {
    const open = !exhausted && cycles.length ? cycles[cycles.length - 1] : null;
    const cycleEnd = open ? open.date : null;
    const next = i < order.length ? order[i] : null;
    // Davr tugash kunidagi yozuvlar shu davrga tegishli: avval ular, keyin yangi davr ochiladi
    if (next && (cycleEnd == null || next.e.date <= cycleEnd)) {
      // To'lov kuni: karta summasi shu kungi to'lovlardan OLDIN aniqlanadi (bank ko'chirmasi kabi)
      if (open && next.e.date === cycleEnd) settle(open);
      apply(next.e, next.idx);
      i += 1;
      continue;
    }
    if (open && cycleEnd != null && cycleEnd <= today) {
      settle(open);
      accrueTo(cycleEnd);
      openCycle(cycleEnd);
      continue;
    }
    if (next) {
      apply(next.e, next.idx);
      i += 1;
      continue;
    }
    break;
  }
  accrueTo(today);
  P = m(P);
  accrued = m(accrued);
  // Joriy (hali kelmagan) karta to'lovi: hozirgi qarz va to'lov kunigacha yig'iladigan foiz bilan
  const current = cycles.length ? cycles[cycles.length - 1] : null;
  if (current && !current.done) {
    fix(current, current.accruedInCycle + (current.date > today ? m(interestFor(P, rate, today, current.date, dc)) : 0));
  }

  // ── Bugungi to'lovlar holati ──
  /** Qarzni shu kuni to'liq yopish summasi (kelgusi foiz jadvaldagidek alohida yaxlitlanadi — 1 so'm farq bo'lmasin) */
  const payoffBy = (date: string) =>
    m(P + accrued + (date > today ? m(interestFor(P, rate, today, date, dc)) : 0));
  const statusOf = (date: string): DebtDueStatus => {
    const d = dayDiff(today, date);
    return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= DEBT_LIMITS.soonDays ? 'soon' : 'upcoming';
  };
  const toDue = (c: Cycle, remaining: number, fixed?: DueFix): DebtDue => ({
    k: c.k,
    date: c.date,
    amount: fixed?.amount ?? c.amount,
    interest: fixed?.interest ?? c.interest,
    principal: fixed?.principal ?? c.principal,
    paid: m(c.paid),
    remaining,
    daysLeft: dayDiff(today, c.date),
    status: statusOf(c.date),
    final: c.final,
    explain: { base: m(c.base), days: dayDiff(c.start, c.date), dayCount: dc, annualRate: rate },
  });

  const unpaid: { c: Cycle; remaining: number; fixed?: DueFix }[] = [];
  let lastOpen: Cycle | null = null;
  const lastCycle = cycles.length ? cycles[cycles.length - 1] : null;
  if (plan.monthly) {
    let earlier = 0;
    for (const c of cycles) {
      if (!c.tracked) continue;
      const owed = Math.max(0, m(c.amount - c.paid));
      /** Shu kuni qarzni yopish uchun qolgani — oldingi to'lanmaganlaridan keyin */
      const left = Math.max(0, m(payoffBy(c.date) - earlier));
      // Oxirgi to'lov — qolgan hammasi: davr boshidan oldin yig'ilib o'tgan foiz (muddatidan oldin
      // to'langan oy), keyin olingan yoki tenglashtirilgan qarz ham. Aks holda "oxirgi" to'lovdan
      // keyin kichik qoldiq qolib, qarz na yopiladi, na keyingi to'lov ko'rinadi. JORIY (hali kelmagan)
      // to'lov rejada qarzning hammasini so'rasa ham shunday: muddatsiz "har oy N so'm"ning oxirgisi,
      // kichik qoldiqli karta, asosiy qarzi 0 bo'lib foizi qolgan qarz (ilgari bunga hech qachon to'lov
      // chiqmasdi). O'tgan oylarga bu qoida qo'llanmaydi: bugungi qarzda o'sha kundan keyin olingani bor —
      // qarzi 0 bo'lgan eski oy keyingi "Yana oldim"ni "93 kun kechikkan" deb ko'rsatardi.
      // Qolganlari — yopish summasidan oshmaydi: kechikkan oylar asosiy qarzni ikki marta so'ramasin
      const closing =
        c.final || (c === lastCycle && c.date >= today && c.amount >= m(c.base + c.interest) - eps);
      const rem = closing ? left : Math.min(owed, left);
      if (rem > eps) {
        let fixed: DueFix | undefined;
        if (Math.abs(rem - owed) > eps) {
          // Summa o'zgardi — "foiz + asosiy qarz" ham shunga mos: to'lov avval foizga, oldingi to'lanmaganlari
          // foizni birinchi oladi; shu oyga tushgan to'lovlarning foiz qismi — haqiqatda yozilgani (paidInterest)
          const amount = m(c.paid + rem);
          const interestLeft = Math.max(0, m(payoffBy(c.date) - P - earlier));
          const interest = m(Math.min(amount, c.paidInterest + Math.min(rem, interestLeft)));
          fixed = { amount, interest, principal: m(amount - interest) };
        }
        unpaid.push({ c, remaining: rem, fixed });
        earlier += rem;
      }
    }
    lastOpen = cycles.length ? cycles[cycles.length - 1] : null;
  }

  // ── Kelgusi to'lovlar: har to'lov o'z kunida to'lanadi deb ──
  const schedule: (DebtScheduleRow & { due?: DebtDue })[] = [];
  let pP = P;
  let pAccrued = accrued;
  let pCursor = today;
  const pAccrue = (date: string) => {
    if (date > pCursor) {
      pAccrued += m(interestFor(pP, rate, pCursor, date, dc));
      pCursor = date;
    }
  };
  const pPay = (date: string, amount: number, status: DebtScheduleRow['status'], due?: DebtDue) => {
    pAccrue(date);
    const ip = m(Math.min(amount, pAccrued));
    pAccrued = Math.max(0, m(pAccrued - ip));
    const pp = m(Math.min(pP, amount - ip));
    pP = m(pP - pp);
    schedule.push({ date, payment: m(ip + pp), interest: ip, principal: pp, balance: pP, status, due });
  };

  if (terms.repayment === 'lump') {
    if (terms.dueOn && P + accrued > eps) {
      const amount = payoffBy(terms.dueOn);
      const at = terms.dueOn < today ? today : terms.dueOn;
      pPay(at, amount, terms.dueOn < today ? 'overdue' : 'due');
      schedule[schedule.length - 1].date = terms.dueOn;
    }
  } else {
    for (const u of unpaid) pPay(u.c.date < today ? today : u.c.date, u.remaining, u.c.date < today ? 'overdue' : 'due');
    unpaid.forEach((u, j) => {
      schedule[j].date = u.c.date;
      schedule[j].due = toDue(u.c, u.remaining, u.fixed);
    });
    // Keyingi davrlar
    let k = cycles.length;
    let start = lastOpen ? lastOpen.date : accrualFrom;
    if (lastOpen && start < today) start = today;
    for (let guard = 0; guard < DEBT_LIMITS.projectionMonths && pP + pAccrued > eps; guard += 1) {
      const at = plan.dueAt(k + 1);
      if (!at || exhausted) break;
      pAccrue(start);
      const I = m(interestFor(pP, rate, start, at.date, dc));
      // Oxirgi (yoki rejada qarzning hammasini so'raydigan) to'lov oldingi davrdan o'tib kelgan foizni ham yopadi
      const planned = plan.amountFor(k + 1, pP, I, at.final);
      const amount = m(at.final || planned >= pP + I - eps ? pP + pAccrued + I : planned);
      const base = pP;
      pPay(at.date, amount, 'future');
      const row = schedule[schedule.length - 1];
      row.due = {
        k: k + 1,
        date: at.date,
        amount,
        interest: row.interest,
        principal: row.principal,
        paid: 0,
        remaining: amount,
        daysLeft: dayDiff(today, at.date),
        status: statusOf(at.date),
        final: at.final || row.balance <= eps,
        explain: { base, days: dayDiff(start, at.date), dayCount: dc, annualRate: rate },
      };
      k += 1;
      start = at.date;
    }
  }

  // Nol summali qatorlar (qarz oldingi to'lov bilan yopilgan) jadvalda ko'rinmaydi
  for (let j = schedule.length - 1; j >= 0; j -= 1) if (!(schedule[j].payment > eps)) schedule.splice(j, 1);
  const paidOff = pP <= eps && pAccrued <= eps;
  // Hamma to'lov kechikkan bo'lsa ham tugash kuni o'tmishda emas — eng erta bugun
  const payoffDate =
    P <= eps && accrued <= eps ? null : paidOff && schedule.length ? maxIso(schedule[schedule.length - 1].date, today) : null;
  const interestLeft = paidOff ? m(schedule.reduce((a, r) => a + r.interest, 0)) : null;

  // ── Navbatdagi to'lov ──
  let next: DebtDue | null = null;
  let paidDue: DebtDue | null = null;
  if (terms.repayment === 'lump') {
    if (terms.dueOn && P + accrued > eps) {
      const amount = payoffBy(terms.dueOn);
      next = {
        k: 1,
        date: terms.dueOn,
        amount,
        interest: m(amount - P),
        principal: P,
        paid: 0,
        remaining: amount,
        daysLeft: dayDiff(today, terms.dueOn),
        status: statusOf(terms.dueOn),
        final: true,
        explain: { base: P, days: Math.max(0, dayDiff(accrualFrom, terms.dueOn)), dayCount: dc, annualRate: rate },
      };
    }
  } else {
    if (unpaid.length) next = toDue(unpaid[0].c, unpaid[0].remaining, unpaid[0].fixed);
    else {
      if (lastOpen && lastOpen.tracked && lastOpen.date >= today && lastOpen.paid > eps) {
        // Oxirgi to'lov o'tib kelgan foiz bilan rejadagidan ko'p to'langan bo'lsa — to'langani (ortiqchasiz) ko'rinadi
        const over = lastOpen.final && lastOpen.paid > lastOpen.amount + eps;
        const amount = m(Math.max(lastOpen.amount, lastOpen.paid - overpaid));
        const pi = m(Math.min(amount, lastOpen.paidInterest));
        paidDue = toDue(lastOpen, 0, over ? { amount, interest: pi, principal: m(amount - pi) } : undefined);
      }
      next = schedule.find((r) => r.due && r.payment > eps)?.due ?? null;
    }
  }

  const overdueRows = unpaid.filter((u) => u.c.date < today);
  const lumpOverdue = terms.repayment === 'lump' && terms.dueOn != null && terms.dueOn < today && P + accrued > eps;
  const overdue = overdueRows.length
    ? {
        count: overdueRows.length,
        amount: m(overdueRows.reduce((a, u) => a + u.remaining, 0)),
        days: dayDiff(overdueRows[0].c.date, today),
      }
    : lumpOverdue && terms.dueOn
      ? { count: 1, amount: m(P + accrued), days: dayDiff(terms.dueOn, today) }
      : null;

  // ── Natija ──
  const horizon = toISODate(new Date(parseISODate(today).getTime() + DEBT_LIMITS.horizonDays * DAY_MS));
  const soonRows = schedule.filter((r) => r.date <= horizon && r.payment > eps);
  const firstCycle = cycles[0];
  const belowInterest =
    terms.repayment === 'equal' && plan.A != null && firstCycle != null && plan.A <= firstCycle.interest && plan.grace === 0;

  const monthlyPayment =
    terms.repayment === 'equal' && plan.A != null
      ? { amount: m(plan.A), source: plan.contractA ? ('contract' as const) : ('calculated' as const) }
      : terms.repayment === 'decreasing' || terms.repayment === 'interest'
        ? next
          ? { amount: next.amount, source: 'calculated' as const }
          : null
        : null;

  const progressPct = isCard
    ? terms.amount > 0
      ? round(Math.min(100, (P / terms.amount) * 100), 1)
      : 0
    : received > 0
      ? round(Math.max(0, Math.min(100, ((received - P) / received) * 100)), 1)
      : 0;

  const state: DebtCalc['state'] = terms.archivedAt
    ? 'archived'
    : !isCard && P <= eps && accrued <= eps && !overdue
      ? 'paid'
      : 'active';

  const calc: DebtCalc = {
    principal: P,
    accruedInterest: accrued,
    payoff: m(P + accrued),
    monthlyInterest: m((P * rate) / 100 / 12),
    received: m(received),
    used: m(used),
    // Nasiya — naqd pul emas, bo'lib to'lab olingan tovar: "ishlatilmagan pul" yo'q
    unused: isCard || terms.kind === 'installment' || (running && useCount === 0) ? null : m(Math.max(0, received - used)),
    freeLimit: isCard ? m(Math.max(0, terms.amount - P)) : null,
    paid: m(paid),
    interestPaid: m(interestPaid),
    overpaid: m(overpaid),
    monthlyPayment,
    next,
    paidDue,
    overdue,
    payoffDate,
    interestLeft,
    progressPct,
    belowInterest,
    state,
  };

  return {
    calc,
    schedule: schedule.map(({ due: _due, ...row }) => row),
    entries: results,
    soon: { amount: m(soonRows.reduce((a, r) => a + r.payment, 0)), count: soonRows.length },
  };
}

// ─────────────────────────── Tayyor karta: hisobot va foizsiz davr ───────────────────────────
//
// TBC Osmon va Infin Black (CARD_PRODUCTS) shartnomalari bo'yicha (tadqiqot va mustaqil tekshiruv 2026-11-07):
//  • har oy hisobot (vypiska) kuni S; davr — [oldingi S, S): S kungi operatsiya keyingi davrga (TBC 1.3);
//  • to'lov kuni D = S + dueDays (TBC 24; Infin 19 → 20-sana, shanba/yakshanba bo'lsa oldingi juma — oferta 2.8);
//  • xaridlar foizi orqada yig'iladi (bg). Hisobotdagi qarz D gacha to'liq to'lansa kechiriladi, aks holda xarid
//    kunidan boshlab to'lanadi (TBC 5.6–5.7, Infin 2.6–2.7). Infin'da sinov — o'tgan oy xaridlari yopilganmi (3.8);
//  • TBC 5.6: to'liq to'lansa, hisobotdan keyin avvalgi foizli xarid qarzi foizi ham kechiriladi (wbg);
//    5.7.3 — oldingi 2 hisobot davrida kechikish bo'lgan bo'lsa kechirilmaydi;
//  • TBC: foizsiz davr yo'qolsa, oynadagi to'lovlarning asosiy qarzga ketgan qismi avval shu foizni yopadi (FAQ);
//  • naqd, o'tkazma, boshqa to'lov — foiz shu kundan (naqd stavkasi) + komissiya qarzga;
//  • to'lov tartibi: kechikkan (jarima → foiz → asosiy) → hisobotga tushgan foiz → asosiy qarz bank tartibida
//    (TBC: xaridlar, keyin naqd; Infin: eski foizsiz-davrsiz → o'tgan oy xaridlari → joriy foizsiz-davrsiz →
//    joriy xaridlar) → hisobotdan keyin yig'ilgan foiz. Shunda minimal to'langanda asosiy qarz aniq N% kamayadi;
//  • minimal = N% × (asosiy − kechikkan asosiy) + kechikkan asosiy + hisobotdagi foiz + jarima (ikki marta emas);
//  • kechiksa: TBC — kechikkan asosiy qarzdan 1-kun 10%, keyin kuniga 0,4%, tarif bo'yicha hisobot sanasidan;
//    Infin — kuniga 0,25% kechikkan summadan; jami jarima birinchi kechikish kunidagi qarzning 50%idan oshmaydi;
//    kechikish paytida bank limitni bloklaydi; Infin 3.5 — 90+ kun kechiksa karta muddati tugaguncha bloklanadi;
//  • to'lanmagan minimal oynadagi to'lovlar haqiqatda nimaga ketgani bo'yicha bo'linadi (asosiy/foiz), ko'chirmadan
//    keyin yig'ilgan jarima minimal ustiga; kechikkan qism qarzdan oshmaydi (tenglashtirishdan keyin ham);
//  • ko'chirma 0 (davr xaridlari ko'chirmagacha to'langan) — foizsiz davr saqlanadi, yig'ilgan foiz kechiriladi
//    (TBC 5.7.3 da kechirilmaydi — ko'chirmaga tushadi);
//  • kartadagi o'z puli (ortiqcha to'lov) keyin paydo bo'lgan qarzni ham yopadi (ko'chirma foizi, yo'qolgan foiz).
// Kunlik voqealar: kun boshida — kechagi to'lov kunining yakuni, keyin hisobot, keyin yozuvlar.

const addDaysIso = (iso: string, n: number): string => toISODate(new Date(parseISODate(iso).getTime() + n * DAY_MS));

/** Oydagi hisobot kuni (qisqa oyda — oy oxiri); m0 manfiy yoki 11 dan katta bo'lishi mumkin */
function statementIn(y: number, m0: number, day: number): string {
  const first = new Date(Date.UTC(y, m0, 1));
  const yy = first.getUTCFullYear();
  const mm = first.getUTCMonth();
  return toISODate(new Date(Date.UTC(yy, mm, Math.min(day, lastDayOfMonth(yy, mm)))));
}

/** Shu kungi yoki undan oldingi oxirgi hisobot sanasi */
function statementOnOrBefore(date: string, day: number): string {
  const d = parseISODate(date);
  const here = statementIn(d.getUTCFullYear(), d.getUTCMonth(), day);
  return here <= date ? here : statementIn(d.getUTCFullYear(), d.getUTCMonth() - 1, day);
}

/** Shu kundan KEYINGI birinchi hisobot sanasi — shu kungi operatsiya qaysi davrga tushishi */
function statementAfter(date: string, day: number): string {
  const d = parseISODate(date);
  const here = statementIn(d.getUTCFullYear(), d.getUTCMonth(), day);
  return here > date ? here : statementIn(d.getUTCFullYear(), d.getUTCMonth() + 1, day);
}

/** Hisobot sanasidan k oy oldingi hisobot sanasi */
function statementMonthsBefore(S: string, k: number, day: number): string {
  const d = parseISODate(S);
  return statementIn(d.getUTCFullYear(), d.getUTCMonth() - k, day);
}

/** Tayyor kartada hisobotning to'lov kuni: S + dueDays; Infin'da shanba/yakshanba bo'lsa oldingi juma (oferta 2.8) */
function cardDueOf(rules: CardProductRules, S: string): string {
  let d = addDaysIso(S, rules.dueDays);
  if (rules.weekendBack) {
    for (let i = 0; i < 3; i += 1) {
      const wd = parseISODate(d).getUTCDay();
      if (wd !== 0 && wd !== 6) break;
      d = addDaysIso(d, -1);
    }
  }
  return d;
}

/**
 * Tayyor karta: kuzatuv boshidagi (trackedFrom) oxirgi ko'chirma va uning to'lov kuni. pending — to'lov kuni hali
 * o'tmagan: ilovadagi "to'lash kerak" (openingBilled) va minimal to'lov (openingMin) shu ko'chirmaniki.
 * Tayyor karta emas yoki trackedFrom yo'q — null. Hisob (analyzeProductCard) bilan bir xil qoida
 */
export function cardOpeningStatement(
  terms: Pick<DebtTerms, 'cardProduct' | 'statementDay' | 'trackedFrom'>,
): { statementDate: string; due: string; pending: boolean } | null {
  if (!isCardProduct(terms.cardProduct) || !terms.trackedFrom) return null;
  const rules = CARD_PRODUCTS[terms.cardProduct];
  const sDay = Math.min(31, Math.max(1, terms.statementDay ?? rules.statementDay ?? 1));
  const S0 = statementOnOrBefore(terms.trackedFrom, sDay);
  const due = cardDueOf(rules, S0);
  return { statementDate: S0, due, pending: terms.trackedFrom <= due };
}

interface CardBucket {
  /** Davrni yopadigan hisobot sanasi */
  period: string;
  /** grace — xarid (foizsiz davr hal bo'lmagan) · lost — foizli xarid qarzi · cash — naqd/o'tkazma/boshqa */
  kind: 'grace' | 'lost' | 'cash';
  principal: number;
  /** grace: orqada yig'ilgan foiz — to'liq to'lansa kechiriladi */
  bg: number;
  /** lost/cash: hisobotdan keyin yig'ilgan, hali hisobotga tushmagan foiz */
  ub: number;
  /** TBC 5.6: ochiq hisobot oynasida lost qarz foizi — hisobot to'liq to'lansa kechiriladi */
  wbg: number;
}

interface CardStatement {
  k: number;
  date: string;
  due: string;
  /** Hisobot kunidagi butun qarz (asosiy + hisobotdagi foiz + jarima) */
  balance: number;
  minimum: number;
  /** Minimal to'lovning foiz va jarima qismi */
  minInterest: number;
  /** Hisobotdagi asosiy qarz */
  base: number;
  paid: number;
  /**
   * TBC FAQ: oynadagi to'lovning xarid foizi uchun muzlatilgan qismi (to'lov paytigacha yig'ilgan foizdan oshmaydi):
   * foizsiz davr yo'qolsa, shu pul foizni yopadi; saqlansa — bo'shaydi
   */
  frozen: number;
  /**
   * Muzlatilgan pul qaysi to'lovdan: ref ≥ 0 — yozuv (entries indeksi), ref < 0 — jadval qatori (-1 → 0-qator).
   * Foizsiz davr yo'qolsa o'sha to'lovning shu qismi foiz bo'ladi (tarixda va jadvalda shunday ko'rsatiladi)
   */
  frozenBy: { ref: number; amount: number }[];
  /** Infin 3.8.2: minimal to'lovning asosiy qismi shuncha yopildi (minimal avval — keyin eski qarz foizi) */
  minPrincipalPaid: number;
  /** Oynadagi to'lovlardan asosiy qarzga ketgani (kechikkan asosiy qarz ham) — to'lanmagan minimalni bo'lish uchun */
  prinPaid: number;
  /**
   * Minimal to'lov ichidagi jarimaning (ko'chirma kunidagi) to'lanmagan qismi. Ko'chirmadan keyin yig'ilgan jarima
   * minimal ustiga to'lanadi — oynaga hisoblanmaydi
   */
  minPenLeft: number;
  resolved: boolean;
  kept: boolean | null;
  overdue: boolean;
  /** TBC 5.7.3: oldingi ikki hisobot davrida kechikish — xarid foizi kechirilmaydi */
  noWaiver: boolean;
  /**
   * Ko'chirmada foizsiz qolishi mumkin bo'lgan narsa bor: Infin — shu davr xaridi (2.7); TBC — xarid, foizli xarid
   * qarzi (5.6: hisobotdan keyingi foizi kechiriladi) yoki ko'chirmagacha to'langan xaridning yig'ilgan foizi.
   * Yo'q bo'lsa (faqat naqd/o'tkazma yoki eski foizli qarz) — grace.state 'none'
   */
  hadGrace: boolean;
}

interface CardState {
  buckets: CardBucket[];
  /** Hisobotga tushgan (yoki foizsiz davr yo'qolgani) to'lanmagan foiz */
  billed: number;
  /** To'lanmagan jarima */
  pen: number;
  /**
   * Qarzdan ortiq to'langan (o'z puli) — keyingi ishlatishga ketadi; keyin paydo bo'lgan qarzni ham (ko'chirma
   * foizi, foizsiz davr yo'qolgani) bank shu puldan yechadi
   */
  credit: number;
  /** O'z pulidan (credit) yopilgan foiz — jami to'langan foizga qo'shiladi */
  creditInterest: number;
  statements: CardStatement[];
  lastStmt: string;
  cursor: string;
  /** Kechikkan asosiy va foiz qismi (jarima — pen) */
  ovP: number;
  ovI: number;
  /** Kechikkan summalar — eng eskisidan (kunlar va soni uchun) */
  overdueRecs: { date: string; amount: number }[];
  /** Kechikish davrlari (TBC 5.7.3) */
  overdueSpans: { from: string; to: string | null }[];
  /** Ko'rilgan eng uzun kechikish (kun) — Infin 3.5: 90 kundan keyin karta butunlay bloklanadi */
  maxOd: number;
  penaltyFrom: string | null;
  penaltyTotal: number;
  /** Qonuniy chegara: birinchi kechikish kunidagi asosiy qarzning yarmi */
  penCap: number;
  penSince: number;
}

const cloneCard = (s: CardState): CardState => ({
  ...s,
  buckets: s.buckets.map((b) => ({ ...b })),
  statements: s.statements.map((x) => ({ ...x, frozenBy: x.frozenBy.map((r) => ({ ...r })) })),
  overdueRecs: s.overdueRecs.map((x) => ({ ...x })),
  overdueSpans: s.overdueSpans.map((x) => ({ ...x })),
});

function analyzeProductCard(
  terms: DebtTerms,
  entries: ReadonlyArray<DebtLedgerEntry>,
  today: string,
): DebtAnalysis {
  const rules = CARD_PRODUCTS[terms.cardProduct as DebtCardProduct];
  const cur = terms.currency;
  const m = (v: number) => debtMoney(v, cur);
  const eps = epsOf(cur);
  const rate = Math.max(0, terms.annualRate || 0);
  const cashRate = terms.cashRate != null && terms.cashRate >= 0 ? terms.cashRate : rate;
  const sDay = Math.min(31, Math.max(1, terms.statementDay ?? rules.statementDay ?? 1));
  const minPct = Math.min(1, Math.max(0, terms.minPct || 0) / 100);
  const limit = Math.max(0, terms.amount || 0);
  const T0 = terms.trackedFrom;
  const isTbc = rules.payOrder === 'purchaseFirst';
  /**
   * TBC: foizsiz davr yo'qolganda muzlatilgan pul foizni yopadi — o'sha to'lovning (yozuv yoki jadval qatori)
   * foiz qismi shuncha ko'payadi. Asosiy hisobda va jadvalda turlicha yangilanadi
   */
  let onReclass: ((ref: number | null, amount: number, st: CardStatement) => void) | null = null;

  const dueOf = (S: string): string => cardDueOf(rules, S);
  const principalOf = (s: CardState) => s.buckets.reduce((a, b) => a + b.principal, 0);
  const ubOf = (s: CardState) => s.buckets.reduce((a, b) => a + b.ub, 0);
  const debtOf = (s: CardState) => principalOf(s) + s.billed + ubOf(s) + s.pen;
  const openOf = (s: CardState) => s.statements.find((x) => !x.resolved) ?? null;
  const overdueOf = (s: CardState) => s.ovP + s.ovI + s.pen;
  const bucketFor = (s: CardState, period: string, kind: CardBucket['kind']): CardBucket => {
    let b = s.buckets.find((x) => x.period === period && x.kind === kind);
    if (!b) {
      b = { period, kind, principal: 0, bg: 0, ub: 0, wbg: 0 };
      s.buckets.push(b);
    }
    return b;
  };
  const tidy = (s: CardState) => {
    const merged: CardBucket[] = [];
    for (const b of s.buckets) {
      // TBC: foizli xarid qarzi bitta (bir stavka, xariddan oldin yopiladi) — eng eski davri bilan; har oy yangisi
      // qo'shilib bormasin (faqat minimal to'lansa 600 ko'chirmalik jadval sekinlashardi)
      const same = merged.find((x) => x.kind === b.kind && (x.period === b.period || (isTbc && b.kind === 'lost')));
      if (same) {
        if (b.period < same.period) same.period = b.period;
        same.principal = m(same.principal + b.principal);
        same.bg = m(same.bg + b.bg);
        same.ub = m(same.ub + b.ub);
        same.wbg = m(same.wbg + b.wbg);
      } else merged.push(b);
    }
    s.buckets = merged.filter((b) => b.principal > eps || b.bg > eps || b.ub > eps || b.wbg > eps);
  };
  /** Eng eski to'lanmagan kechikish shu kungacha necha kun bo'ldi — eng uzuni saqlanadi */
  const noteOverdueAge = (s: CardState, date: string) => {
    if (s.overdueRecs.length) s.maxOd = Math.max(s.maxOd, dayDiff(s.overdueRecs[0].date, date));
  };
  const clearOverdue = (s: CardState, date: string) => {
    noteOverdueAge(s, date);
    s.ovP = 0;
    s.ovI = 0;
    s.overdueRecs = [];
    for (const sp of s.overdueSpans) if (sp.to == null) sp.to = date;
    s.penaltyFrom = null;
    s.penSince = 0;
  };
  const addPen = (s: CardState, v: number) => {
    const room = Math.max(0, s.penCap - s.penSince);
    const pen = m(Math.min(v, room));
    if (pen > 0) {
      s.pen = m(s.pen + pen);
      s.penSince = m(s.penSince + pen);
      s.penaltyTotal = m(s.penaltyTotal + pen);
    }
  };

  /** [cursor, date) foizi va jarimasi */
  const accrueTo = (s: CardState, date: string) => {
    if (!(date > s.cursor)) return;
    const open = openOf(s);
    for (const b of s.buckets) {
      if (!(b.principal > eps)) continue;
      const chunk = m(interestFor(b.principal, b.kind === 'cash' ? cashRate : rate, s.cursor, date, 'act365'));
      if (b.kind === 'grace') b.bg = m(b.bg + chunk);
      else if (
        b.kind === 'lost' &&
        rules.waiveAfterStatement &&
        open &&
        b.period <= open.date &&
        s.cursor >= open.date &&
        date <= addDaysIso(open.due, 1)
      )
        b.wbg = m(b.wbg + chunk);
      else b.ub = m(b.ub + chunk);
    }
    if (s.penaltyFrom && s.ovP + s.ovI > eps) {
      const from = maxIso(s.cursor, s.penaltyFrom);
      const days = date > from ? dayDiff(from, date) : 0;
      const base = rules.penalty.base === 'principal' ? s.ovP : s.ovP + s.ovI;
      if (days > 0 && base > eps) addPen(s, (base * rules.penalty.dailyPct * days) / 100);
    }
    s.cursor = date;
  };

  const issueStatement = (s: CardState, S: string) => {
    accrueTo(s, S);
    // Hisobotdan keyin yig'ilgan foiz endi hisobotga tushadi
    for (const b of s.buckets) {
      s.billed = m(s.billed + b.ub);
      b.ub = 0;
    }
    s.lastStmt = S;
    // Kartadagi o'z puli yangi qarzni (ko'chirmaga tushgan foizni) darhol yopadi
    useCredit(s, S);
    const from2 = statementMonthsBefore(S, 2, sDay);
    const noWaiver =
      rules.noGraceAfterOverdue && s.overdueSpans.some((sp) => sp.from < S && (sp.to == null || sp.to > from2));
    if (!(m(principalOf(s) + s.billed + s.pen) > eps)) {
      // Ko'chirma 0: davr xaridlari ko'chirmagacha to'liq to'langan — foizsiz davr saqlanadi, yig'ilgan foiz
      // kechiriladi (TBC 3.8/5.6, Infin 2.7). TBC 5.7.3 (oldingi kechikish) — kechirilmaydi, ko'chirmaga tushadi
      let forfeit = 0;
      for (const b of s.buckets) {
        if (b.kind === 'grace' && b.period <= S) {
          if (noWaiver) forfeit += b.bg;
          b.bg = 0;
        }
        if (noWaiver) forfeit += b.wbg;
        b.wbg = 0;
      }
      tidy(s);
      s.billed = m(s.billed + forfeit);
      useCredit(s, S);
      if (!(m(principalOf(s) + s.billed + s.pen) > eps)) return;
    }
    const P = m(principalOf(s));
    const balance = m(P + s.billed + s.pen);
    const regular = m(minPct * Math.max(0, P - s.ovP));
    const interestPart = m(s.billed + s.pen);
    const minimum = Math.min(balance, m(regular + s.ovP + interestPart));
    s.statements.push({
      k: s.statements.length + 1,
      date: S,
      due: dueOf(S),
      balance,
      minimum,
      minInterest: Math.min(interestPart, minimum),
      base: P,
      paid: 0,
      frozen: 0,
      frozenBy: [],
      minPrincipalPaid: 0,
      prinPaid: 0,
      minPenLeft: m(s.pen),
      resolved: false,
      kept: null,
      overdue: false,
      noWaiver,
      hadGrace: s.buckets.some(
        (b) =>
          b.period <= S &&
          (b.kind === 'grace'
            ? b.principal > eps || (isTbc && b.bg > eps)
            : isTbc && b.kind === 'lost' && b.principal > eps),
      ),
    });
  };

  /** Asosiy qarzni bank tartibida yopish; Infin'da eski foizsiz-davrsiz qarzning yig'ilgan foizi ham shu yerda */
  const payPrincipal = (s: CardState, amount: number, date: string, withUb = true): { principal: number; interest: number } => {
    let left = amount;
    let principal = 0;
    let interest = 0;
    const takeUb = (b: CardBucket) => {
      if (!withUb) return;
      const t = Math.min(left, b.ub);
      b.ub = m(b.ub - t);
      left = m(left - t);
      interest += t;
    };
    const takeP = (b: CardBucket) => {
      const t = Math.min(left, b.principal);
      b.principal = m(b.principal - t);
      left = m(left - t);
      principal += t;
    };
    const asc = [...s.buckets].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
    if (isTbc) {
      // TBC 5.10: avval xaridlar (eskisidan), keyin naqd
      for (const b of asc.filter((x) => x.kind === 'lost')) if (left > eps) takeP(b);
      for (const b of asc.filter((x) => x.kind === 'grace')) if (left > eps) takeP(b);
      for (const b of asc.filter((x) => x.kind === 'cash')) if (left > eps) takeP(b);
    } else {
      // Infin 3.8.3–3.8.6: eski foizsiz-davrsiz → o'tgan oy xaridlari → joriy foizsiz-davrsiz → joriy xaridlar
      const old = asc.filter((x) => x.period <= s.lastStmt);
      const now = asc.filter((x) => x.period > s.lastStmt);
      for (const b of old.filter((x) => x.kind !== 'grace')) {
        if (left > eps) takeUb(b);
        if (left > eps) takeP(b);
      }
      for (const b of old.filter((x) => x.kind === 'grace')) if (left > eps) takeP(b);
      for (const b of now.filter((x) => x.kind !== 'grace')) {
        if (left > eps) takeUb(b);
        if (left > eps) takeP(b);
      }
      for (const b of now.filter((x) => x.kind === 'grace')) if (left > eps) takeP(b);
    }
    void date;
    return { principal: m(principal), interest: m(interest) };
  };

  /**
   * To'lov. countWindow — ochiq hisobotning oynasiga hisoblansinmi (tenglashtirishda yo'q);
   * overdue — kechikkan qism avval yopilsinmi (tenglashtirishda yo'q)
   */
  const pay = (
    s: CardState,
    amount: number,
    date: string,
    opts: { countWindow?: boolean; overdue?: boolean; ref?: number } = {},
  ) => {
    const countWindow = opts.countWindow ?? true;
    const withOverdue = opts.overdue ?? true;
    const open = openOf(s);
    const inWindow = open && open.date <= date && date <= open.due ? open : null;
    let left = amount;
    let interest = 0;
    let principal = 0;
    let towardOverdue = 0;
    let p1 = 0;
    if (withOverdue) {
      // 1. Kechikkan: jarima → kechikkan foiz → kechikkan asosiy
      p1 = Math.min(left, s.pen);
      s.pen = m(s.pen - p1);
      left = m(left - p1);
      const p2 = Math.min(left, s.ovI, s.billed);
      s.ovI = m(s.ovI - p2);
      s.billed = m(s.billed - p2);
      left = m(left - p2);
      // Kechikkan asosiy qarz — faqat asosiy (hisobotdan keyingi foiz keyingi ko'chirmaga, Infin 3.8.1)
      const p3 = payPrincipal(s, Math.min(left, s.ovP), date, false);
      s.ovP = m(Math.max(0, s.ovP - p3.principal));
      left = m(left - p3.principal);
      // Infin: kechikib ko'chirmaga tushgan asosiy qarz shu ko'chirma minimalining asosiy qismida — ikki marta so'ralmaydi
      if (!isTbc && open && p3.principal > 0) open.minPrincipalPaid = m(open.minPrincipalPaid + p3.principal);
      interest += p1 + p2;
      principal += p3.principal;
      // Kechikish yozuvlarida faqat to'lanmagan minimal (jarimasiz) — jarima to'lovi ularni qisqartirmaydi
      towardOverdue = p2 + p3.principal;
    }
    if (inWindow && countWindow) {
      // Oynadagi to'lov: ko'chirma kunidagi jarima minimal ichida, undan keyin yig'ilgani minimal ustiga
      const fromMin = Math.min(p1, inWindow.minPenLeft);
      inWindow.minPenLeft = m(inWindow.minPenLeft - fromMin);
      inWindow.paid = m(inWindow.paid + amount - (p1 - fromMin));
    }
    // 2. Hisobotga tushgan foiz
    const p4 = Math.min(left, s.billed);
    s.billed = m(s.billed - p4);
    left = m(left - p4);
    interest += p4;
    // 3a. Infin 3.8.2: minimal to'lovning asosiy qismi (5%) — eski qarzning hisobotdan keyingi foizidan oldin
    if (!isTbc && left > eps) {
      const st0 = openOf(s);
      const need = st0 ? Math.max(0, st0.minimum - st0.minInterest - st0.minPrincipalPaid) : 0;
      if (st0 && need > eps) {
        const pm = payPrincipal(s, Math.min(left, need), date, false);
        st0.minPrincipalPaid = m(st0.minPrincipalPaid + pm.principal);
        left = m(left - pm.principal);
        principal += pm.principal;
      }
    }
    // 3. Asosiy qarz bank tartibida
    const p5 = payPrincipal(s, left, date);
    left = m(left - p5.principal - p5.interest);
    interest += p5.interest;
    principal += p5.principal;
    // 4. Hisobotdan keyin yig'ilgan foiz
    for (const b of s.buckets) {
      if (!(left > eps)) break;
      const t = Math.min(left, b.ub);
      b.ub = m(b.ub - t);
      left = m(left - t);
      interest += t;
    }
    if (!withOverdue && left > eps) {
      const p6 = Math.min(left, s.pen);
      s.pen = m(s.pen - p6);
      left = m(left - p6);
      interest += p6;
    }
    // 5. Ortiqchasi — kartadagi o'z puli
    if (left > eps) s.credit = m(s.credit + left);
    if (inWindow && countWindow) inWindow.prinPaid = m(inWindow.prinPaid + principal);
    if (isTbc && inWindow && countWindow && principal > eps) {
      const riskNow = s.buckets.reduce((a, b) => a + (b.kind === 'grace' && b.period <= inWindow.date ? b.bg : 0) + b.wbg, 0);
      const inc = m(Math.min(principal, Math.max(0, riskNow - inWindow.frozen)));
      if (inc > 0) {
        inWindow.frozen = m(inWindow.frozen + inc);
        if (opts.ref != null) inWindow.frozenBy.push({ ref: opts.ref, amount: inc });
      }
    }
    // Kechikish yozuvlari eng eskisidan kamayadi (avval — shu kungacha kechikish necha kun bo'lgani)
    noteOverdueAge(s, date);
    let o = towardOverdue;
    for (const r of s.overdueRecs) {
      if (!(o > eps)) break;
      const t = Math.min(o, r.amount);
      r.amount = m(r.amount - t);
      o -= t;
    }
    s.overdueRecs = s.overdueRecs.filter((r) => r.amount > eps);
    // Kechikkan qism qarzdan oshmaydi (tenglashtirish qarzni kamaytirsa ham)
    s.ovP = m(Math.min(s.ovP, principalOf(s)));
    s.ovI = m(Math.min(s.ovI, s.billed));
    if (s.overdueSpans.some((sp) => sp.to == null) && overdueOf(s) <= eps) clearOverdue(s, date);
    tidy(s);
    return { interest: m(interest), principal: m(principal) };
  };

  /**
   * Kartadagi o'z puli (credit) qarzni yopadi — bank yangi qarzni o'z pulidan yechadi (oynaga hisoblanmaydi).
   * Odatda o'z puli bor paytda qarz bo'lmaydi; ko'chirma foizi va 5.7.3 foizi uchun
   */
  const useCredit = (s: CardState, date: string) => {
    const debt = m(debtOf(s));
    if (!(s.credit > eps) || !(debt > eps)) return;
    const x = m(Math.min(s.credit, debt));
    s.credit = m(s.credit - x);
    s.creditInterest = m(s.creditInterest + pay(s, x, date, { countWindow: false }).interest);
  };

  const draw = (s: CardState, amount: number, fee: number, channel: DebtChannel, date: string) => {
    let rest = m(amount + fee);
    const fromCredit = Math.min(s.credit, rest);
    s.credit = m(s.credit - fromCredit);
    rest = m(rest - fromCredit);
    if (rest > eps) {
      const b = bucketFor(s, statementAfter(date, sDay), channel === 'purchase' ? 'grace' : 'cash');
      b.principal = m(b.principal + rest);
    }
  };

  /** To'lov kunining yakuni (keyingi kun boshida) */
  const resolve = (s: CardState, st: CardStatement) => {
    // Kartada o'z puli bo'lsa — bank to'lov kunida shundan yechadi (oynadagi to'lov kabi)
    if (s.credit > eps && debtOf(s) > eps) {
      const x = m(Math.min(s.credit, debtOf(s)));
      s.credit = m(s.credit - x);
      s.creditInterest = m(s.creditInterest + pay(s, x, st.due, { countWindow: true }).interest);
    }
    // To'lanmagan minimal shu qarzdan (yo'qolgan foiz qo'shilishidan oldin) oshmaydi
    const billedBefore = s.billed;
    const debtBefore = m(debtOf(s));
    // Foizsiz davr: TBC — hisobot summasi to'langanmi (3.8); Infin — o'tgan oy xaridlari yopilganmi (2.7, 3.8)
    const kept = isTbc
      ? st.paid >= st.balance - eps
      : !s.buckets.some((b) => b.kind === 'grace' && b.period <= st.date && b.principal > eps);
    const waived = kept && !st.noWaiver;
    let lostInterest = 0;
    for (const b of s.buckets) {
      if (b.kind === 'grace' && b.period <= st.date) {
        if (!waived) lostInterest += b.bg;
        b.bg = 0;
        // Kechirilganda ham yopilmay qolgan qism — endi foizli (qayta foizsiz davr yo'q)
        if (!waived || b.principal > eps) b.kind = 'lost';
      }
      if (b.wbg > 0) {
        if (!waived) lostInterest += b.wbg;
        b.wbg = 0;
      }
    }
    lostInterest = m(lostInterest);
    // Kartada o'z puli qolgan bo'lsa (masalan, 5.7.3 da "Hammasi" to'langan) — yo'qolgan foiz avval shundan yechiladi
    if (lostInterest > 0 && s.credit > eps) {
      const c = m(Math.min(s.credit, lostInterest));
      s.credit = m(s.credit - c);
      s.creditInterest = m(s.creditInterest + c);
      lostInterest = m(lostInterest - c);
    }
    if (lostInterest > 0) {
      if (isTbc) {
        // TBC FAQ: to'lovning bir qismi xarid foizi uchun muzlatiladi — oynada asosiy qarzga ketgan pul avval shu foizni yopadi
        const x = Math.min(lostInterest, st.frozen);
        if (x > 0) {
          bucketFor(s, st.date, 'lost').principal = m(bucketFor(s, st.date, 'lost').principal + x);
          // Shu pul qaysi to'lovdan muzlatilgan bo'lsa — o'sha to'lovning foiz qismi (eskisidan)
          let rest = x;
          for (const r of st.frozenBy) {
            if (!(rest > eps)) break;
            const t = m(Math.min(rest, r.amount));
            if (t > 0 && onReclass) onReclass(r.ref, t, st);
            rest = m(rest - t);
          }
          // Yozuvga bog'lanmagan qismi (to'lov kuni o'z pulidan yechilgani)
          if (rest > eps && onReclass) onReclass(null, rest, st);
        }
        s.billed = m(s.billed + lostInterest - x);
      } else s.billed = m(s.billed + lostInterest);
    }
    tidy(s);
    st.kept = waived;
    st.resolved = true;
    if (st.paid < st.minimum - eps) {
      // To'lanmagan minimal: asosiy qismi — minimalning asosiy qismidan oynada asosiy qarzga ketgani ayirilgani;
      // foiz qismi — ko'chirmadagi foizdan to'lanmagani (ko'chirma kunidagi jarima pen da qoladi)
      const unpaid = m(Math.min(st.minimum - st.paid, debtBefore));
      const principalPart = m(Math.min(unpaid, Math.max(0, st.minimum - st.minInterest - st.prinPaid)));
      const ovP = m(Math.min(principalPart, principalOf(s)));
      const ovI = m(Math.min(billedBefore, s.billed, Math.max(0, unpaid - principalPart - st.minPenLeft)));
      const prevOvP = s.ovP;
      const hadOverdue = s.overdueSpans.some((sp) => sp.to == null);
      s.ovP = ovP;
      s.ovI = ovI;
      // Qarzi qolmagan ko'chirma kechikmaydi
      if (ovP + ovI > eps) {
        st.overdue = true;
        const known = s.overdueRecs.reduce((a, r) => a + r.amount, 0);
        if (unpaid - known > eps) s.overdueRecs.push({ date: st.due, amount: m(unpaid - known) });
        if (!hadOverdue) {
          s.overdueSpans.push({ from: addDaysIso(st.due, 1), to: null });
          s.penCap = m(0.5 * principalOf(s));
          s.penSince = 0;
        }
        const newOvP = Math.max(0, s.ovP - prevOvP);
        if (rules.penalty.fromStatement && newOvP > eps) {
          // TBC tarif: hisobot sanasidan — 1-kun 10%, keyin har kuni 0,4% (S+1 … D)
          addPen(s, (newOvP * rules.penalty.firstDayPct) / 100 + (newOvP * rules.penalty.dailyPct * dayDiff(st.date, st.due)) / 100);
        }
        if (!s.penaltyFrom) s.penaltyFrom = addDaysIso(st.due, 1);
      } else if (hadOverdue && overdueOf(s) <= eps) clearOverdue(s, addDaysIso(st.due, 1));
    }
  };

  /** Kun boshigacha: to'lov kunlari yakuni va hisobotlar (sana tartibida), keyin foiz */
  const advanceTo = (s: CardState, date: string) => {
    for (let guard = 0; guard < 10_000; guard += 1) {
      const open = openOf(s);
      const resolveAt = open ? addDaysIso(open.due, 1) : null;
      const nextS = statementAfter(s.lastStmt, sDay);
      const at = resolveAt && resolveAt <= nextS ? resolveAt : nextS;
      if (at > date) break;
      accrueTo(s, at);
      if (open && resolveAt === at) resolve(s, open);
      else issueStatement(s, nextS);
    }
    accrueTo(s, date);
  };

  // ── Boshlang'ich holat (bank ilovasidan) ──
  const B0 = Math.max(0, terms.openingBalance ?? 0);
  const revolving = terms.openingRevolving === true;
  const S0 = statementOnOrBefore(T0, sDay);
  const D0 = dueOf(S0);
  const st: CardState = {
    buckets: [],
    billed: 0,
    pen: 0,
    credit: 0,
    creditInterest: 0,
    statements: [],
    lastStmt: S0,
    cursor: T0,
    ovP: 0,
    ovI: 0,
    overdueRecs: [],
    overdueSpans: [],
    maxOd: 0,
    penaltyFrom: null,
    penaltyTotal: 0,
    penCap: 0,
    penSince: 0,
  };
  const curPeriod = statementAfter(T0, sDay);
  const midOf = (a: string, b: string) => addDaysIso(a, Math.floor(Math.max(0, dayDiff(a, b)) / 2));
  // Foizsiz davrdagi boshlang'ich xaridlar foizi: aniq xarid kunlari noma'lum — davr o'rtasidan (taxmin)
  const openingBg = (amount: number, from: string) => (from < T0 ? m(interestFor(amount, rate, from, T0, 'act365')) : 0);
  const odOpen = Math.max(0, terms.openingOverdue ?? 0);
  if (T0 <= D0) {
    // Oxirgi hisobot to'lovi kutilmoqda: ilovadagi "to'lash kerak" va "minimal to'lov" (qolgani)
    const left = m(Math.min(B0, Math.max(0, terms.openingBilled ?? B0)));
    const minLeft = m(Math.min(left, Math.max(0, terms.openingMin ?? minPct * left)));
    let minInterest = 0;
    let base = left;
    if (left > eps) {
      if (revolving) {
        // Foizli aylanuvchi qarz: minimal = N% asosiy + foiz → asosiy va foiz qismi
        const P0 = minPct < 1 ? Math.min(left, Math.max(0, (left - minLeft) / (1 - minPct))) : left;
        bucketFor(st, S0, 'lost').principal = m(P0);
        st.billed = m(left - P0);
        minInterest = Math.min(minLeft, st.billed);
        base = m(P0);
      } else {
        const b = bucketFor(st, S0, 'grace');
        b.principal = left;
        b.bg = openingBg(left, addDaysIso(S0, -15));
      }
    }
    const rest = m(B0 - left);
    if (rest > eps) {
      const b = bucketFor(st, curPeriod, 'grace');
      b.principal = rest;
      b.bg = openingBg(rest, midOf(S0, T0));
    }
    if (left > eps)
      st.statements.push({
        k: 1,
        date: S0,
        due: D0,
        balance: left,
        minimum: minLeft,
        minInterest,
        base,
        paid: 0,
        frozen: 0,
        frozenBy: [],
        minPrincipalPaid: 0,
        prinPaid: 0,
        minPenLeft: 0,
        resolved: false,
        kept: null,
        overdue: false,
        noWaiver: rules.noGraceAfterOverdue && odOpen > eps,
        // Infin: foizli aylanuvchi qarzda xarid yo'q; TBC: foizli xarid qarzining ham hisobotdan keyingi foizi kechiriladi
        hadGrace: isTbc || !revolving,
      });
  } else if (B0 > eps) {
    if (revolving) bucketFor(st, S0, 'lost').principal = m(B0);
    else {
      const b = bucketFor(st, curPeriod, 'grace');
      b.principal = m(B0);
      b.bg = openingBg(B0, midOf(S0, T0));
    }
  }
  if (odOpen > eps) {
    // Ilovadagi muddati o'tgan summa: asosiy qarz deb (taxmin); jarima kuzatuvdan boshlab
    st.ovP = m(Math.min(odOpen, B0));
    const lastDue = D0 < T0 ? D0 : dueOf(statementMonthsBefore(S0, 1, sDay));
    st.overdueRecs.push({ date: lastDue, amount: st.ovP });
    st.overdueSpans.push({ from: T0, to: null });
    st.penaltyFrom = T0;
    st.penCap = m(0.5 * B0);
  }

  // ── Yozuvlar ──
  const order = entries
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) =>
      a.e.date !== b.e.date
        ? a.e.date < b.e.date
          ? -1
          : 1
        : (a.e.createdAt ?? '') !== (b.e.createdAt ?? '')
          ? (a.e.createdAt ?? '') < (b.e.createdAt ?? '')
            ? -1
            : 1
          : (a.e.id ?? '') !== (b.e.id ?? '')
            ? (a.e.id ?? '') < (b.e.id ?? '')
              ? -1
              : 1
            : a.idx - b.idx,
    );
  const results: DebtEntryResult[] = entries.map(() => ({ split: null, balanceAfter: 0, historical: false }));
  let received = B0;
  let used = B0;
  let paidTotal = 0;
  let interestPaid = 0;
  // Muzlatilgan pul foizga o'tganda: to'lovning foiz qismi ko'payadi, undan keyingi qoldiqlar ham
  // (to'lov kunining yakunigacha) shuncha ko'p bo'lgan. processed — order bo'yicha ishlangan yozuvlar soni
  const posOf: number[] = [];
  order.forEach(({ idx }, p) => {
    posOf[idx] = p;
  });
  let processed = 0;
  onReclass = (ref, t) => {
    // Yozuvsiz qismi (o'z pulidan yechilgan) — faqat to'langan foizga
    if (ref == null) {
      interestPaid += t;
      return;
    }
    if (!(ref >= 0) || !results[ref]) return;
    const r = results[ref];
    if (r.split) r.split = { interest: m(r.split.interest + t), principal: m(r.split.principal - t) };
    interestPaid += t;
    for (let p = posOf[ref]; p < processed; p += 1) {
      const rr = results[order[p].idx];
      if (!rr.historical) rr.balanceAfter = m(rr.balanceAfter + t);
    }
  };
  for (let p = 0; p < order.length; p += 1) {
    const { e, idx } = order[p];
    processed = p;
    const r = results[idx];
    const amount = Math.max(0, e.amount || 0);
    if (e.date < T0) {
      // Kuzatuvdan oldingi yozuv: qarz bank ilovasidan olingan, unda bu bor
      r.historical = true;
      if (e.kind === 'pay') paidTotal += amount;
      else if (e.kind === 'draw' || e.kind === 'use') used += amount;
      r.balanceAfter = m(principalOf(st));
      continue;
    }
    advanceTo(st, e.date);
    if (e.kind === 'draw' || e.kind === 'use') {
      const channel: DebtChannel = e.channel ?? 'purchase';
      const fee = channel === 'purchase' ? 0 : Math.max(0, e.fee ?? 0);
      draw(st, amount, fee, channel, e.date);
      received += amount + fee;
      used += amount;
    } else if (e.kind === 'pay') {
      r.split = pay(st, amount, e.date, { ref: idx });
      paidTotal += amount;
      interestPaid += r.split.interest;
    } else if (e.kind === 'adjust') {
      // Bank ilovasidagi qarz: faqat farq — ortig'i joriy davr xaridi, kami bank tartibida kamayadi;
      // hisobotlar, foizli qarz va kechikish o'z joyida qoladi. Bank ko'rsatgan qarz o'z puli ayirilgani
      if (amount > eps) st.credit = 0;
      const T = debtOf(st);
      if (amount > T + eps) {
        const b = bucketFor(st, statementAfter(e.date, sDay), 'grace');
        b.principal = m(b.principal + amount - T);
      } else if (amount < T - eps) {
        pay(st, m(T - amount), e.date, { countWindow: false, overdue: false });
        // Ochiq ko'chirma qolgan qarzdan katta emas: summasi va minimali shu bilan cheklanadi
        const o = openOf(st);
        if (o) {
          const cap = m(o.paid + debtOf(st));
          o.balance = Math.min(o.balance, cap);
          o.minimum = Math.min(o.minimum, cap);
          o.minInterest = Math.min(o.minInterest, o.minimum);
          o.minPenLeft = Math.min(o.minPenLeft, st.pen);
        }
      }
    }
    r.balanceAfter = m(principalOf(st));
  }
  processed = order.length;
  advanceTo(st, today);
  interestPaid += st.creditInterest;

  // ── Bugungi holat ──
  const P = m(principalOf(st));
  const ubNow = m(ubOf(st));
  const open = openOf(st);
  const odTotal = m(overdueOf(st));
  // Infin 3.5: 90 kundan ko'p kechikkan karta to'langandan keyin ham bloklangan qoladi (muddati tugaguncha)
  const odAge = Math.max(st.maxOd, st.overdueRecs.length ? dayDiff(st.overdueRecs[0].date, today) : 0);
  const blockedForGood = rules.blockAfterOverdueDays != null && odAge >= rules.blockAfterOverdueDays;
  const blocked = odTotal > eps || blockedForGood;
  const statusOf = (date: string): DebtDueStatus => {
    const d = dayDiff(today, date);
    return d < 0 ? 'overdue' : d === 0 ? 'today' : d <= DEBT_LIMITS.soonDays ? 'soon' : 'upcoming';
  };
  const riskFor = (s: CardState, S: string) =>
    m(s.buckets.reduce((a, b) => a + (b.kind === 'grace' && b.period <= S ? b.bg : 0) + b.wbg, 0));
  /**
   * Foizsiz davr yo'qolsa to'lov kunining yakunida qo'shiladigan foiz — bundan keyin to'lov bo'lmasa.
   * Bugungacha yig'ilgani emas: ko'chirma kuni u hali kichik, to'lov kunigacha o'sadi
   */
  const riskAtDue = (s: CardState, x: CardStatement) => {
    const c = cloneCard(s);
    accrueTo(c, addDaysIso(x.due, 1));
    return riskFor(c, x.date);
  };
  /** Foizsiz qolish uchun hozir to'lash kerak qolgani */
  const graceLeftFor = (s: CardState, x: CardStatement): number => {
    if (isTbc) return m(Math.max(0, x.balance - x.paid));
    // Infin: o'tgan oy xaridlarigacha bank tartibidagi hamma narsa (kechikkan, foiz, eski foizsiz-davrsiz qarz)
    const old = s.buckets.filter((b) => b.period <= x.date);
    const before = old.filter((b) => b.kind !== 'grace').reduce((a, b) => a + b.principal + b.ub, 0);
    const purchases = old.filter((b) => b.kind === 'grace').reduce((a, b) => a + b.principal, 0);
    return purchases > eps ? m(s.pen + s.billed + before + purchases) : 0;
  };
  const toDue = (x: CardStatement, remaining: number, estimate: boolean, s: CardState): DebtDue => {
    // Ko'chirmada foizsiz qoladigan narsa yo'q (grace.state 'none') — "foizsiz qolish uchun" ham, xavf ham 0
    const none = !x.noWaiver && !x.hadGrace;
    const graceLeft = none ? 0 : graceLeftFor(s, x);
    return {
      k: x.k,
      date: x.due,
      amount: x.minimum,
      interest: x.minInterest,
      principal: m(x.minimum - x.minInterest),
      paid: m(x.paid),
      remaining,
      daysLeft: dayDiff(today, x.due),
      status: statusOf(x.due),
      final: false,
      // "(24 kun)" kabi noto'g'ri izoh chiqmasin: kartada foiz kunlik qoldiqdan
      explain: { base: x.base, days: 0, dayCount: 'act365', annualRate: rate },
      card: {
        statementDate: x.date,
        statementBalance: x.balance,
        graceLeft,
        // To'liq to'langan ko'chirmada xavf yo'q (yig'ilgani kechiriladi); 5.7.3 da — baribir qo'shiladi
        graceRisk: !none && (graceLeft > eps || x.noWaiver) ? riskAtDue(s, x) : 0,
        estimate,
      },
    };
  };

  // ── Kelgusi to'lovlar: har oy faqat minimal to'lanadi deb ──
  const sim = cloneCard(st);
  const rows: DebtScheduleRow[] = [];
  /** Qator qaysi ko'chirmaniki (k); kechikkan qator — null */
  const rowStmt: (number | null)[] = [];
  let firstEstimate: DebtDue | null = null;
  /**
   * TBC: qator to'lovining muzlatilgan qismi foizga o'tdi — o'sha qatorning foiz qismi ko'payadi, asosiy qismi kamayadi
   * (muzlatilgani shu to'lov asosiy qarzga ketganidan oshmaydi; baribir 0 dan pastga tushirilmaydi). Qaytaradi: o'tgani
   */
  const shift = (i: number, t: number): number => {
    const row = rows[i];
    const x = m(Math.min(t, Math.max(0, row.principal)));
    if (!(x > 0)) return 0;
    row.interest = m(row.interest + x);
    row.principal = m(row.principal - x);
    for (let j = i; j < rows.length; j += 1) rows[j].balance = m(rows[j].balance + x);
    return x;
  };
  /**
   * Bugungacha yozilgan to'lovning muzlatilgan puli foizni yopdi — bugungi qoldiqdan qaraganda asosiy qarz shuncha
   * oshadi: alohida 'charge' qatori (D+1): to'lov 0, foiz t, asosiy −t, qoldiq t ga oshadi. Bir ko'chirmaga bitta
   */
  const charge = (t: number, x: CardStatement) => {
    const i = rows.length - 1;
    const last = i >= 0 ? rows[i] : null;
    if (last && last.kind === 'charge' && rowStmt[i] === x.k) {
      last.interest = m(last.interest + t);
      last.principal = m(last.principal - t);
      last.balance = m(last.balance + t);
      return;
    }
    const date = addDaysIso(x.due, 1);
    rows.push({
      date,
      payment: 0,
      interest: m(t),
      principal: m(-t),
      balance: m((last ? last.balance : P) + t),
      status: date < today ? 'overdue' : 'future',
      kind: 'charge',
    });
    rowStmt.push(x.k);
  };
  onReclass = (ref, t, x) => {
    if (ref != null && ref < 0 && rows[-ref - 1]) {
      const used = shift(-ref - 1, t);
      if (t - used > eps) charge(m(t - used), x);
      return;
    }
    charge(t, x);
  };
  const pushRow = (row: DebtScheduleRow, k: number | null) => {
    rows.push(row);
    rowStmt.push(k);
  };
  if (odTotal > eps) {
    const split = pay(sim, odTotal, today, { ref: -(rows.length + 1) });
    const oldest = st.overdueRecs.length ? st.overdueRecs[0].date : today;
    pushRow(
      { date: oldest, payment: odTotal, interest: split.interest, principal: split.principal, balance: m(principalOf(sim)), status: 'overdue' },
      null,
    );
  }
  for (let guard = 0; guard < DEBT_LIMITS.projectionMonths; guard += 1) {
    if (debtOf(sim) <= eps) break;
    let pend = openOf(sim);
    if (!pend) {
      advanceTo(sim, statementAfter(sim.lastStmt, sDay));
      pend = openOf(sim);
      if (!pend) continue;
    }
    const at = pend.due < today ? today : pend.due;
    advanceTo(sim, at);
    const debtNow = m(debtOf(sim));
    // Kichik qoldiq to'liq yopiladi (jadval cheksiz kamayib bormasin — taxmin)
    const want = principalOf(sim) <= MIN_FLOOR[cur] ? debtNow : m(Math.max(0, pend.minimum - pend.paid));
    const amount = Math.min(want, debtNow);
    if (amount > eps) {
      if (!firstEstimate && !(open && pend.k === open.k)) firstEstimate = { ...toDue(pend, amount, true, sim), remaining: amount };
      const split = pay(sim, amount, at, { ref: -(rows.length + 1) });
      pushRow(
        {
          date: pend.due,
          payment: amount,
          interest: split.interest,
          principal: split.principal,
          balance: m(principalOf(sim)),
          status: pend.due < today ? 'overdue' : open && pend.k === open.k ? 'due' : 'future',
        },
        pend.k,
      );
    }
    advanceTo(sim, addDaysIso(at, 1));
  }
  onReclass = null;

  let next: DebtDue | null = null;
  let paidDue: DebtDue | null = null;
  if (odTotal > eps) {
    // Kechikkan bor — birinchi navbatda shu (bank kartani bloklagan)
    const oldest = st.overdueRecs.length ? st.overdueRecs[0].date : today;
    next = {
      k: open ? open.k : st.statements.length,
      date: oldest,
      amount: odTotal,
      interest: m(st.ovI + st.pen),
      principal: m(st.ovP),
      paid: 0,
      remaining: odTotal,
      daysLeft: dayDiff(today, oldest),
      status: 'overdue',
      final: false,
      explain: { base: m(st.ovP), days: 0, dayCount: 'act365', annualRate: rate },
    };
  } else if (open && open.minimum - open.paid > eps) next = toDue(open, m(open.minimum - open.paid), false, st);
  else next = firstEstimate;
  if (open && open.minimum > eps && open.paid >= open.minimum - eps) paidDue = toDue(open, 0, false, st);

  const overdue =
    odTotal > eps
      ? {
          count: Math.max(1, st.overdueRecs.length),
          amount: odTotal,
          days: Math.max(0, dayDiff(st.overdueRecs.length ? st.overdueRecs[0].date : today, today)),
        }
      : null;

  const paidOff = debtOf(sim) <= eps;
  const payoffDate = P + st.billed + ubNow + st.pen <= eps ? null : paidOff && rows.length ? maxIso(rows[rows.length - 1].date, today) : null;
  const interestLeft = paidOff ? m(rows.reduce((a, r) => a + r.interest, 0)) : null;
  const horizon = addDaysIso(today, DEBT_LIMITS.horizonDays);
  const soonRows = rows.filter((r) => r.date <= horizon && r.payment > eps);
  const sumKind = (k: CardBucket['kind']) => st.buckets.reduce((a, b) => a + (b.kind === k ? b.principal : 0), 0);
  const graceDebt = sumKind('grace');
  const lostDebt = sumKind('lost');
  const cashDebt = m(sumKind('cash'));
  const accrued = m(st.billed + ubNow + st.pen);
  const nextStmt = open ? statementAfter(open.date, sDay) : statementAfter(st.lastStmt, sDay);
  /**
   * TBC 5.7.3: shu ko'chirmadan boshlab xarid foizi yana kechiriladi — kechikish tugagan kun (ochiq bo'lsa — bugun
   * yopiladi deb) ko'chirmadan 2 davr oldingi sanadan oshmasa (hisobdagi noWaiver sinovi bilan bir xil)
   */
  const waiverStart = (() => {
    if (!rules.noGraceAfterOverdue || !st.overdueSpans.length) return null;
    const end = st.overdueSpans.some((sp) => sp.to == null)
      ? today
      : st.overdueSpans.reduce((a, sp) => (sp.to != null && sp.to > a ? sp.to : a), '');
    let S = statementAfter(end, sDay);
    for (let i = 0; i < 12 && statementMonthsBefore(S, 2, sDay) < end; i += 1) S = statementAfter(S, sDay);
    return S;
  })();
  // Ochiq va keyingi ko'chirma ham undan keyin bo'lsa — cheklov yo'q
  const waiverFrom = waiverStart != null && ((open != null && open.date < waiverStart) || nextStmt < waiverStart) ? waiverStart : null;
  // Bugun to'liq yopilsa ham 5.7.3 bo'yicha qo'shiladigan xarid foizi: ochiq ko'chirmaniki (noWaiver) va
  // waiverFrom gacha keladigan ko'chirmalarga tushadigan xaridlarniki (to'lov kuni / ko'chirma kuni bank yechadi)
  const curEnd = open ? open.date : st.lastStmt;
  const forfeited = m(
    (open && open.noWaiver ? riskFor(st, open.date) : 0) +
      (waiverStart
        ? st.buckets.reduce((a, b) => a + (b.kind === 'grace' && b.period > curEnd && b.period < waiverStart ? b.bg : 0), 0)
        : 0),
  );
  const graceInfo =
    open && open.balance > eps
      ? (() => {
          const lost = open.noWaiver;
          // Ko'chirmada foizsiz qoladigan narsa yo'q (faqat naqd/o'tkazma yoki eski foizli qarz) — "bajarildi" emas
          const none = !lost && !open.hadGrace;
          const left = none ? 0 : graceLeftFor(st, open);
          return {
            statementDate: open.date,
            due: open.due,
            balance: open.balance,
            left,
            // To'lov kunining yakunida qo'shiladigani (bugungacha yig'ilgani emas)
            risk: !none && (left > eps || lost) ? riskAtDue(st, open) : 0,
            state: lost ? ('lost' as const) : none ? ('none' as const) : ('open' as const),
          };
        })()
      : null;

  const calc: DebtCalc = {
    principal: P,
    accruedInterest: accrued,
    // O'z puli 5.7.3 foizini ham yopadi (to'lov kuni bank yechadi)
    payoff: m(Math.max(0, P + accrued + forfeited - st.credit)),
    monthlyInterest: m((lostDebt * rate + cashDebt * cashRate) / 1200),
    received: m(received),
    used: m(used),
    unused: null,
    freeLimit: blocked ? 0 : m(Math.max(0, limit - P) + st.credit),
    paid: m(paidTotal),
    interestPaid: m(interestPaid),
    overpaid: m(st.credit),
    monthlyPayment: next ? { amount: next.remaining, source: 'calculated' } : null,
    next,
    paidDue,
    overdue,
    payoffDate,
    interestLeft,
    progressPct: limit > 0 ? round(Math.min(100, (P / limit) * 100), 1) : 0,
    belowInterest: false,
    state: terms.archivedAt ? 'archived' : 'active',
    card: {
      graceRisk: m(st.buckets.reduce((a, b) => a + (b.kind === 'grace' ? b.bg : 0) + b.wbg, 0)),
      penalty: m(st.pen),
      cashDebt,
      purchaseDebt: m(P - cashDebt),
      grace: graceInfo,
      nextStatement: { date: nextStmt, due: dueOf(nextStmt) },
      graceMonthly: m((graceDebt * rate) / 1200),
      blocked,
      waiverFrom,
      blockedForGood,
    },
  };
  return {
    calc,
    schedule: rows,
    entries: results,
    soon: { amount: m(soonRows.reduce((a, r) => a + r.payment, 0)), count: soonRows.length },
  };
}

/** Faqat bugungi holat */
export const computeDebt = (terms: DebtTerms, entries: ReadonlyArray<DebtLedgerEntry>, today: string): DebtCalc =>
  analyzeDebt(terms, entries, today).calc;

/**
 * Avvaldan bor kredit: har oylik to'lov o'z vaqtida to'langan deb, bugungi qoldiq va
 * keyingi to'lov taxmini — shaklni to'ldirish uchun. Sotuvchi bank ilovasidagi bilan
 * solishtirib tuzatadi.
 */
export function estimateOldLoan(
  terms: DebtTerms,
  today: string,
): { balance: number; nextDueOn: string | null; remaining: number | null; monthlyPayment: number | null } | null {
  if (terms.repayment === 'lump' || terms.repayment === 'interest' || !terms.firstDueOn) return null;
  const cur = terms.currency;
  const m = (v: number) => debtMoney(v, cur);
  const plan = makePlan({ ...terms, openingBalance: null }, Math.max(0, terms.amount || 0));
  let P = Math.max(0, terms.amount || 0);
  let start = terms.startedOn;
  let k = 0;
  let nextDueOn: string | null = null;
  for (let guard = 0; guard < DEBT_LIMITS.projectionMonths; guard += 1) {
    const at = plan.dueAt(k + 1);
    if (!at) break;
    if (at.date >= today) {
      nextDueOn = at.date;
      break;
    }
    const I = m(interestFor(P, terms.annualRate, start, at.date, terms.dayCount));
    const amount = m(plan.amountFor(k + 1, P, I, at.final));
    P = Math.max(0, m(P - (amount - Math.min(I, amount))));
    k += 1;
    start = at.date;
    if (P <= epsOf(cur)) break;
  }
  return {
    balance: P,
    nextDueOn,
    remaining: plan.n != null ? Math.max(0, plan.n - k) : null,
    monthlyPayment: plan.A != null ? m(plan.A) : null,
  };
}

/** "Nimaga ishlatildi": turkum bo'yicha (kartada — kartadan ishlatilganlar) */
export function debtUsage(
  entries: ReadonlyArray<DebtLedgerEntry>,
  isCard: boolean,
): { category: string; amount: number; count: number }[] {
  const by = new Map<string, { category: string; amount: number; count: number }>();
  for (const e of entries) {
    if (!(e.kind === 'use' || (isCard && e.kind === 'draw'))) continue;
    const key = e.category || 'other';
    const row = by.get(key) ?? { category: key, amount: 0, count: 0 };
    row.amount += Math.max(0, e.amount || 0);
    row.count += 1;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

// ─────────────────────────── Ro'yxat va jamlar ───────────────────────────

export interface DebtSummary {
  id: string;
  kind: DebtKind;
  lender: string;
  title: string;
  note: string;
  /** Faqat kompaniya egasi ko'radi */
  ownerOnly: boolean;
  terms: DebtTerms;
  calc: DebtCalc;
  soon: { amount: number; count: number };
  lastUse: { date: string; amount: number; category: string; note: string } | null;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DebtEntryRow extends DebtEntryResult {
  id: string;
  kind: DebtEntryKind;
  date: string;
  amount: number;
  category: string;
  note: string;
  interest: number | null;
  createdAt: string;
  /** Tayyor karta, draw: xarid · o'tkazma · naqd (null — xarid yoki boshqa yozuv) */
  channel: DebtChannel | null;
  /** Tayyor karta, draw: bank komissiyasi */
  fee: number | null;
}

export interface DebtDetail extends DebtSummary {
  /** Yangisi birinchi */
  entries: DebtEntryRow[];
  schedule: DebtScheduleRow[];
  usage: { category: string; amount: number; count: number }[];
  canEdit: boolean;
  isOwner: boolean;
  today: string;
}

export interface DebtCurrencyTotals {
  currency: DebtCurrency;
  count: number;
  principal: number;
  accruedInterest: number;
  monthlyInterest: number;
  dueSoon: number;
  dueSoonCount: number;
  overdue: number;
  overdueCount: number;
  unused: number;
  freeLimit: number;
}

export interface DebtTotals {
  byCurrency: DebtCurrencyTotals[];
  /** Hamma faol qarz so'mda (dollar — Markaziy bank kursi bilan); kurs olinmagan bo'lsa null */
  uzsTotal: number | null;
  /** Eng shoshilinch to'lov */
  next: { debtId: string; lender: string; currency: DebtCurrency; due: DebtDue } | null;
  counts: { active: number; paid: number; archived: number };
}

export interface DebtListResponse {
  today: string;
  items: DebtSummary[];
  totals: DebtTotals;
  /** Faqat ishlatilgan valyutalar; source 'fallback' — jonli kurs olinmagan */
  rates: Partial<Record<DebtCurrency, { rate: number; source: string; updatedAt: string | null }>>;
  canEdit: boolean;
  isOwner: boolean;
}

const URGENCY: Record<DebtDueStatus, number> = { overdue: 0, today: 1, soon: 2, upcoming: 3 };

/** Ro'yxat tartibi: kechikkan → bugun → yaqin → sana bo'yicha → sanasiz; arxiv va yopilganlar oxirida */
export function compareDebts(a: DebtSummary, b: DebtSummary): number {
  const rank = (s: DebtSummary) => (s.calc.state === 'archived' ? 2 : s.calc.state === 'paid' ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const an = a.calc.next;
  const bn = b.calc.next;
  if (an && bn) {
    if (URGENCY[an.status] !== URGENCY[bn.status]) return URGENCY[an.status] - URGENCY[bn.status];
    if (an.date !== bn.date) return an.date < bn.date ? -1 : 1;
  } else if (an || bn) return an ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function debtTotals(
  items: ReadonlyArray<DebtSummary>,
  rates: Partial<Record<DebtCurrency, { rate: number; source: string }>>,
): DebtTotals {
  const by = new Map<DebtCurrency, DebtCurrencyTotals>();
  const counts = { active: 0, paid: 0, archived: 0 };
  let next: DebtTotals['next'] = null;
  for (const it of items) {
    counts[it.calc.state] += 1;
    if (it.calc.state !== 'active') continue;
    const c = it.terms.currency;
    const t = by.get(c) ?? {
      currency: c,
      count: 0,
      principal: 0,
      accruedInterest: 0,
      monthlyInterest: 0,
      dueSoon: 0,
      dueSoonCount: 0,
      overdue: 0,
      overdueCount: 0,
      unused: 0,
      freeLimit: 0,
    };
    t.count += 1;
    t.principal += it.calc.principal;
    t.accruedInterest += it.calc.accruedInterest;
    t.monthlyInterest += it.calc.monthlyInterest;
    t.dueSoon += it.soon.amount;
    t.dueSoonCount += it.soon.count;
    t.overdue += it.calc.overdue?.amount ?? 0;
    t.overdueCount += it.calc.overdue?.count ?? 0;
    t.unused += it.calc.unused ?? 0;
    t.freeLimit += it.calc.freeLimit ?? 0;
    by.set(c, t);
    const due = it.calc.next;
    if (due) {
      const better =
        !next ||
        URGENCY[due.status] < URGENCY[next.due.status] ||
        (URGENCY[due.status] === URGENCY[next.due.status] && due.date < next.due.date);
      if (better) next = { debtId: it.id, lender: it.lender, currency: c, due };
    }
  }
  const byCurrency = [...by.values()]
    .map((t) => ({
      ...t,
      principal: debtMoney(t.principal, t.currency),
      accruedInterest: debtMoney(t.accruedInterest, t.currency),
      monthlyInterest: debtMoney(t.monthlyInterest, t.currency),
      dueSoon: debtMoney(t.dueSoon, t.currency),
      overdue: debtMoney(t.overdue, t.currency),
      unused: debtMoney(t.unused, t.currency),
      freeLimit: debtMoney(t.freeLimit, t.currency),
    }))
    .sort((a, b) => (a.currency === 'UZS' ? -1 : b.currency === 'UZS' ? 1 : a.currency.localeCompare(b.currency)));

  // So'mdagi jami: dollar faqat jonli kurs bilan qo'shiladi (eskirgan zaxira kurs bilan emas)
  let uzsTotal: number | null = 0;
  for (const t of byCurrency) {
    if (t.currency === 'UZS') uzsTotal = (uzsTotal ?? 0) + t.principal;
    else {
      const r = rates[t.currency];
      if (!r || r.source === 'fallback' || !(r.rate > 0)) {
        uzsTotal = null;
        break;
      }
      uzsTotal = (uzsTotal ?? 0) + t.principal * r.rate;
    }
  }
  return { byCurrency, uzsTotal: uzsTotal == null ? null : Math.round(uzsTotal), next, counts };
}

/** Qarz valyutasidagi summa: "1 250 000 so‘m", "5 000 $" (en: "$5,000") */
export function formatDebtMoney(value: number, currency: DebtCurrency, lang: Lang = 'uz'): string {
  if (currency === 'UZS') return formatMoney(value, lang, 'UZS');
  const cents = Math.abs(value - Math.round(value)) >= 0.005;
  const num = formatNumber(value, lang, cents ? 2 : 0);
  return lang === 'en' ? `$${num}` : `${num} $`;
}
