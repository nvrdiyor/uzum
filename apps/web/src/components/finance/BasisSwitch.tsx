import { Info } from '@/components/icons';
import { Segmented } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { useUi, type DateBasis } from '@/store/ui';
import { cn } from '@/lib/utils';

registerNamespace('dateBasis', {
  uz: {
    label: 'Sana asosi',
    order: 'Buyurtma sanasi',
    receipt: 'Qabul sanasi',
    'hint.order':
      'Sotuv buyurtma berilgan kunga yoziladi, yo‘ldagi buyurtmalar ham kiradi. Uzum esa hisobot va to‘lovni xaridor tovarni olgan kun bo‘yicha beradi.',
    'hint.receipt':
      'Uzum hisoboti va to‘lovlari kabi: sotuv xaridor tovarni olgan kunga yoziladi, yo‘ldagi buyurtmalar hali kirmaydi. Xarajatlar — o‘z sanasida.',
  },
  ru: {
    label: 'Учёт по дате',
    order: 'Дата заказа',
    receipt: 'Дата получения',
    'hint.order':
      'Продажа учитывается в день заказа, заказы в пути тоже входят. Uzum же формирует отчёт и выплаты по дню, когда покупатель получил товар.',
    'hint.receipt':
      'Как в отчёте и выплатах Uzum: продажа учитывается в день получения товара покупателем, заказы в пути пока не входят. Расходы — по своей дате.',
  },
  en: {
    label: 'Date basis',
    order: 'Order date',
    receipt: 'Receipt date',
    'hint.order':
      'A sale counts on the day it was ordered, orders in transit included. Uzum reports and pays by the day the buyer received the item.',
    'hint.receipt':
      'As in Uzum’s report and payouts: a sale counts on the day the buyer received the item, orders in transit are not counted yet. Expenses keep their own date.',
  },
});

/**
 * "Buyurtma sanasi / Qabul sanasi" — Moliya va Oylik hisobotdagi pul raqamlari
 * sotuvni qaysi kunga yozadi (server: lib/period.ts `?basis=`, qoidalar
 * services/sale-basis.ts).
 *
 * Nega kerak: saytdagi "oktabr tushumi" Uzum oylik hisobotidan farq qilardi —
 * Uzum pulni va hisobotni xaridor tovarni QABUL QILGAN kun bo'yicha beradi,
 * biz esa buyurtma kunini olardik (yo'ldagi buyurtma ham sanalardi). Standart
 * avvalgidek buyurtma sanasi; tanlov saqlanadi (store/ui.ts 'sq-basis').
 *
 * Izoh tugma yonida ochiq matn, `title` emas: telefonda sichqoncha yo'q va
 * u ko'rinmasdi — sotuvchi ikki raqam nega farq qilishini shu yerda o'qisin
 * (2026-10-27).
 */
export function BasisSwitch({ className }: { className?: string }) {
  const t = useT('dateBasis');
  const basis = useUi((s) => s.basis);
  const setBasis = useUi((s) => s.setBasis);

  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3', className)}>
      <div role="group" aria-label={t('label')} className="flex shrink-0 items-center gap-2">
        <span className="eyebrow hidden sm:inline">{t('label')}</span>
        <Segmented<DateBasis>
          size="sm"
          value={basis}
          onChange={setBasis}
          options={[
            { value: 'order', label: t('order') },
            { value: 'receipt', label: t('receipt') },
          ]}
        />
      </div>
      <p className="flex min-w-0 items-start gap-1.5 text-xs leading-snug text-muted">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t(basis === 'receipt' ? 'hint.receipt' : 'hint.order')}</span>
      </p>
    </div>
  );
}
