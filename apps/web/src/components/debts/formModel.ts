/**
 * Qarz shaklining mantig'i (React'siz): shakl holati, tur standartlari,
 * tekshiruv va server so'rovi. Shartlar serverdagi termsData (apps/api
 * routes/debts.ts) kabi yig'iladi — shakldagi oldindan ko'rish saqlangandan
 * keyingi raqamlar bilan aynan bir xil chiqsin. Oyna — DebtFormModal.tsx.
 */
import {
  DEBT_KIND_DEFAULTS,
  DEBT_LIMITS,
  addMonthsAnchored,
  estimateOldLoan,
  type DebtCurrency,
  type DebtDayCount,
  type DebtDetail,
  type DebtKind,
  type DebtMinBase,
  type DebtRepayment,
  type DebtTerms,
} from '@savdoiq/shared';
import type { TFunc } from '@/i18n';
import { isIsoDay, nextMonthDay, parseCount, parseDecimal } from './format';

export type MinMode = 'principal' | 'total' | 'interest';

export interface FormState {
  kind: DebtKind | null;
  lender: string;
  title: string;
  note: string;
  currency: DebtCurrency;
  /** Olingan summa; kartada — limit. null — bo'sh, NaN — noto'g'ri matn */
  amount: number | null;
  /** Odamdan qarzda "Foiz bor" */
  hasRate: boolean;
  /** Yillik foiz, % — haqiqiy qiymat; "oyiga" ko'rinishi undan hisoblanadi (oyiga 3% = 36) */
  annual: number;
  ratePer: 'month' | 'year';
  repayment: DebtRepayment;
  /** Muddat (oy); avvaldan bor qarzni tahrirlashda — qolgan to'lovlar */
  term: string;
  grace: string;
  /** Oylik to'lov: odamdan/nasiyada asosiy maydon, bankda — shartnomadagisi */
  monthly: number | null;
  startedOn: string;
  /** Birinchi (avvaldan bor qarzni tahrirlashda — keyingi) to'lov sanasi */
  firstDueOn: string;
  /** Qo'lda o'zgartirilmagan bo'lsa olingan sanadan bir oy keyinga ergashadi */
  firstDueTouched: boolean;
  /** Bir yo'la — qaytarish; "faqat foiz" — qaytarish; karta — limit tugashi */
  dueOn: string;
  noDue: boolean;
  dayCount: DebtDayCount;
  ownerOnly: boolean;
  /** Karta: hozirgi qarz (tahrirda — kuzatuv boshidagisi) */
  cardDebt: number | null;
  payDay: string;
  minMode: MinMode;
  minPct: string;
  /** Avvaldan bor qarzni tahrirlash: kuzatuv boshidagi asosiy qarz */
  opening: number | null;
  /** Avvaldan bor yangi qarz: qo'lda o'zgartirilgan raqamlar (undefined — taxmindan) */
  runBalance?: number | null;
  runNext?: string;
  runRemaining?: string;
  runMonthly?: number | null;
  more: boolean;
}

export type FieldKey =
  | 'lender'
  | 'amount'
  | 'rate'
  | 'term'
  | 'grace'
  | 'monthly'
  | 'startedOn'
  | 'firstDueOn'
  | 'dueOn'
  | 'cardDebt'
  | 'payDay'
  | 'minPct'
  | 'opening'
  | 'runBalance'
  | 'runNext'
  | 'runRemaining'
  | 'runMonthly';

export type Errors = Partial<Record<FieldKey, string>>;

/** Xatosi "Qo'shimcha" ichida turishi mumkin bo'lgan maydonlar — xato bo'lsa bo'lim ochiladi */
export const MORE_FIELDS: FieldKey[] = ['grace', 'monthly', 'dueOn', 'rate'];

/**
 * plain — oddiy yangi qarz; reveal — birinchi to'lov o'tib ketgan (avvaldan bor qarz,
 * hozirgi qoldiq so'raladi); stored — avvaldan bor qarzni tahrirlash (saqlangan raqamlar).
 */
export type SchedMode = 'plain' | 'reveal' | 'stored';

export interface Estimate {
  balance: number;
  nextDueOn: string | null;
  remaining: number | null;
  monthlyPayment: number | null;
}

export interface Built {
  errors: Errors;
  /** Hisobga xalal beradigan xato bor (nom xatosi oldindan ko'rishni to'xtatmaydi) */
  blocking: boolean;
  terms: DebtTerms;
  body: Record<string, unknown>;
  mode: SchedMode;
  /** Avvaldan bor yangi qarz maydonlarida ko'rinadigan qiymatlar (taxmin yoki qo'lda) */
  run: { balance: number | null; next: string; remaining: string; monthly: number | null; hasTerm: boolean } | null;
  /** Karta: birinchi (kuzatuvdagi) to'lov sanasi — serverga yuboriladi */
  cardFirstDue: string | null;
  /** Karta: bugundan keyingi eng yaqin to'lov sanasi — "Keyingisi" izohi uchun */
  cardNextDue: string | null;
}

export interface Ctx {
  today: string;
  /** Kuzatuv boshi: yangi qarzda bugun, tahrirda saqlangani (trackedFrom) */
  anchor: string;
  edit: DebtDetail | null;
  isOwner: boolean;
  t: TFunc;
  dateText: (iso: string) => string;
}

export const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** "Oyiga" yozilgan foiz qaytib ham aniq chiqadimi (36 → 3%, 25 → 2,0833% — yo'q) */
const isMonthlyRate = (annual: number): boolean => {
  const cents = (annual / 12) * 100;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
};

/** Karta to'lov kuni: saqlangani (31 — 30.11 ga tushgan bo'lsa ham 31), bo'lmasa birinchi sananing kuni */
const cardPayDay = (tm: DebtTerms): string =>
  tm.payDay != null ? String(tm.payDay) : tm.firstDueOn ? String(Number(tm.firstDueOn.slice(8, 10))) : '';

export function blank(kind: DebtKind | null, today: string, isOwner: boolean): FormState {
  const def = DEBT_KIND_DEFAULTS[kind ?? 'person'];
  return {
    kind,
    lender: '',
    title: '',
    note: '',
    currency: 'UZS',
    amount: null,
    hasRate: false,
    annual: 0,
    ratePer: kind === 'person' ? 'month' : 'year',
    repayment: def.repayment,
    term: '',
    grace: '',
    monthly: null,
    startedOn: today,
    firstDueOn: addMonthsAnchored(today, 1),
    firstDueTouched: false,
    dueOn: '',
    noDue: false,
    dayCount: def.dayCount,
    ownerOnly: isOwner,
    cardDebt: null,
    payDay: '',
    minMode: 'principal',
    minPct: String(DEBT_LIMITS.cardMinPct),
    opening: null,
    more: false,
  };
}

export function fromDebt(d: DebtDetail): FormState {
  const tm = d.terms;
  const stored = d.kind !== 'card' && tm.repayment !== 'lump' && tm.openingBalance !== null;
  return {
    kind: d.kind,
    lender: d.lender,
    title: d.title,
    note: d.note,
    currency: tm.currency,
    amount: tm.amount,
    hasRate: tm.annualRate > 0,
    annual: tm.annualRate,
    ratePer: d.kind === 'person' && (tm.annualRate === 0 || isMonthlyRate(tm.annualRate)) ? 'month' : 'year',
    repayment: tm.repayment,
    term: tm.termMonths !== null ? String(tm.termMonths) : '',
    grace: tm.graceMonths > 0 ? String(tm.graceMonths) : '',
    monthly: tm.monthlyPayment,
    startedOn: tm.startedOn,
    firstDueOn: tm.firstDueOn ?? addMonthsAnchored(tm.startedOn, 1),
    firstDueTouched: true,
    dueOn: tm.dueOn ?? '',
    noDue: tm.repayment === 'lump' && !tm.dueOn,
    dayCount: tm.dayCount,
    ownerOnly: d.ownerOnly,
    cardDebt: d.kind === 'card' ? (tm.openingBalance ?? 0) : null,
    payDay: d.kind === 'card' ? cardPayDay(tm) : '',
    minMode: tm.minPct > 0 ? (tm.minBase === 'total' ? 'total' : 'principal') : 'interest',
    minPct: String(tm.minPct > 0 ? tm.minPct : DEBT_LIMITS.cardMinPct),
    opening: stored ? tm.openingBalance : null,
    more: false,
  };
}

/** "Har oy faqat foiz" o'tib ketgan qarz: asosiy qarz o'zgarmagan, keyingi foiz kuni — bugundan keyingisi */
function interestEstimate(firstDueOn: string, dueOn: string | null, amount: number, anchor: string): Estimate {
  let k = 0;
  let next = firstDueOn;
  while (next < anchor && k < DEBT_LIMITS.projectionMonths) {
    k += 1;
    next = addMonthsAnchored(firstDueOn, k);
  }
  return { balance: amount, nextDueOn: dueOn && next > dueOn ? dueOn : next, remaining: null, monthlyPayment: null };
}

/** Shakl → server so'rovi va oldindan ko'rish shartlari (apps/api routes/debts.ts termsData bilan bir xil) */
export function build(s: FormState, ctx: Ctx): Built {
  const { t } = ctx;
  const kind: DebtKind = s.kind ?? 'person';
  const isCard = kind === 'card';
  const e: Errors = {};
  const repayment: DebtRepayment = isCard
    ? 'interest'
    : kind === 'installment'
      ? 'equal'
      : kind === 'bank'
        ? s.repayment === 'decreasing'
          ? 'decreasing'
          : 'equal'
        : s.repayment === 'equal' || s.repayment === 'interest'
          ? s.repayment
          : 'lump';
  const monthlyKind = repayment !== 'lump';
  const termed = repayment === 'equal' || repayment === 'decreasing';

  const lender = s.lender.trim();
  if (!lender) e.lender = t(kind === 'bank' || kind === 'card' ? 'err.bank' : 'err.lender');

  const amount = s.amount;
  if (amount !== null && Number.isNaN(amount)) e.amount = t('err.number');
  else if (amount === null || !(amount > 0)) e.amount = t(isCard ? 'err.limit' : 'err.amount');
  else if (amount > DEBT_LIMITS.amountMax) e.amount = t('err.amountMax');

  const rateOn = kind !== 'person' || s.hasRate || repayment === 'interest';
  const annualRate = rateOn ? round6(s.annual) : 0;
  if (!(annualRate >= 0) || annualRate > DEBT_LIMITS.rateMax) e.rate = t('err.number');
  else if (kind === 'person' && repayment === 'interest' && !(annualRate > 0)) e.rate = t('err.rateNeeded');

  // ── Sanalar ──
  let startedOn = s.startedOn;
  let firstDueOn: string | null = null;
  let cardFirstDue: string | null = null;
  let cardNextDue: string | null = null;
  /** Karta to'lov kuni 1–31; 29–31 qisqa oyda oy oxiriga tushadi, keyingi oyda yana o'sha kun */
  let cardDay: number | null = null;
  /** Tahrirda karta to'lov kuni saqlanganidan boshqa */
  let cardDayChanged = false;
  if (isCard) {
    const day = parseCount(s.payDay);
    if (day === null || Number.isNaN(day) || day < 1 || day > 31) e.payDay = t('err.payDay');
    else {
      cardDay = day;
      // Tahrirda kun o'zgarmagan bo'lsa — saqlangan sana (o'tgan davrlar o'z joyida qoladi).
      // O'zgarsa — kuzatuv boshidan birinchi shu kun, bugundan emas: aks holda o'tgan davrlar
      // yo'qolib, yozilgan to'lovlar hech qaysi to'lovni yopmay qoladi va foiz kamayib ketadi
      const stored = ctx.edit?.terms.firstDueOn ?? null;
      const storedDay = ctx.edit ? cardPayDay(ctx.edit.terms) : '';
      cardDayChanged = !(stored && storedDay === String(day));
      cardFirstDue = stored && !cardDayChanged ? stored : nextMonthDay(ctx.edit ? ctx.anchor : ctx.today, day);
      firstDueOn = cardFirstDue;
      // "Keyingisi" — bugun yoki undan keyingi eng yaqin to'lov (saqlangan sana o'tib ketgan bo'lishi mumkin)
      let next = cardFirstDue;
      for (let k = 1; next < ctx.today && k <= DEBT_LIMITS.projectionMonths; k += 1) next = addMonthsAnchored(cardFirstDue, k, day);
      cardNextDue = next;
    }
    // Yangi karta joriy davr boshidan (oxirgi to'lov kunidan) kuzatiladi — birinchi minimal to'lov foizi bank kabi to'liq davrga
    if (!ctx.edit) {
      const prev = cardFirstDue ? addMonthsAnchored(cardFirstDue, -1, cardDay) : ctx.today;
      startedOn = prev < ctx.today ? prev : ctx.today;
    } else if (cardDayChanged && cardFirstDue && cardDay !== null && isIsoDay(startedOn)) {
      // Kun o'zgarsa ham birinchi davr to'liq oy (yangi kundan bir oy oldin boshlanadi). Ilgari eski boshlanish
      // qolib, davr qisqarardi: 6 → 8 da birinchi minimal to'lov 2 kunlik foiz bilan 238 356 so'm kam chiqardi.
      // Faqat oldinga suriladi — yozuvlar "boshlanishdan oldin" bo'lib qolmaydi
      const prev = addMonthsAnchored(cardFirstDue, -1, cardDay);
      if (prev < startedOn) startedOn = prev;
    }
  }
  if (!isIsoDay(startedOn)) e.startedOn = t('err.date');
  else if (startedOn > ctx.today) e.startedOn = t('err.startedFuture');
  const startOk = isIsoDay(startedOn);

  if (!isCard && monthlyKind) {
    if (!isIsoDay(s.firstDueOn)) e.firstDueOn = t('err.firstDue');
    else if (startOk && s.firstDueOn < startedOn) e.firstDueOn = t('err.firstDueBefore');
    else firstDueOn = s.firstDueOn;
  }

  let dueOn: string | null = null;
  if (repayment === 'lump') {
    if (!s.noDue) {
      if (!isIsoDay(s.dueOn)) e.dueOn = t('err.dueOnNeeded');
      else if (startOk && s.dueOn <= startedOn) e.dueOn = t('err.dueOn');
      else dueOn = s.dueOn;
    }
  } else if (repayment === 'interest' && s.dueOn) {
    if (!isIsoDay(s.dueOn)) e.dueOn = t('err.date');
    else if (startOk && s.dueOn <= startedOn) e.dueOn = t('err.dueOn');
    else dueOn = s.dueOn;
  }

  // ── Muddat va oylik to'lov ──
  let termMonths: number | null = null;
  let graceMonths = 0;
  let monthlyPayment: number | null = null;
  if (termed) {
    const n = parseCount(s.term);
    if (n !== null && (Number.isNaN(n) || n < 1 || n > DEBT_LIMITS.termMax)) e.term = t('err.termRange', { max: DEBT_LIMITS.termMax });
    else termMonths = n;
    if (repayment === 'equal') {
      if (s.monthly !== null && Number.isNaN(s.monthly)) e.monthly = t('err.number');
      else if (s.monthly !== null && s.monthly > DEBT_LIMITS.amountMax) e.monthly = t('err.amountMax');
      else if (s.monthly !== null && s.monthly > 0) monthlyPayment = s.monthly;
      if (termMonths === null && monthlyPayment === null && !e.term && !e.monthly) e.term = t('err.term');
    } else if (termMonths === null && !e.term) e.term = t('err.termDec');
    const g = parseCount(s.grace);
    if (g !== null && (Number.isNaN(g) || g > DEBT_LIMITS.graceMax)) e.grace = t('err.graceRange', { max: DEBT_LIMITS.graceMax });
    else graceMonths = g ?? 0;
    if (!e.grace && termMonths !== null && graceMonths >= termMonths) e.grace = t('err.grace');
  }

  // ── Karta ──
  let minPct = 0;
  let minBase: DebtMinBase = 'principal';
  let openingBalance: number | null = null;
  if (isCard) {
    const debt = s.cardDebt ?? 0;
    if (Number.isNaN(debt)) e.cardDebt = t('err.number');
    else if (amount !== null && amount > 0 && debt > amount) e.cardDebt = t('err.cardDebt');
    else openingBalance = debt;
    if (s.minMode !== 'interest') {
      const p = parseDecimal(s.minPct);
      if (p === null || Number.isNaN(p) || !(p > 0) || p > 100) e.minPct = t('err.minPct');
      else minPct = p;
      minBase = s.minMode === 'total' ? 'total' : 'principal';
    }
  }

  // ── Avvaldan bor qarz ──
  let mode: SchedMode = 'plain';
  let run: Built['run'] = null;
  /**
   * Avvaldan bor kreditning to'lov kuni, keyingi sana qisqa oyning oxiriga tushganda (31 → 30.11): saqlanmasa
   * keyingi oylar 30-ga surilib, 31-dagi to'lov har uzun oyda "1 kun kechikdi" chiqardi
   */
  let loanDay: number | null = null;
  if (!isCard && monthlyKind) {
    if (ctx.edit && ctx.edit.terms.openingBalance !== null) {
      mode = 'stored';
      // Tahrirda — kuzatuv boshidagi qoldiq ("hozirgi" emas)
      if (s.opening === null || Number.isNaN(s.opening)) e.opening = t('err.runBalanceStored');
      else if (s.opening > DEBT_LIMITS.amountMax) e.opening = t('err.amountMax');
      else openingBalance = s.opening;
      if (firstDueOn && firstDueOn < ctx.anchor) {
        e.firstDueOn = t('err.runNext', { date: ctx.dateText(ctx.anchor) });
        firstDueOn = null;
      }
      // Sana o'zgarmasa saqlangan kun ham qoladi. Sana qisqa oyning oxiriga o'zgartirilsa (31.12 → 30.11) —
      // saqlangan (yoki eski sananing) 29–31 kuni qoladi: 30.11, 31.12, 31.01. Boshqa sanada — o'z kuni
      if (firstDueOn) {
        const sp = ctx.edit.terms;
        const sd = sp.payDay ?? (sp.firstDueOn ? Number(sp.firstDueOn.slice(8, 10)) : null);
        if (firstDueOn === sp.firstDueOn) loanDay = sp.payDay ?? null;
        else if (sd !== null && sd > Number(firstDueOn.slice(8, 10)) && addMonthsAnchored(firstDueOn, 0, 31) === firstDueOn)
          loanDay = sd;
      }
    } else if (firstDueOn && firstDueOn < ctx.anchor) {
      mode = 'reveal';
      const inputsOk = !e.amount && !e.term && !e.monthly && !e.grace && !e.rate && startOk;
      const original: DebtTerms = {
        kind,
        currency: s.currency,
        amount: amount ?? 0,
        annualRate,
        dayCount: s.dayCount,
        repayment,
        termMonths,
        graceMonths,
        startedOn,
        firstDueOn,
        dueOn,
        minPct: 0,
        minBase,
        monthlyPayment,
        openingBalance: null,
        trackedFrom: ctx.anchor,
      };
      const est: Estimate | null = !inputsOk
        ? null
        : repayment === 'interest'
          ? interestEstimate(firstDueOn, dueOn, amount ?? 0, ctx.anchor)
          : estimateOldLoan(original, ctx.anchor);
      const hasTerm = termed && termMonths !== null;
      run = {
        balance: s.runBalance !== undefined ? s.runBalance : (est?.balance ?? null),
        next: s.runNext !== undefined ? s.runNext : (est?.nextDueOn ?? ''),
        remaining: s.runRemaining !== undefined ? s.runRemaining : est?.remaining != null ? String(est.remaining) : '',
        monthly: s.runMonthly !== undefined ? s.runMonthly : (est?.monthlyPayment ?? null),
        hasTerm,
      };
      if (run.balance === null || Number.isNaN(run.balance)) e.runBalance = t(ctx.edit ? 'err.runBalanceStored' : 'err.runBalance');
      else if (run.balance > DEBT_LIMITS.amountMax) e.runBalance = t('err.amountMax');
      else openingBalance = run.balance;
      if (!isIsoDay(run.next)) {
        e.runNext = t('err.firstDue');
        firstDueOn = null;
      } else if (run.next < ctx.anchor) {
        e.runNext = t('err.runNext', { date: ctx.dateText(ctx.anchor) });
        firstDueOn = null;
      } else {
        firstDueOn = run.next;
        // Asl kun (29–31) keyingi sanada oy oxiriga qisqargan bo'lsa — asl kun saqlanadi (30.11 → 31.12, 31.01)
        const od = Number(s.firstDueOn.slice(8, 10));
        if (od > Number(run.next.slice(8, 10)) && addMonthsAnchored(run.next, 0, 31) === run.next) loanDay = od;
      }
      if (hasTerm && termMonths !== null) {
        const rem = parseCount(run.remaining);
        if (rem === null || Number.isNaN(rem) || rem < 1 || rem > DEBT_LIMITS.termMax) e.runRemaining = t('err.runRemaining');
        else {
          // O'tgan oylar imtiyozli davrdan ayriladi; grace < muddat bo'lgani uchun natija doim qolgan to'lovlardan kam
          graceMonths = Math.max(0, graceMonths - Math.max(0, termMonths - rem));
          termMonths = rem;
        }
      } else if (termed && graceMonths > 0 && isIsoDay(run.next)) {
        /*
         * Muddatsiz annuitet: keyingi to'lovdan oldingi oylar ham imtiyozli davrdan ayriladi. Ilgari imtiyoz
         * o'zgarmay ketardi va hisob uni yangi firstDueOn dan qayta boshlardi — 9 oy oldin olingan 3 oy imtiyozli
         * kreditda keyingi 3 to'lov faqat foiz chiqardi. Asl birinchi to'lov (s.firstDueOn) yuqorida tekshirilgan
         */
        let k = 0;
        while (k < DEBT_LIMITS.projectionMonths && addMonthsAnchored(s.firstDueOn, k) < run.next) k += 1;
        graceMonths = Math.max(0, graceMonths - k);
      }
      if (repayment === 'equal') {
        if (run.monthly !== null && Number.isNaN(run.monthly)) e.runMonthly = t('err.number');
        else if (run.monthly !== null && run.monthly > DEBT_LIMITS.amountMax) e.runMonthly = t('err.amountMax');
        else if (run.monthly !== null && run.monthly > 0) monthlyPayment = run.monthly;
        else if (termMonths === null) e.runMonthly = t('err.term');
        else monthlyPayment = null;
      }
    }
  }

  const terms: DebtTerms = {
    kind,
    currency: s.currency,
    amount: amount !== null && amount > 0 ? amount : 0,
    annualRate: e.rate ? 0 : annualRate,
    dayCount: s.dayCount,
    repayment,
    termMonths: termed ? termMonths : null,
    graceMonths: termed ? graceMonths : 0,
    startedOn: startOk ? startedOn : ctx.today,
    firstDueOn: monthlyKind ? firstDueOn : null,
    // Kartada — tanlangan kun; avvaldan bor kreditda — qisqa oyga tushgan asl kun; qolganlarida birinchi sananing kuni
    payDay: monthlyKind && firstDueOn ? (isCard ? cardDay : loanDay) : null,
    dueOn: repayment === 'lump' || repayment === 'interest' ? dueOn : null,
    minPct: repayment === 'interest' ? minPct : 0,
    minBase,
    monthlyPayment: repayment === 'equal' ? monthlyPayment : null,
    openingBalance,
    trackedFrom: ctx.anchor,
    archivedAt: ctx.edit?.terms.archivedAt ?? null,
  };

  const body: Record<string, unknown> = {
    kind,
    lender,
    title: s.title.trim(),
    currency: s.currency,
    amount: terms.amount,
    annualRate: terms.annualRate,
    dayCount: s.dayCount,
    repayment,
    termMonths: terms.termMonths,
    graceMonths: terms.graceMonths,
    startedOn: terms.startedOn,
    firstDueOn: terms.firstDueOn,
    payDay: terms.payDay ?? null,
    dueOn: terms.dueOn,
    minPct: terms.minPct,
    minBase,
    monthlyPayment: terms.monthlyPayment,
    openingBalance,
    note: s.note.trim(),
  };
  // "Faqat men ko'raman"ni faqat ega o'zgartiradi — boshqalar yubormaydi (server 403 bermasin)
  if (ctx.isOwner) body.ownerOnly = s.ownerOnly;

  const blocking = (Object.keys(e) as FieldKey[]).some((k) => k !== 'lender');
  return { errors: e, blocking, terms, body, mode, run, cardFirstDue, cardNextDue };
}

/** Pul shartlari — tahrirda o'zgarsa "butun tarix qayta hisoblanadi" ogohlantirishi */
export const moneyKey = (x: DebtTerms): string =>
  JSON.stringify([
    x.currency,
    x.amount,
    round6(x.annualRate),
    x.dayCount,
    x.repayment,
    x.termMonths,
    x.graceMonths,
    x.startedOn,
    x.firstDueOn,
    // Amaldagi kun: saqlanmagan (null) kun birinchi sananing kuni — bir xil jadval, ogohlantirish chiqmasin
    x.payDay ?? (x.firstDueOn ? Number(x.firstDueOn.slice(8, 10)) : null),
    x.dueOn,
    x.minPct,
    x.minBase,
    x.monthlyPayment,
    x.openingBalance,
  ]);
