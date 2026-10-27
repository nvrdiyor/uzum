/**
 * "Faqat sizning do‘koningiz" — O'sish bo'limi sahifalaridagi (Kategoriyalarim,
 * Mening radarim) chip va izoh kartochkasi.
 *
 * NEGA AYTILADI. "Kategoriya ulushi", "tezlashmoqda" kabi so'zlar sotuvchida
 * "bozorda" degan taassurot qoldiradi — u Elektronika butun Uzum'da o'sdi deb
 * o'ylab, qaror qilib qo'yishi mumkin. SavdoIQ esa ATAYLAB faqat sotuvchining
 * o'z kaliti beradigan ma'lumot bilan ishlaydi, boshqa saytlarni o'qimaydi
 * (2026-10-24). Shuning uchun har bir raqam "mening savdomda" ekani sarlavha
 * ostida va sahifa oxirida ochiq yoziladi.
 */
import type { ReactNode } from 'react';
import { Info, ShieldCheck } from '@/components/icons';
import { Card } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('growth', {
  uz: {
    'own.chip': 'Faqat sizning do‘koningiz',
    'own.chipHint':
      'Raqamlar faqat sizning katalogingiz, buyurtmalaringiz va qoldiqlaringizdan. Bozor va raqobatchilar ma’lumoti yig‘ilmaydi — SavdoIQ boshqa saytlarni o‘qimaydi.',
    'own.title': 'Faqat sizning do‘koningiz bo‘yicha',
    'own.body':
      'Bu sahifadagi har bir raqam Uzum kalitingiz orqali sinxron qilingan buyurtma, katalog va qoldiqlardan olinadi. Bozordagi ulush, raqobatchilar narxi va boshqa sotuvchilar savdosi yig‘ilmaydi — SavdoIQ boshqa saytlarni o‘qimaydi.',
  },
  ru: {
    'own.chip': 'Только ваш магазин',
    'own.chipHint':
      'Цифры — только из вашего каталога, заказов и остатков. Данные рынка и конкурентов не собираются — SavdoIQ не читает чужие сайты.',
    'own.title': 'Только по вашему магазину',
    'own.body':
      'Каждая цифра на этой странице — из заказов, каталога и остатков, синхронизированных по вашему ключу Uzum. Доля рынка, цены конкурентов и продажи других селлеров не собираются — SavdoIQ не читает чужие сайты.',
  },
  en: {
    'own.chip': 'Your store only',
    'own.chipHint':
      'Numbers come only from your own catalogue, orders and stock. Market and competitor data is not collected — SavdoIQ does not scrape other sites.',
    'own.title': 'Based on your store only',
    'own.body':
      'Every number on this page comes from the orders, catalogue and stock synced with your Uzum key. Market share, competitor prices and other sellers’ sales are not collected — SavdoIQ does not scrape other sites.',
  },
});

/** Sarlavha ostidagi chip (`PageHeader.meta`) — to'liq izohi sichqoncha olib borilganda */
export function OwnDataChip({ className }: { className?: string }) {
  const t = useT('growth');
  return (
    <span className={cn('meta-chip', className)} title={t('own.chipHint')}>
      <ShieldCheck className="h-3.5 w-3.5" />
      {t('own.chip')}
    </span>
  );
}

/**
 * Sahifa oxiridagi izoh: nima uchun bozor ma'lumoti yo'q va raqamlar qanday
 * hisoblangan (`children` — sahifaning o'z ta'riflari, ro'yxat bo'lib).
 */
export function OwnDataNote({ children, className }: { children?: ReactNode; className?: string }) {
  const t = useT('growth');
  return (
    <Card className={cn('flex gap-3 p-5', className)}>
      <span className="icon-tile tone-info h-8 w-8 shrink-0 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
        <Info />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{t('own.title')}</p>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{t('own.body')}</p>
        {children ? <div className="mt-3 max-w-3xl space-y-1.5 text-xs leading-relaxed text-muted">{children}</div> : null}
      </div>
    </Card>
  );
}
