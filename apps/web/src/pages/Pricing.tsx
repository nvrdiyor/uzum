import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CreditCard,
  Gift,
  HelpCircle,
  ReceiptText,
  Sparkles,
  Table2,
} from 'lucide-react';
import {
  APP,
  PLANS,
  PLAN_ORDER,
  type InvoiceRow,
  type PlanPublic,
  type ReferralResponse,
  type SubscriptionSummary,
} from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Segmented,
  Skeleton,
  type Column,
  type Tone,
} from '@/components/ui';
import {
  CheckoutModal,
  CompareTable,
  CurrentPlanCard,
  PlanCard,
  PricingFaq,
  type BillingCycle,
  type Months,
} from '@/components/billing';
import { BOT_URL as BOT_URL_SHARED } from '@/lib/bot';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('pricing', {
  uz: {
    title: 'Tariflar va to‘lov',
    subtitle: 'Biznesingiz o‘lchamiga mos rejani tanlang — istalgan vaqtda o‘zgartirasiz',

    // Joriy tarif
    'current.eyebrow': 'Joriy tarifingiz',
    'current.trial': 'Sinov davri',
    'current.until': 'Amal qiladi: {date} gacha',
    'current.expiredAt': 'Muddati tugagan: {date}',
    'current.none': 'Faol obuna yo‘q — quyidan tarif tanlang',
    'current.daysLeft': 'Tarif muddati',
    'current.daysValue': '{n} kun qoldi',
    'current.help': 'Yordam',

    'status.active': 'Faol',
    'status.pending': 'To‘lov kutilmoqda',
    'status.expired': 'Tugagan',
    'status.canceled': 'Bekor qilingan',

    // Almashtirgich
    'cycle.monthly': 'Oylik',
    'cycle.yearly': 'Yillik',
    'cycle.save': 'Yillik to‘lovda {pct}% gacha chegirma',
    'cycle.twoFree': '2 oy tekin',

    // Karta
    'badge.popular': 'Mashhur',
    'badge.best': 'Eng yaxshi',
    'card.current': 'Sizning tarifingiz',
    'card.currentBtn': 'Joriy tarif',
    'card.chooseBtn': 'Tarifni tanlash',
    'card.trialBtn': 'Bepul boshlash',
    'card.trialOnly': 'Ro‘yxatdan o‘tishda beriladi',
    'card.free': 'Bepul',
    'card.trialDays': '{days} kun to‘liq kirish',
    'card.perMonth': 'so‘m / oyiga',
    'card.monthlyNote': 'Har oy to‘lanadi, istalgan vaqtda bekor qilinadi',
    'card.billedYearly': 'yiliga {total}',

    // Limitlar
    'limit.stores': 'Do‘kon',
    'limit.cabinets': 'Uzum kabineti',
    'limit.members': 'Jamoa a’zosi',
    'limit.history': 'Tarix chuqurligi',
    'limit.historyValue': '{n} kun',
    'limit.sync': 'Sinxronizatsiya',
    'limit.syncValue': 'har {n} daqiqada',

    // Ruxsat belgilari
    'access.full': 'To‘liq ishlaydi',
    'access.preview': 'faqat ko‘rish',
    'access.off': 'Mavjud emas',

    // Taqqoslash
    'compare.title': 'Tariflarni taqqoslash',
    'compare.subtitle': 'Har bir imkoniyat qaysi tarifda qanday ishlashi',
    'compare.feature': 'Imkoniyat',
    'compare.limits': 'Limitlar',

    // To‘lov oynasi
    'pay.title': '{plan} tarifini rasmiylashtirish',
    'pay.subtitle': 'Muddat va to‘lov usulini tanlang',
    'pay.months': 'Muddat',
    'pay.m1': '1 oy',
    'pay.m3': '3 oy',
    'pay.m6': '6 oy',
    'pay.m12': '12 oy',
    'pay.yearlyHint': '12 oylik to‘lovda {pct}% chegirma — deyarli 2 oy tekin',
    'pay.method': 'To‘lov usuli',
    'pay.payme': 'Payme',
    'pay.paymeHint': 'Ilova orqali bir bosishda',
    'pay.click': 'Click',
    'pay.clickHint': 'Click Up yoki karta',
    'pay.manual': 'Karta orqali',
    'pay.manualHint': 'O‘tkazma, admin tasdiqlaydi',
    'pay.bonus': 'Referal bonusdan foydalanish',
    'pay.bonusHint': 'Mavjud bonus: {amount}',
    'pay.rowBase': 'Tarif × {n} oy',
    'pay.rowDiscount': 'Chegirma ({pct}%)',
    'pay.rowBonus': 'Referal bonus',
    'pay.total': 'Yakuniy summa',
    'pay.twoMonthsFree': '2 oy tekin — yillik to‘lov',
    'pay.note': 'To‘lov tasdiqlangach tarif bir zumda faollashadi. Ma’lumotlaringiz saqlanib qoladi.',
    'pay.cancel': 'Bekor qilish',
    'pay.submit': 'To‘lovga o‘tish',
    'pay.close': 'Yopish',
    'pay.manualFooter': 'To‘lov tasdiqlangach tarif avtomatik faollashadi',
    'pay.opened': 'To‘lov sahifasi ochildi',
    'pay.openedBody': 'To‘lovni yakunlagach sahifaga qayting',
    'pay.created': 'Hisob-faktura yaratildi',
    'pay.createdBody': 'Quyidagi ko‘rsatma bo‘yicha to‘lovni amalga oshiring',
    'pay.error': 'To‘lovni boshlab bo‘lmadi',
    'pay.copied': 'Nusxalandi',
    'pay.copy': 'Nusxa olish',
    'pay.invoice': 'To‘lash kerak',
    'pay.invoiceNo': 'Hisob raqami',
    'pay.card': 'Karta ma’lumotlari',
    'pay.cardFromBot': 'Karta rekvizitlarini botdan oling — hisob raqamini yuboring, bot rekvizitni beradi.',
    'pay.s1': 'Yuqoridagi summani ko‘rsatilgan kartaga o‘tkazing.',
    'pay.s2': 'To‘lov chekini botga yuboring (hisob raqamini ham qo‘shing).',
    'pay.s3': 'Admin tasdiqlagach tarif darhol faollashadi.',
    'pay.adminConfirm': 'To‘lovdan keyin admin tasdiqlaydi — odatda 15 daqiqa ichida.',
    'pay.openBot': 'Telegram botga o‘tish',

    // To‘lovlar tarixi
    'inv.title': 'To‘lovlar tarixi',
    'inv.subtitle': 'Barcha hisob-fakturalar va ularning holati',
    'inv.date': 'Sana',
    'inv.plan': 'Tarif',
    'inv.months': 'Muddat',
    'inv.monthsValue': '{n} oy',
    'inv.amount': 'Summa',
    'inv.method': 'Usul',
    'inv.status': 'Holat',
    'inv.pay': 'To‘lash',
    'inv.empty': 'Hali to‘lovlar yo‘q',
    'inv.emptyHint': 'Tarif tanlaganingizdan so‘ng hisob-fakturalar shu yerda ko‘rinadi',
    'inv.pending': 'Kutilmoqda',
    'inv.paid': 'To‘langan',
    'inv.failed': 'Muvaffaqiyatsiz',
    'inv.canceled': 'Bekor qilingan',

    // Ro‘yxat holatlari
    'plans.empty': 'Tariflar topilmadi',
    'plans.emptyHint': 'Biroz kuting yoki sahifani yangilang',

    // FAQ
    'faq.title': 'Ko‘p so‘raladigan savollar',
    'faq.subtitle': 'To‘lov va tariflar bo‘yicha eng keng tarqalgan savollar',
    'faq.q1': 'Sinov davri qanday ishlaydi?',
    'faq.a1':
      'Ro‘yxatdan o‘tganingizda 7 kunlik bepul Sinov tarifi beriladi. Karta talab qilinmaydi — muddat tugagach ma’lumotlaringiz saqlanadi, faqat ilg‘or bo‘limlar yopiladi.',
    'faq.q2': 'Tarifni istalgan vaqtda o‘zgartira olamanmi?',
    'faq.a2':
      'Ha. Yuqoriroq tarifga o‘tsangiz, u darhol faollashadi va qolgan kunlar hisobga olinadi. Pastroq tarifga o‘tish joriy muddat tugagach amalga oshadi.',
    'faq.q3': 'Qanday to‘lov usullari mavjud?',
    'faq.a3':
      'Payme va Click orqali onlayn to‘lash mumkin. Karta orqali o‘tkazma ham qabul qilinadi — chekni botga yuborasiz, admin tasdiqlaydi.',
    'faq.q4': 'Yillik to‘lovda qancha tejayman?',
    'faq.a4':
      'Yillik to‘lovda tarifga qarab 15–20% chegirma beriladi — bu deyarli 2 oy tekin foydalanish demakdir.',
    'faq.q5': 'To‘lovni qaytarib olsa bo‘ladimi?',
    'faq.a5':
      'Ha, agar xizmatdan foydalanmagan bo‘lsangiz, to‘lovdan keyingi 7 kun ichida qolgan muddat uchun pulni qaytaramiz. Buning uchun botga murojaat qiling.',

    'note.taxes': 'Narxlar UZS’da ko‘rsatilgan. Hisob-faktura kerak bo‘lsa botga yozing.',
  },

  ru: {
    title: 'Тарифы и оплата',
    subtitle: 'Выберите план под размер бизнеса — сменить можно в любой момент',

    'current.eyebrow': 'Ваш текущий тариф',
    'current.trial': 'Пробный период',
    'current.until': 'Действует до {date}',
    'current.expiredAt': 'Истёк {date}',
    'current.none': 'Активной подписки нет — выберите тариф ниже',
    'current.daysLeft': 'Срок тарифа',
    'current.daysValue': 'Осталось {n} дн.',
    'current.help': 'Помощь',

    'status.active': 'Активен',
    'status.pending': 'Ожидает оплаты',
    'status.expired': 'Истёк',
    'status.canceled': 'Отменён',

    'cycle.monthly': 'Помесячно',
    'cycle.yearly': 'На год',
    'cycle.save': 'При оплате за год скидка до {pct}%',
    'cycle.twoFree': '2 месяца бесплатно',

    'badge.popular': 'Популярный',
    'badge.best': 'Лучший',
    'card.current': 'Ваш тариф',
    'card.currentBtn': 'Текущий тариф',
    'card.chooseBtn': 'Выбрать тариф',
    'card.trialBtn': 'Начать бесплатно',
    'card.trialOnly': 'Даётся при регистрации',
    'card.free': 'Бесплатно',
    'card.trialDays': '{days} дней полного доступа',
    'card.perMonth': 'сум / в месяц',
    'card.monthlyNote': 'Списывается ежемесячно, отмена в любой момент',
    'card.billedYearly': '{total} в год',

    'limit.stores': 'Магазины',
    'limit.cabinets': 'Кабинеты Uzum',
    'limit.members': 'Участники команды',
    'limit.history': 'Глубина истории',
    'limit.historyValue': '{n} дней',
    'limit.sync': 'Синхронизация',
    'limit.syncValue': 'каждые {n} мин.',

    'access.full': 'Полный доступ',
    'access.preview': 'только просмотр',
    'access.off': 'Недоступно',

    'compare.title': 'Сравнение тарифов',
    'compare.subtitle': 'Как работает каждая возможность на разных тарифах',
    'compare.feature': 'Возможность',
    'compare.limits': 'Лимиты',

    'pay.title': 'Оформление тарифа {plan}',
    'pay.subtitle': 'Выберите срок и способ оплаты',
    'pay.months': 'Срок',
    'pay.m1': '1 мес.',
    'pay.m3': '3 мес.',
    'pay.m6': '6 мес.',
    'pay.m12': '12 мес.',
    'pay.yearlyHint': 'При оплате за 12 месяцев скидка {pct}% — почти 2 месяца в подарок',
    'pay.method': 'Способ оплаты',
    'pay.payme': 'Payme',
    'pay.paymeHint': 'Оплата в одно касание',
    'pay.click': 'Click',
    'pay.clickHint': 'Click Up или карта',
    'pay.manual': 'Переводом на карту',
    'pay.manualHint': 'Подтверждает администратор',
    'pay.bonus': 'Использовать реферальный бонус',
    'pay.bonusHint': 'Доступный бонус: {amount}',
    'pay.rowBase': 'Тариф × {n} мес.',
    'pay.rowDiscount': 'Скидка ({pct}%)',
    'pay.rowBonus': 'Реферальный бонус',
    'pay.total': 'Итого к оплате',
    'pay.twoMonthsFree': '2 месяца бесплатно — годовая оплата',
    'pay.note': 'После подтверждения оплаты тариф активируется сразу. Данные сохраняются.',
    'pay.cancel': 'Отмена',
    'pay.submit': 'Перейти к оплате',
    'pay.close': 'Закрыть',
    'pay.manualFooter': 'После подтверждения оплаты тариф активируется автоматически',
    'pay.opened': 'Страница оплаты открыта',
    'pay.openedBody': 'Вернитесь сюда после завершения оплаты',
    'pay.created': 'Счёт сформирован',
    'pay.createdBody': 'Оплатите по инструкции ниже',
    'pay.error': 'Не удалось начать оплату',
    'pay.copied': 'Скопировано',
    'pay.copy': 'Копировать',
    'pay.invoice': 'К оплате',
    'pay.invoiceNo': 'Номер счёта',
    'pay.card': 'Реквизиты карты',
    'pay.cardFromBot': 'Реквизиты выдаёт бот — отправьте номер счёта и получите карту для перевода.',
    'pay.s1': 'Переведите указанную сумму на карту.',
    'pay.s2': 'Отправьте чек в бот вместе с номером счёта.',
    'pay.s3': 'После подтверждения администратором тариф включится сразу.',
    'pay.adminConfirm': 'После оплаты подтверждает администратор — обычно в течение 15 минут.',
    'pay.openBot': 'Открыть Telegram-бот',

    'inv.title': 'История платежей',
    'inv.subtitle': 'Все счета и их статусы',
    'inv.date': 'Дата',
    'inv.plan': 'Тариф',
    'inv.months': 'Срок',
    'inv.monthsValue': '{n} мес.',
    'inv.amount': 'Сумма',
    'inv.method': 'Способ',
    'inv.status': 'Статус',
    'inv.pay': 'Оплатить',
    'inv.empty': 'Платежей пока нет',
    'inv.emptyHint': 'Счета появятся здесь после выбора тарифа',
    'inv.pending': 'Ожидает',
    'inv.paid': 'Оплачен',
    'inv.failed': 'Ошибка',
    'inv.canceled': 'Отменён',

    'plans.empty': 'Тарифы не найдены',
    'plans.emptyHint': 'Подождите немного или обновите страницу',

    'faq.title': 'Частые вопросы',
    'faq.subtitle': 'Самое важное про оплату и тарифы',
    'faq.q1': 'Как работает пробный период?',
    'faq.a1':
      'При регистрации вы получаете 7 дней бесплатного тарифа «Пробный». Карта не нужна — после окончания данные сохраняются, закрываются только продвинутые разделы.',
    'faq.q2': 'Можно ли сменить тариф в любой момент?',
    'faq.a2':
      'Да. Переход на более высокий тариф происходит сразу, остаток дней учитывается. Переход на более низкий — после окончания текущего периода.',
    'faq.q3': 'Какие способы оплаты доступны?',
    'faq.a3':
      'Онлайн через Payme и Click. Также принимаем перевод на карту — чек отправляете в бот, администратор подтверждает.',
    'faq.q4': 'Сколько экономлю при оплате за год?',
    'faq.a4': 'При годовой оплате скидка 15–20% в зависимости от тарифа — это почти 2 месяца бесплатно.',
    'faq.q5': 'Можно ли вернуть деньги?',
    'faq.a5':
      'Да. Если вы не пользовались сервисом, в течение 7 дней после оплаты вернём деньги за неиспользованный период. Напишите в бот.',

    'note.taxes': 'Цены указаны в UZS. Нужен счёт для бухгалтерии — напишите в бот.',
  },

  en: {
    title: 'Plans and billing',
    subtitle: 'Pick the plan that fits your business — change it whenever you like',

    'current.eyebrow': 'Your current plan',
    'current.trial': 'Trial period',
    'current.until': 'Active until {date}',
    'current.expiredAt': 'Expired on {date}',
    'current.none': 'No active subscription — choose a plan below',
    'current.daysLeft': 'Subscription period',
    'current.daysValue': '{n} days left',
    'current.help': 'Help',

    'status.active': 'Active',
    'status.pending': 'Awaiting payment',
    'status.expired': 'Expired',
    'status.canceled': 'Canceled',

    'cycle.monthly': 'Monthly',
    'cycle.yearly': 'Yearly',
    'cycle.save': 'Save up to {pct}% when paying yearly',
    'cycle.twoFree': '2 months free',

    'badge.popular': 'Popular',
    'badge.best': 'Best value',
    'card.current': 'Your plan',
    'card.currentBtn': 'Current plan',
    'card.chooseBtn': 'Choose plan',
    'card.trialBtn': 'Start for free',
    'card.trialOnly': 'Included at sign-up',
    'card.free': 'Free',
    'card.trialDays': '{days} days of full access',
    'card.perMonth': 'UZS / month',
    'card.monthlyNote': 'Billed monthly, cancel anytime',
    'card.billedYearly': '{total} per year',

    'limit.stores': 'Stores',
    'limit.cabinets': 'Uzum cabinets',
    'limit.members': 'Team members',
    'limit.history': 'History depth',
    'limit.historyValue': '{n} days',
    'limit.sync': 'Sync interval',
    'limit.syncValue': 'every {n} min',

    'access.full': 'Full access',
    'access.preview': 'view only',
    'access.off': 'Not included',

    'compare.title': 'Compare plans',
    'compare.subtitle': 'How every feature behaves on each plan',
    'compare.feature': 'Feature',
    'compare.limits': 'Limits',

    'pay.title': 'Subscribe to {plan}',
    'pay.subtitle': 'Choose the period and the payment method',
    'pay.months': 'Period',
    'pay.m1': '1 month',
    'pay.m3': '3 months',
    'pay.m6': '6 months',
    'pay.m12': '12 months',
    'pay.yearlyHint': 'Pay for 12 months and save {pct}% — almost 2 months free',
    'pay.method': 'Payment method',
    'pay.payme': 'Payme',
    'pay.paymeHint': 'One tap in the app',
    'pay.click': 'Click',
    'pay.clickHint': 'Click Up or a card',
    'pay.manual': 'Bank card transfer',
    'pay.manualHint': 'Confirmed by an admin',
    'pay.bonus': 'Apply referral bonus',
    'pay.bonusHint': 'Available bonus: {amount}',
    'pay.rowBase': 'Plan × {n} months',
    'pay.rowDiscount': 'Discount ({pct}%)',
    'pay.rowBonus': 'Referral bonus',
    'pay.total': 'Total',
    'pay.twoMonthsFree': '2 months free — yearly billing',
    'pay.note': 'The plan activates as soon as the payment is confirmed. Your data stays intact.',
    'pay.cancel': 'Cancel',
    'pay.submit': 'Continue to payment',
    'pay.close': 'Close',
    'pay.manualFooter': 'The plan activates automatically once the payment is confirmed',
    'pay.opened': 'Payment page opened',
    'pay.openedBody': 'Come back here once you finish the payment',
    'pay.created': 'Invoice created',
    'pay.createdBody': 'Follow the instructions below to pay',
    'pay.error': 'Could not start the payment',
    'pay.copied': 'Copied',
    'pay.copy': 'Copy',
    'pay.invoice': 'Amount due',
    'pay.invoiceNo': 'Invoice number',
    'pay.card': 'Card details',
    'pay.cardFromBot': 'The bot provides the card details — send it the invoice number to receive them.',
    'pay.s1': 'Transfer the amount above to the card.',
    'pay.s2': 'Send the receipt to the bot together with the invoice number.',
    'pay.s3': 'Once an admin confirms it, the plan switches on immediately.',
    'pay.adminConfirm': 'After the payment an admin confirms it — usually within 15 minutes.',
    'pay.openBot': 'Open the Telegram bot',

    'inv.title': 'Payment history',
    'inv.subtitle': 'Every invoice and its status',
    'inv.date': 'Date',
    'inv.plan': 'Plan',
    'inv.months': 'Period',
    'inv.monthsValue': '{n} mo',
    'inv.amount': 'Amount',
    'inv.method': 'Method',
    'inv.status': 'Status',
    'inv.pay': 'Pay',
    'inv.empty': 'No payments yet',
    'inv.emptyHint': 'Invoices appear here after you choose a plan',
    'inv.pending': 'Pending',
    'inv.paid': 'Paid',
    'inv.failed': 'Failed',
    'inv.canceled': 'Canceled',

    'plans.empty': 'No plans found',
    'plans.emptyHint': 'Please wait a moment or refresh the page',

    'faq.title': 'Frequently asked questions',
    'faq.subtitle': 'The essentials about billing and plans',
    'faq.q1': 'How does the trial work?',
    'faq.a1':
      'You get a 7-day free Trial plan when you sign up. No card required — when it ends your data stays, only the advanced sections lock.',
    'faq.q2': 'Can I change plans at any time?',
    'faq.a2':
      'Yes. Upgrading takes effect immediately and the remaining days are credited. Downgrading applies once the current period ends.',
    'faq.q3': 'Which payment methods are supported?',
    'faq.a3':
      'Payme and Click online. A card transfer also works — send the receipt to the bot and an admin confirms it.',
    'faq.q4': 'How much do I save on yearly billing?',
    'faq.a4': 'Yearly billing gives a 15–20% discount depending on the plan — nearly two months free.',
    'faq.q5': 'Can I get a refund?',
    'faq.a5':
      'Yes. If you have not used the service, we refund the unused period within 7 days of payment. Just message the bot.',

    'note.taxes': 'Prices are in UZS. Need an invoice for accounting? Message the bot.',
  },
});

const BOT_URL = BOT_URL_SHARED;
const MAX_DISCOUNT = Math.max(...PLAN_ORDER.map((id) => PLANS[id].yearlyDiscount));

const INVOICE_TONE: Record<InvoiceRow['status'], Tone> = {
  pending: 'warn',
  paid: 'brand',
  failed: 'danger',
  canceled: 'muted',
};

export default function Pricing() {
  const t = useT('pricing');
  const f = useFormat();
  const qc = useQueryClient();

  const limits = useSession((s) => s.me?.limits ?? null);
  const sessionSub = useSession((s) => s.me?.subscription ?? null);

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [checkoutPlan, setCheckoutPlan] = useState<PlanPublic | null>(null);

  const plansQ = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => api.get<PlanPublic[]>('/billing/plans'),
  });

  const subQ = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api.get<SubscriptionSummary>('/billing/subscription'),
  });

  const invoicesQ = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () => api.get<InvoiceRow[]>('/billing/invoices'),
  });

  const referralQ = useQuery({
    queryKey: ['referral'],
    queryFn: () => api.get<ReferralResponse>('/referral'),
    retry: false,
  });

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);
  const subscription = subQ.data ?? sessionSub;
  const currentPlanId = subscription?.plan ?? null;
  const bonus = Math.max(0, referralQ.data?.pending ?? 0);

  const currentPlanName =
    plans.find((p) => p.id === currentPlanId)?.name ?? (currentPlanId ? PLANS[currentPlanId].name : PLANS.trial.name);

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      key: 'createdAt',
      header: t('inv.date'),
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => <span className="tnum text-sm text-ink-soft">{f.date(r.createdAt)}</span>,
    },
    {
      key: 'plan',
      header: t('inv.plan'),
      render: (r) => (
        <span className="font-medium text-ink">{plans.find((p) => p.id === r.plan)?.name ?? PLANS[r.plan].name}</span>
      ),
    },
    {
      key: 'months',
      header: t('inv.months'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.months,
      render: (r) => t('inv.monthsValue', { n: r.months }),
    },
    {
      key: 'amount',
      header: t('inv.amount'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.amount,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.amount, r.currency)}</span>,
    },
    {
      key: 'provider',
      header: t('inv.method'),
      hideOnMobile: true,
      render: (r) => <span className="capitalize text-ink-soft">{r.provider}</span>,
    },
    {
      key: 'status',
      header: t('inv.status'),
      align: 'center',
      render: (r) => (
        <Badge tone={INVOICE_TONE[r.status]} dot>
          {t(`inv.${r.status}`)}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'pending' && r.payUrl ? (
          <a href={r.payUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="soft" iconRight={<ArrowUpRight className="h-3.5 w-3.5" />}>
              {t('inv.pay')}
            </Button>
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['billing'] });
    void qc.invalidateQueries({ queryKey: ['referral'] });
  };

  return (
    <>
      <PageHeader
        icon={<CreditCard className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={bonus > 0 ? <Badge tone="brand"><Gift className="h-3 w-3" />{f.money(bonus)}</Badge> : undefined}
        actions={
          <a href={BOT_URL} target="_blank" rel="noreferrer">
            <Button variant="outline" icon={<HelpCircle className="h-4 w-4" />}>
              {t('current.help')}
            </Button>
          </a>
        }
      />

      <div className="space-y-5">
        {/* ── Joriy tarif ── */}
        <CurrentPlanCard
          subscription={subscription}
          planName={currentPlanName}
          limits={limits}
          loading={subQ.isLoading && !sessionSub}
        />

        {/* ── Oylik / yillik ── */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <Segmented<BillingCycle>
            options={[
              { value: 'monthly', label: t('cycle.monthly') },
              { value: 'yearly', label: t('cycle.yearly') },
            ]}
            value={cycle}
            onChange={setCycle}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="chip bg-brand/12 text-brand">{t('cycle.save', { pct: MAX_DISCOUNT })}</span>
            {cycle === 'yearly' ? (
              <span className="chip bg-violet/12 text-violet">
                <Sparkles className="h-3 w-3" />
                {t('cycle.twoFree')}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── Tarif kartalari ── */}
        {plansQ.isError ? (
          <Card>
            <ErrorState
              message={plansQ.error instanceof Error ? plansQ.error.message : undefined}
              onRetry={() => void plansQ.refetch()}
            />
          </Card>
        ) : plansQ.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card p-6">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="mt-4 h-5 w-28" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-6 h-9 w-32" />
                <Skeleton className="mt-5 h-11 w-full" />
                <Skeleton className="mt-5 h-24 w-full" />
                <Skeleton className="mt-5 h-40 w-full" />
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <Card>
            <EmptyState icon={<CreditCard className="h-6 w-6" />} title={t('plans.empty')} hint={t('plans.emptyHint')} />
          </Card>
        ) : (
          <div className="grid gap-4 pt-3 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, i) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                cycle={cycle}
                index={i}
                isCurrent={plan.id === currentPlanId}
                onChoose={setCheckoutPlan}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted">{t('note.taxes')}</p>

        {/* ── Taqqoslash jadvali ── */}
        <Card className="overflow-hidden">
          <CardHeader
            icon={<Table2 className="h-4 w-4" />}
            title={t('compare.title')}
            subtitle={t('compare.subtitle')}
          />
          <div className="mt-4">
            {plansQ.isLoading ? (
              <div className="p-5">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : plans.length === 0 ? (
              <EmptyState icon={<Table2 className="h-6 w-6" />} title={t('plans.empty')} hint={t('plans.emptyHint')} />
            ) : (
              <CompareTable plans={plans} currentPlan={currentPlanId} />
            )}
          </div>
        </Card>

        {/* ── To'lovlar tarixi ── */}
        <Card className="overflow-hidden">
          <CardHeader
            icon={<ReceiptText className="h-4 w-4" />}
            title={t('inv.title')}
            subtitle={t('inv.subtitle')}
          />
          <div className="mt-4">
            {invoicesQ.isError ? (
              <ErrorState
                message={invoicesQ.error instanceof Error ? invoicesQ.error.message : undefined}
                onRetry={() => void invoicesQ.refetch()}
              />
            ) : (
              <DataTable
                columns={invoiceColumns}
                rows={invoices}
                rowKey={(r) => r.id}
                loading={invoicesQ.isLoading}
                density="compact"
                empty={
                  <EmptyState
                    icon={<ReceiptText className="h-6 w-6" />}
                    title={t('inv.empty')}
                    hint={t('inv.emptyHint')}
                  />
                }
              />
            )}
          </div>
        </Card>

        {/* ── FAQ ── */}
        <div>
          <div className="mb-4">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">{t('faq.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('faq.subtitle')}</p>
          </div>
          <PricingFaq />
        </div>
      </div>

      <CheckoutModal
        open={checkoutPlan !== null}
        plan={checkoutPlan}
        defaultMonths={(cycle === 'yearly' ? '12' : '1') as Months}
        bonus={bonus}
        onClose={() => setCheckoutPlan(null)}
        onPaid={refreshAll}
      />
    </>
  );
}
