/**
 * To'lov tavsiyasi (2026-11-08): tayyor kredit kartalarda (TBC Osmon, Infin Black) foiz ishlamasligi uchun qaysi
 * kartaga qancha va qachongacha to'lash kerak. Egasining so'rovi: "foiz ishlamasligi uchun bunga buncha, bunga buncha
 * to'lash kerak".
 *
 * Yangi hisob YO'Q — faqat analyzeDebt natijasi (DebtSummary.calc) o'qiladi: raqamlar kartochka va qarz sahifasidagi
 * bilan bir xil. Qarzlar sahifasi shu funksiyani ishlatadi, Telegram eslatmalari (2-bosqich) ham shuni ishlatadi.
 *
 * Qoidalar:
 *  • faqat faol tayyor kartalar; umumiy karta va kreditlar kirmaydi (ularda foizsiz davr hisoblanmaydi);
 *  • har kartaga bitta qator: kechikkan → ochiq ko'chirma (foizsiz qolish summasi) → TBC 5.7.3 (foiz baribir) →
 *    foizsiz qismi yo'q ko'chirmaning minimali → to'langan ko'chirma (xira, summasiz);
 *  • minimal — FAQAT shu ko'chirmaniki (calc.next keyingi ko'chirmaning taxmini bo'lsa — 0);
 *  • summa bugungi yopish summasidan oshmaydi — web format.ts graceView/dueShown dagi xavfsizlik to'ri (web-2) bilan bir xil;
 *  • pul yetmasa: minimal baribir to'lanadi, ortiqcha pul foizsiz davrni saqlaydi — kartalar "har so'mga tejaladigan
 *    foiz" = xavf ÷ (foizsiz summa − minimal) bo'yicha tartiblanadi. Minimalning o'zi ko'chirmani yopadigan karta
 *    (ortiqcha pul kerak emas) bu tanlovga kirmaydi: aks holda max(1, 0) ga bo'linib "har 1 mln so'mga" milliardlar chiqardi.
 * Tayyor kartalar faqat so'mda — summalar so'm.
 */
import { CARD_PRODUCTS, dayDiff, isCardProduct, type DebtCardProduct, type DebtSummary } from './debts.js';

interface AdviceHead {
  /** Qarz id — qator shu kartaning sahifasiga olib boradi */
  id: string;
  /** "TBC Bank Osmon", "InfinBANK Black"; bir xil kartadan ikkitasi bo'lsa — nomi bilan ("TBC Bank Osmon · Biznes") */
  name: string;
  product: DebtCardProduct;
}

export type DebtAdviceRow = AdviceHead &
  (
    | {
        /** Muddati o'tgan: hoziroq to'lanadi — limit bloklangan, jarima har kuni */
        kind: 'overdue';
        amount: number;
        days: number;
        /** Taxminiy jarima (amount ichida) */
        penalty: number;
        blocked: boolean;
        /** Infin 3.5: 90 kundan ortiq — karta muddati tugaguncha bloklangan */
        blockedForGood: boolean;
      }
    | {
        /** Ochiq ko'chirma: `left` ni `due` gacha to'liq to'lasangiz foiz yo'q; `risk` — to'lanmasa qo'shiladigan foiz */
        kind: 'grace';
        left: number;
        /** Shu ko'chirmaning to'lanmagan minimali (0 — to'langan) */
        min: number;
        due: string;
        daysLeft: number;
        risk: number;
      }
    | {
        /** TBC 5.7.3: oldingi kechikish sababli bu ko'chirmada foiz baribir qo'shiladi — kamida minimal */
        kind: 'lost';
        min: number;
        due: string;
        daysLeft: number;
        risk: number;
      }
    | {
        /** Ko'chirmada foizsiz qism yo'q (Infin aylanuvchi qarz, faqat naqd/o'tkazma) — faqat minimal, foiz har kuni */
        kind: 'minOnly';
        min: number;
        due: string;
        daysLeft: number;
      }
    | {
        /** Ko'chirma to'liq to'langan — xira, summasiz */
        kind: 'done';
        nextStatement: { date: string; due: string };
      }
  );

export interface DebtAdvicePriority {
  /** Foizsiz summani yopish uchun minimaldan tashqari pul kerak bo'lgan kartalar — har so'mga tejash bo'yicha */
  order: string[];
  /** Birinchisi: minimaldan tashqari kerak pul va shu bilan tejaladigan foiz */
  extra: number;
  risk: number;
  /** round(1e6 × risk ÷ max(1, left − min)) — har 1 mln so'mga tejaladigan foiz */
  perMillion: number;
}

export interface DebtAdvice {
  /** Kechikkanlar birinchi, keyin to'lov kuni bo'yicha; to'lanadigan narsasi yo'qlari (xira) oxirida */
  rows: DebtAdviceRow[];
  /** Σ left — foizsiz qolish qatorlari */
  graceTotal: number;
  /** Σ min — foizsiz qolish qatorlari ("shundan minimal": graceTotal ichida) */
  graceMin: number;
  /**
   * Pul yetmasa avval shu: minimali qolgan hamma qator (foizsiz, 5.7.3, foizsiz qismi yo'q) va kechikkan summa —
   * kechikkan ham to'lanmagan minimal (limit bloklangan); u kirmasa, "hammasining minimali" to'langandek ko'rinardi
   */
  minTotal: number;
  /** Σ risk — foizsiz qolish va 5.7.3 qatorlari */
  riskTotal: number;
  /** Pul yetmasa qaysi kartani to'liq yopish foydaliroq — faqat ikkita va undan ko'p foizsiz qolish qatorida */
  priority: DebtAdvicePriority | null;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Shu qatorda hozir to'lanadigan narsa bormi (kechikkan alohida) */
const payable = (r: DebtAdviceRow): boolean =>
  r.kind === 'grace' || ((r.kind === 'lost' || r.kind === 'minOnly') && r.min > 0);

/** Tartib: kechikkan → to'lanadigan → xira (to'langan; minimali to'langan 5.7.3) */
const rankOf = (r: DebtAdviceRow): number => (r.kind === 'overdue' ? 0 : payable(r) ? 1 : 2);

const dueOf = (r: DebtAdviceRow): string => (r.kind === 'overdue' ? '' : r.kind === 'done' ? r.nextStatement.due : r.due);

/**
 * Faol tayyor kartalar bo'yicha to'lov tavsiyasi; to'lanadigan narsa yo'q bo'lsa (karta yo'q, hammasi to'langan) — null.
 * `today` — server savdo kuni (DebtListResponse.today): kunlar shundan sanaladi
 */
export function debtPaymentAdvice(items: ReadonlyArray<DebtSummary>, today: string): DebtAdvice | null {
  const cards = items.filter(
    (d) => d.calc.state === 'active' && d.terms.kind === 'card' && isCardProduct(d.terms.cardProduct) && d.calc.card,
  );
  const perProduct = new Map<DebtCardProduct, number>();
  for (const d of cards) {
    const p = d.terms.cardProduct as DebtCardProduct;
    perProduct.set(p, (perProduct.get(p) ?? 0) + 1);
  }

  const rows: DebtAdviceRow[] = [];
  for (const d of cards) {
    const p = d.terms.cardProduct as DebtCardProduct;
    const rules = CARD_PRODUCTS[p];
    const title = d.title.trim();
    const base = `${rules.bank} ${rules.name}`;
    // Bitta kartadan ikkitasi — nomi bilan ajratiladi (nom bo'sh yoki karta nomining o'zi bo'lsa ajratib bo'lmaydi)
    const name = (perProduct.get(p) ?? 0) > 1 && title && title !== rules.name ? `${base} · ${title}` : base;
    const head: AdviceHead = { id: d.id, name, product: p };
    const c = d.calc;
    const card = c.card;
    if (!card) continue;
    if (c.overdue) {
      rows.push({
        ...head,
        kind: 'overdue',
        amount: c.overdue.amount,
        days: c.overdue.days,
        penalty: card.penalty,
        blocked: card.blocked,
        blockedForGood: card.blockedForGood,
      });
      continue;
    }
    const g = card.grace;
    // Ochiq ko'chirma yo'q — hozir to'lanadigan narsa yo'q (keyingi ko'chirma hali chiqmagan)
    if (!g) continue;
    const payoff = Math.max(0, c.payoff);
    const next = c.next;
    const min =
      next && next.status !== 'overdue' && next.card?.statementDate === g.statementDate
        ? Math.max(0, Math.min(next.remaining, payoff))
        : 0;
    const daysLeft = dayDiff(today, g.due);
    if (g.state === 'lost') rows.push({ ...head, kind: 'lost', min, due: g.due, daysLeft, risk: g.risk });
    else if (g.state === 'none') {
      if (min > 0) rows.push({ ...head, kind: 'minOnly', min, due: g.due, daysLeft });
    } else {
      const left = Math.max(0, Math.min(g.left, payoff));
      if (left > 0) rows.push({ ...head, kind: 'grace', left, min, due: g.due, daysLeft, risk: g.risk });
      else rows.push({ ...head, kind: 'done', nextStatement: { ...card.nextStatement } });
    }
  }
  if (!rows.some((r) => r.kind === 'overdue' || payable(r))) return null;

  rows.sort(
    (a, b) =>
      rankOf(a) - rankOf(b) ||
      // Kechikkanlar — eng eskisi birinchi
      (a.kind === 'overdue' && b.kind === 'overdue' ? b.days - a.days : 0) ||
      cmp(dueOf(a), dueOf(b)) ||
      cmp(a.name, b.name) ||
      cmp(a.id, b.id),
  );

  let graceTotal = 0;
  let graceMin = 0;
  let minTotal = 0;
  let riskTotal = 0;
  const grace: Extract<DebtAdviceRow, { kind: 'grace' }>[] = [];
  for (const r of rows) {
    if (r.kind === 'grace') {
      grace.push(r);
      graceTotal += r.left;
      graceMin += r.min;
    }
    if (r.kind === 'grace' || r.kind === 'lost' || r.kind === 'minOnly') minTotal += r.min;
    else if (r.kind === 'overdue') minTotal += r.amount;
    if (r.kind === 'grace' || r.kind === 'lost') riskTotal += r.risk;
  }

  let priority: DebtAdvicePriority | null = null;
  if (grace.length >= 2) {
    const ranked = grace
      .filter((r) => r.left - r.min > 0)
      .map((r) => ({ r, extra: r.left - r.min, rate: r.risk / Math.max(1, r.left - r.min) }))
      .sort((a, b) => b.rate - a.rate || cmp(a.r.due, b.r.due) || cmp(a.r.name, b.r.name) || cmp(a.r.id, b.r.id));
    const top = ranked[0];
    if (top && top.r.risk > 0)
      priority = {
        order: ranked.map((x) => x.r.id),
        extra: top.extra,
        risk: top.r.risk,
        perMillion: Math.round((1e6 * top.r.risk) / Math.max(1, top.extra)),
      };
  }

  return {
    rows,
    graceTotal: Math.round(graceTotal),
    graceMin: Math.round(graceMin),
    minTotal: Math.round(minTotal),
    riskTotal: Math.round(riskTotal),
    priority,
  };
}
