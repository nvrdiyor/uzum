/**
 * Qarz shaklining mantig'i (React'siz): shakl holati, tur standartlari,
 * tekshiruv va server so'rovi. Shartlar serverdagi termsData (apps/api
 * routes/debts.ts) kabi yig'iladi — shakldagi oldindan ko'rish saqlangandan
 * keyingi raqamlar bilan aynan bir xil chiqsin. Oyna — DebtFormModal.tsx.
 *
 * Tayyor kartalar (TBC Osmon, Infin Black) — alohida yo'l (buildProduct): bank
 * qoidalari CARD_PRODUCTS da, sotuvchi faqat ilovadagi raqamlarni yozadi (Infin'da —
 * ilovaning o'z so'zlari bilan: «Foizsiz davr to‘lovi», «To‘liq so‘ndirish summasi»).
 * "Boshqa karta" umumiy karta hisobida qoladi — o'sha yo'l o'zgarmagan.
 */
import {
  CARD_PRODUCTS,
  DEBT_KIND_DEFAULTS,
  DEBT_LIMITS,
  addMonthsAnchored,
  dayDiff,
  estimateOldLoan,
  isCardProduct,
  type DebtCardProduct,
  type DebtCurrency,
  type DebtDayCount,
  type DebtDetail,
  type DebtKind,
  type DebtMinBase,
  type DebtRepayment,
  type DebtTerms,
} from '@savdoiq/shared';
import type { TFunc } from '@/i18n';
import {
  addDays,
  isIsoDay,
  isMonthEnd,
  leftInline,
  nextMonthDay,
  parseCount,
  parseDecimal,
  stmtAfter,
  stmtDue,
  stmtOnOrBefore,
} from './format';

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
  /** Karta: hozirgi qarz (tahrirda — kuzatuv boshidagisi; Infin ilovasida «To‘liq so‘ndirish summasi») */
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
  /** Kredit karta: tayyor karta yoki 'other' (umumiy hisob); null — hali tanlanmagan (faqat yangi kartada) */
  cardProduct: DebtCardProduct | 'other' | null;
  /** TBC: ilovadagi oxirgi ko'chirmaning to'lov sanasi (o'tgan yoki kelgusi) — ko'chirma kuni shundan */
  lastDue: string;
  /** TBC: ko'chirma kuni (28–31) — to'lov sanasidan 24 kun oldin oy oxiriga tushsa; '' — o'sha kun */
  stmtDay: string;
  /**
   * Ochiq ko'chirma: to'lov kunigacha to'lash kerak (null — hozirgi qarz). Infin'da — ilovadagi «Foizsiz davr to‘lovi»:
   * 0 — foizsiz qism yo'q (qarz foizli aylanadi), serverga butun qarz va openingRevolving yuboriladi
   */
  billed: number | null;
  /** Ochiq ko'chirma: ilovadagi minimal to'lov; minTouched bo'lmaguncha ko'rinadigani — taxmin */
  minLeft: number | null;
  minTouched: boolean;
  /**
   * Qarz oyma-oy to'liq yopilmaydi — boshlang'ich qarz foizli. TBC — savol; Infin'da ochiq ko'chirmada savol yo'q
   * («Foizsiz davr to‘lovi» 0 bo'lsa — shu), to'lov kuni o'tgan bo'lsa — ilova so'zlari bilan savol
   */
  revolving: boolean;
  /** Ilovadagi muddati o'tgan summa */
  overdueNow: number | null;
  /** TBC: naqd va o'tkazma yillik foizi (null — xaridlar foizi bilan bir xil) */
  cashRate: number | null;
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
  | 'runMonthly'
  | 'cashRate'
  | 'lastDue'
  | 'stmtDay'
  | 'billed'
  | 'minLeft'
  | 'overdueNow';

export type Errors = Partial<Record<FieldKey, string>>;

/** Xatosi "Qo'shimcha" ichida turishi mumkin bo'lgan maydonlar — xato bo'lsa bo'lim ochiladi */
export const MORE_FIELDS: FieldKey[] = ['grace', 'monthly', 'dueOn', 'rate'];
/** Tayyor kartada "Qo'shimcha" ichida — faqat muddati o'tgan summa (foiz asosiy maydonlarda) */
export const PRODUCT_MORE_FIELDS: FieldKey[] = ['overdueNow'];

/** TBC: oxirgi ko'chirmaning to'lov sanasi bugundan shuncha kungacha (o'tgan yoki kelgusi) */
export const LAST_DUE_WINDOW = 40;

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
  /**
   * Saqlashga to'sqinlik qilmaydigan ogohlantirishlar (maydon izohi o'rnida). Tayyor karta: qarz limitdan katta —
   * bank texnik overdraft beradi yoki limitni kamaytirgan, bo'sh limit 0 (ilgari xato edi, saqlab bo'lmasdi)
   */
  hints: Partial<Record<FieldKey, string>>;
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
  /** Tayyor karta: kuzatuv boshida ko'chirma ochiq (to'lov kuni kelmagan) — "to'lash kerak" va minimal so'raladi */
  pending: boolean;
  /** Tayyor karta: izoh — keyingi to'lov sanasi va ko'chirma kuni */
  cardDueText: string | null;
  /** TBC: to'lov sanasidan 24 kun oldin oy oxiri (28–30) — ko'chirma kuni so'raladi */
  stmtAmbiguous: boolean;
  /** TBC: ko'chirma kuni variantlari (o'sha oy oxiridan 31 gacha) */
  stmtDays: number[];
  /** Ochiq ko'chirma maydonlarida ko'rinadigan qiymatlar (taxmin yoki qo'lda) va to'lov kuni */
  stmt: { billed: number | null; min: number | null; due: string } | null;
  /** Tayyor karta: kuzatuv boshidagi ko'chirmaning to'lov kuni (ochiq bo'lmasa ham) — Infin savolidagi sana */
  openingDue: string | null;
  /**
   * Tayyor karta: "qarz foizli aylanadimi" savoli — 'tbc' (TBC, qarz bo'lsa; avvalgidek), 'infin' (Infin, kuzatuv
   * boshidagi ko'chirmaning to'lov kuni o'tgan — «Foizsiz davr to‘lovi» maydoni yo'q, ilova so'zlari bilan so'raladi), null — yo'q
   */
  revolvingAsk: 'tbc' | 'infin' | null;
}

/** Shakldagi tayyor karta (yoki null — umumiy karta, boshqa tur) */
export const productOf = (s: Pick<FormState, 'kind' | 'cardProduct'>): DebtCardProduct | null =>
  s.kind === 'card' && isCardProduct(s.cardProduct) ? s.cardProduct : null;

/** TBC tahrirda: ochiq ko'chirmaning (bo'lmasa keyingisining) to'lov kuni */
const productLastDue = (d: DebtDetail): string =>
  d.calc.card?.grace?.due ?? d.calc.card?.nextStatement.due ?? d.terms.firstDueOn ?? '';

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
    cardProduct: null,
    lastDue: '',
    stmtDay: '',
    billed: null,
    minLeft: null,
    minTouched: false,
    revolving: false,
    overdueNow: null,
    cashRate: null,
  };
}

export function fromDebt(d: DebtDetail): FormState {
  const tm = d.terms;
  const stored = d.kind !== 'card' && tm.repayment !== 'lump' && tm.openingBalance !== null;
  const product = d.kind === 'card' && isCardProduct(tm.cardProduct) ? tm.cardProduct : null;
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
    // Tahrirda tur tanlanmaydi: saqlangan tayyor karta yoki boshqa karta
    cardProduct: d.kind === 'card' ? (product ?? 'other') : null,
    lastDue: product === 'tbc-osmon' ? productLastDue(d) : '',
    // Saqlangan kun (31 — 30.11 ga tushgan ko'chirmada ham 31)
    stmtDay: tm.statementDay != null ? String(tm.statementDay) : '',
    // Boshlang'ich raqamlar tahrirda ham tuzatiladi (kuzatuv boshidagi qiymatlar). Ilgari faqat ko'rsatilardi — egasi
    // Infin'ni "qisman to'layman" deb saqlab, foizsiz davrni tuzatolmadi (faqat o'chirib qayta qo'shish). Infin'da foizli
    // aylanuvchi qarz — «Foizsiz davr to‘lovi» 0 (shakl shundan openingRevolving ni qayta yasaydi)
    billed: product === 'infin-black' && tm.openingRevolving === true ? 0 : (tm.openingBilled ?? null),
    minLeft: tm.openingMin ?? null,
    minTouched: tm.openingMin != null,
    revolving: tm.openingRevolving === true,
    overdueNow: tm.openingOverdue ?? null,
    cashRate: tm.cashRate ?? null,
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
  const product = productOf(s);
  if (product) return buildProduct(s, ctx, product);
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
  return {
    errors: e,
    hints: {},
    blocking,
    terms,
    body,
    mode,
    run,
    cardFirstDue,
    cardNextDue,
    pending: false,
    cardDueText: null,
    stmtAmbiguous: false,
    stmtDays: [],
    stmt: null,
    openingDue: null,
    revolvingAsk: null,
  };
}

/**
 * Tayyor karta: serverdagi termsData kabi — so'm, kunlik/365, "har oy foiz", minimal "N% asosiy qarz + foiz";
 * Infin'da ko'chirma 1-sanada va minimal 5% (hammaga bir xil), TBC'da ko'chirma kuni va minimal % — mijozniki.
 * Hisob (analyzeProductCard) firstDueOn va payDay ni ishlatmaydi: firstDueOn faqat sxema uchun — keyingi to'lov kuni.
 * Boshlang'ich holat (qarz, ochiq ko'chirma, TBC savoli, muddati o'tgan) yangi kartada ham, tahrirda ham bir xil
 * maydonlar (2026-11-08). Tahrirda raqamlar kuzatuv boshidagi (trackedFrom o'zgarmaydi), saqlanganidan to'ldiriladi;
 * ilgari faqat ko'rsatilardi va xato kiritilgan karta faqat o'chirib qayta qo'shib tuzatilardi. Qiymat amalda
 * o'zgarmagan bo'lsa (null va 0, null va butun qarz — hisobda bir xil) saqlangani qaytadi: server "o'zgarish" yozmasin.
 * Infin ilovasining so'zlari: «Foizsiz davr to‘lovi» > 0 — shuncha to'lansa foiz yo'q (qolgani shu oy xaridlari);
 * 0 — foizsiz qism yo'q: qarz foizli aylanadi (openingRevolving), ko'chirmada butun qarz. Infin'da "to'liq yopib
 * borasizmi" savoli faqat kuzatuv boshidagi ko'chirmaning to'lov kuni o'tgan bo'lsa (maydon yo'q) — ilova so'zlari bilan.
 * Qarz limitdan katta bo'lishi mumkin (texnik overdraft, limit kamaytirilgan) — xato emas, `hints` da ogohlantirish
 */
function buildProduct(s: FormState, ctx: Ctx, p: DebtCardProduct): Built {
  const { t, edit } = ctx;
  const rules = CARD_PRODUCTS[p];
  const isTbc = rules.statement === 'individual';
  const e: Errors = {};

  const amount = s.amount;
  if (amount !== null && Number.isNaN(amount)) e.amount = t('err.number');
  else if (amount === null || !(amount > 0)) e.amount = t('err.limit');
  else if (amount > DEBT_LIMITS.amountMax) e.amount = t('err.amountMax');

  // Foiz har mijozga skoring bo'yicha — oraliqdan tashqarisi xato emas (shartnoma eskiroq bo'lishi mumkin), faqat izoh
  const annualRate = round6(s.annual);
  if (!(annualRate >= 0) || annualRate > DEBT_LIMITS.rateMax) e.rate = t('err.number');
  else if (!(annualRate > 0)) e.rate = t('err.rateApp');

  let cashRate: number | null = null;
  if (rules.separateCashRate && s.cashRate !== null) {
    if (Number.isNaN(s.cashRate) || s.cashRate < 0 || s.cashRate > DEBT_LIMITS.rateMax) e.cashRate = t('err.number');
    else cashRate = round6(s.cashRate);
  }

  let minPct = rules.minPctDefault;
  if (rules.minPctEditable) {
    const v = parseDecimal(s.minPct);
    if (v === null || Number.isNaN(v) || !(v > 0) || v > 100) e.minPct = t('err.minPct');
    else minPct = v;
  }

  // ── Ko'chirma kuni: TBC — ilovadagi to'lov sanasidan 24 kun oldin; Infin — har oy 1-sana ──
  let statementDay = edit?.terms.statementDay ?? rules.statementDay ?? 1;
  const stmtDays: number[] = [];
  if (isTbc) {
    // Tahrirda o'zgartirilmagan sana tekshirilmaydi: keyingi ko'chirmaning to'lov kuni bugundan 55 kungacha uzoq bo'ladi
    const untouched = edit !== null && s.lastDue === productLastDue(edit);
    if (!isIsoDay(s.lastDue)) e.lastDue = t('err.lastDue');
    else if (!untouched && Math.abs(dayDiff(ctx.today, s.lastDue)) > LAST_DUE_WINDOW)
      e.lastDue = t('err.lastDueRange', { n: LAST_DUE_WINDOW });
    else {
      const S0 = addDays(s.lastDue, -rules.dueDays);
      statementDay = Number(S0.slice(8, 10));
      // 30.11 — bankning kuni 30 ham, 31 ham bo'lishi mumkin (oy oxiri qoidasi e'lon qilinmagan): so'raladi.
      // 30 deb olinsa, 31-kunli kartada keyingi to'lov 23.01 chiqadi (bankda 24.01) — 24.01 dagi to'lov "kechikkan" bo'lardi
      if (isMonthEnd(S0) && statementDay < 31) {
        for (let d = statementDay; d <= 31; d += 1) stmtDays.push(d);
        const picked = parseCount(s.stmtDay);
        if (picked !== null && !Number.isNaN(picked) && picked >= statementDay && picked <= 31) statementDay = picked;
      }
    }
  }
  const dayOk = !e.lastDue;

  // ── Kuzatuv boshidagi ko'chirma — dvigatel kabi: shu kungi yoki undan oldingi oxirgisi, to'lov kuni kelmagan bo'lsa ochiq ──
  const T0 = ctx.anchor;
  const S0 = stmtOnOrBefore(T0, statementDay);
  const D0 = stmtDue(p, S0);
  const pending = dayOk && T0 <= D0;
  // Bugun yoki undan keyingi eng yaqin to'lov kuni
  const S1 = stmtOnOrBefore(ctx.today, statementDay);
  const nextDue = stmtDue(p, S1) >= ctx.today ? stmtDue(p, S1) : stmtDue(p, stmtAfter(S1, statementDay));
  // Tahrirda kun o'zgarmasa — saqlangan sana: hisobga ta'sir qilmaydi, "tarix qayta hisoblanadi" bekorga chiqmasin
  const firstDueOn = edit && edit.terms.statementDay === statementDay && edit.terms.firstDueOn ? edit.terms.firstDueOn : nextDue;
  const startedOn = edit ? edit.terms.startedOn : ctx.today;

  // ── Boshlang'ich holat (bank ilovasidan): yangi kartada — bugungi, tahrirda — kuzatuv boshidagi raqamlar ──
  const tm = edit?.terms ?? null;
  let openingBalance: number | null = 0;
  let openingBilled: number | null = null;
  let openingMin: number | null = null;
  let openingRevolving: boolean | null = s.revolving;
  let openingOverdue: number | null = null;
  let stmt: Built['stmt'] = null;
  const h: Built['hints'] = {};
  /**
   * Ochiq ko'chirma: ilovadagi "to'lash kerak" (standart — butun qarz) va minimal to'lov. Minimal majburiy: taxmin
   * (N% × to'lash kerak) foizni bilmaydi — aylanuvchi qarzda bank undan ko'p so'raydi va kam to'lagan kechikadi.
   * Infin: «Foizsiz davr to‘lovi» (standart — butun qarz); 0 — foizli aylanuvchi qarz, ko'chirmada butun qarz
   * (minimal asosiy va foizga bo'linadi). Server qoidalari bilan bir xil: to'lash kerak ≤ qarz, minimal ≤ to'lash kerak
   */
  const askStatement = (debt: number) => {
    const typed = s.billed ?? debt;
    const typedOk = !Number.isNaN(typed) && typed <= debt;
    if (Number.isNaN(typed)) e.billed = t('err.number');
    else if (!typedOk) e.billed = t(isTbc ? 'err.billed' : 'err.billedInfin');
    // Infin'da 0 — foizsiz qism yo'q: savol o'rniga shu (egasi "qisman to'layman" deb belgilab, foizsiz davr yo'qolgan edi)
    const revolving = isTbc ? s.revolving : typedOk && typed <= 0;
    const billed = revolving && !isTbc ? debt : typed;
    if (typedOk) {
      openingBilled = billed;
      openingRevolving = revolving;
    }
    const min = s.minTouched ? s.minLeft : typedOk ? Math.round((minPct * billed) / 100) : null;
    if (min === null) {
      // Tegilmagan minimal: "to'lash kerak" xato bo'lsa — faqat o'sha xato (ikkinchi "kiriting" chiqmasin)
      if (s.minTouched || typedOk) e.minLeft = t('err.minLeft');
    } else if (Number.isNaN(min)) e.minLeft = t('err.number');
    else if (typedOk && min > billed) e.minLeft = t(isTbc ? 'err.minLeftMax' : revolving ? 'err.minLeftMaxDebt' : 'err.minLeftMaxInfin');
    else openingMin = min;
    stmt = { billed: s.billed ?? debt, min, due: D0 };
  };
  const debt = s.cardDebt ?? 0;
  if (Number.isNaN(debt)) e.cardDebt = t('err.number');
  else if (debt > DEBT_LIMITS.amountMax) e.cardDebt = t('err.amountMax');
  else {
    openingBalance = debt;
    // Qarz limitdan katta bo'lishi mumkin (texnik overdraft: komissiya limitdan oshgan) — xato emas, bo'sh limit 0.
    // Tahrirda boshlang'ich qarz emas, bugungisi muhim (pastdagi limit izohi)
    if (!edit && amount !== null && amount > 0 && debt > amount) h.cardDebt = t('f.cardDebtOver');
  }
  // Limit boshlang'ich qarzdan kam bo'lishi mumkin (bank limitni kamaytirdi) — xato emas; hozirgi qarz yangi
  // limitdan katta bo'lsa, bo'sh limit 0 deb ogohlantiriladi (ilgari "Hozirgi qarz limitdan katta" deb saqlanmasdi)
  if (edit && !e.amount && amount !== null && amount > 0 && edit.calc.principal > amount + 0.5) h.amount = t('f.limitBelowDebt');
  // Tahrirda ham: to'lov sanasi tuzatilib kuzatuv boshidagi ko'chirma ochiq bo'lib qolsa — ilovadagi raqamlar so'raladi
  // (server ham minimalsiz rad etadi): taxmin bankniki bo'lib ko'rsatilmasin (API-2)
  if (pending && !e.cardDebt && debt > 0) askStatement(debt);
  if (s.overdueNow !== null) {
    if (Number.isNaN(s.overdueNow)) e.overdueNow = t('err.number');
    else if (s.overdueNow > (openingBalance ?? 0)) e.overdueNow = t('err.overdueNow');
    else if (s.overdueNow > 0) openingOverdue = s.overdueNow;
  }
  if (tm) {
    // Hisobda bir xil qiymat — saqlangani (API orqali yozilgan kartada null bo'lishi mumkin): tarix ogohlantirishi bekorga
    // chiqmasin, server ham "o'zgarish" yozmasin
    if (tm.openingBalance == null && openingBalance === 0) openingBalance = null;
    if ((tm.openingRevolving ?? false) === (openingRevolving ?? false)) openingRevolving = tm.openingRevolving ?? null;
    if ((tm.openingOverdue ?? 0) === (openingOverdue ?? 0)) openingOverdue = tm.openingOverdue ?? null;
    if (stmt && tm.openingBilled == null && openingBilled === openingBalance) openingBilled = null;
    // Eski shakldagi aylanuvchi Infin: "to'lash kerak" qarzdan kam + "qisman to'layman" (qolgani — keyingi xaridlar).
    // Maydon 0 bilan ochiladi; qarz, maydon va minimal tegilmagan bo'lsa saqlangan ko'chirma qaytadi. Aks holda tegmagan
    // saqlash ko'chirmani butun qarzga cho'zib, keyingi xaridlarni foizli qilib hisobni jimgina o'zgartirardi
    if (
      stmt &&
      !isTbc &&
      tm.openingRevolving === true &&
      openingRevolving === true &&
      s.billed === 0 &&
      tm.openingBalance != null &&
      openingBalance === tm.openingBalance &&
      tm.openingBilled != null &&
      tm.openingBilled < tm.openingBalance &&
      openingMin === (tm.openingMin ?? null)
    )
      openingBilled = tm.openingBilled;
  }
  const revolvingAsk: Built['revolvingAsk'] = e.cardDebt || !(debt > 0) ? null : isTbc ? 'tbc' : pending || !dayOk ? null : 'infin';

  const terms: DebtTerms = {
    kind: 'card',
    currency: rules.currency,
    amount: amount !== null && amount > 0 ? amount : 0,
    annualRate: e.rate ? 0 : annualRate,
    dayCount: 'act365',
    repayment: 'interest',
    termMonths: null,
    graceMonths: 0,
    startedOn,
    firstDueOn,
    payDay: null,
    dueOn: null,
    minPct,
    minBase: 'principal',
    monthlyPayment: null,
    openingBalance,
    trackedFrom: ctx.anchor,
    archivedAt: edit?.terms.archivedAt ?? null,
    cardProduct: p,
    statementDay,
    cashRate,
    openingBilled,
    openingMin,
    openingRevolving,
    openingOverdue,
  };

  const body: Record<string, unknown> = {
    kind: 'card',
    // Bank — kartaning o'zidan; sotuvchi nomni o'zgartirsa ham (masalan "Asosiy karta") bank o'zgarmaydi
    lender: rules.bank,
    title: s.title.trim() || rules.name,
    currency: terms.currency,
    amount: terms.amount,
    annualRate: terms.annualRate,
    dayCount: terms.dayCount,
    repayment: terms.repayment,
    termMonths: null,
    graceMonths: 0,
    startedOn,
    firstDueOn,
    payDay: null,
    dueOn: null,
    minPct,
    minBase: terms.minBase,
    monthlyPayment: null,
    openingBalance,
    note: s.note.trim(),
    cardProduct: p,
    statementDay,
    cashRate,
    openingBilled,
    openingMin,
    openingRevolving,
    openingOverdue,
  };
  if (ctx.isOwner) body.ownerOnly = s.ownerOnly;

  // "(12 kun qoldi)" — InfinBANK ilovasidagi "Шунча кун қолди" kabi (egasi, 2026-11-08); nextDue bugundan oldin bo'lmaydi
  const left = leftInline(dayDiff(ctx.today, nextDue), t) ?? '';
  const cardDueText = !dayOk
    ? null
    : isTbc
      ? t('f.lastDueHint', { due: ctx.dateText(nextDue), left, day: statementDay })
      : t('f.infinDueHint', { due: ctx.dateText(nextDue), left });

  return {
    errors: e,
    hints: h,
    blocking: Object.keys(e).length > 0,
    terms,
    body,
    mode: 'plain',
    run: null,
    cardFirstDue: firstDueOn,
    cardNextDue: nextDue,
    pending,
    cardDueText,
    stmtAmbiguous: stmtDays.length > 0,
    stmtDays,
    stmt,
    openingDue: dayOk ? D0 : null,
    revolvingAsk,
  };
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
    // Tayyor karta: hisob shu qoidalar bilan (berilmagani — null: umumiy kartada va boshqa turlarda o'zgarmaydi)
    x.cardProduct ?? null,
    x.statementDay ?? null,
    x.cashRate != null ? round6(x.cashRate) : null,
    x.openingBilled ?? null,
    x.openingMin ?? null,
    x.openingRevolving ?? null,
    x.openingOverdue ?? null,
  ]);
