import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CostCoverageResponse } from '@savdoiq/shared';
import { AlertTriangle, CircleCheck } from '@/components/icons';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { useFeature, useSession } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { cn } from '@/lib/utils';
import { useSeesMoney } from '@/lib/view';

registerNamespace('costCoverage', {
  uz: {
    label: 'Tannarx: {pct} sotuvda',
    full: 'Davrda sotilgan {units} donaning hammasida tannarx bor — foyda to‘liq hisoblangan',
    missing: '{units} dona tannarxsiz sotilgan — {revenue} tushum',
    skus: 'Tannarxi yo‘q SKU: {n} ta',
    overEst: 'Foyda taxminan {amount} ortiq ko‘rsatilgan — shu tovarlar tannarxicha',
    over: 'Foyda shu tovarlar tannarxicha oshib ko‘rsatilgan',
    action: 'Bosing — tannarxni kiriting',
  },
  ru: {
    label: 'Себестоимость: {pct} продаж',
    full: 'Себестоимость указана для всех {units} шт., проданных за период, — прибыль посчитана полностью',
    missing: '{units} шт. продано без себестоимости — выручка {revenue}',
    skus: 'SKU без себестоимости: {n}',
    overEst: 'Прибыль завышена примерно на {amount} — на себестоимость этих товаров',
    over: 'Прибыль завышена на себестоимость этих товаров',
    action: 'Нажмите, чтобы указать себестоимость',
  },
  en: {
    label: 'Cost price: {pct} of sales',
    full: 'All {units} units sold in the period have a cost price — profit is fully calculated',
    missing: '{units} units sold without a cost price — {revenue} in revenue',
    skus: 'SKUs without a cost price: {n}',
    overEst: 'Profit is overstated by about {amount} — the cost of these items',
    over: 'Profit is overstated by the cost of these items',
    action: 'Click to enter cost prices',
  },
});

/** Shundan past qamrov — xavfli (qizil), undan yuqori 99% gacha — ogohlantirish */
const DANGER_BELOW = 80;
/** Shundan boshlab chip neytral (belgi bilan) — qolgan bir necha dona foydani deyarli o'zgartirmaydi */
const OK_FROM = 99;

const TONE_CLASS = {
  ok: 'hover:border-line-strong hover:text-ink',
  warn: 'border-warn/40 bg-warn/10 text-warn-ink hover:border-warn/70',
  danger: 'border-danger/40 bg-danger/10 text-danger-ink hover:border-danger/70',
} as const;

/**
 * Tannarx qamrovi chipi ("Tannarx: 87% sotuvda") — sahifa sarlavhasi ostiga
 * (`PageHeader.meta`): Boshqaruv paneli, Moliya, Mahsulot foydasi,
 * Unit-iqtisod va Oylik hisobot.
 *
 * Ilgari foyda raqami yonida u qanchalik ishonchli ekani ko'rinmasdi:
 * tannarxi kiritilmagan SKU sotuvida cogs = 0 va foyda shuncha oshib
 * chiqadi, sotuvchi esa buni faqat mahsulot kartochkasida (hamma SKU'si
 * tannarxsiz bo'lsagina) yoki Tannarx sahifasidagi katalog ulushidan
 * bilardi — davrdagi sotuv bo'yicha emas (2026-10-24).
 *
 * Qamrov — tanlangan davr va do'kondagi SOTILGAN donalar bo'yicha (sahifa
 * raqamlari bilan bir xil davr va filtr). Sotuv bo'lmasa yoki tarifda Tannarx
 * bo'limi ochiq bo'lmasa chip ko'rinmaydi. Bosilganda — Tannarx sahifasi.
 */
export function CostCoverage({ className }: { className?: string }) {
  const t = useT('costCoverage');
  const f = useFormat();
  const q = usePeriodQuery();
  const access = useFeature('cost_price');
  const hasCompany = useSession((s) => Boolean(s.me?.company));
  // Pulsiz ko'rinish shablonida (Marketolog) foyda yo'q — uning ishonchliligi haqidagi chip ham yo'q
  const seesMoney = useSeesMoney();
  const enabled = hasCompany && access === 'full' && seesMoney;

  const { data, isPlaceholderData } = useQuery({
    queryKey: ['cost-coverage', q],
    queryFn: () => api.get<CostCoverageResponse>('/analytics/cost-coverage', q),
    enabled,
    // Davr almashganda chip yo'qolib-chiqib sarlavha qatorini siljitmasin: eski qiymat xira turadi
    placeholderData: (prev) => prev,
  });

  if (!enabled || !data || data.soldUnits <= 0) return null;

  // Pastga yaxlitlanadi: 99,6% "100%" bo'lib ko'rinmasin
  const shown = Math.floor(data.pct);
  const tone = data.pct >= OK_FROM ? 'ok' : data.pct >= DANGER_BELOW ? 'warn' : 'danger';

  const title =
    data.unitsNoCost === 0
      ? t('full', { units: f.num(data.soldUnits) })
      : [
          t('missing', { units: f.num(data.unitsNoCost), revenue: f.money(data.revenueNoCost) }),
          data.skusNoCost > 0 ? t('skus', { n: f.num(data.skusNoCost) }) : null,
          data.estMissingCogs !== null && data.estMissingCogs > 0
            ? t('overEst', { amount: f.money(data.estMissingCogs) })
            : t('over'),
          t('action'),
        ]
          .filter(Boolean)
          .join('\n');

  return (
    <Link
      to="/cost-price"
      title={title}
      className={cn(
        'meta-chip focusable transition-[border-color,color,opacity]',
        TONE_CLASS[tone],
        isPlaceholderData && 'opacity-60',
        className,
      )}
    >
      {tone === 'ok' ? (
        <CircleCheck className="h-3.5 w-3.5 text-brand" />
      ) : (
        <AlertTriangle className={cn('h-3.5 w-3.5', tone === 'warn' ? 'text-warn-ink' : 'text-danger-ink')} />
      )}
      <span className="tnum">{t('label', { pct: f.pct(shown, 0) })}</span>
    </Link>
  );
}
