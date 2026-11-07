/**
 * Moliya › Qarzlar (2026-11-07): sotuvchining qarzlari — odamdan, bankdan, kredit
 * karta yoki limit, nasiya. Sahifa kompaniya darajasida: yuqori paneldagi davr
 * va do'kon tanlagichiga bog'liq emas, so'rov kalitida davr yo'q.
 *
 * Qarzlar standart "Faqat men ko'raman" — server ularni egadan boshqaga
 * bermaydi. Yozish tugmalari faqat yozish huquqi borida (kuzatuvchiga yo'q).
 *
 * Bosh blok va kechikish banneridan keyin — tayyor kartalar bo'yicha "To'lov
 * tavsiyasi" (2026-11-08): qaysi kartaga qancha va qachongacha to'lansa foiz ishlamaydi.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  debtPaymentAdvice,
  formatDebtMoney,
  toBusinessDate,
  type BatchListResponse,
  type DebtCalc,
  type DebtKind,
  type DebtListResponse,
  type DebtSummary,
} from '@savdoiq/shared';
import { AlertTriangle, ArrowRight, Banknote, Lock, Plus, Truck } from '@/components/icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Segmented,
  Skeleton,
} from '@/components/ui';
import { DebtAdvice } from '@/components/debts/DebtAdvice';
import { DebtCard } from '@/components/debts/DebtCard';
import { DebtFormModal } from '@/components/debts/DebtFormModal';
import { DebtsHero } from '@/components/debts/DebtsHero';
import { EntryModal, type EntryMode, type EntryTarget } from '@/components/debts/EntryModal';
import { KindTiles } from '@/components/debts/kinds';
import { sumToUzs, uzsSumText } from '@/components/debts/format';
import '@/components/debts/texts';
import { api } from '@/lib/api';
import { useCanOpen } from '@/lib/view';
import { useFormat, useT } from '@/i18n';
import { useFeature } from '@/store/session';

type State = DebtCalc['state'];

const EMPTY_KEY: Record<State, string> = {
  active: 'filter.emptyActive',
  paid: 'filter.emptyPaid',
  archived: 'filter.emptyArchived',
};

export default function Debts() {
  const t = useT('debts');
  const f = useFormat();
  const access = useFeature('debts');
  const costAccess = useFeature('cost_price');
  const canOpen = useCanOpen();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['debts'],
    queryFn: () => api.get<DebtListResponse>('/debts'),
    // Tarifda yopiq bo'lsa so'rov yuborilmaydi (server baribir 402 beradi)
    enabled: access === 'full',
  });

  /*
   * Partiyalardagi to'lanmagan cargo — bu yerda kiritilmaydi va jamga qo'shilmaydi,
   * faqat eslatma. Partiyalar ro'yxatining o'sha so'rovi (['batches']) o'qiladi.
   */
  const showCargo = access === 'full' && costAccess === 'full' && canOpen('/batches');
  const batches = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get<BatchListResponse>('/batches'),
    enabled: showCargo,
  });
  const cargoDue = showCargo ? (batches.data?.grand.cargoDue ?? 0) : 0;

  const [filter, setFilter] = useState<State | null>(null);
  const [form, setForm] = useState<{ kind: DebtKind | null } | null>(null);
  const [entry, setEntry] = useState<EntryTarget | null>(null);

  const today = data?.today ?? toBusinessDate(new Date());
  const items = data?.items ?? [];
  const counts = data?.totals.counts ?? { active: 0, paid: 0, archived: 0 };
  const canEdit = data?.canEdit ?? false;
  const isOwner = data?.isOwner ?? false;
  // Tanlanmagan bo'lsa — birinchi bo'sh bo'lmagan guruh (hammasi yopilgan bo'lsa ro'yxat bo'sh ko'rinmasin)
  const auto: State = counts.active > 0 ? 'active' : counts.paid > 0 ? 'paid' : counts.archived > 0 ? 'archived' : 'active';
  const current = filter ?? auto;
  const visible = items.filter((i) => i.calc.state === current);
  const allPrivate = isOwner && items.length > 0 && items.every((i) => i.ownerOnly);
  const overdueCount = data?.totals.byCurrency.reduce((a, x) => a + x.overdueCount, 0) ?? 0;
  // Tayyor kartalarning taxminiy kechikish jarimasi — kechikkan summa ichida (bu kartalar faqat so'mda)
  const penalty = items.reduce((a, i) => a + (i.calc.state === 'active' ? (i.calc.card?.penalty ?? 0) : 0), 0);
  // To'lov tavsiyasi (tayyor kartalar: qaysi kartaga qancha va qachongacha) — faqat "Faol" ko'rinishida, to'lanadigan
  // narsa bo'lsa. Yangi hisob emas: kartochkalardagi calc dan, server savdo kuni bilan
  const advice = data && current === 'active' ? debtPaymentAdvice(data.items, data.today) : null;

  const openEntry = (debt: DebtSummary, mode: EntryMode) => setEntry({ debt, mode });
  // Sahifa yarim tundan keyin ham ochiq turgan bo'lsa — yangi savdo kuni serverdan: eski kun shaklda kuzatuv
  // boshi bo'lib qolsa, birinchi to'lov shu kunga qo'yilganda server "o'tib ketgan" deb 400 qaytarardi
  const openForm = (kind: DebtKind | null) => {
    if (data && data.today !== toBusinessDate(new Date())) void refetch();
    setForm({ kind });
  };

  return (
    <>
      <PageHeader
        icon={<Banknote className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="debts" />}
        meta={
          allPrivate ? (
            <span className="meta-chip" title={t('onlyYouHint')}>
              <Lock className="h-3.5 w-3.5" />
              {t('onlyYou')}
            </span>
          ) : undefined
        }
        actions={
          canEdit && items.length > 0 ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
              {t('add')}
            </Button>
          ) : undefined
        }
      />

      <PlanGate feature="debts">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-[260px] w-full rounded-2xl" />
            <div className="grid gap-4 xl:grid-cols-2">
              <Skeleton className="h-[300px] w-full rounded-2xl" />
              <Skeleton className="h-[300px] w-full rounded-2xl" />
            </div>
          </div>
        ) : isError ? (
          <Card>
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          </Card>
        ) : items.length === 0 ? (
          <Card className="px-5 py-10 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
                <Banknote className="h-6 w-6" />
              </div>
              {/* Ega bo'lmagan a'zo: egasining shaxsiy qarzlari bo'lishi mumkin — "yo'q" emas, "sizga ochiq emas" */}
              <p className="font-display text-base font-bold text-ink">{isOwner ? t('empty.title') : t('empty.teamTitle')}</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{isOwner ? t('empty.hint') : t('empty.teamHint')}</p>
            </div>
            {canEdit ? <KindTiles className="mx-auto mt-6 max-w-2xl" onPick={openForm} /> : null}
          </Card>
        ) : data ? (
          <div className="space-y-4">
            {counts.active > 0 ? <DebtsHero data={data} /> : null}

            {overdueCount > 0 ? (
              <p className="tnum flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-4 py-2.5 text-sm font-medium text-danger-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  {t('banner.overdue', { n: overdueCount, sum: uzsSumText(sumToUzs(data, (x) => x.overdue), f.lang) })}
                  {penalty > 0 ? `. ${t('banner.penaltyAll', { sum: formatDebtMoney(penalty, 'UZS', f.lang) })}` : null}
                </span>
              </p>
            ) : null}

            {advice ? <DebtAdvice advice={advice} /> : null}

            {cargoDue > 0 ? (
              <Link
                to="/batches"
                className="focusable tnum flex items-center gap-2 rounded-xl border border-info/25 bg-info/5 px-4 py-2.5 text-sm font-medium text-info-ink transition-colors hover:border-info/50"
              >
                <Truck className="h-4 w-4 shrink-0" />
                <span className="min-w-0">{t('banner.cargo', { sum: f.money(cargoDue) })}</span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0" />
              </Link>
            ) : null}

            {counts.paid + counts.archived > 0 ? (
              <Segmented<State>
                size="sm"
                value={current}
                onChange={setFilter}
                options={[
                  { value: 'active', label: t('filter.active'), count: counts.active },
                  { value: 'paid', label: t('filter.paid'), count: counts.paid },
                  { value: 'archived', label: t('filter.archived'), count: counts.archived },
                ]}
              />
            ) : null}

            {visible.length ? (
              /*
               * 1920 (yon panel ochiq) — 3 ustun, ~500 px; 1280–1700 — 2 ustun;
               * telefonda — bitta. Kartochka ichidagi ikki ustun sm dan boshlab.
               */
              <div className="grid gap-4 xl:grid-cols-2 min-[1700px]:grid-cols-3">
                {visible.map((d) => (
                  <DebtCard key={d.id} debt={d} canEdit={canEdit} isOwner={isOwner} onAction={openEntry} />
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState icon={<Banknote className="h-6 w-6" />} title={t(EMPTY_KEY[current])} />
              </Card>
            )}
          </div>
        ) : null}
      </PlanGate>

      <DebtFormModal
        open={form !== null}
        initialKind={form?.kind ?? null}
        onClose={() => setForm(null)}
        today={today}
        isOwner={isOwner}
      />
      <EntryModal target={entry} today={today} onClose={() => setEntry(null)} />
    </>
  );
}
