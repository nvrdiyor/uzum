/**
 * Bot matnlari — o'zbek, rus va ingliz tillari.
 * Har bir kalit uchala tilda ham bo'lishi shart (Messages interfeysi buni majburlaydi),
 * `{o'rinbosar}` lar ham bir xil bo'lsin — scratchpad p6-bot/i18n-parity.mts tekshiradi.
 * O'rinbosarlar: `{name}` ko'rinishida.
 */

export type BotLang = 'uz' | 'ru' | 'en';

export const BOT_LANGS: readonly BotLang[] = ['uz', 'ru', 'en'] as const;

/**
 * Bazadagi `languageCode` ni bot tiliga keltirish; noma'lum — o'zbekcha.
 * Ilgari 'en' ham o'zbekchaga tushardi: saytda inglizchani tanlagan sotuvchi
 * botda o'zbekcha matn olardi (2026-10-27).
 */
export function toBotLang(code: string | null | undefined): BotLang {
  if (code === 'ru') return 'ru';
  if (code === 'en') return 'en';
  return 'uz';
}

/**
 * Telegram yuborgan `from.language_code` (IETF teg: "ru", "en-US", "uz") —
 * bot tiliga: ru* → ru, en* → en, uz* va qolgan hammasi → uz. FAQAT birinchi
 * murojaatda (foydalanuvchi bazada hali yo'q) ishlatiladi: tanlangan til hech
 * qachon almashtirilmaydi. Ilgari yangi foydalanuvchi til tugmasini bosguncha
 * doim o'zbekcha ko'rardi — rus tilidagi Telegram'da ham (2026-10-27).
 */
export function telegramLang(code: string | null | undefined): BotLang {
  const c = (code ?? '').trim().toLowerCase();
  if (c.startsWith('ru')) return 'ru';
  if (c.startsWith('en')) return 'en';
  return 'uz';
}

export interface Messages {
  // ── Til ─────────────────────────────────────────────
  lang_ask: string;
  lang_uz: string;
  lang_ru: string;
  lang_en: string;
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

  // ── Hisobot (bugun / kecha / shu oy / shu yil) ──────
  today_title: string;
  today_revenue: string;
  today_orders: string;
  today_profit: string;
  today_avg: string;
  today_units: string;
  today_empty: string;
  rep_title_yesterday: string;
  rep_title_month: string;
  rep_title_year: string;
  rep_empty_month: string;
  rep_empty_year: string;
  /** Tarif tarixi davr boshini kesganda (masalan, sinovda «Shu yil» = 60 kun) */
  rep_clamped: string;
  btn_rep_today: string;
  btn_rep_yesterday: string;
  btn_rep_month: string;
  btn_rep_year: string;

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
  /** Obuna tugaganda «Bugungi hisobot» / «Qoldiqlar» o'rniga */
  plan_locked_reports: string;
  /** Obuna tugaganda kunlik hisobot o'rniga (siyrak, kunlik emas) */
  plan_locked_digest: string;
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
  /** Haftalik va oylik hisobotni API ishchisi yuboradi (apps/api services/digest.ts) */
  set_notify_weekly: string;
  set_notify_monthly: string;
  set_api: string;
  set_saved: string;
  set_api_ask: string;
  set_api_done: string;
  set_api_owner_only: string;
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

  // ── Qoldiq va pullik saqlash ogohlantirishi (jobs/stock-alert.ts) ──
  stock_alert_title: string;
  stock_alert_paid_head: string;
  stock_alert_paid_row: string;
  stock_alert_paid_row_nosales: string;
  stock_alert_excess: string;
  stock_alert_near_head: string;
  stock_alert_near_row: string;
  stock_alert_near_row_novol: string;
  stock_alert_out_head: string;
  stock_alert_out_row: string;
  stock_alert_out_zero: string;
  stock_alert_more: string;
  stock_alert_total: string;
  stock_alert_total_novol: string;
  btn_storage: string;
  btn_planner: string;

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
  lang_ask: 'Tilni tanlang / Выберите язык / Choose a language:',
  lang_uz: "🇺🇿 O'zbek",
  lang_ru: '🇷🇺 Русский',
  lang_en: '🇬🇧 English',
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
    '✅ Kalit qabul qilindi!\n\n⏳ <b>Ma’lumotlar yig‘ilmoqda — odatda bir necha daqiqa.</b>\nTayyor bo‘lganda sizga xabar beramiz.\n\nShu vaqt ichida saytga kirib, jarayonni kuzatishingiz mumkin.',
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
  rep_title_yesterday: '📊 <b>Kechagi hisobot</b> ({date})',
  rep_title_month: '📊 <b>Shu oy hisoboti</b> ({from} – {to})',
  rep_title_year: '📊 <b>Shu yil hisoboti</b> ({from} – {to})',
  rep_empty_month: 'Shu oyda hozircha buyurtma yo‘q.',
  rep_empty_year: 'Shu yilda hozircha buyurtma yo‘q.',
  rep_clamped: 'ℹ️ Tarifingizda {days} kunlik tarix ochiq — hisob {date} dan boshlab.',
  btn_rep_today: 'Bugun',
  btn_rep_yesterday: 'Kecha',
  btn_rep_month: 'Shu oy',
  btn_rep_year: 'Shu yil',

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
  plan_locked_reports:
    '🔒 <b>Obuna muddati tugagan</b>\n\n'
    + 'Bugungi hisobot va qoldiqlar vaqtincha yopiq. Ma’lumotlaringiz saqlanib turibdi — '
    + 'tarifni yangilasangiz, hammasi darhol qaytadi.',
  plan_locked_digest:
    '📊 <b>Kunlik hisobot to‘xtatildi</b>\n\n'
    + 'Obuna muddati tugagani uchun hisobot yuborilmayapti. Sotuvlar, foyda va qoldiqlaringiz '
    + 'saqlanib turibdi — tarifni yangilasangiz, hisobot ertadan yana keladi.',
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
  set_notify_weekly: '🗓 Haftalik hisobot (dushanba): {value}',
  set_notify_monthly: '📆 Oylik hisobot (1-sana): {value}',
  set_api: '🔑 API kalitni yangilash',
  set_saved: 'Saqlandi ✅',
  set_api_ask:
    'Yangi <b>Uzum API kalitini</b> yuboring.\n\nseller.uzum.uz → Mening profilim → API kalitlar\n\nBekor qilish uchun /cancel',
  set_api_done: '✅ Kalit yangilandi. Ma’lumotlar qayta yig‘ilmoqda.',
  set_api_owner_only:
    '🔑 Uzum API kalitini faqat kompaniya egasi ulaydi va yangilaydi. Kalit kerak bo‘lsa, kompaniya egasiga murojaat qiling.',
  set_lang_ask: 'Qaysi tilda davom etamiz?',
  on: 'yoqilgan',
  off: 'o‘chirilgan',

  help:
    '<b>SavdoIQ bot</b>\n\n'
    + '📊 Bugungi hisobot — bugun, kecha, shu oy va shu yil\n'
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

  stock_alert_title: '📦 <b>Qoldiq va saqlash</b> · {date}',
  stock_alert_paid_head: '💸 <b>Pullik saqlashga o‘tdi: {count} ta SKU</b>',
  stock_alert_paid_row: '• {title} — aylanma {turnover} kun · {fee}/kun',
  stock_alert_paid_row_nosales: '• {title} — 15 kunda sotuv yo‘q · {fee}/kun',
  stock_alert_excess: '   ↳ {n} dona sotish yoki olib chiqish kerak',
  stock_alert_near_head: '⏳ <b>Tez orada pullik: {count} ta SKU</b> (aylanma {from}–{to} kun)',
  stock_alert_near_row: '• {title} — {turnover} kun · pullik bo‘lsa ~{fee}/kun',
  stock_alert_near_row_novol: '• {title} — {turnover} kun',
  stock_alert_out_head: '🔻 <b>Tugayapti: {count} ta SKU</b> (yetkazish muddati {lead} kun)',
  stock_alert_out_row: '• {title} — {stock} dona · ~{days} kunga yetadi',
  stock_alert_out_zero: '📭 Qoldig‘i tugagan (sotuvi bor edi): {count} ta SKU',
  stock_alert_more: '… va yana {count} ta',
  stock_alert_total: '💰 Jami pullik saqlashda: {count} ta SKU · ~{fee}/kun',
  stock_alert_total_novol: ' ({n} tasining hajmi noma’lum)',
  btn_storage: '💸 Pullik saqlash',
  btn_planner: '📦 Rejalashtiruvchi',

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
    + 'Tarifga qarab har 30–60 daqiqada avtomatik. Birinchi ulanishda tarifingizdagi tarix (1 yilgacha) yig‘iladi — bu odatda bir necha daqiqa oladi.\n\n'
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
  lang_ask: 'Tilni tanlang / Выберите язык / Choose a language:',
  lang_uz: "🇺🇿 O'zbek",
  lang_ru: '🇷🇺 Русский',
  lang_en: '🇬🇧 English',
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
    '✅ Ключ принят!\n\n⏳ <b>Собираем данные — обычно это несколько минут.</b>\nМы сообщим, когда всё будет готово.\n\nА пока можно зайти на сайт и следить за процессом.',
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
  rep_title_yesterday: '📊 <b>Отчёт за вчера</b> ({date})',
  rep_title_month: '📊 <b>Отчёт за месяц</b> ({from} – {to})',
  rep_title_year: '📊 <b>Отчёт за год</b> ({from} – {to})',
  rep_empty_month: 'В этом месяце заказов пока нет.',
  rep_empty_year: 'В этом году заказов пока нет.',
  rep_clamped: 'ℹ️ На вашем тарифе доступна история за {days} дн. — расчёт с {date}.',
  btn_rep_today: 'Сегодня',
  btn_rep_yesterday: 'Вчера',
  btn_rep_month: 'Этот месяц',
  btn_rep_year: 'Этот год',

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
  plan_locked_reports:
    '🔒 <b>Срок подписки истёк</b>\n\n'
    + 'Отчёт за сегодня и остатки временно закрыты. Ваши данные сохранены — '
    + 'продлите тариф, и всё сразу вернётся.',
  plan_locked_digest:
    '📊 <b>Ежедневный отчёт приостановлен</b>\n\n'
    + 'Срок подписки истёк, поэтому отчёт не отправляется. Продажи, прибыль и остатки '
    + 'сохранены — продлите тариф, и отчёт снова придёт со следующего дня.',
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
  set_notify_weekly: '🗓 Недельный отчёт (пн): {value}',
  set_notify_monthly: '📆 Месячный отчёт (1-е число): {value}',
  set_api: '🔑 Обновить API-ключ',
  set_saved: 'Сохранено ✅',
  set_api_ask:
    'Отправьте новый <b>API-ключ Uzum</b>.\n\nseller.uzum.uz → Мой профиль → API-ключи\n\nДля отмены — /cancel',
  set_api_done: '✅ Ключ обновлён. Данные пересобираются.',
  set_api_owner_only:
    '🔑 API-ключ Uzum подключает и обновляет только владелец компании. Если ключ нужен, обратитесь к владельцу.',
  set_lang_ask: 'На каком языке продолжим?',
  on: 'включено',
  off: 'выключено',

  help:
    '<b>Бот SavdoIQ</b>\n\n'
    + '📊 Отчёт за сегодня — сегодня, вчера, месяц и год\n'
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

  stock_alert_title: '📦 <b>Остатки и хранение</b> · {date}',
  stock_alert_paid_head: '💸 <b>Перешли на платное хранение: {count} SKU</b>',
  stock_alert_paid_row: '• {title} — оборачиваемость {turnover} дн. · {fee}/день',
  stock_alert_paid_row_nosales: '• {title} — нет продаж за 15 дн. · {fee}/день',
  stock_alert_excess: '   ↳ продать или вывезти: {n} шт',
  stock_alert_near_head: '⏳ <b>Скоро платное: {count} SKU</b> (оборачиваемость {from}–{to} дн.)',
  stock_alert_near_row: '• {title} — {turnover} дн. · если станет платным, ~{fee}/день',
  stock_alert_near_row_novol: '• {title} — {turnover} дн.',
  stock_alert_out_head: '🔻 <b>Заканчиваются: {count} SKU</b> (срок поставки {lead} дн.)',
  stock_alert_out_row: '• {title} — {stock} шт · хватит на ~{days} дн.',
  stock_alert_out_zero: '📭 Остаток закончился (были продажи): {count} SKU',
  stock_alert_more: '… и ещё {count}',
  stock_alert_total: '💰 Всего на платном хранении: {count} SKU · ~{fee}/день',
  stock_alert_total_novol: ' (без объёма: {n})',
  btn_storage: '💸 Платное хранение',
  btn_planner: '📦 Планировщик',

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
    + 'Автоматически каждые 30–60 минут в зависимости от тарифа. При первом подключении собирается история по вашему тарифу (до 1 года) — обычно это несколько минут.\n\n'
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

/*
 * Ingliz tili (2026-10-27). Sayt uchala tilda ishlaydi, bot esa faqat uz/ru
 * edi — saytda inglizchani tanlagan sotuvchi botda o'zbekcha matn olardi.
 * Tugma yorliqlari ham shu yerda; eski klaviaturalar `matchButton` da uchala
 * til bilan solishtiriladi.
 */
const en: Messages = {
  lang_ask: 'Tilni tanlang / Выберите язык / Choose a language:',
  lang_uz: "🇺🇿 O'zbek",
  lang_ru: '🇷🇺 Русский',
  lang_en: '🇬🇧 English',
  lang_saved: 'Language set: English ✅',

  start_greet:
    'Hello, {name}! 👋\n\n<b>SavdoIQ</b> is an analytics platform for Uzum Market sellers.\n\nSales, profit, stock and losses — all in one place.',
  start_welcome_back: 'Welcome back, {name}! Use the menu below 👇',
  onb_phone_ask: 'To get started, share your phone number.\n\nTap the <b>“📱 Share number”</b> button below.',
  btn_share_phone: '📱 Share number',
  onb_phone_need_button: 'Please share your number using the <b>“📱 Share number”</b> button below.',
  onb_company_ask:
    'Thank you! ✅\n\nNow type your <b>company (store) name</b>.\nFor example: <i>Alfa Trade</i>',
  onb_company_invalid: 'The name must be 2 to 60 characters long. Please try again.',
  onb_tax_ask:
    'Enter your <b>tax rate</b> as a percentage.\n\nFor most sellers it is <b>1</b> (turnover tax).\nIf you are not sure, just send <code>1</code>.',
  onb_tax_invalid: 'The tax rate must be a number from 0 to 50. For example: 1',
  onb_api_ask:
    'Last step — your <b>Uzum API key</b>. 🔑\n\nHow to get it:\n1️⃣ Go to <a href="https://seller.uzum.uz">seller.uzum.uz</a>\n2️⃣ Open <b>My profile</b>\n3️⃣ Go to <b>API keys</b>\n4️⃣ Copy the key and send it here\n\n🔒 The key is stored encrypted and is used only to fetch your data.',
  onb_api_checking: '🔍 Checking the key…',
  onb_api_rejected:
    '❌ <b>The key was not accepted.</b>\n\nUzum did not recognise it — it may have been copied incorrectly or revoked.\n\nCopy it again from seller.uzum.uz → My profile → API keys and send it here.',
  onb_api_no_shops:
    '⚠️ <b>The key works, but no store is linked to it.</b>\n\nGive the key access to at least one store in your Uzum account, then send it again.',
  onb_api_network:
    '🌐 <b>Could not check the key right now</b> — Uzum is not responding.\n\nPlease send it again in a few minutes.',
  onb_api_invalid:
    'This does not look like an API key. A key is at least 16 characters long.\nPlease copy the whole key and send it again.',
  onb_syncing:
    '✅ Key accepted!\n\n⏳ <b>Collecting your data — this usually takes a few minutes.</b>\nWe will let you know when it is ready.\n\nMeanwhile, you can open the website and follow the progress.',
  onb_ref_applied: '🎁 Referral link applied.',
  onb_api_deleted:
    '🔒 For security, the message with your key was deleted from the chat. The key is stored encrypted.',
  onb_resume: 'Let’s finish signing up 👇',

  menu_title: 'Main menu 👇',
  btn_today: '📊 Today’s report',
  btn_stocks: '📦 Stock',
  btn_login: '🔑 Sign in to website',
  btn_billing: '💳 Plan',
  btn_referral: '👥 Referrals',
  btn_settings: '⚙️ Settings',
  btn_support: '🆘 Support',
  btn_open_site: '🌐 Open website',
  btn_back: '⬅️ Back',

  today_title: '📊 <b>Today’s report</b> ({date})',
  today_revenue: '💰 Revenue: <b>{value}</b>',
  today_orders: '🧾 Orders: <b>{value}</b>',
  today_profit: '📈 Net profit: <b>{value}</b>',
  today_avg: '🧮 Average order: <b>{value}</b>',
  today_units: '📦 Units sold: <b>{value}</b>',
  today_empty: 'No orders yet today.',
  rep_title_yesterday: '📊 <b>Yesterday’s report</b> ({date})',
  rep_title_month: '📊 <b>This month</b> ({from} – {to})',
  rep_title_year: '📊 <b>This year</b> ({from} – {to})',
  rep_empty_month: 'No orders yet this month.',
  rep_empty_year: 'No orders yet this year.',
  rep_clamped: 'ℹ️ Your plan includes {days} days of history, so this report starts on {date}.',
  btn_rep_today: 'Today',
  btn_rep_yesterday: 'Yesterday',
  btn_rep_month: 'This month',
  btn_rep_year: 'This year',

  stocks_title: '📦 <b>Critical stock</b> (under 7 days)',
  stocks_empty: '✅ No critical stock — all good.',
  stocks_row: '• <b>{title}</b>\n  stock: {stock} pcs · lasts ~{days} days',
  stocks_row_zero: '• <b>{title}</b>\n  out of stock ❗️',
  stocks_more: '\n… and {count} more SKUs. Full list on the website.',

  login_title: '🔑 <b>Sign in to the website</b>',
  login_code: 'Your code: <code>{code}</code>',
  login_hint: 'The code is valid for <b>10 minutes</b>. Tap the link or enter the code on the website.',
  btn_login_link: '🔓 Sign in',

  billing_title: '💳 <b>Plan</b>',
  billing_plan: 'Current plan: <b>{plan}</b>',
  billing_status: 'Status: <b>{status}</b>',
  billing_until: 'Valid until: <b>{date}</b>',
  billing_days: 'Days left: <b>{days}</b>',
  billing_expired: '⚠️ Your plan has expired. Tap the button below to renew it.',
  plan_locked_reports:
    '🔒 <b>Your subscription has expired</b>\n\n'
    + 'Reports and stock are locked for now. Your data is kept — '
    + 'renew your plan and everything comes back right away.',
  plan_locked_digest:
    '📊 <b>Daily report paused</b>\n\n'
    + 'Your subscription has expired, so the report is not being sent. Your sales, profit and stock '
    + 'are kept — renew your plan and the report will resume the next day.',
  billing_none: 'You do not have an active plan yet.',
  billing_card: '\n💳 Payment card: <code>{card}</code> ({owner})',
  btn_pricing: '💎 Renew plan',
  sub_active: 'active',
  sub_expired: 'expired',
  sub_canceled: 'canceled',
  sub_pending: 'awaiting payment',

  ref_title: '👥 <b>Referral program</b>',
  ref_percent: 'You get a <b>{percent}%</b> bonus on every payment.',
  ref_code: 'Your code: <code>{code}</code>',
  ref_link: '🔗 Link: {link}',
  ref_bot_link: '🤖 Bot link: {link}',
  ref_invited: 'Invited: <b>{count}</b>',
  ref_paying: 'Of them, paying: <b>{count}</b>',
  ref_earned: 'Total bonus: <b>{amount}</b>',
  ref_pending: 'Pending: <b>{amount}</b>',
  ref_paid: 'Paid out: <b>{amount}</b>',

  set_title: '⚙️ <b>Settings</b>',
  set_lang: '🌐 Language: {value}',
  set_notify_daily: '📅 Daily report: {value}',
  set_notify_orders: '🧾 Order notifications: {value}',
  set_notify_stock: '📦 Stock alerts: {value}',
  set_notify_weekly: '🗓 Weekly report (Monday): {value}',
  set_notify_monthly: '📆 Monthly report (1st): {value}',
  set_api: '🔑 Update API key',
  set_saved: 'Saved ✅',
  set_api_ask:
    'Send your new <b>Uzum API key</b>.\n\nseller.uzum.uz → My profile → API keys\n\nTo cancel, send /cancel',
  set_api_done: '✅ Key updated. Your data is being collected again.',
  set_api_owner_only:
    '🔑 Only the company owner can connect or update the Uzum API key. If you need a key, please ask the owner.',
  set_lang_ask: 'Which language would you like to continue in?',
  on: 'on',
  off: 'off',

  help:
    '<b>SavdoIQ bot</b>\n\n'
    + '📊 Today’s report — today, yesterday, this month and this year\n'
    + '📦 Stock — critical SKUs\n'
    + '🔑 Sign in to website — one-time code\n'
    + '💳 Plan — plan and expiry date\n'
    + '👥 Referrals — code and bonuses\n'
    + '⚙️ Settings — language and notifications\n'
    + '🆘 Support — ask an operator\n\n'
    + 'You can also just type your question in this chat — it will reach an operator.\n\n'
    + 'Commands: /start /help /id /support /cancel',
  id_text: 'Your Telegram ID: <code>{id}</code>',
  support:
    '🆘 <b>Support</b>\n\n'
    + 'Type your question in this chat — it goes to an operator, and the reply comes back here.\n'
    + 'You can also send a screenshot, video or document.\n\n'
    + 'Any time: <code>/support your question</code>\n\n'
    + '🕘 Working hours: 9:00–20:00 (Tashkent).\n'
    + '🔒 Do not send your Uzum API key here — enter it via “⚙️ Settings → 🔑 Update API key”.',
  need_start: 'Please send /start first.',
  need_company: 'Please sign up first: /start',
  need_api_key: 'Please connect your Uzum API key first: /start',
  error_generic: 'Something went wrong. Please try again in a moment.',
  canceled: 'Canceled.',
  unknown_text: 'Sorry, I didn’t get that 🤔 Use the menu below or send /help.',
  sync_running: '⏳ Your data is still being collected. We will let you know when it is ready.',

  sync_done:
    '🎉 <b>Your data is ready!</b>\n\nSales, profit and stock have been calculated.\nOpen the website to see the full analytics.',
  sync_failed:
    '⚠️ There was a problem collecting your data.\nCheck your API key and reconnect it via “⚙️ Settings → 🔑 Update API key”.',

  daily_title: '☀️ <b>Yesterday’s results</b> ({date})',
  daily_top: '\n🏆 <b>Top 3 products</b>',
  daily_top_row: '{n}. {title} — {revenue} ({units} pcs)',
  daily_critical: '\n⚠️ <b>Critical stock:</b> {count} SKUs',
  daily_critical_row: '• {title} — {stock} pcs',
  daily_nothing: 'No orders yesterday.',

  stock_alert_title: '📦 <b>Stock and storage</b> · {date}',
  stock_alert_paid_head: '💸 <b>Moved to paid storage: {count} SKUs</b>',
  stock_alert_paid_row: '• {title} — turnover {turnover} days · {fee}/day',
  stock_alert_paid_row_nosales: '• {title} — no sales in 15 days · {fee}/day',
  stock_alert_excess: '   ↳ sell or remove {n} pcs',
  stock_alert_near_head: '⏳ <b>Paid storage soon: {count} SKUs</b> (turnover {from}–{to} days)',
  stock_alert_near_row: '• {title} — {turnover} days · if paid, ~{fee}/day',
  stock_alert_near_row_novol: '• {title} — {turnover} days',
  stock_alert_out_head: '🔻 <b>Running out: {count} SKUs</b> (lead time {lead} days)',
  stock_alert_out_row: '• {title} — {stock} pcs · lasts ~{days} days',
  stock_alert_out_zero: '📭 Out of stock (had sales): {count} SKUs',
  stock_alert_more: '… and {count} more',
  stock_alert_total: '💰 Total in paid storage: {count} SKUs · ~{fee}/day',
  stock_alert_total_novol: ' ({n} with unknown volume)',
  btn_storage: '💸 Paid storage',
  btn_planner: '📦 Planner',

  admin_only: 'This command is for administrators only.',
  admin_stats:
    '📈 <b>Statistics</b>\n\nUsers: <b>{users}</b> (today +{usersToday})\nCompanies: <b>{companies}</b>\nConnected accounts: <b>{accounts}</b>\nActive subscriptions: <b>{active}</b>\nTrial: <b>{trial}</b> · Paid: <b>{paid}</b>\nQueued syncs: <b>{queued}</b>\nChats with the bot: <b>{chats}</b>\n📥 Unanswered tickets: <b>{tickets}</b>',
  admin_broadcast_usage: 'Usage: <code>/broadcast text</code>',
  admin_broadcast_done: '📣 Sent: {sent}, failed: {failed}.',
  admin_grant_usage: 'Usage: <code>/grant &lt;telegramId&gt; &lt;plan&gt; &lt;months&gt;</code>\nExample: <code>/grant 123456789 business 3</code>',
  admin_grant_done: '✅ Plan <b>{plan}</b> granted to {telegramId} for {months} months (until {date}).',
  admin_grant_nouser: 'No user found with this Telegram ID.',
  admin_grant_nocompany: 'This user has no company.',
  admin_grant_badplan: 'Invalid plan. Allowed: trial, standard, business, vip',

  support_onb_note:
    '\n\n⚠️ You are still signing up, so plain text is treated as a sign-up answer.'
    + ' To write to an operator, use <code>/support your question</code>.',
  support_offhours: '\n🌙 We are outside working hours — we will reply after 9:00 in the morning.',
  support_sent:
    '✅ Your question was sent to an operator — ticket <b>{code}</b>.\nThe reply will come to this chat.{note}',
  support_added:
    '➕ Added to ticket <b>{code}</b>. You will get a message here when the operator replies.{note}',
  support_failed:
    '⚠️ Could not reach an operator right now, but your question is saved (<b>{code}</b>).'
    + ' The operator will reply as soon as they see it.',
  support_throttled:
    '⏳ Too many messages. This one was saved to your ticket, but no notification was sent'
    + ' — the operator will see it together with your earlier questions.',
  support_media_bad:
    'I can’t accept this type of file 🤔\nPlease send text, a photo, video, voice message or document.',
  support_reply_head: '💬 <b>Operator reply</b> · {code}',
  btn_support_more: '✍️ Ask another question',

  sup_card:
    '🆘 <b>{code}</b> · new ticket\n'
    + '👤 {name} {username} · <code>{tid}</code>\n'
    + '🏢 {company} · {lang}\n\n'
    + '{body}\n\n'
    + '↩️ Reply to this message to answer.',
  sup_card_media:
    '🆘 <b>{code}</b> · {name} {username} · <code>{tid}</code>\n'
    + '↩️ Reply to this message to answer.\n\n{body}',
  sup_reply_ok: '✅ Reply sent to {code} ({name}).',
  sup_reply_fail: '⚠️ {code}: could not deliver to the user — they may have blocked the bot.',
  sup_which: '❓ Who is this text for? You did not reply to a message — choose a ticket:',
  sup_sent_via_button: '✅ Sent to {code} ({name}).',
  sup_draft_expired: '⚠️ Could not find the text. Send it like this: /reply {code} text',
  sup_tickets_title: '📥 <b>Open tickets: {count}</b>',
  sup_tickets_row: '<b>{code}</b> · {name} · {age}\n{subject}',
  sup_tickets_empty: '📥 No open tickets.',
  sup_reply_usage: 'Usage: <code>/reply CODE text</code>\nList: /tickets',
  sup_close_usage: 'Usage: <code>/close CODE</code>',
  sup_not_found: 'Ticket not found. See the list with /tickets.',
  sup_closed: '✅ {code} closed.',
  btn_sup_close: '✅ Close',
  btn_sup_cancel: '❌ Cancel',

  btn_faq_key: '🔑 Where do I get an API key?',
  btn_faq_sync: '🔄 When is data updated?',
  btn_faq_billing: '💳 Plans and payment',
  btn_faq_ask: '✍️ I want to ask a question',
  faq_key:
    '🔑 <b>Where to get an API key</b>\n\n'
    + '1. Go to <a href="https://seller.uzum.uz">seller.uzum.uz</a>\n'
    + '2. Open “My profile” → “API keys”\n'
    + '3. Create a new key and copy it\n'
    + '4. In the bot, tap “⚙️ Settings → 🔑 Update API key” and send the key\n\n'
    + 'The key is stored encrypted and is used only to read your data.',
  faq_sync:
    '🔄 <b>When data is updated</b>\n\n'
    + 'Automatically every 30–60 minutes, depending on your plan. On first connection, the history included in your plan (up to 1 year) is collected — this usually takes a few minutes.\n\n'
    + 'The last update time is shown on the website dashboard. If the data looks out of date, refresh the page first.',
  faq_billing:
    '💳 <b>Plans and payment</b>\n\n'
    + 'The “💳 Plan” button shows your current plan.\n'
    + 'Compare plans and pay: {link}\n\n'
    + 'After payment, your plan is activated within a few minutes. If it is not, write to us here.',
  faq_ask:
    '✍️ Just type your question in this chat — it will reach an operator.\n'
    + 'A screenshot helps us understand the problem faster.',
  support_looks_like_key:
    '🔒 This looks like an <b>API key</b>, so I did not send it to the operator.\n\n'
    + 'The key is entered only via “⚙️ Settings → 🔑 Update API key”, where it is encrypted.\n'
    + 'If this is your key, revoke it in your Uzum account and create a new one.\n\n'
    + 'If you have a question, please write it in plain words.',
  sup_reply_unsupported:
    '⚠️ Could not send this type of reply. Please reply with text, a photo or a document.',
  age_min: '{n} min ago',
  age_hour: '{n} h ago',
  age_day: '{n} d ago',
};

const DICT: Record<BotLang, Messages> = { uz, ru, en };

/**
 * Lug'atlar — faqat o'qish uchun: kalitlar va `{o'rinbosar}` lar uchala tilda
 * tengligini tekshiruvchi skript shu yerdan oladi (Messages interfeysi
 * kalitlarni majburlaydi, o'rinbosarlarni esa yo'q).
 */
export const MESSAGES: Readonly<Record<BotLang, Readonly<Messages>>> = DICT;

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

/**
 * Menyu tugmasi matni bo'yicha kalitni topish — UCHALA til bilan: til
 * almashganda klientda eski tildagi klaviatura qolishi mumkin.
 */
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
    if (uz[key] === clean || ru[key] === clean || en[key] === clean) return key;
  }
  return null;
}
