import { registerNamespace } from '@/i18n';

/*
 * "Yangiliklar" oynasi matnlari (2026-10-27 relizi). Faqat oyna bo'lagi bilan
 * yuklanadi. Profil menyusidagi nom — umumiy lug'atda (menu.news), Ctrl+K
 * dagi amal — palette lug'atida (action.news).
 *
 * Har qator haqiqatda chiqqan narsa: bozor o'qilmaydi ("O'sish" — faqat
 * sotuvchining o'z ma'lumoti), tarix tarif chegarasigacha, ko'pi bilan 365 kun.
 * {keys} — Ctrl+K yoki ⌘K (Mac).
 */
registerNamespace('news', {
  uz: {
    title: 'Yangiliklar',
    subtitle: '27-oktabr 2026 · SavdoIQ’ga nimalar qo‘shildi',

    'g.finance': 'Moliya markazi',
    'finance.compare': 'Taqqoslash: oldingi davr, o‘tgan oy yoki o‘tgan yil bilan',
    'finance.waterfall': 'Foyda sharsharasi: tushum → Uzum to‘lovi → sof foyda',
    'finance.funnel': 'Buyurtma yo‘qotish voronkasi — 4 bosqich, sabablari so‘mda',
    'finance.economics': 'Mahsulot iqtisodi jadvali: variantlari ochiladi, Excel’ga yuklanadi',
    'finance.report': 'Oylik hisobot ekrandagi raqamlar bilan bir xil va Telegram’ga yuboriladi',
    'finance.basis': 'Moliya va Oylik hisobot: buyurtma sanasi yoki xaridor qabul qilgan sana bo‘yicha hisob',

    'g.products': 'Mahsulotlar va rejalashtiruvchi',
    'products.cards': 'Yangilangan mahsulot kartalari va mahsulot sahifasi',
    'products.search': 'Qidiruv: nom, SKU, shtrix-kod, Uzum ID yoki uzum.uz havolasi bo‘yicha',
    'products.reorder': 'Hamma joyda bitta “buyurtma kerak” soni — kompaniyaning yetkazish va zaxira kunlari bilan',
    'products.split':
      '“O‘z omboridan FBO ga” va “sotib olish” alohida; yetkazma qoralamasi va yetkazuvchi uchun Excel bir bosishda',

    'g.warehouse': 'Ombor va logistika',
    'g.warehouse.note': 'Uzum’ning 01.06.2026 dagi rasmiy tarifi bo‘yicha',
    'warehouse.storage':
      'Pullik saqlash aylanma bo‘yicha: 60 kungacha bepul, yangi SKU dastlabki 30/60 kun bepul, 30 kunlik prognoz Uzum olgan summa yonida',
    'warehouse.vgh': '“Hajm va VGH” hisoboti: to‘langan logistika kartochkadagi hajm bilan solishtiriladi',
    'warehouse.calc': 'Litrovka kalkulyatori va tarif manbalari ko‘rsatilgan unit kalkulyator',
    'warehouse.returns': 'Kalkulyatorda qaytgan tovar qayta sotiladi: uning tannarxi va logistikasi zarar emas',
    'warehouse.alerts': 'Saqlash bo‘yicha ogohlantirishlar Telegram’da',

    'g.growth': 'O‘sish',
    'g.growth.note': 'Faqat o‘z ma’lumotingizdan — bozor o‘qilmaydi',
    'growth.categories': 'Kategoriyalarim: foyda, marja, qaytarish va muzlagan qoldiq kategoriya bo‘yicha',
    'growth.radar':
      'Mening radarim: tezlashayotgan, sekinlashayotgan, yangi yulduzlar, tugayotgan va qaytarishi o‘sayotgan tovarlar',
    'growth.prices': 'Narxlar xaritasi: o‘zingiz kiritgan raqobatchi narxlari, sizning narxingiz va zararsizlik nuqtasi',

    'g.team': 'Jamoa',
    'team.invite': 'Jamoaga taklif havolasi',
    'team.views': 'Ko‘rinish shablonlari: Omborchi, Buxgalter, Marketolog — kerak joyda pul yashiriladi',
    'team.switcher': 'Bir nechta kompaniyada ishlasangiz — profil menyusida almashtirgich',

    'g.telegram': 'Telegram',
    'telegram.digests': 'Haftalik (dushanba 09:00) va oylik (1-sana 09:00) dayjest — do‘koni ulangan kompaniyalarga',
    'telegram.reports':
      'Botda Bugun, Kecha, Shu oy va Shu yil hisoboti — saytdagi raqamlar bilan bir xil; bot ingliz tilida ham',
    'telegram.orders': 'Sotuv xabarida buyurtma berilgan vaqt; yangi foydalanuvchiga bot Telegram tilida javob beradi',

    'g.dashboard': 'Boshqaruv paneli',
    'dashboard.abc': 'ABC mini-karta: tushum yoki foyda bo‘yicha',
    'dashboard.top': 'Top mahsulotlarda qoldiq kunlari va oylik potensial; dinamikada do‘konlar rejimi',
    'dashboard.palette': 'Sahifa qidiruvi — {keys}',

    'g.history': 'Tarix',
    'history.backfill': 'Tarif oshirilgach eski tarix o‘zi yuklanadi (tarif chegarasigacha, ko‘pi bilan 365 kun)',

    'g.accuracy': 'Aniqlik',
    'accuracy.ads': 'Reklama to‘lovi to‘g‘ri mahsulotlarga taqsimlanadi',
    'accuracy.returns': 'Qaytarish ulushi hamma joyda dona bo‘yicha',
    'accuracy.excel': 'Excel eksportlari sahifa filtrlariga mos',

    'lock.off': 'Tarifda yo‘q',
    'lock.preview': 'Namuna',
    newTab: '(yangi oynada ochiladi)',
    hidden: '“{view}” shablonida yopiq bo‘limlar ro‘yxatda ko‘rsatilmadi',
    'locked.note': 'Qulf — bo‘lim tarifingizda yo‘q.',
    'locked.cta': 'Tariflarni ko‘rish',
    reopen: 'Bu oynani keyin ham profil menyusidagi “Yangiliklar” yoki {keys} orqali ochasiz',
    'btn.ok': 'Tushunarli',
  },

  ru: {
    title: 'Что нового',
    subtitle: '27 октября 2026 · что появилось в SavdoIQ',

    'g.finance': 'Финансовый центр',
    'finance.compare': 'Сравнение с прошлым периодом, прошлым месяцем или прошлым годом',
    'finance.waterfall': 'Водопад прибыли: выручка → выплата Uzum → чистая прибыль',
    'finance.funnel': 'Воронка потерь заказов — 4 этапа, причины в сумах',
    'finance.economics': 'Таблица экономики товаров: варианты раскрываются, выгрузка в Excel',
    'finance.report': 'Месячный отчёт совпадает с экраном и отправляется в Telegram',
    'finance.basis': 'Финансы и месячный отчёт: учёт по дате заказа или по дате получения покупателем',

    'g.products': 'Товары и планировщик',
    'products.cards': 'Новые карточки товаров и страница товара',
    'products.search': 'Поиск по названию, SKU, штрихкоду, Uzum ID или ссылке uzum.uz',
    'products.reorder': 'Одно число «нужно заказать» везде — со сроками поставки и запаса компании',
    'products.split':
      '«Отгрузить со своего склада на FBO» и «закупить» — отдельно; черновик поставки и Excel для поставщика в один клик',

    'g.warehouse': 'Склад и логистика',
    'g.warehouse.note': 'По официальному тарифу Uzum с 01.06.2026',
    'warehouse.storage':
      'Платное хранение по оборачиваемости: до 60 дней бесплатно, новые SKU бесплатны первые 30/60 дней, прогноз на 30 дней рядом с фактическим списанием Uzum',
    'warehouse.vgh': 'Отчёт «Объём и ВГХ»: оплаченная логистика против объёма из карточки',
    'warehouse.calc': 'Калькулятор литровки и юнит-калькулятор с источниками тарифов',
    'warehouse.returns': 'В калькуляторе возврат снова продаётся: его себестоимость и логистика — не убыток',
    'warehouse.alerts': 'Предупреждения о хранении в Telegram',

    'g.growth': 'Рост',
    'g.growth.note': 'Только по вашим данным — рынок не парсится',
    'growth.categories': 'Мои категории: прибыль, маржа, возвраты и замороженный остаток по категориям',
    'growth.radar': 'Мой радар: ускоряются, замедляются, новые звёзды, заканчиваются, растут возвраты',
    'growth.prices': 'Карта цен: цены конкурентов, внесённые вручную, против вашей цены и точки безубыточности',

    'g.team': 'Команда',
    'team.invite': 'Приглашение в команду по ссылке',
    'team.views': 'Шаблоны доступа: Кладовщик, Бухгалтер, Маркетолог — деньги скрыты, где нужно',
    'team.switcher': 'Работаете в нескольких компаниях — переключатель в меню профиля',

    'g.telegram': 'Telegram',
    'telegram.digests':
      'Недельный (понедельник 09:00) и месячный (1-е число 09:00) дайджест — компаниям с подключённым магазином',
    'telegram.reports':
      'Отчёты в боте за сегодня, вчера, этот месяц и этот год — с цифрами как на сайте; бот теперь и на английском',
    'telegram.orders': 'В сообщении о продаже — время заказа; новому пользователю бот отвечает на языке Telegram',

    'g.dashboard': 'Дашборд',
    'dashboard.abc': 'Мини-карточка ABC: по выручке или прибыли',
    'dashboard.top': 'В топе товаров — дни остатка и потенциал за месяц; режим магазинов в динамике',
    'dashboard.palette': 'Поиск страниц — {keys}',

    'g.history': 'История',
    'history.backfill': 'После повышения тарифа старая история догружается сама (до лимита тарифа, не более 365 дней)',

    'g.accuracy': 'Точность',
    'accuracy.ads': 'Расходы на рекламу относятся к правильным товарам',
    'accuracy.returns': 'Доля возвратов везде считается в штуках',
    'accuracy.excel': 'Выгрузки в Excel учитывают фильтры страницы',

    'lock.off': 'Нет в тарифе',
    'lock.preview': 'Демо',
    newTab: '(откроется в новой вкладке)',
    hidden: 'Разделы, закрытые в шаблоне «{view}», в списке не показаны',
    'locked.note': 'Замок — раздела нет в вашем тарифе.',
    'locked.cta': 'Посмотреть тарифы',
    reopen: 'Окно можно открыть снова: меню профиля → «Что нового» или {keys}',
    'btn.ok': 'Понятно',
  },

  en: {
    title: 'What’s new',
    subtitle: 'October 27, 2026 · what’s new in SavdoIQ',

    'g.finance': 'Finance hub',
    'finance.compare': 'Compare with the previous period, last month or last year',
    'finance.waterfall': 'Profit waterfall: revenue → Uzum payout → net profit',
    'finance.funnel': 'Order-loss funnel — 4 stages, reasons in so‘m',
    'finance.economics': 'Product economics table: expandable variants, Excel export',
    'finance.report': 'The monthly report matches the screen and can be sent to Telegram',
    'finance.basis': 'Finance and the monthly report: count by order date or by the date the buyer received it',

    'g.products': 'Products and planner',
    'products.cards': 'Redesigned product cards and product page',
    'products.search': 'Search by name, SKU, barcode, Uzum ID or uzum.uz link',
    'products.reorder': 'One “reorder” number everywhere — with your company’s lead and cover days',
    'products.split':
      '“Ship from own warehouse to FBO” and “buy” shown separately; a shipment draft and a supplier Excel in one click',

    'g.warehouse': 'Warehouse and logistics',
    'g.warehouse.note': 'By Uzum’s official tariff from 01.06.2026',
    'warehouse.storage':
      'Turnover-based paid storage: free up to 60 days, new SKUs free for their first 30/60 days, a 30-day forecast next to what Uzum charged',
    'warehouse.vgh': '“Volume and dimensions” report: logistics paid vs the card’s volume',
    'warehouse.calc': 'Litrovka calculator and a unit calculator with tariff sources',
    'warehouse.returns': 'In the calculator a returned item is resold: its cost and logistics are not a loss',
    'warehouse.alerts': 'Storage alerts in Telegram',

    'g.growth': 'Growth',
    'g.growth.note': 'Built from your own data only — no market scraping',
    'growth.categories': 'My categories: profit, margin, returns and frozen stock by category',
    'growth.radar': 'My radar: speeding up, slowing down, new stars, running out, returns rising',
    'growth.prices': 'Price map: competitor prices you enter vs your price and break-even',

    'g.team': 'Team',
    'team.invite': 'Team invite link',
    'team.views': 'View templates: Warehouse, Accountant, Marketer — money hidden where needed',
    'team.switcher': 'Work in several companies? Switch between them in the profile menu',

    'g.telegram': 'Telegram',
    'telegram.digests': 'Weekly (Monday 09:00) and monthly (1st, 09:00) digests — for companies with a connected store',
    'telegram.reports':
      'Bot reports for today, yesterday, this month and this year — the same numbers as the site; the bot now speaks English',
    'telegram.orders': 'Sale alerts show the order time; the bot answers new users in their Telegram language',

    'g.dashboard': 'Dashboard',
    'dashboard.abc': 'ABC mini-card by revenue or profit',
    'dashboard.top': 'Top products show stock days and monthly potential; per-store mode in the dynamics chart',
    'dashboard.palette': 'Page search — {keys}',

    'g.history': 'History',
    'history.backfill': 'Older history loads automatically after a plan upgrade (up to your plan’s limit, at most 365 days)',

    'g.accuracy': 'Accuracy',
    'accuracy.ads': 'Ad fees are attributed to the right products',
    'accuracy.returns': 'Return rate is unit-based everywhere',
    'accuracy.excel': 'Excel exports follow the page filters',

    'lock.off': 'Not in plan',
    'lock.preview': 'Preview',
    newTab: '(opens in a new tab)',
    hidden: 'Sections closed in the “{view}” template are not listed',
    'locked.note': 'Lock — the section is not in your plan.',
    'locked.cta': 'See plans',
    reopen: 'Reopen it any time from the profile menu → “What’s new” or {keys}',
    'btn.ok': 'Got it',
  },
});
