/**
 * SKU / mahsulot qidiruv maydoni — barcha qidiruvli ro'yxatlarda BIR XIL
 * yozuv va BIR XIL qoida (shared search.ts).
 *
 * Ilgari Mahsulotlar maydonida "ID bo‘yicha" deyilgan, kartochkada "ID:
 * 701009" yozilgan, lekin shu ID hech qayerda topilmasdi; boshqa sahifalar
 * esa "Nomi yoki SKU bo‘yicha" derdi. Endi nom, SKU kodi, shtrix-kod, Uzum
 * mahsulot va SKU ID, uzum.uz havolasi — hammasi ishlaydi va maydon buni
 * aytadi: qisqasi placeholder'da, to'lig'i sichqoncha olib borilganda (2026-10-24).
 */
import { useMemo } from 'react';
import { parseSkuQuery, type SkuQuery } from '@savdoiq/shared';
import { SearchInput } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('skuSearch', {
  uz: {
    placeholder: 'Nom, SKU, shtrix-kod yoki ID',
    hint: 'Mahsulot nomi, SKU kodi, shtrix-kod, Uzum mahsulot yoki SKU ID bo‘yicha qidiring — uzum.uz havolasini ham qo‘yish mumkin',
    hintOrders:
      'Mahsulot nomi, SKU kodi, shtrix-kod, Uzum mahsulot yoki SKU ID, buyurtma raqami bo‘yicha qidiring — uzum.uz havolasini ham qo‘yish mumkin',
  },
  ru: {
    placeholder: 'Название, SKU, штрихкод или ID',
    hint: 'Ищите по названию, коду SKU, штрихкоду, ID товара или SKU в Uzum — можно вставить и ссылку uzum.uz',
    hintOrders:
      'Ищите по названию, коду SKU, штрихкоду, ID товара или SKU в Uzum, номеру заказа — можно вставить и ссылку uzum.uz',
  },
  en: {
    placeholder: 'Name, SKU, barcode or ID',
    hint: 'Search by product name, SKU code, barcode, Uzum product or SKU ID — a uzum.uz link works too',
    hintOrders: 'Search by product name, SKU code, barcode, Uzum product or SKU ID, or order number — a uzum.uz link works too',
  },
});

/**
 * Maydon yozuvlari — o'z maydonini chizadigan sahifalar uchun. `orders` —
 * buyurtma raqami ham qidiriladigan sahifalar (Sotuv tahlili, Qaytarishlar):
 * placeholder ATAYLAB o'sha-o'sha (barcha ro'yxatlarda bir xil yozuv), faqat
 * izohda buyurtma raqami qo'shiladi. Ilgari bu sahifalar "Buyurtma ID yoki
 * SKU", "Mahsulot yoki buyurtma kodi" derdi (2026-10-24).
 */
export function useSkuSearchText(orders = false): { placeholder: string; hint: string } {
  const t = useT('skuSearch');
  return { placeholder: t('placeholder'), hint: t(orders ? 'hintOrders' : 'hint') };
}

/** So'rov bir marta tahlil qilinadi — har qatorda qayta emas */
export function useSkuQuery(search: string): SkuQuery | null {
  return useMemo(() => parseSkuQuery(search), [search]);
}

export function SkuSearchInput({
  value,
  onChange,
  className,
  orders = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Buyurtma raqami ham qidiriladi — izohda aytiladi */
  orders?: boolean;
}) {
  const text = useSkuSearchText(orders);
  return (
    // Izoh o'ramada: SearchInput o'zi `title` qabul qilmaydi
    <div className={cn('min-w-0', className)} title={text.hint}>
      <SearchInput value={value} onChange={onChange} placeholder={text.placeholder} />
    </div>
  );
}
