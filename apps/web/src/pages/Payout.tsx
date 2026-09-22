import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  HelpCircle,
  Receipt,
  Settings2,
  Wallet,
} from 'lucide-react';
import {
  PAYOUT_MODES,
  SCHEDULE_FEE,
  type PayoutCalendarResponse,
  type PayoutCheck,
  type PayoutDay,
  type PayoutMode,
  type PayoutOrder,
  type PayoutPlanDay,
  type PayoutRulesRequest,
} from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useSession } from '@/store/session';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { BarsChart, ChartCard, CHART_COLORS } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  Select,
  StatCard,
  StatGrid,
  Toggle,
  toast,
  type Column,
} from '@/components/ui';

registerNamespace('payout', {
  uz: {
    title: 'Pul kalendari',
    subtitle: 'Qaysi summa qaysi kuni yechib olish uchun ochiladi',
    'kpi.unlocked': 'Ochilgan',
    'kpi.unlockedHint': 'Muddati kelgan — jadvaldagi navbatdagi sanani kutmoqda',
    'kpi.pending': 'Kutilmoqda',
    'kpi.pendingHint': 'Qabul sanasidan {n} kun o‘tishi kerak',
    'kpi.next': 'Eng yaqin ochilish',
    'kpi.charges': 'Xizmat to‘lovlari',
    'kpi.chargesHint': 'Logistika, reklama va saqlash — davr ichida',
    'chart.title': 'Pul qaysi kuni ochiladi',
    'chart.subtitle': 'Har bir ustun — o‘sha kuni yechib olish uchun ochiladigan summa',
    'chart.unlocked': 'Ochilgan',
    'chart.pending': 'Kutilmoqda',
    'chart.empty': 'Ko‘rsatadigan kun yo‘q',
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
    'ord.paid': 'To‘langan',
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
    'plan.hint': 'Ochilgan pul jadvaldagi navbatdagi sanani kutadi.',
    'plan.paid': 'Jadval bo‘yicha allaqachon o‘tkazilgan: {v}',
    'plan.switchHere': 'Yangi jadval',
    'plan.empty': 'Oldinda turgan to‘lov yo‘q',
    'plan.emptyHint': 'Yangi buyurtma qabul qilingach, bu yerda to‘lov sanasi paydo bo‘ladi',
    'plan.assumed': 'Sanalar standart jadval bo‘yicha taxmin qilingan.',
    'state.paid': 'To‘langan',
    'state.partPaid': 'Qisman to‘langan',
    'sched.edit': 'Jadvalni sozlash',
    'sched.title': 'To‘lov jadvalini sozlash',
    'sched.subtitle': 'Uzum kabinetida qaysi variant belgilangan bo‘lsa, shuni tanlang',
    'sched.why': 'Uzum to‘lov jadvalini API orqali bermaydi — biz uni kalitdan o‘qiy olmaymiz. Shu sababli bir marta o‘zingiz belgilaysiz, keyin butun kalendar shu bo‘yicha hisoblanadi.',
    'sched.unconfirmed': 'Jadval tasdiqlanmagan — hisob standart «{mode}» bo‘yicha ketyapti. Kabinetdagi variantni belgilang.',
    'sched.pending': '{date} dan: {mode}',
    'sched.pendingHint': 'Shu sanagacha eski jadval ishlaydi',
    'sched.hasSwitch': 'Jadval kelajakda o‘zgaradi',
    'sched.switchHint': 'Uzum jadvalni darhol almashtirmaydi: kabinetda «… dan amal qiladi» deb turadi. O‘sha sanani yozing — belgilangan kuni hisob o‘zi o‘tadi.',
    'sched.newMode': 'Yangi jadval',
    'sched.from': 'Amal qilish sanasi',
    'sched.save': 'Saqlash',
    'sched.cancel': 'Bekor qilish',
    'sched.saved': 'Jadval saqlandi',
    'sched.free': 'haqsiz',
    note: 'Bu hisob Uzum shartlari asosida qurilgan. Yakuniy raqam har doim Uzum kabinetida — farq bo‘lsa ayting, qoidani moslaymiz.',
  },
  ru: {
    title: 'Календарь выплат',
    subtitle: 'Какая сумма и когда открывается к выводу',
    'kpi.unlocked': 'Доступно',
    'kpi.unlockedHint': 'Срок подошёл — ждёт ближайшую дату графика',
    'kpi.pending': 'Ожидает',
    'kpi.pendingHint': 'Нужно {n} дней с даты получения',
    'kpi.next': 'Ближайшее открытие',
    'kpi.charges': 'Платежи за услуги',
    'kpi.chargesHint': 'Логистика, реклама и хранение — за период',
    'chart.title': 'Когда открываются деньги',
    'chart.subtitle': 'Каждый столбец — сумма, открывающаяся к выводу в этот день',
    'chart.unlocked': 'Открыто',
    'chart.pending': 'Ожидается',
    'chart.empty': 'Нет дней для показа',
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
    'ord.paid': 'Выплачено',
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
    'plan.hint': 'Открытые деньги ждут ближайшую дату графика.',
    'plan.paid': 'Уже перечислено по графику: {v}',
    'plan.switchHere': 'Новый график',
    'plan.empty': 'Предстоящих выплат нет',
    'plan.emptyHint': 'Когда покупатель получит новый заказ, здесь появится дата выплаты',
    'plan.assumed': 'Даты рассчитаны по графику по умолчанию.',
    'state.paid': 'Выплачено',
    'state.partPaid': 'Частично выплачено',
    'sched.edit': 'Настроить график',
    'sched.title': 'Настройка графика выплат',
    'sched.subtitle': 'Выберите тот вариант, который стоит в кабинете Uzum',
    'sched.why': 'Uzum не отдаёт график выплат через API — прочитать его по ключу невозможно. Поэтому вы указываете его один раз, и весь календарь считается по нему.',
    'sched.unconfirmed': 'График не подтверждён — расчёт идёт по варианту «{mode}» по умолчанию. Укажите тот, что в кабинете.',
    'sched.pending': 'С {date}: {mode}',
    'sched.pendingHint': 'До этой даты работает прежний график',
    'sched.hasSwitch': 'График изменится в будущем',
    'sched.switchHint': 'Uzum меняет график не сразу: в кабинете стоит «действует с …». Укажите эту дату — в нужный день расчёт переключится сам.',
    'sched.newMode': 'Новый график',
    'sched.from': 'Действует с',
    'sched.save': 'Сохранить',
    'sched.cancel': 'Отмена',
    'sched.saved': 'График сохранён',
    'sched.free': 'без комиссии',
    note: 'Расчёт построен на условиях Uzum. Итоговая цифра всегда в кабинете — если есть расхождение, скажите, скорректируем правило.',
  },
  en: {
    title: 'Payout calendar',
    subtitle: 'Which amount unlocks for withdrawal, and when',
    'kpi.unlocked': 'Available',
    'kpi.unlockedHint': 'The hold has passed — waiting for the next scheduled date',
    'kpi.pending': 'Pending',
    'kpi.pendingHint': 'Needs {n} days from the acceptance date',
    'kpi.next': 'Next unlock',
    'kpi.charges': 'Service charges',
    'kpi.chargesHint': 'Logistics, ads and storage — in the period',
    'chart.title': 'When the money unlocks',
    'chart.subtitle': 'Each bar is the amount that becomes withdrawable that day',
    'chart.unlocked': 'Unlocked',
    'chart.pending': 'Pending',
    'chart.empty': 'Nothing to show yet',
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
    'ord.paid': 'Paid out',
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
    'plan.hint': 'Unlocked money waits for the next scheduled date.',
    'plan.paid': 'Already transferred on schedule: {v}',
    'plan.switchHere': 'New schedule',
    'plan.empty': 'No upcoming payouts',
    'plan.emptyHint': 'Once a new order is accepted, its payout date appears here',
    'plan.assumed': 'Dates are based on the default schedule.',
    'state.paid': 'Paid out',
    'state.partPaid': 'Partly paid out',
    'sched.edit': 'Configure schedule',
    'sched.title': 'Payout schedule settings',
    'sched.subtitle': 'Pick the option that is selected in your Uzum cabinet',
    'sched.why': 'Uzum does not expose the payout schedule through its API, so we cannot read it from your key. You set it once and the whole calendar follows it.',
    'sched.unconfirmed': 'Schedule not confirmed — the calculation uses the default “{mode}”. Pick the one from your cabinet.',
    'sched.pending': 'From {date}: {mode}',
    'sched.pendingHint': 'The previous schedule applies until then',
    'sched.hasSwitch': 'The schedule changes later',
    'sched.switchHint': 'Uzum does not switch immediately — the cabinet says “effective from …”. Enter that date and the calculation flips itself on the day.',
    'sched.newMode': 'New schedule',
    'sched.from': 'Effective from',
    'sched.save': 'Save',
    'sched.cancel': 'Cancel',
    'sched.saved': 'Schedule saved',
    'sched.free': 'no fee',
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
  const [editing, setEditing] = useState(false);
  /*
   * Jadvalni faqat egasi va menejer o'zgartira oladi — server ham shunday.
   * Kuzatuvchiga tugmani ko'rsatib, formani to'ldirgandan keyin 403 berish
   * ochiqdan-ochiq vaqtini olish bo‘lardi.
   */
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');

  const dayCols: Column<PayoutDay>[] = [
    { key: 'date', header: t('cal.date'), render: (r) => <span className="tnum whitespace-nowrap">{f.date(r.date)}</span> },
    {
      key: 'state',
      header: t('cal.state'),
      /*
       * To'langan ulush alohida ko'rsatiladi. Busiz bu jadvalning
       * yig‘indisi "Ochilgan" ko‘rsatkichidan katta chiqib, sotuvchi
       * ikkovini solishtirganda chalg‘irdi.
       */
      render: (r) =>
        r.paid >= r.amount && r.amount > 0 ? (
          <Badge tone="muted" dot>
            {t('state.paid')}
          </Badge>
        ) : r.paid > 0 ? (
          <Badge tone="muted" dot>
            {t('state.partPaid')}
          </Badge>
        ) : (
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
        r.paid ? (
          <Badge tone="muted">{t('ord.paid')}</Badge>
        ) : r.unlocked ? (
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

        {data ? (
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
                  {/* Kelajakdagi jadval haqi boshqa — sarlavha ikkalasini ko‘rsatadi */}
                  {data.rules.nextMode ? (
                    <Badge tone="info">
                      → {t(`mode.${data.rules.nextMode}`)}
                    </Badge>
                  ) : null}
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Settings2 className="h-3.5 w-3.5" />}
                      onClick={() => setEditing(true)}
                    >
                      {t('sched.edit')}
                    </Button>
                  ) : null}
                </div>
              }
            />
            <CardBody>
              {/*
                Jadval tasdiqlanmagan bo'lsa buni ochiq aytamiz: butun
                kalendar shu taxminga tayanadi, jim turgani chalg'itadi.
              */}
              {!data.rules.confirmed ? (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(true)}
                  className="mb-3.5 flex w-full items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/5 p-3 text-left transition-colors enabled:hover:bg-warn/10 disabled:cursor-default"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                  <span className="text-xs leading-relaxed text-ink">
                    {t('sched.unconfirmed', { mode: t(`mode.${data.rules.mode}`) })}
                  </span>
                </button>
              ) : null}

              {/* Kelajakdagi o'zgarish — kabinetdagi «… dan amal qiladi» */}
              {data.rules.nextMode && data.rules.nextFrom ? (
                <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/5 p-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-info-ink" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">
                      {t('sched.pending', {
                        date: f.date(data.rules.nextFrom),
                        mode: t(`mode.${data.rules.nextMode}`),
                      })}
                    </p>
                    <p className="mt-0.5 text-2xs text-muted">{t('sched.pendingHint')}</p>
                  </div>
                </div>
              ) : null}

              {data.plan.length > 0 ? (
                <ol className="space-y-2.5">
                  {data.plan.map((row, i) => (
                    <PlanRow
                      key={row.date}
                      row={row}
                      first={i === 0}
                      /*
                       * Rejim almashgan birinchi satr ajratib belgilanadi.
                       * Taqqoslash BUGUNGI jadvaldan boshlanadi: aks holda
                       * o'zgarish ro'yxatdagi birinchi sanada kuchga kirsa,
                       * belgi umuman chiqmay qolardi.
                       */
                      switched={(i === 0 ? data.rules.mode : data.plan[i - 1].mode) !== row.mode}
                    />
                  ))}
                </ol>
              ) : (
                <EmptyState
                  icon={<CalendarClock className="h-6 w-6" />}
                  title={t('plan.empty')}
                  hint={t('plan.emptyHint')}
                />
              )}

              <p className="mt-3.5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                {t('plan.hint')}
                {data.totals.paidOut > 0 ? (
                  <> {t('plan.paid', { v: f.money(data.totals.paidOut) })}</>
                ) : null}
                {!data.rules.confirmed ? <> {t('plan.assumed')}</> : null}
              </p>
            </CardBody>
          </Card>
        ) : null}

        {data && data.days.length > 0 ? (
          <ChartCard
            className="mt-5"
            title={t('chart.title')}
            subtitle={t('chart.subtitle')}
          >
            <BarsChart
              /*
               * Butun tarix emas, YAQIN ORA.
               *
               * Ochilish jadvalida 127 kungacha yozuv bo'ladi va ularning
               * deyarli hammasi o'tmish. Sotuvchining savoli esa "pulim
               * qachon ochiladi" — ya'ni oldinda nima borligi. Shuning
               * uchun oxirgi 7 kun va oldindagi barcha kunlar ko'rsatiladi.
               */
              data={data.days.slice(-Math.min(30, data.days.length)).map((d) => ({
                date: d.date,
                // Bitta kun faqat bitta holatda bo'ladi, shuning uchun
                // ustunlar ustma-ust turadi va bir-birini bekitmaydi
                unlocked: d.unlocked ? d.amount : 0,
                pending: d.unlocked ? 0 : d.amount,
              }))}
              xKey="date"
              xIsDate
              stacked
              showLegend
              height={260}
              series={[
                { key: 'unlocked', name: t('chart.unlocked'), color: CHART_COLORS.brand, money: true },
                { key: 'pending', name: t('chart.pending'), color: CHART_COLORS.warn, money: true },
              ]}
            />
          </ChartCard>
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

      {data && canEdit ? (
        <ScheduleModal open={editing} onClose={() => setEditing(false)} rules={data.rules} />
      ) : null}
    </>
  );
}

/**
 * To'lov kuni — sana chapda yirik belgi, summa o'ngda.
 * Eng yaqin to'lov ajratib ko'rsatiladi: sotuvchi birinchi navbatda
 * "eng yaqini qachon va qancha" degan savolga javob izlaydi.
 */
function PlanRow({ row, first, switched }: { row: PayoutPlanDay; first: boolean; switched: boolean }) {
  const t = useT('payout');
  const f = useFormat();

  const d = new Date(`${row.date}T00:00:00Z`);
  const day = d.getUTCDate();
  const month = f.monthShort(row.date);
  /*
   * Qolgan kun SERVERDAN keladi. Ilgari u brauzerda UTC yarim tunini
   * mahalliy vaqt bilan solishtirib sanalardi va Toshkentda 00:00–05:00
   * orasida bir kunga adashardi: to‘lov kuni "1 kun" deb ko‘rinardi.
   */
  const daysLeft = row.daysLeft;

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
          {row.feePct > 0 ? <> · {t('plan.fee', { n: f.dec(row.feePct, 1) })}</> : null}
        </p>
        {/* Shu satrdan boshlab yangi jadval ishlaydi */}
        {switched ? (
          <p className="mt-1">
            <Badge tone="info">
              {t('plan.switchHere')}: {t(`mode.${row.mode}`)}
            </Badge>
          </p>
        ) : null}
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

/**
 * To'lov jadvalini sozlash oynasi — kabinetdagi ro'yxatning aynan o'zi.
 *
 * NEGA QO'LDA. Uzumning ochiq API'sida bu jadval uchun endpoint yo'q,
 * ya'ni kalitdan o'qib bo'lmaydi. Lekin jadval butun Pul kalendarini
 * suradi, shuning uchun uni bilish shart: sotuvchi bir marta belgilaydi.
 *
 * KELAJAKDAGI O'ZGARISH. Uzum jadvalni darhol almashtirmaydi — kabinetda
 * "08.10.2026 dan amal qiladi" deb turadi. Shu sana kiritilsa, hisob
 * o'sha kuni o'zi o'tadi va sotuvchi qaytib kelishi shart emas.
 */
function ScheduleModal({
  open,
  onClose,
  rules,
}: {
  open: boolean;
  onClose: () => void;
  rules: PayoutCalendarResponse['rules'];
}) {
  const t = useT('payout');
  const f = useFormat();
  const qc = useQueryClient();

  const [mode, setMode] = useState<PayoutMode>(rules.mode);
  const [hasSwitch, setHasSwitch] = useState(Boolean(rules.nextMode));
  const [nextMode, setNextMode] = useState<PayoutMode>(rules.nextMode ?? otherMode(rules.mode));
  const [nextFrom, setNextFrom] = useState(rules.nextFrom ?? '');

  /*
   * Oyna bir marta yig‘iladi va yopilganda yo‘qolmaydi, shuning uchun
   * `useState` boshlang'ich qiymatlari FAQAT birinchi ochilishda ishlaydi.
   * Busiz saqlangandan keyin yoki bekor qilingandan keyin qayta ochilgan
   * oyna eski, saqlanmagan qiymatlarni ko‘rsatardi.
   */
  useEffect(() => {
    if (!open) return;
    setMode(rules.mode);
    setHasSwitch(Boolean(rules.nextMode));
    setNextMode(rules.nextMode ?? otherMode(rules.mode));
    setNextFrom(rules.nextFrom ?? '');
  }, [open, rules.mode, rules.nextMode, rules.nextFrom]);

  /*
   * Joriy jadval tanlanganda kelajakdagisi u bilan bir xil bo'lib qolmasin:
   * bunda ro'yxatdan o'zi tushib qolib, maydon bo'sh ko'rinardi va Saqlash
   * tugmasi hech qachon yonmasdi.
   */
  const pickMode = (m: PayoutMode) => {
    setMode(m);
    if (nextMode === m) setNextMode(otherMode(m));
  };

  const save = useMutation({
    mutationFn: (body: PayoutRulesRequest) => api.patch('/payout/rules', body),
    onSuccess: () => {
      toast.success(t('sched.saved'));
      onClose();
      // Moliya sahifasidagi "Keyingi to'lov" ham shu jadvaldan hisoblanadi
      void qc.invalidateQueries({ queryKey: ['payout'] });
      void qc.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : ''),
  });

  /*
   * Kelajakdagi jadval joriysi bilan ustma-ust tushib qolmasligi RENDERDA
   * hal qilinadi, holatni yangilash tartibiga tayanmasdan. Aks holda maydon
   * o'z ro'yxatidan tushib qolgan qiymatni ushlab turib, Saqlash tugmasi
   * sababsiz o'chib qolardi.
   */
  const effectiveNextMode = nextMode === mode ? otherMode(mode) : nextMode;

  /*
   * Server ham tekshiradi, lekin tugmani o'chirib qo'ygan ma'qul:
   * xatoni oldindan ko'rsatish qayta urinishdan yaxshiroq.
   */
  const switchInvalid = hasSwitch && (!nextFrom || nextFrom < toInputDate(1));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sched.title')}
      description={t('sched.subtitle')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('sched.cancel')}
          </Button>
          <Button
            onClick={() =>
              save.mutate({
                mode,
                nextMode: hasSwitch ? effectiveNextMode : null,
                nextFrom: hasSwitch ? nextFrom : null,
              })
            }
            disabled={switchInvalid || save.isPending}
          >
            {t('sched.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label={t('sched.subtitle')}>
        {PAYOUT_MODES.map((m) => (
          <label
            key={m}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
              mode === m ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface-2 hover:bg-surface-3',
            )}
          >
            <input
              type="radio"
              name="payout-mode"
              className="h-4 w-4 shrink-0 accent-[rgb(var(--c-brand))]"
              checked={mode === m}
              onChange={() => pickMode(m)}
            />
            <span className="min-w-0 flex-1 text-sm font-medium text-ink">{t(`mode.${m}`)}</span>
            <Badge tone={SCHEDULE_FEE[m] > 0 ? 'warn' : 'muted'}>
              {SCHEDULE_FEE[m] > 0 ? t('plan.fee', { n: f.dec(SCHEDULE_FEE[m], 1) }) : t('sched.free')}
            </Badge>
          </label>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <Toggle checked={hasSwitch} onChange={setHasSwitch} label={t('sched.hasSwitch')} hint={t('sched.switchHint')} />

        {hasSwitch ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="eyebrow">{t('sched.newMode')}</span>
              <Select
                className="mt-1"
                value={effectiveNextMode}
                onChange={(e) => setNextMode(e.target.value as PayoutMode)}
              >
                {PAYOUT_MODES.filter((m) => m !== mode).map((m) => (
                  <option key={m} value={m}>
                    {t(`mode.${m}`)} — {SCHEDULE_FEE[m]}%
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="eyebrow">{t('sched.from')}</span>
              <Input
                className="mt-1"
                type="date"
                value={nextFrom}
                min={toInputDate(1)}
                onChange={(e) => setNextFrom(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">{t('sched.why')}</p>
    </Modal>
  );
}

/**
 * Berilganidan farq qiladigan birinchi jadval.
 *
 * Kelajakdagi o'zgarish joriy jadval bilan bir xil bo'lishi mantiqsiz —
 * Uzum ham bunday tanlovni bermaydi. Standart qiymat sifatida `weekly`
 * olinganda, sotuvchining joriy jadvali `weekly` bo‘lsa, maydon o‘z
 * ro‘yxatidan tushib qolardi.
 */
function otherMode(mode: PayoutMode): PayoutMode {
  return PAYOUT_MODES.find((m) => m !== mode) ?? mode;
}

/** Bugundan `days` kun keyingi sana — <input type="date"> uchun */
function toInputDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
