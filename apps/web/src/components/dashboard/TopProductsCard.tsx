import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Trophy } from '@/components/icons';
import type { TopProductRow } from '@savdoiq/shared';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ProductCell,
  ProgressBar,
  RankBadge,
  type Column,
} from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCanOpen, useSeesMoney } from '@/lib/view';
import { STATE_TONE, TONE_TEXT } from '@/components/stock/common';
import { splitProductName } from './productName';
import { marginTone } from './rates';

/** "Top mahsulotlar" — davr bo'yicha eng ko'p tushum keltirganlar */
export function TopProductsCard({ rows, loading }: { rows: TopProductRow[]; loading?: boolean }) {
  const t = useT('dashboard');
  const f = useFormat();
  // Pulsiz ko'rinish shablonida foyda va marja null — ustunlarning o'zi chizilmaydi
  const money = useSeesMoney();
  const navigate = useNavigate();
  const canOpen = useCanOpen();
  // Qator bosilsa — mahsulot sahifasi (shablon mahsulotlarni ochmasa — bosilmaydi)
  const openProduct = canOpen('/products') ? (r: TopProductRow) => r.productId && navigate(`/products/${r.productId}`) : undefined;

  /*
   * O'rin — TUSHUM bo'yicha (server shu tartibda yuboradi), jadvaldagi joriy
   * qator raqami emas: foyda yoki marja bo'yicha saralanganda ham 1-o'rin
   * 1-o'rinligicha qoladi.
   */
  const rank = useMemo(() => new Map(rows.map((r, i) => [r.skuId, i + 1])), [rows]);
  /*
   * Ulush chizig'i yetakchiga nisbatan. Ilgari 0–100% shkalada edi va 11,8%
   * li yetakchi ham deyarli bo'sh chiziq bo'lib ko'rinardi. Aniq foiz yonida.
   */
  const maxShare = useMemo(() => Math.max(0, ...rows.map((r) => r.share)), [rows]);

  const columns: Column<TopProductRow>[] = [
    {
      key: 'title',
      header: t('top.col.product'),
      /*
       * max-w: jadval katagi o'z-o'zidan qisqarmaydi — uzun nom ustunni
       * kengaytirib, 1366px da oxirgi "Ulush" ustuni karta chetidan chiqib
       * qolardi. Nom kesiladi (to'liq nomi sichqoncha olib borilganda), variant
       * esa SKU yonida — "Runner Air — 40" va "— 42" kesilib bir xil bo'lib qolmasin.
       */
      render: (r) => {
        const { name, variant } = splitProductName(r);
        return (
          <div className="flex min-w-0 max-w-[21rem] items-center gap-3 2xl:max-w-[28rem]">
            <RankBadge rank={rank.get(r.skuId) ?? 0} />
            <ProductCell title={name} subtitle={variant ? `${variant} · ${r.sku}` : r.sku} imageUrl={r.imageUrl} />
          </div>
        );
      },
    },
    {
      key: 'units',
      header: t('top.col.sold'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.units,
      /*
       * Ostida — oylik potensial (hozirgi sur'at × 30): ikkalasi ham sotuv
       * sur'ati. Alohida ustun 1366px da jadvalni karta chetidan chiqarardi.
       */
      render: (r) => (
        <div className="text-right">
          <p className="tnum">{f.num(r.units)}</p>
          {r.monthPotential !== undefined ? (
            <p className="tnum whitespace-nowrap text-2xs text-muted" title={t('top.potentialHint')}>
              {t('top.potential', { n: f.num(r.monthPotential) })}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'revenue',
      header: t('top.col.revenue'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.revenue,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.revenue)}</span>,
    },
    {
      key: 'profit',
      header: t('top.col.profit'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.profit,
      render: (r) => (
        <span className={cn('font-semibold', r.profit >= 0 ? 'text-brand-ink' : 'text-danger-ink')}>{f.money(r.profit)}</span>
      ),
    },
    {
      key: 'margin',
      header: t('top.col.margin'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.margin,
      render: (r) => <Badge tone={marginTone(r.margin)}>{f.pct(r.margin)}</Badge>,
    },
    /*
     * Qoldiq va "yetadi" — Qoldiqlar sahifasidagi raqamlarning o'zi (server:
     * Rejalashtiruvchi, yetkazish muddati bilan); rang — o'sha sahifadagi
     * nishon rangi. Eng ko'p sotilayotgan tovar tugab qolsa, shu yerda ko'rinsin.
     */
    {
      key: 'stock',
      header: t('top.col.stock'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.daysLeft ?? Number.MAX_SAFE_INTEGER,
      render: (r) => {
        if (r.stock === undefined) return <span className="text-muted">—</span>;
        const tone = r.stockStatus ? TONE_TEXT[STATE_TONE[r.stockStatus]] : 'text-muted';
        const note =
          r.stock <= 0
            ? t('top.stockOut')
            : r.daysLeft === null || r.daysLeft === undefined
              ? t('top.stockNoSales')
              : t('top.stockDays', { n: f.num(r.daysLeft) });
        return (
          <div className="text-right" title={t('top.stockHint')}>
            <p className="tnum font-semibold text-ink">{f.num(r.stock)}</p>
            <p className={cn('tnum text-2xs font-medium', tone)}>{note}</p>
          </div>
        );
      },
    },
    {
      key: 'share',
      header: t('top.col.share'),
      align: 'right',
      // Ulush ABC mini-kartada ham bor — 1536px dan torroq ekranda joyni qoldiq ustuniga beramiz
      hideBelow: '2xl',
      width: 156,
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <ProgressBar className="w-16" tone="info" value={maxShare > 0 ? (r.share / maxShare) * 100 : 0} />
          <span className="tnum w-11 text-right text-xs text-muted">{f.pct(r.share)}</span>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Trophy />}
        title={t('top.title')}
        subtitle={t('top.subtitle')}
        actions={
          <Link
            to="/products"
            className="inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-brand-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {t('top.all')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="mt-4">
        <DataTable<TopProductRow>
          columns={money ? columns : columns.filter((c) => c.key !== 'profit' && c.key !== 'margin')}
          rows={rows}
          loading={loading}
          rowKey={(r) => r.skuId}
          onRowClick={openProduct ? (r) => void openProduct(r) : undefined}
          empty={<EmptyState icon={<Trophy className="h-6 w-6" />} title={t('top.empty')} hint={t('top.emptyHint')} />}
        />
      </div>
    </Card>
  );
}
