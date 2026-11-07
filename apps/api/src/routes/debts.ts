/**
 * Qarzlar va kreditlar (2026-11-07) — sotuvchining qarzlari: odamdan, bankdan,
 * kredit karta yoki limit, nasiya.
 *
 * Qoldiq saqlanmaydi: har javobda shartlar va daftar yozuvlaridan shared
 * `analyzeDebt` bilan hisoblanadi. Sayt shakldagi oldindan ko'rishda ham shu
 * funksiyani ishlatadi — raqamlar bir xil.
 *
 * Maxfiylik — qarz shaxsiy moliya:
 *  • egasi yozgan qarz standart "Faqat men ko'raman" (ownerOnly): menejer va
 *    kuzatuvchi uni ro'yxatda ham, jamlarda ham ko'rmaydi, sahifasi 404 (bori
 *    ham bilinmasin). Menejer yozgan qarz doim jamoaga ochiq;
 *  • xodim shablonlariga (omborchi, buxgalter, marketolog) bo'lim berilmagan —
 *    shared VIEW_API_RULES da 403; pulsiz ko'rinish uchun yana `requireMoneyView`;
 *  • admin panelning "Ichini ko'rish"i qarzlarni ko'rsatmaydi (alohida API).
 *
 * Yozuvlar (to'lov, ishlatish...) Debt.updatedAt ga tegmaydi: tahrir versiyasi
 * faqat shartlar uchun — ochiq shakl "boshqa oynada o'zgargan" deb rad etilmasin.
 */
import { Router, type Request, type RequestHandler } from 'express';
import { prisma, type Debt, type DebtEntry } from '@savdoiq/db';
import {
  CARD_PRODUCTS,
  DEBT_KIND_DEFAULTS,
  DEBT_LIMITS,
  analyzeDebt,
  cardOpeningStatement,
  isCardProduct,
  compareDebts,
  debtCreateSchema,
  debtEntrySchema,
  debtTotals,
  debtUpdateSchema,
  debtUsage,
  toBusinessDate,
  viewSeesMoney,
  type DebtChannel,
  type DebtCreateInput,
  type DebtCurrency,
  type DebtDayCount,
  type DebtDetail,
  type DebtEntryInput,
  type DebtEntryKind,
  type DebtEntryRow,
  type DebtKind,
  type DebtLedgerEntry,
  type DebtListResponse,
  type DebtMinBase,
  type DebtRepayment,
  type DebtSummary,
  type DebtTerms,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { effectiveView } from '../lib/views.js';
import { getRate } from '../services/rates.js';
import { teamAudit } from '../services/team.js';

const router = Router();

/** Pulsiz ko'rinish (shablon) qarz summalarini ko'rmasin — hudud ro'yxati keyin o'zgarsa ham */
const requireMoneyView: RequestHandler = (req, _res, next) => {
  const view = effectiveView(req.ctx?.membership);
  if (viewSeesMoney(view)) return next();
  next(new AppError(403, 'view_forbidden', 'Bu bo‘lim sizning ko‘rinishingizda yopiq', { view }));
};

// requireFeature requireCompany dan KEYIN: undan oldin tarif o'rnida vaqtinchalik 'trial' turadi
router.use(requireAuth, requireCompany, requireFeature('debts'), requireMoneyView);

const STALE = 'Qarz boshqa oynada o‘zgargan — sahifani yangilang';
const NOT_FOUND = 'Qarz topilmadi';

type DebtWithEntries = Debt & { entries: DebtEntry[] };

const isoDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const dayDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** Bugun — Toshkent savdo kuni */
const today = (): string => toBusinessDate(new Date());

function roleOf(req: Request) {
  const { membership } = companyCtx(req);
  const role = membership?.role;
  return { isOwner: role === 'owner', canEdit: role === 'owner' || role === 'manager' };
}

/** Egasi bo'lmagan a'zo "Faqat men ko'raman" qarzlarni ko'rmaydi */
const visibleWhere = (req: Request, extra: Record<string, unknown> = {}) => {
  const { company } = companyCtx(req);
  return { companyId: company.id, ...(roleOf(req).isOwner ? {} : { ownerOnly: false }), ...extra };
};

function toTerms(d: Debt): DebtTerms {
  return {
    kind: d.kind as DebtKind,
    currency: d.currency as DebtCurrency,
    amount: d.amount,
    annualRate: d.annualRate,
    dayCount: d.dayCount as DebtDayCount,
    repayment: d.repayment as DebtRepayment,
    termMonths: d.termMonths,
    graceMonths: d.graceMonths,
    startedOn: isoDay(d.startedOn) as string,
    firstDueOn: isoDay(d.firstDueOn),
    payDay: d.payDay,
    dueOn: isoDay(d.dueOn),
    minPct: d.minPct,
    minBase: d.minBase as DebtMinBase,
    monthlyPayment: d.monthlyPayment,
    openingBalance: d.openingBalance,
    trackedFrom: isoDay(d.trackedFrom) as string,
    archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
    cardProduct: d.kind === 'card' && isCardProduct(d.cardProduct) ? d.cardProduct : null,
    statementDay: d.statementDay,
    cashRate: d.cashRate,
    openingBilled: d.openingBilled,
    openingMin: d.openingMin,
    openingRevolving: d.openingRevolving,
    openingOverdue: d.openingOverdue,
  };
}

const asChannel = (v: string | null): DebtChannel | null =>
  v === 'purchase' || v === 'transfer' || v === 'cash' || v === 'other' ? v : null;

const toLedger = (e: DebtEntry): DebtLedgerEntry => ({
  id: e.id,
  kind: e.kind as DebtEntryKind,
  date: isoDay(e.date) as string,
  amount: e.amount,
  category: e.category,
  note: e.note,
  interest: e.interest,
  createdAt: e.createdAt.toISOString(),
  channel: asChannel(e.channel),
  fee: e.fee,
});

/** Yangisi birinchi: sana, keyin yozilgan payt */
const newestFirst = (a: { date: string; createdAt: string }, b: { date: string; createdAt: string }) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

function summarize(d: DebtWithEntries, day: string) {
  const terms = toTerms(d);
  const ledger = d.entries.map(toLedger);
  const analysis = analyzeDebt(terms, ledger, day);
  const isCard = terms.kind === 'card';
  const uses = ledger
    .filter((e) => e.kind === 'use' || (isCard && e.kind === 'draw'))
    .map((e) => ({ date: e.date, createdAt: e.createdAt ?? '', e }))
    .sort(newestFirst);
  const last = uses[0]?.e;
  const summary: DebtSummary = {
    id: d.id,
    kind: terms.kind,
    lender: d.lender,
    title: d.title,
    note: d.note,
    ownerOnly: d.ownerOnly,
    terms,
    calc: analysis.calc,
    soon: analysis.soon,
    lastUse: last
      ? { date: last.date, amount: last.amount, category: last.category ?? '', note: last.note ?? '' }
      : null,
    entryCount: d.entries.length,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
  return { summary, analysis, ledger };
}

async function findVisible(req: Request, id: string): Promise<DebtWithEntries> {
  const d = await prisma.debt.findFirst({ where: visibleWhere(req, { id }), include: { entries: true } });
  if (!d) throw AppError.notFound(NOT_FOUND);
  return d;
}

async function loadDetail(req: Request, id: string): Promise<DebtDetail> {
  const d = await findVisible(req, id);
  const day = today();
  const { summary, analysis, ledger } = summarize(d, day);
  const { isOwner, canEdit } = roleOf(req);
  const entries: DebtEntryRow[] = d.entries
    .map((e, i) => ({
      id: e.id,
      kind: e.kind as DebtEntryKind,
      date: ledger[i].date,
      amount: e.amount,
      category: e.category,
      note: e.note,
      interest: e.interest,
      createdAt: e.createdAt.toISOString(),
      channel: ledger[i].channel ?? null,
      fee: e.fee,
      ...analysis.entries[i],
    }))
    .sort(newestFirst);
  return {
    ...summary,
    entries,
    schedule: analysis.schedule.slice(0, DEBT_LIMITS.scheduleRows),
    usage: debtUsage(ledger, summary.kind === 'card'),
    canEdit,
    isOwner,
    today: day,
  };
}

/**
 * Shartlarni bazaga yoziladigan ko'rinishga keltiradi va server qoidalarini tekshiradi.
 * `trackedFrom` — kuzatuv boshi: yaratishda bugun, tahrirda saqlangani.
 */
function termsData(v: DebtCreateInput, day: string, trackedFrom: string, isOwner: boolean, prevOwnerOnly: boolean | null) {
  const def = DEBT_KIND_DEFAULTS[v.kind];
  const repayment = v.kind === 'card' ? 'interest' : (v.repayment ?? def.repayment);
  const monthly = repayment !== 'lump';
  if (v.startedOn > day) throw AppError.badRequest('Qarz olingan sana kelajakda bo‘lishi mumkin emas');
  if (monthly && v.firstDueOn && v.kind !== 'card') {
    // Avvaldan bor qarz: bank ilovasidagi qoldiq bilan birga keyingi to'lov sanasi kerak
    if (v.openingBalance != null && v.firstDueOn < trackedFrom)
      throw AppError.badRequest('Keyingi to‘lov sanasi bugundan oldin bo‘lmaydi');
    if (v.openingBalance == null && v.firstDueOn < trackedFrom)
      throw AppError.badRequest('Birinchi to‘lov o‘tib ketgan — bank ilovasidagi hozirgi qoldiqni va keyingi to‘lov sanasini kiriting');
  }
  const termed = repayment === 'equal' || repayment === 'decreasing';
  // Tayyor karta: bank qoidalari kodda (CARD_PRODUCTS) — foiz kunlik/365, minimal "N% asosiy qarz + foiz",
  // Infin'da hisobot kuni 1 va minimal 5% (hammaga bir xil); TBC'da hisobot kuni va minimal % — mijozniki
  const product = v.kind === 'card' && v.cardProduct ? CARD_PRODUCTS[v.cardProduct] : null;
  const statementDay = product ? (product.statement === 'monthStart' ? (product.statementDay ?? 1) : (v.statementDay ?? null)) : null;
  if (product && v.cardProduct) {
    // Kuzatuv boshida ko'chirma ochiq (to'lov kuni kelmagan) va qarz bor: minimal to'lov bank ilovasidan bo'lsin.
    // Aks holda hisob "N% × butun qarz"ni bankniki deb ko'rsatardi (aylanuvchi qarzda foizsiz) — tahrirda to'lov
    // sanasi tuzatilib ko'chirma ochiq bo'lib qolsa ham shu (API-2). Dvigatel bilan bir xil qoida — cardOpeningStatement
    const open0 = cardOpeningStatement({ cardProduct: v.cardProduct, statementDay, trackedFrom });
    if (open0?.pending && (v.openingBalance ?? 0) > 0 && v.openingMin == null)
      throw AppError.badRequest('Ilovadagi minimal to‘lovni kiriting');
  }
  return {
    kind: v.kind,
    lender: v.lender,
    title: v.title,
    currency: product ? product.currency : v.currency,
    amount: v.amount,
    annualRate: v.annualRate,
    dayCount: product ? 'act365' : (v.dayCount ?? def.dayCount),
    repayment,
    termMonths: termed ? (v.termMonths ?? null) : null,
    graceMonths: termed ? v.graceMonths : 0,
    startedOn: dayDate(v.startedOn),
    firstDueOn: monthly && v.firstDueOn ? dayDate(v.firstDueOn) : null,
    // 29–31 tanlansa qisqa oyda oy oxiri, keyingi oyda yana o'sha kun (31.12, 31.01…)
    payDay: monthly && v.firstDueOn ? (v.payDay ?? null) : null,
    dueOn: (repayment === 'lump' || repayment === 'interest') && v.dueOn ? dayDate(v.dueOn) : null,
    minPct:
      repayment !== 'interest'
        ? 0
        : product && !product.minPctEditable
          ? product.minPctDefault
          : (v.minPct ?? product?.minPctDefault ?? def.minPct),
    minBase: product ? 'principal' : (v.minBase ?? def.minBase),
    monthlyPayment: repayment === 'equal' ? (v.monthlyPayment ?? null) : null,
    openingBalance: v.openingBalance ?? null,
    // Menejer yozgan qarz jamoaga ochiq; egasi tanlaydi (standart — faqat o'zi)
    ownerOnly: isOwner ? (v.ownerOnly ?? prevOwnerOnly ?? true) : (prevOwnerOnly ?? false),
    note: v.note,
    cardProduct: product ? v.cardProduct : null,
    statementDay,
    cashRate: product && product.separateCashRate ? (v.cashRate ?? null) : null,
    openingBilled: product ? (v.openingBilled ?? null) : null,
    openingMin: product ? (v.openingMin ?? null) : null,
    openingRevolving: product ? (v.openingRevolving ?? null) : null,
    openingOverdue: product ? (v.openingOverdue ?? null) : null,
  };
}

/** Bazadagi qarz — yaratish sxemasining kirishi ko'rinishida (tahrirni birlashtirish uchun) */
const inputOf = (d: Debt) => ({
  kind: d.kind,
  lender: d.lender,
  title: d.title,
  currency: d.currency,
  amount: d.amount,
  annualRate: d.annualRate,
  dayCount: d.dayCount,
  repayment: d.repayment,
  termMonths: d.termMonths,
  graceMonths: d.graceMonths,
  startedOn: isoDay(d.startedOn),
  firstDueOn: isoDay(d.firstDueOn),
  payDay: d.payDay,
  dueOn: isoDay(d.dueOn),
  minPct: d.minPct,
  minBase: d.minBase,
  monthlyPayment: d.monthlyPayment,
  openingBalance: d.openingBalance,
  ownerOnly: d.ownerOnly,
  note: d.note,
  cardProduct: d.kind === 'card' && isCardProduct(d.cardProduct) ? d.cardProduct : null,
  statementDay: d.statementDay,
  cashRate: d.cashRate,
  openingBilled: d.openingBilled,
  openingMin: d.openingMin,
  openingRevolving: d.openingRevolving,
  openingOverdue: d.openingOverdue,
});

/** Yozuvni tekshirish; karta "ishlatildi"si qarzni oshiradi — "draw" bo'lib saqlanadi */
function entryData(d: DebtWithEntries, body: DebtEntryInput, day: string, replacingId: string | null) {
  const isCard = d.kind === 'card';
  const startedOn = isoDay(d.startedOn) as string;
  if (body.date > day) throw AppError.badRequest('Sana kelajakda bo‘lishi mumkin emas');
  if (body.date < startedOn) throw AppError.badRequest('Qarz olingan kundan oldingi yozuv bo‘lmaydi');
  const kind: DebtEntryKind = isCard && body.kind === 'use' ? 'draw' : body.kind;
  if (kind === 'draw' && !isCard && (d.repayment === 'equal' || d.repayment === 'decreasing') && d.kind === 'bank')
    throw AppError.badRequest('Bank kreditiga qo‘shimcha summa — alohida qarz sifatida yozing');
  // Tayyor kartadan ishlatish: xarid (foizsiz davr) yoki o'tkazma/naqd (foiz darhol + komissiya qarzga)
  const productCard = isCard && isCardProduct(d.cardProduct);
  const channel: DebtChannel | null = productCard && kind === 'draw' ? (body.channel ?? 'purchase') : null;
  const data = {
    kind,
    date: dayDate(body.date),
    amount: body.amount,
    category: kind === 'use' || kind === 'draw' ? body.category : '',
    note: body.note,
    interest: kind === 'pay' && !productCard ? (body.interest ?? null) : null,
    channel,
    fee: channel && channel !== 'purchase' ? (body.fee ?? null) : null,
  };
  if (isCard && kind === 'draw') {
    // Limitdan oshmasin — faqat qarzni OSHIRADIGAN yozuvda. Limit kamaytirilib limitdan oshib qolgan kartada
    // izoh yoki turkumni tuzatish, summani kamaytirish mumkin bo'lsin (ilgari hammasi "Limitdan oshadi" edi).
    // Tahrirlangan yozuv asl createdAt bilan o'ynaladi: bir kundagi yozuvlar tartibi o'zgarmasin (ilgari "hozir"
    // bilan oxirga o'tib, limitdan uzoq kartada ham izohni tuzatish rad etilardi)
    const terms = toTerms(d);
    const ledger = d.entries.map(toLedger);
    const orig = replacingId ? ledger.find((e) => e.id === replacingId) : undefined;
    const others = ledger.filter((e) => e.id !== replacingId);
    const eps = d.currency === 'USD' ? 0.005 : 0.5;
    // "Oldin" ham "keyin" bilan bir xil asosda: tahrirlanayotgan yozuvning eski komissiyasisiz. Aks holda summa
    // eski komissiyagacha oshirilsa "qarz oshmadi" deb limitdan o'tib ketardi (API-3)
    const before = analyzeDebt(
      terms,
      replacingId ? ledger.map((e) => (e.id === replacingId ? { ...e, fee: null } : e)) : ledger,
      day,
    ).calc.principal;
    // id ham asliniki: bir millisekunddagi yozuvlar id bo'yicha tartiblanadi (saqlangan tartib bilan bir xil)
    // Limit — faqat operatsiya summasi bo'yicha: komissiya limitdan oshsa bank texnik overdraft beradi (TBC 5.3)
    const added = {
      id: orig?.id,
      kind,
      date: body.date,
      amount: body.amount,
      createdAt: orig?.createdAt ?? new Date().toISOString(),
      channel: data.channel,
    };
    const after = analyzeDebt(terms, [...others, added], day).calc.principal;
    if (after > d.amount + eps && after > before + eps) throw AppError.badRequest('Limitdan oshadi — limitni tahrirlang');
  }
  return data;
}

/**
 * Yangi yoki arxivdan qaytarilgan qarzga joy bormi. Faol qarzlar — maxDebts: arxivlash joy bo'shatadi (o'chirish
 * oynasi "yopilgan bo'lsa arxivlash kifoya" deydi; ilgari arxivdagilar ham sanalib, xato "arxivlang" deb
 * yordam bermasdi). Arxiv bilan jami — maxDebtsTotal (yaratishda), bunda faqat o'chirish yordam beradi.
 */
async function assertDebtRoom(companyId: string, isOwner: boolean, creating = true) {
  const [active, total] = await Promise.all([
    prisma.debt.count({ where: { companyId, archivedAt: null } }),
    creating ? prisma.debt.count({ where: { companyId } }) : Promise.resolve(0),
  ]);
  const full = active >= DEBT_LIMITS.maxDebts || total >= DEBT_LIMITS.maxDebtsTotal;
  // Chegara kompaniya bo'yicha: egasi ko'radigan (faqat o'zi ko'radigan) qarzlar ham sanaladi. Menejerga
  // son va "arxivlang" deyilmaydi — u ularni ko'rmaydi ham, arxivlay ham olmaydi
  if (full && !isOwner)
    throw AppError.badRequest('Kompaniyada qarzlar soni chegarasiga yetildi — kompaniya egasiga murojaat qiling');
  if (active >= DEBT_LIMITS.maxDebts)
    throw AppError.badRequest(`Faol qarzlar soni chegarasi — ${DEBT_LIMITS.maxDebts} ta. Yopilganlarini arxivlang yoki o‘chiring`);
  if (total >= DEBT_LIMITS.maxDebtsTotal)
    throw AppError.badRequest(`Qarzlar soni chegarasi (arxiv bilan) — ${DEBT_LIMITS.maxDebtsTotal} ta. Keraksizlarini o‘chiring`);
}

/** GET / — qarzlar ro'yxati va jamlar (eng shoshilinchi birinchi) */
router.get(
  '/',
  ah(async (req, res) => {
    const day = today();
    // Cheklov yo'q: soni yaratishda chegaralangan (arxiv bilan maxDebtsTotal); ilgari take bir vaqtdagi
    // yaratishlardan keyin ortiqcha qarzni ro'yxat va jamlardan jimgina tushirib qoldirardi
    const rows = await prisma.debt.findMany({
      where: visibleWhere(req),
      include: { entries: true },
    });
    const items = rows.map((d) => summarize(d, day).summary).sort(compareDebts);
    // Kurs faqat ishlatilgan valyutalar uchun: hammasi so'm bo'lsa tashqariga so'rov yo'q
    const rates: DebtListResponse['rates'] = {};
    const foreign = [...new Set(items.filter((i) => i.calc.state === 'active').map((i) => i.terms.currency))].filter(
      (c) => c !== 'UZS',
    );
    for (const c of foreign) {
      const r = await getRate(c);
      rates[c] = { rate: r.rate, source: r.source, updatedAt: r.updatedAt };
    }
    const { isOwner, canEdit } = roleOf(req);
    res.json({ today: day, items, totals: debtTotals(items, rates), rates, canEdit, isOwner } satisfies DebtListResponse);
  }),
);

/** POST / — yangi qarz */
router.post(
  '/',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company, user } = companyCtx(req);
    const body = debtCreateSchema.parse(req.body ?? {});
    await assertDebtRoom(company.id, roleOf(req).isOwner);
    const day = today();
    const data = termsData(body, day, day, roleOf(req).isOwner, null);
    const created = await prisma.debt.create({
      data: { ...data, companyId: company.id, trackedFrom: dayDate(day), createdById: user.id },
    });
    res.status(201).json(await loadDetail(req, created.id));
  }),
);

/** GET /:id — qarz sahifasi: holat, kelgusi to'lovlar, ishlatilishi, tarix */
router.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await loadDetail(req, String(req.params.id)));
  }),
);

/** PATCH /:id — shartlarni tahrirlash yoki arxivlash (versiya bilan) */
router.patch(
  '/:id',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);
    const { expectedUpdatedAt, archived, ...patch } = debtUpdateSchema.parse(req.body ?? {});
    const d = await findVisible(req, id);
    const expected = new Date(expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) throw AppError.conflict(STALE);
    const { isOwner } = roleOf(req);
    if (!isOwner && patch.ownerOnly !== undefined && patch.ownerOnly !== d.ownerOnly)
      throw AppError.forbidden('«Faqat men ko‘raman»ni faqat kompaniya egasi o‘zgartiradi');
    if (patch.kind !== undefined && (patch.kind === 'card') !== (d.kind === 'card'))
      throw AppError.badRequest('Kartani boshqa turga (yoki aksincha) o‘zgartirib bo‘lmaydi — yangi qarz yozing');
    // Tayyor karta hisobi boshqacha (hisobot kuni, foizsiz davr) — tarix boshqa qoidada qayta hisoblanmasin
    if (patch.cardProduct !== undefined && (patch.cardProduct ?? null) !== (isCardProduct(d.cardProduct) ? d.cardProduct : null))
      throw AppError.badRequest('Karta turini o‘zgartirib bo‘lmaydi — yangi qarz sifatida yozing');

    // Mavjud shartlar + o'zgarishlar yaratish sxemasi bilan qayta tekshiriladi
    const changes = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const base = inputOf(d);
    // Sana o'zgarib, kun aytilmasa — eski kun sanaga zid kelib qolmasin
    if ('firstDueOn' in changes && !('payDay' in changes)) base.payDay = null;
    const merged = debtCreateSchema.parse({ ...base, ...changes });
    const day = today();
    const data = termsData(merged, day, isoDay(d.trackedFrom) as string, isOwner, d.ownerOnly);
    const firstEntry = d.entries.reduce<string | null>((min, e) => {
      const iso = isoDay(e.date) as string;
      return min == null || iso < min ? iso : min;
    }, null);
    if (firstEntry && merged.startedOn > firstEntry)
      throw AppError.badRequest('Bu sanadan oldin yozuvlar bor — qarz olingan sanani ulardan keyin qo‘yib bo‘lmaydi');
    // Arxivdan qaytarish faol qarzlar chegarasiga kiradi
    if (archived === false && d.archivedAt) await assertDebtRoom(company.id, isOwner, false);

    const updated = await prisma.debt.updateMany({
      where: { id, companyId: company.id, updatedAt: expected },
      data: {
        ...data,
        ...(archived === undefined ? {} : { archivedAt: archived ? (d.archivedAt ?? new Date()) : null }),
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) throw AppError.conflict(STALE);
    res.json(await loadDetail(req, id));
  }),
);

/** DELETE /:id — qarz va uning barcha yozuvlari */
router.delete(
  '/:id',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { user } = companyCtx(req);
    const id = String(req.params.id);
    const d = await findVisible(req, id);
    const result = await prisma.debt.deleteMany({ where: visibleWhere(req, { id }) });
    if (result.count === 0) throw AppError.notFound(NOT_FOUND);
    // Ism va summa yozilmaydi — faqat nima o'chirilgani
    await teamAudit(req, user.id, 'debt.delete', 'debt', id, {
      kind: d.kind,
      currency: d.currency,
      entries: d.entries.length,
    });
    res.json({ ok: true, id });
  }),
);

/** POST /:id/entries — to'landi, ishlatildi, yana olindi, qoldiq tenglashtirildi */
router.post(
  '/:id/entries',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { user } = companyCtx(req);
    const id = String(req.params.id);
    const d = await findVisible(req, id);
    const body = debtEntrySchema.parse(req.body ?? {});
    if (d.entries.length >= DEBT_LIMITS.maxEntries)
      throw AppError.badRequest(`Bitta qarzda ${DEBT_LIMITS.maxEntries} tadan ortiq yozuv bo‘lmaydi`);
    const data = entryData(d, body, today(), null);
    await prisma.debtEntry.create({ data: { ...data, debtId: d.id, createdById: user.id } });
    res.status(201).json(await loadDetail(req, id));
  }),
);

/** PATCH /:id/entries/:entryId — yozuvni tuzatish */
router.patch(
  '/:id/entries/:entryId',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const id = String(req.params.id);
    const entryId = String(req.params.entryId);
    const d = await findVisible(req, id);
    if (!d.entries.some((e) => e.id === entryId)) throw AppError.notFound('Yozuv topilmadi');
    const body = debtEntrySchema.parse(req.body ?? {});
    const data = entryData(d, body, today(), entryId);
    await prisma.debtEntry.updateMany({ where: { id: entryId, debtId: d.id }, data });
    res.json(await loadDetail(req, id));
  }),
);

/** DELETE /:id/entries/:entryId */
router.delete(
  '/:id/entries/:entryId',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const id = String(req.params.id);
    const entryId = String(req.params.entryId);
    const d = await findVisible(req, id);
    const result = await prisma.debtEntry.deleteMany({ where: { id: entryId, debtId: d.id } });
    if (result.count === 0) throw AppError.notFound('Yozuv topilmadi');
    res.json(await loadDetail(req, id));
  }),
);

export default router;
