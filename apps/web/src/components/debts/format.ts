/**
 * Qarzlar bo'limi yordamchilari: pul matnini o'qish va yozish, shart va holat
 * yorliqlari, valyutalarni so'mga jamlash. Hisobning o'zi — @savdoiq/shared
 * debts.ts (server bilan bir xil funksiya); bu yerda faqat ko'rinish.
 *
 * Regex ATAYLAB ishlatilmagan: ilgari tahrirda teskari chiziqlar yo'qolib
 * (utils.ts parseAmount, a595f38) "150 000" 0 bo'lib saqlangan — belgilar
 * oddiy sikl bilan tekshiriladi.
 */
import {
  CARD_PRODUCTS,
  DEBT_CATEGORIES,
  dayDiff,
  formatDebtMoney,
  formatNumber,
  interestFor,
  parseISODate,
  toISODate,
  type DebtCalc,
  type DebtCardProduct,
  type DebtCategory,
  type DebtCurrency,
  type DebtCurrencyTotals,
  type DebtDue,
  type DebtEntryKind,
  type DebtEntryRow,
  type DebtLedgerEntry,
  type DebtListResponse,
  type DebtTerms,
  type Lang,
} from '@savdoiq/shared';
import type { Tone } from '@/components/ui';
import type { TFunc } from '@/i18n';
import './texts';

/** Bo'linmas bo'shliq — manbada ko'rinmas belgi turmasin, kod bilan yasaladi (vgh/format.ts dagidek) */
export const NBSP = String.fromCharCode(0xa0);

/** "4 825 299 so‘m" tor joyda ikki qatorga bo'linib ketmasin */
export const keepTogether = (s: string): string => s.split(' ').join(NBSP);

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

/** To'liq YYYY-MM-DD va kalendarda bor kun: 2026-02-30 ham, 5 xonali yil ham o'tmaydi */
export function isIsoDay(v: string | null | undefined): v is string {
  if (!v || v.length !== 10 || v[4] !== '-' || v[7] !== '-') return false;
  for (let i = 0; i < 10; i += 1) if (i !== 4 && i !== 7 && !isDigit(v[i])) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Pul matnini songa aylantiradi: "50 000 000", "1 786,62", "1,786.62", "5000.5".
 * Oxirgi ajratkichdan keyin 1–2 raqam — kasr (tiyin, sent); aynan 3 raqam —
 * minglik ("5,000" — besh ming, besh emas: pulda uch xonali kasr bo'lmaydi).
 * Bo'shliq, "so'm", "$" kabi belgilar tashlab yuboriladi.
 * Bo'sh — null; tushunib bo'lmaydigan ("1761.321786.62", "12,3456") — NaN.
 */
export function parseMoney(text: string): number | null {
  let digits = '';
  /** Har ajratkichdan oldin nechta raqam bor */
  const seps: number[] = [];
  for (const ch of text) {
    if (isDigit(ch)) digits += ch;
    else if (ch === '.' || ch === ',') seps.push(digits.length);
  }
  if (!digits) return null;
  if (!seps.length) return Number(digits);
  const last = seps[seps.length - 1];
  const after = digits.length - last;
  let int = digits;
  let frac = '';
  let groups = seps;
  if (after !== 3) {
    // Oxirgisi — kasr ajratkichi ("5000," hali yozilmoqda — kasrsiz)
    if (after > 2) return Number.NaN;
    int = digits.slice(0, last);
    frac = digits.slice(last);
    groups = seps.slice(0, -1);
  }
  // Minglik ajratkichlar: birinchi guruh 1–3 raqam, keyingilari aynan 3 tadan
  if (groups.length) {
    if (groups[0] < 1 || groups[0] > 3) return Number.NaN;
    for (let i = 1; i < groups.length; i += 1) if (groups[i] - groups[i - 1] !== 3) return Number.NaN;
    if (int.length - groups[groups.length - 1] !== 3) return Number.NaN;
  }
  return Number(`${int || '0'}.${frac || '0'}`);
}

/** Butun son maydoni ("12"): bo'sh — null, raqamdan boshqa belgi bo'lsa — NaN */
export function parseCount(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  for (const ch of s) if (!isDigit(ch)) return Number.NaN;
  return Number(s);
}

/** Kichik kasrli son (foiz): "10", "7,5" */
export function parseDecimal(text: string): number | null {
  const s = text.trim().split(',').join('.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** "50,0" → "50", "1,250" → "1,25" — faqat kasr qismidagi nollar */
function trimZeros(s: string, lang: Lang): string {
  const dec = lang === 'en' ? '.' : ',';
  if (!s.includes(dec)) return s;
  let out = s;
  while (out.endsWith('0')) out = out.slice(0, -1);
  return out.endsWith(dec) ? out.slice(0, -1) : out;
}

/** Foiz soni: 28 → "28", 2.3333 → "2,33" */
export const pctNum = (v: number, lang: Lang): string => trimZeros(formatNumber(v, lang, 2), lang);

/** Fokussiz maydonda: "50 000 000", tiyin yoki sent bo'lsa "1 250,50" */
export function moneyInputText(v: number | null, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '';
  return formatNumber(v, lang, Math.abs(v - Math.round(v)) >= 0.005 ? 2 : 0);
}

/** Fokusdagi xom matn: guruhlarsiz ("50000000"), kasr — til ajratkichi bilan */
export function rawMoneyText(v: number | null, lang: Lang): string {
  if (v == null || !Number.isFinite(v)) return '';
  const s = String(Math.round(v * 100) / 100);
  return lang === 'en' ? s : s.split('.').join(',');
}

/** Jadval ichida birliksiz raqam: so'm — butun, dollar — sent bo'lsa 2 xona */
export const numText = (v: number, currency: DebtCurrency, lang: Lang): string =>
  formatNumber(v, lang, currency === 'USD' && Math.abs(v - Math.round(v)) >= 0.005 ? 2 : 0);

const UNITS: Record<Lang, { v: number; s: string }[]> = {
  uz: [
    { v: 1e9, s: ' mlrd' },
    { v: 1e6, s: ' mln' },
    { v: 1e3, s: ' ming' },
  ],
  ru: [
    { v: 1e9, s: ' млрд' },
    { v: 1e6, s: ' млн' },
    { v: 1e3, s: ' тыс.' },
  ],
  en: [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ],
};
const UZS_WORD: Record<Lang, string> = { uz: 'so‘m', ru: 'сум', en: 'UZS' };

/**
 * Qisqa summa: 50 000 000 → "50 mln so‘m", 1 250 000 → "1,25 mln so‘m".
 * Maydon ostidagi aks-sado ortiqcha yozilgan nolni ushlaydi; `exact` — yaxlitlanmagan
 * (oldiga "=" yoki "≈" qo'yiladi).
 */
export function compactMoney(v: number, currency: DebtCurrency, lang: Lang): { text: string; exact: boolean } {
  const abs = Math.abs(v);
  const unit = UNITS[lang].find((u) => abs >= u.v);
  if (!unit) return { text: formatDebtMoney(v, currency, lang), exact: true };
  const n = v / unit.v;
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
  const scaled = n * 10 ** digits;
  const exact = Math.abs(scaled - Math.round(scaled)) < 1e-6;
  const body = `${trimZeros(formatNumber(n, lang, digits), lang)}${unit.s}`;
  const text = currency === 'USD' ? (lang === 'en' ? `$${body}` : `${body} $`) : `${body} ${UZS_WORD[lang]}`;
  return { text, exact };
}

// ─────────────────────────── Yorliqlar ───────────────────────────

/** "28% yillik", "oyiga 3%", "Foizsiz". Odamdan qarzda — oylik (sotuvchilar shunday gapiradi) */
export function rateText(terms: Pick<DebtTerms, 'annualRate' | 'kind'>, t: TFunc, lang: Lang): string {
  const r = terms.annualRate;
  if (!(r > 0)) return t('rate.none');
  if (terms.kind === 'person') return t('rate.monthly', { v: pctNum(r / 12, lang) });
  return t('rate.yearly', { v: pctNum(r, lang) });
}

/** Oylar soni sifatida: "2027-02-15" → 2027 × 12 + 2 (ikki sana orasidagi oylik to'lovlar uchun) */
const monthIndex = (iso: string): number => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7));

/**
 * "Har oy teng · 12 oy", "Foiz + 10%", "Bir yo‘la". Avvaldan bor qarzda — "yana 7 oy".
 * termMonths — kuzatuv boshidagi qolgan to'lovlar; bugungi son `calc`dan (to'lov raqami k
 * firstDueOn dan sanaladi). Ilgari (2026-11-07) "yana 7 oy" uch to'lovdan keyin ham kamaymasdi.
 */
export function repaymentText(
  terms: DebtTerms,
  t: TFunc,
  lang: Lang,
  calc?: Pick<DebtCalc, 'next' | 'state' | 'payoffDate'>,
): string {
  const running = terms.openingBalance != null && terms.kind !== 'card';
  let n = terms.termMonths;
  if (running && n && calc) {
    const next = calc.state !== 'paid' ? calc.next : null;
    // Yopilgan qarzda eski "yana N oy" qolib ketmasin
    if (!next) n = null;
    else {
      n = Math.max(1, n - next.k + 1);
      // Muddatidan oldin to'langan pul jadvalni qisqartirgan bo'lsa — tugash oyigacha
      if (calc.payoffDate) n = Math.max(1, Math.min(n, monthIndex(calc.payoffDate) - monthIndex(next.date) + 1));
    }
  }
  switch (terms.repayment) {
    case 'lump':
      return t('rep.lump');
    case 'equal':
      return n ? t(running ? 'rep.equalLeft' : 'rep.equalTerm', { n }) : t('rep.equal');
    case 'decreasing':
      return n ? t(running ? 'rep.decreasingLeft' : 'rep.decreasingTerm', { n }) : t('rep.decreasing');
    default: {
      if (!(terms.minPct > 0)) return t('rep.interestOnly');
      const pct = pctNum(terms.minPct, lang);
      return terms.minBase === 'total' ? t('rep.minTotal', { pct }) : t('rep.minPrincipal', { pct });
    }
  }
}

/** Kartaning minimal to'lov qoidasi: "qarzning 10% + foiz" */
export function minRuleText(terms: Pick<DebtTerms, 'minPct' | 'minBase'>, t: TFunc, lang: Lang): string {
  if (!(terms.minPct > 0)) return t('pv.rule.interest');
  const pct = pctNum(terms.minPct, lang);
  return terms.minBase === 'total' ? t('pv.rule.total', { pct }) : t('pv.rule.principal', { pct });
}

/**
 * To'lovdagi foiz shu qoldiq va kunlardan chiqqanmi — "(31 kun)" faqat shunda yoziladi.
 * Erta to'lovdan keyingi oyda, o'tib kelgan foizda yoki davr ichidagi xariddan keyin foiz
 * boshqa qoldiq/kunlardan yig'ilgan: ilgari "1 205 266 so'm (31 kun)" chiqardi, 31 kunlik
 * foiz esa 1 098 919. Tekshiruv dvigatelning o'z formulasi bilan (davr boshidan to'lov kunigacha):
 * 30E/360 da ham aniq — 9 oylik bir yo'la qarzning "(273 kun)"i ham, 2–3 kun oldin to'langan
 * oyning "(31 kun)" emasligi ham to'g'ri chiqadi. Farq — 1 so'm (1 sent) gacha yaxlitlash.
 */
export function interestFromDays(due: Pick<DebtDue, 'date' | 'interest' | 'explain'>, currency: DebtCurrency): boolean {
  const { base, days, dayCount, annualRate } = due.explain;
  if (!(days > 0) || !(annualRate > 0) || !(base > 0)) return false;
  const tol = currency === 'USD' ? 0.01 : 1;
  const start = toISODate(new Date(parseISODate(due.date).getTime() - days * 86_400_000));
  return Math.abs(interestFor(base, annualRate, start, due.date, dayCount) - due.interest) <= tol + 1e-9;
}

/** "30 kun qoldi", "Bugun", "2 kun kechikdi" */
export function dueText(due: Pick<DebtDue, 'daysLeft'>, t: TFunc): string {
  if (due.daysLeft < 0) return t('due.late', { n: -due.daysLeft });
  return due.daysLeft === 0 ? t('due.today') : t('due.left', { n: due.daysLeft });
}

/**
 * Qavs ichidagi qolgan kunlar — "keyingi to‘lov: 20.11.2026 (12 kun qoldi)", "(bugun)"; o'tgan sana — null.
 * Egasi (2026-11-08): InfinBANK ilovasida "Шунча кун қолди" bor — shaklda ham ko'rinsin
 */
export function leftInline(daysLeft: number, t: TFunc): string | null {
  if (daysLeft < 0) return null;
  return daysLeft === 0 ? t('due.todayInline') : t('due.left', { n: daysLeft });
}

/**
 * Kartochkadagi holat belgisi. Qizil — FAQAT kechikkanda; to'lash kerak bo'lgani
 * za'faron; joriy oy to'langan — brend; sanasiz — kulrang.
 */
export function dueChip(calc: DebtCalc, t: TFunc): { tone: Tone; label: string } {
  if (calc.state === 'paid') return { tone: 'brand', label: t('status.closed') };
  if (calc.state === 'archived') return { tone: 'muted', label: t('status.archived') };
  const next = calc.next;
  if (next && next.status === 'overdue') return { tone: 'danger', label: dueText(next, t) };
  if (calc.paidDue) return { tone: 'brand', label: t('status.paidThisMonth') };
  if (next) return { tone: 'warn', label: dueText(next, t) };
  // Karta hech qachon "yopilgan" bo'lmaydi: qarzsiz ham to'lov kuni bor, faqat to'lanadigan narsa yo'q
  if (calc.payoff <= 0) return { tone: 'muted', label: t('sched.empty') };
  return { tone: 'muted', label: t('status.noDate') };
}

/**
 * Tayyor karta: ko'rsatiladigan to'lov summasi bugungi yopish summasidan oshmaydi (xavfsizlik to'ri — qoldiq
 * tenglashtirilib kamaytirilgan ochiq ko'chirmada eski minimal qarzdan katta chiqib qolmasin, web-2). Boshqa
 * qarzlarda o'zgarmaydi: oxirgi to'lovda hali yig'ilmagan foiz bo'ladi (u bugungi yopishdan katta)
 */
export const dueShown = (remaining: number, calc: Pick<DebtCalc, 'payoff'>, productCard: boolean): number =>
  productCard ? Math.min(remaining, calc.payoff) : remaining;

/**
 * Tayyor kartaning "Foizsiz qolish uchun" va "Foiz xavfi" holati:
 *  • archived — arxivda so'ralmaydi ("Keyingi to'lov" kabi "—");
 *  • noStatement — ochiq ko'chirma yo'q (keyingisi qachon);
 *  • none — ko'chirmada foizsiz bo'ladigan narsa yo'q (faqat naqd/o'tkazma yoki foizli qarz): "bajarildi" EMAS;
 *  • lost — TBC 5.7.3: kechikish sababli kechirilmaydi; done — to'liq to'langan; open — yana `left` to'lash kerak.
 * `left` bugungi yopish summasidan oshmaydi (xavfsizlik to'ri, web-2)
 */
export type GraceView =
  | { kind: 'archived' }
  | { kind: 'noStatement' }
  | { kind: 'none' }
  | { kind: 'open' | 'done' | 'lost'; left: number; risk: number; due: string };

export function graceView(calc: Pick<DebtCalc, 'state' | 'payoff' | 'card'>): GraceView {
  if (calc.state !== 'active') return { kind: 'archived' };
  const g = calc.card?.grace ?? null;
  if (!g) return { kind: 'noStatement' };
  if (g.state === 'none') return { kind: 'none' };
  const left = Math.max(0, Math.min(g.left, calc.payoff));
  return { kind: g.state === 'lost' ? 'lost' : left > 0 ? 'open' : 'done', left, risk: g.risk, due: g.due };
}

const isCategory = (v: string): v is DebtCategory => (DEBT_CATEGORIES as readonly string[]).includes(v);

/** Bazadagi turkum ("" yoki eskisi) — ro'yxatdagi biriga */
export const asCategory = (v: string | null | undefined): DebtCategory | null => (v && isCategory(v) ? v : null);

export const categoryLabel = (category: string, t: TFunc): string => t(`cat.${asCategory(category) ?? 'other'}`);

/** Tarixdagi yozuv turi: kartada "olindi" — "kartadan ishlatildi" */
export function entryKindLabel(kind: DebtEntryKind, isCard: boolean, t: TFunc): string {
  if (kind === 'draw') return t(isCard ? 'ek.drawCard' : 'ek.draw');
  return t(`ek.${kind}`);
}

/** To'landi — brend (sotuvchining puli), olindi — za'faron (qarz oshdi), tenglashtirildi — neytral */
export const ENTRY_TONE: Record<DebtEntryKind, Tone> = { pay: 'brand', draw: 'warn', use: 'muted', adjust: 'info' };

// ─────────────────────────── Sanalar ───────────────────────────

/** Oyning `day`-kuni (qisqa oyda — oxirgi kuni): `from` kunidan boshlab birinchisi */
export function nextMonthDay(from: string, day: number): string {
  const d = parseISODate(from);
  for (let add = 0; add < 3; add += 1) {
    const y = d.getUTCFullYear();
    const m0 = d.getUTCMonth() + add;
    const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    const iso = toISODate(new Date(Date.UTC(y, m0, Math.min(day, last))));
    if (iso >= from) return iso;
  }
  return from;
}

/** Taxminiy oylar soni (o'rtacha oy ≈ 30,44 kun) — "~44 oy" uchun */
export const monthsUntil = (from: string, to: string): number => Math.max(1, Math.round(dayDiff(from, to) / 30.4375));

export const addDays = (iso: string, n: number): string => toISODate(new Date(parseISODate(iso).getTime() + n * 86_400_000));

/** Oyning oxirgi kunimi (30.11, 28.02) — TBC'da ko'chirma kuni shundan noaniq bo'ladi */
export const isMonthEnd = (iso: string): boolean => addDays(iso, 1).slice(8, 10) === '01';

/*
 * Tayyor kartaning kalendari — dvigateldagi (shared debts.ts) statementIn / statementOnOrBefore /
 * statementAfter / dueOf bilan AYNAN bir xil: shakldagi "keyingi to'lov" va "ko'chirma ochiqmi"
 * server hisobidagi bilan farq qilmasin. Ko'chirma kuni qisqa oyda oy oxiriga tushadi.
 */
function stmtIn(y: number, m0: number, day: number): string {
  const first = new Date(Date.UTC(y, m0, 1));
  const yy = first.getUTCFullYear();
  const mm = first.getUTCMonth();
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return toISODate(new Date(Date.UTC(yy, mm, Math.min(day, last))));
}

/** Shu kungi yoki undan oldingi oxirgi ko'chirma sanasi */
export function stmtOnOrBefore(date: string, day: number): string {
  const d = parseISODate(date);
  const here = stmtIn(d.getUTCFullYear(), d.getUTCMonth(), day);
  return here <= date ? here : stmtIn(d.getUTCFullYear(), d.getUTCMonth() - 1, day);
}

/** Shu kundan KEYINGI birinchi ko'chirma — shu kungi xarid qaysi ko'chirmaga tushadi */
export function stmtAfter(date: string, day: number): string {
  const d = parseISODate(date);
  const here = stmtIn(d.getUTCFullYear(), d.getUTCMonth(), day);
  return here > date ? here : stmtIn(d.getUTCFullYear(), d.getUTCMonth() + 1, day);
}

/** Ko'chirmaning to'lov kuni: TBC — 24 kundan keyin; Infin — 20-sana, shanba/yakshanba bo'lsa oldingi ish kuni (oferta 2.8) */
export function stmtDue(product: DebtCardProduct, statement: string): string {
  const rules = CARD_PRODUCTS[product];
  let d = addDays(statement, rules.dueDays);
  if (rules.weekendBack) {
    for (let i = 0; i < 3; i += 1) {
      const wd = parseISODate(d).getUTCDay();
      if (wd !== 0 && wd !== 6) break;
      d = addDays(d, -1);
    }
  }
  return d;
}

/** Tayyor kartaning ko'chirma kuni: saqlangani (TBC), bo'lmasa bankniki (Infin — 1) */
export const statementDayOf = (terms: Pick<DebtTerms, 'statementDay'>, product: DebtCardProduct): number =>
  Math.min(31, Math.max(1, terms.statementDay ?? CARD_PRODUCTS[product].statementDay ?? 1));

// ─────────────────────────── Daftar va jamlar ───────────────────────────

/**
 * Sahifadagi yozuvlar — shared hisobining kirishiga (oldindan ko'rish uchun). Tayyor kartada kanal va
 * komissiya ham: ularsiz o'tkazma "xarid" bo'lib, foizsiz davr va komissiyasiz qarz chiqardi
 */
export const toLedger = (entries: ReadonlyArray<DebtEntryRow>): DebtLedgerEntry[] =>
  entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    date: e.date,
    amount: e.amount,
    category: e.category,
    note: e.note,
    interest: e.interest,
    createdAt: e.createdAt,
    channel: e.channel ?? null,
    fee: e.fee ?? null,
  }));

/** Jonli Markaziy bank kursi; zaxira (eskirgan) kurs bilan so'mga aylantirilmaydi */
export function liveRate(rates: DebtListResponse['rates'], currency: DebtCurrency): number | null {
  const r = rates[currency];
  return r && r.source !== 'fallback' && r.rate > 0 ? r.rate : null;
}

export interface UzsSum {
  /** So'mdagi jami (dollar — jonli kurs bilan) */
  uzs: number;
  /** So'mga qo'shilgan valyutalar soni */
  parts: number;
  /** Kurs olinmagani uchun alohida qolganlar */
  rest: { currency: DebtCurrency; amount: number }[];
}

/** Valyutalar bo'yicha jamni so'mga yig'adi (server `uzsTotal` qoidasi bilan bir xil) */
export function sumToUzs(
  data: Pick<DebtListResponse, 'totals' | 'rates'>,
  pick: (x: DebtCurrencyTotals) => number,
): UzsSum {
  let uzs = 0;
  let parts = 0;
  const rest: UzsSum['rest'] = [];
  for (const x of data.totals.byCurrency) {
    const v = pick(x);
    if (x.currency === 'UZS') {
      uzs += v;
      parts += 1;
      continue;
    }
    const rate = liveRate(data.rates, x.currency);
    if (rate) {
      uzs += v * rate;
      parts += 1;
    } else if (v) rest.push({ currency: x.currency, amount: v });
  }
  return { uzs: Math.round(uzs), parts, rest };
}

/** "6 300 000 so‘m + 120 $" */
export function uzsSumText(s: UzsSum, lang: Lang): string {
  const out = s.parts > 0 || !s.rest.length ? [formatDebtMoney(s.uzs, 'UZS', lang)] : [];
  for (const r of s.rest) out.push(formatDebtMoney(r.amount, r.currency, lang));
  return out.join(' + ');
}
