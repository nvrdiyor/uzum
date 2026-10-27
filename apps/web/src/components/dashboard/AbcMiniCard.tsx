import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PieChart } from '@/components/icons';
import type { DashboardAbc, DashboardAbcMode } from '@savdoiq/shared';
import { Amount, Card, CardBody, CardHeader, EmptyState, ProductCell, Segmented } from '@/components/ui';
import { CHART_COLORS } from '@/components/charts';
import { useFormat, useT } from '@/i18n';
import { splitProductName } from './productName';

type Mode = 'revenue' | 'profit';

/**
 * Guruh ranglari: A — brend (asosiy pul), B — ko'k (o'rta), C — neytral.
 * Holat ranglari (sariq, qizil) ATAYLAB olinmadi: C "yomon" degani emas —
 * u assortimentning kam pul keltiradigan qismi.
 */
const GROUP_COLOR: Record<'A' | 'B' | 'C', string> = {
  A: CHART_COLORS.brand,
  B: CHART_COLORS.info,
  C: CHART_COLORS.slate,
};

/**
 * ABC mini-karta — tanlangan davrda qaysi SKU'lar pulning 80% ini beradi.
 * Raqamlar ABC sahifasining o'zi (bitta qoida va manba — server
 * classifyAbc), batafsili o'sha sahifada. Foyda rejimi faqat pulni
 * ko'radigan a'zoga keladi (2026-10-27).
 */
export function AbcMiniCard({ abc, currency }: { abc: DashboardAbc; currency: string }) {
  const t = useT('dashboard');
  const f = useFormat();
  const [mode, setMode] = useState<Mode>('revenue');
  const shown: Mode = mode === 'profit' && abc.profit ? 'profit' : 'revenue';
  const data: DashboardAbcMode = shown === 'profit' && abc.profit ? abc.profit : abc.revenue;
  const empty = data.total <= 0;

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<PieChart />}
        title={t('abc.title')}
        subtitle={t(shown === 'profit' ? 'abc.subtitleProfit' : 'abc.subtitle')}
        actions={
          abc.profit ? (
            <Segmented<Mode>
              size="sm"
              value={shown}
              onChange={setMode}
              options={[
                { value: 'revenue', label: t('abc.mode.revenue') },
                { value: 'profit', label: t('abc.mode.profit') },
              ]}
            />
          ) : undefined
        }
      />
      <CardBody className="flex-1">
        {empty ? (
          <EmptyState className="py-10" icon={<PieChart className="h-6 w-6" />} title={t('abc.empty')} />
        ) : (
          /*
           * To'liq kenglikdagi karta: chapda guruhlar, o'ngda A yetakchilari.
           * Ilgari o'ng ustunda edi — ustun uzayib, yonidagi Xarajatlar kartasi
           * cho'zilib, ichida katta bo'sh joy qolardi.
           */
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          <div>
            <div
              role="img"
              aria-label={data.groups.map((g) => `${g.group} ${f.pct(g.share)}`).join(', ')}
              className="flex h-2.5 w-full gap-1"
            >
              {data.groups
                .filter((g) => g.share > 0)
                .map((g, i) => (
                  <div
                    key={g.group}
                    className="h-full min-w-[6px] origin-left animate-grow-x rounded-full"
                    style={{ flex: `${g.share} 1 0%`, background: GROUP_COLOR[g.group], animationDelay: `${120 + i * 120}ms` }}
                  />
                ))}
            </div>

            <ul className="mt-4 divide-y divide-line/70">
              {data.groups.map((g) => (
                <li key={g.group} className="flex items-center gap-3 py-2.5 first:pt-1">
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold text-white"
                    style={{ background: GROUP_COLOR[g.group] }}
                  >
                    {g.group}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t(`abc.group.${g.group}`)}</p>
                    <p className="tnum mt-0.5 text-xs text-muted">{t('abc.skus', { n: f.num(g.skuCount) })}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum whitespace-nowrap text-sm font-semibold text-ink">
                      <Amount value={f.money(g.value, currency)} />
                    </p>
                    <p className="tnum mt-0.5 text-xs text-muted">{f.pct(g.share)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs leading-relaxed text-muted">{t('abc.hint')}</p>
            <Link
              to="/abc"
              className="mt-2 inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-brand-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {t('abc.all')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

            {data.leaders.length > 0 ? (
              <div className="border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <p className="eyebrow mb-2">{t('abc.leaders')}</p>
                <ul className="space-y-2">
                  {data.leaders.map((r) => {
                    const { name, variant } = splitProductName(r);
                    return (
                      <li key={r.skuId} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <ProductCell title={name} subtitle={variant ? `${variant} · ${r.sku}` : r.sku} imageUrl={r.imageUrl} />
                        </div>
                        <span className="tnum shrink-0 text-xs font-semibold text-muted">{f.pct(r.share)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
