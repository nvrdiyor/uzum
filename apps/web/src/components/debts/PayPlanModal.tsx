/**
 * "To'lash" oynasi (2026-11-08): sotuvchi qancha to'lamoqchi ekanini yozadi — SavdoIQ uni hamma faol so'm qarzga
 * bo'lib beradi (qaysi biriga qancha va nega). Egasining so'rovi: "misol uchun 3 mln to'lamoqchi bo'lsam, qaysi biriga
 * qancha, qaysiga qancha to'lashimni maslahat berishi kerak".
 *
 * Hisob — shared debtPaymentPlan (kechikkan → minimal → foizsiz davr → foizi yuqorisi); bu yerda faqat ko'rinish va
 * yozish. "To'lovlarni yozish" — har qator uchun bitta "To'ladim" yozuvi (POST /debts/:id/entries), KETMA-KET: har
 * birining natijasi qatorida ko'rinadi, yozilmagani qayta yuboriladi. Yozish boshlanganda reja qotiriladi — ro'yxat
 * yangilanib qolgan qarzlar kamaysa ham, ko'rsatilgan summalar o'zgarmasin. Hech narsa o'zicha yozilmaydi (Enter ham
 * yozmaydi): to'lov bankda qilinadi, oyna buni birinchi bo'lib aytadi.
 *
 * Ranglar ma'no bo'yicha (DebtsHero kabi): qizil — FAQAT kechikkan, minimal va foiz — za'faron, foizsiz davr va
 * tejash — brend. Telefonda (375) va 1920 da gorizontal aylantirish yo'q: qatorlar o'raladi, summalar `tnum`.
 */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEBT_LIMITS,
  debtPaymentPlan,
  debtPlanDateBounds,
  debtPlanEntries,
  debtPlanQuickAmounts,
  formatDebtMoney,
  type DebtDetail,
  type DebtListResponse,
  type DebtPaymentPlan,
  type DebtPlanLine,
} from '@savdoiq/shared';
import { CheckCircle2, Clock, HandCoins, Info, Loader2, XCircle } from '@/components/icons';
import { Badge, Button, Modal, toast, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { MoneyField } from './MoneyField';
import { DateField, FieldNote } from './fields';
import { isIsoDay, pctNum } from './format';
import './texts';
import './texts-plan';

/** Tanlov tugmachasi — EntryModal dagi summa takliflari bilan bir xil */
const chipClass = (active: boolean) =>
  cn(
    'focusable rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active ? 'border-brand/60 bg-brand/10 text-brand-ink' : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong hover:text-ink',
  );

/** Bosh blokdagi tugma: kichik, asosiy rangda */
export function PayPlanButton({ onClick }: { onClick: () => void }) {
  const t = useT('debts');
  return (
    <Button size="sm" icon={<HandCoins className="h-3.5 w-3.5" />} onClick={onClick}>
      {t('plan.open')}
    </Button>
  );
}

type LineState = { s: 'wait' | 'run' | 'ok' | 'err'; msg?: string };

interface Run {
  /** Yozish boshlangandagi reja — yozuvlardan keyin ro'yxat yangilansa ham ko'rsatilgani shu */
  plan: DebtPaymentPlan;
  date: string;
  state: Record<string, LineState>;
  busy: boolean;
}

export function PayPlanModal({ open, data, onClose }: { open: boolean; data: DebtListResponse; onClose: () => void }) {
  /*
   * Yopilish animatsiyasi davomida oxirgi holat ko'rinib turadi; har yangi ochilishda oyna qaytadan quriladi
   * (oldingi summa va yozish natijalari qolib ketmasin) — EntryModal dagidek
   */
  const [seq, setSeq] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSeq((n) => n + 1);
  }
  if (seq === 0) return null;
  return <PayPlanDialog key={seq} open={open} data={data} onClose={onClose} />;
}

function PayPlanDialog({ open, data, onClose }: { open: boolean; data: DebtListResponse; onClose: () => void }) {
  const t = useT('debts');
  const tc = useT('common');
  const f = useFormat();
  const qc = useQueryClient();
  // Taqsimot faqat so'm qarzlarida
  const m = (v: number) => formatDebtMoney(v, 'UZS', f.lang);
  const today = data.today;

  const [amount, setAmount] = useState<number | null>(null);
  // undefined — tanlanmagan: bugun (server savdo kuni; sahifa yarim tundan keyin ochiq tursa ham yangisi)
  const [dateInput, setDate] = useState<string | undefined>(undefined);
  const date = dateInput ?? today;
  const [tried, setTried] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const busy = run?.busy ?? false;

  const amountValue = amount !== null && Number.isFinite(amount) ? amount : 0;
  const live = useMemo(() => debtPaymentPlan(data.items, amountValue, today), [data.items, amountValue, today]);
  const plan = run ? run.plan : live;
  const quick = debtPlanQuickAmounts(live.needs);
  const entries = debtPlanEntries(plan, run ? run.date : date);
  const bounds = debtPlanDateBounds(plan);
  const hasAmount = amountValue > 0;
  const planned = plan.lines.reduce((a, l) => a + l.amount, 0);
  const shortAll = plan.lines.reduce((a, l) => a + l.note.short, 0);

  const errors = {
    amount:
      amount === null
        ? t('err.amount')
        : Number.isNaN(amount)
          ? t('err.number')
          : !(amount > 0)
            ? t('err.amount')
            : amount > DEBT_LIMITS.amountMax
              ? t('err.amountMax')
              : null,
    date: !isIsoDay(date)
      ? t('err.date')
      : date > today
        ? t('err.dateFuture')
        : bounds.min && date < bounds.min.date
          ? t('plan.err.dateBefore', { name: bounds.min.name, date: f.date(bounds.min.date) })
          : null,
    nothing: hasAmount && entries.length === 0 ? t('plan.err.nothing') : null,
  };
  // Kuzatuvdan oldingi sana bilan to'lov qoldiqni o'zgartirmaydi (bank ilovasidagi qoldiqda bor) — ogohlantirish, xato emas
  const trackedWarn =
    !errors.date && isIsoDay(date) && bounds.tracked && date < bounds.tracked.date
      ? t('plan.warn.tracked', { name: bounds.tracked.name, date: f.date(bounds.tracked.date) })
      : null;

  const setLine = (id: string, st: LineState) => setRun((r) => (r ? { ...r, state: { ...r.state, [id]: st } } : r));
  /**
   * Yozish ketayotganini darhol (render kutmasdan) belgilaydi: tugma qayta chizilguncha ikki marta bosilsa ham
   * to'lovlar ikki marta yozilmasin
   */
  const writing = useRef(false);

  /** Qatorlarni ketma-ket yozadi; `prev` — oldingi urinish (yozilganlari qayta yuborilmaydi) */
  const record = async (frozen: DebtPaymentPlan, day: string, prev: Run['state']) => {
    const todo = debtPlanEntries(frozen, day).filter((e) => prev[e.debtId]?.s !== 'ok');
    if (!todo.length || writing.current) return;
    writing.current = true;
    const state: Run['state'] = { ...prev };
    for (const e of todo) state[e.debtId] = { s: 'wait' };
    setRun({ plan: frozen, date: day, state, busy: true });
    let ok = Object.values(prev).filter((x) => x.s === 'ok').length;
    let bad = 0;
    let wrote = false;
    for (const e of todo) {
      setLine(e.debtId, { s: 'run' });
      try {
        const saved = await api.post<DebtDetail>(`/debts/${e.debtId}/entries`, e.body);
        qc.setQueryData(['debt', saved.id], saved);
        ok += 1;
        wrote = true;
        setLine(e.debtId, { s: 'ok' });
      } catch (err) {
        bad += 1;
        setLine(e.debtId, { s: 'err', msg: err instanceof Error ? err.message : undefined });
      }
    }
    // Ro'yxat (va bosh blok) yangi qoldiqlar bilan qayta olinadi
    if (wrote) void qc.invalidateQueries({ queryKey: ['debts'] });
    writing.current = false;
    setRun((r) => (r ? { ...r, busy: false } : r));
    if (bad === 0) {
      toast.success(t('plan.doneAll', { n: ok }));
      onClose();
    } else toast.error(t('plan.doneSome', { ok, bad }));
  };

  const submit = () => {
    if (busy) return;
    if (run) {
      void record(run.plan, run.date, run.state);
      return;
    }
    setTried(true);
    if (errors.amount || errors.date || errors.nothing || entries.length === 0) return;
    void record(live, date, {});
  };

  const failed = run ? Object.values(run.state).filter((x) => x.s === 'err').length : 0;
  const done = run ? Object.values(run.state).filter((x) => x.s === 'ok' || x.s === 'err').length : 0;
  const total = run ? Object.keys(run.state).length : 0;
  const canEdit = data.canEdit;

  /** Sabab belgilari bosqichlar tartibida: kechikkan → minimal (oylik to'lov) → foizsiz davr → foizi yuqori / qo'shimcha */
  const badges = (l: DebtPlanLine): { tone: Tone; label: string }[] => {
    const has = (k: DebtPlanLine['parts'][number]['kind']) => l.parts.some((p) => p.kind === k);
    const out: { tone: Tone; label: string }[] = [];
    if (has('overdue')) out.push({ tone: 'danger', label: t('plan.badge.overdue') });
    if (has('min')) out.push({ tone: 'warn', label: t(l.kind === 'card' ? 'plan.badge.min' : 'plan.badge.due') });
    // Foizsiz davr minimalning o'zi bilan saqlansa ham (grace qismi 0) — sabab ko'rinsin
    if (has('grace') || l.note.grace?.kept) out.push({ tone: 'brand', label: t('plan.badge.grace') });
    if (has('extra'))
      out.push(l.note.group === 'rate' ? { tone: 'warn', label: t('plan.badge.rate') } : { tone: 'muted', label: t('plan.badge.extra') });
    return out;
  };

  const noteOf = (l: DebtPlanLine): string => {
    const n = l.note;
    const out: string[] = [];
    const card = l.kind === 'card';
    if (n.overdue)
      out.push(
        l.product && n.overdue.blocked
          ? t('plan.n.overdueCard')
          : n.overdue.days > 0
            ? t('plan.n.overdueDays', { n: n.overdue.days })
            : t('plan.n.overdue'),
      );
    if (n.due) out.push(t(card ? 'plan.n.min' : 'plan.n.due', { date: f.dateShort(n.due.date) }));
    if (n.short > 0) out.push(t('plan.n.short', { sum: m(n.short) }));
    const g = n.grace;
    if (g) {
      if (g.state === 'open' && g.left > 0) {
        if (g.kept) out.push(t('plan.n.graceKept', { sum: m(g.risk) }));
        else if (l.amount > 0 && g.risk > 0) out.push(t('plan.n.graceNeed', { sum: m(g.need) }));
      } else if (g.state === 'lost') out.push(t('plan.n.lost'));
      else if (g.state === 'none') out.push(t('plan.n.none'));
    }
    if (l.parts.some((p) => p.kind === 'extra')) {
      const rest = l.parts.length > 1;
      if (n.group === 'rate') out.push(t(rest ? 'plan.n.rateRest' : 'plan.n.rate', { pct: pctNum(n.rate, f.lang) }));
      else if (n.group === 'free') out.push(n.freeUntil ? t('plan.n.free', { date: f.dateShort(n.freeUntil) }) : t('plan.n.freeNoDate'));
      else out.push(t('plan.n.zero'));
    }
    if (l.amount > 0) out.push(l.afterPayoff > 0 ? t('plan.n.after', { sum: m(l.afterPayoff) }) : t('plan.n.closed'));
    return out.join(' · ');
  };

  const status = (id: string) => {
    const st = run?.state[id];
    if (!st) return null;
    const icon =
      st.s === 'ok' ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand" />
      ) : st.s === 'err' ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
      ) : st.s === 'run' ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
      ) : (
        <Clock className="h-3.5 w-3.5 shrink-0 text-muted" />
      );
    const label =
      st.s === 'ok' ? t('plan.lineOk') : st.s === 'err' ? t('plan.lineErr') : st.s === 'run' ? t('plan.lineRun') : t('plan.lineWait');
    return (
      <p
        className={cn(
          'mt-1 flex items-start gap-1.5 text-xs font-medium',
          st.s === 'ok' ? 'text-brand-ink' : st.s === 'err' ? 'text-danger-ink' : 'text-muted',
        )}
        role={st.s === 'err' ? 'alert' : undefined}
      >
        <span className="mt-px">{icon}</span>
        <span className="min-w-0 break-words">
          {label}
          {st.s === 'err' && st.msg ? `: ${st.msg}` : ''}
        </span>
      </p>
    );
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('plan.title')}
      description={t('plan.subtitle')}
      size="lg"
      footer={
        <div className="space-y-2.5">
          {run ? (
            <p className="tnum text-xs font-medium text-ink-soft" aria-live="polite">
              {busy ? t('plan.progress', { done, n: total }) : failed > 0 ? t('plan.doneSome', { ok: total - failed, bad: failed }) : null}
            </p>
          ) : null}
          {tried && !run && errors.nothing ? <p className="text-xs font-medium text-danger-ink">{errors.nothing}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              {run ? tc('btn.close') : tc('btn.cancel')}
            </Button>
            {canEdit ? (
              <Button
                icon={<CheckCircle2 className="h-4 w-4" />}
                onClick={submit}
                loading={busy}
                disabled={run !== null && !busy && failed === 0}
              >
                {run && failed > 0 ? t('plan.retry') : t('plan.record')}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Birinchi gap: pul bankda to'lanadi — bu yerda faqat yoziladi */}
        <div className="flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/5 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" />
          <p className="min-w-0">
            <span className="font-semibold text-info-ink">{t('plan.bankFirst')}</span> {t('plan.bankFirstHint')}
          </p>
        </div>

        {run ? (
          // Yozilmoqda / yozildi: summa va sana qotirilgan
          <p className="tnum text-sm font-medium text-ink">{t('plan.frozen', { date: f.date(run.date), sum: m(run.plan.amount) })}</p>
        ) : (
          <div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
              <MoneyField
                label={t('plan.amount')}
                value={amount}
                onChange={setAmount}
                currency="UZS"
                error={tried ? errors.amount : null}
              />
              <div className="min-w-0">
                <DateField
                  label={t('plan.date')}
                  value={date}
                  onChange={setDate}
                  min={bounds.min?.date}
                  max={today}
                  error={tried ? errors.date : null}
                  hint={trackedWarn ? undefined : t('plan.dateHint')}
                />
                {trackedWarn && !(tried && errors.date) ? (
                  <p className="mt-1.5 text-2xs font-medium leading-relaxed text-warn-ink">{trackedWarn}</p>
                ) : null}
              </div>
            </div>
            {quick.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <button key={q.kind} type="button" className={chipClass(amount === q.amount)} onClick={() => setAmount(q.amount)}>
                    {t(`plan.chip.${q.kind}`, { sum: m(q.amount) })}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        <div>
          <p className="eyebrow-lg">{t('plan.head')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('plan.how')}</p>

          {!hasAmount && !run ? (
            <p className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-sm text-muted">{t('plan.empty')}</p>
          ) : (
            <>
              <ul className="mt-2 divide-y divide-line/70">
                {plan.lines.map((l) => (
                  <li key={l.debtId} className="py-3 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        to={`/debts/${l.debtId}`}
                        className="focusable min-w-0 break-words rounded-sm text-sm font-semibold text-ink underline-offset-2 hover:underline"
                      >
                        {l.name}
                      </Link>
                      <span
                        className={cn(
                          'tnum shrink-0 whitespace-nowrap text-sm font-semibold',
                          l.amount > 0 ? 'text-ink' : 'text-muted',
                        )}
                      >
                        {m(l.amount)}
                      </span>
                    </div>
                    {l.parts.length || l.note.grace?.kept ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {badges(l).map((b) => (
                          <Badge key={b.label} tone={b.tone}>
                            {b.label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <p className={cn('tnum mt-1 break-words text-xs leading-relaxed', l.note.short > 0 && l.amount === 0 ? 'text-warn-ink' : 'text-muted')}>
                      {noteOf(l)}
                    </p>
                    {status(l.debtId)}
                  </li>
                ))}
              </ul>

              <dl className="mt-1 space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-semibold text-ink">{t('plan.total')}</dt>
                  <dd className="tnum whitespace-nowrap font-semibold text-ink">{m(planned)}</dd>
                </div>
                {plan.saved > 0 ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-soft">{t('plan.saved')}</dt>
                    <dd className="tnum whitespace-nowrap font-semibold text-brand-ink">{m(plan.saved)}</dd>
                  </div>
                ) : null}
                {plan.left > 0 ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-ink-soft">
                      {t('plan.left')}
                      <span className="block text-xs text-muted">{t('plan.leftHint')}</span>
                    </dt>
                    <dd className="tnum whitespace-nowrap font-semibold text-info-ink">{m(plan.left)}</dd>
                  </div>
                ) : null}
              </dl>
              {shortAll > 0 ? (
                <p className="tnum mt-3 rounded-xl border border-warn/25 bg-warn/5 px-3.5 py-2.5 text-xs leading-relaxed text-warn-ink">
                  {t('plan.shortAll', { sum: m(shortAll) })}
                </p>
              ) : null}
            </>
          )}

          {plan.skipped.length ? (
            <p className="tnum mt-3 break-words text-xs leading-relaxed text-muted">
              {t('plan.skipped', {
                list: plan.skipped.map((s) => `${s.name} — ${formatDebtMoney(s.payoff, s.currency, f.lang)}`).join(', '),
              })}
            </p>
          ) : null}
          <FieldNote hint={t('plan.estimate')} />
        </div>
      </div>
    </Modal>
  );
}
