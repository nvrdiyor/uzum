import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  NEW_SKU_FREE_DAYS,
  STORAGE_TARIFF,
  matchesSkuQuery,
  type StorageTurnoverResponse,
  type StorageTurnoverRow,
  type StorageTurnoverStatus,
  type StorageTurnoverTier,
} from '@savdoiq/shared';
import { CalendarRange, CircleCheck, Coins, ExternalLink, Gauge, Hourglass, Info, Layers, Warehouse } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { CHART_COLORS, COST_COLORS } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useFeature } from '@/store/session';
import { SkuSearchInput, useSkuQuery } from '@/components/products/SkuSearchInput';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';
import { SectionHeading } from './SectionHeading';
import {
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';

/** Uzum sotuvchi qo'llanmasi — pullik saqlash tariflari bo'limi */
const MANUAL_URL = 'https://seller.uzum.uz/manual/uz/6.product-preparation/#pullik-saqlash-tariflari';

registerNamespace('storageTurnover', {
  uz: {
    title: 'Aylanma va tarif',
    subtitle: 'Uzum 01.06.2026 dan saqlash to‘lovini aylanmaga qarab oladi: 60 kungacha bepul',
    'chip.today': 'Bugungi holat',
    'chip.window': '{from} — {to} bo‘yicha',
    'kpi.free': 'Bepul SKU',
    'kpi.freeHint': 'Aylanma {near} kundan kam · yangi SKU: {n}',
    'kpi.near': 'Tez orada pullik',
    'kpi.nearHint': 'Aylanma {from}–{to} kun: hali bepul, lekin chegaraga yaqin',
    'kpi.paid': 'Pullik SKU',
    'kpi.paidHint': 'Bugungi to‘lov: ~{fee}',
    'kpi.paidHintNoVolume': 'Bugun ~{fee} · {n} tasining hajmi yo‘q',
    'kpi.fee30': '30 kunlik prognoz',
    'kpi.fee30Hint': 'Uzum oxirgi 30 kunda ushlagan: {v}',
    'kpi.fee30HintNone': 'Joriy sotuv sur’atida, yangi yetkazmasiz',
    'meter.title': 'Holat bo‘yicha',
    'meter.subtitle': 'Uzum omborida (FBO) qoldig‘i bor SKU: {n}',
    'meter.excess': 'Pullik SKU’larda ortiqcha qoldiq: {n} dona — sotilsa yoki olib chiqilsa, to‘lov to‘xtaydi',
    'meter.colStatus': 'Holat',
    'meter.colSkus': 'SKU',
    'meter.colShare': 'Ulush',
    'meter.colFee30': '30 kunda',
    'status.free': 'Bepul',
    'status.near': 'Tez orada pullik',
    'status.paid': 'Pullik',
    'status.new_free': 'Yangi — bepul',
    'status.no_volume': 'Hajm yo‘q',
    'compare.forecast': 'Prognoz (aylanma bo‘yicha)',
    'compare.today': 'Bugun',
    'compare.next30': 'Keyingi 30 kun',
    'compare.actual': 'Uzum ushlagan',
    'compare.lastDay': 'Oxirgi kun ({date})',
    'compare.last30': 'Oxirgi 30 kun',
    'compare.none': 'Uzum hali saqlash to‘lovi ushlamagan',
    'compare.hint':
      'Farq bo‘lsa — hajm, toifa yoki bepul davr Uzum hisobidan farq qilyapti: kartochkani tekshiring.',
    'rules.title': 'Uzum qanday hisoblaydi',
    'rules.formula':
      'Aylanma = oxirgi 15 kundagi o‘rtacha kunlik qoldiq ÷ o‘rtacha kunlik sotuv (dona). 15 kunda sotuv bo‘lmasa — eng qimmat guruh.',
    'rules.daily':
      'To‘lov har kuni joriy qoldiqdan olinadi: dona × litr × stavka, bir dona uchun kunlik chegara bilan. Litr yuqoriga yaxlitlanadi.',
    'rules.new': 'Yangi SKU sotuvga chiqqanidan keyin {d} kun bepul (ayrim toifalarda {e} kun).',
    'rules.kind':
      'Imtiyozli tarif — kiyim, poyabzal, aksessuar, tekstil, oshxona buyumlari. Toifa nomidan aniqlanadi: jadvalda qaysi tarif qo‘llangani ko‘rsatilgan.',
    'rules.ours': 'SavdoIQ buni o‘z bazasidagi qoldiq va sotuvdan hisoblaydi — Uzum aylanmani API’da bermaydi.',
    'rules.turnover': 'Aylanma, kun',
    'rules.standard': 'Oddiy',
    'rules.reduced': 'Imtiyozli',
    'rules.cap': 'Chegara, dona/kun',
    'rules.free': 'bepul',
    'rules.unit': 'so‘m / litr / kun',
    'rules.link': 'Uzum qo‘llanmasi: pullik saqlash tariflari',
    'table.title': 'SKU’lar aylanmasi',
    'table.count': 'SKU: {n}',
    'filter.attention': 'Diqqat talab',
    'filter.paid': 'Pullik',
    'filter.near': 'Tez orada',
    'filter.new': 'Yangi',
    'filter.free': 'Bepul',
    'filter.all': 'Hammasi',
    'col.product': 'Mahsulot',
    'col.status': 'Holat',
    'col.turnover': 'Aylanma',
    'col.stock': 'FBO qoldiq',
    'col.rate': 'Litr × stavka',
    'col.feeToday': 'Kuniga',
    'col.fee30d': '30 kunda',
    'col.excess': 'Nima qilish kerak',
    'row.days': '{n} kun',
    'row.noSales': 'Sotuv yo‘q',
    'row.avg': 'o‘rt. {stock} dona · {daily}/kun',
    'row.avgStock': 'o‘rt. {stock} dona',
    'row.partial': 'qoldiq tarixi: {n} kun',
    'row.liters': '{l} l × {r} so‘m',
    'row.litersFree': '{l} l · bepul',
    'row.noVolume': 'Hajm yo‘q',
    'row.kind.standard': 'oddiy tarif',
    'row.kind.reduced': 'imtiyozli tarif',
    'row.perItem': 'dona: {v}',
    'row.unknown': 'noma’lum',
    'row.paidIn': '{n} kundan keyin pullik',
    'row.actual': 'Uzum: {v}',
    'row.excess': '{n} dona sotish yoki olib chiqish kerak',
    'row.freeUntil': '{date} gacha bepul',
    'row.maybeNew': 'Yangi bo‘lsa — bepul',
    'row.maybeNewHint':
      'SKU do‘kon SavdoIQ’ga ulanganida bor edi — Uzumdagi yoshi noma’lum, shuning uchun bepul davr hisobga olinmadi',
    'row.noVolumeHint': 'Kartochkada o‘lcham yo‘q — to‘lovni hisoblab bo‘lmaydi',
    'empty.title': 'Uzum omborida qoldiq yo‘q',
    'empty.hint': 'FBO qoldig‘i bor SKU’lar shu yerda chiqadi',
    'empty.filter': 'Bu bo‘limda SKU yo‘q',
    'empty.filterHint': 'Boshqa bo‘limni tanlang yoki qidiruvni tozalang',
  },
  ru: {
    title: 'Оборачиваемость и тариф',
    subtitle: 'С 01.06.2026 Uzum берёт плату за хранение по оборачиваемости: до 60 дней — бесплатно',
    'chip.today': 'Состояние на сегодня',
    'chip.window': 'по данным {from} — {to}',
    'kpi.free': 'Бесплатные SKU',
    'kpi.freeHint': 'Оборачиваемость меньше {near} дн. · новых SKU: {n}',
    'kpi.near': 'Скоро платные',
    'kpi.nearHint': 'Оборачиваемость {from}–{to} дн.: пока бесплатно, но близко к порогу',
    'kpi.paid': 'Платные SKU',
    'kpi.paidHint': 'Плата сегодня: ~{fee}',
    'kpi.paidHintNoVolume': 'Сегодня ~{fee} · без объёма: {n}',
    'kpi.fee30': 'Прогноз на 30 дней',
    'kpi.fee30Hint': 'Uzum удержал за последние 30 дней: {v}',
    'kpi.fee30HintNone': 'При текущем темпе продаж, без новых поставок',
    'meter.title': 'По статусам',
    'meter.subtitle': 'SKU с остатком на складе Uzum (FBO): {n}',
    'meter.excess': 'Лишний остаток у платных SKU: {n} шт. — продайте или вывезите, и плата прекратится',
    'meter.colStatus': 'Статус',
    'meter.colSkus': 'SKU',
    'meter.colShare': 'Доля',
    'meter.colFee30': 'За 30 дней',
    'status.free': 'Бесплатно',
    'status.near': 'Скоро платно',
    'status.paid': 'Платно',
    'status.new_free': 'Новый — бесплатно',
    'status.no_volume': 'Нет объёма',
    'compare.forecast': 'Прогноз (по оборачиваемости)',
    'compare.today': 'Сегодня',
    'compare.next30': 'Следующие 30 дней',
    'compare.actual': 'Удержал Uzum',
    'compare.lastDay': 'Последний день ({date})',
    'compare.last30': 'Последние 30 дней',
    'compare.none': 'Uzum пока не удерживал плату за хранение',
    'compare.hint':
      'Если есть расхождение — объём, категория или бесплатный период отличаются от расчёта Uzum: проверьте карточку.',
    'rules.title': 'Как считает Uzum',
    'rules.formula':
      'Оборачиваемость = средний дневной остаток за последние 15 дней ÷ средние дневные продажи (шт.). Если продаж за 15 дней не было — самая дорогая группа.',
    'rules.daily':
      'Плата начисляется каждый день на текущий остаток: штуки × литры × ставка, с дневным лимитом на единицу. Литры округляются вверх.',
    'rules.new': 'Новый SKU бесплатен {d} дн. после выхода в продажу (в некоторых категориях — {e} дн.).',
    'rules.kind':
      'Льготный тариф — одежда, обувь, аксессуары, текстиль, товары для кухни. Определяется по названию категории: в таблице видно, какой тариф применён.',
    'rules.ours': 'SavdoIQ считает это по остаткам и продажам из своей базы — Uzum не отдаёт оборачиваемость через API.',
    'rules.turnover': 'Оборачиваемость, дн.',
    'rules.standard': 'Обычный',
    'rules.reduced': 'Льготный',
    'rules.cap': 'Лимит, шт./день',
    'rules.free': 'бесплатно',
    'rules.unit': 'сум / литр / день',
    'rules.link': 'Справка Uzum: тарифы платного хранения',
    'table.title': 'Оборачиваемость по SKU',
    'table.count': 'SKU: {n}',
    'filter.attention': 'Требуют внимания',
    'filter.paid': 'Платные',
    'filter.near': 'Скоро',
    'filter.new': 'Новые',
    'filter.free': 'Бесплатные',
    'filter.all': 'Все',
    'col.product': 'Товар',
    'col.status': 'Статус',
    'col.turnover': 'Оборачиваемость',
    'col.stock': 'Остаток FBO',
    'col.rate': 'Литры × ставка',
    'col.feeToday': 'В день',
    'col.fee30d': 'За 30 дней',
    'col.excess': 'Что сделать',
    'row.days': '{n} дн.',
    'row.noSales': 'Нет продаж',
    'row.avg': 'ср. {stock} шт. · {daily}/день',
    'row.avgStock': 'ср. {stock} шт.',
    'row.partial': 'история остатков: {n} дн.',
    'row.liters': '{l} л × {r} сум',
    'row.litersFree': '{l} л · бесплатно',
    'row.noVolume': 'Нет объёма',
    'row.kind.standard': 'обычный тариф',
    'row.kind.reduced': 'льготный тариф',
    'row.perItem': 'за шт.: {v}',
    'row.unknown': 'неизвестно',
    'row.paidIn': 'платно через {n} дн.',
    'row.actual': 'Uzum: {v}',
    'row.excess': 'Продать или вывезти: {n} шт.',
    'row.freeUntil': 'бесплатно до {date}',
    'row.maybeNew': 'Если новый — бесплатно',
    'row.maybeNewHint':
      'SKU был в каталоге до подключения магазина к SavdoIQ — его возраст в Uzum неизвестен, поэтому бесплатный период не учтён',
    'row.noVolumeHint': 'В карточке нет габаритов — плату посчитать нельзя',
    'empty.title': 'На складе Uzum нет остатков',
    'empty.hint': 'Здесь появятся SKU с остатком FBO',
    'empty.filter': 'В этом разделе нет SKU',
    'empty.filterHint': 'Выберите другой раздел или очистите поиск',
  },
  en: {
    title: 'Turnover and tariff',
    subtitle: 'Since 01.06.2026 Uzum charges storage by turnover: free up to 60 days',
    'chip.today': 'As of today',
    'chip.window': 'based on {from} — {to}',
    'kpi.free': 'Free SKUs',
    'kpi.freeHint': 'Turnover under {near} days · new SKUs: {n}',
    'kpi.near': 'Paid soon',
    'kpi.nearHint': 'Turnover {from}–{to} days: still free but close to the threshold',
    'kpi.paid': 'Paid SKUs',
    'kpi.paidHint': 'Today’s fee: ~{fee}',
    'kpi.paidHintNoVolume': 'Today ~{fee} · no volume: {n}',
    'kpi.fee30': '30-day forecast',
    'kpi.fee30Hint': 'Uzum charged in the last 30 days: {v}',
    'kpi.fee30HintNone': 'At the current sales pace, without new shipments',
    'meter.title': 'By status',
    'meter.subtitle': 'SKUs with stock in Uzum’s warehouse (FBO): {n}',
    'meter.excess': 'Excess stock on paid SKUs: {n} units — sell or withdraw them and the fee stops',
    'meter.colStatus': 'Status',
    'meter.colSkus': 'SKUs',
    'meter.colShare': 'Share',
    'meter.colFee30': 'In 30 days',
    'status.free': 'Free',
    'status.near': 'Paid soon',
    'status.paid': 'Paid',
    'status.new_free': 'New — free',
    'status.no_volume': 'No volume',
    'compare.forecast': 'Forecast (by turnover)',
    'compare.today': 'Today',
    'compare.next30': 'Next 30 days',
    'compare.actual': 'Charged by Uzum',
    'compare.lastDay': 'Last day ({date})',
    'compare.last30': 'Last 30 days',
    'compare.none': 'Uzum has not charged any storage yet',
    'compare.hint':
      'If they differ, the volume, category or free period differs from Uzum’s calculation — check the product card.',
    'rules.title': 'How Uzum calculates it',
    'rules.formula':
      'Turnover = average daily stock over the last 15 days ÷ average daily sales (units). No sales in 15 days means the most expensive group.',
    'rules.daily':
      'The fee is charged every day on the current stock: units × litres × rate, with a daily cap per unit. Litres are rounded up.',
    'rules.new': 'A new SKU is free for {d} days after it goes on sale ({e} days in some categories).',
    'rules.kind':
      'Reduced tariff — clothing, shoes, accessories, textiles, kitchenware. Detected from the category name; the table shows which tariff was applied.',
    'rules.ours': 'SavdoIQ calculates this from its own stock and sales data — Uzum does not expose turnover via the API.',
    'rules.turnover': 'Turnover, days',
    'rules.standard': 'Standard',
    'rules.reduced': 'Reduced',
    'rules.cap': 'Cap, per unit/day',
    'rules.free': 'free',
    'rules.unit': 'UZS / litre / day',
    'rules.link': 'Uzum manual: paid storage tariffs',
    'table.title': 'Turnover by SKU',
    'table.count': 'SKUs: {n}',
    'filter.attention': 'Needs attention',
    'filter.paid': 'Paid',
    'filter.near': 'Soon',
    'filter.new': 'New',
    'filter.free': 'Free',
    'filter.all': 'All',
    'col.product': 'Product',
    'col.status': 'Status',
    'col.turnover': 'Turnover',
    'col.stock': 'FBO stock',
    'col.rate': 'Litres × rate',
    'col.feeToday': 'Per day',
    'col.fee30d': 'In 30 days',
    'col.excess': 'What to do',
    'row.days': '{n} days',
    'row.noSales': 'No sales',
    'row.avg': 'avg {stock} units · {daily}/day',
    'row.avgStock': 'avg {stock} units',
    'row.partial': 'stock history: {n} days',
    'row.liters': '{l} L × {r} UZS',
    'row.litersFree': '{l} L · free',
    'row.noVolume': 'No volume',
    'row.kind.standard': 'standard tariff',
    'row.kind.reduced': 'reduced tariff',
    'row.perItem': 'per unit: {v}',
    'row.unknown': 'unknown',
    'row.paidIn': 'paid in {n} days',
    'row.actual': 'Uzum: {v}',
    'row.excess': 'Sell or withdraw {n} units',
    'row.freeUntil': 'free until {date}',
    'row.maybeNew': 'Free if it is new',
    'row.maybeNewHint':
      'The SKU existed before the store was connected to SavdoIQ — its age on Uzum is unknown, so the free period was not applied',
    'row.noVolumeHint': 'The product card has no dimensions — the fee cannot be calculated',
    'empty.title': 'No stock in Uzum’s warehouse',
    'empty.hint': 'SKUs with FBO stock will appear here',
    'empty.filter': 'No SKUs in this section',
    'empty.filterHint': 'Pick another section or clear the search',
  },
});

/*
 * Holat ranglari — o'lchagich, nishon va jadval bir xil: pullik — saqlash
 * xarajati rangi (COST_COLORS.storage, pushti), tez orada — za'faron
 * (ogohlantirish), yangi — ko'k (ma'lumot), bepul — brend, hajmsiz — kulrang.
 * Qizil ATAYLAB yo'q: u faqat zarar uchun.
 */
const STATUS_ORDER: StorageTurnoverStatus[] = ['paid', 'no_volume', 'near', 'new_free', 'free'];

const STATUS_COLOR: Record<StorageTurnoverStatus, string> = {
  paid: COST_COLORS.storage,
  no_volume: CHART_COLORS.slate,
  near: CHART_COLORS.warn,
  new_free: CHART_COLORS.info,
  free: CHART_COLORS.brand,
};

/** Tailwind faqat to'liq yozilgan klassni yig'adi — shablondan yasalmaydi */
const STATUS_CHIP: Record<StorageTurnoverStatus, string> = {
  paid: 'bg-[rgb(var(--c-pink)/0.12)] text-[rgb(var(--c-pink))]',
  no_volume: 'bg-surface-3 text-muted',
  near: 'bg-warn/10 text-warn-ink',
  new_free: 'bg-info/10 text-info-ink',
  free: 'bg-brand/10 text-brand-ink',
};

type Filter = 'attention' | 'paid' | 'near' | 'new' | 'free' | 'all';

const FILTER_STATUSES: Record<Exclude<Filter, 'all'>, StorageTurnoverStatus[]> = {
  attention: ['paid', 'no_volume', 'near'],
  // Hajmi noma'lum SKU ham aylanma bo'yicha pullik — summasi noma'lum xolos
  paid: ['paid', 'no_volume'],
  near: ['near'],
  new: ['new_free'],
  free: ['free'],
};

/** Aylanma guruhi yorlig'i qo'llanmadagi chegaralardan: ≤60, 61–180, 181–360, 361+ */
const TIER_LABEL: Record<StorageTurnoverTier, string> = (() => {
  const tiers = STORAGE_TARIFF.standard.tiers;
  const ids: StorageTurnoverTier[] = ['free', 'tier1', 'tier2', 'tier3'];
  const out = {} as Record<StorageTurnoverTier, string>;
  tiers.forEach((tier, i) => {
    const prev = i === 0 ? null : (tiers[i - 1]?.upTo ?? 0);
    const id = ids[i] ?? 'tier3';
    out[id] =
      prev === null ? `≤ ${tier.upTo}` : Number.isFinite(tier.upTo) ? `${prev + 1}–${tier.upTo}` : `${prev + 1}+`;
  });
  return out;
})();

function StatusChip({ status, className }: { status: StorageTurnoverStatus; className?: string }) {
  const t = useT('storageTurnover');
  return (
    <span className={cn('chip whitespace-nowrap', STATUS_CHIP[status], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(`status.${status}`)}
    </span>
  );
}

/** Holatlar bo'yicha ulush chizig'i (SKU soni) va izoh ro'yxati (30 kunlik prognoz bilan) */
function StatusMeter({ data }: { data: StorageTurnoverResponse }) {
  const t = useT('storageTurnover');
  const f = useFormat();
  const total = data.totals.skus;
  const parts = STATUS_ORDER.map((s) => ({ status: s, count: data.totals.byStatus[s] })).filter((p) => p.count > 0);
  const title = parts
    .map((p) => `${t(`status.${p.status}`)}: ${f.num(p.count)} · ${f.pct((p.count / Math.max(1, total)) * 100)}`)
    .join('\n');

  return (
    <div className="space-y-4">
      <div
        role="img"
        aria-label={title}
        title={title}
        className="flex h-3.5 w-full gap-px overflow-hidden rounded-full bg-surface-3"
      >
        {parts.map((p) => (
          <div
            key={p.status}
            className="h-full min-w-[3px]"
            style={{ flex: `${p.count} 1 0%`, background: STATUS_COLOR[p.status] }}
          />
        ))}
      </div>
      <div>
        {/* Ustun nomlari: o'ngdagi summa — 30 kunlik prognoz, bugungi to'lov emas */}
        <div className="eyebrow flex items-center gap-2 px-1.5 sm:gap-3 sm:px-2.5">
          <span className="w-2.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t('meter.colStatus')}</span>
          <span className="w-10 shrink-0 text-right">{t('meter.colSkus')}</span>
          <span className="w-12 shrink-0 text-right">{t('meter.colShare')}</span>
          <span className="w-[6.5rem] shrink-0 text-right sm:w-32">{t('meter.colFee30')}</span>
        </div>
        <ul className="mt-1 space-y-1">
          {STATUS_ORDER.map((s) => {
            const count = data.totals.byStatus[s];
            const fee = data.totals.fee30dByStatus[s];
            return (
              <li
                key={s}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-1.5 py-2 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2.5',
                  count === 0 && 'opacity-60',
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{t(`status.${s}`)}</span>
                <span className="tnum w-10 shrink-0 text-right text-sm font-semibold text-ink">{f.num(count)}</span>
                <span className="tnum w-12 shrink-0 text-right text-xs text-muted">
                  {total > 0 ? f.pct((count / total) * 100, 0) : '—'}
                </span>
                <span className="tnum w-[6.5rem] shrink-0 whitespace-nowrap text-right text-sm font-semibold text-ink sm:w-32">
                  {fee > 0 ? f.money(fee) : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Prognoz (aylanma bo'yicha) va Uzum haqiqatda ushlagan summa — yonma-yon */
function ComparePanel({ data }: { data: StorageTurnoverResponse }) {
  const t = useT('storageTurnover');
  const f = useFormat();
  const { totals } = data;
  const line = (label: string, value: string, strong?: boolean) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('tnum whitespace-nowrap text-sm', strong ? 'font-semibold text-ink' : 'text-ink-soft')}>{value}</dd>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="well space-y-2 p-4">
          <p className="eyebrow">{t('compare.forecast')}</p>
          <dl className="space-y-1.5">
            {line(t('compare.today'), f.money(totals.feeToday))}
            {line(t('compare.next30'), f.money(totals.fee30d), true)}
          </dl>
        </div>
        <div className="well space-y-2 p-4">
          <p className="eyebrow">{t('compare.actual')}</p>
          {totals.actualLastDate ? (
            <dl className="space-y-1.5">
              {line(t('compare.lastDay', { date: f.dateShort(totals.actualLastDate) }), f.money(totals.actualLastDay))}
              {line(t('compare.last30'), f.money(totals.actual30d), true)}
            </dl>
          ) : (
            <p className="text-sm text-muted">{t('compare.none')}</p>
          )}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t('compare.hint')}</p>
    </div>
  );
}

/** Qo'llanma qoidalari va tariflar jadvali — raqamlar tariffs.ts dan, qo'lda yozilmagan */
function RulesCard() {
  const t = useT('storageTurnover');
  const f = useFormat();
  const tiers = STORAGE_TARIFF.standard.tiers;
  const ids: StorageTurnoverTier[] = ['free', 'tier1', 'tier2', 'tier3'];
  const rate = (v: number | undefined) => (v ? f.num(v) : t('rules.free'));
  return (
    <Card>
      <CardHeader title={t('rules.title')} icon={<Info className="h-4 w-4" />} tone="info" />
      <CardBody className="space-y-3 text-sm leading-relaxed text-muted">
        <p className="text-ink-soft">{t('rules.formula')}</p>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 text-xs text-muted">
                <th className="px-3 py-2 text-left font-semibold">{t('rules.turnover')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('rules.standard')}</th>
                <th className="px-3 py-2 text-right font-semibold">{t('rules.reduced')}</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {tiers.map((tier, i) => (
                <tr key={ids[i]} className="border-t border-line/70">
                  <td className="px-3 py-1.5 text-ink-soft">{TIER_LABEL[ids[i] ?? 'tier3']}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{rate(tier.rate)}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{rate(STORAGE_TARIFF.reduced.tiers[i]?.rate)}</td>
                </tr>
              ))}
              <tr className="border-t border-line/70 bg-surface-2/50">
                <td className="px-3 py-1.5 text-ink-soft">{t('rules.cap')}</td>
                <td className="px-3 py-1.5 text-right text-ink">{f.num(STORAGE_TARIFF.standard.capPerItemDay)}</td>
                <td className="px-3 py-1.5 text-right text-ink">{f.num(STORAGE_TARIFF.reduced.capPerItemDay)}</td>
              </tr>
            </tbody>
          </table>
          <p className="border-t border-line/70 px-3 py-1.5 text-right text-2xs text-muted">{t('rules.unit')}</p>
        </div>
        <p>{t('rules.daily')}</p>
        <p>{t('rules.new', { d: NEW_SKU_FREE_DAYS.default, e: NEW_SKU_FREE_DAYS.extended })}</p>
        <p>{t('rules.kind')}</p>
        <p className="text-xs">{t('rules.ours')}</p>
        <a
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"
          href={MANUAL_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('rules.link')}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardBody>
    </Card>
  );
}

/**
 * "Aylanma va tarif" — Pullik saqlash sahifasining bugungi holat bo'limi
 * (GET /warehouse/storage/turnover). Davr filtriga BOG'LIQ EMAS: Uzum to'lovni
 * har kuni tugagan 15 kunlik aylanmadan hisoblaydi, shuning uchun bo'lim
 * faqat do'kon filtrini oladi. Sahifadagi haqiqiy to'lovlar bo'limi esa
 * tanlangan davr bo'yicha qoladi (2026-10-24).
 */
export function TurnoverSection({ storeId }: { storeId?: string }) {
  const t = useT('storageTurnover');
  const f = useFormat();
  const access = useFeature('paid_storage');
  const [filter, setFilter] = useState<Filter>('attention');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse-storage-turnover', storeId ?? 'all'],
    queryFn: () => api.get<StorageTurnoverResponse>('/warehouse/storage/turnover', { storeId }),
    // Ko'rish rejimida so'rov 402 qaytaradi — umuman yuborilmaydi
    enabled: access === 'full',
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const by = totals?.byStatus;

  /*
   * Qidiruv shu yerda (yuklangan qatorlar ichida), lekin serverdagi BILAN BIR
   * XIL qoida (shared search.ts): nom, SKU kodi, shtrix-kod, Uzum SKU /
   * mahsulot ID'si yoki uzum.uz havolasi — qator kalitlari serverdan keladi.
   * Ilgari `${sku} ${title}`.toLowerCase() edi (2026-10-24). KPI kartochkalari
   * avvalgidek qidiruvga bog'liq emas (server jamlari butun ro'yxat bo'yicha).
   * Mahsulot nomi ham — server skuInfoMatches bilan AYNAN bir xil maydonlar:
   * u yo'qligida variant nomli («ЧЕРН») SKU mahsulot nomi bo'yicha jadvalda
   * topilmasdi, `?search=` bilan esa topilardi (2026-10-27).
   */
  const query = useSkuQuery(search);
  const visible = useMemo(() => {
    const allowed = filter === 'all' ? null : new Set(FILTER_STATUSES[filter]);
    return rows.filter(
      (r) =>
        (!allowed || allowed.has(r.status)) &&
        (!query ||
          matchesSkuQuery(
            query,
            { id: r.skuId, sku: r.sku, title: r.title, barcode: r.barcode, uzumSkuId: r.uzumSkuId },
            { id: r.productId, title: r.productTitle, uzumProductId: r.uzumProductId },
          )),
    );
  }, [rows, filter, query]);

  const filterOptions: { value: Filter; label: string; count?: number }[] = [
    { value: 'attention', label: t('filter.attention'), count: by ? by.paid + by.no_volume + by.near : undefined },
    { value: 'paid', label: t('filter.paid'), count: by ? by.paid + by.no_volume : undefined },
    { value: 'near', label: t('filter.near'), count: by?.near },
    { value: 'new', label: t('filter.new'), count: by?.new_free },
    { value: 'free', label: t('filter.free'), count: by?.free },
    { value: 'all', label: t('filter.all'), count: totals?.skus },
  ];

  const columns: Column<StorageTurnoverRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        render: (r) => <ProductTitleCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} maxWidth={240} />,
        sortable: true,
        sortValue: (r) => r.title,
      },
      {
        key: 'status',
        header: t('col.status'),
        render: (r) => (
          <div className="space-y-1">
            <StatusChip status={r.status} />
            {r.status === 'new_free' && r.freeUntil ? (
              <p className="tnum text-2xs text-muted">{t('row.freeUntil', { date: f.dateShort(r.freeUntil) })}</p>
            ) : null}
            {/* Yoshi noma'lum, lekin yangi bo'lishi mumkin — to'lov ko'rsatiladi, belgisi qo'yiladi */}
            {!r.ageKnown && r.daysOnSale < r.newSkuFreeDays && r.status !== 'free' && r.status !== 'near' ? (
              <p className="text-2xs text-muted" title={t('row.maybeNewHint')}>
                {t('row.maybeNew')}
              </p>
            ) : null}
          </div>
        ),
        sortable: true,
        sortValue: (r) => STATUS_ORDER.indexOf(r.status),
      },
      {
        key: 'turnover',
        header: t('col.turnover'),
        align: 'right',
        render: (r) => (
          <div>
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-semibold text-ink">
                {r.turnoverDays === null ? t('row.noSales') : t('row.days', { n: f.num(r.turnoverDays) })}
              </span>
              <span className={cn('rounded-md px-1.5 py-0.5 text-2xs font-semibold', STATUS_CHIP[r.status])}>
                {TIER_LABEL[r.tier]}
              </span>
            </div>
            {/* Aylanma qayerdan chiqqani — sotuvchi o'zi tekshira oladi */}
            <p className="text-2xs font-normal text-muted">
              {r.avgDaily > 0
                ? t('row.avg', { stock: f.num(r.avgStock, 1), daily: f.num(r.avgDaily, 2) })
                : t('row.avgStock', { stock: f.num(r.avgStock, 1) })}
            </p>
            {r.stockDays < (data?.rules.windowDays ?? 15) ? (
              <p className="text-2xs font-medium text-warn-ink">{t('row.partial', { n: r.stockDays })}</p>
            ) : null}
          </div>
        ),
        sortable: true,
        sortValue: (r) => r.turnoverDays ?? Number.MAX_SAFE_INTEGER,
      },
      {
        key: 'stock',
        header: t('col.stock'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="text-ink">{f.num(r.stock)}</span>,
        sortable: true,
        sortValue: (r) => r.stock,
      },
      {
        key: 'rate',
        header: t('col.rate'),
        align: 'right',
        hideBelow: 'xl',
        render: (r) => (
          <div title={r.category ?? undefined}>
            {r.liters > 0 ? (
              <span className="text-ink-soft">
                {r.rate > 0
                  ? t('row.liters', { l: f.num(r.liters), r: f.num(r.rate) })
                  : t('row.litersFree', { l: f.num(r.liters) })}
              </span>
            ) : (
              <span className="font-medium text-warn-ink" title={t('row.noVolumeHint')}>
                {t('row.noVolume')}
              </span>
            )}
            <p className="text-2xs text-muted">{t(`row.kind.${r.tariffKind}`)}</p>
          </div>
        ),
        sortable: true,
        sortValue: (r) => r.liters * r.rate,
      },
      {
        key: 'feeToday',
        header: t('col.feeToday'),
        align: 'right',
        render: (r) =>
          r.feeToday === null ? (
            <span className="text-xs text-muted" title={t('row.noVolumeHint')}>
              {t('row.unknown')}
            </span>
          ) : (
            <div>
              <span className={cn(r.feeToday > 0 ? 'font-semibold text-ink' : 'text-muted')}>
                {r.feeToday > 0 ? f.money(r.feeToday) : '—'}
              </span>
              {r.feeToday > 0 && r.perItemDay !== null ? (
                <p className="text-2xs text-muted">{t('row.perItem', { v: f.money(r.perItemDay) })}</p>
              ) : null}
            </div>
          ),
        sortable: true,
        sortValue: (r) => r.feeToday ?? -1,
      },
      {
        key: 'fee30d',
        header: t('col.fee30d'),
        align: 'right',
        render: (r) => (
          <div>
            {r.fee30d === null ? (
              <span className="text-xs text-muted">{t('row.unknown')}</span>
            ) : (
              <span className={cn(r.fee30d > 0 ? 'font-semibold text-ink' : 'text-muted')}>
                {r.fee30d > 0 ? f.money(r.fee30d) : '—'}
              </span>
            )}
            {r.paidFromDay !== null && r.paidFromDay > 0 ? (
              <p className="text-2xs font-medium text-warn-ink">{t('row.paidIn', { n: r.paidFromDay })}</p>
            ) : null}
            {/* Uzum shu SKU uchun haqiqatda ushlagani — prognoz bilan yonma-yon */}
            {r.actual30d > 0 ? (
              <p className="text-2xs text-muted">{t('row.actual', { v: f.compact(r.actual30d) })}</p>
            ) : null}
          </div>
        ),
        sortable: true,
        sortValue: (r) => r.fee30d ?? -1,
      },
      {
        key: 'excess',
        header: t('col.excess'),
        render: (r) =>
          r.excessUnits > 0 && r.status !== 'free' ? (
            <span
              className={cn(
                'inline-block max-w-[13rem] text-xs font-medium leading-snug',
                r.status === 'paid' || r.status === 'no_volume' ? 'text-ink' : 'text-muted',
              )}
            >
              {t('row.excess', { n: f.num(r.excessUnits) })}
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
        sortable: true,
        sortValue: (r) => r.excessUnits,
      },
    ],
    [t, f, data?.rules.windowDays],
  );

  const chips = data ? (
    <>
      <span className="meta-chip">
        <Gauge className="h-3.5 w-3.5" />
        {t('chip.today')}
      </span>
      <span className="meta-chip tnum">
        <CalendarRange className="h-3.5 w-3.5" />
        {t('chip.window', { from: f.dateShort(data.window.from), to: f.dateShort(data.window.to) })}
      </span>
    </>
  ) : null;

  const noVolume = by?.no_volume ?? 0;
  const paidCount = (by?.paid ?? 0) + noVolume;

  return (
    <section className="space-y-4" aria-labelledby="storage-turnover-title">
      <SectionHeading
        id="storage-turnover-title"
        tone="pink"
        icon={<Gauge />}
        title={t('title')}
        subtitle={t('subtitle')}
        meta={chips}
      />

      {isError ? (
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
        </Card>
      ) : (
        <>
          <StatGrid>
            <StatCard
              label={t('kpi.free')}
              value={f.num((by?.free ?? 0) + (by?.new_free ?? 0))}
              hint={t('kpi.freeHint', { near: data?.rules.nearFromDays ?? 45, n: f.num(by?.new_free ?? 0) })}
              icon={<CircleCheck className="h-5 w-5" />}
              tone="brand"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.near')}
              value={f.num(by?.near ?? 0)}
              hint={t('kpi.nearHint', {
                from: data?.rules.nearFromDays ?? 45,
                to: data?.rules.freeTurnoverDays ?? 60,
              })}
              icon={<Hourglass className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.paid')}
              value={f.num(paidCount)}
              hint={
                noVolume > 0
                  ? t('kpi.paidHintNoVolume', { fee: f.money(totals?.feeToday ?? 0), n: f.num(noVolume) })
                  : t('kpi.paidHint', { fee: f.money(totals?.feeToday ?? 0) })
              }
              icon={<Warehouse className="h-5 w-5" />}
              tone="pink"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.fee30')}
              value={f.money(totals?.fee30d ?? 0)}
              hint={
                totals && totals.actual30d > 0
                  ? t('kpi.fee30Hint', { v: f.money(totals.actual30d) })
                  : t('kpi.fee30HintNone')
              }
              icon={<Coins className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
          </StatGrid>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader
                icon={<Layers className="h-4 w-4" />}
                title={t('meter.title')}
                subtitle={t('meter.subtitle', { n: f.num(totals?.skus ?? 0) })}
              />
              <CardBody className="space-y-5">
                {isLoading || !data ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : (
                  <>
                    <StatusMeter data={data} />
                    {data.totals.excessUnits > 0 ? (
                      <p className="rounded-xl bg-[rgb(var(--c-pink)/0.08)] px-3 py-2 text-sm text-ink-soft">
                        {t('meter.excess', { n: f.num(data.totals.excessUnits) })}
                      </p>
                    ) : null}
                    <ComparePanel data={data} />
                  </>
                )}
              </CardBody>
            </Card>
            <div className="lg:col-span-2">
              <RulesCard />
            </div>
          </div>

          <Card>
            <CardHeader
              icon={<Gauge className="h-4 w-4" />}
              title={t('table.title')}
              actions={<span className="meta-chip tnum">{t('table.count', { n: f.num(visible.length) })}</span>}
            />
            <div className="mt-4 flex flex-col gap-3 border-y border-line bg-surface-2/40 px-5 py-3 md:flex-row md:items-center md:justify-between">
              <div className="no-scrollbar max-w-full overflow-x-auto">
                <Segmented options={filterOptions} value={filter} onChange={setFilter} size="sm" />
              </div>
              <SkuSearchInput value={search} onChange={setSearch} className="w-full md:w-72" />
            </div>
            <DataTable
              columns={columns}
              rows={visible}
              rowKey={(r) => r.skuId}
              loading={isLoading}
              density="compact"
              empty={
                rows.length === 0 ? (
                  <EmptyState icon={<Warehouse className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
                ) : (
                  <EmptyState
                    icon={<CircleCheck className="h-6 w-6" />}
                    title={t('empty.filter')}
                    hint={t('empty.filterHint')}
                  />
                )
              }
            />
          </Card>
        </>
      )}
    </section>
  );
}
