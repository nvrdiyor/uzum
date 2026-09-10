import type { ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { registerNamespace, useLangStore, useT, type Lang } from '@/i18n';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';
import { Aurora, LandingLogo } from '@/components/landing/primitives';

/**
 * Kirish (auth) sahifalarining umumiy qobig'i va tarjimalari.
 * Login, AuthCallback va NotFound shu atomlardan foydalanadi.
 */

registerNamespace('auth', {
  uz: {
    'side.eyebrow': 'Kirish',
    'side.title': 'Uzum savdongiz — bitta tiniq panelda',
    'side.subtitle':
      'Telegram akkauntingiz orqali kiring. Parol o‘ylab topish ham, alohida ro‘yxatdan o‘tish ham shart emas.',
    'side.b1.t': 'Sof foyda va marja',
    'side.b1.d': 'Komissiya, logistika va soliqdan keyingi haqiqiy raqam — har bir SKU uchun.',
    'side.b2.t': 'Qoldiq tugash prognozi',
    'side.b2.d': 'Qaysi tovar necha kunga yetishini oldindan ko‘rib, yetkazmani o‘z vaqtida rejalashtirasiz.',
    'side.b3.t': 'Telegram’da bildirishnoma',
    'side.b3.d': 'Kunlik hisobot, salbiy sharh va tugayotgan qoldiq haqida darhol xabar.',
    'side.note': 'API kalitingiz AES-256 bilan shifrlangan holda saqlanadi',

    'card.title': 'Hisobingizga kirish',
    'card.subtitle': 'Telegram orqali — taxminan 10 soniyada.',
    'tab.telegram': 'Telegram',
    'tab.code': 'Bot kodi',

    'tg.hint': 'Tugmani bosing va Telegram’da tasdiqlang — hisobingiz avtomatik topiladi.',
    'tg.loading': 'Telegram tugmasi yuklanmoqda...',
    'tg.missing': 'Telegram tugmasi sozlanmagan',
    'tg.noDomain': 'Telegram tugmasi domen ulangandan keyin ishlaydi',
    'tg.noDomainHint':
      'Telegram xavfsizlik uchun haqiqiy domen talab qiladi — IP manzil bilan ishlamaydi. Hozircha “Bot kodi” orqali kiring: botda 🔑 “Saytga kirish” tugmasini bosing va 6 xonali kodni kiriting.',
    'tg.missingHint': 'VITE_BOT_USERNAME o‘zgaruvchisi ko‘rsatilmagan. Hozircha bot kodi orqali kiring.',
    'tg.failed': 'Telegram tugmasini yuklab bo‘lmadi. Internetni tekshiring yoki bot kodi orqali kiring.',
    'tg.safe1': 'Parol so‘ralmaydi',
    'tg.safe2': 'Faqat ism va Telegram ID olinadi',

    'code.hint': 'Botga /login yozing — u 6 xonali bir martalik kod yuboradi.',
    'code.label': 'Bir martalik kod',
    'code.submit': 'Kirish',
    'code.openBot': 'Botni ochish',
    'code.expire': 'Kod 10 daqiqa davomida amal qiladi.',

    'demo.btn': 'Namuna ma’lumot bilan ko‘rish',
    'demo.hint': 'Haqiqiy kabinet ulanmaydi — platformani namunaviy raqamlarda sinab ko‘rasiz.',
    or: 'yoki',

    'foot.noAccount': 'Hisobingiz yo‘qmi?',
    'foot.start': 'Botda /start bosing',
    'foot.back': 'Bosh sahifaga qaytish',
    'ref.badge': 'Taklif kodi: {code}',

    'toast.welcome': 'Xush kelibsiz!',
    'toast.error': 'Kirishda xatolik',
    'err.codeLen': '6 xonali kodni to‘liq kiriting',
    'err.demo': 'Demo rejim hozircha o‘chirilgan',

    'cb.title': 'Kirish tasdiqlanmoqda',
    'cb.subtitle': 'Bir necha soniya — hisobingizga o‘tkazamiz.',
    'cb.errTitle': 'Kirish amalga oshmadi',
    'cb.errNoToken':
      'Havolada kirish tokeni topilmadi. Havola to‘liq nusxalanmagan yoki muddati o‘tgan bo‘lishi mumkin.',
    'cb.errInvalid': 'Token qabul qilinmadi. Botdan yangi kirish havolasini oling.',
    'cb.toLogin': 'Kirish sahifasiga qaytish',
    'cb.home': 'Bosh sahifa',
  },

  ru: {
    'side.eyebrow': 'Вход',
    'side.title': 'Ваши продажи на Uzum — на одной понятной панели',
    'side.subtitle':
      'Входите через Telegram: не нужно придумывать пароль и отдельно проходить регистрацию.',
    'side.b1.t': 'Чистая прибыль и маржа',
    'side.b1.d': 'Реальная цифра после комиссии, логистики и налога — по каждому SKU.',
    'side.b2.t': 'Прогноз окончания остатка',
    'side.b2.d': 'Видно, на сколько дней хватит товара, — поставку планируете заранее.',
    'side.b3.t': 'Уведомления в Telegram',
    'side.b3.d': 'Ежедневный отчёт, негативный отзыв и заканчивающийся остаток — сразу.',
    'side.note': 'Ваш API-ключ хранится в зашифрованном виде (AES-256)',

    'card.title': 'Вход в аккаунт',
    'card.subtitle': 'Через Telegram — примерно за 10 секунд.',
    'tab.telegram': 'Telegram',
    'tab.code': 'Код из бота',

    'tg.hint': 'Нажмите кнопку и подтвердите в Telegram — аккаунт найдётся автоматически.',
    'tg.loading': 'Загружаем кнопку Telegram...',
    'tg.missing': 'Кнопка Telegram не настроена',
    'tg.noDomain': 'Кнопка Telegram заработает после подключения домена',
    'tg.noDomainHint':
      'Telegram требует настоящий домен — с IP-адресом вход через виджет не работает. Пока войдите через «Код бота»: нажмите в боте 🔑 «Вход на сайт» и введите 6-значный код.',
    'tg.missingHint': 'Переменная VITE_BOT_USERNAME не задана. Пока войдите по коду из бота.',
    'tg.failed': 'Не удалось загрузить кнопку Telegram. Проверьте интернет или войдите по коду.',
    'tg.safe1': 'Пароль не спрашиваем',
    'tg.safe2': 'Берём только имя и Telegram ID',

    'code.hint': 'Отправьте боту /login — он пришлёт 6-значный одноразовый код.',
    'code.label': 'Одноразовый код',
    'code.submit': 'Войти',
    'code.openBot': 'Открыть бота',
    'code.expire': 'Код действует 10 минут.',

    'demo.btn': 'Посмотреть на демо-данных',
    'demo.hint': 'Реальный кабинет не подключается — это просто пример цифр.',
    or: 'или',

    'foot.noAccount': 'Ещё нет аккаунта?',
    'foot.start': 'Нажмите /start в боте',
    'foot.back': 'Вернуться на главную',
    'ref.badge': 'Реферальный код: {code}',

    'toast.welcome': 'Добро пожаловать!',
    'toast.error': 'Не удалось войти',
    'err.codeLen': 'Введите все 6 цифр кода',
    'err.demo': 'Демо-режим сейчас отключён',

    'cb.title': 'Подтверждаем вход',
    'cb.subtitle': 'Несколько секунд — и вы в аккаунте.',
    'cb.errTitle': 'Войти не удалось',
    'cb.errNoToken': 'В ссылке нет токена входа. Возможно, она скопирована не полностью или устарела.',
    'cb.errInvalid': 'Токен не принят. Получите новую ссылку для входа в боте.',
    'cb.toLogin': 'Вернуться ко входу',
    'cb.home': 'На главную',
  },

  en: {
    'side.eyebrow': 'Sign in',
    'side.title': 'Your Uzum sales on one clear dashboard',
    'side.subtitle': 'Sign in with Telegram — no password to invent, no separate registration.',
    'side.b1.t': 'Net profit and margin',
    'side.b1.d': 'The real number after commission, logistics and tax — for every SKU.',
    'side.b2.t': 'Stock-out forecast',
    'side.b2.d': 'See how many days each item will last and plan the next shipment in time.',
    'side.b3.t': 'Telegram notifications',
    'side.b3.d': 'Daily report, negative reviews and low stock — the moment it happens.',
    'side.note': 'Your API key is stored encrypted with AES-256',

    'card.title': 'Sign in to your account',
    'card.subtitle': 'With Telegram — about 10 seconds.',
    'tab.telegram': 'Telegram',
    'tab.code': 'Bot code',

    'tg.hint': 'Press the button and confirm in Telegram — your account is found automatically.',
    'tg.loading': 'Loading the Telegram button...',
    'tg.missing': 'Telegram button is not configured',
    'tg.noDomain': 'The Telegram button works once a domain is connected',
    'tg.noDomainHint':
      'Telegram requires a real domain — the widget cannot run on a bare IP address. For now use “Bot code”: tap 🔑 “Log in to the site” in the bot and enter the 6-digit code.',
    'tg.missingHint': 'VITE_BOT_USERNAME is not set. Use the bot code for now.',
    'tg.failed': 'The Telegram button could not load. Check your connection or use the bot code.',
    'tg.safe1': 'No password is requested',
    'tg.safe2': 'Only your name and Telegram ID are used',

    'code.hint': 'Send /login to the bot — it replies with a 6-digit one-time code.',
    'code.label': 'One-time code',
    'code.submit': 'Sign in',
    'code.openBot': 'Open the bot',
    'code.expire': 'The code is valid for 10 minutes.',

    'demo.btn': 'Explore with sample data',
    'demo.hint': 'No real cabinet is connected — you simply try the platform on sample numbers.',
    or: 'or',

    'foot.noAccount': 'No account yet?',
    'foot.start': 'Send /start to the bot',
    'foot.back': 'Back to the home page',
    'ref.badge': 'Referral code: {code}',

    'toast.welcome': 'Welcome!',
    'toast.error': 'Sign-in failed',
    'err.codeLen': 'Enter all 6 digits of the code',
    'err.demo': 'Demo mode is currently disabled',

    'cb.title': 'Confirming your sign-in',
    'cb.subtitle': 'A few seconds — and you are in.',
    'cb.errTitle': 'Sign-in failed',
    'cb.errNoToken': 'No sign-in token in the link. It may be incomplete or expired.',
    'cb.errInvalid': 'The token was rejected. Get a fresh sign-in link from the bot.',
    'cb.toLogin': 'Back to sign-in',
    'cb.home': 'Home page',
  },
});

const LANGS: Lang[] = ['uz', 'ru', 'en'];

/** Kichik til almashtirgich (landing headeridagi bilan bir xil ko'rinishda) */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div className={cn('inline-flex items-center rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            'rounded-lg px-2 py-1 text-2xs font-bold uppercase tracking-wide transition-all duration-200',
            lang === l ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Yuqori qator: logo + til + mavzu */
export function AuthTopBar() {
  const tc = useT('common');
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);

  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <LandingLogo />
      <div className="flex items-center gap-2">
        <LangSwitch />
        <IconButton onClick={toggleTheme} label={theme === 'dark' ? tc('theme.light') : tc('theme.dark')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
      </div>
    </header>
  );
}

/** Aurora fonli to'liq ekran qobig'i */
export function AuthShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-bg text-ink">
      <Aurora />
      <AuthTopBar />
      <main className={cn('relative z-10 flex flex-1 items-center px-5 pb-12 pt-2 sm:px-8', className)}>
        {children}
      </main>
    </div>
  );
}

/** Nozik "yoki" ajratgichi */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Chapdagi brend bloki uchun bitta afzallik qatori */
export function BenefitRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-bold tracking-tight text-ink">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{text}</span>
      </span>
    </li>
  );
}

/** Yuklanish/kutish holati uchun "pulsatsiyalanuvchi" logo */
export function PulseLogo({ size = 64 }: { size?: number }) {
  return (
    <span
      className="relative flex items-center justify-center rounded-2xl bg-brand-grad text-bg shadow-[0_16px_40px_-16px_rgb(var(--c-brand)/0.95)]"
      style={{ width: size, height: size }}
    >
      <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-2xl bg-brand/40" />
      <svg
        viewBox="0 0 24 24"
        className="relative"
        style={{ width: size * 0.5, height: size * 0.5 }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2 15h3.5L8 7l3.5 11L14 12h2" />
        <circle cx="19.5" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
