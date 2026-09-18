import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Check,
  Copy,
  Gift,
  HandCoins,
  Hourglass,
  Link2,
  Send,
  Share2,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReferralResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('referral', {
  uz: {
    title: 'Hamkorlik dasturi',
    subtitle: 'Do‘stlaringizni taklif qiling va ularning har bir to‘lovidan ulush oling',

    'hero.eyebrow': 'Sizning referal kodingiz',
    'hero.percent': 'Har bir to‘lovdan {pct}%',
    'hero.percentHint': 'Do‘stingiz to‘lagan har bir summadan ulush olasiz — muddatsiz',
    'hero.link': 'Taklif havolasi',
    'hero.copyCode': 'Kodni nusxalash',
    'hero.copyLink': 'Havolani nusxalash',
    'hero.share': 'Telegram’da ulashish',
    'hero.bot': 'Bot havolasi',
    'hero.copied': 'Nusxalandi',
    'hero.shareText':
      'SavdoIQ — Uzum Market sotuvchilari uchun analitika. Mening havolam orqali ro‘yxatdan o‘ting:',

    'kpi.invited': 'Taklif qilinganlar',
    'kpi.invitedHint': 'Havolangiz orqali ro‘yxatdan o‘tganlar',
    'kpi.paying': 'To‘lov qilganlar',
    'kpi.payingHint': 'Pullik tarifga o‘tgan hamkorlar',
    'kpi.earned': 'Jami daromad',
    'kpi.earnedHint': 'Dastur bo‘yicha barcha hisoblangan ulush',
    'kpi.pending': 'Kutilayotgan bonus',
    'kpi.pendingHint': 'Yechib olish mumkin bo‘lgan summa',
    'kpi.paidOut': 'To‘langan: {v}',

    'how.title': 'Qanday ishlaydi',
    'how.subtitle': 'Uch qadam — va daromad o‘zi kelaveradi',
    'how.step': 'Qadam',
    'how.s1.t': 'Havolani ulashing',
    'how.s1.d': 'Kod yoki havolani do‘stlaringizga, kanalingizga yoki hamkasblaringizga yuboring.',
    'how.s2.t': 'Do‘stingiz ro‘yxatdan o‘tadi',
    'how.s2.d': 'U Telegram orqali kiradi, Uzum kabinetini ulaydi va platformadan foydalanadi.',
    'how.s3.t': 'Har to‘lovidan {pct}% olasiz',
    'how.s3.d': 'Bonus balansingizga tushadi — istalgan vaqtda yechib olasiz yoki tarifga sarflaysiz.',

    'table.title': 'Bonuslar tarixi',
    'table.subtitle': 'Hamkorlaringizning to‘lovlari bo‘yicha hisoblangan ulush',
    'table.company': 'Kompaniya',
    'table.amount': 'Bonus',
    'table.status': 'Holat',
    'table.date': 'Sana',
    'table.empty': 'Hali bonuslar yo‘q',
    'table.emptyHint': 'Havolangizni ulashing — birinchi hamkor to‘lovi shu yerda ko‘rinadi',

    'status.pending': 'Kutilmoqda',
    'status.approved': 'Tasdiqlangan',
    'status.paid': 'To‘langan',
    'status.rejected': 'Rad etilgan',
    'status.canceled': 'Bekor qilingan',

    'wd.btn': 'Bonusni yechish',
    'wd.title': 'Bonusni yechib olish',
    'wd.subtitle': 'So‘rov adminga yuboriladi va tasdiqlangach to‘lanadi',
    'wd.amount': 'Yechiladigan summa',
    'wd.min': 'Minimal summa: {v}',
    'wd.notEnough': 'Yechish uchun kamida {v} bonus to‘planishi kerak. Hozircha: {cur}',
    'wd.note': 'To‘lov 1–3 ish kuni ichida siz ko‘rsatgan kartaga o‘tkaziladi. Rekvizitlarni bot so‘raydi.',
    'wd.confirm': 'Yechishni tasdiqlash',
    'wd.cancel': 'Bekor qilish',
    'wd.ok': 'So‘rov yuborildi',
    'wd.okBody': 'Admin tasdiqlagach bonus kartangizga o‘tkaziladi',
    'wd.err': 'So‘rovni yuborib bo‘lmadi',

    'empty.title': 'Ma’lumot topilmadi',
    'empty.hint': 'Hamkorlik dasturi ma’lumotlari hozircha mavjud emas',
  },

  ru: {
    title: 'Партнёрская программа',
    subtitle: 'Приглашайте друзей и получайте долю с каждой их оплаты',

    'hero.eyebrow': 'Ваш реферальный код',
    'hero.percent': '{pct}% с каждой оплаты',
    'hero.percentHint': 'Вы получаете долю со всех платежей приглашённого — бессрочно',
    'hero.link': 'Пригласительная ссылка',
    'hero.copyCode': 'Скопировать код',
    'hero.copyLink': 'Скопировать ссылку',
    'hero.share': 'Поделиться в Telegram',
    'hero.bot': 'Ссылка на бота',
    'hero.copied': 'Скопировано',
    'hero.shareText':
      'SavdoIQ — аналитика для селлеров Uzum Market. Регистрируйтесь по моей ссылке:',

    'kpi.invited': 'Приглашено',
    'kpi.invitedHint': 'Зарегистрировались по вашей ссылке',
    'kpi.paying': 'Оплатили',
    'kpi.payingHint': 'Партнёры на платном тарифе',
    'kpi.earned': 'Всего заработано',
    'kpi.earnedHint': 'Вся начисленная доля по программе',
    'kpi.pending': 'Ожидает выплаты',
    'kpi.pendingHint': 'Сумма, доступная к выводу',
    'kpi.paidOut': 'Выплачено: {v}',

    'how.title': 'Как это работает',
    'how.subtitle': 'Три шага — и доход идёт сам',
    'how.step': 'Шаг',
    'how.s1.t': 'Поделитесь ссылкой',
    'how.s1.d': 'Отправьте код или ссылку друзьям, в свой канал или коллегам-селлерам.',
    'how.s2.t': 'Друг регистрируется',
    'how.s2.d': 'Он входит через Telegram, подключает кабинет Uzum и начинает работать в сервисе.',
    'how.s3.t': 'Вы получаете {pct}% с оплат',
    'how.s3.d': 'Бонус падает на баланс — выводите в любой момент или тратьте на свой тариф.',

    'table.title': 'История бонусов',
    'table.subtitle': 'Начисления по платежам ваших партнёров',
    'table.company': 'Компания',
    'table.amount': 'Бонус',
    'table.status': 'Статус',
    'table.date': 'Дата',
    'table.empty': 'Бонусов пока нет',
    'table.emptyHint': 'Поделитесь ссылкой — первое начисление появится здесь',

    'status.pending': 'Ожидает',
    'status.approved': 'Подтверждён',
    'status.paid': 'Выплачен',
    'status.rejected': 'Отклонён',
    'status.canceled': 'Отменён',

    'wd.btn': 'Вывести бонус',
    'wd.title': 'Вывод бонуса',
    'wd.subtitle': 'Заявка уйдёт администратору и будет выплачена после подтверждения',
    'wd.amount': 'Сумма к выводу',
    'wd.min': 'Минимальная сумма: {v}',
    'wd.notEnough': 'Для вывода нужно накопить минимум {v}. Сейчас: {cur}',
    'wd.note': 'Выплата приходит на вашу карту за 1–3 рабочих дня. Реквизиты запросит бот.',
    'wd.confirm': 'Подтвердить вывод',
    'wd.cancel': 'Отмена',
    'wd.ok': 'Заявка отправлена',
    'wd.okBody': 'После подтверждения администратором бонус придёт на карту',
    'wd.err': 'Не удалось отправить заявку',

    'empty.title': 'Данные не найдены',
    'empty.hint': 'Информация по партнёрской программе пока недоступна',
  },

  en: {
    title: 'Referral program',
    subtitle: 'Invite fellow sellers and earn a share of every payment they make',

    'hero.eyebrow': 'Your referral code',
    'hero.percent': '{pct}% of every payment',
    'hero.percentHint': 'You earn a share of everything your referral pays — with no time limit',
    'hero.link': 'Invite link',
    'hero.copyCode': 'Copy code',
    'hero.copyLink': 'Copy link',
    'hero.share': 'Share on Telegram',
    'hero.bot': 'Bot link',
    'hero.copied': 'Copied',
    'hero.shareText': 'SavdoIQ — analytics for Uzum Market sellers. Sign up with my link:',

    'kpi.invited': 'Invited',
    'kpi.invitedHint': 'People who signed up with your link',
    'kpi.paying': 'Paying',
    'kpi.payingHint': 'Referrals on a paid plan',
    'kpi.earned': 'Earned in total',
    'kpi.earnedHint': 'Everything credited by the program',
    'kpi.pending': 'Pending bonus',
    'kpi.pendingHint': 'The amount available to withdraw',
    'kpi.paidOut': 'Paid out: {v}',

    'how.title': 'How it works',
    'how.subtitle': 'Three steps and the income keeps coming',
    'how.step': 'Step',
    'how.s1.t': 'Share your link',
    'how.s1.d': 'Send the code or link to friends, your channel or fellow sellers.',
    'how.s2.t': 'Your friend signs up',
    'how.s2.d': 'They log in through Telegram, connect their Uzum cabinet and start using the platform.',
    'how.s3.t': 'You get {pct}% of each payment',
    'how.s3.d': 'The bonus lands on your balance — withdraw it anytime or spend it on your own plan.',

    'table.title': 'Bonus history',
    'table.subtitle': 'Everything credited from your referrals’ payments',
    'table.company': 'Company',
    'table.amount': 'Bonus',
    'table.status': 'Status',
    'table.date': 'Date',
    'table.empty': 'No bonuses yet',
    'table.emptyHint': 'Share your link — the first credit shows up here',

    'status.pending': 'Pending',
    'status.approved': 'Approved',
    'status.paid': 'Paid',
    'status.rejected': 'Rejected',
    'status.canceled': 'Canceled',

    'wd.btn': 'Withdraw bonus',
    'wd.title': 'Withdraw your bonus',
    'wd.subtitle': 'The request goes to an admin and is paid once approved',
    'wd.amount': 'Amount to withdraw',
    'wd.min': 'Minimum amount: {v}',
    'wd.notEnough': 'You need at least {v} to withdraw. Right now: {cur}',
    'wd.note': 'The payout reaches your card within 1–3 business days. The bot will ask for the details.',
    'wd.confirm': 'Confirm withdrawal',
    'wd.cancel': 'Cancel',
    'wd.ok': 'Request sent',
    'wd.okBody': 'Once an admin approves it, the bonus goes to your card',
    'wd.err': 'Could not send the request',

    'empty.title': 'Nothing found',
    'empty.hint': 'Referral program data is not available yet',
  },
});

/** Yechish uchun minimal bonus summasi (UZS) */
const MIN_WITHDRAW = 100_000;

const STATUS_TONE: Record<string, Tone> = {
  pending: 'warn',
  approved: 'info',
  paid: 'brand',
  rejected: 'danger',
  canceled: 'muted',
};

type HistoryRow = ReferralResponse['history'][number];

export default function Referral() {
  const t = useT('referral');
  const f = useFormat();
  const qc = useQueryClient();

  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [wdOpen, setWdOpen] = useState(false);

  const referral = useQuery({
    queryKey: ['referral'],
    queryFn: () => api.get<ReferralResponse>('/referral'),
  });

  const data = referral.data;
  const pending = Math.max(0, data?.pending ?? 0);
  const canWithdraw = pending >= MIN_WITHDRAW;

  const shareUrl = useMemo(() => {
    if (!data) return '';
    const text = `${t('hero.shareText')}`;
    return `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(text)}`;
  }, [data, t]);

  const copy = (value: string, kind: 'code' | 'link') => {
    void copyToClipboard(value).then(() => {
      setCopied(kind);
      toast.success(t('hero.copied'));
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1800);
    });
  };

  const withdraw = useMutation({
    mutationFn: () => api.post<unknown>('/referral/withdraw', { amount: pending }),
    onSuccess: () => {
      toast.success(t('wd.ok'), t('wd.okBody'));
      setWdOpen(false);
      void qc.invalidateQueries({ queryKey: ['referral'] });
    },
    onError: (err: unknown) => {
      toast.error(t('wd.err'), err instanceof Error ? err.message : undefined);
    },
  });

  const columns: Column<HistoryRow>[] = [
    {
      key: 'company',
      header: t('table.company'),
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 font-display text-xs font-bold text-brand-ink">
            {(r.company || '?').slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate text-sm font-medium text-ink">{r.company}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('table.amount'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      render: (r) => <span className="font-semibold text-brand-ink">{f.money(r.amount)}</span>,
    },
    {
      key: 'status',
      header: t('table.status'),
      align: 'center',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status] ?? 'muted'} dot>
          {t(`status.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('table.date'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => <span className="tnum text-sm text-ink-soft">{f.date(r.createdAt)}</span>,
    },
  ];

  const percent = data?.percent ?? 0;

  return (
    <>
      <PageHeader
        icon={<Gift className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button
            icon={<HandCoins className="h-4 w-4" />}
            disabled={!canWithdraw}
            onClick={() => setWdOpen(true)}
          >
            {t('wd.btn')}
          </Button>
        }
      />

      {referral.isError ? (
        <Card>
          <ErrorState
            message={referral.error instanceof Error ? referral.error.message : undefined}
            onRetry={() => void referral.refetch()}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* ── Hero ── */}
          <div className="card relative overflow-hidden bg-aurora p-5 sm:p-7">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/10 blur-[90px]"
            />

            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-10">
              {/* Kod */}
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">{t('hero.eyebrow')}</p>

                {referral.isLoading ? (
                  <Skeleton className="mt-3 h-14 w-64" />
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="tnum rounded-2xl border border-brand/30 bg-brand/10 px-4 py-2.5 font-mono text-2xl font-extrabold tracking-[0.18em] text-brand-ink sm:text-3xl">
                      {data?.code ?? '—'}
                    </span>
                    <Button
                      variant="outline"
                      icon={copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      disabled={!data}
                      onClick={() => data && copy(data.code, 'code')}
                    >
                      {copied === 'code' ? t('hero.copied') : t('hero.copyCode')}
                    </Button>
                  </div>
                )}

                {/* Havola */}
                <div className="mt-5">
                  <span className="label">{t('hero.link')}</span>
                  {referral.isLoading ? (
                    <Skeleton className="h-11 w-full" />
                  ) : (
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                        <input
                          readOnly
                          value={data?.link ?? ''}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={t('hero.link')}
                          className="input pl-9 font-mono text-xs sm:text-sm"
                        />
                      </div>
                      <div className="flex shrink-0 gap-2.5">
                        <Button
                          variant="outline"
                          icon={copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          disabled={!data}
                          onClick={() => data && copy(data.link, 'link')}
                        >
                          {copied === 'link' ? t('hero.copied') : t('hero.copyLink')}
                        </Button>
                        <a href={shareUrl} target="_blank" rel="noreferrer" className="shrink-0">
                          <Button icon={<Send className="h-4 w-4" />} disabled={!data}>
                            <span className="hidden sm:inline">{t('hero.share')}</span>
                            <span className="sm:hidden">Telegram</span>
                          </Button>
                        </a>
                      </div>
                    </div>
                  )}

                  {data?.botLink ? (
                    <a
                      href={data.botLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-brand-ink"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      {t('hero.bot')}
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Foiz */}
              <div className="flex items-center">
                <div className="w-full rounded-2xl border border-line bg-surface/70 p-5 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-on-brand">
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="tnum font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                        {t('hero.percent', { pct: percent })}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{t('hero.percentHint')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── KPI ── */}
          <StatGrid>
            <StatCard
              label={t('kpi.invited')}
              value={f.num(data?.invited ?? 0)}
              hint={t('kpi.invitedHint')}
              icon={<Users className="h-5 w-5" />}
              tone="info"
              loading={referral.isLoading}
            />
            <StatCard
              label={t('kpi.paying')}
              value={f.num(data?.activePaying ?? 0)}
              hint={t('kpi.payingHint')}
              icon={<BadgeCheck className="h-5 w-5" />}
              tone="violet"
              loading={referral.isLoading}
            />
            <StatCard
              label={t('kpi.earned')}
              value={f.money(data?.earnedTotal ?? 0)}
              hint={t('kpi.earnedHint')}
              icon={<Wallet className="h-5 w-5" />}
              tone="brand"
              loading={referral.isLoading}
              footer={t('kpi.paidOut', { v: f.money(data?.paid ?? 0) })}
            />
            <StatCard
              label={t('kpi.pending')}
              value={f.money(pending)}
              hint={t('kpi.pendingHint')}
              icon={<Hourglass className="h-5 w-5" />}
              tone="warn"
              loading={referral.isLoading}
              footer={t('wd.min', { v: f.money(MIN_WITHDRAW) })}
            />
          </StatGrid>

          {/* ── Qanday ishlaydi ── */}
          <Card>
            <CardHeader icon={<Share2 className="h-4 w-4" />} title={t('how.title')} subtitle={t('how.subtitle')} />
            <div className="relative p-5 pt-4">
              <div
                aria-hidden
                className="absolute left-[46px] top-[70px] hidden h-px w-[calc(100%-120px)] md:block"
                style={{
                  background:
                    'linear-gradient(90deg, rgb(var(--c-brand) / 0.45), rgb(var(--c-violet) / 0.35), transparent)',
                }}
              />
              <div className="relative grid gap-6 md:grid-cols-3 md:gap-5">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex gap-4 md:block">
                    <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface shadow-card">
                      <span className="tnum font-display text-base font-extrabold text-brand-ink">{n}</span>
                    </div>
                    <div className="md:mt-4">
                      <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted">
                        {t('how.step')} {n}
                      </p>
                      <h3 className="mt-1 font-display text-base font-bold tracking-tight text-ink">
                        {t(`how.s${n}.t`, { pct: percent })}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {t(`how.s${n}.d`, { pct: percent })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ── Tarix ── */}
          <Card className="overflow-hidden">
            <CardHeader
              icon={<HandCoins className="h-4 w-4" />}
              title={t('table.title')}
              subtitle={t('table.subtitle')}
            />
            <div className="mt-4">
              <DataTable
                columns={columns}
                rows={data?.history ?? []}
                rowKey={(r) => r.id}
                loading={referral.isLoading}
                density="compact"
                empty={
                  <EmptyState
                    icon={<Gift className="h-6 w-6" />}
                    title={t('table.empty')}
                    hint={t('table.emptyHint')}
                    action={
                      data ? (
                        <a href={shareUrl} target="_blank" rel="noreferrer">
                          <Button icon={<Send className="h-4 w-4" />}>{t('hero.share')}</Button>
                        </a>
                      ) : undefined
                    }
                  />
                }
              />
            </div>
          </Card>
        </div>
      )}

      {/* ── Yechish oynasi ── */}
      <Modal
        open={wdOpen}
        onClose={() => setWdOpen(false)}
        size="sm"
        title={t('wd.title')}
        description={t('wd.subtitle')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setWdOpen(false)}>
              {t('wd.cancel')}
            </Button>
            <Button
              icon={<HandCoins className="h-4 w-4" />}
              disabled={!canWithdraw}
              loading={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              {t('wd.confirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4 text-center">
            <p className="text-2xs font-semibold uppercase tracking-wider text-brand-ink">{t('wd.amount')}</p>
            <p className="tnum mt-1 font-display text-3xl font-extrabold tracking-tight text-ink">{f.money(pending)}</p>
          </div>

          {canWithdraw ? (
            <p className="text-sm leading-relaxed text-muted">{t('wd.note')}</p>
          ) : (
            <p className="rounded-xl border border-warn/25 bg-warn/10 p-3.5 text-sm text-ink-soft">
              {t('wd.notEnough', { v: f.money(MIN_WITHDRAW), cur: f.money(pending) })}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
