/**
 * Kundalik yozuv oynasi: "To'ladim", "Ishlatdim" (kartada — "Kartadan
 * ishlatdim"), "Yana oldim" va "Qoldiqni tenglashtirish". Bitta majburiy
 * maydon — summa; sana standart bugun (Toshkent savdo kuni, serverdan).
 *
 * Pastdagi "Qoldiq bo'ladi ≈" serverdagi bilan bir xil shared analyzeDebt'dan:
 * qarz daftariga shu yozuv qo'shilib qayta hisoblanadi (mantig'i — entryModel.ts).
 * Ro'yxatdan ochilganda daftar GET /debts/:id dan olinadi (o'sha ['debt', id] keshi).
 *
 * Yozuv qarzning versiyasiga (updatedAt) tegmaydi — ochiq turgan tahrir shakli
 * "boshqa oynada o'zgargan" deb rad etilmaydi.
 *
 * Tayyor kartada (TBC Osmon, Infin Black) "Kartadan ishlatdim" — qanday: xarid
 * (foizsiz davr bor) yoki o'tkazma / naqd / boshqa to'lov (foiz shu kundan va
 * komissiya qarzga). Komissiya tarifdan taklif qilinadi, sotuvchi o'zgartira oladi.
 * Tayyor kartada "Qoldiqni tenglashtirish" — bank ilovasidagi umumiy qarz (foizi bilan).
 */
import { useId, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CARD_PRODUCTS,
  DEBT_CATEGORIES,
  DEBT_CHANNELS,
  DEBT_LIMITS,
  cardFee,
  formatDebtMoney,
  isCardProduct,
  type DebtCategory,
  type DebtChannel,
  type DebtDetail,
  type DebtEntryKind,
  type DebtEntryRow,
  type DebtSummary,
} from '@savdoiq/shared';
import { ChevronDown } from '@/components/icons';
import { Button, Modal, toast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { MoneyField } from './MoneyField';
import { DateField, FieldNote, TextField } from './fields';
import { asCategory, isIsoDay, pctNum, statementDayOf, stmtAfter, stmtDue } from './format';
import { adjustBase, entryPreview, overLimitOf } from './entryModel';

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
  // Tayyor karta: kanal va komissiya faqat kartadan ishlatishda; to'lovda "shundan foiz" yo'q (server e'tiborsiz qoldiradi)
  const product = isCard && isCardProduct(debt.terms.cardProduct) ? debt.terms.cardProduct : null;
  const draws = product !== null && kind === 'draw';

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
  const howId = useId();
  const [channel, setChannel] = useState<DebtChannel>(() => entry?.channel ?? 'purchase');
  /*
   * Komissiya: undefined — tarifdan (summa, sana va kanal o'zgarsa qayta hisoblanadi), qo'lda yozilgani — o'sha.
   * Saqlangan o'tkazma/naqd yozuvining komissiyasi qo'lda deb olinadi: tahrirda tarixdagi summa jimgina o'zgarmasin
   */
  const [feeInput, setFee] = useState<number | null | undefined>(() =>
    entry?.channel && entry.channel !== 'purchase' ? entry.fee : undefined,
  );

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

  // Komissiya (xariddan boshqasida): tarif bo'yicha taklif — summa, sana yoki kanal o'zgarsa yangilanadi, qo'lda yozilmaguncha
  const feeShown =
    draws && product && channel !== 'purchase'
      ? feeInput !== undefined
        ? feeInput
        : amount !== null && !Number.isNaN(amount) && isIsoDay(date)
          ? cardFee(product, channel, amount, date)
          : null
      : null;
  const feeValue = feeShown !== null && !Number.isNaN(feeShown) && feeShown > 0 ? feeShown : null;

  // Oldindan ko'rish (entryModel.ts): izoh va turkum hisobga ta'sir qilmaydi — ular o'zgarganda qayta hisoblanmaydi (F7)
  const preview = useMemo(
    () =>
      !base || !amountOk || amount === null || !isIsoDay(date)
        ? null
        : entryPreview(base, {
            id: entry?.id ?? null,
            // Yangi yozuv o'sha kunning oxirgisi bo'ladi (serverda createdAt — hozir)
            createdAt: entry?.createdAt ?? new Date().toISOString(),
            kind,
            date,
            amount,
            interest: interestValue,
            // Tayyor karta: kanal va komissiya — "qarz bo'ladi" komissiya bilan
            channel: draws ? channel : null,
            fee: draws ? feeValue : null,
          }),
    [base, amountOk, amount, date, entry, kind, interestValue, draws, channel, feeValue],
  );

  // Limitdan oshish faqat qarzni OSHIRADIGAN yozuvda (server ham shunday tekshiradi)
  const limitEps = live.terms.currency === 'USD' ? 0.005 : 0.5;
  const overLimit = isCard && kind === 'draw' && preview !== null && overLimitOf(preview, live.terms.amount, limitEps);
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
    // Komissiya summadan katta bo'lishi mumkin (TBC naqd — kamida 90 000), faqat raqam bo'lsin
    fee:
      feeShown === null ? null : Number.isNaN(feeShown) ? t('err.number') : feeShown > DEBT_LIMITS.amountMax ? t('err.amountMax') : null,
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
    if (errors.amount || errors.date || errors.interest || errors.fee || amount === null) return;
    save.mutate({
      kind,
      date,
      amount,
      // "Yana oldim" — turkumsiz; kartadan ishlatish va ishlatish — turkum bilan
      category: mode === 'use' ? category : '',
      note: note.trim(),
      ...(kind === 'pay' ? { interest: interestValue } : {}),
      ...(draws ? { channel, fee: channel === 'purchase' ? null : feeValue } : {}),
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
  // Tayyor kartada tenglashtirish — bank ilovasidagi UMUMIY qarz (adjustBase); boshqa qarzlarda — avvalgidek asosiy qarz
  const adjustTotal = product !== null && mode === 'adjust';
  const amountLabel =
    mode === 'pay'
      ? t('pay.amount')
      : mode === 'use'
        ? t('use.amount')
        : mode === 'draw'
          ? t('draw.amount')
          : t(adjustTotal ? 'adjust.amountCard' : 'adjust.amount');

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
      if (draws && feeValue) sub = t('use.feeIncl', { sum: m(feeValue) });
    } else if (mode === 'draw') main = t('draw.after', { sum: m(c.principal) });
    else if (adjustTotal) main = t('adjust.afterCard', { sum: m(adjustBase(c, true)) });
    else main = t('adjust.after', { sum: m(c.principal) });
  }

  // Tayyor karta: kanal izohi — xarid qaysi ko'chirmaga tushadi va qachongacha to'lansa foizsiz; boshqasida foiz shu kundan
  const productRules = product ? CARD_PRODUCTS[product] : null;
  let channelHint: string | null = null;
  if (draws && product) {
    if (channel === 'purchase') {
      const sDay = statementDayOf(live.terms, product);
      const S = isIsoDay(date) ? stmtAfter(date, sDay) : (live.calc.card?.nextStatement.date ?? null);
      // TBC 5.7.3: kechikishdan keyingi ko'chirmalarda (waiverFrom gacha) xarid foizi to'liq to'lansa ham kechirilmaydi
      const waiverFrom = live.calc.card?.waiverFrom ?? null;
      if (S && waiverFrom && S < waiverFrom) channelHint = t('use.graceLost', { s: f.date(S) });
      else if (S) channelHint = t('use.gracePurchase', { s: f.date(S), d: f.date(stmtDue(product, S)) });
    } else channelHint = t('use.graceNone', { v: pctNum(live.terms.cashRate ?? live.terms.annualRate, f.lang) });
  }
  // Komissiya izohi: TBC "boshqa to'lov" — karta tarmog'iga qarab; Infin — rekvizit/soliq 1%, o'z hisobi, hamyon va
  // InfinBANK krediti bepul (taklif 1% bo'lib qoladi — sotuvchi o'zgartiradi)
  const feeHint =
    product === 'tbc-osmon' && channel === 'other'
      ? t('use.feeTbcOther', { pct: pctNum(productRules?.fees.other.pct ?? 0, f.lang) })
      : product === 'infin-black' && channel === 'cash'
        ? t('use.feeInfinCash')
        : product === 'infin-black' && channel === 'other'
          ? t('use.feeInfinOther', { pct: pctNum(productRules?.fees.other.pct ?? 0, f.lang) })
          : t('use.feeHint');
  // To'lov tugmachalari (tayyor karta): minimal (taxmin emas yoki kechikkan), foizsiz qolish uchun, hammasi
  const grace = product ? (live.calc.card?.grace ?? null) : null;
  const payoff = live.calc.payoff;

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
                : adjustTotal
                  ? t('adjust.hintCard', { sum: m(adjustBase(live.calc, true)) })
                  : mode === 'adjust'
                    ? t('adjust.hint', { sum: m(live.calc.principal) })
                    : undefined
            }
          />
          {/*
           * Tenglashtirish to'lov emas: ko'chirma minimali yozilmagan bo'lsa, qarzni kamaytirish uni yopmaydi va to'lov
           * kunidan keyin kechikkan deb ko'rinadi. Bankda to'langan bo'lsa — "To'ladim" bilan yozish kerak
           */}
          {adjustTotal && !entry && next && next.remaining > 0 && !next.card?.estimate ? (
            <p className="mt-2 text-xs leading-relaxed text-warn-ink">{t('adjust.payHint', { sum: m(next.remaining) })}</p>
          ) : null}
          {mode === 'pay' && !entry ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product ? (
                <>
                  {/* Minimal — ko'chirma chiqqan bo'lsa (taxmin emas) yoki kechikkan; "Hammasi"dan kichik bo'lsa */}
                  {next && next.remaining > 0 && next.remaining < payoff && !next.card?.estimate ? (
                    <button type="button" className={chipClass(amount === next.remaining)} onClick={() => setAmount(next.remaining)}>
                      {t('pay.chipMin', { sum: m(next.remaining) })}
                    </button>
                  ) : null}
                  {grace && grace.state === 'open' && grace.left > 0 && grace.left < payoff ? (
                    <button type="button" className={chipClass(amount === grace.left)} onClick={() => setAmount(grace.left)}>
                      {t('pay.chipGrace', { sum: m(grace.left) })}
                    </button>
                  ) : null}
                </>
              ) : next && next.remaining > 0 && next.remaining < payoff ? (
                // "Navbatdagi" faqat "Hammasi"dan kichik bo'lsa — aks holda u "hammasi"dan katta ko'rinardi
                <button type="button" className={chipClass(amount === next.remaining)} onClick={() => setAmount(next.remaining)}>
                  {t('pay.chipNext', { sum: m(next.remaining) })}
                </button>
              ) : null}
              {payoff > 0 ? (
                <button type="button" className={chipClass(amount === payoff)} onClick={() => setAmount(payoff)}>
                  {t('pay.chipAll', { sum: m(payoff) })}
                </button>
              ) : null}
            </div>
          ) : null}
          {mode === 'pay' && product && live.calc.card?.blocked ? (
            // Infin 3.5: 90 kundan ortiq kechikkan karta to'lovdan keyin ham ochilmaydi — "to'lang" deyilmaydi
            <p className="mt-2 text-xs font-medium text-danger-ink">
              {t(live.calc.card.blockedForGood && !live.calc.overdue ? 'banner.blockedForGood' : 'pay.blocked')}
            </p>
          ) : null}
        </div>

        {draws ? (
          <div>
            <p id={howId} className="label">
              {t('use.how')}
            </p>
            <div role="group" aria-labelledby={howId} className="flex flex-wrap gap-1.5">
              {DEBT_CHANNELS.map((c) => (
                <button key={c} type="button" aria-pressed={channel === c} className={chipClass(channel === c)} onClick={() => setChannel(c)}>
                  {t(`ch.${c}`)}
                </button>
              ))}
            </div>
            <FieldNote hint={channelHint} />
          </div>
        ) : null}

        {draws && channel !== 'purchase' ? (
          <MoneyField
            label={t('use.fee')}
            value={feeShown}
            onChange={setFee}
            currency={currency}
            hint={feeHint}
            error={shownError('fee')}
          />
        ) : null}

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

        {/* Tayyor kartada "shundan foiz" so'ralmaydi: to'lov bank tartibida taqsimlanadi (server ham e'tiborsiz qoldiradi) */}
        {mode === 'pay' && !product ? (
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
