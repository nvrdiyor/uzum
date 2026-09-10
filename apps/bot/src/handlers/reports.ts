/**
 * Hisobot matnlarini shakllantirish.
 *
 * Bir xil ma'lumot ikki joyda ko'rsatiladi — «📊 Bugungi hisobot» tugmasi va
 * kunlik avtomatik xabar (jobs/daily.ts) — shuning uchun matn qurish shu yerda.
 */
import { formatMoney, formatNumber } from '@savdoiq/shared';
import { tr, type BotLang } from '../i18n.js';
import { cut, escapeHtml } from './context.js';
import { displayDate, type DayReport, type StockAlert } from './data.js';

/** Top mahsulotlar bloki (bo'sh bo'lsa — hech narsa) */
function topBlock(lang: BotLang, top: DayReport['top']): string {
  if (top.length === 0) return '';
  const rows = top.map((p, i) =>
    tr(lang, 'daily_top_row', {
      n: i + 1,
      title: escapeHtml(cut(p.title)),
      revenue: formatMoney(p.revenue, lang),
      units: formatNumber(p.units, lang),
    }),
  );
  // `daily_top` matni allaqachon yangi qatordan boshlanadi
  return `${tr(lang, 'daily_top')}\n${rows.join('\n')}`;
}

/** «📊 Bugungi hisobot» matni */
export function todayReportText(lang: BotLang, dateKey: string, report: DayReport): string {
  const head = tr(lang, 'today_title', { date: displayDate(dateKey) });

  if (report.orders === 0 && report.revenue === 0) {
    return `${head}\n\n${tr(lang, 'today_empty')}`;
  }

  const lines = [
    head,
    '',
    tr(lang, 'today_revenue', { value: formatMoney(report.revenue, lang) }),
    tr(lang, 'today_orders', { value: formatNumber(report.orders, lang) }),
    tr(lang, 'today_units', { value: formatNumber(report.units, lang) }),
    tr(lang, 'today_profit', { value: formatMoney(report.netProfit, lang) }),
    tr(lang, 'today_avg', { value: formatMoney(report.avgCheck, lang) }),
  ];

  return `${lines.join('\n')}\n${topBlock(lang, report.top)}`.trimEnd();
}

/** «📦 Qoldiqlar» matni — 7 kundan kam qolgan SKU'lar */
export function stocksText(lang: BotLang, alert: StockAlert): string {
  const head = tr(lang, 'stocks_title');
  if (alert.rows.length === 0) return `${head}\n\n${tr(lang, 'stocks_empty')}`;

  const rows = alert.rows.map((r) =>
    r.stock <= 0
      ? tr(lang, 'stocks_row_zero', { title: escapeHtml(cut(r.title)) })
      : tr(lang, 'stocks_row', {
          title: escapeHtml(cut(r.title)),
          stock: formatNumber(r.stock, lang),
          days: r.daysLeft,
        }),
  );

  const rest = alert.total - alert.rows.length;
  const more = rest > 0 ? tr(lang, 'stocks_more', { count: rest }) : '';
  return `${head}\n\n${rows.join('\n')}\n${more}`.trimEnd();
}

/** Kunlik avtomatik hisobot (kechagi natijalar + kritik qoldiqlar) */
export function dailyDigestText(
  lang: BotLang,
  dateKey: string,
  report: DayReport,
  alert: StockAlert,
): string {
  const head = tr(lang, 'daily_title', { date: displayDate(dateKey) });

  const body =
    report.orders === 0 && report.revenue === 0
      ? tr(lang, 'daily_nothing')
      : [
          tr(lang, 'today_revenue', { value: formatMoney(report.revenue, lang) }),
          tr(lang, 'today_orders', { value: formatNumber(report.orders, lang) }),
          tr(lang, 'today_units', { value: formatNumber(report.units, lang) }),
          tr(lang, 'today_profit', { value: formatMoney(report.netProfit, lang) }),
          tr(lang, 'today_avg', { value: formatMoney(report.avgCheck, lang) }),
        ].join('\n');

  const critical =
    alert.total > 0
      ? `\n${tr(lang, 'daily_critical', { count: alert.total })}\n${alert.rows
          .slice(0, 5)
          .map((r) =>
            tr(lang, 'daily_critical_row', {
              title: escapeHtml(cut(r.title)),
              stock: formatNumber(r.stock, lang),
            }),
          )
          .join('\n')}`
      : '';

  return `${head}\n\n${body}\n${topBlock(lang, report.top)}\n${critical}`.replace(/\n{3,}/g, '\n\n').trimEnd();
}
