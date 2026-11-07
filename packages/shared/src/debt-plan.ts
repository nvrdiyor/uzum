/**
 * "To'lash" (2026-11-08): kiritilgan summani hamma faol qarzlarga bo'lish — qaysi biriga qancha. Egasining so'rovi:
 * "hammasi 18 850 543 — to'lashni bossam summa kiritishim kerak; misol uchun 3 mln to'lamoqchi bo'lsam, qaysi biriga
 * qancha, qaysiga qancha to'lashimni maslahat berishi kerak".
 *
 * Yangi hisob YO'Q — faqat analyzeDebt natijasi (DebtSummary.calc) o'qiladi (debtPaymentAdvice kabi): raqamlar
 * kartochka va qarz sahifasidagi bilan bir xil. Toza va deterministik — kirish tartibi natijaga ta'sir qilmaydi.
 *
 * Pul bosqichma-bosqich bo'linadi, bitta qarzga bugungi yopish summasidan (calc.payoff) ko'p emas:
 *  1. Kechikkan (calc.overdue) — jarima har kuni, karta limiti bloklangan. Avval kunlik jarimasi qimmatrog'i
 *     (TBC 0,4% kechikkan asosiy qarzdan, Infin 0,25% kechikkan summadan; boshqa qarzlar — keyin), keyin eng eskisi;
 *  2. 30 kun (DEBT_LIMITS.horizonDays) ichidagi minimal yoki oylik to'lov — calc.next ning to'lanmagan qismi
 *     (kechikmagan), to'lov kuni bo'yicha. Tayyor kartada — ochiq ko'chirmaning minimali (keyingi ko'chirmaning
 *     taxmini emas: u hali chiqmagan). Kechikkan qarzda calc.next — kechikkan to'lovning o'zi; undan keyingi 30 kun
 *     ichidagi to'lov (kredit — navbatdagi oy, Infin — ochiq ko'chirmaning qolgan minimali) DebtSummary.soon da
 *     (kechikkani bilan — sahifadagi "30 kunda to'lash kerak" ham shu): u ham shu bosqichda, aks holda "Minimallar"
 *     uni tashlab ketardi va kechikkan yopilgach to'lov yana kechikardi;
 *  3. Foizsiz davr (tayyor karta, grace 'open', left > 0): ko'chirma summasining 1–2-bosqichdan qolgani. HAMMASI YOKI
 *     HECH NARSA — qisman to'lov foizsiz davrni saqlamaydi. Kartalar "har so'mga tejaladigan foiz" = risk ÷ kerak pul
 *     bo'yicha olinadi; qolgan pul kartaning butun summasiga yetsagina — aks holda keyingisi sinaladi;
 *  4. Qolgani (avalanche) — haqiqatan foiz ishlayotgan qarzlarga, foizi yuqorisidan: foizsiz davri saqlanmaydigan,
 *     5.7.3 yoki foizsiz qismi yo'q tayyor karta — o'z foizi; umumiy karta, kredit, odamdan qarz — yillik foizi.
 *     Keyin foizsiz davri saqlangan karta (qolgan qarzi — joriy oy xaridlari, keyingi to'lov kunigacha foizsiz),
 *     eng oxirida — foizsiz qarzlar.
 * Hamma qarzdan ortgani — `left`. Faqat so'm: boshqa valyutadagi qarzlar `skipped` da (UI "kirmadi" deydi).
 * Arxivdagi va yopilgan qarzlar umuman kirmaydi.
 *
 * Bu faqat maslahat: to'lov bankda qilinadi, keyin UI har qator uchun "To'ladim" (pay) yozuvini yozadi.
 */
import {
  CARD_PRODUCTS,
  DEBT_LIMITS,
  addMonthsAnchored,
  dayDiff,
  isCardProduct,
  type DebtCardProduct,
  type DebtCurrency,
  type DebtKind,
  type DebtSummary,
} from './debts.js';

/** Pul qaysi bosqichdan: kechikkan · minimal (oylik) to'lov · foizsiz davrni saqlash · qolgani (foizi yuqoriga) */
export const DEBT_PLAN_PARTS = ['overdue', 'min', 'grace', 'extra'] as const;
export type DebtPlanPartKind = (typeof DEBT_PLAN_PARTS)[number];

export interface DebtPlanPart {
  kind: DebtPlanPartKind;
  amount: number;
}

/**
 * 4-bosqichdagi navbat: rate — foiz ishlayapti (foizi bo'yicha) · free — foizsiz davri saqlangan tayyor karta (joriy oy
 * xaridlari) · zero — foizsiz qarz (eng oxirida)
 */
export type DebtPlanGroup = 'rate' | 'free' | 'zero';

/** Qator izohi uchun faktlar — matnni UI tuzadi (uz/ru/en) */
export interface DebtPlanNote {
  /** Kechikkan summa (shu qatorda so'ralgani), eng eski kechikish kunlari, ichidagi jarima, limit bloklanganmi */
  overdue: { amount: number; days: number; penalty: number; blocked: boolean } | null;
  /**
   * 30 kun ichidagi minimal yoki oylik to'lov (kechikkan qarzda — kechikkandan keyingisi). statement — tayyor kartaning
   * ko'chirma minimali (boshqa qarzda — jadvaldagi to'lov)
   */
  due: { date: string; daysLeft: number; amount: number; statement: boolean } | null;
  /**
   * Tayyor kartaning ochiq ko'chirmasi: left — foizsiz qolish uchun kerak (bugungi yopishdan oshmaydi), kept — shu reja
   * uni to'liq yopadi (risk tejaladi), need — saqlash uchun yana qancha kerak edi
   */
  grace: {
    state: 'open' | 'lost' | 'none';
    left: number;
    due: string;
    daysLeft: number;
    risk: number;
    kept: boolean;
    need: number;
  } | null;
  /** 4-bosqich navbati va foizi (yillik, %) — qolgan pul nega shu qarzga */
  group: DebtPlanGroup;
  rate: number;
  /** free: joriy oy xaridlari qachongacha foizsiz (keyingi ko'chirmaning to'lov kuni) */
  freeUntil: string | null;
  /** Kechikkan va minimal to'lovning yetmagan qismi (summa kam bo'lsa) */
  short: number;
}

export interface DebtPlanLine {
  debtId: string;
  /** "TBC Bank Osmon", "InfinBANK Black" (bir xil kartadan ikkitasi — nomi bilan); boshqasi — "Kapitalbank · Kredit" */
  name: string;
  kind: DebtKind;
  product: DebtCardProduct | null;
  /** Shu qarzga to'lanadigan summa (0 — pul yetmadi, lekin kechikkan/minimal to'lov bor: short > 0) */
  amount: number;
  /** Bosqichlar bo'yicha (faqat > 0, tartib: overdue → min → grace → extra) */
  parts: DebtPlanPart[];
  /** Bugungi yopish summasi va to'lovdan keyin qoladigani ("qoladi Y") */
  payoff: number;
  afterPayoff: number;
  /** Yozuv sanasi chegaralari uchun: server qarz olingan kundan oldingi yozuvni rad etadi */
  startedOn: string;
  /**
   * Shundan oldingi to'lov qoldiqni o'zgartirmaydi (bank ilovasidagi qoldiqda bor): tayyor karta va avvaldan bor
   * qarz (openingBalance) — kuzatuv boshi; yangi qarzda yozuvlar olingan kundan hisoblanadi (analyzeDebt ledgerFrom),
   * shuning uchun — startedOn
   */
  trackedFrom: string;
  note: DebtPlanNote;
}

export interface DebtPlanSkipped {
  debtId: string;
  name: string;
  currency: DebtCurrency;
  payoff: number;
}

export interface DebtPaymentPlan {
  /** Taqsimlangan summa (so'm, butun) */
  amount: number;
  /** Pul tushgan qatorlar (birinchi pul tushgan bosqich tartibida), keyin puli yetmagan kechikkan/minimal qatorlar */
  lines: DebtPlanLine[];
  totals: Record<DebtPlanPartKind, number>;
  /** ≈ Σ grace.risk — shu reja foizsiz davrini saqlaydigan kartalar */
  saved: number;
  /** Hamma qarzdan ortgani */
  left: number;
  /** Boshqa valyutadagi faol qarzlar — taqsimotga kirmaydi */
  skipped: DebtPlanSkipped[];
  /**
   * Summadan qat'i nazar (UI tugmachalari): min — kechikkan + 30 kun ichidagi minimal/oylik to'lovlar; grace — shu va
   * hamma foizsiz davrni saqlash; all — hamma qarzning bugungi yopish summasi
   */
  needs: { min: number; grace: number; all: number };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const GROUP_RANK: Record<DebtPlanGroup, number> = { rate: 0, free: 1, zero: 2 };

interface Slot {
  d: DebtSummary;
  name: string;
  product: DebtCardProduct | null;
  payoff: number;
  /** Yillik foiz, % — 4-bosqich tartibi */
  rate: number;
  overdue: { need: number; days: number; penalty: number; blocked: boolean; cost: number } | null;
  due: { need: number; date: string; daysLeft: number; statement: boolean } | null;
  grace: { state: 'open' | 'lost' | 'none'; left: number; due: string; daysLeft: number; risk: number } | null;
  given: number;
  parts: Record<DebtPlanPartKind, number>;
  /** Birinchi pul tushgan navbat (qatorlar tartibi) va 1–2-bosqichda ko'rilgan navbat (puli yetmagan qatorlar) */
  firstPaid: number;
  firstSeen: number;
}

/** Qarz nomi: tayyor karta — bank va karta (ikkitasi bo'lsa — nomi bilan), boshqasi — kimdan va nomi */
function nameOf(d: DebtSummary, sameProduct: number): string {
  const title = (d.title ?? '').trim();
  const p = d.terms.kind === 'card' && isCardProduct(d.terms.cardProduct) ? d.terms.cardProduct : null;
  if (p) {
    const rules = CARD_PRODUCTS[p];
    const base = `${rules.bank} ${rules.name}`;
    return sameProduct > 1 && title && title !== rules.name ? `${base} · ${title}` : base;
  }
  const lender = (d.lender ?? '').trim();
  return title ? (lender ? `${lender} · ${title}` : title) : lender;
}

/**
 * Kechikkan qarzda kechikkan to'lovdan KEYINGI, 30 kun ichidagi to'lov: summa — DebtSummary.soon (30 kunlik jadval,
 * kechikkani bilan) minus kechikkan summa; sana — kredit va umumiy kartada navbatdagi oylik to'lov kuni (analyzeDebt
 * dueAt: kechikkan to'lovlar ketma-ket, eng eskisi calc.next.k), tayyor kartada — ochiq ko'chirmaning to'lov kuni.
 * Tayyor kartada keyingi ko'chirma (taxmin) ham 30 kun ichiga tushsa — ajratib bo'lmaydi, null (taxmin so'ralmaydi)
 */
function dueAfterOverdue(d: DebtSummary, product: DebtCardProduct | null, today: string): { amount: number; date: string } | null {
  const c = d.calc;
  const next = c.next;
  if (!c.overdue || !next || next.status !== 'overdue') return null;
  const amount = Math.round((d.soon?.amount ?? 0) - c.overdue.amount);
  if (!(amount > 0)) return null;
  const within = (date: string) => dayDiff(today, date) >= 0 && dayDiff(today, date) <= DEBT_LIMITS.horizonDays;
  if (product) {
    const g = c.card?.grace;
    if (!g || !within(g.due) || !c.card || within(c.card.nextStatement.due)) return null;
    return { amount, date: g.due };
  }
  const t = d.terms;
  if (t.repayment === 'lump' || !t.firstDueOn) return null;
  const k = next.k + c.overdue.count;
  if ((t.repayment === 'equal' || t.repayment === 'decreasing') && t.termMonths != null && k > Math.floor(t.termMonths)) return null;
  let date = addMonthsAnchored(t.firstDueOn, k - 1, t.payDay);
  if (t.repayment === 'interest' && t.dueOn && date >= t.dueOn) date = t.dueOn;
  return within(date) ? { amount, date } : null;
}

/**
 * Shu kundan oldingi yozuv qoldiqqa ta'sir qilmaydi — analyzeDebt bilan bir xil qoida: tayyor kartada va avvaldan bor
 * qarzda (qoldiq bank ilovasidan) kuzatuv boshi, yangi qarzda olingan kun (kechroq yozilgan odamdan qarzning 05.11
 * dagi to'lovi qoldiqni kamaytiradi — "o'zgartirmaydi" deyilmasin)
 */
function historyBefore(d: DebtSummary): string {
  const t = d.terms;
  const product = t.kind === 'card' && isCardProduct(t.cardProduct);
  const running = t.openingBalance != null && t.openingBalance >= 0;
  return product || running ? t.trackedFrom : t.startedOn;
}

/**
 * Tayyor kartaning foizi: TBC'da to'lov avval xaridlarni yopadi (5.10) — xarid qarzi bo'lsa xarid foizi, faqat naqd
 * qolgan bo'lsa naqd foizi; Infin'da foiz bitta
 */
function productRate(d: DebtSummary, p: DebtCardProduct): number {
  const r = Math.max(0, d.terms.annualRate || 0);
  const rules = CARD_PRODUCTS[p];
  if (!rules.separateCashRate) return r;
  const cash = d.terms.cashRate != null && d.terms.cashRate >= 0 ? d.terms.cashRate : r;
  const card = d.calc.card;
  if (!card) return r;
  return card.purchaseDebt > 0.5 || !(card.cashDebt > 0.5) ? r : cash;
}

/**
 * Summani faol so'm qarzlarga bo'lish (yuqoridagi tartib). `today` — server savdo kuni (DebtListResponse.today):
 * "30 kun ichida" va qolgan kunlar shundan sanaladi
 */
export function debtPaymentPlan(items: ReadonlyArray<DebtSummary>, amount: number, today: string): DebtPaymentPlan {
  const active = items.filter((d) => d.calc.state === 'active');
  const perProduct = new Map<string, number>();
  for (const d of active) {
    if (d.terms.kind === 'card' && isCardProduct(d.terms.cardProduct))
      perProduct.set(d.terms.cardProduct, (perProduct.get(d.terms.cardProduct) ?? 0) + 1);
  }
  const countOf = (d: DebtSummary) =>
    d.terms.kind === 'card' && isCardProduct(d.terms.cardProduct) ? (perProduct.get(d.terms.cardProduct) ?? 0) : 0;

  const skipped: DebtPlanSkipped[] = active
    .filter((d) => d.terms.currency !== 'UZS')
    .map((d) => ({ debtId: d.id, name: nameOf(d, countOf(d)), currency: d.terms.currency, payoff: Math.max(0, d.calc.payoff) }))
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.debtId, b.debtId));

  const slots: Slot[] = active
    .filter((d) => d.terms.currency === 'UZS')
    .map((d) => {
      const c = d.calc;
      const product = d.terms.kind === 'card' && isCardProduct(d.terms.cardProduct) && c.card ? d.terms.cardProduct : null;
      const payoff = Math.max(0, Math.round(c.payoff));
      const rate = product ? productRate(d, product) : Math.max(0, d.terms.annualRate || 0);
      const next = c.next;

      let overdue: Slot['overdue'] = null;
      if (c.overdue && c.overdue.amount > 0 && payoff > 0) {
        const need = Math.min(payoff, Math.round(c.overdue.amount));
        // Kunlik jarima har so'm kechikkan summaga: TBC — faqat kechikkan asosiy qarzdan, Infin — summadan (jarimasiz)
        let cost = 0;
        const penalty = product ? Math.max(0, c.card?.penalty ?? 0) : 0;
        if (product) {
          const pen = CARD_PRODUCTS[product].penalty;
          const base =
            pen.base === 'principal'
              ? next && next.status === 'overdue'
                ? Math.max(0, next.principal)
                : c.overdue.amount
              : Math.max(0, c.overdue.amount - penalty);
          cost = (pen.dailyPct / 100) * (base / c.overdue.amount);
        }
        overdue = { need, days: Math.max(0, c.overdue.days), penalty, blocked: Boolean(c.card?.blocked), cost };
      }

      const g = product ? (c.card?.grace ?? null) : null;
      let due: Slot['due'] = null;
      const room = payoff - (overdue?.need ?? 0);
      if (next && next.status !== 'overdue' && next.remaining > 0 && dayDiff(today, next.date) <= DEBT_LIMITS.horizonDays) {
        // Tayyor karta: faqat ochiq ko'chirmaning minimali — keyingi ko'chirmaning taxmini hali so'ralmaydi
        const statementMin =
          product !== null && Boolean(next.card) && !next.card?.estimate && (!g || next.card?.statementDate === g.statementDate);
        const need = Math.min(Math.round(next.remaining), room);
        if ((product === null || statementMin) && need > 0)
          due = { need, date: next.date, daysLeft: dayDiff(today, next.date), statement: product !== null };
      } else if (overdue) {
        // Kechikkan qarz: kechikkan to'lovdan keyingi 30 kun ichidagi to'lov ham minimal (calc.next uni ko'rsatmaydi)
        const after = dueAfterOverdue(d, product, today);
        const need = after ? Math.min(after.amount, room) : 0;
        if (after && need > 0) due = { need, date: after.date, daysLeft: dayDiff(today, after.date), statement: product !== null };
      }

      const grace: Slot['grace'] = g
        ? {
            state: g.state,
            left: Math.max(0, Math.min(Math.round(g.left), payoff)),
            due: g.due,
            daysLeft: dayDiff(today, g.due),
            risk: Math.max(0, Math.round(g.risk)),
          }
        : null;

      return {
        d,
        name: nameOf(d, countOf(d)),
        product,
        payoff,
        rate,
        overdue,
        due,
        grace,
        given: 0,
        parts: { overdue: 0, min: 0, grace: 0, extra: 0 },
        firstPaid: Number.POSITIVE_INFINITY,
        firstSeen: Number.POSITIVE_INFINITY,
      };
    });

  const budget = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
  let left = budget;
  let seq = 0;
  const give = (s: Slot, kind: DebtPlanPartKind, want: number) => {
    seq += 1;
    if (s.firstSeen === Number.POSITIVE_INFINITY) s.firstSeen = seq;
    const x = Math.max(0, Math.min(Math.round(want), left, s.payoff - s.given));
    if (!(x > 0)) return 0;
    s.given += x;
    s.parts[kind] += x;
    left -= x;
    if (s.firstPaid === Number.POSITIVE_INFINITY) s.firstPaid = seq;
    return x;
  };
  const tie = (a: Slot, b: Slot) => cmp(a.name, b.name) || cmp(a.d.id, b.d.id);

  // 1. Kechikkan: kunlik jarimasi qimmatrog'i, keyin eng eskisi
  for (const s of slots
    .filter((x) => x.overdue)
    .sort((a, b) => (b.overdue?.cost ?? 0) - (a.overdue?.cost ?? 0) || (b.overdue?.days ?? 0) - (a.overdue?.days ?? 0) || tie(a, b)))
    give(s, 'overdue', s.overdue?.need ?? 0);

  // 2. 30 kun ichidagi minimal / oylik to'lov — to'lov kuni bo'yicha (bir kunda — foizi yuqorisi)
  for (const s of slots
    .filter((x) => x.due)
    .sort((a, b) => cmp(a.due?.date ?? '', b.due?.date ?? '') || b.rate - a.rate || tie(a, b)))
    give(s, 'min', s.due?.need ?? 0);

  // 3. Foizsiz davr: butun summasi yetsagina (qisman to'lov saqlamaydi), har so'mga tejash bo'yicha
  const graceNeed = (s: Slot) => (s.grace ? Math.max(0, s.grace.left - s.given) : 0);
  const open = slots.filter((s) => s.grace?.state === 'open' && s.grace.left > 0 && s.grace.risk > 0);
  for (const s of open
    .filter((x) => graceNeed(x) > 0)
    .map((x) => ({ s: x, need: graceNeed(x), ratio: (x.grace?.risk ?? 0) / Math.max(1, graceNeed(x)) }))
    .sort((a, b) => b.ratio - a.ratio || cmp(a.s.grace?.due ?? '', b.s.grace?.due ?? '') || tie(a.s, b.s))) {
    if (left >= s.need) give(s.s, 'grace', s.need);
  }
  const keptOf = (s: Slot) => Boolean(s.grace && s.grace.state === 'open' && s.grace.left > 0 && s.given >= s.grace.left);

  // 4. Qolgani: foiz ishlayotgan qarzlar foizi bo'yicha → foizsiz davri saqlangan karta → foizsiz qarzlar
  const groupOf = (s: Slot): DebtPlanGroup => {
    if (s.product) {
      const g = s.grace;
      // Ko'chirma to'langan yoki shu reja to'liq yopadi — qolgani joriy oy xaridlari (keyingi to'lov kunigacha foizsiz)
      if (g && g.state === 'open' && (g.left <= 0 || keptOf(s))) return 'free';
      // Ochiq ko'chirma yo'q: foizli qarz (5.7.3, naqd, aylanuvchi) bo'lmasa — joriy oy xaridlari
      if (!g && !(s.d.calc.monthlyInterest > 0)) return 'free';
    }
    return s.rate > 0 ? 'rate' : 'zero';
  };
  const groups = new Map<Slot, DebtPlanGroup>();
  for (const s of slots) groups.set(s, groupOf(s));
  for (const s of [...slots].sort(
    (a, b) =>
      GROUP_RANK[groups.get(a) ?? 'zero'] - GROUP_RANK[groups.get(b) ?? 'zero'] ||
      ((groups.get(a) ?? 'zero') === 'zero' ? 0 : b.rate - a.rate) ||
      cmp(a.d.calc.next?.date ?? '9999-12-31', b.d.calc.next?.date ?? '9999-12-31') ||
      tie(a, b),
  )) {
    if (!(left > 0)) break;
    give(s, 'extra', s.payoff - s.given);
  }

  const totals: Record<DebtPlanPartKind, number> = { overdue: 0, min: 0, grace: 0, extra: 0 };
  let saved = 0;
  const lines: (DebtPlanLine & { order: number })[] = [];
  for (const s of slots) {
    for (const k of DEBT_PLAN_PARTS) totals[k] += s.parts[k];
    const kept = keptOf(s);
    if (kept && s.grace) saved += s.grace.risk;
    const owed = (s.overdue?.need ?? 0) + (s.due?.need ?? 0);
    const short = Math.max(0, owed - s.parts.overdue - s.parts.min);
    if (!(s.given > 0) && !(short > 0)) continue;
    const group = groups.get(s) ?? 'zero';
    lines.push({
      debtId: s.d.id,
      name: s.name,
      kind: s.d.kind,
      product: s.product,
      amount: s.given,
      parts: DEBT_PLAN_PARTS.filter((k) => s.parts[k] > 0).map((k) => ({ kind: k, amount: s.parts[k] })),
      payoff: s.payoff,
      afterPayoff: Math.max(0, s.payoff - s.given),
      startedOn: s.d.terms.startedOn,
      trackedFrom: historyBefore(s.d),
      note: {
        overdue: s.overdue
          ? { amount: s.overdue.need, days: s.overdue.days, penalty: s.overdue.penalty, blocked: s.overdue.blocked }
          : null,
        due: s.due ? { date: s.due.date, daysLeft: s.due.daysLeft, amount: s.due.need, statement: s.due.statement } : null,
        grace: s.grace
          ? {
              ...s.grace,
              kept,
              need: s.grace.state === 'open' ? Math.max(0, s.grace.left - s.given) : 0,
            }
          : null,
        group,
        rate: s.rate,
        freeUntil: group === 'free' ? (s.d.calc.card?.nextStatement.due ?? null) : null,
        short,
      },
      // Pul tushganlar — birinchi pul tushgan navbat bo'yicha; puli yetmaganlar — oxirida, ko'rilgan navbati bo'yicha
      order: s.given > 0 ? s.firstPaid : 1e9 + s.firstSeen,
    });
  }
  lines.sort((a, b) => a.order - b.order || cmp(a.debtId, b.debtId));

  // Summadan qat'i nazar kerak bo'ladiganlar (cheksiz summadagi totals bilan bir xil)
  let needMin = 0;
  let needGrace = 0;
  let needAll = 0;
  for (const s of slots) {
    const owed = (s.overdue?.need ?? 0) + (s.due?.need ?? 0);
    needMin += owed;
    if (s.grace && s.grace.state === 'open' && s.grace.left > 0 && s.grace.risk > 0)
      needGrace += Math.max(0, s.grace.left - owed);
    needAll += s.payoff;
  }

  return {
    amount: budget,
    lines: lines.map(({ order: _order, ...line }) => line),
    totals,
    saved,
    left,
    skipped,
    needs: { min: needMin, grace: needMin + needGrace, all: needAll },
  };
}

/**
 * UI tugmachalari: "Minimallar", "Foiz ishlamasligi uchun", "Hammasi ≈" — faqat > 0 va bir-biridan farqlisi. Teng
 * bo'lsa to'liqrog'i qoladi: hammasi = minimal (masalan, muddati yaqin bir yo'la qarz) — "Hammasi"; foizsiz davr yo'q
 * (grace = min) — "Minimallar"
 */
export function debtPlanQuickAmounts(needs: DebtPaymentPlan['needs']): { kind: 'min' | 'grace' | 'all'; amount: number }[] {
  const out: { kind: 'min' | 'grace' | 'all'; amount: number }[] = [];
  if (needs.min > 0 && needs.min !== needs.all) out.push({ kind: 'min', amount: needs.min });
  if (needs.grace > 0 && needs.grace !== needs.min && needs.grace !== needs.all) out.push({ kind: 'grace', amount: needs.grace });
  if (needs.all > 0) out.push({ kind: 'all', amount: needs.all });
  return out;
}

/** "To'lovlarni yozish": har qator uchun bitta "To'ladim" yozuvi (POST /debts/:id/entries) — faqat summasi bor qatorlar */
export function debtPlanEntries(
  plan: Pick<DebtPaymentPlan, 'lines'>,
  date: string,
): { debtId: string; name: string; body: { kind: 'pay'; date: string; amount: number; category: ''; note: ''; interest: null } }[] {
  return plan.lines
    .filter((l) => l.amount > 0)
    .map((l) => ({
      debtId: l.debtId,
      name: l.name,
      body: { kind: 'pay' as const, date, amount: l.amount, category: '' as const, note: '' as const, interest: null },
    }));
}

/**
 * Yozuv sanasi: eng kechi — bugun; eng ertasi — yoziladigan qarzlarning eng kech olingan kuni (server undan oldingisini
 * rad etadi). `tracked` — shu sanadan oldingi to'lov qoldiqni o'zgartirmaydigan qarz (DebtPlanLine.trackedFrom eng kechi;
 * yangi qarzda u olingan kun — bunday sana baribir xato)
 */
export function debtPlanDateBounds(
  plan: Pick<DebtPaymentPlan, 'lines'>,
): { min: { date: string; name: string } | null; tracked: { date: string; name: string } | null } {
  let min: { date: string; name: string } | null = null;
  let tracked: { date: string; name: string } | null = null;
  for (const l of plan.lines) {
    if (!(l.amount > 0)) continue;
    if (!min || l.startedOn > min.date) min = { date: l.startedOn, name: l.name };
    if (!tracked || l.trackedFrom > tracked.date) tracked = { date: l.trackedFrom, name: l.name };
  }
  return { min, tracked };
}
