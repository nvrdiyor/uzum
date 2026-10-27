import { registerNamespace } from '@/i18n';

/**
 * Sotuv voronkasi sahifasidagi yo'qotish bloklari matnlari: to'rt bosqichli
 * voronka, "Dastlabki" belgisi, yo'qotilgan qiymat va sabablar so'mda.
 * Sahifaning o'z matnlari ('funnel') pages/Funnel.tsx da.
 */
export const FUNNEL_LOSS_NS = 'funnelLoss';

registerNamespace(FUNNEL_LOSS_NS, {
  uz: {
    unit: 'dona',
    units: '{n} dona',
    money: '{v} so‘m',

    'stage.ordered': 'Buyurtma qilindi',
    'stage.shipped': 'Bekor qilinmadi (jo‘natildi)',
    'stage.received': 'Xaridor qabul qildi',
    'stage.kept': 'Qaytarilmadi (sotildi)',
    'stage.ordered.hint': 'Davrda buyurtma qilingan barcha donalar',
    'stage.shipped.hint': 'Bekor qilinganlardan tashqari hammasi — yo‘ldagilar ham shu yerda',
    'stage.received.hint':
      'Topshirish punktida natijasi ma’lum: xaridor olib ketdi yoki qaytardi. Uzum punktda olinmaganini va olib qaytarilganini ajratmaydi',
    'stage.kept.hint': 'Xaridor olib ketgan va qaytarmagan — haqiqiy sotuv',
    'stage.share': 'Buyurtma qilingan donalardan ulushi',
    'drop.canceled': 'Bekor qilindi',
    'drop.returned': 'Qaytarildi',
    'drop.inTransit': 'Hali yo‘lda',
    'drop.inTransit.note': 'yo‘qotish emas, natija kutilmoqda',
    'drop.canceled.rate': 'Bekor qilish ulushi: bekor qilingan ÷ buyurtma qilingan dona — Boshqaruv panelidagi bilan bir xil',
    'drop.returned.rate':
      'Qaytarish ulushi: qaytgan ÷ (xaridor qabul qilgan + qaytgan) dona — Boshqaruv panelidagi bilan bir xil',
    'drop.inTransit.rate': 'Jo‘natilgan donalardan hali yo‘ldagilari',
    'list.label': 'Yo‘qotish voronkasi',

    'prelim.badge': 'Dastlabki · {p} yakunlangan',
    'prelim.hint':
      'Buyurtma qilingan donalardan {p} yakunlangan (sotildi, bekor qilindi yoki qaytdi). Yana {n} dona yo‘lda: ular yetib borgach yoki bekor bo‘lgach sotib olish foizi va yo‘qotishlar o‘zgaradi. Qabul qilinganlar ham keyinroq qaytishi mumkin.',

    'lost.title': 'Yo‘qotilgan qiymat va foyda',
    'lost.subtitle': 'Bekor qilingan va qaytgan donalar',
    'lost.revenue': 'Yo‘qotilgan tushum',
    'lost.revenueHint': 'Sotuv narxi × bekor qilingan va qaytgan dona. Yo‘ldagilar kirmaydi',
    'lost.revenueShare': 'Buyurtmalar summasidan {v}',
    'lost.profit': 'Yo‘qotilgan foyda',
    'lost.profitHint':
      'Shu donalar sotilganda qolardi: har tovarning shu davrdagi bekor qilinmagan va qaytmagan donalaridagi o‘rtacha sof foyda × yo‘qotilgan dona. Qaytarish bilan bog‘liq qo‘shimcha xarajatlar kirmaydi',
    'lost.profitSub': 'O‘rtacha sof foyda bo‘yicha baho',
    'lost.profitNone': 'Baholab bo‘lmadi — bu tovarlarning davrda boshqa buyurtmasi yo‘q',
    'lost.profitNegative': 'Manfiy: bu tovarlar davrda zarariga sotilgan',
    'lost.unpriced': '{n} dona ({v}) baholanmadi: bu tovarlarning davrda bekor qilinmagan va qaytmagan buyurtmasi yo‘q',
    'lost.prelim': 'Dastlabki: yo‘ldagi {n} dona hali bekor bo‘lishi yoki qaytishi mumkin — yo‘qotish oshishi mumkin',
    'lost.none': 'Bu davrda bekor qilingan va qaytgan dona yo‘q',
    'lost.split': 'Yo‘qotilgan tushum turi bo‘yicha',

    'reasons.title': 'Yo‘qotish sabablari',
    'reasons.subtitle': 'So‘mda — Uzum bergan sabab bo‘yicha',
    'reasons.returned': 'Qaytarish',
    'reasons.canceled': 'Bekor qilish',
    'reasons.other': 'Boshqa sabablar ({n} ta)',
    'reasons.shareHint.returned': 'Qaytgan donalar summasidagi ulushi',
    'reasons.shareHint.canceled': 'Bekor qilingan donalar summasidagi ulushi',
    'reasons.empty.returned': 'Bu davrda qaytarish yo‘q',
    'reasons.empty.canceled': 'Bu davrda bekor qilish yo‘q',
    'reasons.note': 'Sabab ko‘rsatilmaganlari oxirida, lekin ulushga kiradi — yig‘indi 100%',
  },
  ru: {
    unit: 'шт.',
    units: '{n} шт.',
    money: '{v} сум',

    'stage.ordered': 'Заказано',
    'stage.shipped': 'Не отменено (отправлено)',
    'stage.received': 'Получено покупателем',
    'stage.kept': 'Не возвращено (продано)',
    'stage.ordered.hint': 'Все штуки, заказанные за период',
    'stage.shipped.hint': 'Всё, кроме отменённого, — штуки в пути тоже здесь',
    'stage.received.hint':
      'Итог в пункте выдачи известен: покупатель забрал или вернул. Uzum не разделяет «не забрал» и «забрал и вернул»',
    'stage.kept.hint': 'Покупатель забрал и не вернул — настоящая продажа',
    'stage.share': 'Доля от заказанных штук',
    'drop.canceled': 'Отменено',
    'drop.returned': 'Возвращено',
    'drop.inTransit': 'Ещё в пути',
    'drop.inTransit.note': 'не потеря, итог ещё не известен',
    'drop.canceled.rate': 'Доля отмен = отменённые шт. ÷ все заказанные шт. — как на главной панели',
    'drop.returned.rate': 'Доля возвратов = возвращённые шт. ÷ (полученные покупателем + возвращённые шт.) — как на главной панели',
    'drop.inTransit.rate': 'Доля отправленных штук, которые ещё в пути',
    'list.label': 'Воронка потерь',

    'prelim.badge': 'Предварительно · завершено {p}',
    'prelim.hint':
      'Завершено {p} заказанных штук (продано, отменено или возвращено). Ещё в пути: {n} шт. — когда они дойдут или будут отменены, процент выкупа и потери изменятся. Полученные товары тоже могут вернуть позже.',

    'lost.title': 'Потерянная выручка и прибыль',
    'lost.subtitle': 'Отменённые и возвращённые штуки',
    'lost.revenue': 'Потерянная выручка',
    'lost.revenueHint': 'Цена продажи × отменённые и возвращённые штуки. Штуки в пути не входят',
    'lost.revenueShare': 'От суммы заказов: {v}',
    'lost.profit': 'Потерянная прибыль',
    'lost.profitHint':
      'Сколько осталось бы при продаже этих штук: средняя чистая прибыль неотменённых и невозвращённых штук того же товара за период × потерянные штуки. Дополнительные расходы на возврат не входят',
    'lost.profitSub': 'Оценка по средней чистой прибыли',
    'lost.profitNone': 'Оценить нельзя — у этих товаров за период нет других заказов',
    'lost.profitNegative': 'Отрицательная: эти товары за период продавались в убыток',
    'lost.unpriced': 'Без оценки: {n} шт. ({v}) — у этих товаров за период нет неотменённых и невозвращённых заказов',
    'lost.prelim': 'Предварительно: {n} шт. в пути ещё могут отменить или вернуть — потери могут вырасти',
    'lost.none': 'Отменённых и возвращённых штук за период нет',
    'lost.split': 'Потерянная выручка по видам',

    'reasons.title': 'Причины потерь',
    'reasons.subtitle': 'В деньгах — по причине, которую передал Uzum',
    'reasons.returned': 'Возвраты',
    'reasons.canceled': 'Отмены',
    'reasons.other': 'Другие причины: {n}',
    'reasons.shareHint.returned': 'Доля в сумме возвращённых штук',
    'reasons.shareHint.canceled': 'Доля в сумме отменённых штук',
    'reasons.empty.returned': 'Возвратов за период нет',
    'reasons.empty.canceled': 'Отмен за период нет',
    'reasons.note': 'Без указанной причины — в конце списка, но входят в доли: в сумме 100%',
  },
  en: {
    unit: 'pcs',
    units: '{n} pcs',
    money: '{v} UZS',

    'stage.ordered': 'Ordered',
    'stage.shipped': 'Not cancelled (shipped)',
    'stage.received': 'Reached the buyer',
    'stage.kept': 'Not returned (sold)',
    'stage.ordered.hint': 'All units ordered in the period',
    'stage.shipped.hint': 'Everything except cancellations — units in transit are here too',
    'stage.received.hint':
      'The outcome at the pickup point is known: the buyer took it or returned it. Uzum does not separate “not picked up” from “picked up and returned”',
    'stage.kept.hint': 'Taken by the buyer and not returned — a real sale',
    'stage.share': 'Share of ordered units',
    'drop.canceled': 'Cancelled',
    'drop.returned': 'Returned',
    'drop.inTransit': 'Still in transit',
    'drop.inTransit.note': 'not a loss, outcome pending',
    'drop.canceled.rate': 'Cancellation rate = cancelled units ÷ all ordered units — same as on the dashboard',
    'drop.returned.rate': 'Return rate = returned units ÷ (units received by buyers + returned units) — same as on the dashboard',
    'drop.inTransit.rate': 'Share of shipped units still in transit',
    'list.label': 'Loss funnel',

    'prelim.badge': 'Preliminary · {p} completed',
    'prelim.hint':
      '{p} of ordered units are completed (sold, cancelled or returned). Units still in transit: {n} — once they arrive or get cancelled, the buyout rate and losses will change. Received items can also be returned later.',

    'lost.title': 'Lost revenue and profit',
    'lost.subtitle': 'Cancelled and returned units',
    'lost.revenue': 'Lost revenue',
    'lost.revenueHint': 'Sell price × cancelled and returned units. Units in transit are not included',
    'lost.revenueShare': 'Of the ordered amount: {v}',
    'lost.profit': 'Lost profit',
    'lost.profitHint':
      'What these units would have earned: the average net profit of the same product’s non-cancelled, non-returned units in the period × lost units. Extra costs of returns are not included',
    'lost.profitSub': 'Estimated from average net profit',
    'lost.profitNone': 'Cannot estimate — these products have no other orders in the period',
    'lost.profitNegative': 'Negative: these products sold at a loss in the period',
    'lost.unpriced': 'Not estimated: {n} pcs ({v}) — these products have no non-cancelled, non-returned orders in the period',
    'lost.prelim': 'Preliminary: {n} pcs in transit can still be cancelled or returned — losses may grow',
    'lost.none': 'No cancelled or returned units in this period',
    'lost.split': 'Lost revenue by type',

    'reasons.title': 'Why it was lost',
    'reasons.subtitle': 'In money — by the reason Uzum reports',
    'reasons.returned': 'Returns',
    'reasons.canceled': 'Cancellations',
    'reasons.other': 'Other reasons: {n}',
    'reasons.shareHint.returned': 'Share of the returned amount',
    'reasons.shareHint.canceled': 'Share of the cancelled amount',
    'reasons.empty.returned': 'No returns in this period',
    'reasons.empty.canceled': 'No cancellations in this period',
    'reasons.note': 'Entries without a reason come last but count towards the shares — they add up to 100%',
  },
});
