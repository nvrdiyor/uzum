/**
 * Hisobot matnlarini shakllantirish.
 *
 * Bir xil ma'lumot ikki joyda ko'rsatiladi — «📊 Bugungi hisobot» tugmasi
 * (bugun / kecha / shu oy / shu yil) va kunlik avtomatik xabar (jobs/daily.ts) —
 * shuning uchun matn qurish shu yerda.
 */
import { formatMoney, formatNumber } from '@savdoiq/shared';
import { tr, type BotLang, type TKey } from '../i18n.js';
import { cut, escapeHtml } from './context.js';
import { displayDate, type PeriodReport, type StockAlert } from './data.js';
import type { ReportPeriod, ReportRange } from '../lib/dashboard-kpi.js';

/** Top mahsulotlar bloki (bo'sh bo'lsa — hech narsa) */
function topBlock(lang: BotLang, top: PeriodReport['top']): string {
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

/** Sof foyda qatori — faqat pulni ko'radigan a'zoga */
function profitLine(lang: BotLang, report: PeriodReport): string {
  return tr(lang, 'today_profit', { value: formatMoney(report.netProfit, lang) });
}

/**
 * KPI qatorlari — hisobot va kunlik xabar bitta tartibda. Raqamlar saytdagi
 * Boshqaruv panelining o'zi (data.ts buildPeriodReport).
 */
function kpiLines(lang: BotLang, report: PeriodReport, showProfit: boolean): string[] {
  return [
    tr(lang, 'today_revenue', { value: formatMoney(report.revenue, lang) }),
    tr(lang, 'today_orders', { value: formatNumber(report.orders, lang) }),
    tr(lang, 'today_units', { value: formatNumber(report.units, lang) }),
    // Pulsiz shablondagi a'zoga foyda ko'rsatilmaydi — saytdagi kabi (2026-10-27)
    ...(showProfit ? [profitLine(lang, report)] : []),
    tr(lang, 'today_avg', { value: formatMoney(report.avgCheck, lang) }),
  ];
}

/**
 * Buyurtmasiz davr. Davr xarajati (saqlash, reklama) baribir bo'lishi mumkin —
 * sayt bunday davrda sof foydani manfiy ko'rsatadi, bot ham yashirmaydi:
 * aks holda "buyurtma yo'q" ortida yo'qotish ko'rinmay qolardi (2026-10-27).
 */
function emptyLines(lang: BotLang, key: TKey, report: PeriodReport, showProfit: boolean): string[] {
  return [tr(lang, key), ...(showProfit && report.netProfit !== 0 ? [profitLine(lang, report)] : [])];
}

const EMPTY_KEY: Record<ReportPeriod, TKey> = {
  today: 'today_empty',
  yesterday: 'daily_nothing',
  month: 'rep_empty_month',
  year: 'rep_empty_year',
};

/** Sarlavha: kunlik davrda bitta sana, oy va yilda — oraliq (tarif kesgan bo'lsa, kesilgan boshidan) */
function reportTitle(lang: BotLang, range: ReportRange): string {
  const { from, to } = range.period;
  switch (range.kind) {
    case 'today':
      return tr(lang, 'today_title', { date: displayDate(to) });
    case 'yesterday':
      return tr(lang, 'rep_title_yesterday', { date: displayDate(to) });
    case 'month':
      return tr(lang, 'rep_title_month', { from: displayDate(from), to: displayDate(to) });
    default:
      return tr(lang, 'rep_title_year', { from: displayDate(from), to: displayDate(to) });
  }
}

/** «📊 Hisobot» matni — tanlangan davr bo'yicha (bugun / kecha / shu oy / shu yil) */
export function periodReportText(lang: BotLang, range: ReportRange, report: PeriodReport, showProfit = true): string {
  const head = [reportTitle(lang, range)];
  // Sayt ham shu davrni tarif chegarasida kesadi — sotuvchi nega 1-yanvardan emasligini bilsin
  if (range.clamped) {
    head.push(tr(lang, 'rep_clamped', { days: range.historyDays, date: displayDate(range.period.from) }));
  }

  if (report.orders === 0 && report.revenue === 0) {
    return [...head, '', ...emptyLines(lang, EMPTY_KEY[range.kind], report, showProfit)].join('\n');
  }

  const lines = [...head, '', ...kpiLines(lang, report, showProfit)];
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

/**
 * Kunlik avtomatik hisobot (kechagi natijalar + kritik qoldiqlar).
 *
 * Raqamlar va qatorlar «📊 Hisobot → Kecha» bilan bitta funksiyadan, ta'rif —
 * saytdagi "Kecha" davri. Ilgari bu xabar pozitsiya sanasi bo'yicha sanardi va
 * buyurtma soni, o'rtacha chek saytdagidan farq qilishi mumkin edi (2026-10-27).
 */
export function dailyDigestText(
  lang: BotLang,
  range: ReportRange,
  report: PeriodReport,
  alert: StockAlert,
  showProfit = true,
): string {
  const head = tr(lang, 'daily_title', { date: displayDate(range.period.to) });

  const body = (
    report.orders === 0 && report.revenue === 0
      ? emptyLines(lang, 'daily_nothing', report, showProfit)
      : kpiLines(lang, report, showProfit)
  ).join('\n');

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
