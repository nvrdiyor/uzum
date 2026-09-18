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
  btn_support: string;
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

  // ── Qo'llab-quvvatlash ──────────────────────────────
  support_onb_note: string;
  support_offhours: string;
  support_sent: string;
  support_added: string;
  support_failed: string;
  support_throttled: string;
  support_media_bad: string;
  support_reply_head: string;
  btn_support_more: string;
  sup_card: string;
  sup_card_media: string;
  sup_reply_ok: string;
  sup_reply_fail: string;
  sup_which: string;
  sup_sent_via_button: string;
  sup_draft_expired: string;
  sup_tickets_title: string;
  sup_tickets_row: string;
  sup_tickets_empty: string;
  sup_reply_usage: string;
  sup_close_usage: string;
  sup_not_found: string;
  sup_closed: string;
  btn_sup_close: string;
  btn_sup_cancel: string;
  btn_faq_key: string;
  btn_faq_sync: string;
  btn_faq_billing: string;
  btn_faq_ask: string;
  faq_key: string;
  faq_sync: string;
  faq_billing: string;
  faq_ask: string;
  support_looks_like_key: string;
  sup_reply_unsupported: string;
  age_min: string;
  age_hour: string;
  age_day: string;
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
  btn_support: '🆘 Yordam',
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
    + '⚙️ Sozlamalar — til va bildirishnomalar\n'
    + '🆘 Yordam — operatorga savol\n\n'
    + 'Savolingizni shu chatga yozsangiz ham bo‘ladi — operatorga yetib boradi.\n\n'
    + 'Buyruqlar: /start /help /id /support /cancel',
  id_text: 'Sizning Telegram ID: <code>{id}</code>',
  support:
    '🆘 <b>Yordam</b>\n\n'
    + 'Savolingizni shu chatga yozing — operatorga yetib boradi va javob ham shu yerga keladi.\n'
    + 'Skrinshot, video yoki hujjat yuborsangiz ham bo‘ladi.\n\n'
    + 'Istalgan paytda: <code>/support savolingiz</code>\n\n'
    + '🕘 Ish vaqti: 9:00–20:00 (Toshkent).\n'
    + '🔒 Uzum API kalitini bu yerga yozmang — u «⚙️ Sozlamalar → 🔑 API kalitni yangilash» orqali kiritiladi.',
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
    '📈 <b>Statistika</b>\n\nFoydalanuvchilar: <b>{users}</b> (bugun +{usersToday})\nKompaniyalar: <b>{companies}</b>\nUlangan kabinetlar: <b>{accounts}</b>\nFaol obunalar: <b>{active}</b>\nSinov: <b>{trial}</b> · Pullik: <b>{paid}</b>\nNavbatdagi sinxronlar: <b>{queued}</b>\nBotga ulangan chatlar: <b>{chats}</b>\n📥 Javobsiz murojaatlar: <b>{tickets}</b>',
  admin_broadcast_usage: 'Foydalanish: <code>/broadcast matn</code>',
  admin_broadcast_done: '📣 Yuborildi: {sent} ta, xato: {failed} ta.',
  admin_grant_usage: 'Foydalanish: <code>/grant &lt;telegramId&gt; &lt;plan&gt; &lt;oy&gt;</code>\nMasalan: <code>/grant 123456789 business 3</code>',
  admin_grant_done: '✅ {telegramId} uchun <b>{plan}</b> tarifi {months} oyga berildi ({date} gacha).',
  admin_grant_nouser: 'Bunday Telegram ID topilmadi.',
  admin_grant_nocompany: 'Bu foydalanuvchida kompaniya yo‘q.',
  admin_grant_badplan: 'Tarif noto‘g‘ri. Mumkin: trial, standard, business, vip',

  support_onb_note:
    '\n\n⚠️ Hozir ro‘yxatdan o‘tish davom etmoqda, shuning uchun oddiy matn ro‘yxatga yoziladi.'
    + ' Operatorga yozish uchun <code>/support savolingiz</code> shaklidan foydalaning.',
  support_offhours: '\n🌙 Hozir ish vaqti emas — ertalab soat 9:00 dan keyin javob beramiz.',
  support_sent:
    '✅ Savolingiz operatorga yuborildi — murojaat <b>{code}</b>.\nJavob shu chatga keladi.{note}',
  support_added:
    '➕ <b>{code}</b> murojaatiga qo‘shildi. Operator javob berganda shu yerda xabar olasiz.{note}',
  support_failed:
    '⚠️ Hozir operatorga ulanib bo‘lmadi, lekin savolingiz saqlandi (<b>{code}</b>).'
    + ' Operator ko‘rishi bilan javob beradi.',
  support_throttled:
    '⏳ Juda ko‘p xabar yubordingiz. Bu xabar murojaatingizga saqlandi, lekin darhol bildirishnoma yuborilmadi'
    + ' — operator oldingi savollaringiz bilan birga ko‘radi.',
  support_media_bad:
    'Bu turdagi faylni qabul qila olmayman 🤔\nMatn, rasm, video, ovozli xabar yoki hujjat yuboring.',
  support_reply_head: '💬 <b>Operator javobi</b> · {code}',
  btn_support_more: '✍️ Yana savol',

  sup_card:
    '🆘 <b>{code}</b> · yangi murojaat\n'
    + '👤 {name} {username} · <code>{tid}</code>\n'
    + '🏢 {company} · {lang}\n\n'
    + '{body}\n\n'
    + '↩️ Javob berish uchun shu xabarga reply qiling.',
  sup_card_media:
    '🆘 <b>{code}</b> · {name} {username} · <code>{tid}</code>\n'
    + '↩️ Javob berish uchun shu xabarga reply qiling.\n\n{body}',
  sup_reply_ok: '✅ {code} ({name}) ga javob yuborildi.',
  sup_reply_fail: '⚠️ {code}: foydalanuvchiga yuborib bo‘lmadi — botni bloklagan bo‘lishi mumkin.',
  sup_which: '❓ Bu matn kimga? Reply qilmagansiz — murojaatni tanlang:',
  sup_sent_via_button: '✅ {code} ({name}) ga yuborildi.',
  sup_draft_expired: '⚠️ Matnni topa olmadim. Shunday yuboring: /reply {code} matn',
  sup_tickets_title: '📥 <b>Ochiq murojaatlar: {count}</b>',
  sup_tickets_row: '<b>{code}</b> · {name} · {age}\n{subject}',
  sup_tickets_empty: '📥 Ochiq murojaat yo‘q.',
  sup_reply_usage: 'Foydalanish: <code>/reply KOD matn</code>\nRo‘yxat: /tickets',
  sup_close_usage: 'Foydalanish: <code>/close KOD</code>',
  sup_not_found: 'Murojaat topilmadi. /tickets bilan ro‘yxatni ko‘ring.',
  sup_closed: '✅ {code} yopildi.',
  btn_sup_close: '✅ Yopish',
  btn_sup_cancel: '❌ Bekor',

  btn_faq_key: '🔑 API kalit qayerdan olinadi?',
  btn_faq_sync: '🔄 Ma’lumot qachon yangilanadi?',
  btn_faq_billing: '💳 Tarif va to‘lov',
  btn_faq_ask: '✍️ Savolimni yozmoqchiman',
  faq_key:
    '🔑 <b>API kalit qayerdan olinadi</b>\n\n'
    + '1. <a href="https://seller.uzum.uz">seller.uzum.uz</a> ga kiring\n'
    + '2. «Mening profilim» → «API kalitlar» bo‘limini oching\n'
    + '3. Yangi kalit yarating va nusxa oling\n'
    + '4. Botda «⚙️ Sozlamalar → 🔑 API kalitni yangilash» ni bosing va kalitni yuboring\n\n'
    + 'Kalit shifrlangan holda saqlanadi va faqat sizning ma’lumotingizni o‘qish uchun ishlatiladi.',
  faq_sync:
    '🔄 <b>Ma’lumot qachon yangilanadi</b>\n\n'
    + 'Har 30 daqiqada avtomatik. Birinchi ulanishda to‘liq tarix yig‘iladi — bu 30 daqiqagacha vaqt oladi.\n\n'
    + 'Oxirgi yangilanish vaqti saytdagi boshqaruv panelida ko‘rinadi. Ma’lumot eskirgandek tuyulsa, avval sahifani yangilang.',
  faq_billing:
    '💳 <b>Tarif va to‘lov</b>\n\n'
    + 'Joriy tarifingizni «💳 Tarif» tugmasi ko‘rsatadi.\n'
    + 'Tariflarni solishtirish va to‘lov: {link}\n\n'
    + 'To‘lovdan keyin tarif bir necha daqiqada faollashadi. Faollashmasa shu yerga yozing.',
  faq_ask:
    '✍️ Shunchaki savolingizni shu chatga yozing — u operatorga yetib boradi.\n'
    + 'Skrinshot yuborsangiz muammoni tezroq tushunamiz.',
  support_looks_like_key:
    '🔒 Bu <b>API kalitga</b> o‘xshaydi — uni operatorga yubormadim.\n\n'
    + 'Kalit faqat «⚙️ Sozlamalar → 🔑 API kalitni yangilash» orqali kiritiladi: u yerda shifrlanadi.\n'
    + 'Agar bu kalit bo‘lsa, uni Uzum kabinetida bekor qilib, yangisini oling.\n\n'
    + 'Savolingiz bo‘lsa oddiy so‘zlar bilan yozing.',
  sup_reply_unsupported:
    '⚠️ Bu turdagi javobni yubora olmadim. Matn, rasm yoki hujjat bilan javob bering.',
  age_min: '{n} daqiqa oldin',
  age_hour: '{n} soat oldin',
  age_day: '{n} kun oldin',
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
  btn_support: '🆘 Поддержка',
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
    + '⚙️ Настройки — язык и уведомления\n'
    + '🆘 Поддержка — вопрос оператору\n\n'
    + 'Можно просто написать вопрос в этот чат — он дойдёт до оператора.\n\n'
    + 'Команды: /start /help /id /support /cancel',
  id_text: 'Ваш Telegram ID: <code>{id}</code>',
  support:
    '🆘 <b>Поддержка</b>\n\n'
    + 'Напишите вопрос прямо в этот чат — он дойдёт до оператора, и ответ придёт сюда же.\n'
    + 'Можно приложить скриншот, видео или документ.\n\n'
    + 'В любой момент: <code>/support ваш вопрос</code>\n\n'
    + '🕘 Время работы: 9:00–20:00 (Ташкент).\n'
    + '🔒 Не отправляйте сюда API-ключ Uzum — он вводится через «⚙️ Настройки → 🔑 Обновить API-ключ».',
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
    '📈 <b>Статистика</b>\n\nПользователи: <b>{users}</b> (сегодня +{usersToday})\nКомпании: <b>{companies}</b>\nПодключено кабинетов: <b>{accounts}</b>\nАктивные подписки: <b>{active}</b>\nПробные: <b>{trial}</b> · Платные: <b>{paid}</b>\nСинхронизаций в очереди: <b>{queued}</b>\nЧатов с ботом: <b>{chats}</b>\n📥 Обращения без ответа: <b>{tickets}</b>',
  admin_broadcast_usage: 'Использование: <code>/broadcast текст</code>',
  admin_broadcast_done: '📣 Отправлено: {sent}, ошибок: {failed}.',
  admin_grant_usage: 'Использование: <code>/grant &lt;telegramId&gt; &lt;plan&gt; &lt;месяцы&gt;</code>\nНапример: <code>/grant 123456789 business 3</code>',
  admin_grant_done: '✅ Пользователю {telegramId} выдан тариф <b>{plan}</b> на {months} мес. (до {date}).',
  admin_grant_nouser: 'Пользователь с таким Telegram ID не найден.',
  admin_grant_nocompany: 'У пользователя нет компании.',
  admin_grant_badplan: 'Неверный тариф. Доступно: trial, standard, business, vip',

  support_onb_note:
    '\n\n⚠️ Сейчас идёт регистрация, поэтому обычный текст уйдёт в неё.'
    + ' Чтобы написать оператору, используйте <code>/support ваш вопрос</code>.',
  support_offhours: '\n🌙 Сейчас нерабочее время — ответим утром после 9:00.',
  support_sent:
    '✅ Ваш вопрос отправлен оператору — обращение <b>{code}</b>.\nОтвет придёт в этот чат.{note}',
  support_added:
    '➕ Добавлено к обращению <b>{code}</b>. Мы напишем сюда, когда оператор ответит.{note}',
  support_failed:
    '⚠️ Сейчас не удалось связаться с оператором, но ваш вопрос сохранён (<b>{code}</b>).'
    + ' Оператор ответит, как только увидит его.',
  support_throttled:
    '⏳ Слишком много сообщений. Это сообщение сохранено в обращении, но уведомление не отправлено'
    + ' — оператор увидит его вместе с прежними вопросами.',
  support_media_bad:
    'Не могу принять файл такого типа 🤔\nОтправьте текст, фото, видео, голосовое сообщение или документ.',
  support_reply_head: '💬 <b>Ответ оператора</b> · {code}',
  btn_support_more: '✍️ Ещё вопрос',

  sup_card:
    '🆘 <b>{code}</b> · новое обращение\n'
    + '👤 {name} {username} · <code>{tid}</code>\n'
    + '🏢 {company} · {lang}\n\n'
    + '{body}\n\n'
    + '↩️ Чтобы ответить, ответьте на это сообщение.',
  sup_card_media:
    '🆘 <b>{code}</b> · {name} {username} · <code>{tid}</code>\n'
    + '↩️ Чтобы ответить, ответьте на это сообщение.\n\n{body}',
  sup_reply_ok: '✅ Ответ отправлен по {code} ({name}).',
  sup_reply_fail: '⚠️ {code}: не удалось отправить пользователю — возможно, он заблокировал бота.',
  sup_which: '❓ Кому этот текст? Вы не ответили на сообщение — выберите обращение:',
  sup_sent_via_button: '✅ Отправлено по {code} ({name}).',
  sup_draft_expired: '⚠️ Не удалось найти текст. Отправьте так: /reply {code} текст',
  sup_tickets_title: '📥 <b>Открытые обращения: {count}</b>',
  sup_tickets_row: '<b>{code}</b> · {name} · {age}\n{subject}',
  sup_tickets_empty: '📥 Открытых обращений нет.',
  sup_reply_usage: 'Использование: <code>/reply КОД текст</code>\nСписок: /tickets',
  sup_close_usage: 'Использование: <code>/close КОД</code>',
  sup_not_found: 'Обращение не найдено. Посмотрите список через /tickets.',
  sup_closed: '✅ {code} закрыто.',
  btn_sup_close: '✅ Закрыть',
  btn_sup_cancel: '❌ Отмена',

  btn_faq_key: '🔑 Где взять API-ключ?',
  btn_faq_sync: '🔄 Когда обновляются данные?',
  btn_faq_billing: '💳 Тариф и оплата',
  btn_faq_ask: '✍️ Хочу задать вопрос',
  faq_key:
    '🔑 <b>Где взять API-ключ</b>\n\n'
    + '1. Зайдите на <a href="https://seller.uzum.uz">seller.uzum.uz</a>\n'
    + '2. Откройте «Мой профиль» → «API-ключи»\n'
    + '3. Создайте новый ключ и скопируйте его\n'
    + '4. В боте нажмите «⚙️ Настройки → 🔑 Обновить API-ключ» и отправьте ключ\n\n'
    + 'Ключ хранится в зашифрованном виде и используется только для чтения ваших данных.',
  faq_sync:
    '🔄 <b>Когда обновляются данные</b>\n\n'
    + 'Автоматически каждые 30 минут. При первом подключении собирается вся история — это занимает до 30 минут.\n\n'
    + 'Время последнего обновления видно в панели на сайте. Если данные кажутся устаревшими — сначала обновите страницу.',
  faq_billing:
    '💳 <b>Тариф и оплата</b>\n\n'
    + 'Текущий тариф показывает кнопка «💳 Тариф».\n'
    + 'Сравнение тарифов и оплата: {link}\n\n'
    + 'После оплаты тариф активируется за несколько минут. Если этого не произошло — напишите сюда.',
  faq_ask:
    '✍️ Просто напишите вопрос в этот чат — он дойдёт до оператора.\n'
    + 'Приложите скриншот, и мы быстрее поймём проблему.',
  support_looks_like_key:
    '🔒 Это похоже на <b>API-ключ</b> — я не отправил его оператору.\n\n'
    + 'Ключ вводится только через «⚙️ Настройки → 🔑 Обновить API-ключ»: там он шифруется.\n'
    + 'Если это действительно ключ — отзовите его в кабинете Uzum и создайте новый.\n\n'
    + 'Вопрос напишите обычными словами.',
  sup_reply_unsupported:
    '⚠️ Такой тип ответа отправить не удалось. Ответьте текстом, фото или документом.',
  age_min: '{n} мин. назад',
  age_hour: '{n} ч. назад',
  age_day: '{n} дн. назад',
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
    'btn_support',
  ];
  const clean = text.trim();
  for (const key of keys) {
    if (uz[key] === clean || ru[key] === clean) return key;
  }
  return null;
}
