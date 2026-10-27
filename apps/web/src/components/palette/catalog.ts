/**
 * Buyruq oynasining ma’lumotlari: sahifa sinonimlari, Sozlamalar bo‘limlari,
 * davr presetlari va til nomlari.
 *
 * Sahifalarning O‘ZI bu yerda yo‘q — ular `lib/nav.ts` dagi NAV dan olinadi,
 * shuning uchun menyuga qo‘shilgan har yangi sahifa oynada ham avtomatik
 * chiqadi va qulf (tarif) qoidasi yon menyu bilan bir xil bo‘ladi. Bu fayl
 * faqat "boshqacha aytilishi"ni beradi: sotuvchi "zakaz", "ostatki" yoki
 * "прибыль" deb yozganda ham kerakli sahifa topilsin (2026-10-24).
 *
 * Sinonim — ODAMLAR HAQIQATDA YOZADIGAN so‘z: o‘zbekcha, ruscha, inglizcha va
 * lotin harfidagi ruscha ("sebestoimost"). Uydirma qisqartma qo‘shilmasin —
 * har ortiqcha so‘z boshqa so‘rovda shovqin bo‘lib chiqadi.
 */
import { Bell, Building2, KeyRound, Palette, UserRound, Users, type AppIcon } from '@/components/icons';
import type { SectionId } from '@/components/settings/types';
import type { Lang } from '@/i18n';

/** Kalit — NAV dagi `to`. Menyuda yo‘q manzil shunchaki ishlatilmaydi */
export const PAGE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  '/dashboard': ['bosh sahifa', 'asosiy', 'umumiy', 'bugun', 'главная', 'дашборд', 'сводка', 'обзор', 'сегодня', 'home', 'overview', 'summary', 'today'],
  '/sales': ['sotuv', 'savdo', 'buyurtma', 'zakaz', 'tushum', 'продажи', 'заказы', 'выручка', 'sales', 'orders', 'revenue', 'prodaji'],
  '/payout': ['to‘lov', 'pul', 'pul yechish', 'выплаты', 'вывод', 'деньги', 'payout', 'payments', 'cash'],
  '/funnel': ['voronka', 'konversiya', 'ko‘rishlar', 'savatcha', 'воронка', 'конверсия', 'просмотры', 'корзина', 'funnel', 'conversion', 'views', 'cart'],
  '/sales-stock': ['aylanma', 'oborot', 'оборачиваемость', 'оборот', 'turnover', 'sell through'],
  '/reports': ['hisobot', 'oylik', 'oy yakuni', 'отчёт', 'месячный', 'report', 'monthly', 'otchet'],
  '/planner': ['reja', 'rejalashtirish', 'buyurtma berish', 'xarid', 'prognoz', 'план', 'закупка', 'прогноз', 'дозаказ', 'forecast', 'reorder', 'purchase', 'zakupka'],
  '/products': ['tovar', 'mahsulot', 'assortiment', 'katalog', 'товары', 'ассортимент', 'каталог', 'products', 'catalog', 'items', 'tovary'],
  '/sku-health': ['sku', 'holat', 'muammo', 'состояние', 'проблемы', 'здоровье', 'health', 'issues'],
  '/cards': ['kartochka', 'seo', 'tavsif', 'sarlavha', 'kalit so‘z', 'карточка', 'описание', 'ключевые слова', 'card', 'listing', 'keywords'],
  '/abc': ['abc', 'xyz', 'pareto', 'анализ', 'analysis'],
  '/cost-price': ['tannarx', 'tan narx', 'xarid narxi', 'себестоимость', 'закупочная цена', 'cost', 'cogs', 'purchase price', 'sebestoimost'],
  '/batches': ['partiya', 'kirim', 'zavoz', 'партия', 'приход', 'batch', 'lot'],
  '/mxik': ['mxik', 'ikpu', 'soliq kodi', 'икпу', 'мхик', 'tax code'],
  '/illiquid': ['nolikvid', 'harakatsiz', 'sotilmayotgan', 'yotib qolgan', 'неликвид', 'залежалый', 'dead stock', 'slow moving', 'nelikvid'],
  '/promos': ['aksiya', 'chegirma', 'skidka', 'promo', 'акция', 'скидка', 'промо', 'discount', 'promotion', 'akciya'],
  '/stocks': ['qoldiq', 'zaxira', 'fbo', 'fbs', 'остатки', 'запас', 'stock', 'inventory', 'ostatki'],
  '/warehouse': ['ombor', 'sklad', 'o‘z ombori', 'склад', 'warehouse', 'own stock'],
  '/shipments': ['yetkazma', 'jo‘natma', 'postavka', 'поставки', 'отгрузка', 'shipment', 'supply'],
  '/losses': ['yo‘qotish', 'kamomad', 'brak', 'потери', 'недостача', 'брак', 'losses', 'lost', 'shrinkage'],
  '/returns': ['qaytarish', 'qaytgan', 'vozvrat', 'возвраты', 'возврат', 'returns', 'refund'],
  '/storage': ['saqlash', 'saqlash to‘lovi', 'хранение', 'платное хранение', 'storage', 'storage fee', 'hranenie'],
  '/vgh': ['vgh', 'hajm', 'o‘lcham', 'gabarit', 'vazn', 'вгх', 'объём', 'габариты', 'вес', 'volume', 'dimensions', 'weight', 'size'],
  '/finance': ['moliya', 'p&l', 'pnl', 'foyda va zarar', 'daromad', 'финансы', 'прибыли и убытки', 'опиу', 'finance', 'profit and loss', 'income'],
  '/product-profit': ['foyda', 'sof foyda', 'marja', 'rentabellik', 'прибыль', 'маржа', 'рентабельность', 'profit', 'margin', 'roi', 'pribyl'],
  '/unit-economics': ['unit', 'unit iqtisod', 'юнит', 'экономика', 'unit economics'],
  '/expenses': ['xarajat', 'chiqim', 'reklama', 'ish haqi', 'ijara', 'расходы', 'затраты', 'реклама', 'expenses', 'costs', 'ads', 'rasxod'],
  '/calculator': ['kalkulyator', 'kalkulator', 'hisoblash', 'narx hisoblash', 'калькулятор', 'расчёт', 'calculator', 'calc'],
  '/import-calculator': ['import', 'xitoy', 'bojxona', 'kargo', 'импорт', 'китай', 'таможня', 'карго', 'china', 'customs', 'cargo'],
  '/reviews': ['sharh', 'otziv', 'baho', 'reyting', 'avto javob', 'отзывы', 'рейтинг', 'автоответ', 'reviews', 'rating', 'feedback'],
  '/referral': ['hamkorlik', 'referal', 'taklif', 'партнёрка', 'реферал', 'referral', 'affiliate', 'invite'],
  '/pricing': ['tarif', 'obuna', 'to‘lov', 'тариф', 'подписка', 'оплата', 'pricing', 'plan', 'subscription', 'billing', 'upgrade'],
  '/settings': ['sozlama', 'nastroyka', 'настройки', 'settings', 'preferences'],
  /*
   * "O‘sish" bo‘limi — faqat sotuvchining o‘z ma’lumotidan. "nisha" ATAYLAB
   * yo‘q: u bozor tadqiqotini va’da qilardi, sahifa esa o‘z assortimentini ko‘rsatadi.
   */
  '/categories': ['kategoriya', 'toifa', 'assortiment tuzilmasi', 'категории', 'категория', 'categories', 'category'],
  '/radar': ['radar', 'sotuv tezligi', 'tezlik', 'trend', 'радар', 'скорость продаж', 'тренд', 'velocity', 'trending'],
  '/price-map': ['raqobatchi', 'raqobatchi narxi', 'narx xaritasi', 'конкурент', 'цены конкурентов', 'карта цен', 'competitor', 'competitor prices'],
};

/**
 * Sozlamalar ichidagi bo‘limlar — alohida sahifadek qidiriladi: "API kalit"
 * yoki "telegram" deb yozgan sotuvchi kerakli bo‘limga to‘g‘ri tushadi.
 * Tartib va id lar `components/settings/types.ts` dagi SECTION_IDS bilan bir.
 */
export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SectionId; icon: AppIcon; syn: readonly string[] }> = [
  { id: 'profile', icon: UserRound, syn: ['profil', 'ism', 'telefon', 'профиль', 'имя', 'profile', 'name'] },
  { id: 'company', icon: Building2, syn: ['kompaniya', 'firma', 'soliq', 'valyuta', 'stir', 'компания', 'налог', 'валюта', 'инн', 'company', 'tax', 'currency'] },
  {
    id: 'uzum',
    icon: KeyRound,
    syn: ['uzum', 'kabinet', 'api', 'api kalit', 'token', 'sinxronlash', 'do‘kon ulash', 'кабинет', 'api ключ', 'токен', 'синхронизация', 'api key', 'sync', 'connect'],
  },
  { id: 'notifications', icon: Bell, syn: ['bildirishnoma', 'telegram', 'bot', 'xabar', 'уведомления', 'телеграм', 'бот', 'notifications', 'alerts'] },
  { id: 'team', icon: Users, syn: ['jamoa', 'xodim', 'a’zo', 'rol', 'команда', 'сотрудники', 'роли', 'team', 'members', 'roles', 'staff'] },
  { id: 'appearance', icon: Palette, syn: ['ko‘rinish', 'mavzu', 'tema', 'menyu', 'внешний вид', 'тема', 'appearance', 'theme'] },
];

/**
 * Davr presetlari — davr tanlagichi (components/filters.tsx) bilan BITTA
 * ro‘yxat (lib/periodPresets.ts). Ilgari bu yerda nusxasi turardi va "yangi
 * preset qo‘shilsa, ikkalasiga" deyilardi (2026-10-24). Modul
 * bog‘liqliksiz — oyna bo‘lagiga filters.tsx tortilmaydi.
 */
export { PERIOD_PRESETS } from '@/lib/periodPresets';

/** Til nomi o‘sha tilning o‘zida — tanlagan odam o‘z tilini taniydi */
export const LANG_NAMES: Readonly<Record<Lang, string>> = { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };

export const LANG_SYNONYMS: Readonly<Record<Lang, readonly string[]>> = {
  uz: ['o‘zbek', 'uzbek', 'lotin', 'узбекский', 'ozbek'],
  ru: ['rus', 'ruscha', 'русский', 'russian'],
  en: ['ingliz', 'inglizcha', 'английский', 'english'],
};

export const ACTION_SYNONYMS = {
  theme: ['mavzu', 'tema', 'rang', 'qorong‘i', 'yorug‘', 'tun', 'тема', 'тёмная', 'светлая', 'ночь', 'theme', 'dark', 'light', 'night'],
  lang: ['til', 'tilni o‘zgartirish', 'язык', 'language', 'lang'],
  rail: ['menyu', 'yon menyu', 'yon panel', 'меню', 'боковая панель', 'sidebar', 'menu', 'collapse', 'expand'],
  period: ['davr', 'sana', 'oraliq', 'период', 'дата', 'period', 'date', 'range'],
  store: ['do‘kon', 'magazin', 'магазин', 'store', 'shop'],
} as const;
