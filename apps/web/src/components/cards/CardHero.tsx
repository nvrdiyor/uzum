import type { CardDetailResponse, CardImpact } from '@savdoiq/shared';
import { ExternalLink, History, ImageOff, Info, Store, Tag } from '@/components/icons';
import { Card, CardBody, CardHeader, Delta } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CARD_NS, Metric, ScoreRing, SCORE_TEXT, scoreTone, useScoreLabel } from './shared';

/**
 * Sahifa boshi: rasm, nom, do'kon, kategoriya, Uzum havolasi, ball halqasi
 * va oxirgi 30 kunlik sotuv. Ball jonli hisoblangan (saqlangan matn bo'yicha).
 */
export function CardHero({ detail, score }: { detail: CardDetailResponse; score: number }) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const scoreLabel = useScoreLabel();
  const p = detail.product;
  const s = detail.sales;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2 sm:h-24 sm:w-24">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <ImageOff className="h-7 w-7" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 basis-56">
          <p className="eyebrow">{t('title')}</p>
          <h1 className="mt-1 text-balance break-words font-title text-lg font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-xl">
            {p.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="chip bg-surface-3 text-ink-soft">
              <Store className="h-3.5 w-3.5" />
              {p.storeTitle}
            </span>
            <span className="chip bg-surface-3 text-ink-soft">
              <Tag className="h-3.5 w-3.5" />
              {p.category ?? t('noCategory')}
            </span>
            {p.brand ? <span className="chip bg-surface-3 text-muted">{p.brand}</span> : null}
            {p.blocked ? <span className="chip bg-danger/10 text-danger-ink">{t('blocked')}</span> : null}
          </div>
          {p.uzumUrl ? (
            <a
              href={p.uzumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focusable mt-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-brand-ink hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              {t('openUzum')}
            </a>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <ScoreRing score={score} size={92} caption="/ 100" />
          <div>
            <p className="eyebrow">{t('score')}</p>
            <p className={cn('text-sm font-bold', SCORE_TEXT[scoreTone(score)])}>{scoreLabel(score)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={t('sales.revenue')} value={f.money(s.revenue30)} hint={t('sales.period')} />
        <Metric
          label={t('sales.profit')}
          value={f.money(s.profit30)}
          tone={s.profit30 < 0 ? 'danger' : undefined}
          hint={t('sales.period')}
        />
        <Metric label={t('sales.units')} value={t('units', { n: f.num(s.units30) })} hint={t('sales.period')} />
        <Metric
          label={t('sales.stock')}
          value={t('units', { n: f.num(s.stock) })}
          tone={s.stock <= 0 ? 'warn' : undefined}
          hint={s.stock <= 0 ? t('sales.noStock') : undefined}
        />
      </div>
    </Card>
  );
}

const pctChange = (before: number, after: number): number | null =>
  before > 0 ? ((after - before) / before) * 100 : null;

/**
 * Matn qo'yilgandan keyingi natija: oldingi va keyingi teng kunlar.
 * Bu sabab-oqibat isboti emas — aksiya, mavsum va narx ham ta'sir qiladi.
 */
export function ImpactCard({ impact }: { impact: CardImpact }) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const rows = [
    { key: 'revenue', label: t('impact.revenue'), before: impact.before.revenue, after: impact.after.revenue, money: true },
    { key: 'units', label: t('impact.units'), before: impact.before.units, after: impact.after.units, money: false },
    { key: 'orders', label: t('impact.orders'), before: impact.before.orders, after: impact.after.orders, money: false },
  ];
  // Qo'llanganiga bir kun to'lmagan: 0 kunni 0 kun bilan solishtirib "0%" ko'rsatmaymiz
  if (impact.days < 1) {
    return (
      <Card>
        <CardHeader
          icon={<History />}
          title={t('impact.title')}
          subtitle={t('impact.pending', { date: f.date(impact.appliedAt) })}
        />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        icon={<History />}
        title={t('impact.title')}
        subtitle={t('impact.subtitle', { date: f.date(impact.appliedAt), n: impact.days })}
      />
      <CardBody className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">{r.label}</p>
                <Delta value={pctChange(r.before, r.after)} />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <p className="text-2xs text-muted">{t('impact.before', { n: impact.days })}</p>
                  <p className="tnum truncate text-sm font-semibold text-ink-soft">
                    {r.money ? f.money(r.before) : f.num(r.before)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-2xs text-muted">{t('impact.after', { n: impact.days })}</p>
                  <p className="tnum truncate text-sm font-bold text-ink">{r.money ? f.money(r.after) : f.num(r.after)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('impact.note')}
        </p>
      </CardBody>
    </Card>
  );
}
