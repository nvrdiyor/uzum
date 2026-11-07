/**
 * Kundalik yozuv oynasining mantig'i (React'siz): oldindan ko'rish — yozuv bilan qarz qanday bo'ladi (shared
 * analyzeDebt, server bilan bir xil), kartadagi limit tekshiruvi (server entryData kabi) va tayyor kartada
 * "Qoldiqni tenglashtirish" asosi. Oyna — EntryModal.tsx.
 */
import {
  analyzeDebt,
  type DebtCalc,
  type DebtChannel,
  type DebtDetail,
  type DebtEntryKind,
  type DebtEntryResult,
  type DebtLedgerEntry,
} from '@savdoiq/shared';
import { toLedger } from './format';

/** Oynadagi yozuv (saqlanadigan ko'rinishda) */
export interface EntryDraft {
  /** Tahrirlanayotgan yozuv (yangisida null) */
  id: string | null;
  /** Tahrirda — asl createdAt (bir kundagi yozuvlar tartibi o'zgarmasin); yangisida — hozir (o'sha kunning oxirgisi) */
  createdAt: string;
  kind: DebtEntryKind;
  date: string;
  amount: number;
  interest: number | null;
  /** Tayyor kartadan ishlatish: kanal va komissiya (boshqasida null) */
  channel: DebtChannel | null;
  fee: number | null;
}

export interface EntryPreview {
  calc: DebtCalc;
  /** Shu yozuvning natijasi (to'lovda — foiz va asosiy qarzga bo'linishi) */
  result: DebtEntryResult;
  /** "Ortiqcha to'landi" — shu yozuvsiz holatda (tahrirda tahrirlanayotgan yozuvsiz) */
  overpaidBefore: number;
  /** Limit tekshiruvi: yozuvdan keyingi asosiy qarz komissiyasiz — limit faqat operatsiya summasi bo'yicha */
  limitPrincipal: number;
  /** Limit tekshiruvi: yozuvdan oldingi asosiy qarz — tahrirda tahrirlanayotgan yozuv eski komissiyasisiz */
  limitBefore: number;
}

/**
 * Izoh va turkum hisobga ta'sir qilmaydi (analyzeDebt ularni o'qimaydi) — ular bu yerga berilmaydi: oyna ular
 * o'zgarganda qayta hisoblamaydi (kam minimalli TBC kartada bitta analyzeDebt yuzlab ms edi, F7)
 */
export function entryPreview(base: Pick<DebtDetail, 'terms' | 'entries' | 'today' | 'calc'>, d: EntryDraft): EntryPreview {
  const all = toLedger(base.entries);
  const ledger = all.filter((e) => e.id !== d.id);
  const added: DebtLedgerEntry = {
    id: d.id ?? 'new',
    kind: d.kind,
    date: d.date,
    amount: d.amount,
    interest: d.interest,
    createdAt: d.createdAt,
    channel: d.channel,
    fee: d.fee,
  };
  const a = analyzeDebt(base.terms, [...ledger, added], base.today);
  // Tahrirda "ortiqcha to'landi" shu yozuvsiz holatga nisbatan: server ma'lumoti tahrirlanayotgan yozuvni ham o'z
  // ichiga oladi — ilgari 21 mln lik ortiqcha to'lov o'zgarmasa ham "ortiqcha yo'q", 21,5 mln da "500 000" chiqardi
  const overpaidBefore = d.id !== null ? analyzeDebt(base.terms, ledger, base.today).calc.overpaid : base.calc.overpaid;
  // Limit — faqat operatsiya summasi bo'yicha (server kabi): komissiya limitdan oshsa bank texnik overdraft beradi
  const limitPrincipal = d.fee ? analyzeDebt(base.terms, [...ledger, { ...added, fee: null }], base.today).calc.principal : a.calc.principal;
  // "Oldin" ham shu asosda: tahrirlanayotgan yozuv eski komissiyasisiz (server entryData kabi). Aks holda summa eski
  // komissiyagacha oshirilsa "qarz oshmadi" deb limitdan o'tib ketardi (API-3)
  const stored = d.id !== null ? all.find((e) => e.id === d.id) : undefined;
  const limitBefore =
    stored && stored.fee != null && stored.fee > 0
      ? analyzeDebt(base.terms, [...ledger, { ...stored, fee: null }], base.today).calc.principal
      : base.calc.principal;
  return { calc: a.calc, result: a.entries[a.entries.length - 1], overpaidBefore, limitPrincipal, limitBefore };
}

/**
 * Kartada limitdan oshish — faqat qarzni OSHIRADIGAN yozuvda: limitdan oshib qolgan kartada (limit kamaytirilgan)
 * izoh yoki turkumni tuzatish, summani kamaytirish mumkin bo'lsin (server ham shunday tekshiradi)
 */
export const overLimitOf = (p: Pick<EntryPreview, 'limitPrincipal' | 'limitBefore'>, limit: number, eps: number): boolean =>
  p.limitPrincipal > limit + eps && p.limitPrincipal > p.limitBefore + eps;

/**
 * "Qoldiqni tenglashtirish" asosi. Tayyor kartada — bank ilovasidagi UMUMIY qarz (asosiy qarz + ko'chirmadagi va
 * yig'ilgan foiz + jarima): hisob shu bilan solishtiradi, shu raqam yozilsa hech narsa o'zgarmaydi. Ilgari asosiy qarz
 * ko'rsatilib, o'sha yozilsa foiz o'chib, asosiy qarz kamayardi (F2, web-1). Boshqa qarzlarda — asosiy qarz
 */
export const adjustBase = (calc: Pick<DebtCalc, 'principal' | 'accruedInterest'>, productCard: boolean): number =>
  productCard ? calc.principal + calc.accruedInterest : calc.principal;
