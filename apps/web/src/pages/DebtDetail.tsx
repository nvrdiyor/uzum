/**
 * Qarz sahifasi /debts/:id: holat (qancha qoldi, keyingi to'lov, oylik to'lov,
 * foiz), kelgusi to'lovlar jadvali, pul nimaga ishlatilgani va yozuvlar tarixi.
 *
 * Hamma hisoblangan raqam "taxminiy" — banklar kunlarni va yaxlitlashni har xil
 * hisoblaydi. Bank ilovasidagi raqam boshqacha bo'lsa — "Qoldiqni tenglashtirish".
 * Yozish tugmalari faqat yozish huquqi borida.
 *
 * Tayyor kartada (TBC Osmon, Infin Black) kartochkalar boshqa: keyingi to'lov
 * ko'chirma bo'yicha, foizsiz qolish uchun qancha, foiz xavfi, to'lanmagan foiz
 * (taxminiy jarima bilan). Boshqa kartalar va qarzlar — avvalgidek.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CARD_PRODUCTS,
  formatDebtMoney,
  isCardProduct,
  type DebtCurrency,
  type DebtDetail,
  type DebtDue,
  type DebtEntryRow,
  type DebtScheduleRow,
  type DebtTerms,
} from '@savdoiq/shared';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Banknote,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  CreditCard,
  History,
  Hourglass,
  Info,
  Lock,
  Pencil,
  Percent,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Wallet,
} from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProgressBar,
  Skeleton,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { DebtFormModal } from '@/components/debts/DebtFormModal';
import { EntryModal, modeOfEntry, type EntryMode, type EntryTarget } from '@/components/debts/EntryModal';
import { InfoPopover } from '@/components/debts/InfoPopover';
import { KIND_ICON } from '@/components/debts/kinds';
import {
  ENTRY_TONE,
  categoryLabel,
  compactMoney,
  dueShown,
  dueText,
  entryKindLabel,
  graceView,
  minRuleText,
  monthsUntil,
  numText,
  pctNum,
  rateText,
  repaymentText,
} from '@/components/debts/format';
import '@/components/debts/texts';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useFeature } from '@/store/session';

/**
 * Har qarz o'z holati bilan ochiladi: bir qarzdan boshqasiga o'tganda ochiq
 * oyna yoki shakl boshqa qarzga yozilib ketmasin (BatchDetail dagidek).
 */
export default function DebtDetailRoute() {
  const { id = '' } = useParams<{ id: string }>();
  return <DebtDetailPage key={id} id={id} />;
}

/** Tarixdagi tahrir va o'chirish tugmalari — IconButton'ning chegarasi bilan to'qnashmasin (cn — oddiy clsx) */
const ROW_BTN =
  'focusable inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:border-line-strong';

function DebtDetailPage({ id }: { id: string }) {
  const t = useT('debts');
  const tc = useT('common');
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const access = useFeature('debts');
  const isDesktop = useIsDesktop();
  // O'chirilgandan keyin sahifa yopilguncha so'rov qayta yuborilmasin (404)
  const [gone, setGone] = useState(false);

  const { data, isError, error, refetch } = useQuery({
    queryKey: ['debt', id],
    queryFn: () => api.get<DebtDetail>(`/debts/${id}`),
    enabled: Boolean(id) && access === 'full' && !gone,
    // Keshdagi nusxa boshqa qurilmada o'zgargan bo'lishi mumkin — har ochilishda yangisi
    refetchOnMount: 'always',
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [entry, setEntry] = useState<EntryTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<DebtEntryRow | null>(null);

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      api.patch<DebtDetail>(`/debts/${id}`, { expectedUpdatedAt: data?.updatedAt ?? '', archived }),
    onSuccess: (saved, archived) => {
      qc.setQueryData(['debt', id], saved);
      void qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success(t(archived ? 'archive.done' : 'unarchive.done'));
    },
    onError: (err: unknown) => {
      toast.error(t('archive.error'), err instanceof Error ? err.message : undefined);
      if (err instanceof ApiError && err.status === 409) void refetch();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ ok: true; id: string }>(`/debts/${id}`),
    onSuccess: () => {
      setGone(true);
      toast.success(t('delete.done'));
      navigate('/debts', { replace: true });
      qc.removeQueries({ queryKey: ['debt', id] });
      void qc.invalidateQueries({ queryKey: ['debts'] });
    },
    onError: (err: unknown) => {
      toast.error(t('delete.error'), err instanceof Error ? err.message : undefined);
      // Boshqa oynada o'chirilgan (yoki yashirilgan): oyna yopiladi, qayta so'rov 404 — sahifa "topilmadi" holatiga o'tadi
      if (err instanceof ApiError && err.status === 404) {
        setConfirmDelete(false);
        void qc.invalidateQueries({ queryKey: ['debts'] });
        void refetch();
      }
    },
  });

  const removeEntry = useMutation({
    mutationFn: (entryId: string) => api.del<DebtDetail>(`/debts/${id}/entries/${entryId}`),
    onSuccess: (saved) => {
      qc.setQueryData(['debt', id], saved);
      void qc.invalidateQueries({ queryKey: ['debts'] });
      toast.success(t('entry.deleted'));
      setEntryToDelete(null);
    },
    onError: (err: unknown) => {
      toast.error(t('entry.deleteError'), err instanceof Error ? err.message : undefined);
      // Yozuv (yoki qarzning o'zi) boshqa oynada o'chirilgan — qayta urinish yana 404: oyna yopilib, yangi holat olinadi
      if (err instanceof ApiError && err.status === 404) {
        setEntryToDelete(null);
        void qc.invalidateQueries({ queryKey: ['debts'] });
        void refetch();
      }
    },
  });

  const back = (
    <Link to="/debts" className="focusable mb-3 inline-flex items-center gap-1.5 rounded-lg text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" />
      {t('back')}
    </Link>
  );

  if (access !== 'full') {
    return (
      <>
        {back}
        <PageHeader icon={<Banknote className="h-5 w-5" />} title={t('title')} badge={<PreviewBadge feature="debts" />} />
        <PlanGate feature="debts">
          <div className="min-h-[220px]" />
        </PlanGate>
      </>
    );
  }

  const notFound = isError && error instanceof ApiError && error.status === 404;
  if (notFound || (isError && !data)) {
    return (
      <>
        {back}
        <Card>
          {notFound ? (
            <EmptyState icon={<Banknote className="h-6 w-6" />} title={t('notFound')} hint={t('notFoundHint')} />
          ) : (
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          )}
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        {back}
        <Skeleton className="mb-5 h-[92px] w-full" />
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] w-full" />
            ))}
          </div>
          <Card className="p-5">
            <SkeletonRows rows={6} />
          </Card>
        </div>
      </>
    );
  }

  const d = data;
  const { terms, calc } = d;
  const currency = terms.currency;
  const m = (v: number) => formatDebtMoney(v, currency, f.lang);
  const n = (v: number) => numText(v, currency, f.lang);
  const compact = (v: number) => compactMoney(v, currency, f.lang).text;
  const unit = currency === 'USD' ? '$' : t('unit.uzs');
  const isCard = d.kind === 'card';
  const Icon = KIND_ICON[d.kind];
  const archived = calc.state === 'archived';
  const active = calc.state === 'active';
  const next = active ? calc.next : null;
  const canAct = d.canEdit && !archived;
  // Bank kreditiga qo'shimcha summa — alohida qarz (server ham rad etadi); kartada "olish" — ishlatishning o'zi
  const canDraw = !isCard && d.kind !== 'bank';
  // Nasiya — bo'lib to'lab olingan tovar, "ishlatiladigan" naqd pul yo'q: «Ishlatdim» ham, "Nimaga ishlatildi" ham
  // yo'q (ilgari "Ishlatildi 0 so‘m" va yo'q tugmani bosishni so'rardi). API orqali yozilgan ishlatish bo'lsa — blok ko'rinadi
  const canUse = d.kind !== 'installment';
  const showUsage = canUse || d.usage.length > 0;
  const name = d.title ? `${d.lender} — ${d.title}` : d.lender;
  const pct = Math.round(calc.progressPct);
  const openEntry = (mode: EntryMode) => setEntry({ debt: d, mode });
  // Tayyor karta: bank qoidalari (CARD_PRODUCTS) va hisobning karta qismi (foizsiz davr, jarima, blok)
  const product = isCard && isCardProduct(terms.cardProduct) ? CARD_PRODUCTS[terms.cardProduct] : null;
  const pc = product ? calc.card : undefined;
  // "Foizsiz qolish uchun" va "Foiz xavfi" holati (arxivda — so'ralmaydi, 'none' — "bajarildi" emas; format.ts graceView)
  const gv = pc ? graceView(calc) : null;

  const meta: string[] = product
    ? [
        // Tayyor karta: "har oyning N-sanasida" yo'q — TBC'da to'lov kuni har oy boshqa (3.11, 4.12, 3.01): ko'chirmadan 24 kun keyin
        t('meta.prodRate', { v: pctNum(terms.annualRate, f.lang) }) +
          (terms.cashRate != null && terms.cashRate !== terms.annualRate
            ? ` · ${t('meta.prodCash', { v: pctNum(terms.cashRate, f.lang) })}`
            : ''),
        product.statement === 'individual'
          ? t('meta.stmtTbc', { d: terms.statementDay ?? '…', n: product.dueDays })
          : t('meta.stmtInfin', { s: product.statementDay ?? 1, d: (product.statementDay ?? 1) + product.dueDays }),
        t('meta.prodMin', { pct: pctNum(terms.minPct, f.lang) }),
      ]
    : [rateText(terms, t, f.lang), repaymentText(terms, t, f.lang, calc)];
  if (!product) {
    // Saqlangan to'lov kuni (31 — 30.11 ga tushsa ham "har oyning 31-sanasida"), bo'lmasa birinchi sananing kuni
    if (terms.repayment !== 'lump' && terms.firstDueOn)
      meta.push(t('rep.payDay', { d: terms.payDay ?? Number(terms.firstDueOn.slice(8, 10)) }));
    if (terms.annualRate > 0) meta.push(t(terms.dayCount === 'act365' ? 'dc.act365' : 'dc.m30'));
    // Kartada olingan kun so'ralmaydi: startedOn — joriy davr boshi (oxirgi to'lov kuni), "Olingan" emas
    if (!isCard) meta.push(t('meta.started', { date: f.date(terms.startedOn) }));
  }
  if (terms.dueOn) meta.push(t(isCard ? 'meta.limitEnd' : 'meta.dueOn', { date: f.date(terms.dueOn) }));

  // Uchinchi kartochka: to'lov turiga qarab — oylik, shu oygi, minimal yoki qaytarishdagi summa.
  // Kamayib boruvchida shu oy to'langan bo'lsa — shu oyniki (to'langani), keyingi oyniki emas
  // Yopilgan yoki arxivdagi qarzda — "—" (ilgari ham shunday edi; paidDue holatga bog'lanmagan)
  const thisMonth = active ? (calc.paidDue ?? next) : null;
  const pay =
    terms.repayment === 'equal'
      ? {
          label: t('stat.monthly'),
          value: calc.monthlyPayment ? m(calc.monthlyPayment.amount) : '—',
          hint: calc.monthlyPayment
            ? t(calc.monthlyPayment.source === 'contract' ? 'stat.monthlyContract' : 'stat.monthlyCalc')
            : undefined,
        }
      : terms.repayment === 'decreasing'
        ? { label: t('stat.thisMonth'), value: thisMonth ? m(thisMonth.amount) : '—', hint: t('stat.thisMonthHint') }
        : terms.repayment === 'interest'
          ? isCard
            ? { label: t('stat.minimal'), value: next ? m(next.amount) : '—', hint: minRuleText(terms, t, f.lang) }
            : {
                // Oylik foiz — birinchi qisqa davrniki emas (13 kunlik 260 000 "oylik" bo'lib ko'rinardi)
                label: t('stat.interestPay'),
                value: m(calc.monthlyInterest),
                hint: rateText(terms, t, f.lang),
              }
          : {
              label: t('stat.lumpPay'),
              value: next ? m(next.amount) : '—',
              // Yopilgan yoki arxivdagi qarzda "Sana belgilanmagan" emas (sanasi bor edi)
              hint: next
                ? f.date(next.date)
                : t(calc.state === 'paid' ? 'status.closed' : archived ? 'status.archived' : 'status.noDate'),
            };

  // Kelgusi to'lovlar ostidagi xulosa. Oylik to'lov foizdan kam bo'lsa qarz tugamaydi (payoffDate yo'q) —
  // ogohlantirish: aks holda jadval har oy bir xil qoldiq bilan "barqaror" ko'rinardi
  const foot: string[] = [];
  if (active && calc.payoffDate && calc.interestLeft !== null) {
    if (terms.repayment === 'interest' && terms.minPct > 0 && !terms.dueOn)
      foot.push(t('sched.minOnly', { n: monthsUntil(d.today, calc.payoffDate), sum: compact(calc.interestLeft) }));
    else foot.push(t('sched.foot', { sum: m(calc.interestLeft), date: f.date(calc.payoffDate) }));
  } else if (active && terms.repayment === 'interest' && calc.payoff > 0)
    // Qarzi yo'q kartaga ogohlantirish kerak emas. Minimal to'lov foizdan kam kartada ("qarz va foizning 2%")
    // — "oylik to'lov foizdan kam", "faqat foiz" qarzda — "faqat foiz to'lansa…"
    foot.push(t(terms.minPct > 0 ? 'pv.below' : 'sched.interestOnly'));
  else if (active && calc.belowInterest) foot.push(t('pv.below'));
  // Tayyor karta: to'liq to'lasa nima bo'ladi — naqd/o'tkazma va yozilgan foiz bo'lsa "foiz yo'q" deb va'da qilinmaydi.
  // TBC 5.7.3: kechikishdan keyin waiverFrom gacha ko'chirmalarda xarid foizi to'liq to'lansa ham kechirilmaydi (web-5)
  if (pc && active && calc.payoff > 0) {
    const free = pc.cashDebt <= 0 && calc.monthlyInterest <= 0;
    const waiver = pc.waiverFrom
      ? t('sched.waiver', { date: f.date(pc.waiverFrom) })
      : gv?.kind === 'lost'
        ? t('sched.waiverOpen')
        : null;
    if (!free) foot.push(t('sched.fullPaid'));
    if (waiver) foot.push(waiver);
    else if (free) foot.push(t('sched.fullFree'));
  }

  const usageTotal = d.usage.reduce((a, u) => a + u.amount, 0);
  // Kartada calc.used avvaldan bor qarzni ham o'z ichiga oladi, ro'yxat esa faqat yozuvlar — sarlavha ro'yxat jami bilan
  const usageSummary = isCard
    ? t('usage.summaryCard', { used: compact(usageTotal) })
    : calc.unused !== null
      ? t('usage.summary', { used: compact(calc.used), received: compact(calc.received), unused: compact(calc.unused) })
      : t('usage.summaryNoUnused', { used: compact(calc.used) });

  const noteOf = (e: DebtEntryRow): string => {
    const spent = e.kind === 'use' || (isCard && e.kind === 'draw');
    // Tayyor kartadan ishlatish: qanday (xarid, o'tkazma, naqd…) va komissiya; eski xarid yozuvida kanal null — xarid
    const how =
      product && e.kind === 'draw'
        ? [t(`ch.short.${e.channel ?? 'purchase'}`), e.fee != null && e.fee > 0 ? t('hist.fee', { sum: n(e.fee) }) : '']
            .filter(Boolean)
            .join(' · ')
        : '';
    return [how, spent ? categoryLabel(e.category, t) : '', e.note].filter(Boolean).join(' — ');
  };

  const columns: Column<DebtEntryRow>[] = [
    {
      key: 'date',
      header: t('hist.col.date'),
      render: (e) => <span className="tnum whitespace-nowrap text-ink">{f.date(e.date)}</span>,
    },
    {
      key: 'kind',
      header: t('hist.col.kind'),
      render: (e) => <Badge tone={ENTRY_TONE[e.kind]}>{entryKindLabel(e.kind, isCard, t)}</Badge>,
    },
    {
      key: 'amount',
      header: t('hist.col.amount'),
      align: 'right',
      render: (e) => <span className="font-semibold text-ink">{n(e.amount)}</span>,
    },
    {
      key: 'note',
      header: t('hist.col.note'),
      render: (e) => {
        const text = noteOf(e);
        return text ? (
          <span className="line-clamp-2 break-words" title={text}>
            {text}
          </span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: 'split',
      header: t('hist.col.split'),
      align: 'right',
      render: (e) =>
        e.split ? (
          <span>
            <span className="text-warn-ink">{n(e.split.interest)}</span> / {n(e.split.principal)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'balance',
      header: t('hist.col.balance'),
      align: 'right',
      // Avvaldan bor qarzda kuzatuvdan oldingi yozuv qoldiqqa ta'sir qilmaydi (bank qoldig'ida bor)
      render: (e) => (e.historical ? <span className="text-xs text-muted">{t('hist.historical')}</span> : n(e.balanceAfter)),
    },
  ];
  if (d.canEdit) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label={t('btn.edit')}
            title={t('btn.edit')}
            className={cn(ROW_BTN, 'hover:text-ink')}
            onClick={() => setEntry({ debt: d, mode: modeOfEntry(e, isCard), entry: e })}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={t('btn.delete')}
            title={t('btn.delete')}
            className={cn(ROW_BTN, 'hover:text-danger')}
            onClick={() => setEntryToDelete(e)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    });
  }

  return (
    <>
      {back}
      <PageHeader
        icon={<Icon className="h-5 w-5" />}
        title={name}
        description={product ? `${product.bank} ${product.name} · ${product.network}` : t(`kind.${d.kind}`)}
        badge={
          <>
            {calc.state === 'paid' ? <Badge tone="brand">{t('status.closed')}</Badge> : null}
            {archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
            {!d.canEdit ? <Badge tone="muted">{t('readonly')}</Badge> : null}
          </>
        }
        meta={
          <>
            {meta.map((x) => (
              <span key={x} className="meta-chip tnum">
                {x}
              </span>
            ))}
            {d.isOwner && d.ownerOnly ? (
              <span className="meta-chip" title={t('f.ownerOnlyHint')}>
                <Lock className="h-3.5 w-3.5" />
                {t('onlyYou')}
              </span>
            ) : null}
          </>
        }
        actions={
          d.canEdit ? (
            <>
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
                {t('btn.edit')}
              </Button>
              <Button
                variant="ghost"
                icon={<Archive className="h-4 w-4" />}
                loading={archive.isPending}
                onClick={() => archive.mutate(!archived)}
              >
                {archived ? t('btn.unarchive') : t('btn.archive')}
              </Button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="btn text-danger-ink hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
                {t('btn.delete')}
              </button>
            </>
          ) : undefined
        }
      />

      <PlanGate feature="debts">
        <div className="space-y-5">
          {/* Tayyor karta kechiksa bank limitni bloklaydi va jarima yozadi — taxminiy jarima bilan (qizil — faqat kechikkanda) */}
          {pc && active && calc.overdue ? (
            <p className="tnum flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-medium text-danger-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {pc.penalty > 0
                  ? t('banner.cardOverduePen', { sum: m(calc.overdue.amount), pen: m(pc.penalty) })
                  : t('banner.cardOverdue', { sum: m(calc.overdue.amount) })}
              </span>
            </p>
          ) : null}
          {/* Infin 3.5: 90 kundan ortiq kechikkan karta muddati tugaguncha bloklanadi — to'lovdan keyin ham */}
          {pc && active && pc.blockedForGood ? (
            <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-medium text-danger-ink">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{t('banner.blockedForGood')}</span>
            </p>
          ) : null}

          {pc ? (
            <StatGrid>
              <StatCard
                label={t('stat.left')}
                value={m(calc.principal)}
                hint={pc.blocked ? t('stat.blocked') : t('stat.leftHintCard', { sum: m(terms.amount), pct })}
                icon={<Banknote />}
                tone="warn"
              />
              <StatCard
                label={t('stat.next')}
                // Bugungi yopish summasidan oshmaydi (xavfsizlik to'ri, web-2)
                value={next ? `${next.card?.estimate ? '≈ ' : ''}${m(dueShown(next.remaining, calc, true))}` : '—'}
                hint={
                  next
                    ? next.status === 'overdue'
                      ? `${f.date(next.date)} · ${dueText(next, t)}`
                      : calc.paidDue
                        ? t('stat.paidDue', { date: f.date(next.date) })
                        : next.card?.estimate
                          ? `${f.date(next.date)} · ${t('stat.nextEstimate', { date: f.date(next.card.statementDate) })}`
                          : `${f.date(next.date)} · ${dueText(next, t)}`
                    : t(archived ? 'status.archived' : calc.payoff <= 0 ? 'sched.empty' : 'stat.noNext')
                }
                icon={<CalendarClock />}
                tone={next && next.status === 'overdue' ? 'danger' : 'warn'}
                footer={
                  next ? (
                    <InfoPopover
                      title={t('stat.how')}
                      label={
                        <>
                          <Info className="h-3.5 w-3.5" />
                          {t('stat.how')}
                        </>
                      }
                      className="focusable inline-flex items-center gap-1 rounded text-xs font-medium text-brand-ink hover:underline"
                    >
                      <ExplainDue due={next} terms={terms} />
                    </InfoPopover>
                  ) : undefined
                }
              />
              <StatCard
                label={t('stat.grace')}
                // 'none' — ko'chirmada foizsiz bo'ladigan narsa yo'q (faqat naqd/o'tkazma yoki foizli qarz): "bajarildi" EMAS.
                // 'lost' (TBC 5.7.3) — to'liq to'lansa ham foiz kechirilmaydi: "foizsiz qolish uchun X" deb va'da qilinmaydi
                value={gv && 'left' in gv && gv.kind !== 'lost' ? m(gv.left) : '—'}
                hint={
                  !gv || gv.kind === 'archived'
                    ? t('status.archived')
                    : gv.kind === 'noStatement'
                      ? t('stat.graceNone', { date: f.date(pc.nextStatement.date) })
                      : gv.kind === 'none'
                        ? t('stat.graceNoPart')
                        : gv.kind === 'lost'
                          ? t('stat.graceLost')
                          : gv.kind === 'done'
                            ? t('stat.graceDone')
                            : t('stat.graceBy', { date: f.date(gv.due) })
                }
                icon={<ShieldCheck />}
                // To'lash kerak — za'faron, bajarilgan — brend; foizsiz davr yo'qolgani kechikish emas — qizil emas
                tone={gv && 'left' in gv ? (gv.kind === 'done' ? 'brand' : 'warn') : 'muted'}
              />
              <StatCard
                label={t('stat.risk')}
                // Ochiq ko'chirma to'lov kunigacha to'liq to'lanmasa qo'shiladigan foiz (bugungacha yig'ilgani emas —
                // ko'chirma kuni u hali kichik). To'liq to'langanda 0; ko'chirma yo'q bo'lsa — keyingisi qachon
                value={gv && 'left' in gv ? (gv.kind === 'done' ? m(0) : `≈ ${m(gv.risk)}`) : '—'}
                hint={
                  !gv || gv.kind === 'archived'
                    ? t('status.archived')
                    : gv.kind === 'noStatement'
                      ? t('stat.graceNone', { date: f.date(pc.nextStatement.date) })
                      : gv.kind === 'none'
                        ? t('stat.riskNone')
                        : gv.kind === 'lost'
                          ? t('stat.riskLost')
                          : gv.kind === 'open'
                            ? // Sana qo'shni "Foizsiz qolish uchun" kartasida — izoh 2 qatorga sig'sin
                              t('stat.riskBy')
                            : t('stat.riskPaid')
                }
                icon={<Percent />}
                tone="warn"
                footer={active && pc.graceMonthly > 0 ? t('stat.riskMonthly', { sum: m(pc.graceMonthly) }) : undefined}
              />
              <StatCard
                label={t('stat.accrued')}
                value={m(calc.accruedInterest)}
                hint={pc.penalty > 0 ? t('stat.penaltyPart', { sum: m(pc.penalty) }) : t('stat.accruedHint')}
                icon={<Hourglass />}
                tone="warn"
              />
              <StatCard
                label={t('stat.freeLimit')}
                value={m(calc.freeLimit ?? 0)}
                hint={
                  pc.blockedForGood
                    ? t('stat.blockedForGood')
                    : pc.blocked
                      ? t('stat.blocked')
                      : t('stat.freeLimitHint', { sum: m(terms.amount) })
                }
                icon={<CreditCard />}
                tone={pc.blocked ? 'danger' : 'info'}
              />
            </StatGrid>
          ) : (
            <StatGrid>
              <StatCard
                label={t('stat.left')}
                value={m(calc.principal)}
                hint={
                  isCard
                    ? t('stat.leftHintCard', { sum: m(terms.amount), pct })
                    : t('stat.leftHint', { sum: m(calc.received), pct })
                }
                icon={<Banknote />}
                tone="warn"
              />
              <StatCard
                label={t('stat.next')}
                value={next ? m(next.remaining) : '—'}
                // Arxivda — "To'lov sanasi yo'q" emas; qarzsiz karta yopilmaydi, lekin to'lanadigan narsa yo'q
                hint={
                  next
                    ? calc.paidDue
                      ? t('stat.paidDue', { date: f.date(next.date) })
                      : `${f.date(next.date)} · ${dueText(next, t)}`
                    : t(
                        calc.state === 'paid'
                          ? 'sched.emptyPaid'
                          : archived
                            ? 'status.archived'
                            : calc.payoff <= 0
                              ? 'sched.empty'
                              : 'stat.noNext',
                      )
                }
                icon={<CalendarClock />}
                // Qizil — faqat kechikkanda
                tone={next && next.status === 'overdue' ? 'danger' : 'warn'}
                footer={
                  next ? (
                    <InfoPopover
                      title={t('stat.how')}
                      label={
                        <>
                          <Info className="h-3.5 w-3.5" />
                          {t('stat.how')}
                        </>
                      }
                      className="focusable inline-flex items-center gap-1 rounded text-xs font-medium text-brand-ink hover:underline"
                    >
                      <ExplainDue due={next} terms={terms} />
                    </InfoPopover>
                  ) : undefined
                }
              />
              <StatCard label={pay.label} value={pay.value} hint={pay.hint} icon={<CalendarDays />} tone="warn" />
              <StatCard
                label={t('stat.monthInterest')}
                value={m(calc.monthlyInterest)}
                hint={terms.annualRate > 0 ? t('stat.monthInterestHint') : t('rate.none')}
                icon={<Percent />}
                tone="warn"
              />
              <StatCard
                label={t('stat.interestPaid')}
                value={m(calc.interestPaid)}
                hint={t('stat.interestPaidHint', { sum: m(calc.paid) })}
                icon={<CircleCheck />}
                tone="brand"
              />
              {isCard ? (
                <StatCard
                  label={t('stat.freeLimit')}
                  value={m(calc.freeLimit ?? 0)}
                  hint={t('stat.freeLimitHint', { sum: m(terms.amount) })}
                  icon={<CreditCard />}
                  tone="info"
                />
              ) : calc.unused !== null ? (
                <StatCard
                  label={t('stat.unused')}
                  value={m(calc.unused)}
                  hint={t('stat.unusedHint', { used: m(calc.used), received: m(calc.received) })}
                  icon={<Wallet />}
                  tone="brand"
                />
              ) : canUse ? (
                <StatCard label={t('stat.used')} value={m(calc.used)} hint={t('stat.usedHint')} icon={<Wallet />} tone="muted" />
              ) : null}
            </StatGrid>
          )}

          {canAct ? (
            <div className="flex flex-wrap gap-2">
              {active ? (
                <Button variant="soft" icon={<CircleCheck className="h-4 w-4" />} onClick={() => openEntry('pay')}>
                  {t('btn.pay')}
                </Button>
              ) : null}
              {/* Nasiya — bo'lib to'lab olingan tovar, "ishlatiladigan" naqd pul yo'q */}
              {canUse ? (
                <Button variant="outline" icon={<ShoppingBag className="h-4 w-4" />} onClick={() => openEntry('use')}>
                  {isCard ? t('btn.useCard') : t('btn.use')}
                </Button>
              ) : null}
              {canDraw ? (
                <Button variant="outline" icon={<PlusCircle className="h-4 w-4" />} onClick={() => openEntry('draw')}>
                  {t('btn.draw')}
                </Button>
              ) : null}
              <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => openEntry('adjust')}>
                {t('btn.adjust')}
              </Button>
            </div>
          ) : null}

          {/* Keng ekranda yonma-yon (jadval keng, ishlatilishi tor); 1536 dan tor — ustma-ust. Ishlatish bloki yo'q bo'lsa — jadval butun kenglikda */}
          <div className={cn('grid gap-5', showUsage && '2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
            <Card className="overflow-hidden">
              <CardHeader
                title={t('sched.title')}
                subtitle={`${t('sched.subtitle')} · ${unit}`}
                icon={<CalendarDays />}
                tone="info"
                actions={<Badge tone="muted">{t('sched.badge')}</Badge>}
              />
              <div className="mt-4">
                {/*
                 * Arxivdagi qarzda jadval ko'rsatilmaydi: hisob uni baribir chizadi va o'tgan sanalar qizil
                 * "kechikkan" bo'lib chiqardi, "Keyingi to'lov" esa "—". EmptyState o'z py-14 bilan (cn — oddiy clsx)
                 */}
                {!archived && d.schedule.length > 0 ? (
                  <ScheduleTable rows={d.schedule} currency={currency} desktop={isDesktop} />
                ) : (
                  <EmptyState
                    title={t(
                      archived
                        ? 'status.archived'
                        : calc.state === 'paid'
                          ? 'sched.emptyPaid'
                          : terms.repayment === 'lump' && !terms.dueOn
                            ? 'sched.emptyLump'
                            : 'sched.empty',
                    )}
                  />
                )}
              </div>
              {foot.length ? (
                <div className="tnum space-y-1 border-t border-line px-5 py-3 text-xs text-muted">
                  {foot.map((x) => (
                    <p key={x}>{x}</p>
                  ))}
                </div>
              ) : null}
            </Card>

            {showUsage ? (
              <Card>
                <CardHeader title={t('usage.title')} subtitle={usageSummary} icon={<ShoppingBag />} tone="info" />
                <CardBody>
                  {d.usage.length ? (
                    <ul className="space-y-3.5">
                      {d.usage.map((u) => {
                        const share = usageTotal > 0 ? (u.amount / usageTotal) * 100 : 0;
                        return (
                          <li key={u.category}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate text-ink-soft">{categoryLabel(u.category, t)}</span>
                              <span className="tnum shrink-0 font-semibold text-ink">{m(u.amount)}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <ProgressBar className="flex-1" value={share} tone="info" />
                              <span className="tnum shrink-0 text-right text-2xs text-muted">
                                {Math.round(share)}% · {t('usage.count', { n: u.count })}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState className="py-6" title={t('usage.empty')} hint={t('usage.emptyHint')} />
                  )}
                </CardBody>
              </Card>
            ) : null}
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title={t('hist.title')}
              subtitle={`${t('hist.subtitle', { n: d.entries.length })} · ${unit}`}
              icon={<History />}
              tone="muted"
            />
            <div className="mt-4">
              <DataTable
                columns={columns}
                rows={d.entries}
                rowKey={(e) => e.id}
                empty={<EmptyState title={t('hist.empty')} hint={t(canUse ? 'hist.emptyHint' : 'hist.emptyHintPay')} />}
              />
            </div>
          </Card>

          <p className="max-w-[90ch] text-xs leading-relaxed text-muted">
            {/* Tayyor kartada to'lov bank tartibida (kechikkan, ko'chirma foizi, asosiy); TBC'da — muzlatish izohi */}
            {t(product ? 'foot.methodCard' : 'foot.method', {
              method:
                terms.annualRate > 0 ? t(terms.dayCount === 'act365' ? 'foot.daily' : 'foot.monthly') : t('foot.noRate'),
            })}{' '}
            {product?.payOrder === 'purchaseFirst' ? `${t('foot.frozen')} ` : null}
            {t('foot.adjust')}
          </p>
        </div>
      </PlanGate>

      <DebtFormModal open={editOpen} onClose={() => setEditOpen(false)} debt={d} today={d.today} isOwner={d.isOwner} />
      <EntryModal target={entry} today={d.today} onClose={() => setEntry(null)} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('delete.title')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {tc('btn.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              {t('btn.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          {d.entryCount > 0 ? t('delete.text', { name, n: d.entryCount }) : t('delete.textEmpty', { name })}
        </p>
        {!archived ? <p className="mt-2 text-xs text-muted">{t('delete.archiveHint')}</p> : null}
      </Modal>

      <Modal
        open={entryToDelete !== null}
        onClose={() => setEntryToDelete(null)}
        title={t('entry.deleteTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEntryToDelete(null)}>
              {tc('btn.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removeEntry.isPending}
              onClick={() => entryToDelete && removeEntry.mutate(entryToDelete.id)}
            >
              {t('btn.delete')}
            </Button>
          </div>
        }
      >
        <p className="tnum text-sm text-ink-soft">
          {entryToDelete
            ? t('entry.deleteText', {
                date: f.date(entryToDelete.date),
                kind: entryKindLabel(entryToDelete.kind, isCard, t),
                sum: m(entryToDelete.amount),
              })
            : null}
        </p>
      </Modal>
    </>
  );
}

/**
 * "Kelgusi to'lovlar": jadval (md dan keng) yoki ro'yxat (telefon); kechikkan qator — och qizil.
 * Tayyor kartaning 'charge' qatori to'lov emas: foizsiz davr yo'qolib, qarzga foiz qo'shilgan kun (TBC: yozilgan
 * to'lovlarning muzlatilgan puli xarid foizini yopgan) — to'lov va asosiy qarz "—", foiz "+", qoldiq oshadi
 */
function ScheduleTable({ rows, currency, desktop }: { rows: DebtScheduleRow[]; currency: DebtCurrency; desktop: boolean }) {
  const t = useT('debts');
  const f = useFormat();
  const n = (v: number) => numText(v, currency, f.lang);
  const late = (r: DebtScheduleRow) =>
    r.status === 'overdue' ? (
      <Badge tone="danger" className="ml-2">
        {t('sched.overdue')}
      </Badge>
    ) : null;
  const isCharge = (r: DebtScheduleRow) => r.kind === 'charge';
  const chargeNote = <span className="ml-2 text-2xs font-normal text-muted">{t('sched.charge')}</span>;

  if (!desktop) {
    return (
      <ul className="divide-y divide-line/70 border-t border-line">
        {rows.map((r, i) => (
          <li key={`${r.date}-${i}`} className={cn('px-4 py-3', r.status === 'overdue' && 'bg-danger/5')}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn('tnum flex min-w-0 items-center text-sm font-medium text-ink', isCharge(r) && 'flex-wrap')}>
                {f.date(r.date)}
                {late(r)}
                {isCharge(r) ? chargeNote : null}
              </span>
              <span className="tnum shrink-0 font-semibold text-ink">
                {isCharge(r) ? '—' : formatDebtMoney(r.payment, currency, f.lang)}
              </span>
            </div>
            <p className="tnum mt-0.5 text-xs text-muted">
              {isCharge(r) ? (
                <>
                  {t('sched.col.interest')} <span className="text-warn-ink">+{n(r.interest)}</span> · {t('sched.col.balance')}{' '}
                  {n(r.balance)}
                </>
              ) : (
                <>
                  {t('sched.col.interest')} {n(r.interest)} · {t('sched.col.principal')} {n(r.principal)} ·{' '}
                  {t('sched.col.balance')} {n(r.balance)}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  const th = 'table-head border-b border-line px-5 py-3';
  const td = 'tnum whitespace-nowrap px-5 py-2.5 text-right';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={cn(th, 'text-left')}>{t('sched.col.date')}</th>
            <th className={cn(th, 'text-right')}>{t('sched.col.payment')}</th>
            <th className={cn(th, 'text-right')}>{t('sched.col.interest')}</th>
            <th className={cn(th, 'text-right')}>{t('sched.col.principal')}</th>
            <th className={cn(th, 'text-right')}>{t('sched.col.balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            isCharge(r) ? (
              <tr key={`${r.date}-${i}`} className={cn('border-b border-line/60 last:border-0', r.status === 'overdue' && 'bg-danger/5')}>
                <td className="tnum whitespace-nowrap px-5 py-2.5 text-ink">
                  {f.date(r.date)}
                  {late(r)}
                  {chargeNote}
                </td>
                <td className={cn(td, 'text-muted')}>—</td>
                <td className={cn(td, 'text-warn-ink')}>+{n(r.interest)}</td>
                <td className={cn(td, 'text-muted')}>—</td>
                <td className={cn(td, 'text-ink-soft')}>{n(r.balance)}</td>
              </tr>
            ) : (
              <tr key={`${r.date}-${i}`} className={cn('border-b border-line/60 last:border-0', r.status === 'overdue' && 'bg-danger/5')}>
                <td className="tnum whitespace-nowrap px-5 py-2.5 text-ink">
                  {f.date(r.date)}
                  {late(r)}
                </td>
                <td className={cn(td, 'font-semibold text-ink')}>{n(r.payment)}</td>
                {/* Foiz — za'faron (qarzning narxi) */}
                <td className={cn(td, 'text-warn-ink')}>{n(r.interest)}</td>
                <td className={cn(td, 'text-ink-soft')}>{n(r.principal)}</td>
                <td className={cn(td, 'text-ink-soft')}>{n(r.balance)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** "Qanday hisoblandi?": to'lov foiz va asosiy qarzga qanday bo'linadi, foiz formulasi */
function ExplainDue({ due, terms }: { due: DebtDue; terms: DebtTerms }) {
  const t = useT('debts');
  const f = useFormat();
  const m = (v: number) => formatDebtMoney(v, terms.currency, f.lang);
  const n = (v: number) => numText(v, terms.currency, f.lang);
  const { base, days, dayCount, annualRate } = due.explain;

  let formula: string | null = null;
  if (annualRate > 0 && due.interest > 0 && base > 0) {
    if (dayCount === 'act365') {
      /*
       * Formula faqat o'zi shu foizni bersa ko'rsatiladi. Erta to'lovdan keyingi oyda yoki davr ichidagi
       * xariddan keyin foiz boshqa qoldiq/kunlardan yig'ilgan — ilgari "46 210 317 × 28% × 31 / 365 ≈ 1 205 266"
       * chiqardi, chap tomoni esa 1 098 919. Kunlik bo'laklar yaxlitlanadi: 1 so'm (1 sent) gacha farq — yaxlitlash
       */
      const exact = (base * annualRate * days) / 36500;
      const tol = terms.currency === 'USD' ? 0.01 : 1;
      if (Math.abs(exact - due.interest) <= tol + 1e-9)
        formula = `${n(base)} × ${pctNum(annualRate, f.lang)}% × ${days} / 365 = ${n(due.interest)}`;
    } else {
      // Oylik usul: qoldiq × (yillik ÷ 12); to'liq bo'lmagan oyda — necha oy
      const months = due.interest / ((base * annualRate) / 1200);
      const monthsText = Math.abs(months - 1) < 0.01 ? '' : ` × ${pctNum(months, f.lang)} ${t('how.months')}`;
      formula = `${n(base)} × ${pctNum(annualRate / 12, f.lang)}%${monthsText} ≈ ${n(due.interest)}`;
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="tnum font-semibold text-ink">
        {f.date(due.date)} — {m(due.amount)}
      </p>
      <p className="tnum">{t('how.split', { amount: n(due.amount), interest: n(due.interest), principal: n(due.principal) })}</p>
      {formula ? <p className="tnum rounded-lg bg-surface-2 px-2.5 py-1.5 font-medium text-ink">{formula}</p> : null}
      {annualRate > 0 ? <p>{t(dayCount === 'act365' ? 'how.daily' : 'how.monthly')}</p> : null}
      {terms.repayment === 'lump' && due.interest > 0 ? <p>{t('how.lump')}</p> : null}
      {/* Tayyor kartada minimal ko'chirma kunidagi qarzdan (to'lov kunidagisidan emas) */}
      {terms.kind === 'card' ? (
        <p>{t(terms.cardProduct ? 'how.prodCard' : 'how.card', { rule: minRuleText(terms, t, f.lang) })}</p>
      ) : null}
      {due.paid > 0 ? <p className="tnum">{t('how.paid', { paid: m(due.paid), left: m(due.remaining) })}</p> : null}
      <p className="text-muted">{t('how.estimate')}</p>
    </div>
  );
}
