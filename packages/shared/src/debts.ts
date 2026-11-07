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
}

export interface DebtScheduleRow {
  date: string;
  payment: number;
  interest: number;
  principal: number;
  /** To'lovdan keyingi asosiy qarz */
  balance: number;
  status: 'overdue' | 'due' | 'future';
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
