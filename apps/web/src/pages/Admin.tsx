import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Gift,
  LayoutDashboard,
  Megaphone,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type { InvoiceRow, Paginated, PlanId } from '@savdoiq/shared';
import { PLAN_ORDER, formatDuration } from '@savdoiq/shared';
import {
  Avatar,
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
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { registerNamespace, useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('admin', {
  uz: {
    title: 'Administrator',
    subtitle: 'Platforma statistikasi, foydalanuvchilar va to‘lovlar',

    'denied.title': 'Ruxsat yo‘q',
    'denied.hint': 'Bu bo‘lim faqat platforma administratorlari uchun. Agar bu xato bo‘lsa, qo‘llab-quvvatlashga yozing.',
    'denied.back': 'Boshqaruv paneliga qaytish',

    'kpi.users': 'Foydalanuvchilar',
    'kpi.usersHint': 'Ro‘yxatdan o‘tganlar',
    'kpi.companies': 'Kompaniyalar',
    'kpi.companiesHint': 'Yaratilgan hisoblar',
    'kpi.subs': 'Aktiv obunalar',
    'kpi.subsHint': 'Pullik tarifdagilar',
    'kpi.mrr': 'Oylik daromad',
    'kpi.mrrHint': 'MRR — takrorlanuvchi tushum',
    'kpi.syncs': 'Bugungi sinxronlar',
    'kpi.syncsHint': 'Bugun ishga tushgan joblar',

    'tab.users': 'Foydalanuvchilar',
    'tab.companies': 'Kompaniyalar',
    'tab.invoices': 'To‘lovlar',
    'tab.jobs': 'Sinxronizatsiya',
    'tab.broadcast': 'Xabarnoma',

    'users.search': 'Ism, username yoki Telegram ID',
    'users.col.user': 'Foydalanuvchi',
    'users.col.telegram': 'Telegram',
    'users.col.companies': 'Kompaniyalar',
    'users.col.created': 'Ro‘yxatdan o‘tgan',
    'users.col.lastLogin': 'Oxirgi kirish',
    'users.col.role': 'Rol',
    'users.col.status': 'Holat',
    'users.role.user': 'Foydalanuvchi',
    'users.role.admin': 'Administrator',
    'users.status.active': 'Aktiv',
    'users.status.blocked': 'Bloklangan',
    'users.updated': 'Foydalanuvchi yangilandi',
    'users.updateErr': 'Yangilab bo‘lmadi',
    'users.empty': 'Foydalanuvchi topilmadi',
    'users.emptyHint': 'Qidiruvni o‘zgartiring',
    'users.never': 'Hech qachon',

    'comp.search': 'Kompaniya nomi',
    'comp.col.name': 'Kompaniya',
    'comp.col.plan': 'Tarif',
    'comp.col.expires': 'Muddat',
    'comp.col.members': 'A’zolar',
    'comp.col.stores': 'Do‘konlar',
    'comp.col.created': 'Yaratilgan',
    'comp.grant': 'Tarif berish',
    'comp.grantTitle': 'Tarif berish',
    'comp.grantDesc': '«{name}» kompaniyasiga tarifni qo‘lda faollashtirish',
    'comp.plan': 'Tarif',
    'comp.months': 'Muddat',
    'comp.month': '{n} oy',
    'comp.granted': 'Tarif berildi',
    'comp.grantErr': 'Tarif berib bo‘lmadi',
    'comp.empty': 'Kompaniya topilmadi',
    'comp.daysLeft': '{n} kun',
    'comp.expired': 'Muddati tugagan',

    'inv.col.company': 'Kompaniya',
    'inv.col.plan': 'Tarif',
    'inv.col.amount': 'Summa',
    'inv.col.provider': 'To‘lov usuli',
    'inv.col.created': 'Sana',
    'inv.approve': 'Tasdiqlash',
    'inv.approved': 'To‘lov tasdiqlandi',
    'inv.approveErr': 'Tasdiqlab bo‘lmadi',
    'inv.empty': 'To‘lovlar yo‘q',
    'inv.emptyHint': 'Kutilayotgan to‘lovlar shu yerda ko‘rinadi',
    'inv.filter.pending': 'Kutilmoqda',
    'inv.filter.paid': 'To‘langan',
    'inv.filter.all': 'Barchasi',
    'inv.status.pending': 'Kutilmoqda',
    'inv.status.paid': 'To‘langan',
    'inv.status.failed': 'Muvaffaqiyatsiz',
    'inv.status.canceled': 'Bekor qilingan',
    'inv.months': '{n} oy',

    'jobs.col.company': 'Kompaniya',
    'jobs.col.type': 'Tur',
    'jobs.col.status': 'Holat',
    'jobs.col.duration': 'Davomiylik',
    'jobs.col.started': 'Boshlangan',
    'jobs.col.error': 'Xato',
    'jobs.type.full': 'To‘liq',
    'jobs.type.incremental': 'Qisman',
    'jobs.status.queued': 'Navbatda',
    'jobs.status.running': 'Ketmoqda',
    'jobs.status.done': 'Tugadi',
    'jobs.status.failed': 'Xato',
    'jobs.empty': 'Joblar yo‘q',

    'bc.title': 'Ommaviy xabarnoma',
    'bc.subtitle': 'Telegram bot orqali barcha foydalanuvchilarga xabar yuboriladi',
    'bc.text': 'Xabar matni',
    'bc.textPh': 'Salom! SavdoIQ’da yangi imkoniyat: ...',
    'bc.target': 'Kimga',
    'bc.target.all': 'Barchaga',
    'bc.chars': '{n} belgi',
    'bc.send': 'Yuborish',
    'bc.confirmTitle': 'Xabarnomani yuborish',
    'bc.confirmDesc': 'Xabar tanlangan auditoriyaga darhol yuboriladi va uni qaytarib bo‘lmaydi. Davom etamizmi?',
    'bc.sent': 'Xabarnoma navbatga qo‘yildi',
    'bc.err': 'Yuborib bo‘lmadi',
    'bc.previewTitle': 'Ko‘rinishi',
    'bc.empty': 'Matn kiriting',
    'bc.tooLong': 'Matn juda uzun (4096 belgigacha)',
  },
  ru: {
    title: 'Администратор',
    subtitle: 'Статистика платформы, пользователи и платежи',

    'denied.title': 'Нет доступа',
    'denied.hint': 'Раздел доступен только администраторам платформы. Если это ошибка — напишите в поддержку.',
    'denied.back': 'Вернуться на дашборд',

    'kpi.users': 'Пользователи',
    'kpi.usersHint': 'Зарегистрированные',
    'kpi.companies': 'Компании',
    'kpi.companiesHint': 'Созданные аккаунты',
    'kpi.subs': 'Активные подписки',
    'kpi.subsHint': 'На платных тарифах',
    'kpi.mrr': 'Месячная выручка',
    'kpi.mrrHint': 'MRR — регулярный доход',
    'kpi.syncs': 'Синхронизаций сегодня',
    'kpi.syncsHint': 'Задачи, запущенные сегодня',

    'tab.users': 'Пользователи',
    'tab.companies': 'Компании',
    'tab.invoices': 'Платежи',
    'tab.jobs': 'Синхронизация',
    'tab.broadcast': 'Рассылка',

    'users.search': 'Имя, username или Telegram ID',
    'users.col.user': 'Пользователь',
    'users.col.telegram': 'Telegram',
    'users.col.companies': 'Компании',
    'users.col.created': 'Регистрация',
    'users.col.lastLogin': 'Последний вход',
    'users.col.role': 'Роль',
    'users.col.status': 'Статус',
    'users.role.user': 'Пользователь',
    'users.role.admin': 'Администратор',
    'users.status.active': 'Активен',
    'users.status.blocked': 'Заблокирован',
    'users.updated': 'Пользователь обновлён',
    'users.updateErr': 'Не удалось обновить',
    'users.empty': 'Пользователи не найдены',
    'users.emptyHint': 'Измените поисковый запрос',
    'users.never': 'Никогда',

    'comp.search': 'Название компании',
    'comp.col.name': 'Компания',
    'comp.col.plan': 'Тариф',
    'comp.col.expires': 'Срок',
    'comp.col.members': 'Участники',
    'comp.col.stores': 'Магазины',
    'comp.col.created': 'Создана',
    'comp.grant': 'Выдать тариф',
    'comp.grantTitle': 'Выдать тариф',
    'comp.grantDesc': 'Ручная активация тарифа для «{name}»',
    'comp.plan': 'Тариф',
    'comp.months': 'Срок',
    'comp.month': '{n} мес.',
    'comp.granted': 'Тариф выдан',
    'comp.grantErr': 'Не удалось выдать тариф',
    'comp.empty': 'Компании не найдены',
    'comp.daysLeft': '{n} дн.',
    'comp.expired': 'Срок истёк',

    'inv.col.company': 'Компания',
    'inv.col.plan': 'Тариф',
    'inv.col.amount': 'Сумма',
    'inv.col.provider': 'Способ оплаты',
    'inv.col.created': 'Дата',
    'inv.approve': 'Подтвердить',
    'inv.approved': 'Платёж подтверждён',
    'inv.approveErr': 'Не удалось подтвердить',
    'inv.empty': 'Платежей нет',
    'inv.emptyHint': 'Ожидающие платежи появятся здесь',
    'inv.filter.pending': 'Ожидают',
    'inv.filter.paid': 'Оплачены',
    'inv.filter.all': 'Все',
    'inv.status.pending': 'Ожидает',
    'inv.status.paid': 'Оплачен',
    'inv.status.failed': 'Ошибка',
    'inv.status.canceled': 'Отменён',
    'inv.months': '{n} мес.',

    'jobs.col.company': 'Компания',
    'jobs.col.type': 'Тип',
    'jobs.col.status': 'Статус',
    'jobs.col.duration': 'Длительность',
    'jobs.col.started': 'Начало',
    'jobs.col.error': 'Ошибка',
    'jobs.type.full': 'Полная',
    'jobs.type.incremental': 'Частичная',
    'jobs.status.queued': 'В очереди',
    'jobs.status.running': 'Выполняется',
    'jobs.status.done': 'Завершена',
    'jobs.status.failed': 'Ошибка',
    'jobs.empty': 'Задач нет',

    'bc.title': 'Массовая рассылка',
    'bc.subtitle': 'Сообщение уйдёт всем пользователям через Telegram-бот',
    'bc.text': 'Текст сообщения',
    'bc.textPh': 'Привет! В SavdoIQ новая возможность: ...',
    'bc.target': 'Кому',
    'bc.target.all': 'Всем',
    'bc.chars': '{n} символов',
    'bc.send': 'Отправить',
    'bc.confirmTitle': 'Отправить рассылку',
    'bc.confirmDesc': 'Сообщение уйдёт выбранной аудитории сразу, отменить его нельзя. Продолжить?',
    'bc.sent': 'Рассылка поставлена в очередь',
    'bc.err': 'Не удалось отправить',
    'bc.previewTitle': 'Предпросмотр',
    'bc.empty': 'Введите текст',
    'bc.tooLong': 'Текст слишком длинный (до 4096 символов)',
  },
  en: {
    title: 'Admin',
    subtitle: 'Platform statistics, users and payments',

    'denied.title': 'No access',
    'denied.hint': 'This area is for platform administrators only. If you think this is a mistake, contact support.',
    'denied.back': 'Back to the dashboard',

    'kpi.users': 'Users',
    'kpi.usersHint': 'Registered accounts',
    'kpi.companies': 'Companies',
    'kpi.companiesHint': 'Created workspaces',
    'kpi.subs': 'Active subscriptions',
    'kpi.subsHint': 'On paid plans',
    'kpi.mrr': 'Monthly revenue',
    'kpi.mrrHint': 'MRR — recurring revenue',
    'kpi.syncs': 'Syncs today',
    'kpi.syncsHint': 'Jobs started today',

    'tab.users': 'Users',
    'tab.companies': 'Companies',
    'tab.invoices': 'Payments',
    'tab.jobs': 'Syncing',
    'tab.broadcast': 'Broadcast',

    'users.search': 'Name, username or Telegram ID',
    'users.col.user': 'User',
    'users.col.telegram': 'Telegram',
    'users.col.companies': 'Companies',
    'users.col.created': 'Registered',
    'users.col.lastLogin': 'Last login',
    'users.col.role': 'Role',
    'users.col.status': 'Status',
    'users.role.user': 'User',
    'users.role.admin': 'Administrator',
    'users.status.active': 'Active',
    'users.status.blocked': 'Blocked',
    'users.updated': 'User updated',
    'users.updateErr': 'Could not update',
    'users.empty': 'No users found',
    'users.emptyHint': 'Try a different search',
    'users.never': 'Never',

    'comp.search': 'Company name',
    'comp.col.name': 'Company',
    'comp.col.plan': 'Plan',
    'comp.col.expires': 'Expires',
    'comp.col.members': 'Members',
    'comp.col.stores': 'Stores',
    'comp.col.created': 'Created',
    'comp.grant': 'Grant plan',
    'comp.grantTitle': 'Grant a plan',
    'comp.grantDesc': 'Manually activate a plan for “{name}”',
    'comp.plan': 'Plan',
    'comp.months': 'Duration',
    'comp.month': '{n} months',
    'comp.granted': 'Plan granted',
    'comp.grantErr': 'Could not grant the plan',
    'comp.empty': 'No companies found',
    'comp.daysLeft': '{n} days',
    'comp.expired': 'Expired',

    'inv.col.company': 'Company',
    'inv.col.plan': 'Plan',
    'inv.col.amount': 'Amount',
    'inv.col.provider': 'Method',
    'inv.col.created': 'Date',
    'inv.approve': 'Approve',
    'inv.approved': 'Payment approved',
    'inv.approveErr': 'Could not approve',
    'inv.empty': 'No payments',
    'inv.emptyHint': 'Pending payments will appear here',
    'inv.filter.pending': 'Pending',
    'inv.filter.paid': 'Paid',
    'inv.filter.all': 'All',
    'inv.status.pending': 'Pending',
    'inv.status.paid': 'Paid',
    'inv.status.failed': 'Failed',
    'inv.status.canceled': 'Canceled',
    'inv.months': '{n} months',

    'jobs.col.company': 'Company',
    'jobs.col.type': 'Type',
    'jobs.col.status': 'Status',
    'jobs.col.duration': 'Duration',
    'jobs.col.started': 'Started',
    'jobs.col.error': 'Error',
    'jobs.type.full': 'Full',
    'jobs.type.incremental': 'Incremental',
    'jobs.status.queued': 'Queued',
    'jobs.status.running': 'Running',
    'jobs.status.done': 'Done',
    'jobs.status.failed': 'Failed',
    'jobs.empty': 'No jobs',

    'bc.title': 'Broadcast message',
    'bc.subtitle': 'The message is delivered to every user through the Telegram bot',
    'bc.text': 'Message text',
    'bc.textPh': 'Hi! There is something new in SavdoIQ: ...',
    'bc.target': 'Audience',
    'bc.target.all': 'Everyone',
    'bc.chars': '{n} characters',
    'bc.send': 'Send',
    'bc.confirmTitle': 'Send the broadcast',
    'bc.confirmDesc': 'The message goes out to the selected audience immediately and cannot be recalled. Continue?',
    'bc.sent': 'Broadcast queued',
    'bc.err': 'Could not send',
    'bc.previewTitle': 'Preview',
    'bc.empty': 'Enter a message',
    'bc.tooLong': 'The text is too long (4096 characters max)',
  },
});

// ─────────────────────────── Mahalliy tiplar ───────────────────────────

interface AdminStats {
  users?: number;
  companies?: number;
  activeSubscriptions?: number;
  subscriptions?: number;
  mrr?: number;
  revenueMonth?: number;
  syncsToday?: number;
  jobsToday?: number;
  usersToday?: number;
  companiesToday?: number;
  pendingInvoices?: number;
}

interface AdminUserRow {
  id: string;
  telegramId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  role: string;
  status?: string;
  companiesCount?: number;
  lastLoginAt?: string | null;
  createdAt?: string | null;
}

interface AdminCompanyRow {
  id: string;
  name: string;
  plan?: string;
  status?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  membersCount?: number;
  storesCount?: number;
  ownerName?: string | null;
  ownerUsername?: string | null;
  createdAt?: string | null;
}

interface AdminInvoiceRow extends InvoiceRow {
  companyName?: string | null;
}

interface AdminJobRow {
  id: string;
  companyName?: string | null;
  type?: string;
  status?: string;
  progress?: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
  error?: string | null;
  createdAt?: string | null;
}

type TabKey = 'users' | 'companies' | 'invoices' | 'jobs' | 'broadcast';
type InvoiceFilter = 'pending' | 'paid' | 'all';

const PAGE_SIZE = 20;

const PLAN_TONE: Record<string, Tone> = {
  trial: 'muted',
  standard: 'brand',
  business: 'info',
  vip: 'violet',
};

const JOB_TONE: Record<string, Tone> = {
  queued: 'info',
  running: 'brand',
  done: 'brand',
  failed: 'danger',
};

const INVOICE_TONE: Record<string, Tone> = {
  pending: 'warn',
  paid: 'brand',
  failed: 'danger',
  canceled: 'muted',
};

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** Javob massiv ham, `Paginated` ham bo'lishi mumkin */
function toPage<T>(res: unknown, page: number): Page<T> {
  if (Array.isArray(res)) {
    return { items: res as T[], total: res.length, page: 1, pages: 1 };
  }
  const o = (res ?? {}) as Partial<Paginated<T>>;
  const items = Array.isArray(o.items) ? o.items : [];
  const total = typeof o.total === 'number' ? o.total : items.length;
  return {
    items,
    total,
    page: typeof o.page === 'number' ? o.page : page,
    pages: typeof o.pages === 'number' ? o.pages : Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

const errText = (err: unknown): string | undefined => (err instanceof Error ? err.message : undefined);

const userName = (u: AdminUserRow): string => {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || (u.username ? `@${u.username}` : (u.telegramId ?? '—'));
};

function jobDuration(row: { startedAt?: string | null; finishedAt?: string | null; durationSeconds?: number | null }) {
  if (typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds)) return row.durationSeconds;
  if (row.startedAt && row.finishedAt) {
    const ms = new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 1000);
  }
  return null;
}

// ─────────────────────────── Sahifa ───────────────────────────

export default function Admin() {
  const t = useT('admin');
  const ready = useSession((s) => s.ready);
  const isAdmin = useSession((s) => s.me?.user.role === 'admin');

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-xl overflow-hidden bg-aurora">
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={t('denied.title')}
          hint={t('denied.hint')}
          action={
            <Link to="/dashboard">
              <Button variant="outline" icon={<LayoutDashboard className="h-4 w-4" />}>
                {t('denied.back')}
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return <AdminConsole />;
}

function AdminConsole() {
  const t = useT('admin');
  const f = useFormat();
  const [tab, setTab] = useState<TabKey>('users');

  const stats = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<AdminStats>('/admin/stats'),
    refetchInterval: 60_000,
  });

  const s = stats.data;
  const subs = s?.activeSubscriptions ?? s?.subscriptions ?? 0;
  const mrr = s?.mrr ?? s?.revenueMonth ?? 0;
  const syncs = s?.syncsToday ?? s?.jobsToday ?? 0;

  const tabs: { value: TabKey; label: string }[] = [
    { value: 'users', label: t('tab.users') },
    { value: 'companies', label: t('tab.companies') },
    { value: 'invoices', label: t('tab.invoices') },
    { value: 'jobs', label: t('tab.jobs') },
    { value: 'broadcast', label: t('tab.broadcast') },
  ];

  return (
    <>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={
          <Badge tone="violet" dot>
            {t('users.role.admin')}
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={cn('h-3.5 w-3.5', stats.isFetching && 'animate-spin')} />}
            onClick={() => void stats.refetch()}
          >
            {t('btn.refresh')}
          </Button>
        }
      />

      {/* ── KPI ── */}
      {stats.isError ? (
        <Card className="mb-5">
          <ErrorState message={errText(stats.error)} onRetry={() => void stats.refetch()} />
        </Card>
      ) : (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label={t('kpi.users')}
            value={f.num(s?.users ?? 0)}
            hint={t('kpi.usersHint')}
            icon={<Users className="h-5 w-5" />}
            tone="brand"
            loading={stats.isLoading}
          />
          <StatCard
            label={t('kpi.companies')}
            value={f.num(s?.companies ?? 0)}
            hint={t('kpi.companiesHint')}
            icon={<Building2 className="h-5 w-5" />}
            tone="info"
            loading={stats.isLoading}
          />
          <StatCard
            label={t('kpi.subs')}
            value={f.num(subs)}
            hint={t('kpi.subsHint')}
            icon={<CreditCard className="h-5 w-5" />}
            tone="violet"
            loading={stats.isLoading}
          />
          <StatCard
            label={t('kpi.mrr')}
            value={f.money(mrr)}
            hint={t('kpi.mrrHint')}
            icon={<CircleDollarSign className="h-5 w-5" />}
            tone="brand"
            loading={stats.isLoading}
          />
          <StatCard
            label={t('kpi.syncs')}
            value={f.num(syncs)}
            hint={t('kpi.syncsHint')}
            icon={<RefreshCw className="h-5 w-5" />}
            tone="warn"
            loading={stats.isLoading}
          />
        </div>
      )}

      <div className="mb-4 max-w-full overflow-x-auto no-scrollbar">
        <Segmented options={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'users' ? <UsersTab /> : null}
      {tab === 'companies' ? <CompaniesTab /> : null}
      {tab === 'invoices' ? <InvoicesTab /> : null}
      {tab === 'jobs' ? <JobsTab /> : null}
      {tab === 'broadcast' ? <BroadcastTab /> : null}
    </>
  );
}

// ─────────────────────────── Foydalanuvchilar ───────────────────────────

function UsersTab() {
  const t = useT('admin');
  const f = useFormat();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const users = useQuery({
    queryKey: ['admin-users', term, page],
    queryFn: async () =>
      toPage<AdminUserRow>(
        await api.get<Paginated<AdminUserRow>>('/admin/users', { search: term || undefined, page, pageSize: PAGE_SIZE }),
        page,
      ),
    placeholderData: (prev) => prev,
  });

  const patch = useMutation({
    mutationFn: (vars: { id: string; body: { role?: string; status?: string } }) =>
      api.patch<AdminUserRow>(`/admin/users/${vars.id}`, vars.body),
    onSuccess: () => {
      toast.success(t('users.updated'));
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => toast.error(t('users.updateErr'), errText(err)),
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: t('users.col.user'),
      render: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={u.photoUrl} name={userName(u)} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{userName(u)}</p>
            <p className="truncate text-xs text-muted">{u.phone || (u.username ? `@${u.username}` : '—')}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'telegram',
      header: t('users.col.telegram'),
      hideOnMobile: true,
      render: (u) => <span className="tnum text-xs text-muted">{u.telegramId ?? '—'}</span>,
    },
    {
      key: 'companies',
      header: t('users.col.companies'),
      align: 'right',
      hideOnMobile: true,
      render: (u) => <span className="tnum">{u.companiesCount ?? 0}</span>,
    },
    {
      key: 'createdAt',
      header: t('users.col.created'),
      align: 'right',
      hideOnMobile: true,
      render: (u) => (u.createdAt ? <span className="tnum text-xs">{f.date(u.createdAt)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'lastLoginAt',
      header: t('users.col.lastLogin'),
      align: 'right',
      hideOnMobile: true,
      render: (u) =>
        u.lastLoginAt ? (
          <span className="tnum text-xs">{f.date(u.lastLoginAt)}</span>
        ) : (
          <span className="text-xs text-muted">{t('users.never')}</span>
        ),
    },
    {
      key: 'role',
      header: t('users.col.role'),
      width: 160,
      render: (u) => (
        <Select
          value={u.role}
          aria-label={t('users.col.role')}
          className="h-9 w-[150px] py-1.5 text-xs"
          disabled={patch.isPending}
          onChange={(e) => patch.mutate({ id: u.id, body: { role: e.target.value } })}
        >
          <option value="user">{t('users.role.user')}</option>
          <option value="admin">{t('users.role.admin')}</option>
        </Select>
      ),
    },
    {
      key: 'status',
      header: t('users.col.status'),
      align: 'center',
      width: 140,
      render: (u) => {
        const blocked = u.status === 'blocked';
        return (
          <Button
            size="sm"
            variant={blocked ? 'danger' : 'outline'}
            loading={patch.isPending && patch.variables?.id === u.id && patch.variables?.body.status !== undefined}
            onClick={() => patch.mutate({ id: u.id, body: { status: blocked ? 'active' : 'blocked' } })}
          >
            {blocked ? t('users.status.blocked') : t('users.status.active')}
          </Button>
        );
      },
    },
  ];

  const data = users.data;

  return (
    <Card>
      <CardHeader
        icon={<Users className="h-4 w-4" />}
        title={t('tab.users')}
        subtitle={data ? `${data.total} ${t('common.rows')}` : undefined}
        actions={<SearchInput value={search} onChange={setSearch} placeholder={t('users.search')} className="w-full sm:w-72" />}
      />
      <div className="mt-4">
        {users.isError ? (
          <ErrorState message={errText(users.error)} onRetry={() => void users.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(u) => u.id}
            loading={users.isLoading}
            density="compact"
            localSort={false}
            empty={<EmptyState icon={<Users className="h-6 w-6" />} title={t('users.empty')} hint={t('users.emptyHint')} />}
            pagination={
              data
                ? { page: data.page, pages: data.pages, total: data.total, pageSize: PAGE_SIZE, onPage: setPage }
                : undefined
            }
          />
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────── Kompaniyalar ───────────────────────────

function CompaniesTab() {
  const t = useT('admin');
  const f = useFormat();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminCompanyRow | null>(null);
  const [plan, setPlan] = useState<PlanId>('standard');
  const [months, setMonths] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const companies = useQuery({
    queryKey: ['admin-companies', term, page],
    queryFn: async () =>
      toPage<AdminCompanyRow>(
        await api.get<Paginated<AdminCompanyRow>>('/admin/companies', {
          search: term || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
        page,
      ),
    placeholderData: (prev) => prev,
  });

  const grant = useMutation({
    mutationFn: (vars: { id: string; plan: PlanId; months: number }) =>
      api.post<unknown>(`/admin/companies/${vars.id}/grant`, { plan: vars.plan, months: vars.months }),
    onSuccess: () => {
      toast.success(t('comp.granted'));
      setTarget(null);
      void qc.invalidateQueries({ queryKey: ['admin-companies'] });
      void qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => toast.error(t('comp.grantErr'), errText(err)),
  });

  const columns: Column<AdminCompanyRow>[] = [
    {
      key: 'name',
      header: t('comp.col.name'),
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{c.name}</p>
          <p className="truncate text-xs text-muted">
            {c.ownerName || (c.ownerUsername ? `@${c.ownerUsername}` : c.id)}
          </p>
        </div>
      ),
    },
    {
      key: 'plan',
      header: t('comp.col.plan'),
      render: (c) => (
        <Badge tone={PLAN_TONE[c.plan ?? 'trial'] ?? 'muted'} dot>
          {t(`plan.${c.plan ?? 'trial'}`)}
        </Badge>
      ),
    },
    {
      key: 'expiresAt',
      header: t('comp.col.expires'),
      align: 'right',
      render: (c) => {
        if (!c.expiresAt) return <span className="text-muted">—</span>;
        const left = c.daysLeft ?? null;
        return (
          <div className="text-right">
            <p className="tnum text-sm text-ink">{f.date(c.expiresAt)}</p>
            <p className={cn('text-xs', left !== null && left <= 0 ? 'text-danger' : 'text-muted')}>
              {left === null ? '' : left <= 0 ? t('comp.expired') : t('comp.daysLeft', { n: left })}
            </p>
          </div>
        );
      },
    },
    {
      key: 'membersCount',
      header: t('comp.col.members'),
      align: 'right',
      hideOnMobile: true,
      render: (c) => <span className="tnum">{c.membersCount ?? 0}</span>,
    },
    {
      key: 'storesCount',
      header: t('comp.col.stores'),
      align: 'right',
      hideOnMobile: true,
      render: (c) => <span className="tnum">{c.storesCount ?? 0}</span>,
    },
    {
      key: 'createdAt',
      header: t('comp.col.created'),
      align: 'right',
      hideOnMobile: true,
      render: (c) => (c.createdAt ? <span className="tnum text-xs">{f.date(c.createdAt)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 150,
      render: (c) => (
        <Button
          size="sm"
          variant="outline"
          icon={<Gift className="h-3.5 w-3.5" />}
          onClick={() => {
            setTarget(c);
            setPlan((c.plan as PlanId) && c.plan !== 'trial' ? (c.plan as PlanId) : 'standard');
            setMonths(1);
          }}
        >
          {t('comp.grant')}
        </Button>
      ),
    },
  ];

  const data = companies.data;

  return (
    <Card>
      <CardHeader
        icon={<Building2 className="h-4 w-4" />}
        title={t('tab.companies')}
        subtitle={data ? `${data.total} ${t('common.rows')}` : undefined}
        actions={<SearchInput value={search} onChange={setSearch} placeholder={t('comp.search')} className="w-full sm:w-72" />}
      />
      <div className="mt-4">
        {companies.isError ? (
          <ErrorState message={errText(companies.error)} onRetry={() => void companies.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(c) => c.id}
            loading={companies.isLoading}
            density="compact"
            localSort={false}
            empty={<EmptyState icon={<Building2 className="h-6 w-6" />} title={t('comp.empty')} />}
            pagination={
              data
                ? { page: data.page, pages: data.pages, total: data.total, pageSize: PAGE_SIZE, onPage: setPage }
                : undefined
            }
          />
        )}
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={t('comp.grantTitle')}
        description={t('comp.grantDesc', { name: target?.name ?? '' })}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <span className="label">{t('comp.plan')}</span>
            <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {t(`plan.${p}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className="label">{t('comp.months')}</span>
            <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {t('comp.month', { n: m })}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            {t('btn.cancel')}
          </Button>
          <Button
            icon={<Gift className="h-4 w-4" />}
            loading={grant.isPending}
            onClick={() => target && grant.mutate({ id: target.id, plan, months })}
          >
            {t('comp.grant')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

// ─────────────────────────── To'lovlar ───────────────────────────

function InvoicesTab() {
  const t = useT('admin');
  const f = useFormat();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InvoiceFilter>('pending');
  const [page, setPage] = useState(1);

  const invoices = useQuery({
    queryKey: ['admin-invoices', filter, page],
    queryFn: async () =>
      toPage<AdminInvoiceRow>(
        await api.get<Paginated<AdminInvoiceRow>>('/admin/invoices', {
          status: filter === 'all' ? undefined : filter,
          page,
          pageSize: PAGE_SIZE,
        }),
        page,
      ),
    placeholderData: (prev) => prev,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/admin/invoices/${id}/approve`),
    onSuccess: () => {
      toast.success(t('inv.approved'));
      void qc.invalidateQueries({ queryKey: ['admin-invoices'] });
      void qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => toast.error(t('inv.approveErr'), errText(err)),
  });

  const columns: Column<AdminInvoiceRow>[] = [
    {
      key: 'company',
      header: t('inv.col.company'),
      render: (i) => <span className="text-sm font-medium text-ink">{i.companyName || i.id}</span>,
    },
    {
      key: 'plan',
      header: t('inv.col.plan'),
      render: (i) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={PLAN_TONE[i.plan] ?? 'muted'}>{t(`plan.${i.plan}`)}</Badge>
          <span className="text-xs text-muted">{t('inv.months', { n: i.months })}</span>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('inv.col.amount'),
      align: 'right',
      render: (i) => <span className="font-semibold text-ink">{f.money(i.amount, i.currency)}</span>,
    },
    {
      key: 'provider',
      header: t('inv.col.provider'),
      hideOnMobile: true,
      render: (i) => <span className="text-xs uppercase text-muted">{i.provider}</span>,
    },
    {
      key: 'createdAt',
      header: t('inv.col.created'),
      align: 'right',
      hideOnMobile: true,
      render: (i) => <span className="tnum text-xs">{f.date(i.createdAt)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      align: 'center',
      render: (i) => (
        <Badge tone={INVOICE_TONE[i.status] ?? 'muted'} dot>
          {t(`inv.status.${i.status}`)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 150,
      render: (i) =>
        i.status === 'pending' ? (
          <Button
            size="sm"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            loading={approve.isPending && approve.variables === i.id}
            onClick={() => approve.mutate(i.id)}
          >
            {t('inv.approve')}
          </Button>
        ) : i.paidAt ? (
          <span className="tnum text-xs text-muted">{f.date(i.paidAt)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  const data = invoices.data;
  const options: { value: InvoiceFilter; label: string }[] = [
    { value: 'pending', label: t('inv.filter.pending') },
    { value: 'paid', label: t('inv.filter.paid') },
    { value: 'all', label: t('inv.filter.all') },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Wallet className="h-4 w-4" />}
        title={t('tab.invoices')}
        subtitle={data ? `${data.total} ${t('common.rows')}` : undefined}
        actions={
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <Segmented
              options={options}
              value={filter}
              size="sm"
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
            />
          </div>
        }
      />
      <div className="mt-4">
        {invoices.isError ? (
          <ErrorState message={errText(invoices.error)} onRetry={() => void invoices.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(i) => i.id}
            loading={invoices.isLoading}
            density="compact"
            localSort={false}
            empty={<EmptyState icon={<Wallet className="h-6 w-6" />} title={t('inv.empty')} hint={t('inv.emptyHint')} />}
            pagination={
              data
                ? { page: data.page, pages: data.pages, total: data.total, pageSize: PAGE_SIZE, onPage: setPage }
                : undefined
            }
          />
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────── Sinxronizatsiya joblari ───────────────────────────

function JobsTab() {
  const t = useT('admin');
  const f = useFormat();
  const lang = useLang();
  const [page, setPage] = useState(1);

  const jobs = useQuery({
    queryKey: ['admin-jobs', page],
    queryFn: async () =>
      toPage<AdminJobRow>(
        await api.get<Paginated<AdminJobRow>>('/admin/jobs', { page, pageSize: PAGE_SIZE }),
        page,
      ),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
  });

  const columns: Column<AdminJobRow>[] = [
    {
      key: 'company',
      header: t('jobs.col.company'),
      render: (j) => <span className="text-sm font-medium text-ink">{j.companyName || '—'}</span>,
    },
    {
      key: 'type',
      header: t('jobs.col.type'),
      render: (j) => (
        <span className="text-sm text-ink-soft">
          {j.type === 'full' ? t('jobs.type.full') : j.type === 'incremental' ? t('jobs.type.incremental') : (j.type ?? '—')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('jobs.col.status'),
      render: (j) => (
        <div className="flex items-center gap-2">
          <Badge tone={JOB_TONE[j.status ?? ''] ?? 'muted'} dot>
            {t(`jobs.status.${j.status ?? 'queued'}`)}
          </Badge>
          {j.status === 'running' && typeof j.progress === 'number' ? (
            <span className="tnum text-xs text-brand">{j.progress}%</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'duration',
      header: t('jobs.col.duration'),
      align: 'right',
      hideOnMobile: true,
      render: (j) => {
        const d = jobDuration(j);
        return d === null ? <span className="text-muted">—</span> : <span className="tnum">{formatDuration(d, lang)}</span>;
      },
    },
    {
      key: 'startedAt',
      header: t('jobs.col.started'),
      align: 'right',
      hideOnMobile: true,
      render: (j) => {
        const at = j.startedAt ?? j.createdAt;
        return at ? <span className="tnum text-xs">{f.dateTime(at)}</span> : <span className="text-muted">—</span>;
      },
    },
    {
      key: 'error',
      header: t('jobs.col.error'),
      hideOnMobile: true,
      render: (j) =>
        j.error ? <span className="line-clamp-2 max-w-[260px] text-xs text-danger">{j.error}</span> : <span className="text-muted">—</span>,
    },
  ];

  const data = jobs.data;

  return (
    <Card>
      <CardHeader
        icon={<RefreshCw className={cn('h-4 w-4', jobs.isFetching && 'animate-spin')} />}
        title={t('tab.jobs')}
        subtitle={data ? `${data.total} ${t('common.rows')}` : undefined}
      />
      <div className="mt-4">
        {jobs.isError ? (
          <ErrorState message={errText(jobs.error)} onRetry={() => void jobs.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(j) => j.id}
            loading={jobs.isLoading}
            density="compact"
            localSort={false}
            empty={<EmptyState icon={<RefreshCw className="h-6 w-6" />} title={t('jobs.empty')} />}
            pagination={
              data
                ? { page: data.page, pages: data.pages, total: data.total, pageSize: PAGE_SIZE, onPage: setPage }
                : undefined
            }
          />
        )}
      </div>
    </Card>
  );
}

// ─────────────────────────── Xabarnoma ───────────────────────────

function BroadcastTab() {
  const t = useT('admin');
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'all' | PlanId>('all');
  const [confirm, setConfirm] = useState(false);

  const send = useMutation({
    mutationFn: () => api.post<unknown>('/admin/broadcast', { text: text.trim(), target }),
    onSuccess: () => {
      toast.success(t('bc.sent'));
      setConfirm(false);
      setText('');
    },
    onError: (err) => {
      setConfirm(false);
      toast.error(t('bc.err'), errText(err));
    },
  });

  const trimmed = text.trim();
  const tooLong = trimmed.length > 4096;
  const canSend = trimmed.length > 0 && !tooLong;

  const targetLabel = useMemo(
    () => (target === 'all' ? t('bc.target.all') : t(`plan.${target}`)),
    [target, t],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader icon={<Megaphone className="h-4 w-4" />} title={t('bc.title')} subtitle={t('bc.subtitle')} />
        <CardBody className="space-y-4">
          <div>
            <span className="label">{t('bc.target')}</span>
            <Select
              value={target}
              className="max-w-xs"
              onChange={(e) => setTarget(e.target.value as 'all' | PlanId)}
            >
              <option value="all">{t('bc.target.all')}</option>
              {PLAN_ORDER.map((p) => (
                <option key={p} value={p}>
                  {t(`plan.${p}`)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <span className="label">{t('bc.text')}</span>
            <textarea
              value={text}
              rows={8}
              placeholder={t('bc.textPh')}
              onChange={(e) => setText(e.target.value)}
              className="input min-h-[180px] resize-y leading-relaxed"
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className={cn('tnum text-xs', tooLong ? 'text-danger' : 'text-muted')}>
                {t('bc.chars', { n: trimmed.length })}
              </span>
              {tooLong ? <span className="text-xs text-danger">{t('bc.tooLong')}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<Send className="h-4 w-4" />}
              disabled={!canSend}
              loading={send.isPending}
              onClick={() => setConfirm(true)}
            >
              {t('bc.send')}
            </Button>
            {!canSend && !tooLong ? <span className="text-xs text-muted">{t('bc.empty')}</span> : null}
          </div>
        </CardBody>
      </Card>

      {/* ── Oldindan ko'rish ── */}
      <Card>
        <CardHeader icon={<Send className="h-4 w-4" />} title={t('bc.previewTitle')} />
        <CardBody>
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand">
                <Send className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">SavdoIQ</p>
                <p className="truncate text-xs text-muted">{targetLabel}</p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-ink-soft">
              {trimmed || t('bc.textPh')}
            </p>
          </div>
        </CardBody>
      </Card>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('bc.confirmTitle')} size="sm">
        <p className="text-sm text-ink-soft">{t('bc.confirmDesc')}</p>
        <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{targetLabel}</p>
          <p className="mt-1.5 line-clamp-6 whitespace-pre-wrap break-words text-sm text-ink-soft">{trimmed}</p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {t('btn.cancel')}
          </Button>
          <Button icon={<Send className="h-4 w-4" />} loading={send.isPending} onClick={() => send.mutate()}>
            {t('bc.send')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
