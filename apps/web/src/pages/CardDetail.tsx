import { useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CARD_LANGS, type CardDetailResponse, type CardLang } from '@savdoiq/shared';
import { ArrowLeft, PackageSearch } from '@/components/icons';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  Segmented,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';
import { AiTab } from '@/components/cards/AiTab';
import { AuditTab, type CardTab } from '@/components/cards/AuditTab';
import { CardHero, ImpactCard } from '@/components/cards/CardHero';
import { ContentTab } from '@/components/cards/ContentTab';
import { DraftsTab } from '@/components/cards/DraftsTab';
import { KeywordsTab } from '@/components/cards/KeywordsTab';
import { ReviewsTab } from '@/components/cards/ReviewsTab';
import { auditFor, textsFromContents, useCanEditCards, type ContentEdits } from '@/components/cards/shared';
import { api, ApiError } from '@/lib/api';
import { useFeature } from '@/store/session';
import { registerNamespace, useT } from '@/i18n';

registerNamespace('cardDetail', {
  uz: {
    title: 'Kartochka SEO',
    subtitle: 'Nom, tavsif va kalit so‘zlar auditi, bepul AI yordamchi',
    back: 'Kartochkalarga qaytish',
    notFound: 'Mahsulot topilmadi',
    notFoundHint: 'Mahsulot o‘chirilgan yoki sizning kompaniyangizga tegishli emas',
    openUzum: 'Uzum’da ochish',
    noCategory: 'Kategoriyasiz',
    blocked: 'Bloklangan',
    score: 'Kartochka bali',
    'score.good': 'Yaxshi',
    'score.mid': 'O‘rtacha',
    'score.low': 'Zaif',
    units: '{n} dona',
    'sales.revenue': 'Tushum',
    'sales.profit': 'Sof foyda',
    'sales.units': 'Sotildi',
    'sales.stock': 'Qoldiq',
    'sales.period': 'oxirgi 30 kun',
    'sales.noStock': 'Omborda yo‘q',
    'impact.title': 'Matn qo‘yilgandan keyingi natija',
    'impact.subtitle': '{date} da qo‘yilgan: oldingi va keyingi {n} kun taqqoslanadi',
    'impact.pending': '{date} da qo‘yilgan — natija kuzatilmoqda, ertadan boshlab ko‘rinadi',
    'impact.revenue': 'Tushum',
    'impact.units': 'Dona',
    'impact.orders': 'Buyurtmalar',
    'impact.before': 'Oldingi {n} kun',
    'impact.after': 'Keyingi {n} kun',
    'impact.note':
      'Bu taxminiy taqqoslash: aksiyalar, mavsum, narx va reklama ham natijaga ta’sir qiladi. Bir necha hafta kuzating.',
    'tab.content': 'Matn',
    'tab.keywords': 'Kalit so‘zlar',
    'tab.audit': 'Audit',
    'tab.reviews': 'Sharhlar',
    'tab.ai': 'AI yordamchi',
    'tab.drafts': 'Qoralamalar',
    'lang.ruFull': 'Ruscha',
    'lang.uzFull': 'O‘zbekcha',
    'copy.ok': 'Nusxalandi',
    'copy.err': 'Nusxalab bo‘lmadi',
    'copy.errHint': 'Matnni belgilab, Ctrl+C bilan qo‘lda nusxalang',
    'copy.title': 'Nomni nusxalash',
    'copy.titleOk': 'Nom nusxalandi',
    'copy.desc': 'Tavsifni nusxalash',
    'copy.descOk': 'Tavsif nusxalandi',
    'copy.descOkBody': 'Uzum kabinetidagi tavsif maydoniga joylang (Ctrl+V)',
    'copy.html': 'HTML kodi',
    'copy.htmlOk': 'Tavsifning HTML kodi nusxalandi',
    'level.error': 'Muhim',
    'level.warn': 'Diqqat',
    'level.info': 'Maslahat',

    'content.hint':
      'Uzum kabinetidagi kartochkadan nom va tavsifni nusxalab shu yerga joylang — Seller API tavsifni bermaydi. Ikkala tilni ham kiriting: Uzum ruscha va o‘zbekcha qidiradi.',
    'content.source.seller_api': 'Seller API’dan, faqat nom',
    'content.source.manual': 'Qo‘lda kiritilgan',
    'content.source.draft': 'Qoralamadan qo‘yilgan',
    'content.source.none': 'Kiritilmagan',
    'content.updated': 'Yangilangan: {date}',
    'content.title': 'Kartochka matni',
    'content.subtitle': 'Audit va AI so‘rovi shu matndan foydalanadi',
    'content.titleLabel': 'Nomi ({lang})',
    'content.titleCounter': '{n} / {max} belgi',
    'content.titlePlaceholder': 'Kartochka nomi',
    'content.titleShortHint': 'Nom qisqa — tavsiya {min}+ belgi: mahsulot turi, brend, asosiy xususiyat',
    'content.descLabel': 'Tavsif (HTML mumkin)',
    'content.descCounter': '{n} belgi · tavsiya {min}+',
    'content.descPlaceholder': 'Uzum kabinetidagi tavsifni shu yerga joylang',
    'content.liveScore': 'Ball (saqlansa)',
    'content.reset': 'Bekor qilish',
    'content.save': 'Saqlash',
    'content.saved': 'Matn saqlandi',
    'content.cleared': 'Matn o‘chirildi',
    'content.saveErr': 'Matnni saqlab bo‘lmadi',
    'content.clearNote': 'Ikkala maydonni bo‘shatib saqlasangiz, kiritilgan matn o‘chiriladi (Seller API nomi qoladi).',
    'content.readOnly': 'Ko‘rish rejimi: matnni faqat egasi yoki menejer o‘zgartiradi.',
    'content.preview': 'Ko‘rinishi',
    'content.previewHint': 'Faqat ruxsat etilgan teglar: p, br, ul, ol, li, b, i',
    'content.noTitle': 'Nom kiritilmagan',
    'content.previewEmpty': 'Tavsif bo‘sh',
    'content.unsaved': 'Saqlanmagan o‘zgarish bor',

    'kw.title': 'Kalit so‘zlar',
    'kw.subtitle': 'Xaridorlar qidiradigan iboralar — ular nom va tavsifda bo‘lishi kerak',
    'kw.inTitleShort': 'Nomda: {n}/{total}',
    'kw.inAnyShort': 'Matnda: {n}/{total}',
    'kw.demandShort': 'Talab qamrovi: {pct}',
    'kw.empty': 'Kalit so‘z qo‘shilmagan',
    'kw.emptyHint': 'Iboralarni qo‘lda yozing, Uzum kabinetidan import qiling yoki taklif oling',
    'kw.col.text': 'Ibora',
    'kw.col.demand': 'Talab',
    'kw.col.title': 'Nomda',
    'kw.col.desc': 'Tavsifda',
    'kw.col.source': 'Manba',
    'kw.col.status': 'Holat',
    'kw.delete': 'Iborani o‘chirish',
    'kw.demandNone': 'Talab faqat import qilinganda ko‘rinadi',
    'kw.source.seller': 'Qo‘lda',
    'kw.source.auto': 'Taklif',
    'kw.source.import': 'Import',
    'kw.status.active': 'Faol',
    'kw.status.excluded': 'Chiqarilgan',
    'kw.matchNote':
      'Moslik taxminiy: so‘z qo‘shimchasi bilan ham topiladi. Chiqarilgan iboralar ballga va AI so‘roviga kirmaydi.',
    'kw.add.title': 'Kalit so‘z qo‘shish',
    'kw.add.subtitle': '{n} / {max} ta ibora',
    'kw.mode.manual': 'Qo‘lda',
    'kw.mode.import': 'Jadvaldan import',
    'kw.mode.suggest': 'Taklif olish',
    'kw.manual.label': 'Har qatorda bitta ibora',
    'kw.manual.placeholder': 'электрический чайник\nelektr choynak',
    'kw.manual.count': '{n} ta yangi ibora',
    'kw.manual.add': 'Qo‘shish',
    'kw.import.hint':
      'Uzum kabineti → «Буст в ТОП» bo‘limidan iboralarni «Прогноз показов» ustuni bilan nusxalab joylang. Har qanday jadval ham bo‘ladi: har qatorda «ibora<TAB>son» (yoki ; | bilan). Son bo‘lmasa — talab bo‘sh qoladi.',
    'kw.import.label': 'Jadval',
    'kw.import.placeholder': 'электрический чайник\t12500\nelektr choynak\t3400',
    'kw.import.parsed': '{n} ta ibora, {d} tasida talab bor',
    'kw.import.more': 'yana {n} ta…',
    'kw.import.btn': 'Import qilish',
    'kw.suggest.hint':
      'Nom, kategoriya, variantlar va sharhlardan nomzod iboralar (bepul, kodda hisoblanadi). Talab soni berilmaydi — keraklilarini tanlang.',
    'kw.suggest.btn': 'Taklif olish',
    'kw.suggest.again': 'Qayta olish',
    'kw.suggest.all': 'Hammasini tanlash',
    'kw.suggest.clear': 'Tanlovni tozalash',
    'kw.suggest.none': 'Yangi taklif topilmadi',
    'kw.suggest.addSelected': 'Tanlanganlarni qo‘shish ({n})',
    'kw.saved': '{n} ta ibora saqlandi',
    'kw.saveErr': 'Kalit so‘zlarni saqlab bo‘lmadi',
    'kw.updErr': 'Holatni o‘zgartirib bo‘lmadi',
    'kw.deleted': 'Ibora o‘chirildi',
    'kw.delErr': 'Iborani o‘chirib bo‘lmadi',
    'kw.suggestErr': 'Taklif olib bo‘lmadi',
    'kw.limit': 'Bitta kartochkada ko‘pi bilan {max} ta ibora',
    'kw.noLang': '{lang} matni kiritilmagan',
    'kw.yes': 'Bor',
    'kw.no': 'Yo‘q',

    'audit.title': 'Kartochka auditi',
    'audit.subtitle': 'Bo‘sh tavsif va kalit so‘zlar 0 ball oladi — to‘ldirsangiz ball oshadi',
    'audit.issuesCount': '{n} ta kamchilik',
    'audit.coverage': 'Kalit so‘zlar qamrovi',
    'audit.cov.none': 'Faol kalit so‘z yo‘q — qaysi iboralar nomda bo‘lishi kerakligini bilib bo‘lmaydi.',
    'audit.cov.add': 'Kalit so‘z qo‘shish',
    'audit.cov.inTitle': 'Nomda',
    'audit.cov.inAny': 'Nom yoki tavsifda',
    'audit.cov.demand': 'Talab qoplangan',
    'audit.cov.noDemand': 'Talab (ko‘rishlar) import qilinmagan — qamrov iboralar soni bo‘yicha.',
    'audit.issues': 'Kamchiliklar',
    'audit.disclaimer': 'Qoidalar Uzum sotuvchi qo‘llanmasiga tayanadi; stop-so‘zlar ro‘yxati taxminiy.',
    'audit.naShort': 'Ma’lumot yo‘q',
    'audit.fix': 'Tuzatish',
    'audit.noIssues': 'Kamchilik topilmadi',
    'audit.na.title': 'Nom yo‘q.',
    'audit.na.keywords': 'Kalit so‘z qo‘shilmagan.',
    'audit.na.description': 'Tavsif joylanmagan.',
    'audit.na.social': 'Sharhlar ma’lumoti yo‘q.',
    'audit.na.health': 'Mahsulot holati ma’lumoti yo‘q.',
    'audit.naNote': 'Bo‘lim umumiy ballga kirmaydi.',
    'section.title': 'Nom',
    'section.keywords': 'Kalit so‘zlar',
    'section.description': 'Tavsif',
    'section.social': 'Sharhlar',
    'section.health': 'Holat',

    'issue.title.missing': 'Nom kiritilmagan',
    'issue.title.short': 'Nom qisqa: {len} belgi (tavsiya {min}+)',
    'issue.title.long': 'Nom uzun: {len} belgi (tavsiya {max} gacha)',
    'issue.title.fewWords': 'Nomda {min} tadan kam so‘z',
    'issue.title.stopWord': 'Nomda tavsiya etilmaydigan so‘zlar: {words}',
    'issue.title.caps': 'Nomda KATTA harflar bilan yozilgan so‘zlar ko‘p',
    'issue.title.emojiOrLink': 'Nomda emoji yoki havola bor',
    'issue.title.noCategory': 'Nomda mahsulot turi ({category}) yo‘q',
    'issue.title.missingLang': 'Shu tilda nom yo‘q',
    'issue.kw.none': 'Kalit so‘zlar qo‘shilmagan',
    'issue.kw.topMissingInTitle': 'Eng muhim ibora «{text}» nomda yo‘q',
    'issue.kw.lowTitleCoverage': 'Kalit so‘zlarning faqat {pct}% i nomda',
    'issue.kw.missed': '{count} ta ibora nomda ham, tavsifda ham yo‘q',
    'issue.desc.notLoaded': 'Tavsif joylanmagan — «Matn» bo‘limida kiriting',
    'issue.desc.short': 'Tavsif qisqa: {len} belgi (tavsiya {min}+)',
    'issue.desc.long': 'Tavsif juda uzun: {len} belgi ({max} gacha)',
    'issue.desc.noStructure': 'Tavsifda ro‘yxat yoki xatboshilar yo‘q',
    'issue.desc.contact': 'Tavsifda telefon yoki havola bor — Uzum buni taqiqlaydi',
    'issue.desc.stopWord': 'Tavsifda tavsiya etilmaydigan so‘zlar: {words}',
    'issue.desc.missingLang': 'Shu tilda tavsif yo‘q',
    'issue.social.noReviews': 'Hali sharh yo‘q',
    'issue.social.lowRating': 'Reyting past: {rating}',
    'issue.social.fewReviews': 'Sharhlar kam: {count} ta',
    'issue.social.unanswered': '{count} ta sharh javobsiz',
    'issue.health.blocked': 'Mahsulot bloklangan',
    'issue.health.returns': 'Qaytarishlar: {pct}%',
    'issue.health.noImage': 'Rasm yo‘q',

    'rev.empty': 'Sharhlar yo‘q',
    'rev.emptyHint': 'Bu mahsulotga hali sharh yozilmagan',
    'rev.aiHint': 'Xaridor maqtagan va shikoyat qilgan jihatlar AI so‘roviga qo‘shiladi — yangi tavsif ularning savollariga javob beradi.',
    'rev.title': 'Reyting',
    'rev.subtitle': 'Baholar taqsimoti va javoblar',
    'rev.countN': '{n} ta sharh',
    'rev.answered': 'Javob berilgan',
    'rev.answeredOf': '{n} / {total}',
    'rev.unanswered': 'Javobsiz',
    'rev.reply': 'Sharhlarga javob berish',
    'rev.pros': 'Maqtashadi',
    'rev.prosEmpty': 'Sharhlarda «Afzalliklari» qismi topilmadi',
    'rev.cons': 'Shikoyat qilishadi',
    'rev.consEmpty': 'Shikoyat topilmadi',
    'rev.recent': 'Oxirgi sharhlar',
    'rev.recentEmpty': 'Matnli sharh yo‘q',
    'rev.noText': 'Matnsiz sharh',

    'ai.title': 'Bepul AI yordamchi',
    'ai.subtitle': 'Pullik AI kerak emas: so‘rovni bepul chatbotga qo‘ying va javobni shu yerga qaytaring',
    'ai.step1.title': 'So‘rovni nusxalang',
    'ai.step1.body': 'Nom, tavsif, variantlar, kalit so‘zlar va sharhlar bitta tayyor so‘rovga yig‘iladi',
    'ai.step2.title': 'Bepul chatbotga joylang',
    'ai.step2.body': 'ChatGPT, Gemini yoki Claude.ai — bepul akkaunt yetarli',
    'ai.step3.title': 'Javobni shu yerga qaytaring',
    'ai.step3.body': 'Biz uni tekshiramiz, ballini hisoblaymiz va qoralama sifatida saqlaymiz',
    'ai.thin':
      'Ma’lumot kam: tavsif kiritilmagan, AI faqat nom va variantlardan yozadi. Yaxshiroq natija uchun avval «Matn» bo‘limida Uzum kabinetidagi tavsifni joylang.',
    'ai.langs': 'Qaysi tilda yozilsin',
    'ai.lang.both': 'RU + UZ',
    'ai.lang.ru': 'Faqat RU',
    'ai.lang.uz': 'Faqat UZ',
    'ai.show': 'So‘rovni ko‘rish',
    'ai.hide': 'So‘rovni yashirish',
    'ai.copy': 'So‘rovni nusxalash',
    'ai.copied': 'So‘rov nusxalandi',
    'ai.copiedBody': 'Endi chatbotni oching va joylang (Ctrl+V)',
    'ai.copyErr': 'Nusxalab bo‘lmadi',
    'ai.copyErrBody': 'So‘rov ochildi va belgilandi — Ctrl+C bilan nusxalang',
    'ai.promptLabel': 'Chatbot uchun so‘rov',
    'ai.promptChars': '{n} belgi',
    'ai.open': 'Chatbotni ochish',
    'ai.privacy': 'So‘rovda faqat mahsulot matni bor — narx, foyda va kompaniya ma’lumotlari yuborilmaydi.',
    'ai.answer': 'Javobni shu yerga joylang',
    'ai.answerHint': 'Chatbot javobini boshidan oxirigacha nusxalang — ortiqcha izohlar o‘zi tashlanadi',
    'ai.clear': 'Tozalash',
    'ai.answerPlaceholder': '{ "ru": { "title": "…", "description_html": "…", "usp": ["…"] }, "uz": { … } }',
    'ai.parseErr': 'Javobni o‘qib bo‘lmadi',
    'ai.parseErrHint':
      'Javobda JSON topilmadi yoki u to‘liq emas. Chatbot javobini to‘liq nusxalang yoki undan «Ответь только JSON» deb qayta so‘rang.',
    'ai.missingLang': 'Javobda {lang} matni yo‘q — chatbotdan shu tilni ham yozishni so‘rang',
    'ai.scoreIf': '{lang} qo‘yilsa',
    'ai.both': 'Ikkala til qo‘yilsa',
    'ai.save': 'Qoralama sifatida saqlash',
    'ai.saved': '{n} ta qoralama saqlandi',
    'ai.savedBody': 'Matnni Uzum kabinetiga qo‘ying va «Qoralamalar» bo‘limida belgilang',
    'ai.saveErr': 'Qoralamani saqlab bo‘lmadi',
    'ai.result': 'Yangi matn',
    'ai.newTitle': 'Yangi nom',
    'ai.noTitle': 'Javobda nom yo‘q — joriy nom qoladi',
    'ai.usp': 'Afzalliklar (USP)',
    'ai.desc': 'Tavsif',
    'ai.noDesc': 'Javobda tavsif yo‘q — joriy tavsif qoladi',
    'ai.warnNumbers': 'AI o‘ylab topgan bo‘lishi mumkin bo‘lgan sonlar: {list}. Mahsulotda bo‘lmasa, olib tashlang.',
    'ai.warnStop': 'Tavsiya etilmaydigan so‘zlar: {list}',
    'ai.warnLong': 'Nom {n} belgi — tavsiya {max} gacha',
    'ai.noWarnings': 'Ogohlantirish yo‘q: yangi son, stop-so‘z va uzun nom topilmadi.',
    'ai.remaining': 'Qolgan kamchiliklar',

    'dr.title': 'Qoralamalar',
    'dr.subtitle': 'Uzum’ga avtomatik yozilmaydi — kabinetga o‘zingiz qo‘yasiz',
    'dr.steps':
      'Qanday qo‘yiladi: 1) nom va tavsifni nusxalang; 2) Uzum kabinetida kartochkani tahrirlang va saqlang; 3) shu yerda «Uzum’ga qo‘ydim» ni bosing — natija kuzatila boshlaydi.',
    'dr.empty': 'Qoralama yo‘q',
    'dr.emptyHint': '«AI yordamchi» bo‘limida bepul chatbot yordamida yangi matn tayyorlang',
    'dr.toAi': 'AI yordamchini ochish',
    'dr.status.draft': 'Qoralama',
    'dr.status.applied': 'Uzum’ga qo‘yilgan',
    'dr.source.ai_chat': 'AI chat',
    'dr.source.manual': 'Qo‘lda',
    'dr.score': 'Ball',
    'dr.appliedAt': 'Qo‘yilgan sana: {date}',
    'dr.showDesc': 'Tavsifni ko‘rish',
    'dr.hideDesc': 'Tavsifni yashirish',
    'dr.openCabinet': 'Uzum kabinetini ochish',
    'dr.apply': 'Uzum’ga qo‘ydim',
    'dr.delete': 'Qoralamani o‘chirish',
    'dr.applyTitle': 'Matn Uzum’ga qo‘yildimi?',
    'dr.applyBody':
      'Bu qoralama ({lang}) saqlangan kartochka matni o‘rniga yoziladi va shu kundan boshlab sotuvga ta’siri kuzatiladi: oldingi va keyingi kunlar taqqoslanadi.',
    'dr.applyNote': 'Avval matnni Uzum kabinetidagi kartochkaga qo‘yib saqlaganingizga ishonch hosil qiling — SavdoIQ Uzum’ga o‘zi yozmaydi.',
    'dr.applyConfirm': 'Ha, qo‘ydim',
    'dr.applied': 'Belgilandi',
    'dr.appliedBody': 'Natija bir necha kundan keyin sahifa tepasida ko‘rinadi',
    'dr.applyErr': 'Belgilab bo‘lmadi',
    'dr.deleteTitle': 'Qoralamani o‘chirasizmi?',
    'dr.deleteBody': 'Qoralama butunlay o‘chiriladi.',
    'dr.deleteBodyApplied': 'Qoralama o‘chiriladi. Saqlangan kartochka matni o‘zgarmaydi.',
    'dr.deleted': 'Qoralama o‘chirildi',
    'dr.delErr': 'Qoralamani o‘chirib bo‘lmadi',
  },
  ru: {
    title: 'SEO карточки',
    subtitle: 'Аудит названия, описания и ключевых запросов, бесплатный AI-помощник',
    back: 'К карточкам',
    notFound: 'Товар не найден',
    notFoundHint: 'Товар удалён или не принадлежит вашей компании',
    openUzum: 'Открыть на Uzum',
    noCategory: 'Без категории',
    blocked: 'Заблокирован',
    score: 'Оценка карточки',
    'score.good': 'Хорошо',
    'score.mid': 'Средне',
    'score.low': 'Слабо',
    units: '{n} шт.',
    'sales.revenue': 'Выручка',
    'sales.profit': 'Чистая прибыль',
    'sales.units': 'Продано',
    'sales.stock': 'Остаток',
    'sales.period': 'последние 30 дней',
    'sales.noStock': 'Нет на складе',
    'impact.title': 'Результат после замены текста',
    'impact.subtitle': 'Внесено {date}: сравниваются {n} дн. до и после',
    'impact.pending': 'Внесено {date} — результат отслеживается, будет виден с завтрашнего дня',
    'impact.revenue': 'Выручка',
    'impact.units': 'Штук',
    'impact.orders': 'Заказы',
    'impact.before': '{n} дн. до',
    'impact.after': '{n} дн. после',
    'impact.note':
      'Сравнение приблизительное: акции, сезон, цена и реклама тоже влияют на результат. Наблюдайте несколько недель.',
    'tab.content': 'Текст',
    'tab.keywords': 'Ключевые запросы',
    'tab.audit': 'Аудит',
    'tab.reviews': 'Отзывы',
    'tab.ai': 'AI-помощник',
    'tab.drafts': 'Черновики',
    'lang.ruFull': 'Русский',
    'lang.uzFull': 'Узбекский',
    'copy.ok': 'Скопировано',
    'copy.err': 'Не удалось скопировать',
    'copy.errHint': 'Выделите текст и скопируйте вручную (Ctrl+C)',
    'copy.title': 'Копировать название',
    'copy.titleOk': 'Название скопировано',
    'copy.desc': 'Копировать описание',
    'copy.descOk': 'Описание скопировано',
    'copy.descOkBody': 'Вставьте его в поле описания в кабинете Uzum (Ctrl+V)',
    'copy.html': 'HTML-код',
    'copy.htmlOk': 'HTML-код описания скопирован',
    'level.error': 'Важно',
    'level.warn': 'Внимание',
    'level.info': 'Совет',

    'content.hint':
      'Скопируйте название и описание из карточки в кабинете Uzum и вставьте сюда — Seller API не отдаёт описание. Заполните оба языка: Uzum ищет и по-русски, и по-узбекски.',
    'content.source.seller_api': 'Из Seller API, только название',
    'content.source.manual': 'Введено вручную',
    'content.source.draft': 'Из черновика',
    'content.source.none': 'Не заполнено',
    'content.updated': 'Обновлено: {date}',
    'content.title': 'Текст карточки',
    'content.subtitle': 'Аудит и запрос для AI используют этот текст',
    'content.titleLabel': 'Название ({lang})',
    'content.titleCounter': '{n} / {max} симв.',
    'content.titlePlaceholder': 'Название карточки',
    'content.titleShortHint': 'Короткое название — рекомендуется от {min} симв.: тип товара, бренд, главная характеристика',
    'content.descLabel': 'Описание (можно HTML)',
    'content.descCounter': '{n} симв. · рекомендуется от {min}',
    'content.descPlaceholder': 'Вставьте сюда описание из кабинета Uzum',
    'content.liveScore': 'Оценка (после сохранения)',
    'content.reset': 'Отменить',
    'content.save': 'Сохранить',
    'content.saved': 'Текст сохранён',
    'content.cleared': 'Текст удалён',
    'content.saveErr': 'Не удалось сохранить текст',
    'content.clearNote': 'Если очистить оба поля и сохранить, введённый текст удалится (название из Seller API останется).',
    'content.readOnly': 'Режим просмотра: менять текст может только владелец или менеджер.',
    'content.preview': 'Предпросмотр',
    'content.previewHint': 'Разрешены только теги: p, br, ul, ol, li, b, i',
    'content.noTitle': 'Название не заполнено',
    'content.previewEmpty': 'Описание пустое',
    'content.unsaved': 'Есть несохранённые изменения',

    'kw.title': 'Ключевые запросы',
    'kw.subtitle': 'Фразы, по которым ищут покупатели, — они должны быть в названии и описании',
    'kw.inTitleShort': 'В названии: {n}/{total}',
    'kw.inAnyShort': 'В тексте: {n}/{total}',
    'kw.demandShort': 'Охват спроса: {pct}',
    'kw.empty': 'Ключевые запросы не добавлены',
    'kw.emptyHint': 'Впишите фразы вручную, импортируйте из кабинета Uzum или получите подсказки',
    'kw.col.text': 'Фраза',
    'kw.col.demand': 'Спрос',
    'kw.col.title': 'В названии',
    'kw.col.desc': 'В описании',
    'kw.col.source': 'Источник',
    'kw.col.status': 'Статус',
    'kw.delete': 'Удалить фразу',
    'kw.demandNone': 'Спрос виден только после импорта',
    'kw.source.seller': 'Вручную',
    'kw.source.auto': 'Подсказка',
    'kw.source.import': 'Импорт',
    'kw.status.active': 'Активна',
    'kw.status.excluded': 'Исключена',
    'kw.matchNote':
      'Совпадение приблизительное: слово находится и с окончанием. Исключённые фразы не влияют на оценку и не попадают в запрос AI.',
    'kw.add.title': 'Добавить запросы',
    'kw.add.subtitle': '{n} / {max} фраз',
    'kw.mode.manual': 'Вручную',
    'kw.mode.import': 'Импорт из таблицы',
    'kw.mode.suggest': 'Подсказки',
    'kw.manual.label': 'По одной фразе в строке',
    'kw.manual.placeholder': 'электрический чайник\nelektr choynak',
    'kw.manual.count': 'Новых фраз: {n}',
    'kw.manual.add': 'Добавить',
    'kw.import.hint':
      'Кабинет Uzum → «Буст в ТОП»: скопируйте фразы вместе со столбцом «Прогноз показов» и вставьте сюда. Подойдёт любая таблица: в каждой строке «фраза<TAB>число» (или через ; |). Без числа спрос останется пустым.',
    'kw.import.label': 'Таблица',
    'kw.import.placeholder': 'электрический чайник\t12500\nelektr choynak\t3400',
    'kw.import.parsed': 'Фраз: {n}, со спросом: {d}',
    'kw.import.more': 'и ещё {n}…',
    'kw.import.btn': 'Импортировать',
    'kw.suggest.hint':
      'Фразы-кандидаты из названия, категории, вариантов и отзывов (бесплатно, считается в коде). Спрос не указывается — выберите нужные.',
    'kw.suggest.btn': 'Получить подсказки',
    'kw.suggest.again': 'Обновить',
    'kw.suggest.all': 'Выбрать все',
    'kw.suggest.clear': 'Снять выбор',
    'kw.suggest.none': 'Новых подсказок нет',
    'kw.suggest.addSelected': 'Добавить выбранные ({n})',
    'kw.saved': 'Сохранено фраз: {n}',
    'kw.saveErr': 'Не удалось сохранить запросы',
    'kw.updErr': 'Не удалось изменить статус',
    'kw.deleted': 'Фраза удалена',
    'kw.delErr': 'Не удалось удалить фразу',
    'kw.suggestErr': 'Не удалось получить подсказки',
    'kw.limit': 'В одной карточке не больше {max} фраз',
    'kw.noLang': 'Текст на {lang} не заполнен',
    'kw.yes': 'Есть',
    'kw.no': 'Нет',

    'audit.title': 'Аудит карточки',
    'audit.subtitle': 'Пустое описание и ключевые запросы дают 0 баллов — заполните их, чтобы поднять оценку',
    'audit.issuesCount': 'Замечаний: {n}',
    'audit.coverage': 'Охват ключевых запросов',
    'audit.cov.none': 'Нет активных запросов — непонятно, какие фразы должны быть в названии.',
    'audit.cov.add': 'Добавить запросы',
    'audit.cov.inTitle': 'В названии',
    'audit.cov.inAny': 'В названии или описании',
    'audit.cov.demand': 'Покрыто спроса',
    'audit.cov.noDemand': 'Спрос (показы) не импортирован — охват считается по числу фраз.',
    'audit.issues': 'Замечания',
    'audit.disclaimer': 'Правила основаны на руководстве продавца Uzum; список стоп-слов приблизительный.',
    'audit.naShort': 'Нет данных',
    'audit.fix': 'Исправить',
    'audit.noIssues': 'Замечаний нет',
    'audit.na.title': 'Нет названия.',
    'audit.na.keywords': 'Ключевые запросы не добавлены.',
    'audit.na.description': 'Описание не добавлено.',
    'audit.na.social': 'Нет данных об отзывах.',
    'audit.na.health': 'Нет данных о состоянии товара.',
    'audit.naNote': 'Раздел не входит в общую оценку.',
    'section.title': 'Название',
    'section.keywords': 'Ключевые запросы',
    'section.description': 'Описание',
    'section.social': 'Отзывы',
    'section.health': 'Состояние',

    'issue.title.missing': 'Название не заполнено',
    'issue.title.short': 'Короткое название: {len} симв. (рекомендуется от {min})',
    'issue.title.long': 'Длинное название: {len} симв. (рекомендуется до {max})',
    'issue.title.fewWords': 'В названии меньше {min} слов',
    'issue.title.stopWord': 'Нежелательные слова в названии: {words}',
    'issue.title.caps': 'Много слов ЗАГЛАВНЫМИ буквами',
    'issue.title.emojiOrLink': 'В названии эмодзи или ссылка',
    'issue.title.noCategory': 'В названии нет типа товара ({category})',
    'issue.title.missingLang': 'Нет названия на этом языке',
    'issue.kw.none': 'Ключевые запросы не добавлены',
    'issue.kw.topMissingInTitle': 'Главного запроса «{text}» нет в названии',
    'issue.kw.lowTitleCoverage': 'В названии только {pct}% запросов',
    'issue.kw.missed': 'Фраз нет ни в названии, ни в описании: {count}',
    'issue.desc.notLoaded': 'Описание не добавлено — вставьте его во вкладке «Текст»',
    'issue.desc.short': 'Короткое описание: {len} симв. (рекомендуется от {min})',
    'issue.desc.long': 'Очень длинное описание: {len} симв. (до {max})',
    'issue.desc.noStructure': 'В описании нет списков и абзацев',
    'issue.desc.contact': 'В описании телефон или ссылка — Uzum это запрещает',
    'issue.desc.stopWord': 'Нежелательные слова в описании: {words}',
    'issue.desc.missingLang': 'Нет описания на этом языке',
    'issue.social.noReviews': 'Отзывов пока нет',
    'issue.social.lowRating': 'Низкий рейтинг: {rating}',
    'issue.social.fewReviews': 'Мало отзывов: {count}',
    'issue.social.unanswered': 'Без ответа: {count} отзывов',
    'issue.health.blocked': 'Товар заблокирован',
    'issue.health.returns': 'Возвраты: {pct}%',
    'issue.health.noImage': 'Нет фото',

    'rev.empty': 'Отзывов нет',
    'rev.emptyHint': 'На этот товар ещё не оставили отзывов',
    'rev.aiHint': 'Что хвалят и на что жалуются покупатели, попадает в запрос AI — новое описание ответит на их вопросы.',
    'rev.title': 'Рейтинг',
    'rev.subtitle': 'Распределение оценок и ответы',
    'rev.countN': 'Отзывов: {n}',
    'rev.answered': 'С ответом',
    'rev.answeredOf': '{n} из {total}',
    'rev.unanswered': 'Без ответа',
    'rev.reply': 'Ответить на отзывы',
    'rev.pros': 'Хвалят',
    'rev.prosEmpty': 'В отзывах не найден блок «Достоинства»',
    'rev.cons': 'Жалуются',
    'rev.consEmpty': 'Жалоб не найдено',
    'rev.recent': 'Последние отзывы',
    'rev.recentEmpty': 'Нет отзывов с текстом',
    'rev.noText': 'Отзыв без текста',

    'ai.title': 'Бесплатный AI-помощник',
    'ai.subtitle': 'Платный AI не нужен: вставьте запрос в бесплатный чат-бот и верните ответ сюда',
    'ai.step1.title': 'Скопируйте запрос',
    'ai.step1.body': 'Название, описание, варианты, ключевые запросы и отзывы собраны в один готовый запрос',
    'ai.step2.title': 'Вставьте в бесплатный чат-бот',
    'ai.step2.body': 'ChatGPT, Gemini или Claude.ai — достаточно бесплатного аккаунта',
    'ai.step3.title': 'Вставьте ответ сюда',
    'ai.step3.body': 'Мы проверим его, посчитаем оценку и сохраним как черновик',
    'ai.thin':
      'Мало данных: описание не заполнено, AI напишет только по названию и вариантам. Для лучшего результата сначала вставьте описание из кабинета Uzum во вкладке «Текст».',
    'ai.langs': 'На каком языке писать',
    'ai.lang.both': 'RU + UZ',
    'ai.lang.ru': 'Только RU',
    'ai.lang.uz': 'Только UZ',
    'ai.show': 'Показать запрос',
    'ai.hide': 'Скрыть запрос',
    'ai.copy': 'Скопировать запрос',
    'ai.copied': 'Запрос скопирован',
    'ai.copiedBody': 'Откройте чат-бот и вставьте (Ctrl+V)',
    'ai.copyErr': 'Не удалось скопировать',
    'ai.copyErrBody': 'Запрос открыт и выделен — скопируйте его (Ctrl+C)',
    'ai.promptLabel': 'Запрос для чат-бота',
    'ai.promptChars': '{n} симв.',
    'ai.open': 'Открыть чат-бот',
    'ai.privacy': 'В запросе только текст о товаре — цены, прибыль и данные компании не передаются.',
    'ai.answer': 'Вставьте ответ сюда',
    'ai.answerHint': 'Скопируйте ответ чат-бота целиком — лишние пояснения отбросятся автоматически',
    'ai.clear': 'Очистить',
    'ai.answerPlaceholder': '{ "ru": { "title": "…", "description_html": "…", "usp": ["…"] }, "uz": { … } }',
    'ai.parseErr': 'Не удалось прочитать ответ',
    'ai.parseErrHint':
      'В ответе нет JSON или он неполный. Скопируйте ответ целиком или попросите чат-бот: «Ответь только JSON».',
    'ai.missingLang': 'В ответе нет текста на {lang} — попросите чат-бот дописать этот язык',
    'ai.scoreIf': 'Если внести {lang}',
    'ai.both': 'Если внести оба языка',
    'ai.save': 'Сохранить как черновик',
    'ai.saved': 'Сохранено черновиков: {n}',
    'ai.savedBody': 'Внесите текст в кабинет Uzum и отметьте это во вкладке «Черновики»',
    'ai.saveErr': 'Не удалось сохранить черновик',
    'ai.result': 'Новый текст',
    'ai.newTitle': 'Новое название',
    'ai.noTitle': 'В ответе нет названия — останется текущее',
    'ai.usp': 'Преимущества (УТП)',
    'ai.desc': 'Описание',
    'ai.noDesc': 'В ответе нет описания — останется текущее',
    'ai.warnNumbers': 'Числа, которые AI мог придумать: {list}. Если у товара их нет — удалите.',
    'ai.warnStop': 'Нежелательные слова: {list}',
    'ai.warnLong': 'Название {n} симв. — рекомендуется до {max}',
    'ai.noWarnings': 'Предупреждений нет: новых чисел, стоп-слов и длинного названия не найдено.',
    'ai.remaining': 'Оставшиеся замечания',

    'dr.title': 'Черновики',
    'dr.subtitle': 'В Uzum ничего не записывается автоматически — текст вносите в кабинет сами',
    'dr.steps':
      'Как внести: 1) скопируйте название и описание; 2) отредактируйте карточку в кабинете Uzum и сохраните; 3) нажмите здесь «Внёс в Uzum» — начнётся отслеживание результата.',
    'dr.empty': 'Черновиков нет',
    'dr.emptyHint': 'Подготовьте новый текст во вкладке «AI-помощник» с помощью бесплатного чат-бота',
    'dr.toAi': 'Открыть AI-помощник',
    'dr.status.draft': 'Черновик',
    'dr.status.applied': 'Внесён в Uzum',
    'dr.source.ai_chat': 'AI-чат',
    'dr.source.manual': 'Вручную',
    'dr.score': 'Оценка',
    'dr.appliedAt': 'Внесён: {date}',
    'dr.showDesc': 'Показать описание',
    'dr.hideDesc': 'Скрыть описание',
    'dr.openCabinet': 'Открыть кабинет Uzum',
    'dr.apply': 'Внёс в Uzum',
    'dr.delete': 'Удалить черновик',
    'dr.applyTitle': 'Текст внесён в Uzum?',
    'dr.applyBody':
      'Черновик ({lang}) заменит сохранённый текст карточки, и с этого дня начнётся отслеживание влияния на продажи: сравниваются дни до и после.',
    'dr.applyNote': 'Убедитесь, что вы уже внесли и сохранили текст в карточке в кабинете Uzum — SavdoIQ сам в Uzum не пишет.',
    'dr.applyConfirm': 'Да, внёс',
    'dr.applied': 'Отмечено',
    'dr.appliedBody': 'Результат появится вверху страницы через несколько дней',
    'dr.applyErr': 'Не удалось отметить',
    'dr.deleteTitle': 'Удалить черновик?',
    'dr.deleteBody': 'Черновик будет удалён безвозвратно.',
    'dr.deleteBodyApplied': 'Черновик будет удалён. Сохранённый текст карточки не изменится.',
    'dr.deleted': 'Черновик удалён',
    'dr.delErr': 'Не удалось удалить черновик',
  },
  en: {
    title: 'Card SEO',
    subtitle: 'Title, description and keyword audit, free AI helper',
    back: 'Back to cards',
    notFound: 'Product not found',
    notFoundHint: 'It was removed or does not belong to your company',
    openUzum: 'Open on Uzum',
    noCategory: 'No category',
    blocked: 'Blocked',
    score: 'Card score',
    'score.good': 'Good',
    'score.mid': 'Fair',
    'score.low': 'Weak',
    units: '{n} pcs',
    'sales.revenue': 'Revenue',
    'sales.profit': 'Net profit',
    'sales.units': 'Sold',
    'sales.stock': 'Stock',
    'sales.period': 'last 30 days',
    'sales.noStock': 'Out of stock',
    'impact.title': 'Result after the new text',
    'impact.subtitle': 'Applied on {date}: {n} days before vs {n} days after',
    'impact.pending': 'Applied on {date} — tracking has started, results show from tomorrow',
    'impact.revenue': 'Revenue',
    'impact.units': 'Units',
    'impact.orders': 'Orders',
    'impact.before': '{n} days before',
    'impact.after': '{n} days after',
    'impact.note':
      'This is a rough comparison: promotions, seasonality, price and ads affect the result too. Watch it for a few weeks.',
    'tab.content': 'Text',
    'tab.keywords': 'Keywords',
    'tab.audit': 'Audit',
    'tab.reviews': 'Reviews',
    'tab.ai': 'AI helper',
    'tab.drafts': 'Drafts',
    'lang.ruFull': 'Russian',
    'lang.uzFull': 'Uzbek',
    'copy.ok': 'Copied',
    'copy.err': 'Could not copy',
    'copy.errHint': 'Select the text and copy it manually (Ctrl+C)',
    'copy.title': 'Copy title',
    'copy.titleOk': 'Title copied',
    'copy.desc': 'Copy description',
    'copy.descOk': 'Description copied',
    'copy.descOkBody': 'Paste it into the description field in the Uzum seller cabinet (Ctrl+V)',
    'copy.html': 'HTML code',
    'copy.htmlOk': 'Description HTML copied',
    'level.error': 'Important',
    'level.warn': 'Warning',
    'level.info': 'Tip',

    'content.hint':
      'Copy the title and description from the card in the Uzum seller cabinet and paste them here — the Seller API does not return the description. Fill in both languages: Uzum searches in Russian and Uzbek.',
    'content.source.seller_api': 'From Seller API, title only',
    'content.source.manual': 'Entered manually',
    'content.source.draft': 'Applied from a draft',
    'content.source.none': 'Not filled',
    'content.updated': 'Updated: {date}',
    'content.title': 'Card text',
    'content.subtitle': 'The audit and the AI prompt use this text',
    'content.titleLabel': 'Title ({lang})',
    'content.titleCounter': '{n} / {max} chars',
    'content.titlePlaceholder': 'Card title',
    'content.titleShortHint': 'Short title — {min}+ chars recommended: product type, brand, key feature',
    'content.descLabel': 'Description (HTML allowed)',
    'content.descCounter': '{n} chars · {min}+ recommended',
    'content.descPlaceholder': 'Paste the description from the Uzum seller cabinet',
    'content.liveScore': 'Score (if saved)',
    'content.reset': 'Discard',
    'content.save': 'Save',
    'content.saved': 'Text saved',
    'content.cleared': 'Text removed',
    'content.saveErr': 'Could not save the text',
    'content.clearNote': 'Saving with both fields empty removes the entered text (the Seller API title stays).',
    'content.readOnly': 'View only: only the owner or a manager can edit the text.',
    'content.preview': 'Preview',
    'content.previewHint': 'Allowed tags only: p, br, ul, ol, li, b, i',
    'content.noTitle': 'No title',
    'content.previewEmpty': 'Description is empty',
    'content.unsaved': 'Unsaved changes',

    'kw.title': 'Keywords',
    'kw.subtitle': 'Phrases shoppers search for — they should appear in the title and description',
    'kw.inTitleShort': 'In title: {n}/{total}',
    'kw.inAnyShort': 'In text: {n}/{total}',
    'kw.demandShort': 'Demand covered: {pct}',
    'kw.empty': 'No keywords yet',
    'kw.emptyHint': 'Type phrases manually, import them from the Uzum cabinet or get suggestions',
    'kw.col.text': 'Phrase',
    'kw.col.demand': 'Demand',
    'kw.col.title': 'In title',
    'kw.col.desc': 'In description',
    'kw.col.source': 'Source',
    'kw.col.status': 'Status',
    'kw.delete': 'Delete phrase',
    'kw.demandNone': 'Demand is shown only for imported phrases',
    'kw.source.seller': 'Manual',
    'kw.source.auto': 'Suggested',
    'kw.source.import': 'Import',
    'kw.status.active': 'Active',
    'kw.status.excluded': 'Excluded',
    'kw.matchNote':
      'Matching is approximate: word endings are allowed. Excluded phrases do not affect the score and are left out of the AI prompt.',
    'kw.add.title': 'Add keywords',
    'kw.add.subtitle': '{n} / {max} phrases',
    'kw.mode.manual': 'Manual',
    'kw.mode.import': 'Import a table',
    'kw.mode.suggest': 'Suggestions',
    'kw.manual.label': 'One phrase per line',
    'kw.manual.placeholder': 'электрический чайник\nelektr choynak',
    'kw.manual.count': 'New phrases: {n}',
    'kw.manual.add': 'Add',
    'kw.import.hint':
      'Uzum cabinet → «Буст в ТОП»: copy the phrases together with the «Прогноз показов» column and paste them here. Any table works: each line «phrase<TAB>number» (or separated by ; |). Without a number the demand stays empty.',
    'kw.import.label': 'Table',
    'kw.import.placeholder': 'электрический чайник\t12500\nelektr choynak\t3400',
    'kw.import.parsed': '{n} phrases, {d} with demand',
    'kw.import.more': '{n} more…',
    'kw.import.btn': 'Import',
    'kw.suggest.hint':
      'Candidate phrases from the title, category, variants and reviews (free, computed in code). No demand numbers — pick the ones you need.',
    'kw.suggest.btn': 'Get suggestions',
    'kw.suggest.again': 'Refresh',
    'kw.suggest.all': 'Select all',
    'kw.suggest.clear': 'Clear selection',
    'kw.suggest.none': 'No new suggestions',
    'kw.suggest.addSelected': 'Add selected ({n})',
    'kw.saved': '{n} phrases saved',
    'kw.saveErr': 'Could not save keywords',
    'kw.updErr': 'Could not change the status',
    'kw.deleted': 'Phrase deleted',
    'kw.delErr': 'Could not delete the phrase',
    'kw.suggestErr': 'Could not get suggestions',
    'kw.limit': 'At most {max} phrases per card',
    'kw.noLang': '{lang} text is not filled in',
    'kw.yes': 'Found',
    'kw.no': 'Missing',

    'audit.title': 'Card audit',
    'audit.subtitle': 'An empty description or keyword list scores 0 — fill them in to raise the score',
    'audit.issuesCount': '{n} issues',
    'audit.coverage': 'Keyword coverage',
    'audit.cov.none': 'No active keywords — we cannot tell which phrases the title should contain.',
    'audit.cov.add': 'Add keywords',
    'audit.cov.inTitle': 'In title',
    'audit.cov.inAny': 'In title or description',
    'audit.cov.demand': 'Demand covered',
    'audit.cov.noDemand': 'Demand (impressions) is not imported — coverage counts phrases.',
    'audit.issues': 'Issues',
    'audit.disclaimer': 'Rules follow the Uzum seller guide; the stop-word list is approximate.',
    'audit.naShort': 'No data',
    'audit.fix': 'Fix',
    'audit.noIssues': 'No issues found',
    'audit.na.title': 'No title.',
    'audit.na.keywords': 'No keywords added.',
    'audit.na.description': 'No description added.',
    'audit.na.social': 'No review data.',
    'audit.na.health': 'No product health data.',
    'audit.naNote': 'The section is left out of the total score.',
    'section.title': 'Title',
    'section.keywords': 'Keywords',
    'section.description': 'Description',
    'section.social': 'Reviews',
    'section.health': 'Health',

    'issue.title.missing': 'Title is missing',
    'issue.title.short': 'Short title: {len} chars ({min}+ recommended)',
    'issue.title.long': 'Long title: {len} chars (up to {max} recommended)',
    'issue.title.fewWords': 'Title has fewer than {min} words',
    'issue.title.stopWord': 'Discouraged words in the title: {words}',
    'issue.title.caps': 'Too many words in CAPITALS',
    'issue.title.emojiOrLink': 'Title contains an emoji or a link',
    'issue.title.noCategory': 'Title does not name the product type ({category})',
    'issue.title.missingLang': 'No title in this language',
    'issue.kw.none': 'No keywords added',
    'issue.kw.topMissingInTitle': 'The top phrase «{text}» is not in the title',
    'issue.kw.lowTitleCoverage': 'Only {pct}% of keywords are in the title',
    'issue.kw.missed': '{count} phrases are in neither the title nor the description',
    'issue.desc.notLoaded': 'Description not added — paste it in the Text tab',
    'issue.desc.short': 'Short description: {len} chars ({min}+ recommended)',
    'issue.desc.long': 'Very long description: {len} chars (up to {max})',
    'issue.desc.noStructure': 'Description has no lists or paragraphs',
    'issue.desc.contact': 'Description contains a phone number or link — Uzum forbids this',
    'issue.desc.stopWord': 'Discouraged words in the description: {words}',
    'issue.desc.missingLang': 'No description in this language',
    'issue.social.noReviews': 'No reviews yet',
    'issue.social.lowRating': 'Low rating: {rating}',
    'issue.social.fewReviews': 'Few reviews: {count}',
    'issue.social.unanswered': '{count} reviews without a reply',
    'issue.health.blocked': 'Product is blocked',
    'issue.health.returns': 'Returns: {pct}%',
    'issue.health.noImage': 'No photo',

    'rev.empty': 'No reviews',
    'rev.emptyHint': 'Nobody has reviewed this product yet',
    'rev.aiHint': 'What shoppers praise and complain about goes into the AI prompt — the new description answers their questions.',
    'rev.title': 'Rating',
    'rev.subtitle': 'Rating distribution and replies',
    'rev.countN': '{n} reviews',
    'rev.answered': 'Answered',
    'rev.answeredOf': '{n} of {total}',
    'rev.unanswered': 'Unanswered',
    'rev.reply': 'Reply to reviews',
    'rev.pros': 'Praised',
    'rev.prosEmpty': 'No «Pros» sections found in reviews',
    'rev.cons': 'Complaints',
    'rev.consEmpty': 'No complaints found',
    'rev.recent': 'Latest reviews',
    'rev.recentEmpty': 'No reviews with text',
    'rev.noText': 'Review without text',

    'ai.title': 'Free AI helper',
    'ai.subtitle': 'No paid AI needed: paste the prompt into a free chatbot and bring the answer back here',
    'ai.step1.title': 'Copy the prompt',
    'ai.step1.body': 'Title, description, variants, keywords and reviews are combined into one ready prompt',
    'ai.step2.title': 'Paste it into a free chatbot',
    'ai.step2.body': 'ChatGPT, Gemini or Claude.ai — a free account is enough',
    'ai.step3.title': 'Paste the answer here',
    'ai.step3.body': 'We check it, score it and save it as a draft',
    'ai.thin':
      'Little data: no description yet, so the AI will write from the title and variants only. For a better result, paste the description from the Uzum cabinet in the Text tab first.',
    'ai.langs': 'Language to write in',
    'ai.lang.both': 'RU + UZ',
    'ai.lang.ru': 'RU only',
    'ai.lang.uz': 'UZ only',
    'ai.show': 'Show prompt',
    'ai.hide': 'Hide prompt',
    'ai.copy': 'Copy prompt',
    'ai.copied': 'Prompt copied',
    'ai.copiedBody': 'Now open the chatbot and paste it (Ctrl+V)',
    'ai.copyErr': 'Could not copy',
    'ai.copyErrBody': 'The prompt is shown and selected — copy it with Ctrl+C',
    'ai.promptLabel': 'Chatbot prompt',
    'ai.promptChars': '{n} chars',
    'ai.open': 'Open a chatbot',
    'ai.privacy': 'The prompt contains only product text — prices, profit and company data are not sent.',
    'ai.answer': 'Paste the answer here',
    'ai.answerHint': 'Copy the whole chatbot answer — extra comments are dropped automatically',
    'ai.clear': 'Clear',
    'ai.answerPlaceholder': '{ "ru": { "title": "…", "description_html": "…", "usp": ["…"] }, "uz": { … } }',
    'ai.parseErr': 'Could not read the answer',
    'ai.parseErrHint':
      'No JSON found or it is incomplete. Copy the whole answer, or ask the chatbot: «Ответь только JSON» (answer with JSON only).',
    'ai.missingLang': 'The answer has no {lang} text — ask the chatbot to add that language',
    'ai.scoreIf': 'If {lang} is applied',
    'ai.both': 'If both languages are applied',
    'ai.save': 'Save as draft',
    'ai.saved': '{n} drafts saved',
    'ai.savedBody': 'Put the text into the Uzum cabinet and mark it in the Drafts tab',
    'ai.saveErr': 'Could not save the draft',
    'ai.result': 'New text',
    'ai.newTitle': 'New title',
    'ai.noTitle': 'No title in the answer — the current one stays',
    'ai.usp': 'Selling points (USP)',
    'ai.desc': 'Description',
    'ai.noDesc': 'No description in the answer — the current one stays',
    'ai.warnNumbers': 'Numbers the AI may have made up: {list}. Remove them if the product does not have them.',
    'ai.warnStop': 'Discouraged words: {list}',
    'ai.warnLong': 'Title is {n} chars — up to {max} recommended',
    'ai.noWarnings': 'No warnings: no new numbers, stop words or overlong title.',
    'ai.remaining': 'Remaining issues',

    'dr.title': 'Drafts',
    'dr.subtitle': 'Nothing is written to Uzum automatically — you put the text into the cabinet yourself',
    'dr.steps':
      'How to apply: 1) copy the title and description; 2) edit the card in the Uzum cabinet and save it; 3) click «I put it on Uzum» here — result tracking starts.',
    'dr.empty': 'No drafts',
    'dr.emptyHint': 'Prepare a new text in the AI helper tab with a free chatbot',
    'dr.toAi': 'Open AI helper',
    'dr.status.draft': 'Draft',
    'dr.status.applied': 'On Uzum',
    'dr.source.ai_chat': 'AI chat',
    'dr.source.manual': 'Manual',
    'dr.score': 'Score',
    'dr.appliedAt': 'Applied: {date}',
    'dr.showDesc': 'Show description',
    'dr.hideDesc': 'Hide description',
    'dr.openCabinet': 'Open Uzum cabinet',
    'dr.apply': 'I put it on Uzum',
    'dr.delete': 'Delete draft',
    'dr.applyTitle': 'Is the text on Uzum now?',
    'dr.applyBody':
      'This draft ({lang}) replaces the stored card text, and from today its effect on sales is tracked: days before and after are compared.',
    'dr.applyNote': 'Make sure you have already put and saved the text in the card in the Uzum cabinet — SavdoIQ does not write to Uzum itself.',
    'dr.applyConfirm': 'Yes, done',
    'dr.applied': 'Marked',
    'dr.appliedBody': 'The result appears at the top of the page in a few days',
    'dr.applyErr': 'Could not mark it',
    'dr.deleteTitle': 'Delete the draft?',
    'dr.deleteBody': 'The draft will be deleted permanently.',
    'dr.deleteBodyApplied': 'The draft will be deleted. The stored card text does not change.',
    'dr.deleted': 'Draft deleted',
    'dr.delErr': 'Could not delete the draft',
  },
});

const TABS: CardTab[] = ['content', 'keywords', 'audit', 'reviews', 'ai', 'drafts'];
const isTab = (v: string | null): v is CardTab => v !== null && (TABS as string[]).includes(v);

export default function CardDetail() {
  const t = useT('cardDetail');
  const { id = '' } = useParams<{ id: string }>();
  const access = useFeature('card_seo');

  return (
    <>
      <BackLink label={t('back')} />
      {/* Tarifda yo'q bo'lsa so'rov ham yuborilmaydi — PlanGate ichidagi qism chizilmaydi */}
      {access === 'off' ? <PageHeader title={t('title')} description={t('subtitle')} /> : null}
      <PlanGate feature="card_seo">
        <CardDetailBody key={id} id={id} />
      </PlanGate>
    </>
  );
}

function CardDetailBody({ id }: { id: string }) {
  const t = useT('cardDetail');
  const canEdit = useCanEditCards();
  const [params, setParams] = useSearchParams();
  const [edits, setEdits] = useState<ContentEdits>({});
  /** Ochilgandagi standart bo'lim — ma'lumot o'zgarsa ham almashmaydi */
  const initialTab = useRef<CardTab | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['card', id],
    queryFn: () => api.get<CardDetailResponse>(`/cards/${id}`),
    enabled: Boolean(id),
    // Topilmadi va tarif xatolarida qayta urinish ma'nosiz
    retry: (count, err) => !(err instanceof ApiError && [402, 403, 404].includes(err.status)) && count < 1,
  });

  const texts = useMemo(() => textsFromContents(data?.contents ?? []), [data]);
  const audit = useMemo(() => (data ? auditFor(data, texts) : null), [data, texts]);

  if (isLoading) return <DetailSkeleton />;

  if (isError || !data || !audit) {
    const notFound = !id || (error instanceof ApiError && error.status === 404) || (!isError && !data);
    return (
      <Card>
        {notFound ? (
          <EmptyState
            icon={<PackageSearch className="h-6 w-6" />}
            title={t('notFound')}
            hint={t('notFoundHint')}
            action={
              <Link to="/cards">
                <Button variant="outline">{t('back')}</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        )}
      </Card>
    );
  }

  /*
   * Tavsif hali joylanmagan bo'lsa birinchi qadam — "Matn", aks holda audit.
   * Faqat sahifa ochilganda tanlanadi: ilgari birinchi tavsif saqlanishi bilan
   * sahifa "Audit" ga sakrab, ikkinchi tilni kiritayotgan sotuvchini chalg'itardi.
   */
  const tabParam = params.get('tab');
  if (initialTab.current === null) {
    initialTab.current = CARD_LANGS.some((l) => texts.descriptions[l]) ? 'audit' : 'content';
  }
  const tab: CardTab = isTab(tabParam) ? tabParam : initialTab.current;
  const setTab = (next: CardTab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );

  const onEdit = (lang: CardLang, value: { title: string; descriptionHtml: string } | null) =>
    setEdits((prev) => {
      const next = { ...prev };
      if (value) next[lang] = value;
      else delete next[lang];
      return next;
    });

  const activeKw = data.keywords.filter((k) => k.status === 'active').length;
  const hasEdits = Object.keys(edits).length > 0;
  const pendingDrafts = data.drafts.filter((d) => d.status === 'draft').length;

  return (
    <div className="space-y-5">
      <CardHero detail={data} score={audit.score} />
      {data.impact ? <ImpactCard impact={data.impact} /> : null}

      <Segmented<CardTab>
        value={tab}
        onChange={setTab}
        options={TABS.map((x) => ({
          value: x,
          label:
            x === 'content' && hasEdits ? (
              <span className="inline-flex items-center gap-1.5">
                {t('tab.content')}
                <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label={t('content.unsaved')} />
              </span>
            ) : (
              t(`tab.${x}`)
            ),
          count: x === 'keywords' ? activeKw : x === 'drafts' && pendingDrafts > 0 ? pendingDrafts : undefined,
        }))}
      />

      {tab === 'content' ? (
        <ContentTab detail={data} texts={texts} audit={audit} canEdit={canEdit} edits={edits} onEdit={onEdit} />
      ) : null}
      {tab === 'keywords' ? <KeywordsTab detail={data} texts={texts} audit={audit} canEdit={canEdit} /> : null}
      {tab === 'audit' ? <AuditTab audit={audit} onGo={setTab} /> : null}
      {tab === 'reviews' ? <ReviewsTab reviews={data.reviews} /> : null}
      {tab === 'ai' ? (
        <AiTab detail={data} texts={texts} audit={audit} canEdit={canEdit} onSaved={() => setTab('drafts')} />
      ) : null}
      {tab === 'drafts' ? <DraftsTab detail={data} canEdit={canEdit} onOpenAi={() => setTab('ai')} /> : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Skeleton className="h-20 w-20 rounded-2xl sm:h-24 sm:w-24" />
          <div className="min-w-0 flex-1 basis-56 space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-full max-w-md" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-[92px] w-[92px] rounded-full" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </Card>
      <Skeleton className="h-10 w-full max-w-2xl rounded-xl" />
      <Card className="p-5">
        <SkeletonRows rows={6} />
      </Card>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/cards"
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-brand-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
