import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarRange,
  FileBarChart,
  History,
  Printer,
  Receipt,
  Send,
  ShoppingBag,
  TrendingUp,
} from '@/components/icons';
import type { MonthlyReportResponse } from '@savdoiq/shared';
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Skeleton,
  SkeletonRows,
  StatCard,
  toast,
} from '@/components/ui';
import { BarsChart, ChartCard, TrendChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { BasisSwitch } from '@/components/finance/BasisSwitch';
import {
  CategoriesCard,
  DeliveryTypesCard,
  ExpensesCard,
  FinalityChip,
  InsightsBlock,
  OrdersFlowCard,
  PrintHead,
  PrintStyles,
  ResultHero,
  RiskCard,
  TopSalesCard,
  WarehouseCard,
} from '@/components/reports/ReportBlocks';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { ApiError, api } from '@/lib/api';
import { useMoneyQuery } from '@/store/ui';
import { CHART_COLORS } from '@/lib/theme';
import { downloadBlob } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('reports', {
  uz: {
    title: 'Oylik hisobot',
    subtitle: 'Davr bo‘yicha to‘liq yakun: tushum, foyda, xarajat va ombor',
    // Qisqa yorliq: uzun "PDF uchun chop etish" tugmalarni sarlavha ostiga surib yuborardi
    print: 'PDF',
    printHint: 'PDF uchun chop etish — brauzer chop etish oynasi ochiladi',
    exporting: 'Tayyorlanmoqda...',
    exportOk: 'Excel fayl yuklab olindi',
    exportErr: 'Excel faylni yuklab bo‘lmadi',
    // Qisqa yorliq — "PDF" va "Excel" yonida sarlavha ostiga tushib ketmasin; to'liq ma'nosi `tg.sendHint` da
    'tg.send': 'Telegram’ga',
    'tg.sendHint': 'Excel faylni Telegram botingizga yuborish',
    'tg.sending': 'Yuborilmoqda...',
    'tg.sent': 'Hisobot Telegram’ga yuborildi',
    'tg.sentHint': 'Fayl SavdoIQ botidagi chatingizda',
    'tg.notLinked': 'Avval Sozlamalarda Telegram’ni ulang',
    'tg.notLinkedHint': 'Sozlamalar → Bildirishnomalar: botni oching va /start bosing',
    'tg.blocked': 'Bot bloklangan',
    'tg.blockedHint': 'Telegram’da botni oching, /start bosing va qayta yuboring',
    'tg.tooMany': 'Soatiga {n} martagacha yuborish mumkin',
    'tg.tooManyHint': '{min} daqiqadan keyin qayta urinib ko‘ring',
    'tg.planLimit': 'Telegram’ga yuborish tarifingizda mavjud emas',
    'tg.err': 'Telegram’ga yuborib bo‘lmadi',
    'final.final': 'Yakuniy · {v} yakunlangan',
    'final.preliminary': 'Oraliq · {v} yakunlangan',
    'final.currentHint': 'Davr hali tugamagan — yangi buyurtma, bekor qilish va qaytarishlar raqamlarni o‘zgartiradi',
    'final.transitHint': '{n} dona hali xaridorga yetib bormagan — ular bekor bo‘lishi yoki qaytishi mumkin',
    'final.finalHint': 'Davr tugagan va buyurtmalar yakunlangan — raqamlar endi deyarli o‘zgarmaydi',
    'final.rule':
      '{done} / {total} dona yakunlangan (xaridor qabul qilgan, bekor qilingan yoki qaytgan). Yakuniy bo‘lishi uchun kamida {v}',
    /*
     * Qabul sanasi rejimi (2026-10-27): hisobda faqat qabul qilingan buyurtmalar
     * bor — "yo'lda" degan sabab bo'lmaydi, hisobot davr tugashi bilan yakuniy.
     */
    'final.currentHint.receipt': 'Davr hali tugamagan — yangi qabullar va qaytarishlar raqamlarni o‘zgartiradi',
    'final.finalHint.receipt': 'Davr tugagan — qabul sanasi bo‘yicha hisobot yakuniy: keyingi qabullar keyingi davrga yoziladi',
    'final.rule.receipt':
      '{done} / {total} dona — qabul sanasi bo‘yicha hisobda faqat xaridor qabul qilgan buyurtmalar bor, shuning uchun davr tugashi bilan hisobot yakuniy',
    'print.head': 'SavdoIQ — davr hisoboti',
    'print.receipt': 'qabul sanasi bo‘yicha',
    'meta.orders': '{n} buyurtma',

    'kpi.revenue': 'Tushum',
    'kpi.revenueSub': '{orders} buyurtma · {units} dona',
    'kpi.avgCheck': 'O‘rtacha chek',
    'kpi.avgCheckHint': '{v} buyurtma asosida',
    'kpi.payout': 'To‘lov (Uzum o‘tkazadi)',
    'kpi.payoutHint': 'Tushum − komissiya − logistika: Uzum hisobingizga o‘tkazadigan summa',

    'hero.profit': 'Sof foyda',
    'hero.loss': 'Zarar',
    'hero.margin': 'Sof marja {v}',
    'hero.prevMonth': 'oldingi oy {v}',
    'hero.lost': 'Xarajatlar tushumdan {v} ga oshdi',
    'hero.gross': 'Yalpi foyda',
    'hero.grossHint': 'Marja {v} · tannarxdan keyin',
    'hero.bar': 'Tushum qayerga ketdi',
    'hero.barBase': 'Tushum: {v}',
    'hero.revenueMark': 'Tushum shu yerda tugaydi',
    'hero.cogs': 'Tannarx',
    'hero.cogsHint': 'Sotilgan tovarlarning xarid narxi',
    'hero.costs': 'Xarajatlar',
    'hero.costsHint': 'Komissiya, logistika, saqlash, reklama, soliq',
    'hero.netHint': 'Barcha xarajat va soliqdan keyin',

    'orders.title': 'Buyurtmalar oqimi',
    'orders.subtitle': 'Qabul qilingandan yetkazilgangacha',
    'orders.subtitle.receipt': 'Davrda xaridor qabul qilgan buyurtmalar',
    'orders.total': 'Jami',
    'orders.totalHint': 'Bekor va qaytganlar bilan',
    'orders.totalHint.receipt': 'Keyin qaytganlari bilan',
    'orders.success': 'Muvaffaqiyatli',
    'orders.successHint': 'Bekor qilinmagan, qaytmagan',
    'orders.units': 'Sotildi, dona',
    'orders.unitsHint': 'Muvaffaqiyatli buyurtmalarda',
    'orders.rate': 'muvaffaqiyat',

    'risk.title': 'Xavf va qaytarishlar',
    'risk.subtitle': 'Qaytarish ulushi — dona bo‘yicha, yo‘qotilgan buyurtmalar — soni',
    'risk.returnRate': 'Qaytarish ulushi, dona',
    'risk.rateHint':
      'Qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona) — Boshqaruv panelidagi kabi. 4% gacha — normal, 8% dan — xavfli',
    'risk.rateHint.receipt':
      'Qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona) — davrda qabul qilingan buyurtmalardan; olib ketilmagan buyurtma kirmaydi. 4% gacha — normal, 8% dan — xavfli',
    'risk.canceledHint.receipt': 'Qabul sanasi bo‘yicha bekor qilingan buyurtma hisobga kirmaydi',
    'risk.returnsHint.receipt': 'Qabul qilib, keyin qaytarilgan buyurtmalar',
    'risk.marker': '8% — xavfli zona chegarasi',
    'risk.units': '{r} dona qaytdi · {s} dona qabul qilindi',
    'risk.noBase': 'Xaridorlar hali qabul qilmagan',
    'risk.canceled': 'Bekor qilingan buyurtma',
    'risk.canceledHint': 'Yetkazilmagan buyurtmalar soni',
    'risk.returns': 'Qaytarilgan buyurtma',
    'risk.returnsHint': 'Mijoz qaytargan buyurtmalar soni',
    'risk.zoneLow': 'Xavfsiz zona',
    'risk.zoneMid': 'Diqqat talab',
    'risk.zoneHigh': 'Xavfli zona',
    'risk.zoneNone': 'Hali asos yo‘q',

    'top.title': 'Top sotuvlar',
    'top.subtitle': 'Davrdagi eng ko‘p tushum keltirgan mahsulotlar',
    'top.product': 'Mahsulot',
    'top.units': 'Dona',
    'top.revenue': 'Tushum',
    'top.profit': 'Foyda',
    'top.marginSub': 'marja {v}',
    'top.share': 'Ulush',
    'top.top3': 'Top-3: tushumning {v}',
    'top.top3Hint': 'Uchta yetakchi mahsulot birgalikda tushumning qancha qismini beradi',
    'top.concentrated': 'Bitta mahsulotga bog‘liq',
    'top.concentratedHint':
      'Yetakchi mahsulot tushumning {v} ini beradi — u tugab qolsa yoki narxi tushsa, oy natijasi keskin o‘zgaradi',
    'top.empty': 'Bu davrda sotuv qayd etilmagan',

    'cats.title': 'Kategoriyalar bo‘yicha',
    'cats.subtitle': 'Tushum qayerdan keldi',
    'cats.total': 'Davr tushumi',
    'cats.count': '{n} ta kategoriya',
    'cats.more': 'Yana {n} ta kategoriya — {v}',
    'cats.empty': 'Kategoriya ma’lumoti yo‘q',

    'delivery.title': 'Yetkazib berish turlari',
    'delivery.subtitle': 'Buyurtmalarning FBO / FBS / DBS taqsimoti',
    'delivery.totalChip': '{n} buyurtma',
    'delivery.FBO': 'Uzum omboridan',
    'delivery.FBS': 'O‘z omboringizdan',
    'delivery.DBS': 'O‘zingiz yetkazasiz',
    'delivery.successLine': 'Muvaffaqiyatli: {n} · {v}',
    'delivery.empty': 'Ma’lumot yo‘q',

    'expenses.title': 'Davr xarajatlari',
    'expenses.subtitle': 'Pul qayerga ketdi: komissiya, logistika, saqlash va boshqalar',
    'expenses.total': 'Jami xarajat',
    'expenses.totalAside': 'tushumning {v}',
    'expenses.pctNote': 'O‘ngdagi foiz — tushumga nisbatan',
    'expenses.empty': 'Xarajat qayd etilmagan',

    'warehouse.title': 'Ombor',
    'warehouse.subtitle': 'Hozirgi qoldiq, tannarx bo‘yicha',
    'warehouse.units': 'dona',
    'warehouse.split': 'Qiymat bo‘yicha: FBO {a} · FBS {b}',
    'warehouse.FBO': 'Uzum omborida',
    'warehouse.FBS': 'O‘z omboringizda',
    'warehouse.capital': 'Jami ombor kapitali',
    'warehouse.capitalHint': 'Qoldiqlarning tannarx bo‘yicha qiymati',

    'daily.title': 'Kunlik dinamika',
    'daily.subtitle': 'Tushum va sof foyda kunlar kesimida',
    'daily.revenue': 'Tushum',
    'daily.profit': 'Sof foyda',
    'daily.empty': 'Kunlik ma’lumot yo‘q',

    'insights.title': 'Xulosalar',
    'insights.subtitle': 'Davr bo‘yicha e’tibor talab qiladigan nuqtalar',
    'insights.empty': 'Alohida xulosa yo‘q — ko‘rsatkichlar barqaror',
    'insights.more': 'Batafsil',
    'metric.netProfit': 'Sof foyda',
    'metric.expenses': 'Xarajatlar',
    'metric.successRate': 'Muvaffaqiyat ulushi',
    'metric.revenue': 'Tushum',
    'metric.categories': 'Kategoriyalar',
    'metric.stockValue': 'Ombor qiymati',
    'metric.orders': 'Buyurtmalar',
    'metric.tax': 'Soliq',
    'metric.avgCheck': 'O‘rtacha chek',
    'metric.margin': 'Marja',

    'compare.title': 'Oylar taqqoslash',
    'compare.subtitle': 'Oxirgi 6 oy: tushum va foyda',
    'compare.revenue': 'Tushum',
    'compare.profit': 'Foyda',
    'compare.empty': 'Taqqoslash uchun ma’lumot yetarli emas',

    'empty.title': 'Bu davrda hisobot yo‘q',
    'empty.hint': 'Boshqa davrni tanlang yoki sinxronizatsiya tugashini kuting',
  },
  ru: {
    title: 'Месячный отчёт',
    subtitle: 'Полный итог периода: выручка, прибыль, расходы и склад',
    print: 'PDF',
    printHint: 'Печать в PDF — откроется окно печати браузера',
    exporting: 'Готовим...',
    exportOk: 'Excel-файл скачан',
    exportErr: 'Не удалось скачать Excel',
    'tg.send': 'В Telegram',
    'tg.sendHint': 'Отправить Excel-файл в ваш Telegram-бот',
    'tg.sending': 'Отправляем...',
    'tg.sent': 'Отчёт отправлен в Telegram',
    'tg.sentHint': 'Файл в вашем чате с ботом SavdoIQ',
    'tg.notLinked': 'Сначала подключите Telegram в Настройках',
    'tg.notLinkedHint': 'Настройки → Уведомления: откройте бота и нажмите /start',
    'tg.blocked': 'Бот заблокирован',
    'tg.blockedHint': 'Откройте бота в Telegram, нажмите /start и отправьте снова',
    'tg.tooMany': 'Отправлять можно до {n} раз в час',
    'tg.tooManyHint': 'Повторите через {min} мин.',
    'tg.planLimit': 'Отправка в Telegram недоступна на вашем тарифе',
    'tg.err': 'Не удалось отправить в Telegram',
    'final.final': 'Итоговый · завершено {v}',
    'final.preliminary': 'Предварительный · завершено {v}',
    'final.currentHint': 'Период ещё не закончился — новые заказы, отмены и возвраты изменят цифры',
    'final.transitHint': 'Ещё не доставлено покупателю, шт.: {n} — их могут отменить или вернуть',
    'final.finalHint': 'Период закончился, заказы завершены — цифры почти не изменятся',
    'final.rule':
      'Завершено {done} из {total} шт. (получено покупателем, отменено или возвращено). Итоговым отчёт становится от {v}',
    'final.currentHint.receipt': 'Период ещё не закончился — новые получения и возвраты изменят цифры',
    'final.finalHint.receipt': 'Период закончился — отчёт по дате получения итоговый: следующие получения попадут в следующий период',
    'final.rule.receipt':
      '{done} из {total} шт. — в учёте по дате получения только заказы, полученные покупателем, поэтому отчёт итоговый, как только закончится период',
    'print.head': 'SavdoIQ — отчёт за период',
    'print.receipt': 'по дате получения',
    'meta.orders': 'Заказов: {n}',

    'kpi.revenue': 'Выручка',
    'kpi.revenueSub': 'Заказов: {orders} · {units} шт.',
    'kpi.avgCheck': 'Средний чек',
    'kpi.avgCheckHint': 'На основе {v} заказов',
    'kpi.payout': 'К выплате от Uzum',
    'kpi.payoutHint': 'Выручка − комиссия − логистика: сумма, которую Uzum перечислит вам',

    'hero.profit': 'Чистая прибыль',
    'hero.loss': 'Убыток',
    'hero.margin': 'Чистая маржа {v}',
    'hero.prevMonth': 'прошлый месяц {v}',
    'hero.lost': 'Расходы превысили выручку на {v}',
    'hero.gross': 'Валовая прибыль',
    'hero.grossHint': 'Маржа {v} · после себестоимости',
    'hero.bar': 'Куда ушла выручка',
    'hero.barBase': 'Выручка: {v}',
    'hero.revenueMark': 'Здесь заканчивается выручка',
    'hero.cogs': 'Себестоимость',
    'hero.cogsHint': 'Закупочная цена проданных товаров',
    'hero.costs': 'Расходы',
    'hero.costsHint': 'Комиссия, логистика, хранение, реклама, налог',
    'hero.netHint': 'После всех расходов и налога',

    'orders.title': 'Поток заказов',
    'orders.subtitle': 'От оформления до доставки',
    'orders.subtitle.receipt': 'Заказы, полученные покупателями за период',
    'orders.total': 'Всего',
    'orders.totalHint': 'С отменами и возвратами',
    'orders.totalHint.receipt': 'Включая возвращённые позже',
    'orders.success': 'Успешных',
    'orders.successHint': 'Без отмен и возвратов',
    'orders.units': 'Продано, шт.',
    'orders.unitsHint': 'В успешных заказах',
    'orders.rate': 'успешность',

    'risk.title': 'Риски и возвраты',
    'risk.subtitle': 'Доля возвратов — в штуках, потерянные заказы — количество',
    'risk.returnRate': 'Доля возвратов, шт.',
    'risk.rateHint':
      'Возвращённые шт. ÷ (полученные покупателем + возвращённые шт.) — как на главной панели. До 4% — норма, от 8% — рискованно',
    'risk.rateHint.receipt':
      'Возвращённые шт. ÷ (полученные покупателем + возвращённые шт.) — по заказам, полученным за период; невыкупленные не входят. До 4% — норма, от 8% — рискованно',
    'risk.canceledHint.receipt': 'В учёте по дате получения отменённые заказы не участвуют',
    'risk.returnsHint.receipt': 'Получены, а затем возвращены',
    'risk.marker': '8% — граница зоны риска',
    'risk.units': 'Возвращено {r} шт. · получено {s} шт.',
    'risk.noBase': 'Покупатели ещё не получили',
    'risk.canceled': 'Отменённых заказов',
    'risk.canceledHint': 'Количество недоставленных заказов',
    'risk.returns': 'Возвращённых заказов',
    'risk.returnsHint': 'Количество заказов, возвращённых покупателем',
    'risk.zoneLow': 'Безопасная зона',
    'risk.zoneMid': 'Требует внимания',
    'risk.zoneHigh': 'Зона риска',
    'risk.zoneNone': 'Пока нет базы',

    'top.title': 'Топ продаж',
    'top.subtitle': 'Товары с наибольшей выручкой за период',
    'top.product': 'Товар',
    'top.units': 'Шт',
    'top.revenue': 'Выручка',
    'top.profit': 'Прибыль',
    'top.marginSub': 'маржа {v}',
    'top.share': 'Доля',
    'top.top3': 'Топ-3: {v} выручки',
    'top.top3Hint': 'Какую долю выручки дают три лидера вместе',
    'top.concentrated': 'Зависимость от одного товара',
    'top.concentratedHint':
      'Лидер даёт {v} выручки — если он закончится или подешевеет, итог месяца резко изменится',
    'top.empty': 'За этот период продаж не было',

    'cats.title': 'По категориям',
    'cats.subtitle': 'Откуда пришла выручка',
    'cats.total': 'Выручка периода',
    'cats.count': 'Категорий: {n}',
    'cats.more': 'Ещё категорий: {n} — {v}',
    'cats.empty': 'Нет данных по категориям',

    'delivery.title': 'Типы доставки',
    'delivery.subtitle': 'Распределение заказов FBO / FBS / DBS',
    'delivery.totalChip': 'Заказов: {n}',
    'delivery.FBO': 'Со склада Uzum',
    'delivery.FBS': 'С вашего склада',
    'delivery.DBS': 'Доставляете сами',
    'delivery.successLine': 'Успешных: {n} · {v}',
    'delivery.empty': 'Нет данных',

    'expenses.title': 'Расходы периода',
    'expenses.subtitle': 'Куда ушли деньги: комиссия, логистика, хранение и прочее',
    'expenses.total': 'Итого расходов',
    'expenses.totalAside': '{v} от выручки',
    'expenses.pctNote': 'Процент справа — от выручки',
    'expenses.empty': 'Расходы не зафиксированы',

    'warehouse.title': 'Склад',
    'warehouse.subtitle': 'Текущий остаток по себестоимости',
    'warehouse.units': 'шт',
    'warehouse.split': 'По стоимости: FBO {a} · FBS {b}',
    'warehouse.FBO': 'На складе Uzum',
    'warehouse.FBS': 'На вашем складе',
    'warehouse.capital': 'Всего складского капитала',
    'warehouse.capitalHint': 'Стоимость остатков по себестоимости',

    'daily.title': 'Динамика по дням',
    'daily.subtitle': 'Выручка и чистая прибыль по дням',
    'daily.revenue': 'Выручка',
    'daily.profit': 'Чистая прибыль',
    'daily.empty': 'Нет данных по дням',

    'insights.title': 'Выводы',
    'insights.subtitle': 'Точки, требующие внимания за период',
    'insights.empty': 'Особых выводов нет — показатели стабильны',
    'insights.more': 'Подробнее',
    'metric.netProfit': 'Чистая прибыль',
    'metric.expenses': 'Расходы',
    'metric.successRate': 'Доля успешных',
    'metric.revenue': 'Выручка',
    'metric.categories': 'Категории',
    'metric.stockValue': 'Стоимость склада',
    'metric.orders': 'Заказы',
    'metric.tax': 'Налог',
    'metric.avgCheck': 'Средний чек',
    'metric.margin': 'Маржа',

    'compare.title': 'Сравнение месяцев',
    'compare.subtitle': 'Последние 6 месяцев: выручка и прибыль',
    'compare.revenue': 'Выручка',
    'compare.profit': 'Прибыль',
    'compare.empty': 'Недостаточно данных для сравнения',

    'empty.title': 'За этот период отчёта нет',
    'empty.hint': 'Выберите другой период или дождитесь синхронизации',
  },
  en: {
    title: 'Monthly report',
    subtitle: 'Full period summary: revenue, profit, costs and stock',
    print: 'PDF',
    printHint: 'Print to PDF — opens the browser print dialog',
    exporting: 'Preparing...',
    exportOk: 'Excel file downloaded',
    exportErr: 'Could not download the Excel file',
    'tg.send': 'Telegram',
    'tg.sendHint': 'Send the Excel file to your Telegram bot',
    'tg.sending': 'Sending...',
    'tg.sent': 'Report sent to Telegram',
    'tg.sentHint': 'The file is in your chat with the SavdoIQ bot',
    'tg.notLinked': 'Connect Telegram in Settings first',
    'tg.notLinkedHint': 'Settings → Notifications: open the bot and press /start',
    'tg.blocked': 'The bot is blocked',
    'tg.blockedHint': 'Open the bot in Telegram, press /start and send again',
    'tg.tooMany': 'You can send up to {n} times per hour',
    'tg.tooManyHint': 'Try again in {min} min',
    'tg.planLimit': 'Sending to Telegram is not available on your plan',
    'tg.err': 'Could not send to Telegram',
    'final.final': 'Final · {v} completed',
    'final.preliminary': 'Preliminary · {v} completed',
    'final.currentHint': 'The period is not over yet — new orders, cancellations and returns will change the numbers',
    'final.transitHint': '{n} units have not reached the buyer yet — they may still be cancelled or returned',
    'final.finalHint': 'The period is over and orders are completed — the numbers will barely change',
    'final.rule':
      '{done} of {total} units completed (received, cancelled or returned). A report becomes final at {v} or more',
    'final.currentHint.receipt': 'The period is not over yet — new receipts and returns will change the numbers',
    'final.finalHint.receipt': 'The period is over — a receipt-date report is final: later receipts go to the next period',
    'final.rule.receipt':
      '{done} of {total} units — a receipt-date report only holds orders buyers received, so it is final as soon as the period ends',
    'print.head': 'SavdoIQ — period report',
    'print.receipt': 'by receipt date',
    'meta.orders': '{n} orders',

    'kpi.revenue': 'Revenue',
    'kpi.revenueSub': '{orders} orders · {units} units',
    'kpi.avgCheck': 'Average check',
    'kpi.avgCheckHint': 'Based on {v} orders',
    'kpi.payout': 'Payout from Uzum',
    'kpi.payoutHint': 'Revenue − commission − logistics: what Uzum transfers to you',

    'hero.profit': 'Net profit',
    'hero.loss': 'Loss',
    'hero.margin': 'Net margin {v}',
    'hero.prevMonth': 'last month {v}',
    'hero.lost': 'Costs exceeded revenue by {v}',
    'hero.gross': 'Gross profit',
    'hero.grossHint': 'Margin {v} · after cost of goods',
    'hero.bar': 'Where revenue went',
    'hero.barBase': 'Revenue: {v}',
    'hero.revenueMark': 'Revenue ends here',
    'hero.cogs': 'Cost of goods',
    'hero.cogsHint': 'Purchase price of the goods sold',
    'hero.costs': 'Costs',
    'hero.costsHint': 'Commission, logistics, storage, ads, tax',
    'hero.netHint': 'After all costs and tax',

    'orders.title': 'Order flow',
    'orders.subtitle': 'From placement to delivery',
    'orders.subtitle.receipt': 'Orders buyers received in the period',
    'orders.total': 'Total',
    'orders.totalHint': 'Incl. cancelled and returned',
    'orders.totalHint.receipt': 'Incl. ones returned later',
    'orders.success': 'Successful',
    'orders.successHint': 'Not cancelled or returned',
    'orders.units': 'Units sold',
    'orders.unitsHint': 'In successful orders',
    'orders.rate': 'success rate',

    'risk.title': 'Risk and returns',
    'risk.subtitle': 'Return rate in units, lost orders as counts',
    'risk.returnRate': 'Return rate, units',
    'risk.rateHint':
      'Returned units ÷ (units received by buyers + returned units) — same as on the dashboard. Up to 4% is normal, 8% and above is risky',
    'risk.rateHint.receipt':
      'Returned units ÷ (units received by buyers + returned units) — from orders received in the period; never-collected orders are not included. Up to 4% is normal, 8% and above is risky',
    'risk.canceledHint.receipt': 'Cancelled orders are not part of a receipt-date report',
    'risk.returnsHint.receipt': 'Received and then returned',
    'risk.marker': '8% — risk zone threshold',
    'risk.units': '{r} pcs returned · {s} pcs received',
    'risk.noBase': 'Not received by buyers yet',
    'risk.canceled': 'Cancelled orders',
    'risk.canceledHint': 'Number of orders that were not delivered',
    'risk.returns': 'Returned orders',
    'risk.returnsHint': 'Number of orders returned by customers',
    'risk.zoneLow': 'Safe zone',
    'risk.zoneMid': 'Needs attention',
    'risk.zoneHigh': 'Risk zone',
    'risk.zoneNone': 'No base yet',

    'top.title': 'Top sales',
    'top.subtitle': 'Highest revenue products for the period',
    'top.product': 'Product',
    'top.units': 'Units',
    'top.revenue': 'Revenue',
    'top.profit': 'Profit',
    'top.marginSub': 'margin {v}',
    'top.share': 'Share',
    'top.top3': 'Top 3: {v} of revenue',
    'top.top3Hint': 'How much of revenue the three leaders bring together',
    'top.concentrated': 'Reliant on one product',
    'top.concentratedHint':
      'The leader brings {v} of revenue — if it runs out or its price drops, the month changes sharply',
    'top.empty': 'No sales recorded for this period',

    'cats.title': 'By category',
    'cats.subtitle': 'Where revenue came from',
    'cats.total': 'Period revenue',
    'cats.count': '{n} categories',
    'cats.more': '{n} more categories — {v}',
    'cats.empty': 'No category data',

    'delivery.title': 'Delivery types',
    'delivery.subtitle': 'Orders split across FBO / FBS / DBS',
    'delivery.totalChip': '{n} orders',
    'delivery.FBO': 'From the Uzum warehouse',
    'delivery.FBS': 'From your warehouse',
    'delivery.DBS': 'You deliver',
    'delivery.successLine': 'Successful: {n} · {v}',
    'delivery.empty': 'No data',

    'expenses.title': 'Period costs',
    'expenses.subtitle': 'Where the money went: commission, logistics, storage and more',
    'expenses.total': 'Total costs',
    'expenses.totalAside': '{v} of revenue',
    'expenses.pctNote': 'The percentage on the right is of revenue',
    'expenses.empty': 'No costs recorded',

    'warehouse.title': 'Warehouse',
    'warehouse.subtitle': 'Current stock at cost',
    'warehouse.units': 'units',
    'warehouse.split': 'By value: FBO {a} · FBS {b}',
    'warehouse.FBO': 'At the Uzum warehouse',
    'warehouse.FBS': 'At your warehouse',
    'warehouse.capital': 'Total stock capital',
    'warehouse.capitalHint': 'Value of stock at cost price',

    'daily.title': 'Daily dynamics',
    'daily.subtitle': 'Revenue and net profit day by day',
    'daily.revenue': 'Revenue',
    'daily.profit': 'Net profit',
    'daily.empty': 'No daily data',

    'insights.title': 'Takeaways',
    'insights.subtitle': 'What deserves attention this period',
    'insights.empty': 'Nothing stands out — metrics look stable',
    'insights.more': 'Details',
    'metric.netProfit': 'Net profit',
    'metric.expenses': 'Expenses',
    'metric.successRate': 'Success rate',
    'metric.revenue': 'Revenue',
    'metric.categories': 'Categories',
    'metric.stockValue': 'Stock value',
    'metric.orders': 'Orders',
    'metric.tax': 'Tax',
    'metric.avgCheck': 'Average check',
    'metric.margin': 'Margin',

    'compare.title': 'Month comparison',
    'compare.subtitle': 'Last 6 months: revenue and profit',
    'compare.revenue': 'Revenue',
    'compare.profit': 'Profit',
    'compare.empty': 'Not enough data to compare',

    'empty.title': 'No report for this period',
    'empty.hint': 'Pick another period or wait for the sync to finish',
  },
});

type CompareRow = { month: string; revenue: number; profit: number; margin: number };

/** '2026-10' → '2026-09' (oldingi kalendar oyi kaliti) */
function prevMonthKey(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function Reports() {
  const t = useT('reports');
  const f = useFormat();
  /*
   * Davr + sotuv sanasi asosi: sahifa, Excel va Telegram tugmasi bitta `q`
   * bilan — "Qabul sanasi" tanlangan bo'lsa, fayl ham, Telegram'ga ketgan
   * nusxa ham o'sha asosda (2026-10-27).
   */
  const q = useMoneyQuery();
  const basis = q.basis ?? 'order';
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);

  const report = useQuery({
    queryKey: ['reports-monthly', q],
    queryFn: () => api.get<MonthlyReportResponse>('/reports/monthly', q),
  });

  // Oylar taqqoslovi ham hisobot bilan bitta asosda — "oldingi oy marjasi" shu jadvaldan
  const compare = useQuery({
    queryKey: ['reports-compare', q.storeId, q.basis],
    queryFn: () => api.get<CompareRow[]>('/reports/compare', { storeId: q.storeId, basis: q.basis }),
  });

  const data = report.data;

  const dailyData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        date: d.date,
        revenue: d.revenue,
        profit: d.profit,
      })),
    [data],
  );

  const compareData = useMemo(
    () =>
      (compare.data ?? []).slice(-6).map((m) => ({
        month: m.month,
        revenue: m.revenue,
        profit: m.profit,
      })),
    [compare.data],
  );

  /*
   * Sof marjaning oldingi qiymati — faqat davr BITTA kalendar oyi (yoki oy
   * boshidan bugungacha) bo'lganda: oylar taqqoslovida o'sha oydan oldingi oy
   * bor. Marja — foiz ko'rsatkich, uzunligi teng bo'lmagan oylarni ham
   * solishtirsa bo'ladi; summalarni (tushum, foyda) esa to'liq oy bilan
   * yarim oyni solishtirib bo'lmaydi, shuning uchun ularga o'zgarish
   * chiqarilmaydi. Boshqa davrda null — taxmin qilinmaydi.
   */
  const prevMargin = useMemo(() => {
    if (!data || !compare.data) return null;
    const key = data.period.from.slice(0, 7);
    const oneMonth = data.period.from.endsWith('-01') && data.period.to.slice(0, 7) === key;
    if (!oneMonth) return null;
    const prev = compare.data.find((m) => m.month === prevMonthKey(key));
    return prev && prev.revenue > 0 && Number.isFinite(prev.margin) ? prev.margin : null;
  }, [data, compare.data]);

  // Davr chipi javobdagi davrdan (tarif chegarasi bilan qisqargan bo'lishi mumkin), u kelguncha — so'ralgan davr
  const period = data?.period ?? { from: q.from, to: q.to };

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/monthly', q);
      // Nom serverdagidek (Content-Disposition) va fayl ichidagi davrdan — Telegram'ga ketgan fayl bilan bir xil atalsin
      const section = basis === 'receipt' ? 'monthly-receipt' : 'monthly';
      downloadBlob(blob, `savdoiq-${section}-${period.from}_${period.to}.xlsx`);
      toast.success(t('exportOk'));
    } catch {
      toast.error(t('exportErr'));
    } finally {
      setExporting(false);
    }
  };

  /*
   * Telegram'ga — Excel tugmasidagi faylning AYNAN o'zi (server o'sha
   * hisobotdan quradi), parametrlar ham o'sha: so'rov qatorida `q`.
   * Xato kodi bo'yicha aniq matn: ulanmagan bot — Sozlamalarga yo'l.
   */
  const onSendTelegram = async () => {
    setSending(true);
    try {
      await api.post<{ ok: boolean; fileName: string }>('/reports/send-telegram', {}, q);
      toast.success(t('tg.sent'), t('tg.sentHint'));
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      const details = (e?.details ?? {}) as { retryAfterSec?: number; limit?: number };
      if (e?.code === 'telegram_not_linked') toast.error(t('tg.notLinked'), t('tg.notLinkedHint'));
      else if (e?.code === 'telegram_blocked') toast.error(t('tg.blocked'), t('tg.blockedHint'));
      else if (e?.status === 429) {
        toast.warning(
          t('tg.tooMany', { n: f.num(details.limit ?? 5) }),
          t('tg.tooManyHint', { min: f.num(Math.max(1, Math.ceil((details.retryAfterSec ?? 60) / 60))) }),
        );
      } else if (e?.isPlanLimit) toast.error(t('tg.planLimit'));
      else toast.error(t('tg.err'), e?.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PrintStyles />

      <PageHeader
        icon={<FileBarChart className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="monthly_reports" />}
        meta={
          <>
            <span className="meta-chip tnum">
              <CalendarRange className="h-3.5 w-3.5" />
              {f.date(period.from)} — {f.date(period.to)}
            </span>
            {data ? (
              <span className="meta-chip tnum">
                <ShoppingBag className="h-3.5 w-3.5" />
                {t('meta.orders', { n: f.num(data.ordersTotal) })}
              </span>
            ) : null}
            {/* Excel va Telegram'dagi faylning "Holat" qatori bilan bitta qiymat */}
            {data ? <FinalityChip finality={data.finality} basis={basis} /> : null}
            <DataFreshness />
            <CostCoverage />
          </>
        }
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="outline" icon={<Receipt className="h-4 w-4" />} loading={exporting} onClick={onExport}>
              {exporting ? t('exporting') : 'Excel'}
            </Button>
            <Button
              variant="outline"
              icon={<Send className="h-4 w-4" />}
              loading={sending}
              onClick={onSendTelegram}
              title={t('tg.sendHint')}
              aria-label={t('tg.sendHint')}
            >
              {sending ? t('tg.sending') : t('tg.send')}
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} title={t('printHint')} onClick={() => window.print()}>
              {t('print')}
            </Button>
          </div>
        }
      />

      <div className="no-print">
        {/* Sana asosi — davr tanlagichi kabi butun hisobotga (fayl va Telegram nusxasiga ham) ta'sir qiladi */}
        <FilterBar>
          <BasisSwitch />
        </FilterBar>
      </div>

      <PlanGate feature="monthly_reports">
        {report.isError ? (
          <Card>
            <ErrorState
              message={report.error instanceof Error ? report.error.message : undefined}
              onRetry={() => void report.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : report.isLoading ? (
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-3">
              <Skeleton className="h-[320px] w-full xl:col-span-2" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <Skeleton className="h-[152px] w-full" />
                <Skeleton className="h-[152px] w-full" />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <Card>
              <CardBody>
                <SkeletonRows rows={6} />
              </CardBody>
            </Card>
          </div>
        ) : !data ? (
          <Card>
            <EmptyState
              icon={<FileBarChart className="h-6 w-6" />}
              title={t('empty.title')}
              hint={t('empty.hint')}
            />
          </Card>
        ) : (
          <div className="report-sheet space-y-5">
            <PrintHead from={data.period.from} to={data.period.to} finality={data.finality} basis={basis} />

            {/*
              ── Davr natijasi ──
              Chapda sahifaning yagona HeroCard'i (sof foyda va tushum qayerga
              ketgani), o'ngda u bilan takrorlanmaydigan ikki ko'rsatkich.
              Tuzilma Boshqaruv paneli bilan bir xil — sotuvchi ikki sahifada
              raqamni bir joydan izlaydi.
            */}
            <div className="grid gap-4 xl:grid-cols-3">
              <ResultHero className="xl:col-span-2" report={data} prevMargin={prevMargin} />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <StatCard
                  label={t('kpi.revenue')}
                  value={f.money(data.revenue)}
                  hint={t('kpi.revenueSub', { orders: f.num(data.ordersTotal), units: f.num(data.unitsSold) })}
                  icon={<TrendingUp className="h-5 w-5" />}
                  spark={dailyData.map((d) => d.revenue)}
                  tone="brand"
                  // To'lov — Excel'dagi "To‘lov (Uzum o‘tkazadi)" qatori; alohida kartochka emas: o'ng ustun ikki kartochkada qolsin
                  footer={
                    <span className="flex items-center justify-between gap-3" title={t('kpi.payoutHint')}>
                      <span className="truncate">{t('kpi.payout')}</span>
                      <span className="tnum shrink-0 font-semibold text-ink-soft">{f.money(data.payout)}</span>
                    </span>
                  }
                />
                {/* Buyurtma ko'rsatkichi — "Buyurtmalar oqimi" kabi ko'k (info) */}
                <StatCard
                  label={t('kpi.avgCheck')}
                  value={f.money(data.avgCheck)}
                  // O'rtacha chek tirik buyurtmalarga bo'linadi — izohdagi son ham shular (bekor va qaytarilgani kirmaydi)
                  hint={t('kpi.avgCheckHint', { v: f.num(Math.max(0, data.ordersTotal - data.canceled - data.returns)) })}
                  icon={<ShoppingBag className="h-5 w-5" />}
                  tone="info"
                />
              </div>
            </div>

            {/* ── Oqim va xavf ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <OrdersFlowCard report={data} basis={basis} />
              <RiskCard report={data} basis={basis} />
            </div>

            {/* ── Top sotuvlar (ulush va konsentratsiya shu yerda) ── */}
            <TopSalesCard rows={data.topProducts} />

            {/* ── Tushum qayerdan keldi va qayerga ketdi ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoriesCard rows={data.categories} revenue={data.revenue} />
              <ExpensesCard rows={data.expenses} total={data.expensesTotal} revenue={data.revenue} />
            </div>

            {/* ── Logistika: yetkazish turlari va ombor ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <DeliveryTypesCard rows={data.deliveryTypes} />
              <WarehouseCard warehouse={data.warehouse} />
            </div>

            {/* ── Kunlik dinamika ── */}
            <ChartCard
              title={t('daily.title')}
              subtitle={t('daily.subtitle')}
              icon={<BarChart3 />}
              className="print-avoid-break"
            >
              {dailyData.length ? (
                <TrendChart
                  data={dailyData}
                  series={[
                    { key: 'revenue', name: t('daily.revenue'), money: true, color: CHART_COLORS.info },
                    {
                      key: 'profit',
                      name: t('daily.profit'),
                      money: true,
                      color: CHART_COLORS.brand,
                      negColor: CHART_COLORS.danger,
                    },
                  ]}
                  height={300}
                  variant="bars"
                />
              ) : (
                <EmptyState title={t('daily.empty')} />
              )}
            </ChartCard>

            {/* ── Xulosalar ── */}
            <InsightsBlock insights={data.insights} />

            {/* ── Oylar taqqoslash ── */}
            <ChartCard
              title={t('compare.title')}
              subtitle={t('compare.subtitle')}
              icon={<History />}
              className="print-avoid-break print-break-before"
            >
              {compare.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : compare.isError ? (
                <ErrorState
                  message={compare.error instanceof Error ? compare.error.message : undefined}
                  onRetry={() => void compare.refetch()}
                  retryLabel={t('btn.retry')}
                />
              ) : compareData.length ? (
                <BarsChart
                  data={compareData}
                  xKey="month"
                  showLegend
                  series={[
                    { key: 'revenue', name: t('compare.revenue'), money: true, color: CHART_COLORS.info },
                    { key: 'profit', name: t('compare.profit'), money: true, color: CHART_COLORS.brand },
                  ]}
                  height={300}
                />
              ) : (
                <EmptyState title={t('compare.empty')} />
              )}
            </ChartCard>
          </div>
        )}
      </PlanGate>
    </>
  );
}
