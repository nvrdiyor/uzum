/**
 * Bir martalik e'lon — bot orqali foydalanuvchilarga yangiliklar (server konsolidan).
 *
 *   npx tsx apps/api/src/scripts/announce.ts                    # faqat ko'rish: kimga va qaysi matn (hech narsa yuborilmaydi)
 *   npx tsx apps/api/src/scripts/announce.ts --only=<telegramId> --send   # avval o'zingizga sinov
 *   npx tsx apps/api/src/scripts/announce.ts --send             # hammaga (auditoriya bo'yicha)
*   --audience=connected (standart) | all   --exclude=<telegramId,...>
 *
 * `connected` — faqat do'konini ulagan kompaniyalar a'zolari (Uzum kabineti
 * faol, kamida bitta do'kon) — dayjest bilan bitta qoida. `all` — botdan
 * ro'yxatdan o'tgan barcha faol foydalanuvchilar.
 *
 * Takroriy yuborilmaydi: har foydalanuvchiga AuditLog yozuvi (`bot.announce`,
 * `<e'lon id>:<user id>`) yuborishdan OLDIN yoziladi — skript qayta
 * ishga tushsa ham, ikki marta ketmaydi. Telegram chegarasidan past: 60 ms pauza.
 */
import { prisma } from '@savdoiq/db';
import { absoluteLink, sendTelegramMessage } from '../services/notify.js';

/** E'lon belgisi — yangi e'lon uchun yangi id */
const ANNOUNCE_ID = '2026-10-27';
const AUDIT_ACTION = 'bot.announce';
const SEND_DELAY_MS = 60;

type Lang = 'uz' | 'ru' | 'en';

const TEXT: Record<Lang, string> = {
  uz: [
    '🎉 <b>SavdoIQ yangilandi</b>',
    '',
    'Oxirgi haftalarda qo‘shilganlar:',
    '',
    '📊 <b>Telegram hisobotlari</b> — «📊 Bugungi hisobot» ostida endi <b>Bugun / Kecha / Shu oy / Shu yil</b>. Raqamlar saytdagi bilan bir xil. Har dushanba va oyning 1-kuni hisobot o‘zi keladi.',
    '🌱 <b>O‘sish bo‘limi</b> — Kategoriyalarim, Mening radarim (tezlashgan, sekinlashgan va tugayotgan tovarlar) va Narxlar xaritasi (raqobatchi narxlari).',
    '💰 <b>Moliya</b> — o‘tgan davr, oy va yil bilan taqqoslash, foyda sharsharasi, yo‘qotishlar voronkasi, mahsulotlar bo‘yicha foyda jadvali.',
    '📦 <b>Ombor</b> — Uzum’ning yangi tarifi bo‘yicha pullik saqlash (yangi SKU bepul davri bilan), Hajm va VGH hisoboti, Litrovka kalkulyatori.',
    '🛒 <b>Rejalashtiruvchi</b> — hamma sahifada bitta «buyurtma kerak» raqami, FBO’ga jo‘natish va sotib olish alohida.',
    '👥 <b>Jamoa</b> — taklif havolasi va Omborchi / Buxgalter / Marketolog shablonlari.',
    '🔎 Shtrix-kod, Uzum ID yoki havola bo‘yicha qidiruv, <b>Ctrl+K</b> bilan istalgan sahifaga o‘tish.',
    '',
    '🎯 <b>Raqamlar aniqroq:</b> reklama to‘lovi endi to‘g‘ri mahsulotlarga bo‘linadi, qaytarish ulushi hamma joyda dona bo‘yicha. Shu sabab ayrim mahsulotlar foydasi o‘zgarishi mumkin.',
  ].join('\n'),
  ru: [
    '🎉 <b>SavdoIQ обновился</b>',
    '',
    'Что нового за последние недели:',
    '',
    '📊 <b>Отчёты в Telegram</b> — под «📊 Bugungi hisobot» теперь <b>Сегодня / Вчера / Этот месяц / Этот год</b>. Цифры те же, что на сайте. По понедельникам и 1-го числа отчёт приходит сам.',
    '🌱 <b>Раздел «Рост»</b> — Мои категории, Мой радар (ускорились, замедлились, заканчиваются) и Карта цен (цены конкурентов).',
    '💰 <b>Финансы</b> — сравнение с прошлым периодом, месяцем и годом, водопад прибыли, воронка потерь, таблица прибыли по товарам.',
    '📦 <b>Склад</b> — платное хранение по новому тарифу Uzum (с бесплатным периодом для новых SKU), отчёт «Объём и ВГХ», калькулятор литража.',
    '🛒 <b>Планировщик</b> — одна цифра «нужно заказать» на всех страницах, отгрузка на FBO и закупка — отдельно.',
    '👥 <b>Команда</b> — ссылка-приглашение и шаблоны Кладовщик / Бухгалтер / Маркетолог.',
    '🔎 Поиск по штрихкоду, Uzum ID или ссылке, <b>Ctrl+K</b> — переход на любую страницу.',
    '',
    '🎯 <b>Цифры точнее:</b> оплата рекламы теперь распределяется по правильным товарам, доля возвратов везде считается по штукам. Поэтому прибыль отдельных товаров может измениться.',
  ].join('\n'),
  en: [
    '🎉 <b>SavdoIQ has been updated</b>',
    '',
    'New in recent weeks:',
    '',
    '📊 <b>Telegram reports</b> — under «📊 Bugungi hisobot» you now get <b>Today / Yesterday / This month / This year</b>, with the same numbers as the website. A report also arrives every Monday and on the 1st of the month. The bot now speaks English too.',
    '🌱 <b>Growth section</b> — My categories, My radar (accelerating, slowing and running-out items) and Price map (competitor prices).',
    '💰 <b>Finance</b> — compare with the previous period, month or year, profit waterfall, loss funnel, profit table by product.',
    '📦 <b>Warehouse</b> — paid storage by Uzum’s new tariff (with the free period for new SKUs), Volume & VGH report, litre calculator.',
    '🛒 <b>Planner</b> — one “reorder” number on every page, shipping to FBO and buying shown separately.',
    '👥 <b>Team</b> — invite link and Warehouse / Accountant / Marketer templates.',
    '🔎 Search by barcode, Uzum ID or link, and <b>Ctrl+K</b> to jump to any page.',
    '',
    '🎯 <b>More accurate numbers:</b> ad fees are now split across the right products and the return rate is unit-based everywhere, so some products’ profit may change.',
  ].join('\n'),
};

const BUTTON: Record<Lang, string> = {
  uz: '🌐 Saytda ko‘rish',
  ru: '🌐 Открыть на сайте',
  en: '🌐 Open the website',
};

const toLang = (code: string | null | undefined): Lang => (code === 'ru' ? 'ru' : code === 'en' ? 'en' : 'uz');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const send = process.argv.includes('--send');
  const audience = arg('audience') === 'all' ? 'all' : 'connected';
  const only = arg('only');
  // Masalan, demo seed'dagi soxta akkaunt (100000001) — haqiqiy odam emas
  const exclude = (arg('exclude') ?? '').split(',').filter(Boolean);

  const users = await prisma.user.findMany({
    where: {
      status: 'active',
      botChatId: { not: null },
      ...(only ? { telegramId: only } : exclude.length ? { telegramId: { notIn: exclude } } : {}),
      ...(audience === 'connected'
        ? { memberships: { some: { company: { stores: { some: {} }, uzumAccounts: { some: { status: 'active' } } } } } }
        : {}),
    },
    select: { id: true, botChatId: true, languageCode: true },
  });

  const byLang: Record<Lang, number> = { uz: 0, ru: 0, en: 0 };
  for (const u of users) byLang[toLang(u.languageCode)] += 1;
  console.log(`E'lon ${ANNOUNCE_ID} · auditoriya: ${audience}${only ? ` · faqat ${only}` : ''}`);
  console.log(`Qabul qiluvchilar: ${users.length} (uz ${byLang.uz}, ru ${byLang.ru}, en ${byLang.en})`);

  if (!send) {
    for (const lang of ['uz', 'ru', 'en'] as const) {
      console.log(`\n──── ${lang} (${TEXT[lang].length} belgi) ────\n${TEXT[lang]}\n[${BUTTON[lang]} → ${absoluteLink('/dashboard')}]`);
    }
    console.log('\nHech narsa yuborilmadi. Yuborish uchun: --send (avval --only=<telegramId> bilan o‘zingizga sinang)');
    return;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const u of users) {
    const entityId = `${ANNOUNCE_ID}:${u.id}`;
    const seen = await prisma.auditLog.findFirst({ where: { action: AUDIT_ACTION, entityId }, select: { id: true } });
    if (seen) {
      skipped += 1;
      continue;
    }
    // Avval yozuv — jarayon uzilsa ham ikkinchi marta ketmaydi (ko'pi bilan bir marta)
    await prisma.auditLog.create({ data: { userId: u.id, action: AUDIT_ACTION, entity: 'user', entityId } });
    const lang = toLang(u.languageCode);
    const ok = await sendTelegramMessage(u.botChatId as string, TEXT[lang], {
      markup: { inline_keyboard: [[{ text: BUTTON[lang], url: absoluteLink('/dashboard') }]] },
    });
    if (ok) sent += 1;
    else failed += 1;
    await sleep(SEND_DELAY_MS);
  }
  console.log(`Yuborildi: ${sent} · oldin olgan: ${skipped} · xato (bloklagan bo'lishi mumkin): ${failed}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
