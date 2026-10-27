/**
 * Radar qatorlari — har signal o'z raqamlari bilan (pages/Radar.tsx).
 *
 * Asosiy raqam — signalning o'zi (tezlik o'zgarishi, kunlik tezlik,
 * qolgan kun, qaytarish o'sishi), ostida u nimadan chiqqani: ikki oyna
 * tezligi, tushum farqi, qoldiq. "Signal ortidagi raqamlar" ko'rinmasa,
 * sotuvchi "+109%" ga ishonib qaror qilishi yoki ishonmay o'tib ketishi
 * mumkin edi — ikkalasi ham yomon.
 */
import { STOCK_THRESHOLDS, type RadarNewStarRow, type RadarReturnsRow, type RadarStockoutRow, type RadarVelocityRow } from '@savdoiq/shared';
import { Badge, Delta } from '@/components/ui';
import { useReturnReasonLabel } from '@/lib/returnReasons';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { RadarRowShell } from './SignalCard';
import './radarTexts';

/** Mahsulot sahifasi — barcha signal qatorlari (zaxira bo'yicha Rejalashtiruvchidan tashqari) shu yerga */
const productHref = (productId: string): string => `/products/${productId}`;

/** Kunlik tezlik: 10 dan katta — butun, 1 dan katta — bir xona, kichigi — ikki xona ("0,25"); nol — "0" ("0,00" emas) */
function useRate() {
  const f = useFormat();
  return (v: number): string => f.num(v, v === 0 || v >= 10 ? 0 : v >= 1 ? 1 : 2);
}

/** Ishorali qisqa summa: "+550 ming", "−45 ming" */
function useSignedCompact() {
  const f = useFormat();
  return (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${f.compact(Math.abs(v))}`;
}

/**
 * Qoldiq ogohlantirishi — tezlashgan va yangi tovarda eng muhim keyingi
 * savol "qoldiq yetadimi". Tugagan — qizil; Rejalashtiruvchining "tugayapti"
 * chegarasidan (14 kun) kam — za'faron.
 */
function StockBadge({ stock, daysLeft }: { stock: number; daysLeft: number | null }) {
  const t = useT('radar');
  const f = useFormat();
  if (stock <= 0) {
    return (
      <Badge tone="danger" className="px-1.5 py-0">
        {t('row.stockOut')}
      </Badge>
    );
  }
  if (daysLeft !== null && daysLeft <= STOCK_THRESHOLDS.low) {
    return (
      <Badge tone="warn" className="px-1.5 py-0">
        <span className="tnum">{t('row.stockDays', { n: f.num(daysLeft) })}</span>
      </Badge>
    );
  }
  return null;
}

/** Tezlik o'zgarishi: +200% dan katta — "×3,1" (kichik asosda "+471,4%" o'qilmaydi va bo'rttiradi) */
function ChangeChip({ pct }: { pct: number }) {
  const t = useT('radar');
  const f = useFormat();
  if (pct >= 200) {
    return <span className="chip tnum bg-brand/10 text-brand-ink">{t('row.times', { v: f.num(1 + pct / 100, 1) })}</span>;
  }
  return <Delta value={pct} />;
}

export function VelocityRow({ row, direction }: { row: RadarVelocityRow; direction: 'up' | 'down' }) {
  const t = useT('radar');
  const rate = useRate();
  const signed = useSignedCompact();
  const up = direction === 'up';
  return (
    <RadarRowShell
      item={row}
      href={productHref(row.productId)}
      sparkTone={up ? 'brand' : 'warn'}
      facts={
        <>
          {t('row.rates', { cur: rate(row.recentRate), prev: rate(row.prevRate) })}
          {' · '}
          <span className={cn('font-medium', up ? 'text-brand-ink' : 'text-danger-ink')}>
            {t('row.revenuePerDay', { v: signed(row.revenuePerDay) })}
          </span>
        </>
      }
      badges={up ? <StockBadge stock={row.stock} daysLeft={row.daysLeft} /> : null}
      main={<ChangeChip pct={row.changePct} />}
    />
  );
}

export function NewStarRow({ row }: { row: RadarNewStarRow }) {
  const t = useT('radar');
  const f = useFormat();
  const rate = useRate();
  return (
    <RadarRowShell
      item={row}
      href={productHref(row.productId)}
      sparkTone="info"
      facts={
        <>
          {t('row.firstSale', { date: f.dateShort(row.firstSaleDate), days: f.num(row.daysOnSale) })}
          {' · '}
          {t('row.sold', { n: f.num(row.units), v: f.compact(row.revenue) })}
        </>
      }
      badges={<StockBadge stock={row.stock} daysLeft={row.daysLeft} />}
      main={
        <>
          <span className="tnum font-display text-base font-bold leading-5 text-violet-ink">{rate(row.rate)}</span>
          <span className="text-2xs text-muted">{t('row.rateUnit')}</span>
        </>
      }
    />
  );
}

export function StockoutRow({ row }: { row: RadarStockoutRow }) {
  const t = useT('radar');
  const f = useFormat();
  const rate = useRate();
  const critical = row.status === 'critical';
  return (
    <RadarRowShell
      item={row}
      // Buyurtma miqdori va qoralama — Rejalashtiruvchida; raqamlar o'sha hisobning o'zi
      href="/planner"
      sparkTone={critical ? 'danger' : 'warn'}
      facts={
        <>
          {t('row.left', { n: f.num(row.stock) })}
          {row.inbound > 0 ? ` · ${t('row.inbound', { n: f.num(row.inbound) })}` : ''}
          {' · '}
          {t('row.rate', { v: rate(row.avgDaily) })}
          <br />
          <span className={cn('font-medium', row.orderInDays !== null && row.orderInDays <= 0 ? 'text-danger-ink' : 'text-ink')}>
            {row.orderInDays !== null && row.orderInDays <= 0
              ? t('row.orderToday')
              : row.orderBy
                ? t('row.orderBy', { date: f.dateShort(row.orderBy) })
                : ''}
          </span>
          {row.recommendedQty > 0 ? ` · ${t('row.recommended', { n: f.num(row.recommendedQty) })}` : ''}
          {row.lostRevenue > 0 ? (
            <>
              <br />
              <span className="text-danger-ink">{t('row.lost', { v: f.compact(row.lostRevenue) })}</span>
            </>
          ) : null}
        </>
      }
      main={
        <>
          <Badge tone={critical ? 'danger' : 'warn'} className="px-2 py-0.5">
            {critical ? t('row.critical') : t('row.ending')}
          </Badge>
          <span className="tnum mt-1 text-xs font-semibold text-ink">
            {row.stock <= 0 ? t('row.stockOut') : row.daysLeft !== null ? t('row.daysLeft', { n: f.num(row.daysLeft) }) : '—'}
          </span>
        </>
      }
    />
  );
}

export function ReturnsRow({ row }: { row: RadarReturnsRow }) {
  const t = useT('radar');
  const f = useFormat();
  const reason = useReturnReasonLabel();
  return (
    <RadarRowShell
      item={row}
      href={productHref(row.productId)}
      sparkTone="warn"
      facts={
        <>
          {t('row.returnRates', { cur: f.pct(row.recentRate), prev: f.pct(row.prevRate) })}
          {' · '}
          {t('row.returned', { n: f.num(row.recentReturned), base: f.num(row.recentBase), v: f.compact(row.returnedAmount) })}
          {row.topReason ? (
            <>
              <br />
              <span className="text-muted">{t('row.reason', { v: reason(row.topReason) })}</span>
            </>
          ) : null}
        </>
      }
      // Qaytarish o'sishi — yomon: invert bilan qizil
      main={<Delta value={row.deltaPp} unit="pp" invert />}
    />
  );
}
