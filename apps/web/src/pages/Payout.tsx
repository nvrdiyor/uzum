import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, HelpCircle, Receipt, Wallet } from 'lucide-react';
import type { PayoutCalendarResponse, PayoutCheck, PayoutDay, PayoutOrder, PayoutPlanDay } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';

registerNamespace('payout', {
  uz: {
    title: 'Pul kalendari',
    subtitle: 'Qaysi summa qaysi kuni yechib olish uchun ochiladi',
    'kpi.unlocked': 'Ochilgan',
    'kpi.unlockedHint': 'Muddati kelgan, yechib olsa bo‘ladi',
    'kpi.pending': 'Kutilmoqda',
    'kpi.pendingHint': 'Qabul sanasidan {n} kun o‘tishi kerak',
    'kpi.next': 'Eng yaqin ochilish',
    'kpi.charges': 'Xizmat to‘lovlari',
    'kpi.chargesHint': 'Logistika, reklama va saqlash — davr ichida',
    'cal.title': 'Ochilish jadvali',
    'cal.subtitle': 'Har bir kun uchun ochiladigan summa',
    'cal.date': 'Sana',
    'cal.orders': 'Buyurtma',
    'cal.amount': 'Summa',
    'cal.state': 'Holat',
    'state.unlocked': 'Ochilgan',
    'state.waiting': 'Kutilmoqda',
    'ord.title': 'Buyurtmalar bo‘yicha',
    'ord.subtitle': 'Yechib olish uchun summa = tushum − komissiya − logistika',
    'ord.order': 'Buyurtma',
    'ord.product': 'Mahsulot',
    'ord.accepted': 'Qabul sanasi',
    'ord.unlock': 'Ochiladi',
    'ord.amount': 'Summa',
    'ord.left': 'Qoldi',
    'ord.days': '{n} kun',
    'ord.ready': 'Tayyor',
    'inst.title': 'Tezkor yechib olish',
    'inst.subtitle': 'Uzum shartlari bo‘yicha — {n} kunni kutmasdan yechish mumkinmi',
    'inst.yes': 'Shartlar bajarilgan',
    'inst.no': 'Shartlar bajarilmagan',
    'inst.maybe': 'To‘liq aytib bo‘lmaydi',
    'inst.maybeHint': 'Bizga ko‘rinadigan shartlar bajarilgan, lekin ikkitasini faqat Uzum biladi',
    'inst.fee': 'Xizmat haqi {n}%',
    'chk.no_debt': 'Marketpleys oldida qarzdorlik yo‘q',
    'chk.not_blocked': 'Hisob bloklanmagan',
    'chk.age_60d': 'Platformada 2 oydan ortiq',
    'chk.stable_sales': 'Barqaror savdo',
    'chk.no_anomaly': 'Savdo dinamikasida anomaliya yo‘q',
    'chk.antifraud': 'Qo‘shimcha antifrod cheklovlari',
    'empty.title': 'Hali qabul qilingan buyurtma yo‘q',
    'empty.hint': 'Xaridor tovarni qabul qilgach, shu yerda ochilish sanasi ko‘rinadi',
    'plan.title': 'To‘lov jadvali',
    'plan.subtitle': 'Pul haqiqatda qaysi kuni hisobingizga tushadi',
    'plan.date': 'To‘lov sanasi',
    'plan.amount': 'Summa',
    'plan.net': 'Qo‘lga tegadi',
    'plan.orders': 'Buyurtma',
    'mode.daily': 'Har ish kuni',
    'mode.weekly': 'Har hafta: 7, 14, 21, 28',
    'mode.biweekly': '2 haftada: 7 va 21',
    'mode.monthly': 'Oyiga bir marta: 7-sanada',
    'plan.fee': 'Jadval haqi {n}%',
    'plan.today': 'Bugun tushadi',
    'plan.inDays': '{n} kundan keyin',
    'plan.hint': 'Ochilgan pul jadvaldagi navbatdagi sanani kutadi. Jadvalni Uzum kabinetidan o‘zgartirasiz.',
    note: 'Bu hisob Uzum shartlari asosida qurilgan. Yakuniy raqam har doim Uzum kabinetida — farq bo‘lsa ayting, qoidani moslaymiz.',
  },
  ru: {
    title: 'Календарь выплат',
    subtitle: 'Какая сумма и когда открывается к выводу',
    'kpi.unlocked': 'Доступно',
    'kpi.unlockedHint': 'Срок подошёл, можно выводить',
    'kpi.pending': 'Ожидает',
    'kpi.pendingHint': 'Нужно {n} дней с даты получения',
    'kpi.next': 'Ближайшее открытие',
    'kpi.charges': 'Платежи за услуги',
    'kpi.chargesHint': 'Логистика, реклама и хранение — за период',
    'cal.title': 'График открытия',
    'cal.subtitle': 'Сумма, открывающаяся в каждый день',
    'cal.date': 'Дата',
    'cal.orders': 'Заказов',
    'cal.amount': 'Сумма',
    'cal.state': 'Статус',
    'state.unlocked': 'Открыто',
    'state.waiting': 'Ожидает',
    'ord.title': 'По заказам',
    'ord.subtitle': 'К выводу = выручка − комиссия − логистика',
    'ord.order': 'Заказ',
    'ord.product': 'Товар',
    'ord.accepted': 'Дата получения',
    'ord.unlock': 'Откроется',
    'ord.amount': 'Сумма',
    'ord.left': 'Осталось',
    'ord.days': '{n} дн',
    'ord.ready': 'Готово',
    'inst.title': 'Мгновенный вывод',
    'inst.subtitle': 'По условиям Uzum — можно ли вывести не дожидаясь {n} дней',
    'inst.yes': 'Условия выполнены',
    'inst.no': 'Условия не выполнены',
    'inst.maybe': 'Точно сказать нельзя',
    'inst.maybeHint': 'Видимые нам условия выполнены, но два известны только Uzum',
    'inst.fee': 'Комиссия {n}%',
    'chk.no_debt': 'Нет задолженности перед маркетплейсом',
    'chk.not_blocked': 'Аккаунт не заблокирован',
    'chk.age_60d': 'На платформе более 2 месяцев',
    'chk.stable_sales': 'Стабильные продажи',
    'chk.no_anomaly': 'Нет аномалий в динамике продаж',
    'chk.antifraud': 'Дополнительные антифрод-ограничения',
    'empty.title': 'Пока нет полученных заказов',
    'empty.hint': 'Когда покупатель получит товар, здесь появится дата открытия',
    'plan.title': 'График выплат',
    'plan.subtitle': 'Когда деньги реально поступят на счёт',
    'plan.date': 'Дата выплаты',
    'plan.amount': 'Сумма',
    'plan.net': 'К получению',
    'plan.orders': 'Заказов',
    'mode.daily': 'Каждый рабочий день',
    'mode.weekly': 'Еженедельно: 7, 14, 21, 28',
    'mode.biweekly': 'Раз в 2 недели: 7 и 21',
    'mode.monthly': 'Раз в месяц: 7 числа',
    'plan.fee': 'Комиссия графика {n}%',
    'plan.today': 'Поступит сегодня',
    'plan.inDays': 'Через {n} дн',
    'plan.hint': 'Открытые деньги ждут ближайшую дату графика. График меняется в кабинете Uzum.',
    note: 'Расчёт построен на условиях Uzum. Итоговая цифра всегда в кабинете — если есть расхождение, скажите, скорректируем правило.',
  },
  en: {
    title: 'Payout calendar',
    subtitle: 'Which amount unlocks for withdrawal, and when',
    'kpi.unlocked': 'Available',
    'kpi.unlockedHint': 'The hold has passed — withdrawable',
    'kpi.pending': 'Pending',
    'kpi.pendingHint': 'Needs {n} days from the acceptance date',
    'kpi.next': 'Next unlock',
    'kpi.charges': 'Service charges',
    'kpi.chargesHint': 'Logistics, ads and storage — in the period',
    'cal.title': 'Unlock schedule',
    'cal.subtitle': 'Amount unlocking on each day',
    'cal.date': 'Date',
    'cal.orders': 'Orders',
    'cal.amount': 'Amount',
    'cal.state': 'State',
    'state.unlocked': 'Unlocked',
    'state.waiting': 'Waiting',
    'ord.title': 'By order',
    'ord.subtitle': 'Withdrawable = revenue − commission − logistics',
    'ord.order': 'Order',
    'ord.product': 'Product',
    'ord.accepted': 'Accepted',
    'ord.unlock': 'Unlocks',
    'ord.amount': 'Amount',
    'ord.left': 'Left',
    'ord.days': '{n} d',
    'ord.ready': 'Ready',
    'inst.title': 'Instant withdrawal',
    'inst.subtitle': 'Per Uzum terms — can you withdraw without waiting {n} days',
    'inst.yes': 'Conditions met',
    'inst.no': 'Conditions not met',
    'inst.maybe': 'Cannot say for sure',
    'inst.maybeHint': 'What we can see is fine, but two conditions are known only to Uzum',
    'inst.fee': 'Fee {n}%',
    'chk.no_debt': 'No debt to the marketplace',
    'chk.not_blocked': 'Account not blocked',
    'chk.age_60d': 'More than 2 months on the platform',
    'chk.stable_sales': 'Stable sales',
    'chk.no_anomaly': 'No anomalies in sales dynamics',
    'chk.antifraud': 'Additional antifraud limits',
    'empty.title': 'No accepted orders yet',
    'empty.hint': 'Once a buyer accepts a delivery, its unlock date appears here',
    'plan.title': 'Payout schedule',
    'plan.subtitle': 'When the money actually reaches your account',
    'plan.date': 'Payout date',
    'plan.amount': 'Amount',
    'plan.net': 'You receive',
    'plan.orders': 'Orders',
    'mode.daily': 'Every business day',
    'mode.weekly': 'Weekly: 7, 14, 21, 28',
    'mode.biweekly': 'Every 2 weeks: 7 and 21',
    'mode.monthly': 'Monthly: on the 7th',
    'plan.fee': 'Schedule fee {n}%',
    'plan.today': 'Arrives today',
    'plan.inDays': 'In {n} days',
    'plan.hint': 'Unlocked money waits for the next scheduled date. Change the schedule in the Uzum cabinet.',
    note: 'This is computed from Uzum’s terms, not taken from Uzum. The authoritative figure is always in the cabinet — tell us if it differs and we will adjust the rule.',
  },
});

export default function Payout() {
  const t = useT('payout');
  const f = useFormat();
  const q = usePeriodQuery();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payout', q],
    queryFn: () => api.get<PayoutCalendarResponse>('/payout', q),
  });

  const hold = data?.rules.holdDays ?? 10;

  const dayCols: Column<PayoutDay>[] = [
    { key: 'date', header: t('cal.date'), render: (r) => <span className="tnum whitespace-nowrap">{f.date(r.date)}</span> },
    {
      key: 'state',
      header: t('cal.state'),
      render: (r) => (
        <Badge tone={r.unlocked ? 'brand' : 'warn'} dot>
          {r.unlocked ? t('state.unlocked') : t('state.waiting')}
        </Badge>
      ),
    },
    { key: 'orders', header: t('cal.orders'), align: 'right', render: (r) => <span className="tnum">{f.num(r.orders)}</span> },
    {
      key: 'amount',
      header: t('cal.amount'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum font-semibold', r.unlocked ? 'text-brand-ink' : 'text-ink')}>{f.money(r.amount)}</span>
      ),
    },
  ];

  const orderCols: Column<PayoutOrder>[] = [
    {
      key: 'uzumOrderId',
      header: t('ord.order'),
      render: (r) => <span className="tnum whitespace-nowrap">№{r.uzumOrderId ?? '—'}</span>,
    },
    {
      key: 'title',
      header: t('ord.product'),
      render: (r) => <span className="line-clamp-2 text-xs leading-snug">{r.title}</span>,
    },
    {
      key: 'acceptedAt',
      header: t('ord.accepted'),
      render: (r) => <span className="tnum whitespace-nowrap text-muted">{f.dateShort(r.acceptedAt)}</span>,
    },
    {
      key: 'unlockAt',
      header: t('ord.unlock'),
      render: (r) => <span className="tnum whitespace-nowrap">{f.dateShort(r.unlockAt)}</span>,
    },
    {
      key: 'payoutAt',
      header: t('plan.date'),
      render: (r) => <span className="tnum whitespace-nowrap font-semibold">{f.dateShort(r.payoutAt)}</span>,
    },
    {
      key: 'daysLeft',
      header: t('ord.left'),
      align: 'right',
      render: (r) =>
        r.unlocked ? (
          <Badge tone="brand">{t('ord.ready')}</Badge>
        ) : (
          <span className="tnum text-warn-ink">{t('ord.days', { n: r.daysLeft })}</span>
        ),
    },
    {
      key: 'amount',
      header: t('ord.amount'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum font-semibold', r.unlocked ? 'text-brand-ink' : 'text-ink')}>{f.money(r.amount)}</span>
      ),
    },
  ];

  if (isError) {
    return (
      <>
        <PageHeader icon={<CalendarClock className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader icon={<CalendarClock className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />

      <PlanGate feature="unit_economics">
        <StatGrid>
          <StatCard
            label={t('kpi.unlocked')}
            value={f.money(data?.totals.unlocked ?? 0)}
            hint={t('kpi.unlockedHint')}
            icon={<Wallet className="h-5 w-5" />}
            tone="brand"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.pending')}
            value={f.money(data?.totals.pending ?? 0)}
            hint={t('kpi.pendingHint', { n: hold })}
            icon={<Clock className="h-5 w-5" />}
            tone="warn"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.next')}
            value={data?.totals.nextDate ? f.money(data.totals.nextAmount) : '—'}
            hint={data?.totals.nextDate ? f.date(data.totals.nextDate) : undefined}
            icon={<CalendarClock className="h-5 w-5" />}
            tone="info"
            loading={isLoading}
          />
          <StatCard
            label={t('kpi.charges')}
            value={f.money(data?.totals.charges ?? 0)}
            hint={t('kpi.chargesHint')}
            icon={<Receipt className="h-5 w-5" />}
            tone="danger"
            loading={isLoading}
          />
        </StatGrid>

        {data && data.instant.checks.length > 0 ? (
          <InstantCard instant={data.instant} hold={hold} fee={data.rules.earlyFeePct} />
        ) : null}

        {data && data.plan.length > 0 ? (
          <Card className="mt-5">
            <CardHeader
              icon={<CalendarClock className="h-4 w-4" />}
              title={t('plan.title')}
              subtitle={t('plan.subtitle')}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{t(`mode.${data.rules.mode}`)}</Badge>
                  <Badge tone={data.rules.scheduleFeePct > 0 ? 'warn' : 'muted'}>
                    {t('plan.fee', { n: f.dec(data.rules.scheduleFeePct, 1) })}
                  </Badge>
                </div>
              }
            />
            <CardBody>
              <ol className="space-y-2.5">
                {data.plan.map((row, i) => (
                  <PlanRow key={row.date} row={row} first={i === 0} fee={data.rules.scheduleFeePct} />
                ))}
              </ol>
              <p className="mt-3.5 border-t border-line pt-3 text-xs leading-relaxed text-muted">{t('plan.hint')}</p>
            </CardBody>
          </Card>
        ) : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader icon={<CalendarClock className="h-4 w-4" />} title={t('cal.title')} subtitle={t('cal.subtitle')} />
            <DataTable<PayoutDay>
              columns={dayCols}
              rows={data?.days ?? []}
              rowKey={(r) => r.date}
              loading={isLoading}
              empty={<EmptyState icon={<CalendarClock className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />}
            />
          </Card>

          <Card>
            <CardHeader icon={<Receipt className="h-4 w-4" />} title={t('ord.title')} subtitle={t('ord.subtitle')} />
            <DataTable<PayoutOrder>
              columns={orderCols}
              rows={data?.orders ?? []}
              rowKey={(r) => `${r.uzumOrderId ?? ''}-${r.unlockAt}`}
              loading={isLoading}
              empty={<EmptyState icon={<Receipt className="h-6 w-6" />} title={t('empty.title')} />}
            />
          </Card>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted">{t('note')}</p>
      </PlanGate>
    </>
  );
}

/**
 * To'lov kuni — sana chapda yirik belgi, summa o'ngda.
 * Eng yaqin to'lov ajratib ko'rsatiladi: sotuvchi birinchi navbatda
 * "eng yaqini qachon va qancha" degan savolga javob izlaydi.
 */
function PlanRow({ row, first, fee }: { row: PayoutPlanDay; first: boolean; fee: number }) {
  const t = useT('payout');
  const f = useFormat();

  const d = new Date(`${row.date}T00:00:00Z`);
  const day = d.getUTCDate();
  const month = f.monthShort(row.date);
  const daysLeft = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));

  return (
    <li
      className={cn(
        'flex items-center gap-3.5 rounded-2xl border p-3.5 transition-colors sm:gap-4',
        first ? 'border-brand/30 bg-brand/5' : 'border-line bg-surface-2',
      )}
    >
      {/* Sana belgisi */}
      <div
        className={cn(
          'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl',
          first ? 'bg-brand text-on-brand' : 'bg-surface-3 text-ink',
        )}
      >
        <span className="tnum font-display text-xl font-extrabold leading-none">{day}</span>
        <span className="mt-0.5 text-2xs uppercase tracking-wide opacity-80">{month}</span>
        <span className="tnum text-2xs leading-none opacity-50">{d.getUTCFullYear()}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">
          {daysLeft === 0 ? t('plan.today') : t('plan.inDays', { n: daysLeft })}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {t('plan.orders')}: <span className="tnum">{f.num(row.orders)}</span>
          {fee > 0 ? <> · {t('plan.fee', { n: f.dec(fee, 1) })}</> : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('tnum font-display text-lg font-extrabold', first ? 'text-brand-ink' : 'text-ink')}>
          {f.money(row.net)}
        </p>
        {/* Haq ushlansa, asl summa ham ko'rsatiladi */}
        {row.net !== row.amount ? (
          <p className="tnum mt-0.5 text-2xs text-muted line-through">{f.money(row.amount)}</p>
        ) : (
          <p className="mt-0.5 eyebrow">{t('plan.net')}</p>
        )}
      </div>
    </li>
  );
}

/** Tezkor yechib olish mezonlari ro'yxati */
function InstantCard({
  instant,
  hold,
  fee,
}: {
  instant: PayoutCalendarResponse['instant'];
  hold: number;
  fee: number;
}) {
  const t = useT('payout');
  const f = useFormat();

  const tone = instant.eligible === true ? 'brand' : instant.eligible === false ? 'danger' : 'warn';
  const label =
    instant.eligible === true ? t('inst.yes') : instant.eligible === false ? t('inst.no') : t('inst.maybe');

  return (
    <Card className="mt-5">
      <CardHeader
        icon={<Wallet className="h-4 w-4" />}
        title={t('inst.title')}
        subtitle={t('inst.subtitle', { n: hold })}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="muted">{t('inst.fee', { n: f.dec(fee, 1) })}</Badge>
            <Badge tone={tone} dot>
              {label}
            </Badge>
          </div>
        }
      />
      <CardBody>
        <ul className="space-y-2.5">
          {instant.checks.map((c) => (
            <CheckRow key={c.key} check={c} />
          ))}
        </ul>
        {instant.eligible === null ? (
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">{t('inst.maybeHint')}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function CheckRow({ check }: { check: PayoutCheck }) {
  const t = useT('payout');
  const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'fail' ? AlertTriangle : HelpCircle;
  const color =
    check.status === 'ok' ? 'text-brand-ink' : check.status === 'fail' ? 'text-danger' : 'text-muted';

  return (
    <li className="flex gap-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', color)} />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', check.status === 'fail' ? 'text-ink' : 'text-ink')}>
          {t(`chk.${check.key}`)}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{check.detail}</p>
      </div>
    </li>
  );
}
