import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive,
  ArrowRight,
  BellRing,
  Box,
  Gauge,
  Layers,
  PackageX,
  PieChart,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Wallet,
} from '@/components/icons';
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
    'hero.note': 'Ulanish 2 daqiqa · To‘liq tahlil bir necha daqiqada tayyor',
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

    'trust.a.v': 'Bir necha daqiqa',
    'trust.a.l': 'To‘liq tahlil tayyor bo‘ladi',
    'trust.b.v': '24/7',
    'trust.b.l': 'Telegram’da bildirishnomalar',
    // Menyuda 30 dan ortiq hisobot sahifasi bor (lib/nav.ts, 2026-10-27) — "25+" eskirgan edi
    'trust.c.v': '30+',
    'trust.c.l': 'Hisobot va tahlil bo‘limi',
    'trust.d.v': '3 til',
    'trust.d.l': 'O‘zbek, rus va ingliz',

    'features.eyebrow': 'Imkoniyatlar',
    'features.title': 'Sotuvchiga kerak bo‘lgan hamma narsa',
    'features.subtitle':
      'Buyurtmadan sof foydagacha — bitta hisobda. Har bir raqam ortida qanday hisoblanganini ham ko‘rasiz.',
    'features.new': 'Yangi',
    'fg.money': 'Pul va foyda',
    'fg.stock': 'Mahsulot va ombor',
    'fg.growth': 'O‘sish, jamoa va Telegram',
    'f1.t': 'Sotuv tahlili va voronka',
    'f1.d': 'Kun, hafta va oy kesimida tushum, buyurtmalar va sotib olish darajasi. Buyurtma qayerda yo‘qolayotgani — 4 bosqichli voronkada, sabablari so‘mda.',
    'f2.t': 'Moliya markazi',
    'f2.d': 'Tushumdan Uzum to‘loviga va sof foydagacha — bitta sharsharada. Oldingi davr, o‘tgan oy yoki o‘tgan yil bilan taqqoslash; oylik hisobot ekrandagi raqamlar bilan bir xil va Telegram’ga yuboriladi.',
    'f3.t': 'Mahsulot iqtisodi',
    'f3.d': 'Komissiya, logistika, saqlash, reklama va soliqdan keyingi foyda, marja va ROI — har bir SKU va variant uchun. Jadval Excel’ga sahifa filtrlari bilan tushadi.',
    'f4.t': 'Yo‘qotish va qaytarishlar',
    'f4.d': 'Omborda yo‘qolgan, shikastlangan va qaytgan tovarlar — tayyor da’vo matni bilan. Qaytarish ulushi hamma joyda dona bo‘yicha.',
    'f5.t': 'Qoldiq va rejalashtiruvchi',
    'f5.d': 'Hamma joyda bitta “buyurtma kerak” soni. O‘z omboringizdan FBO ga jo‘natiladigan va sotib olinadigan tovar alohida; yetkazma qoralamasi va yetkazuvchi uchun Excel — bir bosishda.',
    'f6.t': 'Pullik saqlash — Uzum tarifi bo‘yicha',
    'f6.d': '01.06.2026 dagi rasmiy tarif: 60 kungacha aylanma bepul, yangi SKU dastlabki 30/60 kun bepul. 30 kunlik prognoz Uzum haqiqatda olgan summa yonida, ogohlantirish Telegram’da.',
    'f7.t': 'Hajm, VGH va Litrovka',
    'f7.d': 'Logistika uchun to‘langan summa kartochkadagi hajm bilan solishtiriladi. Litrovka va unit kalkulyator har bir tarif qayerdan olinganini ko‘rsatadi.',
    'f8.t': 'ABC va nolikvid',
    'f8.d': 'Daromadning 80% ini qaysi tovar berayotganini va qaysi biri pulni muzlatib turganini ko‘ring.',
    'f9.t': 'O‘sish: kategoriya, radar, narxlar',
    'f9.d': 'Kategoriyalarim — foyda, marja, qaytarish va muzlagan qoldiq. Mening radarim — tezlashgan, sekinlashgan va tugayotgan tovarlar. Narxlar xaritasi — o‘zingiz kiritgan raqobatchi narxlari. Faqat o‘z ma’lumotingizdan.',
    'f10.t': 'Jamoa va ko‘rinish shablonlari',
    'f10.d': 'Xodimni havola orqali taklif qiling. Omborchi, Buxgalter va Marketolog shablonlari faqat kerakli bo‘limlarni ochadi va kerak joyda pulni yashiradi.',
    'f11.t': 'Telegram: hisobot va dayjest',
    'f11.d': 'Botda Bugun, Kecha, Shu oy va Shu yil hisoboti — saytdagi raqamlar bilan bir xil. Dushanba 09:00 da haftalik, oyning 1-kuni oylik dayjest; qoldiq va salbiy sharh haqida xabar.',
    'f12.t': 'Sharhlarga avto-javob',
    'f12.d': 'Ijobiy sharhlarga shablon bo‘yicha avtomatik javob, salbiylari esa darhol bildiriladi.',

    'how.eyebrow': 'Qanday ishlaydi',
    'how.title': 'To‘rt qadam — va analitika tayyor',
    'how.subtitle': 'Dasturchi ham, murakkab integratsiya ham kerak emas. Hammasi Telegram orqali.',
    'how.step': 'Qadam',
    'how.s1.t': 'Botda /start bosing',
    'how.s1.d': 'Telegram botni oching, telefon raqamingiz va kompaniya nomini yuboring.',
    'how.s2.t': 'API kalitni yuboring',
    'how.s2.d': 'seller.uzum.uz → Mening profilim → API kalitlar. Kalit shifrlangan holda saqlanadi.',
    'how.s3.t': 'Ma’lumot yig‘iladi',
    'how.s3.d': 'Platforma buyurtmalar, qoldiq, moliya va sharhlar tarixini yig‘ib chiqadi — tarifga qarab 1 yilgacha. Tarifni oshirsangiz, eski tarix o‘zi yuklanadi.',
    'how.s4.t': 'Tayyor analitika',
    'how.s4.d': 'Saytga kiring — barcha hisobotlar to‘ldirilgan holda sizni kutib turadi.',

    'pricing.eyebrow': 'Tariflar',
    'pricing.title': 'Oddiy va tushunarli narxlar',
    /*
     * Ilgari "farq faqat do'kon, kabinet va jamoa hajmida" edi — sinovda esa
     * ABC, rejalashtiruvchi va VGH faqat namuna, jamoa yo'q (plans.ts, 2026-10-27)
     */
    'pricing.subtitle':
      'Asosiy hisobotlar hamma tarifda ochiq — farq do‘kon, kabinet va jamoa hajmida hamda ilg‘or bo‘limlarda.',
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
    /*
     * Punktlar plans.ts dagi ruxsatdan (2026-10-27): sinovda abc_analysis
     * (Kategoriyalarim ham), growth_radar, price_map, planner, vgh_report —
     * 'preview'; paid_storage va telegram_notifications — to'liq; jamoa
     * (members) sinovda 1 kishi. Radar va narxlar xaritasi faqat pullik
     * tarifda — egasining qarori.
     */
    'plan.trial.1': 'Barcha asosiy hisobotlar va moliya markazi',
    'plan.trial.2': 'Pullik saqlash — Uzum tarifi bo‘yicha',
    'plan.trial.3': 'Telegram hisobotlari va dayjestlar',
    'plan.trial.4': 'O‘sish bo‘limi, ABC, rejalashtiruvchi va VGH — namuna rejimida',
    'plan.standard.1': 'Sinovdagi hamma narsa',
    'plan.standard.2': 'O‘sish: Kategoriyalarim, Mening radarim, Narxlar xaritasi',
    'plan.standard.3': 'ABC, nolikvid, rejalashtiruvchi, Hajm va VGH',
    'plan.standard.4': 'Jamoa: taklif havolasi va ko‘rinish shablonlari',
    'plan.standard.5': 'Sharhlarga avto-javob (kuniga 50 ta)',
    'plan.standard.6': 'Excel eksport va 1 yillik tarix',
    'plan.vip.1': 'Standartdagi hamma narsa',
    'plan.vip.2': 'Uzum kabinetlari cheksiz',
    'plan.vip.3': 'API kirish — o‘z tizimingizga ulash',
    // Ilgari "5 yillik tarix" edi, sinxron esa 365 kundan oshmaydi. Tarix va
    // sinxron oralig'i Standart bilan bir xil (plans.ts), shuning uchun bu yerda
    // VIP ning haqiqiy ustunligi — avto-javob limiti (2026-10-24)
    'plan.vip.4': 'Sharhlarga avto-javob (kuniga 2000 ta)',
    'plan.vip.5': 'Shaxsiy menejer',

    'faq.eyebrow': 'Savol-javob',
    'faq.title': 'Ko‘p so‘raladigan savollar',
    'faq.subtitle': 'Javobini topa olmadingizmi? Telegram’da yozing — tez orada javob beramiz.',
    'faq.q1': 'API kalitim xavfsizmi?',
    'faq.a1':
      'Ha. Kalit AES-256-GCM algoritmi bilan shifrlanadi va faqat sizning ma’lumotlaringizni o‘qish uchun ishlatiladi. Uni istalgan vaqtda sozlamalardan o‘chirib tashlashingiz mumkin — bu Uzum kabinetingizga ta’sir qilmaydi.',
    'faq.q2': 'Ma’lumot qancha vaqtda yig‘iladi?',
    'faq.a2':
      'Birinchi to‘liq yig‘ish odatda bir necha daqiqa oladi — eng uzun bosqich buyurtmalar tarixi. Keyin ma’lumot tarifingizga qarab har 30–60 daqiqada avtomatik yangilanib turadi.',
    'faq.q3': 'Nechta do‘kon va kabinet ulash mumkin?',
    'faq.a3':
      'Sinovda 1 ta, Standartda 3 ta, VIP’da esa 10 tagacha do‘kon ulanadi. VIP tarifida Uzum kabinetlari soni cheklanmagan.',
    'faq.q4': 'To‘lov qanday amalga oshiriladi?',
    'faq.a4':
      'Payme, Click yoki bank o‘tkazmasi orqali. To‘lovdan so‘ng tarif darhol faollashadi, hisob-faktura esa hisobingizda saqlanib qoladi.',
    'faq.q5': 'Obunani bekor qilsam bo‘ladimi?',
    'faq.a5':
      'Ha, istalgan vaqtda. Avtomatik uzaytirishni o‘chirasiz va tarif to‘langan muddat oxirigacha ishlaydi. Ma’lumotlaringiz yo‘qolmaydi.',
    'faq.q6': 'Qo‘llab-quvvatlash qanday ishlaydi?',
    'faq.a6':
      'Telegram orqali — ish kunlari 9:00 dan 20:00 gacha javob beramiz. VIP tarifida murojaatlar navbatsiz ko‘rib chiqiladi.',

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
    'hero.note': 'Подключение 2 минуты · Полная аналитика за несколько минут',
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

    'trust.a.v': 'Несколько минут',
    'trust.a.l': 'И полная аналитика готова',
    'trust.b.v': '24/7',
    'trust.b.l': 'Уведомления в Telegram',
    'trust.c.v': '30+',
    'trust.c.l': 'Отчётов и разделов аналитики',
    'trust.d.v': '3 языка',
    'trust.d.l': 'Узбекский, русский и английский',

    'features.eyebrow': 'Возможности',
    'features.title': 'Всё, что нужно селлеру',
    'features.subtitle':
      'От заказа до чистой прибыли — в одном аккаунте. И за каждой цифрой видно, как она посчитана.',
    'features.new': 'Новое',
    'fg.money': 'Деньги и прибыль',
    'fg.stock': 'Товары и склад',
    'fg.growth': 'Рост, команда и Telegram',
    'f1.t': 'Аналитика продаж и воронка',
    'f1.d': 'Выручка, заказы и процент выкупа по дням, неделям и месяцам. Где теряются заказы — в воронке из 4 этапов, с причинами в сумах.',
    'f2.t': 'Финансовый центр',
    'f2.d': 'От выручки до выплаты Uzum и чистой прибыли — одним водопадом. Сравнение с прошлым периодом, прошлым месяцем или прошлым годом; месячный отчёт совпадает с экраном и отправляется в Telegram.',
    'f3.t': 'Экономика товаров',
    'f3.d': 'Прибыль, маржа и ROI по каждому SKU и варианту — после комиссии, логистики, хранения, рекламы и налога. Таблица выгружается в Excel с фильтрами страницы.',
    'f4.t': 'Потери и возвраты',
    'f4.d': 'Утерянные, повреждённые и возвращённые товары — с готовым текстом претензии. Доля возвратов везде считается в штуках.',
    'f5.t': 'Остатки и планировщик',
    'f5.d': 'Одно число «нужно заказать» на всех страницах. Что отгрузить со своего склада на FBO, а что закупить — отдельно; черновик поставки и Excel для поставщика — в один клик.',
    'f6.t': 'Платное хранение — по тарифу Uzum',
    'f6.d': 'Официальный тариф с 01.06.2026: оборачиваемость до 60 дней бесплатно, новые SKU бесплатны первые 30/60 дней. Прогноз на 30 дней рядом с тем, что Uzum реально списал, уведомления — в Telegram.',
    'f7.t': 'Объём, ВГХ и литровка',
    'f7.d': 'Оплаченная логистика сверяется с объёмом из карточки. Калькулятор литровки и юнит-калькулятор показывают, откуда взят каждый тариф.',
    'f8.t': 'ABC и неликвиды',
    'f8.d': 'Видно, какие товары дают 80% выручки, а какие просто замораживают деньги.',
    'f9.t': 'Рост: категории, радар, цены',
    'f9.d': 'Мои категории — прибыль, маржа, возвраты и замороженный остаток. Мой радар — ускорившиеся, замедлившиеся и заканчивающиеся товары. Карта цен — цены конкурентов, которые вы вносите сами. Только по вашим данным.',
    'f10.t': 'Команда и шаблоны доступа',
    'f10.d': 'Приглашайте сотрудников по ссылке. Шаблоны Кладовщик, Бухгалтер и Маркетолог открывают только нужные разделы и скрывают деньги там, где нужно.',
    'f11.t': 'Telegram: отчёты и дайджесты',
    'f11.d': 'Отчёты в боте за сегодня, вчера, этот месяц и этот год — с теми же цифрами, что на сайте. Недельный дайджест в понедельник в 09:00, месячный — 1-го числа; уведомления об остатках и негативных отзывах.',
    'f12.t': 'Автоответы на отзывы',
    'f12.d': 'Положительные отзывы закрываются шаблоном автоматически, о негативных сообщаем сразу.',

    'how.eyebrow': 'Как это работает',
    'how.title': 'Четыре шага — и аналитика готова',
    'how.subtitle': 'Не нужен ни разработчик, ни сложная интеграция. Всё через Telegram.',
    'how.step': 'Шаг',
    'how.s1.t': 'Нажмите /start в боте',
    'how.s1.d': 'Откройте Telegram-бота, отправьте номер телефона и название компании.',
    'how.s2.t': 'Отправьте API-ключ',
    'how.s2.d': 'seller.uzum.uz → Мой профиль → API-ключи. Ключ хранится в зашифрованном виде.',
    'how.s3.t': 'Сбор данных',
    'how.s3.d': 'Платформа выгружает историю заказов, остатков, финансов и отзывов — до 1 года, в зависимости от тарифа. При повышении тарифа старая история догружается сама.',
    'how.s4.t': 'Готовая аналитика',
    'how.s4.d': 'Заходите на сайт — все отчёты уже заполнены и ждут вас.',

    'pricing.eyebrow': 'Тарифы',
    'pricing.title': 'Простые и понятные цены',
    'pricing.subtitle':
      'Основные отчёты открыты на всех тарифах — разница в числе магазинов, кабинетов и мест в команде и в продвинутых разделах.',
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
    'plan.trial.1': 'Все базовые отчёты и финансовый центр',
    'plan.trial.2': 'Платное хранение — по тарифу Uzum',
    'plan.trial.3': 'Отчёты и дайджесты в Telegram',
    'plan.trial.4': 'Раздел «Рост», ABC, планировщик и ВГХ — в режиме просмотра',
    'plan.standard.1': 'Всё из пробного тарифа',
    'plan.standard.2': 'Рост: Мои категории, Мой радар, Карта цен',
    'plan.standard.3': 'ABC, неликвиды, планировщик, объём и ВГХ',
    'plan.standard.4': 'Команда: приглашение по ссылке и шаблоны доступа',
    'plan.standard.5': 'Автоответы на отзывы (50 в день)',
    'plan.standard.6': 'Экспорт в Excel и год истории',
    'plan.vip.1': 'Всё из Стандарта',
    'plan.vip.2': 'Безлимит кабинетов Uzum',
    'plan.vip.3': 'Доступ к API — интеграция в свою систему',
    'plan.vip.4': 'Автоответы на отзывы (2000 в день)',
    'plan.vip.5': 'Персональный менеджер',

    'faq.eyebrow': 'Вопросы и ответы',
    'faq.title': 'Частые вопросы',
    'faq.subtitle': 'Не нашли ответ? Напишите в Telegram — ответим быстро.',
    'faq.q1': 'Безопасен ли мой API-ключ?',
    'faq.a1':
      'Да. Ключ шифруется алгоритмом AES-256-GCM и используется только для чтения ваших данных. Вы можете удалить его в настройках в любой момент — на кабинет Uzum это никак не влияет.',
    'faq.q2': 'Сколько времени собираются данные?',
    'faq.a2':
      'Первая полная синхронизация обычно занимает несколько минут — самый долгий этап это история заказов. Дальше данные обновляются автоматически каждые 30–60 минут в зависимости от тарифа.',
    'faq.q3': 'Сколько магазинов и кабинетов можно подключить?',
    'faq.a3':
      'На пробном — 1, на Стандарте — 3, на VIP — до 10 магазинов. На VIP число кабинетов Uzum не ограничено.',
    'faq.q4': 'Как проходит оплата?',
    'faq.a4':
      'Через Payme, Click или банковский перевод. После оплаты тариф активируется сразу, а счёт сохраняется в вашем аккаунте.',
    'faq.q5': 'Можно ли отменить подписку?',
    'faq.a5':
      'Да, в любое время. Вы отключаете автопродление, и тариф работает до конца оплаченного периода. Данные при этом не теряются.',
    'faq.q6': 'Как работает поддержка?',
    'faq.a6':
      'Через Telegram — отвечаем по будням с 9:00 до 20:00. На тарифе VIP обращения обрабатываются вне очереди.',

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
    'hero.note': 'Connect in 2 minutes · Full analytics within minutes',
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

    'trust.a.v': 'A few minutes',
    'trust.a.l': 'And your full analytics is ready',
    'trust.b.v': '24/7',
    'trust.b.l': 'Telegram notifications',
    'trust.c.v': '30+',
    'trust.c.l': 'Reports and analytics sections',
    'trust.d.v': '3 languages',
    'trust.d.l': 'Uzbek, Russian and English',

    'features.eyebrow': 'Features',
    'features.title': 'Everything a seller actually needs',
    'features.subtitle':
      'From the order to the net profit — in one account. And every number shows how it was calculated.',
    'features.new': 'New',
    'fg.money': 'Money and profit',
    'fg.stock': 'Products and warehouse',
    'fg.growth': 'Growth, team and Telegram',
    'f1.t': 'Sales analytics and funnel',
    'f1.d': 'Revenue, orders and buyout rate by day, week and month. Where orders get lost — in a 4-stage funnel with the reasons in so‘m.',
    'f2.t': 'Finance hub',
    'f2.d': 'From revenue to the Uzum payout and net profit in one waterfall. Compare with the previous period, last month or last year; the monthly report matches the screen and can be sent to Telegram.',
    'f3.t': 'Product economics',
    'f3.d': 'Profit, margin and ROI for every SKU and variant after commission, logistics, storage, ads and tax. The table exports to Excel with the page filters.',
    'f4.t': 'Losses and returns',
    'f4.d': 'Lost, damaged and returned items — with a ready-to-send claim text. The return rate is unit-based everywhere.',
    'f5.t': 'Stock and planner',
    'f5.d': 'One “reorder” number on every page. What to ship from your own warehouse to FBO and what to buy, shown separately; a shipment draft and a supplier Excel in one click.',
    'f6.t': 'Paid storage by Uzum’s tariff',
    'f6.d': 'The official tariff from 01.06.2026: turnover up to 60 days is free, new SKUs are free for their first 30/60 days. A 30-day forecast next to what Uzum actually charged, alerts in Telegram.',
    'f7.t': 'Volume, dimensions and Litrovka',
    'f7.d': 'Logistics you paid is checked against the volume on the card. The Litrovka and unit calculators show where every tariff comes from.',
    'f8.t': 'ABC and dead stock',
    'f8.d': 'See which products bring 80% of the revenue and which ones just freeze your cash.',
    'f9.t': 'Growth: categories, radar, prices',
    'f9.d': 'My categories — profit, margin, returns and frozen stock. My radar — products speeding up, slowing down or running out. Price map — competitor prices you enter yourself. Built only from your own data.',
    'f10.t': 'Team and view templates',
    'f10.d': 'Invite people with a link. The Warehouse, Accountant and Marketer templates open only the sections they need and hide money where it matters.',
    'f11.t': 'Telegram: reports and digests',
    'f11.d': 'Bot reports for today, yesterday, this month and this year — the same numbers as the site. A weekly digest on Monday at 09:00 and a monthly one on the 1st; alerts for low stock and negative reviews.',
    'f12.t': 'Review auto-replies',
    'f12.d': 'Positive reviews are answered from templates automatically; negatives reach you instantly.',

    'how.eyebrow': 'How it works',
    'how.title': 'Four steps and your analytics is live',
    'how.subtitle': 'No developer and no complex integration. Everything happens in Telegram.',
    'how.step': 'Step',
    'how.s1.t': 'Send /start to the bot',
    'how.s1.d': 'Open the Telegram bot and share your phone number and company name.',
    'how.s2.t': 'Send your API key',
    'how.s2.d': 'seller.uzum.uz → My profile → API keys. The key is stored encrypted.',
    'how.s3.t': 'Data import',
    'how.s3.d': 'The platform imports your orders, stock, finance and review history — up to 1 year, depending on your plan. Upgrade, and the older history loads on its own.',
    'how.s4.t': 'Analytics ready',
    'how.s4.d': 'Sign in to the web app — every report is already filled in and waiting.',

    'pricing.eyebrow': 'Pricing',
    'pricing.title': 'Simple, honest pricing',
    'pricing.subtitle':
      'Core reports are open on every plan — the difference is the number of stores, cabinets and team seats, plus the advanced sections.',
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
    'plan.trial.1': 'All the core reports and the finance hub',
    'plan.trial.2': 'Paid storage by Uzum’s tariff',
    'plan.trial.3': 'Telegram reports and digests',
    'plan.trial.4': 'Growth section, ABC, the planner and dimensions — in preview mode',
    'plan.standard.1': 'Everything in Trial',
    'plan.standard.2': 'Growth: My categories, My radar, Price map',
    'plan.standard.3': 'ABC, dead stock, the planner, volume and dimensions',
    'plan.standard.4': 'Team: invite link and view templates',
    'plan.standard.5': 'Review auto-replies (50 per day)',
    'plan.standard.6': 'Excel export and 1 year of history',
    'plan.vip.1': 'Everything in Standard',
    'plan.vip.2': 'Unlimited Uzum cabinets',
    'plan.vip.3': 'API access — plug it into your own systems',
    'plan.vip.4': 'Review auto-replies (2,000 per day)',
    'plan.vip.5': 'A personal manager',

    'faq.eyebrow': 'FAQ',
    'faq.title': 'Frequently asked questions',
    'faq.subtitle': 'Still unsure? Message us on Telegram — we answer fast.',
    'faq.q1': 'Is my API key safe?',
    'faq.a1':
      'Yes. The key is encrypted with AES-256-GCM and used only to read your own data. You can delete it from settings at any time — it does not affect your Uzum cabinet.',
    'faq.q2': 'How long does the data sync take?',
    'faq.a2':
      'The first full sync usually takes a few minutes — order history is the longest step. After that data refreshes automatically every 30–60 minutes depending on your plan.',
    'faq.q3': 'How many stores and cabinets can I connect?',
    'faq.a3':
      'One on Trial, three on Standard and up to ten stores on VIP. On VIP the number of Uzum cabinets is unlimited.',
    'faq.q4': 'How do payments work?',
    'faq.a4':
      'Through Payme, Click or a bank transfer. The plan activates immediately after payment and the invoice stays in your account.',
    'faq.q5': 'Can I cancel my subscription?',
    'faq.a5':
      'Yes, any time. You switch off auto-renewal and the plan keeps working until the paid period ends. Your data is not deleted.',
    'faq.q6': 'How does support work?',
    'faq.a6':
      'Through Telegram — we reply on weekdays from 9:00 to 20:00. VIP requests are handled first.',

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

/*
 * Imkoniyatlar uch guruhda, har birida 4 ta karta (xl da bitta qator).
 * Ilgari 8 ta karta edi va moliya markazi, "O'sish", jamoa, dayjestlar va
 * rasmiy tarif bo'yicha saqlash/VGH umuman tilga olinmasdi (2026-10-27).
 * `isNew` — shu relizda qo'shilgan bo'lim; keyingi relizda olib tashlanadi.
 * Bozor (raqobatchi do'konlari) o'qilmaydi — "O'sish" kartasi faqat sotuvchining
 * o'z ma'lumotidan ekanini aytadi, tarix esa 365 kundan oshmaydi (plans.ts).
 */
const FEATURE_GROUPS = [
  {
    k: 'fg.money',
    items: [
      { icon: TrendingUp, k: 'f1', tone: 'brand', isNew: false },
      { icon: Wallet, k: 'f2', tone: 'violet', isNew: false },
      { icon: Scale, k: 'f3', tone: 'info', isNew: false },
      { icon: PackageX, k: 'f4', tone: 'danger', isNew: false },
    ],
  },
  {
    k: 'fg.stock',
    items: [
      { icon: Layers, k: 'f5', tone: 'info', isNew: false },
      { icon: Archive, k: 'f6', tone: 'warn', isNew: true },
      { icon: Box, k: 'f7', tone: 'violet', isNew: true },
      { icon: PieChart, k: 'f8', tone: 'brand', isNew: false },
    ],
  },
  {
    k: 'fg.growth',
    items: [
      { icon: Gauge, k: 'f9', tone: 'brand', isNew: true },
      { icon: Users, k: 'f10', tone: 'violet', isNew: true },
      { icon: BellRing, k: 'f11', tone: 'info', isNew: true },
      { icon: Star, k: 'f12', tone: 'warn', isNew: false },
    ],
  },
] as const;

const TONE_CLASS: Record<string, string> = {
  brand: 'bg-brand/10 text-brand-ink',
  info: 'bg-info/10 text-info-ink',
  violet: 'bg-violet/10 text-violet-ink',
  warn: 'bg-warn/10 text-warn-ink',
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
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="chip bg-brand/10 text-brand-ink ring-1 ring-inset ring-brand/25"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('hero.badge')}
                </motion.span>

                <motion.h1
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.06, ease: EASE }}
                  className="text-balance mt-6 font-title text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[44px] xl:text-[50px]"
                >
                  {t('hero.title')}
                </motion.h1>

                <motion.p
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.13, ease: EASE }}
                  className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
                >
                  {t('hero.subtitle')}
                </motion.p>

                <motion.div
                  initial={false}
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
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="mt-6 flex items-center gap-2 text-xs text-muted"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand" />
                  {t('hero.note')}
                </motion.div>

                <motion.ul
                  initial={false}
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
                  <p className="tnum font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[28px]">
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

          <div className="mt-12 space-y-10">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.k}>
                <FadeUp>
                  <h3 className="eyebrow mb-3 px-1">{t(group.k)}</h3>
                </FadeUp>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {group.items.map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <FadeUp key={f.k} delay={i * 0.06} className="h-full">
                        <div className="card card-hover group h-full p-5">
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform duration-300 ease-spring group-hover:scale-110 ${TONE_CLASS[f.tone]}`}
                            >
                              <Icon className="h-5 w-5" />
                            </span>
                            {f.isNew ? (
                              <span className="chip bg-brand/10 px-2 py-0.5 text-2xs font-bold text-brand-ink ring-1 ring-inset ring-brand/25">
                                {t('features.new')}
                              </span>
                            ) : null}
                          </div>
                          <h4 className="mt-4 font-display text-base font-bold tracking-tight text-ink">{t(`${f.k}.t`)}</h4>
                          <p className="mt-2 text-sm leading-relaxed text-muted">{t(`${f.k}.d`)}</p>
                        </div>
                      </FadeUp>
                    );
                  })}
                </div>
              </div>
            ))}
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
                      <span className="tnum font-display text-lg font-extrabold text-brand-ink">{n}</span>
                    </div>
                    <div className="lg:mt-5">
                      <p className="text-2xs font-bold uppercase tracking-[0.14em] text-muted">
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
                className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[680px] -translate-x-1/2 rounded-full bg-brand/10 blur-[110px]"
              />
              <div className="relative mx-auto max-w-2xl">
                <LandingLogo className="justify-center" />
                <h2 className="text-balance mt-7 font-title text-[24px] font-semibold leading-[1.18] tracking-[-0.02em] text-ink sm:text-[34px]">
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
