/**
 * "Qarz qo'shish" / "Qarzni tahrirlash" oynasi (telefonda — pastdan chiqadigan varaq).
 *
 *  1-qadam: to'rtta tur plitkasi. 2-qadam: faqat shu turning maydonlari;
 *  kam ishlatiladiganlari yig'ilgan "Qo'shimcha" ichida.
 *
 * Oldindan ko'rish (oylik to'lov, 1-oy foizi, jami foiz, tugash sanasi) shared
 * analyzeDebt'dan — server saqlagandan keyin aynan shu raqamlarni ko'rsatadi.
 * Buning uchun shartlar serverdagi termsData kabi yig'iladi: tur standartlari,
 * kartada doim "interest", muddatsiz to'lovda termMonths null va hokazo.
 *
 * Avvaldan bor qarz: birinchi to'lov sanasi bugundan oldin bo'lsa, server
 * bank ilovasidagi hozirgi qoldiqni so'raydi (aks holda o'tgan oylar "kechikkan"
 * bo'lib chiqardi). Shakl estimateOldLoan bilan to'ldiradi — har to'lov o'z
 * vaqtida bo'lgan deb; sotuvchi bank ilovasi bilan solishtiradi.
 *
 * Shakl mantig'i (holat, tekshiruv, so'rov) — formModel.ts; bu yerda faqat oyna.
 *
 * Kredit kartada avval karta tanlanadi: TBC Osmon, Infin Black (bank shartlari
 * kodda — sotuvchi faqat ilovadagi raqamlarni yozadi) yoki "Boshqa karta" (umumiy
 * hisob, maydonlari avvalgidek). Tahrirda karta o'zgarmaydi (server ham rad etadi).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CARD_PRODUCTS,
  DEBT_LIMITS,
  addMonthsAnchored,
  analyzeDebt,
  formatDebtMoney,
  type DebtAnalysis,
  type DebtCardProduct,
  type DebtCurrency,
  type DebtDayCount,
  type DebtDetail,
  type DebtKind,
  type DebtRepayment,
  type DebtTerms,
} from '@savdoiq/shared';
import { AlertTriangle, ChevronDown, Info } from '@/components/icons';
import { Button, Modal, Segmented, Toggle, toast } from '@/components/ui';
import { NumberField } from '@/components/unit/NumberField';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CardProductTiles, KIND_ICON, KindTiles, productSub } from './kinds';
import { MoneyField } from './MoneyField';
import { Choice, CountField, DateField, FieldNote, PctField, TextField } from './fields';
import { addDays, compactMoney, isIsoDay, minRuleText, parseDecimal, pctNum, toLedger } from './format';
import {
  LAST_DUE_WINDOW,
  MORE_FIELDS,
  PRODUCT_MORE_FIELDS,
  blank,
  build,
  fromDebt,
  moneyKey,
  productOf,
  round6,
  type FieldKey,
  type FormState,
  type MinMode,
} from './formModel';

/** Tez tanlash uchun — sotuvchi o'z bankini yozsa ham bo'ladi */
const BANKS = [
  'Kapitalbank',
  'Hamkorbank',
  'Ipak Yo‘li',
  'Uzum Bank',
  'TBC',
  'Anorbank',
  'Agrobank',
  'SQB',
  'Xalq banki',
  'NBU',
  'Asakabank',
  'Ipoteka',
  'InfinBank',
  'Davr bank',
];

export function DebtFormModal({
  open,
  onClose,
  initialKind = null,
  debt = null,
  today,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  /** Bo'sh sahifadagi plitkadan — shakl shu tur bilan ochiladi */
  initialKind?: DebtKind | null;
  /** Tahrirlanayotgan qarz (yangisida null) */
  debt?: DebtDetail | null;
  /** Serverdagi savdo kuni (Toshkent) */
  today: string;
  isOwner: boolean;
}) {
  // Har ochilishda shakl yangidan (oldingi yozilgan qolib ketmasin); yopilish animatsiyasi buzilmaydi
  const [seq, setSeq] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSeq((n) => n + 1);
  }
  if (seq === 0) return null;
  return (
    <FormDialog key={seq} open={open} onClose={onClose} initialKind={initialKind} debt={debt} today={today} isOwner={isOwner} />
  );
}

function FormDialog({
  open,
  onClose,
  initialKind,
  debt,
  today,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  initialKind: DebtKind | null;
  debt: DebtDetail | null;
  today: string;
  isOwner: boolean;
}) {
  const t = useT('debts');
  const tc = useT('common');
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const banksId = useId();

  const [s, setS] = useState<FormState>(() => (debt ? fromDebt(debt) : blank(initialKind, today, isOwner)));
  // Ochilgan paytdagi versiya: boshqa oynadagi o'zgarish ustidan yozilmasin (409)
  const [version] = useState(() => debt?.updatedAt ?? null);
  // Oldindan ko'rish tahrirda daftar bilan (ochilgan paytdagisi)
  const [ledger] = useState(() => (debt ? toLedger(debt.entries) : []));
  const [tried, setTried] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setS((p) => ({ ...p, [key]: value }));
  const anchor = debt ? debt.terms.trackedFrom : today;
  const built = build(s, { today, anchor, edit: debt, isOwner, t, dateText: f.date });
  const err = (k: FieldKey): string | null => (tried ? (built.errors[k] ?? null) : null);
  const hasErrors = Object.keys(built.errors).length > 0;

  const analysis = useMemo<DebtAnalysis | null>(
    () => (built.blocking || !s.kind ? null : analyzeDebt(built.terms, ledger, today)),
    // built har chizishda yangi obyekt — kalit sifatida shartlarning o'zi
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(built.terms), built.blocking, s.kind, ledger, today],
  );
  const termsChanged = debt !== null && debt.entryCount > 0 && moneyKey(built.terms) !== moneyKey(debt.terms);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      debt ? api.patch<DebtDetail>(`/debts/${debt.id}`, { ...body, expectedUpdatedAt: version }) : api.post<DebtDetail>('/debts', body),
    onSuccess: (saved) => {
      qc.setQueryData(['debt', saved.id], saved);
      void qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success(debt ? t('toast.saved') : t('toast.created'));
      onClose();
      if (!debt) navigate(`/debts/${saved.id}`);
    },
    onError: (err: unknown) => {
      toast.error(t('toast.saveError'), err instanceof Error ? err.message : undefined);
      // Boshqa oynada o'zgargan — eski shakl yangisini ustidan yozmasin: sahifa yangisini oladi, oyna yopiladi
      if (debt && err instanceof ApiError && err.status === 409) {
        void qc.invalidateQueries({ queryKey: ['debt', debt.id] });
        onClose();
      }
    },
  });

  const product = productOf(s);
  // Yangi kredit karta: avval karta tanlanadi (hech biri oldindan tanlanmagan)
  const pickingCard = s.kind === 'card' && s.cardProduct === null;

  const submit = () => {
    setTried(true);
    const keys = Object.keys(built.errors) as FieldKey[];
    if (keys.length) {
      const more = product ? PRODUCT_MORE_FIELDS : MORE_FIELDS;
      if (keys.some((k) => more.includes(k))) set('more', true);
      return;
    }
    save.mutate(built.body);
  };

  /** Tur tanlandi: umumiy maydonlar (kimdan, summa, valyuta) saqlanadi, qolgani tur standartidan */
  const pickKind = (kind: DebtKind) =>
    setS((p) => ({
      ...blank(kind, today, isOwner),
      lender: p.lender,
      title: p.title,
      note: p.note,
      currency: p.currency,
      amount: p.amount,
      ownerOnly: p.ownerOnly,
    }));

  /**
   * Karta tanlandi: limit, hozirgi qarz, nom va izoh saqlanadi; foiz, sanalar va ochiq ko'chirma — yangidan
   * (boshqa kartaning foizi yoki to'lov sanasi jimgina o'tib ketmasin). Tayyor kartada so'm va bankning minimal %i
   */
  const pickProduct = (p: DebtCardProduct | 'other') =>
    setS((prev) => ({
      ...blank('card', today, isOwner),
      cardProduct: p,
      lender: prev.lender,
      title: prev.title,
      note: prev.note,
      currency: p === 'other' ? prev.currency : CARD_PRODUCTS[p].currency,
      amount: prev.amount,
      cardDebt: prev.cardDebt,
      ownerOnly: prev.ownerOnly,
      minPct: p === 'other' ? String(DEBT_LIMITS.cardMinPct) : String(CARD_PRODUCTS[p].minPctDefault),
    }));

  const setStarted = (v: string) =>
    setS((p) => ({
      ...p,
      startedOn: v,
      // Birinchi to'lov qo'lda o'zgartirilmagan bo'lsa — olingan kundan bir oy keyin
      firstDueOn: !p.firstDueTouched && isIsoDay(v) ? addMonthsAnchored(v, 1) : p.firstDueOn,
    }));
  const setFirstDue = (v: string) => setS((p) => ({ ...p, firstDueOn: v, firstDueTouched: true }));

  const kind = s.kind;
  const Icon = kind ? KIND_ICON[kind] : null;
  const mode = built.mode;
  const stored = mode === 'stored';

  const currencyPick = (
    <Segmented<DebtCurrency>
      size="sm"
      value={s.currency}
      onChange={(v) => set('currency', v)}
      options={[
        { value: 'UZS', label: t('unit.uzs') },
        { value: 'USD', label: '$' },
      ]}
    />
  );

  // Foiz: odamdan qarzda "oyiga" yoki "yiliga", boshqalarda yillik. Saqlanadigani doim yillik
  const shownRate = s.ratePer === 'month' ? Math.round((s.annual / 12) * 10000) / 10000 : s.annual;
  const rateHint =
    err('rate') ??
    (s.annual > 0
      ? s.ratePer === 'month'
        ? t('f.rateYearHint', { v: pctNum(s.annual, f.lang) })
        : t('f.rateMonthHint', { v: pctNum(s.annual / 12, f.lang) })
      : undefined);
  const rateInput = (label: string) => (
    <NumberField
      label={label}
      value={shownRate}
      onChange={(v) => set('annual', s.ratePer === 'month' ? round6(v * 12) : v)}
      suffix="%"
      min={0}
      max={s.ratePer === 'month' ? DEBT_LIMITS.rateMax / 12 : DEBT_LIMITS.rateMax}
      // step 0.1 bo'lganda 28,25% yoki oylikka o'girilgan 2,3333% ni brauzer rad etib, forma jim yuborilmasdi
      step="any"
      tone={err('rate') ? 'danger' : 'default'}
      hint={rateHint}
    />
  );
  // "oyiga / yiliga" tanlagichi maydon yonida (NumberField yorlig'i ichida tugma bo'lmasin — <label> ichida tugma noto'g'ri)
  const rateField = (label: string) =>
    kind === 'person' ? (
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        {rateInput(label)}
        <Segmented<'month' | 'year'>
          size="sm"
          className="mt-8"
          value={s.ratePer}
          onChange={(v) => set('ratePer', v)}
          options={[
            { value: 'month', label: t('f.perMonth') },
            { value: 'year', label: t('f.perYear') },
          ]}
        />
      </div>
    ) : (
      rateInput(label)
    );

  const rateOn = kind !== 'person' || s.hasRate || s.repayment === 'interest';
  const dayCountField =
    rateOn && s.annual > 0 ? (
      <Choice<DebtDayCount>
        label={t('f.dayCount')}
        value={s.dayCount}
        onChange={(v) => set('dayCount', v)}
        options={[
          { value: 'act365', label: t('f.dc.act365'), hint: t('f.dc.act365Hint') },
          { value: 'm30', label: t('f.dc.m30'), hint: t('f.dc.m30Hint') },
        ]}
      />
    ) : null;

  const lenderField =
    kind === 'bank' || kind === 'card' ? (
      <>
        <TextField
          label={t('f.bank')}
          value={s.lender}
          onChange={(v) => set('lender', v)}
          placeholder={t('f.bankPh')}
          maxLength={DEBT_LIMITS.lenderMax}
          list={banksId}
          error={err('lender')}
        />
        <datalist id={banksId}>
          {BANKS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </>
    ) : (
      <TextField
        label={t('f.lender')}
        value={s.lender}
        onChange={(v) => set('lender', v)}
        placeholder={kind === 'installment' ? t('f.lenderInstPh') : t('f.lenderPh')}
        maxLength={DEBT_LIMITS.lenderMax}
        error={err('lender')}
      />
    );

  /**
   * Avvaldan bor yangi qarz: bank ilovasidagi raqamlar (taxmin bilan to'ldirilgan). Tahrirda (birinchi to'lov
   * kuzatuv boshidan oldinga surilganda) raqamlar kuzatuv boshi kunidagi: server ularni openingBalance deb saqlab,
   * o'shandan keyingi yozuvlarni ustiga qayta o'ynaydi — "Hozirgi" desak, bugungi qoldiq yozilib to'lovlar ikki marta ayrilardi
   */
  const revealBlock =
    mode === 'reveal' && built.run ? (
      <div className="rounded-xl border border-info/25 bg-info/5 p-4">
        <p className="flex items-start gap-2 text-sm font-semibold text-info-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {debt ? t('run.storedTitle', { date: f.date(anchor) }) : t('run.title')}
        </p>
        <p className="mt-1 text-xs text-muted">{t(debt ? 'run.storedHint' : 'run.hint')}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <MoneyField
            label={t(debt ? 'run.balanceStored' : 'run.balance')}
            value={built.run.balance}
            onChange={(v) => set('runBalance', v)}
            currency={s.currency}
            error={err('runBalance')}
          />
          <DateField
            label={t('run.next')}
            value={built.run.next}
            onChange={(v) => set('runNext', v)}
            min={anchor}
            error={err('runNext')}
          />
          {built.run.hasTerm ? (
            <CountField
              label={t('run.remaining')}
              value={built.run.remaining}
              onChange={(v) => set('runRemaining', v)}
              error={err('runRemaining')}
            />
          ) : null}
          {built.terms.repayment === 'equal' ? (
            <MoneyField
              label={t('run.monthly')}
              value={built.run.monthly}
              onChange={(v) => set('runMonthly', v)}
              currency={s.currency}
              error={err('runMonthly')}
            />
          ) : null}
        </div>
      </div>
    ) : null;

  /** Avvaldan bor qarzni tahrirlash: kuzatuv boshidagi saqlangan raqamlar */
  const storedBlock = stored ? (
    <div className="rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="text-sm font-semibold text-ink">{t('run.storedTitle', { date: f.date(anchor) })}</p>
      <p className="mt-0.5 text-xs text-muted">{t('run.storedHint')}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <MoneyField
          label={t('run.balanceStored')}
          value={s.opening}
          onChange={(v) => set('opening', v)}
          currency={s.currency}
          error={err('opening')}
        />
        <DateField label={t('run.next')} value={s.firstDueOn} onChange={setFirstDue} min={anchor} error={err('firstDueOn')} />
        {built.terms.repayment === 'equal' || built.terms.repayment === 'decreasing' ? (
          <CountField label={t('run.remaining')} value={s.term} onChange={(v) => set('term', v)} error={err('term')} />
        ) : null}
        {built.terms.repayment === 'equal' ? (
          <MoneyField
            label={t('run.monthly')}
            value={s.monthly}
            onChange={(v) => set('monthly', v)}
            currency={s.currency}
            error={err('monthly')}
          />
        ) : null}
      </div>
    </div>
  ) : null;

  const titleNoteOwner = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('f.title')}
          value={s.title}
          onChange={(v) => set('title', v)}
          // Tayyor kartada bo'sh qolsa — karta nomi (Osmon, Black)
          placeholder={product ? CARD_PRODUCTS[product].name : t('f.titlePh')}
          maxLength={DEBT_LIMITS.titleMax}
        />
        <TextField
          label={t('f.note')}
          value={s.note}
          onChange={(v) => set('note', v)}
          placeholder={t('f.notePh')}
          maxLength={DEBT_LIMITS.noteMax}
        />
      </div>
      {isOwner ? (
        <Toggle
          checked={s.ownerOnly}
          onChange={(v) => set('ownerOnly', v)}
          label={t('f.ownerOnly')}
          hint={t('f.ownerOnlyHint')}
        />
      ) : null}
    </>
  );

  const amountField = (label: string) => (
    <MoneyField
      label={label}
      labelAside={currencyPick}
      value={s.amount}
      onChange={(v) => set('amount', v)}
      currency={s.currency}
      error={err('amount')}
    />
  );

  const firstDueField = (label = t('f.firstDue')) => (
    <DateField
      label={label}
      value={s.firstDueOn}
      onChange={setFirstDue}
      min={isIsoDay(s.startedOn) ? s.startedOn : undefined}
      hint={t('f.firstDueHint')}
      error={err('firstDueOn')}
    />
  );

  const monthsAndMonthly = (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CountField
          label={t('f.months')}
          value={s.term}
          onChange={(v) => set('term', v)}
          suffix={t('f.monthsUnit')}
          error={err('term')}
        />
        <MoneyField
          label={t('f.monthly')}
          value={s.monthly}
          onChange={(v) => set('monthly', v)}
          currency={s.currency}
          error={err('monthly')}
        />
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-muted">{t('f.eitherHint')}</p>
    </div>
  );

  // ── Turlar bo'yicha maydonlar ──
  let fields: ReactNode = null;
  let moreFields: ReactNode = null;

  if (kind === 'person') {
    fields = (
      <>
        {lenderField}
        {amountField(t('f.amountPerson'))}
        <DateField
          label={t('f.startedOnPerson')}
          value={s.startedOn}
          onChange={setStarted}
          max={today}
          error={err('startedOn')}
        />
        <Choice<DebtRepayment>
          label={t('f.how')}
          value={s.repayment === 'equal' || s.repayment === 'interest' ? s.repayment : 'lump'}
          onChange={(v) => set('repayment', v)}
          options={[
            { value: 'lump', label: t('f.rep.lump') },
            { value: 'equal', label: t('f.rep.equal') },
            { value: 'interest', label: t('f.rep.interest') },
          ]}
        />
        {built.terms.repayment === 'lump' ? (
          <DateField
            label={t('f.dueOn')}
            value={s.noDue ? '' : s.dueOn}
            // Sana tanlandi — "Sana kelishilmagan" belgisi o'z-o'zidan olinadi
            onChange={(v) => setS((p) => ({ ...p, dueOn: v, noDue: v ? false : p.noDue }))}
            min={isIsoDay(s.startedOn) ? s.startedOn : undefined}
            error={s.noDue ? null : err('dueOn')}
            aside={
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                <input
                  type="checkbox"
                  checked={s.noDue}
                  onChange={(e) => set('noDue', e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface-2 accent-brand"
                />
                {t('f.noDue')}
              </label>
            }
          />
        ) : built.terms.repayment === 'equal' ? (
          stored ? (
            storedBlock
          ) : (
            <>
              {monthsAndMonthly}
              {firstDueField()}
              {revealBlock}
            </>
          )
        ) : (
          <>
            {stored ? storedBlock : firstDueField(t('f.firstInterestDue'))}
            {revealBlock}
            <DateField
              label={t('f.dueOnOptional')}
              value={s.dueOn}
              onChange={(v) => set('dueOn', v)}
              min={isIsoDay(s.startedOn) ? s.startedOn : undefined}
              error={err('dueOn')}
            />
          </>
        )}
        {built.terms.repayment === 'interest' ? (
          rateField(t('f.rate'))
        ) : (
          <div className="space-y-3">
            <Toggle checked={s.hasRate} onChange={(v) => set('hasRate', v)} label={t('f.hasRate')} hint={t('f.hasRateHint')} />
            {s.hasRate ? rateField(t('f.rate')) : null}
          </div>
        )}
      </>
    );
    moreFields = (
      <>
        {titleNoteOwner}
        {dayCountField}
      </>
    );
  } else if (kind === 'bank') {
    fields = (
      <>
        {lenderField}
        {amountField(t('f.amount'))}
        <div className="grid gap-4 sm:grid-cols-2">
          {rateField(t('f.rateYearly'))}
          {stored ? null : (
            <CountField
              label={t('f.term')}
              value={s.term}
              onChange={(v) => set('term', v)}
              suffix={t('f.monthsUnit')}
              error={err('term')}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label={t('f.startedOn')} value={s.startedOn} onChange={setStarted} max={today} error={err('startedOn')} />
          {stored ? null : firstDueField()}
        </div>
        <Choice<DebtRepayment>
          label={t('f.repType')}
          value={s.repayment === 'decreasing' ? 'decreasing' : 'equal'}
          onChange={(v) => set('repayment', v)}
          options={[
            { value: 'equal', label: t('f.rep.annuity') },
            { value: 'decreasing', label: t('f.rep.decreasing') },
          ]}
        />
        {storedBlock}
        {revealBlock}
      </>
    );
    moreFields = (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <CountField
            label={t('f.grace')}
            value={s.grace}
            onChange={(v) => set('grace', v)}
            suffix={t('f.monthsUnit')}
            placeholder="0"
            hint={t('f.graceHint')}
            error={err('grace')}
          />
          {built.terms.repayment === 'equal' && !stored ? (
            <MoneyField
              label={t('f.contract')}
              value={s.monthly}
              onChange={(v) => set('monthly', v)}
              currency={s.currency}
              hint={t('f.contractHint')}
              error={err('monthly')}
            />
          ) : null}
        </div>
        {dayCountField}
        {titleNoteOwner}
      </>
    );
  } else if (kind === 'card' && product) {
    const rules = CARD_PRODUCTS[product];
    const isTbc = rules.statement === 'individual';
    const [lo, hi] = rules.rateRange;
    const rateRange = `${pctNum(lo, f.lang)}–${pctNum(hi, f.lang)}%`;
    // Oraliqdan tashqari — xato emas (skoring bo'yicha har kimga alohida; eski shartnoma), faqat ogohlantirish
    const rateOut = s.annual > 0 && (s.annual < lo || s.annual > hi);
    const minPctNum = parseDecimal(s.minPct);
    const um = (v: number) => formatDebtMoney(v, 'UZS', f.lang);
    const stmt = built.stmt;
    const tm = debt?.terms;
    const opened = tm
      ? [
          t('open.debt', { sum: um(tm.openingBalance ?? 0) }),
          // Ochiq ko'chirma raqamlari pastda so'ralayotgan bo'lsa — bu yerda takrorlanmaydi
          tm.openingBilled != null && !stmt ? t('open.billed', { sum: um(tm.openingBilled) }) : '',
          tm.openingMin != null ? t('open.min', { sum: um(tm.openingMin) }) : '',
          tm.openingOverdue ? t('open.overdue', { sum: um(tm.openingOverdue) }) : '',
        ].filter(Boolean)
      : [];
    // Saqlashga to'sqinlik qilmaydigan ogohlantirish (qarz limitdan katta — bo'sh limit 0): za'faron, xato emas
    const warnHint = (text: string) => <span className="font-medium text-warn-ink">{text}</span>;
    /** Ilovadagi ochiq ko'chirma: "to'lash kerak" va minimal to'lov (yangi kartada; tahrirda — yozilmagan bo'lsa) */
    const stmtBlock = stmt ? (
      <div className="rounded-xl border border-info/25 bg-info/5 p-4">
        <p className="flex items-start gap-2 text-sm font-semibold text-info-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t('f.stmtTitle')}
        </p>
        {tm ? <p className="mt-1 text-xs text-muted">{t('open.needMin')}</p> : null}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <MoneyField
            // TBC: sana yuqorida kiritilgan; dvigatel boshqa (yangiroq) ko'chirmani ochiq ko'rsa — uning sanasi
            label={isTbc && stmt.due === s.lastDue ? t('f.billedTbc') : t('f.billedBy', { date: f.date(stmt.due) })}
            value={stmt.billed}
            onChange={(v) => set('billed', v)}
            currency="UZS"
            hint={t('f.billedHint')}
            error={err('billed')}
          />
          <MoneyField
            label={t('f.minLeft')}
            value={stmt.min}
            onChange={(v) => setS((p) => ({ ...p, minLeft: v, minTouched: true }))}
            currency="UZS"
            hint={t('f.minLeftHint')}
            error={err('minLeft')}
          />
        </div>
      </div>
    ) : null;
    fields = (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            label={t('f.limit')}
            value={s.amount}
            onChange={(v) => set('amount', v)}
            currency="UZS"
            hint={
              built.hints.amount
                ? warnHint(built.hints.amount)
                : `${f.num(rules.limit[0])} – ${compactMoney(rules.limit[1], 'UZS', f.lang).text}`
            }
            error={err('amount')}
          />
          {debt ? null : (
            <MoneyField
              label={t('f.cardDebt')}
              value={s.cardDebt}
              onChange={(v) => set('cardDebt', v)}
              currency="UZS"
              hint={built.hints.cardDebt ? warnHint(built.hints.cardDebt) : t('f.cardDebtHint')}
              error={err('cardDebt')}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t(isTbc ? 'f.ratePurchase' : 'f.rateYearly')}
            value={s.annual}
            onChange={(v) => set('annual', v)}
            suffix="%"
            min={0}
            max={DEBT_LIMITS.rateMax}
            // Bank foizi kasrli (Infin 25,55–54,75): 0,1 qadamda brauzer 54,75 ni "noto'g'ri" deb shaklni jimgina yubormasdi
            step="any"
            tone={err('rate') ? 'danger' : 'default'}
            hint={err('rate') ?? (rateOut ? t('f.rateOut') : t(isTbc ? 'f.rateTbcHint' : 'f.rateInfinHint', { range: rateRange }))}
          />
          {rules.separateCashRate ? (
            <PctField
              label={t('f.cashRate')}
              value={s.cashRate}
              onChange={(v) => set('cashRate', v)}
              placeholder={t('f.cashRatePh')}
              error={err('cashRate')}
            />
          ) : null}
        </div>
        {isTbc ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CountField
              label={t('f.minPctTbc')}
              value={s.minPct}
              onChange={(v) => set('minPct', v)}
              suffix="%"
              decimal
              hint={
                minPctNum !== null && minPctNum > rules.minPctMax
                  ? t('f.minPctOver', { max: rules.minPctMax })
                  : t('f.minPctTbcHint', { max: rules.minPctMax })
              }
              error={err('minPct')}
            />
            <DateField
              label={t('f.lastDue')}
              value={s.lastDue}
              onChange={(v) => set('lastDue', v)}
              min={debt ? undefined : addDays(today, -LAST_DUE_WINDOW)}
              max={debt ? undefined : addDays(today, LAST_DUE_WINDOW)}
              hint={built.cardDueText ?? t('f.lastDueHint0')}
              error={err('lastDue')}
            />
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-muted">
            {t('f.infinRule', { pct: rules.minPctDefault, s: rules.statementDay ?? 1, d: (rules.statementDay ?? 1) + rules.dueDays })}
            {built.cardDueText ? ` · ${built.cardDueText}` : ''}
          </p>
        )}
        {built.stmtAmbiguous ? (
          <div>
            <Choice<string>
              label={t('f.stmtDay')}
              value={String(built.terms.statementDay)}
              onChange={(v) => set('stmtDay', v)}
              options={built.stmtDays.map((d) => ({ value: String(d), label: String(d) }))}
            />
            <FieldNote hint={t('f.stmtDayHint')} />
          </div>
        ) : null}
        {tm ? (
          // Boshlang'ich holat tahrirda o'zgarmaydi: bank ilovasidagi farq — «Qoldiqni tenglashtirish» bilan. Faqat
          // ochiq ko'chirmaning ilovadagi minimal to'lovi yozilmagan bo'lsa (to'lov sanasi tuzatildi) — so'raladi
          <>
            <div className="rounded-xl border border-line bg-surface-2/60 p-4">
              <p className="text-sm font-semibold text-ink">{t('run.storedTitle', { date: f.date(anchor) })}</p>
              <p className="tnum mt-1 text-xs text-ink-soft">{opened.join(' · ')}</p>
              <p className="mt-1 text-2xs leading-relaxed text-muted">{t('open.fixed')}</p>
            </div>
            {stmtBlock}
          </>
        ) : (
          <>
            {stmtBlock}
            {s.cardDebt !== null && s.cardDebt > 0 ? (
              <div>
                <Choice<'full' | 'part'>
                  label={t('f.revolving')}
                  value={s.revolving ? 'part' : 'full'}
                  onChange={(v) => set('revolving', v === 'part')}
                  options={[
                    { value: 'full', label: t('f.revolving.full') },
                    { value: 'part', label: t('f.revolving.part') },
                  ]}
                />
                {s.revolving ? <FieldNote hint={t('f.revolvingHint')} /> : null}
              </div>
            ) : null}
          </>
        )}
        <ProductInfo product={product} />
      </>
    );
    moreFields = (
      <>
        {debt ? null : (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              label={t('f.overdueNow')}
              value={s.overdueNow}
              onChange={(v) => set('overdueNow', v)}
              currency="UZS"
              hint={t('f.overdueNowHint')}
              error={err('overdueNow')}
            />
          </div>
        )}
        {titleNoteOwner}
      </>
    );
  } else if (kind === 'card') {
    fields = (
      <>
        {lenderField}
        {amountField(t('f.limit'))}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            label={debt ? t('f.cardDebtEdit', { date: f.date(anchor) }) : t('f.cardDebt')}
            value={s.cardDebt}
            onChange={(v) => set('cardDebt', v)}
            currency={s.currency}
            hint={debt ? undefined : t('f.cardDebtHint')}
            error={err('cardDebt')}
          />
          {rateField(t('f.rateYearly'))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CountField
            label={t('f.payDay')}
            value={s.payDay}
            onChange={(v) => set('payDay', v)}
            placeholder="1–31"
            hint={built.cardNextDue ? t('f.payDayHint', { date: f.date(built.cardNextDue) }) : undefined}
            error={err('payDay')}
          />
        </div>
        <Choice<MinMode>
          label={t('f.min')}
          value={s.minMode}
          onChange={(v) => set('minMode', v)}
          options={[
            { value: 'principal', label: t('f.min.principal', { pct: s.minPct || '…' }) },
            { value: 'total', label: t('f.min.total', { pct: s.minPct || '…' }) },
            { value: 'interest', label: t('f.min.interest') },
          ]}
        />
        {s.minMode !== 'interest' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <CountField
              label={t('f.minPct')}
              value={s.minPct}
              onChange={(v) => set('minPct', v)}
              suffix="%"
              decimal
              error={err('minPct')}
            />
          </div>
        ) : null}
      </>
    );
    moreFields = (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            label={t('f.limitEnd')}
            value={s.dueOn}
            onChange={(v) => set('dueOn', v)}
            hint={t('f.limitEndHint')}
            error={err('dueOn')}
          />
        </div>
        {dayCountField}
        {titleNoteOwner}
      </>
    );
  } else if (kind === 'installment') {
    fields = (
      <>
        {lenderField}
        {amountField(t('f.amount'))}
        {stored ? null : monthsAndMonthly}
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label={t('f.startedOn')} value={s.startedOn} onChange={setStarted} max={today} error={err('startedOn')} />
          {stored ? null : firstDueField()}
        </div>
        {storedBlock}
        {revealBlock}
      </>
    );
    moreFields = (
      <>
        <div className="grid gap-4 sm:grid-cols-2">{rateField(t('f.instRate'))}</div>
        {dayCountField}
        {titleNoteOwner}
      </>
    );
  }

  /** Tanlangan tur (kartada — karta) qatori; yangi qarzda o'ng chetida qayta tanlash havolasi */
  const kindHeader = (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="icon-tile tone-muted h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
            <Icon />
          </span>
        ) : null}
        {product ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{t(`prod.${product}`)}</span>
            <span className="block truncate text-2xs text-muted">{productSub(product)}</span>
          </span>
        ) : (
          <span className="truncate text-sm font-semibold text-ink">{t(`kind.${kind}`)}</span>
        )}
      </span>
      {debt ? null : (
        <button
          type="button"
          // Kartada (tanlangandan keyin) — boshqa karta; karta tanlash qadamida va boshqa turlarda — boshqa tur
          onClick={() => (kind === 'card' && !pickingCard ? set('cardProduct', null) : set('kind', null))}
          className="focusable shrink-0 rounded-md text-xs font-medium text-brand-ink hover:underline"
        >
          {kind === 'card' && !pickingCard ? t('form.changeCard') : t('form.change')}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={debt ? t('form.editTitle') : t('form.addTitle')}
      description={!kind ? t('form.pickHint') : pickingCard ? t('form.pickCardHint') : undefined}
      size="md"
      footer={
        kind && !pickingCard ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-xs font-medium text-danger-ink">{tried && hasErrors ? t('err.fix') : null}</p>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                {tc('btn.cancel')}
              </Button>
              <Button type="submit" form="debt-form" loading={save.isPending}>
                {debt ? tc('btn.save') : t('form.submitAdd')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>
              {tc('btn.cancel')}
            </Button>
          </div>
        )
      }
    >
      {!kind ? (
        <div>
          <p className="mb-3 font-semibold text-ink">{t('form.pick')}</p>
          <KindTiles onPick={pickKind} />
        </div>
      ) : pickingCard ? (
        <div className="space-y-4">
          {kindHeader}
          <div>
            <p className="mb-3 font-semibold text-ink">{t('form.pickCard')}</p>
            <CardProductTiles onPick={pickProduct} />
          </div>
        </div>
      ) : (
        <form
          id="debt-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {kindHeader}

          {termsChanged ? (
            <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs font-medium text-warn-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('form.historyWarn')}
            </p>
          ) : null}

          {fields}

          <div className="border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={s.more}
              onClick={() => set('more', !s.more)}
              className="focusable inline-flex items-center gap-1 rounded-md text-sm font-semibold text-ink-soft hover:text-ink"
            >
              {t('f.more')}
              <ChevronDown className={cn('h-4 w-4 transition-transform', s.more && 'rotate-180')} />
            </button>
            {s.more ? <div className="mt-3 space-y-4">{moreFields}</div> : null}
          </div>

          <Preview terms={built.terms} analysis={analysis} running={built.terms.openingBalance !== null || ledger.length > 0} />
        </form>
      )}
    </Modal>
  );
}

/** Shakl ostidagi hisob: server saqlagandan keyin ko'rsatadigan raqamlar (taxminiy) */
function Preview({
  terms,
  analysis,
  running,
}: {
  terms: DebtTerms;
  analysis: DebtAnalysis | null;
  /** Avvaldan bor qarz yoki yozuvlari bor qarz — "1-oy" emas, "keyingi to'lov" */
  running: boolean;
}) {
  const t = useT('debts');
  const f = useFormat();
  if (!analysis) {
    return <div className="well p-3.5 text-xs leading-relaxed text-muted">{t('pv.fill')}</div>;
  }
  const m = (v: number) => formatDebtMoney(v, terms.currency, f.lang);
  const c = analysis.calc;
  const parts: string[] = [];
  let warn: string | null = null;

  if (terms.kind === 'card' && terms.cardProduct) {
    // Tayyor karta: ko'chirma bo'yicha minimal, foizsiz qolish summasi, bo'sh limit (aylanuvchi qarzda — oylik foiz)
    const next = c.next;
    const grace = c.card?.grace ?? null;
    if (next && next.status === 'overdue') parts.push(t('pv.prodOverdue', { sum: m(next.remaining) }));
    else if (next && next.remaining > 0)
      parts.push(t('pv.prodNext', { date: f.date(next.date), sum: `${next.card?.estimate ? '≈ ' : ''}${m(next.remaining)}` }));
    else parts.push(t('pv.cardNoDebt'));
    if (grace && grace.state === 'open' && grace.left > 0) parts.push(t('pv.prodGrace', { sum: m(grace.left), date: f.date(grace.due) }));
    parts.push(t('pv.freeLimit', { sum: m(c.freeLimit ?? 0) }));
    if (terms.openingRevolving) parts.push(t('pv.prodMonthly', { sum: m(c.monthlyInterest) }));
  } else if (terms.kind === 'card') {
    if (c.next && c.next.amount > 0) {
      parts.push(t('pv.cardMin', { sum: m(c.next.amount), rule: minRuleText(terms, t, f.lang) }));
      parts.push(t('pv.cardDate', { date: f.date(c.next.date) }));
    } else parts.push(t('pv.cardNoDebt'));
    parts.push(t('pv.freeLimit', { sum: m(c.freeLimit ?? 0) }));
  } else if (terms.repayment === 'lump') {
    if (c.next) {
      parts.push(t('pv.lump', { date: f.date(c.next.date), sum: m(c.next.amount) }));
      if (c.next.interest > 0) parts.push(t('pv.lumpInterest', { sum: m(c.next.interest) }));
    } else parts.push(t('pv.lumpNoDate'));
  } else if (terms.repayment === 'interest') {
    // Oxirgi to'lov (qaytarish kuni) — butun qarz; oylik foiz esa qoldiq × yillik ÷ 12. Birinchi davr to'liq oy
    // bo'lmasa (foiz kuni 20.11, olingan 07.11) — u alohida: ilgari 13 kunlik 260 000 "Har oy foiz ≈" deb chiqardi
    parts.push(t('pv.interestMonthly', { sum: m(c.monthlyInterest) }));
    if (c.next && !c.next.final && c.next.remaining !== c.monthlyInterest)
      parts.push(t('pv.nextPay', { date: f.date(c.next.date), sum: m(c.next.remaining) }));
    parts.push(terms.dueOn ? t('pv.returnOn', { date: f.date(terms.dueOn), sum: m(c.principal) }) : t('pv.noReturn'));
  } else {
    if (terms.repayment === 'equal' && c.monthlyPayment) parts.push(t('pv.monthly', { sum: m(c.monthlyPayment.amount) }));
    else if (c.next) parts.push(t('pv.firstPay', { sum: m(c.next.amount) }));
    if (c.next) {
      if (running) {
        parts.push(t('pv.nextPay', { date: f.date(c.next.date), sum: m(c.next.remaining) }));
        // Foiz — butun to'lovniki: qisman to'langan to'lovning qolgani yonida ko'rsatilmaydi
        if (c.next.interest > 0 && c.next.remaining === c.next.amount) parts.push(t('pv.ofInterest', { sum: m(c.next.interest) }));
      } else if (c.next.interest > 0) {
        parts.push(t('pv.firstInterest', { sum: m(c.next.interest), n: c.next.explain.days }));
      }
    }
    if (!running && terms.graceMonths > 0) parts.push(t('pv.grace', { n: terms.graceMonths }));
    if (c.interestLeft !== null && c.interestLeft > 0)
      parts.push(t(running ? 'pv.interestLeft' : 'pv.totalInterest', { sum: m(c.interestLeft) }));
    if (c.payoffDate) parts.push(t('pv.ends', { date: f.date(c.payoffDate) }));
    if (running && c.payoff > 0) parts.push(t('pv.payoff', { sum: m(c.payoff) }));
    if (c.belowInterest) warn = t('pv.below');
  }

  return (
    <div className="well p-3.5" aria-live="polite">
      <p className="eyebrow-lg">{t('pv.title')}</p>
      <p className="tnum mt-1 text-sm leading-relaxed text-ink-soft">
        {parts.map((p, i) => (
          <span key={i} className={i === 0 ? 'font-semibold text-ink' : undefined}>
            {i > 0 ? ' · ' : ''}
            {p}
          </span>
        ))}
      </p>
      {warn ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-warn-ink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warn}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tayyor kartaning bank shartlari — qisqa, raqamlar CARD_PRODUCTS dan (tarif va oferta, "holatiga" sanasi bilan).
 * Bank shartlarni bir tomonlama o'zgartira oladi — shuning uchun sana va ogohlantirish
 */
function ProductInfo({ product }: { product: DebtCardProduct }) {
  const t = useT('debts');
  const f = useFormat();
  const r = CARD_PRODUCTS[product];
  const isTbc = r.statement === 'individual';
  const pct = (v: number) => pctNum(v, f.lang);
  const change = r.fees.transfer.changes?.[0];
  const fees = isTbc
    ? t('info.feesTbc', {
        t: pct(r.fees.transfer.pct),
        c: pct(r.fees.cash.pct),
        min: f.num(r.fees.cash.min ?? 0),
        o: pct(r.fees.other.pct),
      })
    : t(change ? 'info.feesInfin' : 'info.feesInfinFlat', {
        t: pct(r.fees.transfer.pct),
        t2: pct(change?.pct ?? r.fees.transfer.pct),
        from: f.dateShort(change?.from ?? r.asOf),
        c: pct(r.fees.cash.pct),
        min: f.num(r.fees.cash.min ?? 0),
        o: pct(r.fees.other.pct),
      });
  const lines = [
    t('info.grace', { days: r.graceMaxDays }),
    t('info.fees', { fees }),
    isTbc ? t('info.minTbc', { max: pct(r.minPctMax) }) : t('info.minInfin', { pct: pct(r.minPctDefault) }),
    isTbc
      ? t('info.lateTbc', { first: pct(r.penalty.firstDayPct), daily: pct(r.penalty.dailyPct) })
      : t('info.lateInfin', { daily: pct(r.penalty.dailyPct) }),
    isTbc ? t('info.dayTbc') : t('info.dayInfin', { d: (r.statementDay ?? 1) + r.dueDays }),
  ];
  return (
    <div className="well p-3.5 text-xs leading-relaxed text-ink-soft">
      <p className="eyebrow-lg">{t('info.title')}</p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-2xs text-muted">{t('info.asOf', { date: f.date(r.asOf) })}</p>
    </div>
  );
}
