/**
 * Kundalik yozuv oynasi: "To'ladim", "Ishlatdim" (kartada — "Kartadan
 * ishlatdim"), "Yana oldim" va "Qoldiqni tenglashtirish". Bitta majburiy
 * maydon — summa; sana standart bugun (Toshkent savdo kuni, serverdan).
 *
 * Pastdagi "Qoldiq bo'ladi ≈" serverdagi bilan bir xil shared analyzeDebt'dan:
 * qarz daftariga shu yozuv qo'shilib qayta hisoblanadi. Ro'yxatdan ochilganda
 * daftar GET /debts/:id dan olinadi (o'sha ['debt', id] keshi).
 *
 * Yozuv qarzning versiyasiga (updatedAt) tegmaydi — ochiq turgan tahrir shakli
 * "boshqa oynada o'zgargan" deb rad etilmaydi.
 */
import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEBT_CATEGORIES,
  DEBT_LIMITS,
  analyzeDebt,
  formatDebtMoney,
  type DebtCategory,
  type DebtDetail,
  type DebtEntryKind,
  type DebtEntryRow,
  type DebtLedgerEntry,
  type DebtSummary,
} from '@savdoiq/shared';
import { ChevronDown } from '@/components/icons';
import { Button, Modal, toast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { MoneyField } from './MoneyField';
import { DateField, TextField } from './fields';
import { asCategory, isIsoDay, toLedger } from './format';

export type EntryMode = 'pay' | 'use' | 'draw' | 'adjust';

export interface EntryTarget {
  debt: DebtSummary;
  mode: EntryMode;
  /** Tahrirlanayotgan yozuv (yangisida yo'q) */
  entry?: DebtEntryRow;
}

/** Tarixdagi yozuv qaysi oynada tahrirlanadi: kartada "olindi" — "kartadan ishlatildi" */
export function modeOfEntry(entry: DebtEntryRow, isCard: boolean): EntryMode {
  if (entry.kind === 'draw') return isCard ? 'use' : 'draw';
  return entry.kind;
}

/** Kartada "ishlatdim" qarzni oshiradi — server uni "draw" qilib saqlaydi; oldindan ko'rish ham shunday */
const kindOf = (mode: EntryMode, isCard: boolean): DebtEntryKind => (mode === 'use' && isCard ? 'draw' : mode);

/** Tanlov tugmachasi (summa takliflari, "Nimaga" turkumlari) */
const chipClass = (active: boolean) =>
  cn(
    'focusable rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active ? 'border-brand/60 bg-brand/10 text-brand-ink' : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink',
  );

export function EntryModal({ target, today, onClose }: { target: EntryTarget | null; today: string; onClose: () => void }) {
  /*
   * Yopilish animatsiyasi davomida oxirgi yozuv ko'rinib turadi; har yangi
   * ochilishda shakl qaytadan quriladi (oldingi summa qolib ketmasin).
   */
  const [shown, setShown] = useState<{ target: EntryTarget; seq: number } | null>(null);
  if (target && shown?.target !== target) setShown({ target, seq: (shown?.seq ?? 0) + 1 });
  if (!shown) return null;
  return <EntryDialog key={shown.seq} target={shown.target} open={target !== null} today={today} onClose={onClose} />;
}

function EntryDialog({
  target,
  open,
  today,
  onClose,
}: {
  target: EntryTarget;
  open: boolean;
  today: string;
  onClose: () => void;
}) {
  const t = useT('debts');
  const tc = useT('common');
  const f = useFormat();
  const qc = useQueryClient();
  const { debt, mode, entry } = target;
  const isCard = debt.kind === 'card';
  const currency = debt.terms.currency;
  const m = (v: number) => formatDebtMoney(v, currency, f.lang);
  const kind = kindOf(mode, isCard);

  /*
   * Summa va sana: undefined — foydalanuvchi hali o'zgartirmagan, ko'rinadigani yangi olingan qarzdan (pastda).
   * Ilgari ochilgan paytdagi eski nusxadan bir marta olinardi: sahifa yarim tundan keyin ham ochiq tursa,
   * to'lov kechagi sana bilan jimgina saqlanardi, summa esa boshqa qurilmada to'langan to'lovniki qolardi
   */
  const [amountInput, setAmount] = useState<number | null | undefined>(() => (entry ? entry.amount : undefined));
  const [dateInput, setDate] = useState<string | undefined>(() => entry?.date);
  const [category, setCategory] = useState<DebtCategory>(() => asCategory(entry?.category) ?? 'goods');
  const [note, setNote] = useState(() => entry?.note ?? '');
  const [interest, setInterest] = useState<number | null>(() => entry?.interest ?? null);
  const [more, setMore] = useState(() => Boolean(entry && (entry.note || entry.interest !== null)));
  const [tried, setTried] = useState(false);
  const forId = useId();

  // Aniq oldindan ko'rish uchun daftar; qarz sahifasidan ochilganda keshda tayyor
  const detail = useQuery({
    queryKey: ['debt', debt.id],
    queryFn: () => api.get<DebtDetail>(`/debts/${debt.id}`),
    enabled: open,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  const base = detail.data;
  const live: DebtSummary = base ?? debt;
  const day = base?.today ?? today;
  const startedOn = live.terms.startedOn;
  const next = live.calc.next;
  // "To'ladim" — navbatdagi to'lovning qolgan qismi, bugungi yopish summasidan oshmaydi: bir yo'la yoki oxirgi
  // to'lovda hali yig'ilmagan foiz kirmasin (ilgari 20 600 000 lik qarzga 23 600 000 taklif qilinib, ortiqcha to'lanardi)
  const prefill = mode === 'pay' && next ? Math.min(next.remaining, live.calc.payoff) : 0;
  const amount = amountInput !== undefined ? amountInput : prefill > 0 ? prefill : null;
  const date = dateInput ?? day;

  const amountOk = amount !== null && !Number.isNaN(amount) && (mode === 'adjust' ? amount >= 0 : amount > 0);
  const interestValue = kind === 'pay' && interest !== null && !Number.isNaN(interest) ? interest : null;

  const preview = useMemo(() => {
    if (!base || !amountOk || amount === null || !isIsoDay(date)) return null;
    const ledger = toLedger(base.entries).filter((e) => e.id !== entry?.id);
    const added: DebtLedgerEntry = {
      id: entry?.id ?? 'new',
      kind,
      date,
      amount,
      category: kind === 'use' || kind === 'draw' ? category : '',
      note,
      interest: interestValue,
      // Yangi yozuv o'sha kunning oxirgisi bo'ladi (serverda createdAt — hozir)
      createdAt: entry?.createdAt ?? new Date().toISOString(),
    };
    const a = analyzeDebt(base.terms, [...ledger, added], base.today);
    // Tahrirda "ortiqcha to'landi" shu yozuvsiz holatga nisbatan: server ma'lumoti tahrirlanayotgan yozuvni ham o'z
    // ichiga oladi — ilgari 21 mln lik ortiqcha to'lov o'zgarmasa ham "ortiqcha yo'q", 21,5 mln da "500 000" chiqardi
    const before = entry ? analyzeDebt(base.terms, ledger, base.today).calc.overpaid : base.calc.overpaid;
    return { calc: a.calc, result: a.entries[a.entries.length - 1], overpaidBefore: before };
  }, [base, amountOk, amount, date, entry, kind, category, note, interestValue]);

  // Limitdan oshish faqat qarzni OSHIRADIGAN yozuvda: limitdan oshib qolgan kartada (limit kamaytirilgan) izoh yoki
  // turkumni tuzatish, summani kamaytirish mumkin bo'lsin (server ham shunday tekshiradi)
  const limitEps = live.terms.currency === 'USD' ? 0.005 : 0.5;
  const overLimit =
    isCard &&
    kind === 'draw' &&
    preview !== null &&
    preview.calc.principal > live.terms.amount + limitEps &&
    preview.calc.principal > (base?.calc.principal ?? 0) + limitEps;
  const errors = {
    amount:
      amount === null
        ? t(mode === 'adjust' ? 'err.amountAdjust' : 'err.amount')
        : Number.isNaN(amount)
          ? t('err.number')
          : !amountOk
            ? t('err.amount')
            : amount > DEBT_LIMITS.amountMax
              ? t('err.amountMax')
              : overLimit
                ? t('err.overLimit')
                : null,
    date: !isIsoDay(date)
      ? t('err.date')
      : date > day
        ? t('err.dateFuture')
        : date < startedOn
          ? t('err.dateBefore', { date: f.date(startedOn) })
          : null,
    interest:
      kind !== 'pay' || interest === null
        ? null
        : Number.isNaN(interest)
          ? t('err.number')
          : amount !== null && !Number.isNaN(amount) && interest > amount
            ? t('err.interestMax')
            : null,
  };
  // Xato birinchi "Saqlash"dan keyin ko'rinadi; limitdan oshish — darhol (bu ma'lumot)
  const shownError = (key: keyof typeof errors) => (tried || (key === 'amount' && overLimit) ? errors[key] : null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      entry
        ? api.patch<DebtDetail>(`/debts/${debt.id}/entries/${entry.id}`, body)
        : api.post<DebtDetail>(`/debts/${debt.id}/entries`, body),
    onSuccess: (saved) => {
      qc.setQueryData(['debt', saved.id], saved);
      void qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success(entry ? t('entry.updated') : t(`entry.saved.${mode}`));
      onClose();
    },
    onError: (err: unknown) => toast.error(t('entry.error'), err instanceof Error ? err.message : undefined),
  });

  const submit = () => {
    setTried(true);
    // Yig'ilgan bo'limdagi xato ko'rinmay qolmasin
    if (errors.interest) setMore(true);
    if (errors.amount || errors.date || errors.interest || amount === null) return;
    save.mutate({
      kind,
      date,
      amount,
      // "Yana oldim" — turkumsiz; kartadan ishlatish va ishlatish — turkum bilan
      category: mode === 'use' ? category : '',
      note: note.trim(),
      ...(kind === 'pay' ? { interest: interestValue } : {}),
    });
  };

  const title = entry
    ? t('entry.editTitle')
    : mode === 'pay'
      ? t('pay.title')
      : mode === 'use'
        ? t(isCard ? 'use.titleCard' : 'use.title')
        : mode === 'draw'
          ? t('draw.title')
          : t('adjust.title');
  const amountLabel =
    mode === 'pay' ? t('pay.amount') : mode === 'use' ? t('use.amount') : mode === 'draw' ? t('draw.amount') : t('adjust.amount');

  // Oyna pastidagi natija: yozuvdan keyin qarz qanday bo'ladi
  let main: string | null = null;
  let sub: string | null = null;
  if (preview) {
    const c = preview.calc;
    if (mode === 'pay') {
      main = t('pay.after', { sum: m(c.principal) });
      const split = preview.result.split;
      const extra = c.overpaid - preview.overpaidBefore;
      if (extra > (live.terms.currency === 'USD' ? 0.005 : 0.5)) sub = t('pay.over', { sum: m(extra) });
      else if (split) sub = t('pay.split', { i: m(split.interest), p: m(split.principal) });
    } else if (mode === 'use') {
      if (isCard) main = t('use.afterCard', { sum: m(c.principal), free: m(c.freeLimit ?? 0) });
      else if (c.unused !== null) main = t('use.after', { sum: m(c.unused) });
    } else if (mode === 'draw') main = t('draw.after', { sum: m(c.principal) });
    else main = t('adjust.after', { sum: m(c.principal) });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={debt.title ? `${debt.lender} — ${debt.title}` : debt.lender}
      size="sm"
      footer={
        <div className="space-y-3">
          {main || mode === 'pay' ? (
            <div className="min-w-0 text-xs leading-relaxed">
              {main ? <p className="tnum font-semibold text-ink">{main}</p> : null}
              {sub ? <p className="tnum text-muted">{sub}</p> : null}
              {mode === 'pay' ? <p className="text-muted">{t('pay.notExpense')}</p> : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {tc('btn.cancel')}
            </Button>
            <Button type="submit" form="debt-entry-form" loading={save.isPending}>
              {tc('btn.save')}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="debt-entry-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <MoneyField
            label={amountLabel}
            value={amount}
            onChange={setAmount}
            currency={currency}
            error={shownError('amount')}
            hint={
              mode === 'use' && isCard
                ? t('use.cardNote')
                : mode === 'adjust'
                  ? t('adjust.hint', { sum: m(live.calc.principal) })
                  : undefined
            }
          />
          {mode === 'pay' && !entry ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* "Navbatdagi" faqat "Hammasi"dan kichik bo'lsa — aks holda u "hammasi"dan katta ko'rinardi */}
              {next && next.remaining > 0 && next.remaining < live.calc.payoff ? (
                <button type="button" className={chipClass(amount === next.remaining)} onClick={() => setAmount(next.remaining)}>
                  {t('pay.chipNext', { sum: m(next.remaining) })}
                </button>
              ) : null}
              {live.calc.payoff > 0 ? (
                <button type="button" className={chipClass(amount === live.calc.payoff)} onClick={() => setAmount(live.calc.payoff)}>
                  {t('pay.chipAll', { sum: m(live.calc.payoff) })}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {mode === 'use' ? (
          <div>
            <p id={forId} className="label">
              {t('use.for')}
            </p>
            {/* Ekran o'quvchida turkum "Nimaga" guruhi bilan o'qilsin */}
            <div role="group" aria-labelledby={forId} className="flex flex-wrap gap-1.5">
              {DEBT_CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={category === c} className={chipClass(category === c)} onClick={() => setCategory(c)}>
                  {t(`cat.${c}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <DateField label={t('f.when')} value={date} onChange={setDate} min={startedOn} max={day} error={shownError('date')} />

        {mode === 'pay' ? (
          <div>
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
              className="focusable inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-ink"
            >
              {t('pay.more')}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', more && 'rotate-180')} />
            </button>
            {more ? (
              <div className="mt-3 space-y-4">
                <MoneyField
                  label={t('pay.interest')}
                  value={interest}
                  onChange={setInterest}
                  currency={currency}
                  hint={t('pay.interestHint')}
                  error={shownError('interest')}
                />
                <TextField
                  label={t('f.note')}
                  value={note}
                  onChange={setNote}
                  maxLength={DEBT_LIMITS.noteMax}
                  placeholder={t('f.notePh')}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <TextField label={t('f.note')} value={note} onChange={setNote} maxLength={DEBT_LIMITS.noteMax} />
        )}
      </form>
    </Modal>
  );
}
