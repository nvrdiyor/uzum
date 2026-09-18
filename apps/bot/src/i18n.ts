/**
 * Bot matnlari — o'zbek va rus tillari.
 * Har bir kalit ikkala tilda ham bo'lishi shart (Messages interfeysi buni majburlaydi).
 * O'rinbosarlar: `{name}` ko'rinishida.
 */

export type BotLang = 'uz' | 'ru';

export const BOT_LANGS: readonly BotLang[] = ['uz', 'ru'] as const;

/** Bazadagi `languageCode` ni bot tiliga keltirish (en → uz) */
export function toBotLang(code: string | null | undefined): BotLang {
  return code === 'ru' ? 'ru' : 'uz';
}

export interface Messages {
  // ── Til ─────────────────────────────────────────────
  lang_ask: string;
  lang_uz: string;
  lang_ru: string;
  lang_saved: string;

  // ── Ro'yxatdan o'tish ───────────────────────────────
  start_greet: string;
  start_welcome_back: string;
  onb_phone_ask: string;
  btn_share_phone: string;
  onb_phone_need_button: string;
  onb_company_ask: string;
  onb_company_invalid: string;
  onb_tax_ask: string;
  onb_tax_invalid: string;
  onb_api_ask: string;
  onb_api_invalid: string;
  onb_api_checking: string;
  onb_api_rejected: string;
  onb_api_no_shops: string;
  onb_api_network: string;
  onb_syncing: string;
  onb_ref_applied: string;
  onb_api_deleted: string;
  onb_resume: string;

  // ── Menyu ───────────────────────────────────────────
  menu_title: string;
  btn_today: string;
  btn_stocks: string;
  btn_login: string;
  btn_billing: string;
  btn_referral: string;
  btn_settings: string;
  btn_open_site: string;
  btn_back: string;

  // ── Bugungi hisobot ─────────────────────────────────
  today_title: string;
  today_revenue: string;
  today_orders: string;
  today_profit: string;
  today_avg: string;
  today_units: string;
  today_empty: string;

  // ── Qoldiqlar ───────────────────────────────────────
  stocks_title: string;
  stocks_empty: string;
  stocks_row: string;
  stocks_row_zero: string;
  stocks_more: string;

  // ── Saytga kirish ───────────────────────────────────
  login_title: string;
  login_code: string;
  login_hint: string;
  btn_login_link: string;

  // ── Tarif ───────────────────────────────────────────
  billing_title: string;
  billing_plan: string;
  billing_status: string;
  billing_until: string;
  billing_days: string;
  billing_expired: string;
  billing_none: string;
  billing_card: string;
  btn_pricing: string;
  sub_active: string;
  sub_expired: string;
  sub_canceled: string;
  sub_pending: string;

  // ── Referal ─────────────────────────────────────────
  ref_title: string;
  ref_percent: string;
  ref_code: string;
  ref_link: string;
  ref_bot_link: string;
  ref_invited: string;
  ref_paying: string;
  ref_earned: string;
  ref_pending: string;
  ref_paid: string;

  // ── Sozlamalar ──────────────────────────────────────
  set_title: string;
  set_lang: string;
  set_notify_daily: string;
  set_notify_orders: string;
  set_notify_stock: string;
  set_api: string;
  set_saved: string;
  set_api_ask: string;
  set_api_done: string;
  set_lang_ask: string;
  on: string;
  off: string;

  // ── Xizmat ──────────────────────────────────────────
  help: string;
  id_text: string;
  support: string;
  need_start: string;
  need_company: string;
  need_api_key: string;
  error_generic: string;
  canceled: string;
  unknown_text: string;
  sync_running: string;

  // ── Sinxronizatsiya ─────────────────────────────────
  sync_done: string;
  sync_failed: string;

  // ── Kunlik hisobot ──────────────────────────────────
  daily_title: string;
  daily_top: string;
  daily_top_row: string;
  daily_critical: string;
  daily_critical_row: string;
  daily_nothing: string;

  // ── Admin ───────────────────────────────────────────
  admin_only: string;
  admin_stats: string;
  admin_broadcast_usage: string;
  admin_broadcast_done: string;
  admin_grant_usage: string;
  admin_grant_done: string;
  admin_grant_nouser: string;
  admin_grant_nocompany: string;
  admin_grant_badplan: string;
}

const uz: Messages = {
  lang_ask: 'Tilni tanlang / Выберите язык:',
  lang_uz: "🇺🇿 O'zbek",
  lang_ru: '🇷🇺 Русский',
  lang_saved: 'Til tanlandi: O‘zbek ✅',

  start_greet:
    'Assalomu alaykum, {name}! 👋\n\n<b>SavdoIQ</b> — Uzum Market sotuvchilari uchun analitika platformasi.\n\nSotuv, foyda, qoldiq va yo‘qotishlarni bir joyda ko‘ring.',
  start_welcome_back: 'Xush kelibsiz, {name}! Quyidagi menyudan foydalaning 👇',
  onb_phone_ask:
    'Boshlash uchun telefon raqamingizni yuboring.\n\nPastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing.',
  btn_share_phone: '📱 Raqamni yuborish',
  onb_phone_need_button:
    'Iltimos, pastdagi <b>«📱 Raqamni yuborish»</b> tugmasi orqali raqamingizni yuboring.',
  onb_company_ask:
    'Rahmat! ✅\n\nEndi <b>kompaniya (do‘kon) nomini</b> yozing.\nMasalan: <i>Alfa Trade</i>',
  onb_company_invalid: 'Kompaniya nomi 2 tadan 60 tagacha belgidan iborat bo‘lsin. Qaytadan yozing.',
  onb_tax_ask:
    '<b>Soliq stavkasini</b> foizda yozing.\n\nKo‘pchilik sotuvchilar uchun bu <b>1</b> (aylanmadan soliq).\nAgar bilmasangiz — shunchaki <code>1</code> deb yuboring.',
  onb_tax_invalid: 'Soliq stavkasi 0 dan 50 gacha bo‘lgan son bo‘lishi kerak. Masalan: 1',
  onb_api_ask:
    'Oxirgi qadam — <b>Uzum API kaliti</b>. 🔑\n\nQanday olinadi:\n1️⃣ <a href="https://seller.uzum.uz">seller.uzum.uz</a> saytiga kiring\n2️⃣ <b>Mening profilim</b> bo‘limini oching\n3️⃣ <b>API kalitlar</b> bo‘limiga o‘ting\n4️⃣ Kalitni nusxalab, shu yerga yuboring\n\n🔒 Kalit shifrlangan holda saqlanadi va faqat sizning ma’lumotlaringizni olishga ishlatiladi.',
  onb_api_checking: '🔍 Kalit tekshirilmoqda…',
  onb_api_rejected:
    '❌ <b>Kalit qabul qilinmadi.</b>\n\nUzum uni tanimadi — ehtimol nusxalashda xato ketgan yoki kalit bekor qilingan.\n\nseller.uzum.uz → Mening profilim → API kalitlar bo‘limidan qaytadan nusxalang va yuboring.',
  onb_api_no_shops:
    '⚠️ <b>Kalit ishlayapti, lekin unga do‘kon biriktirilmagan.</b>\n\nUzum kabinetida kalitga kamida bitta do‘kon ruxsatini bering, so‘ng qaytadan yuboring.',
  onb_api_network:
    '🌐 <b>Hozir tekshirib bo‘lmadi</b> — Uzum javob bermayapti.\n\nBir necha daqiqadan keyin qaytadan yuboring.',
  onb_api_invalid:
    'Bu API kalitga o‘xshamayapti. Kalit kamida 16 ta belgidan iborat bo‘ladi.\nIltimos, kalitni to‘liq nusxalab yuboring.',
  onb_syncing:
    '✅ Kalit qabul qilindi!\n\n⏳ <b>Ma’lumotlar yig‘ilmoqda, taxminan 30 daqiqa.</b>\nTayyor bo‘lganda sizga xabar beramiz.\n\nShu vaqt ichida saytga kirib, jarayonni kuzatishingiz mumkin.',
  onb_ref_applied: '🎁 Referal havola qabul qilindi.',
  onb_api_deleted:
    '🔒 Xavfsizlik uchun kalit yozilgan xabaringiz chatdan o‘chirildi. Kalit shifrlangan holda saqlandi.',
  onb_resume: 'Ro‘yxatdan o‘tishni yakunlaymiz 👇',

  menu_title: 'Asosiy menyu 👇',
  btn_today: '📊 Bugungi hisobot',
  btn_stocks: '📦 Qoldiqlar',
  btn_login: '🔑 Saytga kirish',
  btn_billing: '💳 Tarif',
  btn_referral: '👥 Referal',
  btn_settings: '⚙️ Sozlamalar',
  btn_open_site: '🌐 Saytga o‘tish',
  btn_back: '⬅️ Orqaga',

  today_title: '📊 <b>Bugungi hisobot</b> ({date})',
  today_revenue: '💰 Tushum: <b>{value}</b>',
  today_orders: '🧾 Buyurtmalar: <b>{value}</b>',
  today_profit: '📈 Sof foyda: <b>{value}</b>',
  today_avg: '🧮 O‘rtacha chek: <b>{value}</b>',
  today_units: '📦 Sotilgan dona: <b>{value}</b>',
  today_empty: 'Bugun hozircha buyurtma yo‘q.',

  stocks_title: '📦 <b>Kritik qoldiqlar</b> (7 kundan kam)',
  stocks_empty: '✅ Kritik qoldiq yo‘q — hammasi joyida.',
  stocks_row: '• <b>{title}</b>\n  qoldiq: {stock} dona · ~{days} kunga yetadi',
  stocks_row_zero: '• <b>{title}</b>\n  qoldiq tugagan ❗️',
  stocks_more: '\n… va yana {count} ta SKU. To‘liq ro‘yxat saytda.',

  login_title: '🔑 <b>Saytga kirish</b>',
  login_code: 'Kodingiz: <code>{code}</code>',
  login_hint: 'Kod <b>10 daqiqa</b> amal qiladi. Havolani bosing yoki kodni saytga kiriting.',
  btn_login_link: '🔓 Kirish',

  billing_title: '💳 <b>Tarif</b>',
  billing_plan: 'Joriy tarif: <b>{plan}</b>',
  billing_status: 'Holat: <b>{status}</b>',
  billing_until: 'Amal qiladi: <b>{date}</b> gacha',
  billing_days: 'Qolgan muddat: <b>{days} kun</b>',
  billing_expired: '⚠️ Tarif muddati tugagan. Yangilash uchun quyidagi tugmani bosing.',
  billing_none: 'Sizda hali faol tarif yo‘q.',
  billing_card: '\n💳 To‘lov kartasi: <code>{card}</code> ({owner})',
  btn_pricing: '💎 Tarifni yangilash',
  sub_active: 'faol',
  sub_expired: 'muddati tugagan',
  sub_canceled: 'bekor qilingan',
  sub_pending: 'to‘lov kutilmoqda',

  ref_title: '👥 <b>Referal dastur</b>',
  ref_percent: 'Har bir to‘lovdan <b>{percent}%</b> bonus olasiz.',
  ref_code: 'Kodingiz: <code>{code}</code>',
  ref_link: '🔗 Havola: {link}',
  ref_bot_link: '🤖 Bot havolasi: {link}',
  ref_invited: 'Taklif qilinganlar: <b>{count}</b>',
  ref_paying: 'Ulardan to‘lov qilganlar: <b>{count}</b>',
  ref_earned: 'Jami bonus: <b>{amount}</b>',
  ref_pending: 'Kutilmoqda: <b>{amount}</b>',
  ref_paid: 'To‘langan: <b>{amount}</b>',

  set_title: '⚙️ <b>Sozlamalar</b>',
  set_lang: '🌐 Til: {value}',
  set_notify_daily: '📅 Kunlik hisobot: {value}',
  set_notify_orders: '🧾 Buyurtma xabarlari: {value}',
  set_notify_stock: '📦 Qoldiq ogohlantirishi: {value}',
  set_api: '🔑 API kalitni yangilash',
  set_saved: 'Saqlandi ✅',
  set_api_ask:
    'Yangi <b>Uzum API kalitini</b> yuboring.\n\nseller.uzum.uz → Mening profilim → API kalitlar\n\nBekor qilish uchun /cancel',
  set_api_done: '✅ Kalit yangilandi. Ma’lumotlar qayta yig‘ilmoqda.',
  set_lang_ask: 'Qaysi tilda davom etamiz?',
  on: 'yoqilgan',
  off: 'o‘chirilgan',

  help:
    '<b>SavdoIQ bot</b>\n\n'
    + '📊 Bugungi hisobot — bugungi tushum va foyda\n'
    + '📦 Qoldiqlar — kritik SKU’lar\n'
    + '🔑 Saytga kirish — bir martalik kod\n'
    + '💳 Tarif — tarif va muddat\n'
    + '👥 Referal — kod va bonuslar\n'
    + '⚙️ Sozlamalar — til va bildirishnomalar\n\n'
    + 'Buyruqlar: /start /help /id /support',
  id_text: 'Sizning Telegram ID: <code>{id}</code>',
  support:
    '🆘 <b>Yordam</b>\n\nSavolingiz bo‘lsa shu yerga yozing — operatorlarimiz javob beradi.\nIsh vaqti: 9:00–20:00 (Toshkent).',
  need_start: 'Avval /start buyrug‘ini yuboring.',
  need_company: 'Avval ro‘yxatdan o‘ting: /start',
  need_api_key: 'Avval Uzum API kalitini ulang: /start',
  error_generic: 'Xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.',
  canceled: 'Bekor qilindi.',
  unknown_text:
    'Tushunmadim 🤔 Quyidagi menyudan foydalaning yoki /help buyrug‘ini yuboring.',
  sync_running:
    '⏳ Ma’lumotlar hali yig‘ilmoqda. Tayyor bo‘lganda sizga xabar beramiz.',

  sync_done:
    '🎉 <b>Ma’lumotlar tayyor!</b>\n\nSotuv, foyda va qoldiqlar hisoblab chiqildi.\nEndi saytga kirib to‘liq analitikani ko‘rishingiz mumkin.',
  sync_failed:
    '⚠️ Ma’lumotlarni yig‘ishda muammo bo‘ldi.\nAPI kalitni tekshirib, «⚙️ Sozlamalar → 🔑 API kalitni yangilash» orqali qayta ulang.',

  daily_title: '☀️ <b>Kechagi natijalar</b> ({date})',
  daily_top: '\n🏆 <b>Top 3 mahsulot</b>',
  daily_top_row: '{n}. {title} — {revenue} ({units} dona)',
  daily_critical: '\n⚠️ <b>Kritik qoldiqlar:</b> {count} ta SKU',
  daily_critical_row: '• {title} — {stock} dona',
  daily_nothing: 'Kecha buyurtma bo‘lmadi.',

  admin_only: 'Bu buyruq faqat administratorlar uchun.',
  admin_stats:
    '📈 <b>Statistika</b>\n\nFoydalanuvchilar: <b>{users}</b> (bugun +{usersToday})\nKompaniyalar: <b>{companies}</b>\nUlangan kabinetlar: <b>{accounts}</b>\nFaol obunalar: <b>{active}</b>\nSinov: <b>{trial}</b> · Pullik: <b>{paid}</b>\nNavbatdagi sinxronlar: <b>{queued}</b>\nBotga ulangan chatlar: <b>{chats}</b>',
  admin_broadcast_usage: 'Foydalanish: <code>/broadcast matn</code>',
  admin_broadcast_done: '📣 Yuborildi: {sent} ta, xato: {failed} ta.',
  admin_grant_usage: 'Foydalanish: <code>/grant &lt;telegramId&gt; &lt;plan&gt; &lt;oy&gt;</code>\nMasalan: <code>/grant 123456789 business 3</code>',
  admin_grant_done: '✅ {telegramId} uchun <b>{plan}</b> tarifi {months} oyga berildi ({date} gacha).',
  admin_grant_nouser: 'Bunday Telegram ID topilmadi.',
  admin_grant_nocompany: 'Bu foydalanuvchida kompaniya yo‘q.',
  admin_grant_badplan: 'Tarif noto‘g‘ri. Mumkin: trial, standard, business, vip',
};

const ru: Messages = {
  lang_ask: 'Tilni tanlang / Выберите язык:',
  lang_uz: "🇺🇿 O'zbek",
  lang_ru: '🇷🇺 Русский',
  lang_saved: 'Язык выбран: Русский ✅',

  start_greet:
    'Здравствуйте, {name}! 👋\n\n<b>SavdoIQ</b> — аналитика для продавцов Uzum Market.\n\nПродажи, прибыль, остатки и потери — в одном месте.',
  start_welcome_back: 'С возвращением, {name}! Пользуйтесь меню ниже 👇',
  onb_phone_ask:
    'Для начала отправьте свой номер телефона.\n\nНажмите кнопку <b>«📱 Отправить номер»</b> внизу.',
  btn_share_phone: '📱 Отправить номер',
  onb_phone_need_button:
    'Пожалуйста, отправьте номер через кнопку <b>«📱 Отправить номер»</b> внизу.',
  onb_company_ask:
    'Спасибо! ✅\n\nТеперь напишите <b>название компании (магазина)</b>.\nНапример: <i>Alfa Trade</i>',
  onb_company_invalid: 'Название должно содержать от 2 до 60 символов. Напишите ещё раз.',
  onb_tax_ask:
    'Укажите <b>налоговую ставку</b> в процентах.\n\nДля большинства продавцов это <b>1</b> (налог с оборота).\nЕсли не уверены — просто отправьте <code>1</code>.',
  onb_tax_invalid: 'Ставка должна быть числом от 0 до 50. Например: 1',
  onb_api_ask:
    'Последний шаг — <b>API-ключ Uzum</b>. 🔑\n\nКак получить:\n1️⃣ Зайдите на <a href="https://seller.uzum.uz">seller.uzum.uz</a>\n2️⃣ Откройте раздел <b>Мой профиль</b>\n3️⃣ Перейдите в <b>API-ключи</b>\n4️⃣ Скопируйте ключ и отправьте сюда\n\n🔒 Ключ хранится в зашифрованном виде и используется только для загрузки ваших данных.',
  onb_api_checking: '🔍 Проверяем ключ…',
  onb_api_rejected:
    '❌ <b>Ключ не принят.</b>\n\nUzum его не распознал — возможно, ошибка при копировании или ключ отозван.\n\nСкопируйте заново: seller.uzum.uz → Мой профиль → API-ключи.',
  onb_api_no_shops:
    '⚠️ <b>Ключ рабочий, но к нему не привязан магазин.</b>\n\nДайте ключу доступ хотя бы к одному магазину в кабинете Uzum и отправьте снова.',
  onb_api_network:
    '🌐 <b>Сейчас не удалось проверить</b> — Uzum не отвечает.\n\nПопробуйте через несколько минут.',
  onb_api_invalid:
    'Это не похоже на API-ключ. Ключ содержит минимум 16 символов.\nСкопируйте ключ полностью и отправьте ещё раз.',
  onb_syncing:
    '✅ Ключ принят!\n\n⏳ <b>Собираем данные, это займёт около 30 минут.</b>\nМы сообщим, когда всё будет готово.\n\nА пока можно зайти на сайт и следить за процессом.',
  onb_ref_applied: '🎁 Реферальная ссылка принята.',
  onb_api_deleted:
    '🔒 В целях безопасности сообщение с ключом удалено из чата. Ключ сохранён в зашифрованном виде.',
  onb_resume: 'Давайте завершим регистрацию 👇',

  menu_title: 'Главное меню 👇',
  btn_today: '📊 Отчёт за сегодня',
  btn_stocks: '📦 Остатки',
  btn_login: '🔑 Вход на сайт',
  btn_billing: '💳 Тариф',
  btn_referral: '👥 Рефералы',
  btn_settings: '⚙️ Настройки',
  btn_open_site: '🌐 Открыть сайт',
  btn_back: '⬅️ Назад',

  today_title: '📊 <b>Отчёт за сегодня</b> ({date})',
  today_revenue: '💰 Выручка: <b>{value}</b>',
  today_orders: '🧾 Заказы: <b>{value}</b>',
  today_profit: '📈 Чистая прибыль: <b>{value}</b>',
  today_avg: '🧮 Средний чек: <b>{value}</b>',
  today_units: '📦 Продано штук: <b>{value}</b>',
  today_empty: 'Сегодня заказов пока нет.',

  stocks_title: '📦 <b>Критические остатки</b> (меньше 7 дней)',
  stocks_empty: '✅ Критических остатков нет — всё в порядке.',
  stocks_row: '• <b>{title}</b>\n  остаток: {stock} шт · хватит на ~{days} дн.',
  stocks_row_zero: '• <b>{title}</b>\n  остаток закончился ❗️',
  stocks_more: '\n… и ещё {count} SKU. Полный список на сайте.',

  login_title: '🔑 <b>Вход на сайт</b>',
  login_code: 'Ваш код: <code>{code}</code>',
  login_hint: 'Код действует <b>10 минут</b>. Нажмите ссылку или введите код на сайте.',
  btn_login_link: '🔓 Войти',

  billing_title: '💳 <b>Тариф</b>',
  billing_plan: 'Текущий тариф: <b>{plan}</b>',
  billing_status: 'Статус: <b>{status}</b>',
  billing_until: 'Действует до: <b>{date}</b>',
  billing_days: 'Осталось: <b>{days} дн.</b>',
  billing_expired: '⚠️ Срок тарифа истёк. Нажмите кнопку ниже для продления.',
  billing_none: 'У вас пока нет активного тарифа.',
  billing_card: '\n💳 Карта для оплаты: <code>{card}</code> ({owner})',
  btn_pricing: '💎 Продлить тариф',
  sub_active: 'активен',
  sub_expired: 'истёк',
  sub_canceled: 'отменён',
  sub_pending: 'ожидает оплаты',

  ref_title: '👥 <b>Реферальная программа</b>',
  ref_percent: 'Вы получаете <b>{percent}%</b> с каждой оплаты.',
  ref_code: 'Ваш код: <code>{code}</code>',
  ref_link: '🔗 Ссылка: {link}',
  ref_bot_link: '🤖 Ссылка на бот: {link}',
  ref_invited: 'Приглашено: <b>{count}</b>',
  ref_paying: 'Из них оплатили: <b>{count}</b>',
  ref_earned: 'Всего бонусов: <b>{amount}</b>',
  ref_pending: 'В ожидании: <b>{amount}</b>',
  ref_paid: 'Выплачено: <b>{amount}</b>',

  set_title: '⚙️ <b>Настройки</b>',
  set_lang: '🌐 Язык: {value}',
  set_notify_daily: '📅 Ежедневный отчёт: {value}',
  set_notify_orders: '🧾 Уведомления о заказах: {value}',
  set_notify_stock: '📦 Предупреждения об остатках: {value}',
  set_api: '🔑 Обновить API-ключ',
  set_saved: 'Сохранено ✅',
  set_api_ask:
    'Отправьте новый <b>API-ключ Uzum</b>.\n\nseller.uzum.uz → Мой профиль → API-ключи\n\nДля отмены — /cancel',
  set_api_done: '✅ Ключ обновлён. Данные пересобираются.',
  set_lang_ask: 'На каком языке продолжим?',
  on: 'включено',
  off: 'выключено',

  help:
    '<b>Бот SavdoIQ</b>\n\n'
    + '📊 Отчёт за сегодня — выручка и прибыль\n'
    + '📦 Остатки — критические SKU\n'
    + '🔑 Вход на сайт — одноразовый код\n'
    + '💳 Тариф — тариф и срок\n'
    + '👥 Рефералы — код и бонусы\n'
    + '⚙️ Настройки — язык и уведомления\n\n'
    + 'Команды: /start /help /id /support',
  id_text: 'Ваш Telegram ID: <code>{id}</code>',
  support:
    '🆘 <b>Поддержка</b>\n\nНапишите ваш вопрос сюда — операторы ответят.\nВремя работы: 9:00–20:00 (Ташкент).',
  need_start: 'Сначала отправьте команду /start.',
  need_company: 'Сначала пройдите регистрацию: /start',
  need_api_key: 'Сначала подключите API-ключ Uzum: /start',
  error_generic: 'Произошла ошибка. Попробуйте ещё раз чуть позже.',
  canceled: 'Отменено.',
  unknown_text: 'Не понял 🤔 Воспользуйтесь меню ниже или отправьте /help.',
  sync_running: '⏳ Данные ещё собираются. Мы сообщим, когда всё будет готово.',

  sync_done:
    '🎉 <b>Данные готовы!</b>\n\nПродажи, прибыль и остатки посчитаны.\nЗаходите на сайт — вся аналитика уже там.',
  sync_failed:
    '⚠️ При сборе данных возникла проблема.\nПроверьте API-ключ и подключите заново: «⚙️ Настройки → 🔑 Обновить API-ключ».',

  daily_title: '☀️ <b>Итоги вчерашнего дня</b> ({date})',
  daily_top: '\n🏆 <b>Топ-3 товара</b>',
  daily_top_row: '{n}. {title} — {revenue} ({units} шт)',
  daily_critical: '\n⚠️ <b>Критические остатки:</b> {count} SKU',
  daily_critical_row: '• {title} — {stock} шт',
  daily_nothing: 'Вчера заказов не было.',

  admin_only: 'Команда доступна только администраторам.',
  admin_stats:
    '📈 <b>Статистика</b>\n\nПользователи: <b>{users}</b> (сегодня +{usersToday})\nКомпании: <b>{companies}</b>\nПодключено кабинетов: <b>{accounts}</b>\nАктивные подписки: <b>{active}</b>\nПробные: <b>{trial}</b> · Платные: <b>{paid}</b>\nСинхронизаций в очереди: <b>{queued}</b>\nЧатов с ботом: <b>{chats}</b>',
  admin_broadcast_usage: 'Использование: <code>/broadcast текст</code>',
  admin_broadcast_done: '📣 Отправлено: {sent}, ошибок: {failed}.',
  admin_grant_usage: 'Использование: <code>/grant &lt;telegramId&gt; &lt;plan&gt; &lt;месяцы&gt;</code>\nНапример: <code>/grant 123456789 business 3</code>',
  admin_grant_done: '✅ Пользователю {telegramId} выдан тариф <b>{plan}</b> на {months} мес. (до {date}).',
  admin_grant_nouser: 'Пользователь с таким Telegram ID не найден.',
  admin_grant_nocompany: 'У пользователя нет компании.',
  admin_grant_badplan: 'Неверный тариф. Доступно: trial, standard, business, vip',
};

const DICT: Record<BotLang, Messages> = { uz, ru };

export type TKey = keyof Messages;

/** Matnni tilga qarab olish va `{var}` o'rinbosarlarini almashtirish */
export function tr(lang: BotLang, key: TKey, vars?: Record<string, string | number>): string {
  const raw = DICT[lang][key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name];
    return v === undefined ? m : String(v);
  });
}

/** Menyu tugmasi matni bo'yicha kalitni topish (uz va ru — ikkalasi ham) */
export function matchButton(text: string): TKey | null {
  const keys: TKey[] = [
    'btn_today',
    'btn_stocks',
    'btn_login',
    'btn_billing',
    'btn_referral',
    'btn_settings',
  ];
  const clean = text.trim();
  for (const key of keys) {
    if (uz[key] === clean || ru[key] === clean) return key;
  }
  return null;
}
