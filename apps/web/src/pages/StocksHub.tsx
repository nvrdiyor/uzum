import { useSearchParams } from 'react-router-dom';
import { Segmented } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import Stocks from './Stocks';
import SalesStock from './SalesStock';

registerNamespace('stocksHub', {
  uz: { stock: 'Qoldiq', sales: 'Sotuv bilan' },
  ru: { stock: 'Остатки', sales: 'С продажами' },
  en: { stock: 'Stock', sales: 'With sales' },
});

type View = 'stock' | 'sales';

/**
 * QOLDIQLAR — bitta bo'lim, ikki ko'rinish (2026-11-15, egasi: "bir xil
 * ma'lumot ikki joyda bo'lmasin").
 *
 * Ilgari "Ombor qoldiqlari" (/stocks) va "Sotuv va qoldiq" (/sales-stock)
 * ikki alohida sahifa edi: ikkalasida ham har SKU qoldig'i, holati, necha
 * kunga yetishi va holat yorliqlari bor edi — sotuvchi qaysi biriga qarashni
 * bilmasdi. Endi qoldiq — bitta bo'lim; "Sotuv bilan" ko'rinishi o'sha
 * jadvalga davrdagi sotuv, tushum va foydani qo'shadi. Eski /sales-stock
 * havolasi shu yerga (`?view=sales`) olib keladi.
 */
export default function StocksHub() {
  const t = useT('stocksHub');
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'sales' ? 'sales' : 'stock';

  const onChange = (next: View) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'sales') p.set('view', 'sales');
        else p.delete('view');
        return p;
      },
      { replace: true },
    );

  const viewSwitch = (
    <Segmented<View>
      size="sm"
      value={view}
      onChange={onChange}
      options={[
        { value: 'stock', label: t('stock') },
        { value: 'sales', label: t('sales') },
      ]}
    />
  );

  return view === 'sales' ? <SalesStock viewSwitch={viewSwitch} /> : <Stocks viewSwitch={viewSwitch} />;
}
