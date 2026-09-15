import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { APP } from '@savdoiq/shared';
import { toast } from '@/components/ui';
import { OnboardStepper, type OnboardStepKey } from '@/components/onboarding/Stepper';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { CompanyStep } from '@/components/onboarding/CompanyStep';
import { ApiKeyStep } from '@/components/onboarding/ApiKeyStep';
import { SyncStep } from '@/components/onboarding/SyncStep';
import { useSession } from '@/store/session';
import { registerNamespace, useLangStore, useT, type Lang } from '@/i18n';
import { BOT_URL as BOT_URL_SHARED, BOT_HANDLE } from '@/lib/bot';
import { cn } from '@/lib/utils';

registerNamespace('onboarding', {
  uz: {
    'shell.seller': 'Sotuvchi',
    'shell.tagline': 'Uzum Market sotuvchilari uchun analitika',
    'shell.support': 'Yordam',
    'step.company': 'Kompaniya',
    'step.apiKey': 'API kalit',
    'step.sync': 'Sinxronizatsiya',

    'welcome.badge': 'Sozlash 3 qadamda',
    'welcome.hello': 'Salom, {name}!',
    'welcome.subtitle':
      'Bir necha daqiqada kabinetingizni ulaymiz — keyin sotuv, foyda va qoldiqlaringiz bir joyda ko’rinadi.',
    'welcome.c.title': 'Kompaniya',
    'welcome.c.body': 'Nomi va soliq stavkasi — foyda to’g’ri hisoblanishi uchun.',
    'welcome.k.title': 'API kalit',
    'welcome.k.body': 'Uzum kabinetidan faqat o’qish uchun kalit olasiz.',
    'welcome.s.title': 'Sinxronizatsiya',
    'welcome.s.body': 'Barcha tarixni yig’amiz — taxminan 30 daqiqa.',
    'welcome.start': 'Boshlash',
    'welcome.time': 'Sozlash ~2 daqiqa, dastlabki ma’lumot yig’ish ~30 daqiqa',

    'company.title': 'Kompaniya ma’lumotlari',
    'company.subtitle': 'Hisob-kitoblar shu ma’lumotlar asosida yuritiladi.',
    'company.prefilled': 'Botda kiritgan ma’lumotlaringiz oldindan to’ldirildi — kerak bo’lsa o’zgartiring.',
    'company.name': 'Kompaniya nomi',
    'company.namePh': 'Masalan: Alfa Trade MChJ',
    'company.tax': 'Soliq stavkasi',
    'company.taxHint': 'Aylanma soliq odatda 4%, QQS to’lovchilar uchun 12%. Bilmasangiz 0 qoldiring.',
    'company.next': 'Davom etish',
    'company.errName': 'Kompaniya nomi kamida 2 ta belgidan iborat bo’lsin',
    'company.errSave': 'Saqlab bo’lmadi — birozdan so’ng qayta urinib ko’ring',

    'api.guideTitle': 'API kalitni qanday olish kerak',
    'api.guideSubtitle': 'Uzum sotuvchi kabinetida 1 daqiqada bajariladi.',
    'api.s1.title': 'seller.uzum.uz saytiga kiring',
    'api.s1.body': 'Do’koningiz biriktirilgan hisob bilan tizimga kiring.',
    'api.s2.title': '“Mening profilim” bo’limini oching',
    'api.s2.body': 'O’ng yuqoridagi ism/avatar orqali profilga o’ting.',
    'api.s3.title': '“API kalitlar” yorlig’ini tanlang',
    'api.s3.body': 'Profil sozlamalari ichidagi API kalitlar bo’limi.',
    'api.s4.title': 'Yangi kalit yarating',
    'api.s4.body': '“Yaratish” tugmasini bosing va nom bering (masalan, SavdoIQ).',
    'api.s5.title': 'Kalitni nusxalang',
    'api.s5.body': 'Kalit faqat bir marta to’liq ko’rsatiladi — nusxalab, quyiga qo’ying.',
    'api.open': 'seller.uzum.uz ni ochish',

    'api.formTitle': 'Kabinetni ulash',
    'api.formSubtitle': 'Kalitni kiriting — biz uni tekshirib, ma’lumot yig’ishni boshlaymiz.',
    'api.label': 'Kabinet nomi',
    'api.labelPh': 'Masalan: Asosiy kabinet',
    'api.labelDefault': 'Asosiy kabinet',
    'api.key': 'API kalit',
    'api.keyPh': 'Kalitni shu yerga qo’ying',
    'api.show': 'Ko’rsatish',
    'api.hide': 'Yashirish',
    'api.submit': 'Kalitni ulash',
    'api.errKey': 'Kalit juda qisqa — to’liq nusxalanganini tekshiring',
    'api.errSave': 'Kalitni ulab bo’lmadi — kalitni tekshirib, qayta urining',
    'api.secure.title': 'Kalit xavfsiz saqlanadi',
    'api.secure.body':
      'Kalit AES-256 bilan shifrlanadi va faqat o’qish uchun ishlatiladi. Biz hech qachon narx yoki qoldiqni o’zgartirmaymiz.',
    'api.found': 'Kabinet topildi: {label}',
    'api.foundHint': 'Botda yuborgan kalitingiz allaqachon ulangan.',
    'api.continue': 'Davom etish',

    'api.alt.title': 'Muqobil yo’llar',
    'api.alt.bot': 'Botda yuborgan bo’lsangiz',
    'api.alt.botBody': 'Telegram botga yuborilgan kalit avtomatik ulanadi — tekshirib ko’ring.',
    'api.alt.check': 'Tekshirish',
    'api.alt.notFound': 'Hozircha ulangan kabinet topilmadi.',
    'api.alt.demo': 'Avval ko’rib chiqmoqchimisiz?',
    'api.alt.demoBody': 'Namunaviy ma’lumot bilan barcha hisobotlarni sinab ko’ring, kalitni keyin ulaysiz.',
    'api.alt.demoBtn': 'Demo ma’lumot bilan davom etish',
    'api.demoLabel': 'Demo kabinet',

    'sync.title': 'Ma’lumot yig’ilmoqda',
    'sync.subtitle': 'Birinchi to’liq yig’ish uzoqroq davom etadi — keyingilari bir necha daqiqada tugaydi.',
    'sync.ring': 'Ma’lumot yig’ilmoqda',
    'sync.eta': 'Taxminan {time} qoldi',
    'sync.etaSoon': 'Yakunlanmoqda...',
    'sync.stepOf': '{n}-bosqich / {total}',
    'sync.stepsTitle': 'Bosqichlar',
    'sync.meanwhile.title': 'Shu vaqtda nima qilish mumkin?',
    'sync.meanwhile.b1': 'Saytni yopishingiz mumkin — tayyor bo’lganda Telegram’ga xabar keladi.',
    'sync.meanwhile.b2': 'Tannarxni kiritib qo’ying — foyda va marja aniqroq hisoblanadi.',
    'sync.meanwhile.b3': 'Dashboard’ni hozir ochib, yig’ilgan qismini ko’rishingiz mumkin.',
    'sync.openDashboard': 'Dashboard’ni hozir ochish',
    'sync.partial': 'Qisman ma’lumot bilan',
    'sync.failed.title': 'Sinxronizatsiya to’xtadi',
    'sync.failed.body': 'Kalit yaroqsiz yoki Uzum serveri javob bermadi. Qayta urinib ko’ring.',
    'sync.retry': 'Qayta urinish',
    'sync.support': 'Qo’llab-quvvatlash',
    'sync.idleBtn': 'Sinxronizatsiyani boshlash',
    'sync.done.title': 'Tayyor!',
    'sync.done.body': 'Barcha ma’lumot yig’ildi. Dashboard ochilmoqda...',
    'sync.done.btn': 'Dashboard’ga o’tish',
    'sync.errStatus': 'Sinxronizatsiya holatini olib bo’lmadi',
    'sync.errStart': 'Sinxronizatsiyani boshlab bo’lmadi',

    'toast.companySaved': 'Kompaniya ma’lumotlari saqlandi',
    'toast.keyConnected': 'Kabinet ulandi — ma’lumot yig’ish boshlandi',
  },
  ru: {
    'shell.seller': 'Продавец',
    'shell.tagline': 'Аналитика для селлеров Uzum Market',
    'shell.support': 'Помощь',
    'step.company': 'Компания',
    'step.apiKey': 'API-ключ',
    'step.sync': 'Синхронизация',

    'welcome.badge': 'Настройка в 3 шага',
    'welcome.hello': 'Привет, {name}!',
    'welcome.subtitle':
      'За пару минут подключим ваш кабинет — после этого продажи, прибыль и остатки будут в одном месте.',
    'welcome.c.title': 'Компания',
    'welcome.c.body': 'Название и ставка налога — чтобы прибыль считалась верно.',
    'welcome.k.title': 'API-ключ',
    'welcome.k.body': 'Получите ключ только на чтение в кабинете Uzum.',
    'welcome.s.title': 'Синхронизация',
    'welcome.s.body': 'Соберём всю историю — примерно 30 минут.',
    'welcome.start': 'Начать',
    'welcome.time': 'Настройка ~2 минуты, первичный сбор данных ~30 минут',

    'company.title': 'Данные компании',
    'company.subtitle': 'На их основе строятся все расчёты.',
    'company.prefilled': 'Данные из бота подставлены автоматически — при необходимости измените.',
    'company.name': 'Название компании',
    'company.namePh': 'Например: Alfa Trade ООО',
    'company.tax': 'Ставка налога',
    'company.taxHint': 'Налог с оборота обычно 4%, для плательщиков НДС — 12%. Если не знаете, оставьте 0.',
    'company.next': 'Продолжить',
    'company.errName': 'Название должно содержать минимум 2 символа',
    'company.errSave': 'Не удалось сохранить — попробуйте ещё раз',

    'api.guideTitle': 'Как получить API-ключ',
    'api.guideSubtitle': 'В кабинете продавца Uzum это занимает минуту.',
    'api.s1.title': 'Зайдите на seller.uzum.uz',
    'api.s1.body': 'Войдите под аккаунтом, к которому привязан магазин.',
    'api.s2.title': 'Откройте «Мой профиль»',
    'api.s2.body': 'Профиль доступен по имени/аватару справа сверху.',
    'api.s3.title': 'Выберите вкладку «API-ключи»',
    'api.s3.body': 'Раздел находится внутри настроек профиля.',
    'api.s4.title': 'Создайте новый ключ',
    'api.s4.body': 'Нажмите «Создать» и задайте название (например, SavdoIQ).',
    'api.s5.title': 'Скопируйте ключ',
    'api.s5.body': 'Ключ показывается полностью только один раз — скопируйте и вставьте ниже.',
    'api.open': 'Открыть seller.uzum.uz',

    'api.formTitle': 'Подключение кабинета',
    'api.formSubtitle': 'Введите ключ — мы проверим его и запустим сбор данных.',
    'api.label': 'Название кабинета',
    'api.labelPh': 'Например: Основной кабинет',
    'api.labelDefault': 'Основной кабинет',
    'api.key': 'API-ключ',
    'api.keyPh': 'Вставьте ключ сюда',
    'api.show': 'Показать',
    'api.hide': 'Скрыть',
    'api.submit': 'Подключить ключ',
    'api.errKey': 'Ключ слишком короткий — проверьте, что скопирован полностью',
    'api.errSave': 'Не удалось подключить ключ — проверьте его и повторите',
    'api.secure.title': 'Ключ хранится безопасно',
    'api.secure.body':
      'Ключ шифруется алгоритмом AES-256 и используется только для чтения. Мы никогда не меняем цены и остатки.',
    'api.found': 'Кабинет найден: {label}',
    'api.foundHint': 'Ключ, отправленный в бот, уже подключён.',
    'api.continue': 'Продолжить',

    'api.alt.title': 'Другие варианты',
    'api.alt.bot': 'Если отправляли ключ в бот',
    'api.alt.botBody': 'Ключ из Telegram-бота подключается автоматически — проверьте.',
    'api.alt.check': 'Проверить',
    'api.alt.notFound': 'Подключённых кабинетов пока не найдено.',
    'api.alt.demo': 'Хотите сначала осмотреться?',
    'api.alt.demoBody': 'Посмотрите все отчёты на демо-данных, а ключ подключите позже.',
    'api.alt.demoBtn': 'Продолжить с демо-данными',
    'api.demoLabel': 'Демо-кабинет',

    'sync.title': 'Собираем данные',
    'sync.subtitle': 'Первый полный сбор длится дольше — последующие занимают несколько минут.',
    'sync.ring': 'Собираем данные',
    'sync.eta': 'Осталось примерно {time}',
    'sync.etaSoon': 'Завершаем...',
    'sync.stepOf': 'Этап {n} / {total}',
    'sync.stepsTitle': 'Этапы',
    'sync.meanwhile.title': 'Что можно сделать пока?',
    'sync.meanwhile.b1': 'Можете закрыть сайт — когда всё будет готово, придёт сообщение в Telegram.',
    'sync.meanwhile.b2': 'Заполните себестоимость — прибыль и маржа посчитаются точнее.',
    'sync.meanwhile.b3': 'Можно открыть дашборд уже сейчас и посмотреть собранную часть.',
    'sync.openDashboard': 'Открыть дашборд сейчас',
    'sync.partial': 'С частичными данными',
    'sync.failed.title': 'Синхронизация остановилась',
    'sync.failed.body': 'Ключ недействителен или сервер Uzum не ответил. Попробуйте ещё раз.',
    'sync.retry': 'Повторить',
    'sync.support': 'Поддержка',
    'sync.idleBtn': 'Запустить синхронизацию',
    'sync.done.title': 'Готово!',
    'sync.done.body': 'Все данные собраны. Открываем дашборд...',
    'sync.done.btn': 'Перейти в дашборд',
    'sync.errStatus': 'Не удалось получить статус синхронизации',
    'sync.errStart': 'Не удалось запустить синхронизацию',

    'toast.companySaved': 'Данные компании сохранены',
    'toast.keyConnected': 'Кабинет подключён — начался сбор данных',
  },
  en: {
    'shell.seller': 'Seller',
    'shell.tagline': 'Analytics for Uzum Market sellers',
    'shell.support': 'Help',
    'step.company': 'Company',
    'step.apiKey': 'API key',
    'step.sync': 'Sync',

    'welcome.badge': 'Setup in 3 steps',
    'welcome.hello': 'Hi, {name}!',
    'welcome.subtitle':
      'We will connect your cabinet in a couple of minutes — then sales, profit and stock live in one place.',
    'welcome.c.title': 'Company',
    'welcome.c.body': 'Name and tax rate, so profit is calculated correctly.',
    'welcome.k.title': 'API key',
    'welcome.k.body': 'Create a read-only key in your Uzum seller cabinet.',
    'welcome.s.title': 'Sync',
    'welcome.s.body': 'We import your full history — about 30 minutes.',
    'welcome.start': 'Get started',
    'welcome.time': 'Setup takes ~2 minutes, the first data import ~30 minutes',

    'company.title': 'Company details',
    'company.subtitle': 'Every calculation is based on these values.',
    'company.prefilled': 'We pre-filled what you entered in the bot — change it if needed.',
    'company.name': 'Company name',
    'company.namePh': 'For example: Alfa Trade LLC',
    'company.tax': 'Tax rate',
    'company.taxHint': 'Turnover tax is usually 4%, VAT payers use 12%. Leave 0 if you are not sure.',
    'company.next': 'Continue',
    'company.errName': 'The company name needs at least 2 characters',
    'company.errSave': 'Could not save — please try again',

    'api.guideTitle': 'How to get your API key',
    'api.guideSubtitle': 'It takes about a minute in the Uzum seller cabinet.',
    'api.s1.title': 'Open seller.uzum.uz',
    'api.s1.body': 'Sign in with the account your shop belongs to.',
    'api.s2.title': 'Go to “My profile”',
    'api.s2.body': 'Use your name or avatar in the top-right corner.',
    'api.s3.title': 'Pick the “API keys” tab',
    'api.s3.body': 'You will find it inside the profile settings.',
    'api.s4.title': 'Create a new key',
    'api.s4.body': 'Press “Create” and give it a name (for example, SavdoIQ).',
    'api.s5.title': 'Copy the key',
    'api.s5.body': 'The full key is shown only once — copy it and paste it below.',
    'api.open': 'Open seller.uzum.uz',

    'api.formTitle': 'Connect the cabinet',
    'api.formSubtitle': 'Paste the key — we verify it and start importing your data.',
    'api.label': 'Cabinet name',
    'api.labelPh': 'For example: Main cabinet',
    'api.labelDefault': 'Main cabinet',
    'api.key': 'API key',
    'api.keyPh': 'Paste your key here',
    'api.show': 'Show',
    'api.hide': 'Hide',
    'api.submit': 'Connect key',
    'api.errKey': 'That key looks too short — check that you copied all of it',
    'api.errSave': 'Could not connect the key — check it and try again',
    'api.secure.title': 'Your key is stored safely',
    'api.secure.body':
      'The key is encrypted with AES-256 and used for reading only. We never change your prices or stock.',
    'api.found': 'Cabinet found: {label}',
    'api.foundHint': 'The key you sent to the bot is already connected.',
    'api.continue': 'Continue',

    'api.alt.title': 'Other options',
    'api.alt.bot': 'Sent the key to the bot?',
    'api.alt.botBody': 'A key sent to the Telegram bot connects automatically — check for it.',
    'api.alt.check': 'Check',
    'api.alt.notFound': 'No connected cabinet found yet.',
    'api.alt.demo': 'Want to look around first?',
    'api.alt.demoBody': 'Explore every report on demo data and connect your key later.',
    'api.alt.demoBtn': 'Continue with demo data',
    'api.demoLabel': 'Demo cabinet',

    'sync.title': 'Collecting your data',
    'sync.subtitle': 'The first full import takes longer — later syncs finish within minutes.',
    'sync.ring': 'Collecting data',
    'sync.eta': 'About {time} left',
    'sync.etaSoon': 'Finishing up...',
    'sync.stepOf': 'Step {n} of {total}',
    'sync.stepsTitle': 'Steps',
    'sync.meanwhile.title': 'What can you do meanwhile?',
    'sync.meanwhile.b1': 'You can close the site — we will message you on Telegram when it is ready.',
    'sync.meanwhile.b2': 'Fill in your cost prices so profit and margin come out accurate.',
    'sync.meanwhile.b3': 'Open the dashboard now to see the part that is already imported.',
    'sync.openDashboard': 'Open the dashboard now',
    'sync.partial': 'With partial data',
    'sync.failed.title': 'Sync stopped',
    'sync.failed.body': 'The key is invalid or Uzum did not respond. Please try again.',
    'sync.retry': 'Try again',
    'sync.support': 'Support',
    'sync.idleBtn': 'Start sync',
    'sync.done.title': 'All set!',
    'sync.done.body': 'Everything is imported. Opening your dashboard...',
    'sync.done.btn': 'Go to dashboard',
    'sync.errStatus': 'Could not load the sync status',
    'sync.errStart': 'Could not start the sync',

    'toast.companySaved': 'Company details saved',
    'toast.keyConnected': 'Cabinet connected — the import has started',
  },
});

type UiStep = 'welcome' | 'company' | 'api_key' | 'syncing';

const LANGS: Lang[] = ['uz', 'ru', 'en'];

const SUPPORT_URL = BOT_URL_SHARED;

/** Onboarding bosqichini progress indikatoridagi qadamga bog'laydi */
const STEPPER_KEY: Record<UiStep, OnboardStepKey> = {
  welcome: 'company',
  company: 'company',
  api_key: 'api_key',
  syncing: 'syncing',
};

export default function Onboarding() {
  const t = useT('onboarding');
  const navigate = useNavigate();

  const me = useSession((s) => s.me);
  const load = useSession((s) => s.load);
  const patchMe = useSession((s) => s.patchMe);

  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  const company = me?.company ?? null;

  const [step, setStep] = useState<UiStep>(() => {
    const s = me?.company?.onboardStep;
    if (s === 'syncing') return 'syncing';
    if (s === 'api_key') return 'api_key';
    return 'welcome';
  });

  // Onboarding allaqachon tugagan bo'lsa — bu sahifada ushlab turmaymiz
  useEffect(() => {
    if (company?.onboardStep === 'done') navigate('/dashboard', { replace: true });
  }, [company?.onboardStep, navigate]);

  const goCompany = useCallback(() => setStep('company'), []);

  const companySaved = useCallback(async () => {
    toast.success(t('toast.companySaved'));
    await load();
    setStep('api_key');
  }, [load, t]);

  const keyConnected = useCallback(async () => {
    toast.success(t('toast.keyConnected'));
    await load();
    setStep('syncing');
  }, [load, t]);

  /**
   * "Dashboard'ni hozir ochish" — sinxron tugamasdan qisman ma'lumot bilan kirish.
   * Marshrut qorovuli `onboardStep !== 'done'` bo'lsa qaytarib yuboradi, shuning uchun
   * sessiyani faqat brauzer xotirasida "tugallangan" deb belgilaymiz (serverda o'zgarmaydi).
   */
  const openDashboard = useCallback(() => {
    const current = useSession.getState().me;
    if (current?.company) {
      patchMe({ company: { ...current.company, onboardStep: 'done', onboarded: true } });
    }
    navigate('/dashboard');
  }, [navigate, patchMe]);

  const finished = useCallback(async () => {
    await load();
    navigate('/dashboard', { replace: true });
  }, [load, navigate]);

  // Bolalar komponentlarga barqaror (referensi o'zgarmaydigan) qayta chaqiruvlar beriladi —
  // aks holda SyncStep'dagi taymer har renderda qayta ishga tushardi.
  const handleCompanySaved = useCallback(() => {
    void companySaved();
  }, [companySaved]);
  const handleKeyConnected = useCallback(() => {
    void keyConnected();
  }, [keyConnected]);
  const handleFinished = useCallback(() => {
    void finished();
  }, [finished]);

  const firstName = me?.user.firstName?.trim() || me?.user.username || t('shell.seller');
  const wide = step === 'api_key' || step === 'syncing';

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Yuqori panel ─────────────────────────────────────── */}
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M2 15h3.5L8 7l3.5 11L14 12h2" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-extrabold tracking-tight text-ink">{APP.name}</p>
              <p className="truncate text-2xs text-muted">{t('shell.tagline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-1">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    'rounded-lg px-2 py-1 text-2xs font-bold uppercase transition-colors',
                    l === lang ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              <LifeBuoy className="h-3.5 w-3.5" />
              {t('shell.support')}
            </a>
          </div>
        </div>
      </header>

      {/* ── Mazmun ───────────────────────────────────────────── */}
      <main
        className={cn(
          'mx-auto w-full px-4 py-6 sm:px-6 sm:py-10',
          wide ? 'max-w-5xl' : 'max-w-2xl',
        )}
      >
        <OnboardStepper
          current={STEPPER_KEY[step]}
          labels={{
            company: t('step.company'),
            api_key: t('step.apiKey'),
            syncing: t('step.sync'),
          }}
          className="mb-6"
        />

        {step === 'welcome' ? <WelcomeStep name={firstName} onStart={goCompany} /> : null}

        {step === 'company' ? (
          <CompanyStep
            initialName={company?.name ?? ''}
            initialTaxRate={company?.taxRate ?? 0}
            prefilled={Boolean(company?.name)}
            onDone={() => void companySaved()}
          />
        ) : null}

        {step === 'api_key' ? <ApiKeyStep onConnected={() => void keyConnected()} /> : null}

        {step === 'syncing' ? (
          <SyncStep onOpenDashboard={openDashboard} onFinished={() => void finished()} />
        ) : null}

        <p className="mt-8 text-center text-2xs text-muted">
          {APP.name} · {BOT_HANDLE}
        </p>
      </main>
    </div>
  );
}
