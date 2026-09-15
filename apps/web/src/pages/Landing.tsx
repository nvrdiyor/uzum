import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BellRing,
  FileSpreadsheet,
  Layers,
  PackageX,
  PieChart,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import {
  Aurora,
  EASE,
  FadeUp,
  GridPattern,
  LandingLogo,
  Section,
  SectionHead,
  SoftDivider,
  TelegramIcon,
  scrollToId,
} from '@/components/landing/primitives';
import { LandingHeader } from '@/components/landing/Header';
import { HeroMock } from '@/components/landing/HeroMock';
import { LandingPricing } from '@/components/landing/Pricing';
import { LandingFaq } from '@/components/landing/Faq';
import { LandingFooter } from '@/components/landing/Footer';

registerNamespace('landing', {
  uz: {
    'nav.features': 'Imkoniyatlar',
    'nav.how': 'Qanday ishlaydi',
    'nav.pricing': 'Tariflar',
    'nav.faq': 'Savol-javob',
    'nav.login': 'Kirish',
    'nav.menu': 'Menyu',

    'hero.badge': '7 kun bepul — karta talab qilinmaydi',
    'hero.title': 'Uzum’dagi savdongizni raqamlarda ko‘ring',
    'hero.subtitle':
      'SavdoIQ Uzum Market kabinetingizni ulaydi va sotuv, sof foyda, qoldiq, unit-iqtisod hamda yo‘qotishlarni bitta tiniq panelda ko‘rsatadi. Endi Excel bilan tunlab ovora bo‘lish shart emas.',
    'hero.ctaPrimary': 'Telegram orqali boshlash',
    'hero.ctaSecondary': 'Tariflarni ko‘rish',
    'hero.note': 'Ulanish 2 daqiqa · To‘liq tahlil 30 daqiqada tayyor',
    'hero.p1': 'Har bir SKU bo‘yicha sof foyda',
    'hero.p2': 'Qoldiq tugash prognozi',
    'hero.p3': 'Telegram’da kunlik hisobot',

    'mock.title': 'Boshqaruv paneli',
    'mock.period': 'Oxirgi 14 kun',
    'mock.revenue': 'Tushum',
    'mock.profit': 'Sof foyda',
    'mock.margin': 'Marja',
    'mock.chart': 'Tushum va foyda dinamikasi',
    'mock.top': 'Eng foydali mahsulotlar',
    'mock.units': 'dona',
    'mock.live': 'Jonli ma’lumot',

    'trust.a.v': '30 daqiqa',
    'trust.a.l': 'To‘liq tahlil tayyor bo‘ladi',
    'trust.b.v': '24/7',
    'trust.b.l': 'Telegram’da bildirishnomalar',
    'trust.c.v': '25+',
    'trust.c.l': 'Hisobot va tahlil bo‘limi',
    'trust.d.v': '3 til',
    'trust.d.l': 'O‘zbek, rus va ingliz',

    'features.eyebrow': 'Imkoniyatlar',
    'features.title': 'Sotuvchiga kerak bo‘lgan hamma narsa',
    'features.subtitle':
      'Buyurtmadan sof foydagacha — bitta hisobda. Har bir raqam ortida qanday hisoblanganini ham ko‘rasiz.',
    'f1.t': 'Sotuv tahlili',
    'f1.d': 'Kun, hafta va oy kesimida tushum, buyurtmalar, o‘rtacha chek va sotib olish darajasi.',
    'f2.t': 'Sof foyda va unit-iqtisod',
    'f2.d': 'Komissiya, logistika, saqlash va soliq ayirilgandan keyingi marja hamda ROI — har bir SKU uchun.',
    'f3.t': 'Qoldiq va rejalashtiruvchi',
    'f3.d': 'FBO/FBS qoldiqlari, tugash prognozi va keyingi yetkazma uchun tayyor ro‘yxat.',
    'f4.t': 'ABC va nolikvid',
    'f4.d': 'Daromadning 80% ini qaysi tovar berayotganini va qaysi biri pulni muzlatib turganini ko‘ring.',
    'f5.t': 'Yo‘qotish va qaytarishlar',
    'f5.d': 'Omborda yo‘qolgan, shikastlangan va qaytgan tovarlar — tayyor da’vo matni bilan birga.',
    'f6.t': 'Sharhlarga avto-javob',
    'f6.d': 'Ijobiy sharhlarga shablon bo‘yicha avtomatik javob, salbiylari esa darhol bildiriladi.',
    'f7.t': 'Telegram bildirishnomalar',
    'f7.d': 'Kunlik hisobot, qoldiq tugashi, yangi salbiy sharh va to‘lov haqida xabar.',
    'f8.t': 'Excel eksport',
    'f8.d': 'Har bir jadvalni bir bosishda .xlsx qilib yuklab oling — buxgalteriya uchun tayyor.',

    'how.eyebrow': 'Qanday ishlaydi',
    'how.title': 'To‘rt qadam — va analitika tayyor',
    'how.subtitle': 'Dasturchi ham, murakkab integratsiya ham kerak emas. Hammasi Telegram orqali.',
    'how.step': 'Qadam',
    'how.s1.t': 'Botda /start bosing',
    'how.s1.d': 'Telegram botni oching, telefon raqamingiz va kompaniya nomini yuboring.',
    'how.s2.t': 'API kalitni yuboring',
    'how.s2.d': 'seller.uzum.uz → Mening profilim → API kalitlar. Kalit shifrlangan holda saqlanadi.',
    'how.s3.t': '30 daqiqa yig‘ish',
    'how.s3.d': 'Platforma buyurtmalar, qoldiq, moliya va sharhlar tarixini to‘liq yig‘ib chiqadi.',
    'how.s4.t': 'Tayyor analitika',
    'how.s4.d': 'Saytga kiring — barcha hisobotlar to‘ldirilgan holda sizni kutib turadi.',

    'pricing.eyebrow': 'Tariflar',
    'pricing.title': 'Oddiy va tushunarli narxlar',
    'pricing.subtitle':
      'Barcha tariflarda asosiy hisobotlar ochiq — farq faqat do‘kon, kabinet va jamoa hajmida.',
    'pricing.monthly': 'Oylik',
    'pricing.yearly': 'Yillik',
    'pricing.save': 'Yillik to‘lovda {pct}% gacha chegirma',
    'pricing.perMonth': '/ oyiga',
    'pricing.free': 'Bepul',
    'pricing.days': '{days} kun to‘liq kirish',
    'pricing.popular': 'Mashhur',
    'pricing.best': 'Eng to‘liq',
    'pricing.cta': 'Tarifni tanlash',
    'pricing.ctaTrial': 'Bepul boshlash',
    'pricing.billedYearly': 'Yiliga {total} to‘lanadi',
    'pricing.stores': '{n} ta do‘kon',
    'pricing.cabinets': '{n} ta Uzum kabineti',
    'pricing.cabinetsInf': 'Cheksiz Uzum kabineti',
    'pricing.members': '{n} ta jamoa a’zosi',
    'pricing.note': 'Narxlar UZS’da, QQS bilan. To‘lov Payme, Click yoki bank o‘tkazmasi orqali.',
    'plan.trial.1': 'Barcha asosiy hisobotlar',
    'plan.trial.2': 'Sotuv, foyda va qoldiq tahlili',
    'plan.trial.3': 'Telegram bildirishnomalar',
    'plan.trial.4': 'ABC va nolikvid — namuna rejimida',
    'plan.standard.1': 'Sinovdagi hamma narsa',
    'plan.standard.2': 'ABC, nolikvid va rejalashtiruvchi',
    'plan.standard.3': 'Unit-iqtisod va tannarx boshqaruvi',
    'plan.standard.4': 'Sharhlarga avto-javob (kuniga 50 ta)',
    'plan.standard.5': 'Excel eksport va 1 yillik tarix',
    'plan.business.1': 'Standartdagi hamma narsa',
    'plan.business.2': 'Yo‘qotish, qaytarish va VGH hisobotlari',
    'plan.business.3': 'Avto-javob kuniga 300 tagacha',
    'plan.business.4': 'Har 15 daqiqada sinxronizatsiya',
    'plan.business.5': 'Ustuvor qo‘llab-quvvatlash',
    'plan.vip.1': 'Biznesdagi hamma narsa',
    'plan.vip.2': 'Cheksiz Uzum kabineti',
    'plan.vip.3': 'API kirish — o‘z tizimingizga ulash',
    'plan.vip.4': '5 yillik tarix, 10 daqiqalik sinxron',
    'plan.vip.5': 'Shaxsiy menejer',

    'faq.eyebrow': 'Savol-javob',
    'faq.title': 'Ko‘p so‘raladigan savollar',
    'faq.subtitle': 'Javobini topa olmadingizmi? Telegram’da yozing — tez orada javob beramiz.',
    'faq.q1': 'API kalitim xavfsizmi?',
    'faq.a1':
      'Ha. Kalit AES-256-GCM algoritmi bilan shifrlanadi va faqat sizning ma’lumotlaringizni o‘qish uchun ishlatiladi. Uni istalgan vaqtda sozlamalardan o‘chirib tashlashingiz mumkin — bu Uzum kabinetingizga ta’sir qilmaydi.',
    'faq.q2': 'Ma’lumot qancha vaqtda yig‘iladi?',
    'faq.a2':
      'Birinchi to‘liq yig‘ish taxminan 30 daqiqa davom etadi — eng uzun bosqich buyurtmalar tarixi. Keyin ma’lumot tarifingizga qarab har 10–60 daqiqada avtomatik yangilanib turadi.',
    'faq.q3': 'Nechta do‘kon va kabinet ulash mumkin?',
    'faq.a3':
      'Sinovda 1 ta, Standartda 3 ta, Biznesda 5 ta, VIP’da esa 10 tagacha do‘kon ulanadi. VIP tarifida Uzum kabinetlari soni cheklanmagan.',
    'faq.q4': 'To‘lov qanday amalga oshiriladi?',
    'faq.a4':
      'Payme, Click yoki bank o‘tkazmasi orqali. To‘lovdan so‘ng tarif darhol faollashadi, hisob-faktura esa hisobingizda saqlanib qoladi.',
    'faq.q5': 'Obunani bekor qilsam bo‘ladimi?',
    'faq.a5':
      'Ha, istalgan vaqtda. Avtomatik uzaytirishni o‘chirasiz va tarif to‘langan muddat oxirigacha ishlaydi. Ma’lumotlaringiz yo‘qolmaydi.',
    'faq.q6': 'Qo‘llab-quvvatlash qanday ishlaydi?',
    'faq.a6':
      'Telegram orqali — ish kunlari 9:00 dan 20:00 gacha javob beramiz. Biznes va VIP tariflarida murojaatlar navbatsiz ko‘rib chiqiladi.',

    'cta.title': 'Bugungi savdongiz qancha foyda keltirdi?',
    'cta.text': 'Bir necha daqiqada ulaning va birinchi hisobotni bugun oching. Karta kerak emas.',
    'cta.button': 'Bepul boshlash',
    'cta.secondary': 'Tariflarni ko‘rish',
    'cta.note': '7 kun bepul · Istalgan vaqtda bekor qilasiz',

    'footer.about':
      'Uzum Market sotuvchilari uchun analitika platformasi. Sotuv, foyda, qoldiq va sharhlar — bitta joyda.',
    'footer.product': 'Mahsulot',
    'footer.help': 'Yordam',
    'footer.faq': 'Savol-javob',
    'footer.bot': 'Telegram bot',
    'footer.support': 'Qo‘llab-quvvatlash',
    'footer.offer': 'Ommaviy oferta',
    'footer.privacy': 'Maxfiylik siyosati',
    'footer.rights': '© 2026 SavdoIQ. Barcha huquqlar himoyalangan.',
    'footer.madeIn': 'Toshkentda ishlab chiqildi',
  },

  ru: {
    'nav.features': 'Возможности',
    'nav.how': 'Как это работает',
    'nav.pricing': 'Тарифы',
    'nav.faq': 'Вопросы и ответы',
    'nav.login': 'Войти',
    'nav.menu': 'Меню',

    'hero.badge': '7 дней бесплатно — карта не нужна',
    'hero.title': 'Ваши продажи на Uzum — в цифрах',
    'hero.subtitle':
      'SavdoIQ подключает ваш кабинет Uzum Market и показывает продажи, чистую прибыль, остатки, юнит-экономику и потери на одной понятной панели. Больше не нужно сводить Excel по ночам.',
    'hero.ctaPrimary': 'Начать через Telegram',
    'hero.ctaSecondary': 'Посмотреть тарифы',
    'hero.note': 'Подключение 2 минуты · Полная аналитика за 30 минут',
    'hero.p1': 'Чистая прибыль по каждому SKU',
    'hero.p2': 'Прогноз, когда закончится остаток',
    'hero.p3': 'Ежедневный отчёт в Telegram',

    'mock.title': 'Дашборд',
    'mock.period': 'Последние 14 дней',
    'mock.revenue': 'Выручка',
    'mock.profit': 'Чистая прибыль',
    'mock.margin': 'Маржа',
    'mock.chart': 'Динамика выручки и прибыли',
    'mock.top': 'Самые прибыльные товары',
    'mock.units': 'шт',
    'mock.live': 'Живые данные',

    'trust.a.v': '30 минут',
    'trust.a.l': 'И полная аналитика готова',
    'trust.b.v': '24/7',
    'trust.b.l': 'Уведомления в Telegram',
    'trust.c.v': '25+',
    'trust.c.l': 'Отчётов и разделов аналитики',
    'trust.d.v': '3 языка',
    'trust.d.l': 'Узбекский, русский и английский',

    'features.eyebrow': 'Возможности',
    'features.title': 'Всё, что нужно селлеру',
    'features.subtitle':
      'От заказа до чистой прибыли — в одном аккаунте. И за каждой цифрой видно, как она посчитана.',
    'f1.t': 'Аналитика продаж',
    'f1.d': 'Выручка, заказы, средний чек и процент выкупа в разрезе дня, недели и месяца.',
    'f2.t': 'Чистая прибыль и юнит-экономика',
    'f2.d': 'Маржа и ROI по каждому SKU — после комиссии, логистики, хранения и налога.',
    'f3.t': 'Остатки и планировщик',
    'f3.d': 'Остатки FBO/FBS, прогноз окончания и готовый список для следующей поставки.',
    'f4.t': 'ABC и неликвиды',
    'f4.d': 'Видно, какие товары дают 80% выручки, а какие просто замораживают деньги.',
    'f5.t': 'Потери и возвраты',
    'f5.d': 'Утерянные, повреждённые и возвращённые товары — вместе с готовым текстом претензии.',
    'f6.t': 'Автоответы на отзывы',
    'f6.d': 'Положительные отзывы закрываются шаблоном автоматически, о негативных сообщаем сразу.',
    'f7.t': 'Уведомления в Telegram',
    'f7.d': 'Ежедневный отчёт, окончание остатка, новый негативный отзыв и статус оплаты.',
    'f8.t': 'Экспорт в Excel',
    'f8.d': 'Любая таблица выгружается в .xlsx одним нажатием — готово для бухгалтерии.',

    'how.eyebrow': 'Как это работает',
    'how.title': 'Четыре шага — и аналитика готова',
    'how.subtitle': 'Не нужен ни разработчик, ни сложная интеграция. Всё через Telegram.',
    'how.step': 'Шаг',
    'how.s1.t': 'Нажмите /start в боте',
    'how.s1.d': 'Откройте Telegram-бота, отправьте номер телефона и название компании.',
    'how.s2.t': 'Отправьте API-ключ',
    'how.s2.d': 'seller.uzum.uz → Мой профиль → API-ключи. Ключ хранится в зашифрованном виде.',
    'how.s3.t': '30 минут сбора данных',
    'how.s3.d': 'Платформа выгружает историю заказов, остатков, финансов и отзывов.',
    'how.s4.t': 'Готовая аналитика',
    'how.s4.d': 'Заходите на сайт — все отчёты уже заполнены и ждут вас.',

    'pricing.eyebrow': 'Тарифы',
    'pricing.title': 'Простые и понятные цены',
    'pricing.subtitle':
      'Основные отчёты открыты на всех тарифах — разница только в числе магазинов, кабинетов и мест в команде.',
    'pricing.monthly': 'Помесячно',
    'pricing.yearly': 'На год',
    'pricing.save': 'При оплате за год скидка до {pct}%',
    'pricing.perMonth': '/ в месяц',
    'pricing.free': 'Бесплатно',
    'pricing.days': '{days} дней полного доступа',
    'pricing.popular': 'Популярный',
    'pricing.best': 'Максимум',
    'pricing.cta': 'Выбрать тариф',
    'pricing.ctaTrial': 'Начать бесплатно',
    'pricing.billedYearly': 'Списывается {total} в год',
    'pricing.stores': '{n} магазина(ов)',
    'pricing.cabinets': '{n} кабинета(ов) Uzum',
    'pricing.cabinetsInf': 'Безлимит кабинетов Uzum',
    'pricing.members': '{n} участника(ов) команды',
    'pricing.note': 'Цены в UZS с НДС. Оплата через Payme, Click или банковский перевод.',
    'plan.trial.1': 'Все базовые отчёты',
    'plan.trial.2': 'Аналитика продаж, прибыли и остатков',
    'plan.trial.3': 'Уведомления в Telegram',
    'plan.trial.4': 'ABC и неликвиды — в режиме просмотра',
    'plan.standard.1': 'Всё из пробного тарифа',
    'plan.standard.2': 'ABC, неликвиды и планировщик',
    'plan.standard.3': 'Юнит-экономика и себестоимость',
    'plan.standard.4': 'Автоответы на отзывы (50 в день)',
    'plan.standard.5': 'Экспорт в Excel и год истории',
    'plan.business.1': 'Всё из Стандарта',
    'plan.business.2': 'Отчёты по потерям, возвратам и ВГХ',
    'plan.business.3': 'До 300 автоответов в день',
    'plan.business.4': 'Синхронизация каждые 15 минут',
    'plan.business.5': 'Приоритетная поддержка',
    'plan.vip.1': 'Всё из Бизнеса',
    'plan.vip.2': 'Безлимит кабинетов Uzum',
    'plan.vip.3': 'Доступ к API — интеграция в свою систему',
    'plan.vip.4': '5 лет истории, синхронизация каждые 10 минут',
    'plan.vip.5': 'Персональный менеджер',

    'faq.eyebrow': 'Вопросы и ответы',
    'faq.title': 'Частые вопросы',
    'faq.subtitle': 'Не нашли ответ? Напишите в Telegram — ответим быстро.',
    'faq.q1': 'Безопасен ли мой API-ключ?',
    'faq.a1':
      'Да. Ключ шифруется алгоритмом AES-256-GCM и используется только для чтения ваших данных. Вы можете удалить его в настройках в любой момент — на кабинет Uzum это никак не влияет.',
    'faq.q2': 'Сколько времени собираются данные?',
    'faq.a2':
      'Первая полная синхронизация занимает около 30 минут — самый долгий этап это история заказов. Дальше данные обновляются автоматически каждые 10–60 минут в зависимости от тарифа.',
    'faq.q3': 'Сколько магазинов и кабинетов можно подключить?',
    'faq.a3':
      'На пробном — 1, на Стандарте — 3, на Бизнесе — 5, на VIP — до 10 магазинов. На VIP число кабинетов Uzum не ограничено.',
    'faq.q4': 'Как проходит оплата?',
    'faq.a4':
      'Через Payme, Click или банковский перевод. После оплаты тариф активируется сразу, а счёт сохраняется в вашем аккаунте.',
    'faq.q5': 'Можно ли отменить подписку?',
    'faq.a5':
      'Да, в любое время. Вы отключаете автопродление, и тариф работает до конца оплаченного периода. Данные при этом не теряются.',
    'faq.q6': 'Как работает поддержка?',
    'faq.a6':
      'Через Telegram — отвечаем по будням с 9:00 до 20:00. На тарифах Бизнес и VIP обращения обрабатываются вне очереди.',

    'cta.title': 'Сколько прибыли принесли ваши продажи сегодня?',
    'cta.text': 'Подключитесь за пару минут и откройте первый отчёт уже сегодня. Карта не нужна.',
    'cta.button': 'Начать бесплатно',
    'cta.secondary': 'Посмотреть тарифы',
    'cta.note': '7 дней бесплатно · Отмена в любой момент',

    'footer.about':
      'Аналитическая платформа для селлеров Uzum Market. Продажи, прибыль, остатки и отзывы — в одном месте.',
    'footer.product': 'Продукт',
    'footer.help': 'Помощь',
    'footer.faq': 'Вопросы и ответы',
    'footer.bot': 'Telegram-бот',
    'footer.support': 'Поддержка',
    'footer.offer': 'Публичная оферта',
    'footer.privacy': 'Политика конфиденциальности',
    'footer.rights': '© 2026 SavdoIQ. Все права защищены.',
    'footer.madeIn': 'Сделано в Ташкенте',
  },

  en: {
    'nav.features': 'Features',
    'nav.how': 'How it works',
    'nav.pricing': 'Pricing',
    'nav.faq': 'FAQ',
    'nav.login': 'Sign in',
    'nav.menu': 'Menu',

    'hero.badge': '7 days free — no card required',
    'hero.title': 'See your Uzum sales in real numbers',
    'hero.subtitle':
      'SavdoIQ connects your Uzum Market cabinet and shows sales, net profit, stock, unit economics and losses on one clear dashboard. No more late-night spreadsheets.',
    'hero.ctaPrimary': 'Start with Telegram',
    'hero.ctaSecondary': 'See pricing',
    'hero.note': 'Connect in 2 minutes · Full analytics within 30 minutes',
    'hero.p1': 'Net profit for every SKU',
    'hero.p2': 'Stock-out forecast',
    'hero.p3': 'Daily report in Telegram',

    'mock.title': 'Dashboard',
    'mock.period': 'Last 14 days',
    'mock.revenue': 'Revenue',
    'mock.profit': 'Net profit',
    'mock.margin': 'Margin',
    'mock.chart': 'Revenue and profit trend',
    'mock.top': 'Most profitable products',
    'mock.units': 'pcs',
    'mock.live': 'Live data',

    'trust.a.v': '30 minutes',
    'trust.a.l': 'And your full analytics is ready',
    'trust.b.v': '24/7',
    'trust.b.l': 'Telegram notifications',
    'trust.c.v': '25+',
    'trust.c.l': 'Reports and analytics sections',
    'trust.d.v': '3 languages',
    'trust.d.l': 'Uzbek, Russian and English',

    'features.eyebrow': 'Features',
    'features.title': 'Everything a seller actually needs',
    'features.subtitle':
      'From the order to the net profit — in one account. And every number shows how it was calculated.',
    'f1.t': 'Sales analytics',
    'f1.d': 'Revenue, orders, average check and buyout rate by day, week and month.',
    'f2.t': 'Net profit and unit economics',
    'f2.d': 'Margin and ROI per SKU after commission, logistics, storage and tax.',
    'f3.t': 'Stock and planner',
    'f3.d': 'FBO/FBS stock levels, stock-out forecast and a ready list for the next shipment.',
    'f4.t': 'ABC and dead stock',
    'f4.d': 'See which products bring 80% of the revenue and which ones just freeze your cash.',
    'f5.t': 'Losses and returns',
    'f5.d': 'Lost, damaged and returned items — together with a ready-to-send claim text.',
    'f6.t': 'Review auto-replies',
    'f6.d': 'Positive reviews are answered from templates automatically; negatives reach you instantly.',
    'f7.t': 'Telegram notifications',
    'f7.d': 'Daily report, stock running out, a new negative review and payment status.',
    'f8.t': 'Excel export',
    'f8.d': 'Download any table as .xlsx in one click — ready for your accountant.',

    'how.eyebrow': 'How it works',
    'how.title': 'Four steps and your analytics is live',
    'how.subtitle': 'No developer and no complex integration. Everything happens in Telegram.',
    'how.step': 'Step',
    'how.s1.t': 'Send /start to the bot',
    'how.s1.d': 'Open the Telegram bot and share your phone number and company name.',
    'how.s2.t': 'Send your API key',
    'how.s2.d': 'seller.uzum.uz → My profile → API keys. The key is stored encrypted.',
    'how.s3.t': '30 minutes of syncing',
    'how.s3.d': 'The platform imports your orders, stock, finance and review history.',
    'how.s4.t': 'Analytics ready',
    'how.s4.d': 'Sign in to the web app — every report is already filled in and waiting.',

    'pricing.eyebrow': 'Pricing',
    'pricing.title': 'Simple, honest pricing',
    'pricing.subtitle':
      'Core reports are open on every plan — the difference is the number of stores, cabinets and team seats.',
    'pricing.monthly': 'Monthly',
    'pricing.yearly': 'Yearly',
    'pricing.save': 'Save up to {pct}% when paying yearly',
    'pricing.perMonth': '/ per month',
    'pricing.free': 'Free',
    'pricing.days': '{days} days of full access',
    'pricing.popular': 'Popular',
    'pricing.best': 'Everything',
    'pricing.cta': 'Choose plan',
    'pricing.ctaTrial': 'Start for free',
    'pricing.billedYearly': 'Billed {total} per year',
    'pricing.stores': '{n} stores',
    'pricing.cabinets': '{n} Uzum cabinets',
    'pricing.cabinetsInf': 'Unlimited Uzum cabinets',
    'pricing.members': '{n} team members',
    'pricing.note': 'Prices in UZS, VAT included. Pay with Payme, Click or a bank transfer.',
    'plan.trial.1': 'All the core reports',
    'plan.trial.2': 'Sales, profit and stock analytics',
    'plan.trial.3': 'Telegram notifications',
    'plan.trial.4': 'ABC and dead stock — in preview mode',
    'plan.standard.1': 'Everything in Trial',
    'plan.standard.2': 'ABC, dead stock and the planner',
    'plan.standard.3': 'Unit economics and cost price',
    'plan.standard.4': 'Review auto-replies (50 per day)',
    'plan.standard.5': 'Excel export and 1 year of history',
    'plan.business.1': 'Everything in Standard',
    'plan.business.2': 'Losses, returns and VGH reports',
    'plan.business.3': 'Up to 300 auto-replies per day',
    'plan.business.4': 'Sync every 15 minutes',
    'plan.business.5': 'Priority support',
    'plan.vip.1': 'Everything in Business',
    'plan.vip.2': 'Unlimited Uzum cabinets',
    'plan.vip.3': 'API access — plug it into your own systems',
    'plan.vip.4': '5 years of history, sync every 10 minutes',
    'plan.vip.5': 'A personal manager',

    'faq.eyebrow': 'FAQ',
    'faq.title': 'Frequently asked questions',
    'faq.subtitle': 'Still unsure? Message us on Telegram — we answer fast.',
    'faq.q1': 'Is my API key safe?',
    'faq.a1':
      'Yes. The key is encrypted with AES-256-GCM and used only to read your own data. You can delete it from settings at any time — it does not affect your Uzum cabinet.',
    'faq.q2': 'How long does the data sync take?',
    'faq.a2':
      'The first full sync takes about 30 minutes — order history is the longest step. After that data refreshes automatically every 10–60 minutes depending on your plan.',
    'faq.q3': 'How many stores and cabinets can I connect?',
    'faq.a3':
      'One on Trial, three on Standard, five on Business and up to ten stores on VIP. On VIP the number of Uzum cabinets is unlimited.',
    'faq.q4': 'How do payments work?',
    'faq.a4':
      'Through Payme, Click or a bank transfer. The plan activates immediately after payment and the invoice stays in your account.',
    'faq.q5': 'Can I cancel my subscription?',
    'faq.a5':
      'Yes, any time. You switch off auto-renewal and the plan keeps working until the paid period ends. Your data is not deleted.',
    'faq.q6': 'How does support work?',
    'faq.a6':
      'Through Telegram — we reply on weekdays from 9:00 to 20:00. Business and VIP requests are handled first.',

    'cta.title': 'How much profit did today actually bring?',
    'cta.text': 'Connect in a couple of minutes and open your first report today. No card needed.',
    'cta.button': 'Start for free',
    'cta.secondary': 'See pricing',
    'cta.note': '7 days free · Cancel any time',

    'footer.about':
      'An analytics platform for Uzum Market sellers. Sales, profit, stock and reviews in one place.',
    'footer.product': 'Product',
    'footer.help': 'Help',
    'footer.faq': 'FAQ',
    'footer.bot': 'Telegram bot',
    'footer.support': 'Support',
    'footer.offer': 'Terms of service',
    'footer.privacy': 'Privacy policy',
    'footer.rights': '© 2026 SavdoIQ. All rights reserved.',
    'footer.madeIn': 'Built in Tashkent',
  },
});

const FEATURES = [
  { icon: TrendingUp, k: 'f1', tone: 'brand' },
  { icon: Scale, k: 'f2', tone: 'info' },
  { icon: Layers, k: 'f3', tone: 'violet' },
  { icon: PieChart, k: 'f4', tone: 'warn' },
  { icon: PackageX, k: 'f5', tone: 'danger' },
  { icon: Star, k: 'f6', tone: 'warn' },
  { icon: BellRing, k: 'f7', tone: 'info' },
  { icon: FileSpreadsheet, k: 'f8', tone: 'brand' },
] as const;

const TONE_CLASS: Record<string, string> = {
  brand: 'bg-brand/10 text-brand-ink',
  info: 'bg-info/10 text-info-ink',
  violet: 'bg-violet/10 text-violet-ink',
  warn: 'bg-warn/[0.12] text-warn-ink',
  danger: 'bg-danger/10 text-danger-ink',
};

const TRUST = ['a', 'b', 'c', 'd'] as const;
const STEPS = [1, 2, 3, 4] as const;

export default function Landing() {
  const t = useT('landing');

  return (
    <div className="min-h-screen bg-bg text-ink">
      <LandingHeader />

      <main>
        {/* ───────────── Hero ───────────── */}
        <div className="relative overflow-hidden pb-20 pt-14 sm:pt-20">
          <Aurora />
          <GridPattern />

          <Section className="relative">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
              <div>
                <motion.span
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="chip bg-brand/10 text-brand-ink ring-1 ring-inset ring-brand/25"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('hero.badge')}
                </motion.span>

                <motion.h1
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.06, ease: EASE }}
                  className="text-balance mt-6 font-display text-[38px] font-extrabold leading-[1.06] tracking-tight text-ink sm:text-[52px] xl:text-[58px]"
                >
                  {t('hero.title')}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.13, ease: EASE }}
                  className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
                >
                  {t('hero.subtitle')}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
                  className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <Link to="/login" className="sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto" icon={<TelegramIcon className="h-4 w-4" />}>
                      {t('hero.ctaPrimary')}
                    </Button>
                  </Link>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => scrollToId('pricing')}
                    iconRight={<ArrowRight className="h-4 w-4" />}
                  >
                    {t('hero.ctaSecondary')}
                  </Button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="mt-6 flex items-center gap-2 text-xs text-muted"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand" />
                  {t('hero.note')}
                </motion.div>

                <motion.ul
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.36, ease: EASE }}
                  className="mt-8 flex flex-wrap gap-x-5 gap-y-2.5"
                >
                  {['hero.p1', 'hero.p2', 'hero.p3'].map((k) => (
                    <li key={k} className="flex items-center gap-2 text-sm text-ink-soft">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                      {t(k)}
                    </li>
                  ))}
                </motion.ul>
              </div>

              <HeroMock />
            </div>
          </Section>
        </div>

        {/* ───────────── Ishonch qatori ───────────── */}
        <Section>
          <FadeUp>
            <div className="card grid grid-cols-2 divide-line bg-surface/70 lg:divide-x lg:grid-cols-4">
              {TRUST.map((k) => (
                <div key={k} className="px-5 py-6 text-center sm:px-6">
                  <p className="tnum font-display text-2xl font-extrabold tracking-tight text-brand sm:text-[28px]">
                    {t(`trust.${k}.v`)}
                  </p>
                  <p className="mt-1.5 text-xs leading-snug text-muted sm:text-sm">{t(`trust.${k}.l`)}</p>
                </div>
              ))}
            </div>
          </FadeUp>
        </Section>

        {/* ───────────── Imkoniyatlar ───────────── */}
        <Section id="features" className="mt-24 sm:mt-32">
          <FadeUp>
            <SectionHead eyebrow={t('features.eyebrow')} title={t('features.title')} subtitle={t('features.subtitle')} />
          </FadeUp>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <FadeUp key={f.k} delay={(i % 4) * 0.06} className="h-full">
                  <div className="card card-hover group h-full p-5">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 ease-spring group-hover:scale-110 ${TONE_CLASS[f.tone]}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-display text-base font-bold tracking-tight text-ink">{t(`${f.k}.t`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{t(`${f.k}.d`)}</p>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </Section>

        {/* ───────────── Qanday ishlaydi ───────────── */}
        <Section id="how" className="mt-24 sm:mt-32">
          <FadeUp>
            <SectionHead eyebrow={t('how.eyebrow')} title={t('how.title')} subtitle={t('how.subtitle')} />
          </FadeUp>

          <div className="relative mt-14">
            <div
              aria-hidden
              className="absolute left-6 top-2 hidden h-[calc(100%-1rem)] w-px lg:left-0 lg:top-7 lg:h-px lg:w-full lg:block"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgb(var(--c-brand) / 0.45), rgb(var(--c-violet) / 0.35), transparent)',
              }}
            />
            <div className="grid gap-8 lg:grid-cols-4 lg:gap-6">
              {STEPS.map((n, i) => (
                <FadeUp key={n} delay={i * 0.09}>
                  <div className="relative flex gap-4 lg:block">
                    <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface shadow-card">
                      <span className="tnum font-display text-lg font-extrabold text-brand">{n}</span>
                    </div>
                    <div className="lg:mt-5">
                      <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted/80">
                        {t('how.step')} {n}
                      </p>
                      <h3 className="mt-1.5 font-display text-base font-bold tracking-tight text-ink">
                        {t(`how.s${n}.t`)}
                      </h3>
                      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{t(`how.s${n}.d`)}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </Section>

        {/* ───────────── Tariflar ───────────── */}
        <Section id="pricing" className="mt-24 sm:mt-32">
          <FadeUp>
            <SectionHead
              eyebrow={t('pricing.eyebrow')}
              title={t('pricing.title')}
              subtitle={t('pricing.subtitle')}
              className="mb-10"
            />
          </FadeUp>
          <LandingPricing />
        </Section>

        {/* ───────────── FAQ ───────────── */}
        <Section id="faq" className="mt-24 sm:mt-32">
          <FadeUp>
            <SectionHead eyebrow={t('faq.eyebrow')} title={t('faq.title')} subtitle={t('faq.subtitle')} />
          </FadeUp>
          <LandingFaq />
        </Section>

        {/* ───────────── Yakuniy CTA ───────────── */}
        <Section className="mt-24 sm:mt-32">
          <FadeUp>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-surface bg-aurora px-6 py-14 text-center sm:px-12 sm:py-20">
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[680px] -translate-x-1/2 rounded-full bg-brand/[0.12] blur-[110px]"
              />
              <div className="relative mx-auto max-w-2xl">
                <LandingLogo className="justify-center" />
                <h2 className="text-balance mt-7 font-display text-[28px] font-extrabold leading-[1.15] tracking-tight text-ink sm:text-[40px]">
                  {t('cta.title')}
                </h2>
                <p className="text-balance mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted">
                  {t('cta.text')}
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link to="/login" className="w-full sm:w-auto">
                    <Button size="lg" className="w-full sm:w-auto" icon={<TelegramIcon className="h-4 w-4" />}>
                      {t('cta.button')}
                    </Button>
                  </Link>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => scrollToId('pricing')}
                  >
                    {t('cta.secondary')}
                  </Button>
                </div>
                <p className="mt-5 text-xs text-muted">{t('cta.note')}</p>
              </div>
            </div>
          </FadeUp>
        </Section>

        <div className="mt-24">
          <SoftDivider />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
