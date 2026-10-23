import type { ReactNode } from 'react';
import { STOCK_THRESHOLDS } from '@savdoiq/shared';
import { Badge, ProductThumb, ProgressBar, type Tone } from '@/components/ui';
import { CHART_COLORS } from '@/lib/theme';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Qoldiq holati — `packages/shared` dagi StockRow.status bilan bir xil */
export type StockState = 'critical' | 'low' | 'ok' | 'excess' | 'dead';

export const STOCK_STATES: StockState[] = ['critical', 'low', 'ok', 'excess', 'dead'];

/**
 * Holat rangi BARCHA ombor sahifalarida bir xil: kritik — qizil, tugayapti —
 * sariq, yetarli — brend, ortiqcha — ko'k (qoldiq), harakatsiz — kulrang.
 * Nishon, tasma, grafik bo'lagi va "yetadi" chizig'i shu jadvaldan oladi.
 */
export const STATE_TONE: Record<StockState, Tone> = {
  critical: 'danger',
  low: 'warn',
  ok: 'brand',
  excess: 'info',
  dead: 'muted',
};

/** Grafik va holat tasmasi uchun o'sha ranglar (slate — harakatsiz) */
export const STATE_COLOR: Record<StockState, string> = {
  critical: CHART_COLORS.danger,
  low: CHART_COLORS.warn,
  ok: CHART_COLORS.brand,
  excess: CHART_COLORS.info,
  dead: CHART_COLORS.slate,
};

/**
 * StatCard ohanglari orasida "muted" va "pink" yo'q. Sanoq KPI'lari (SKU soni,
 * tannarx qiymati) ma'no rangini olmasin, pullik saqlash esa xarajat
 * xaritasidagi pushti rangda (COST_COLORS.storage) tursin — shuning uchun
 * ohang o'zgaruvchilari shu klasslar bilan almashtiriladi.
 *
 * `!` (important) ATAYLAB: .tone-* klasslari index.css'da @layer tashqarisiga,
 * fayl oxiriga ko'chirilgan va har qanday utility'dan keyin keladi — oddiy
 * almashtirish StatCard'ning o'z tone-brand klassiga yutqazib, kartochka
 * yana firuza bo'lib qolardi (2026-10-24 da tekshirildi).
 */
export const NEUTRAL_TONE = '![--tone:var(--c-muted)] ![--tone-ink:var(--c-text-soft)]';
export const STORAGE_TONE = '![--tone:var(--c-pink)] ![--tone-ink:var(--c-pink)]';

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand-ink',
  info: 'text-info',
  warn: 'text-warn-ink',
  danger: 'text-danger',
  muted: 'text-muted',
  violet: 'text-violet',
};

/**
 * SKU jadvallaridagi mahsulot katagi: rasm yoki rangli bosh harflar, ikki
 * qatorgacha nom va izoh (SKU, do'kon).
 *
 * Umumiy ProductCell nomni bir qatorda kesadi, nom JSX bo'lsa esa bosh
 * harflarni izohdan olardi — ikki do'konli hisobda hamma qatorda bir xil
 * "SS" ("SAM-0103 · Samarqand…") chiqardi. Bosh harf va rang variantsiz
 * nomdan olinadi: bir mahsulotning "— Bej" va "— Yashil"i bir xil rangda.
 */
export function SkuNameCell({
  title,
  subtitle,
  imageUrl,
  className,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const cut = title.lastIndexOf(' — ');
  const base = cut > 0 ? title.slice(0, cut) : title;
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
        <ProductThumb name={base} imageUrl={imageUrl} style={{ fontSize: 14 }} />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 whitespace-normal text-sm font-medium leading-snug text-ink" title={title}>
          {title}
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-muted" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Rangli holat belgisi (Kritik / Tugayapti / Yetarli / Ortiqcha / Harakatsiz) */
export function StockStatusBadge({ status }: { status: StockState }) {
  const t = useT('common');
  return (
    <Badge tone={STATE_TONE[status]} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}

/**
 * Necha kunga yetishiga qarab rang — server holati bilan bir xil chegaralar
 * (STOCK_THRESHOLDS). Ilgari ortiqcha "90 dan katta" edi, server esa 90 kunni
 * allaqachon "Ortiqcha" derdi: aynan 90 kunlik SKU nishonda ko'k, kun
 * yozuvida yashil chiqardi.
 */
export function daysTone(days: number | null | undefined): Tone {
  if (days === null || days === undefined || !Number.isFinite(days)) return 'muted';
  if (days <= STOCK_THRESHOLDS.critical) return 'danger';
  if (days <= STOCK_THRESHOLDS.low) return 'warn';
  if (days >= STOCK_THRESHOLDS.excess) return 'info';
  return 'brand';
}

/**
 * "Necha kunga yetadi" — raqam + rangli progress.
 * 60 kun to'liq shkala deb olinadi, undan ortig'i 100% ko'rinadi.
 */
export function DaysLeftCell({ days, width = 128 }: { days: number | null | undefined; width?: number }) {
  const t = useT('common');
  const f = useFormat();

  if (days === null || days === undefined || !Number.isFinite(days)) {
    return <span className="text-muted">—</span>;
  }

  const tone = daysTone(days);
  const pct = Math.min(100, Math.max(2, (days / 60) * 100));

  return (
    <div className="ml-auto" style={{ width }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className={cn('tnum text-xs font-semibold', TONE_TEXT[tone])}>
          {days > 999 ? '999+' : f.num(Math.round(days))}
        </span>
        <span className="text-2xs text-muted">{t('common.days')}</span>
      </div>
      <ProgressBar value={pct} tone={tone} />
    </div>
  );
}

/** Kichik "yorliq → qiymat" juftligi (drawer/kartochkalar ichida) */
export function MetaRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn('tnum text-sm font-semibold', tone ? TONE_TEXT[tone] : 'text-ink')}>{value}</span>
    </div>
  );
}

/**
 * FBO / FBS / o'z ombori taqqoslash kartochkasi:
 * dona, summa va umumiy qoldiqdagi ulush chizig'i.
 */
export function SchemeShareCard({
  icon,
  title,
  hint,
  units,
  amount,
  share,
  tone = 'brand',
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  units: number;
  amount: number;
  share: number;
  tone?: Tone;
}) {
  const f = useFormat();
  const t = useT('common');

  return (
    // Ohang tizimi orqali: ikonka plitkasi va ulush chizig'i bir rangda (index.css: .tone-*, .icon-tile)
    <div className={cn('card card-hover p-5', `tone-${tone}`)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate eyebrow-lg">{title}</p>
          <p className="tnum mt-2 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">
            {f.num(units)} <span className="text-base font-semibold text-muted">{t('common.units').toLowerCase()}</span>
          </p>
          <p className="tnum mt-1 text-sm text-ink-soft">{f.money(amount)}</p>
        </div>
        {icon ? (
          <div className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5">{icon}</div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{hint ?? t('common.share')}</span>
          <span className={cn('tnum font-semibold', TONE_TEXT[tone])}>{f.pct(share)}</span>
        </div>
        <ProgressBar value={share} tone={tone} />
      </div>
    </div>
  );
}
