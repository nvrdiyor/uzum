import { Link } from 'react-router-dom';
import type { CardReviewInsights } from '@savdoiq/shared';
import { AlertTriangle, ArrowRight, MessageSquare, Star, ThumbsUp } from '@/components/icons';
import { Button, Card, CardBody, CardHeader, EmptyState, ProgressBar } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CARD_NS, Hint, Metric } from './shared';

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn('h-3.5 w-3.5', star <= Math.round(value) ? 'text-warn' : 'text-line')} />
      ))}
    </span>
  );
}

/**
 * Sharhlar: reyting taqsimoti, javob berilgan ulush, xaridor maqtagan va
 * shikoyat qilgan jihatlar. Afzallik va kamchiliklar AI so'roviga ham kiradi.
 */
export function ReviewsTab({ reviews }: { reviews: CardReviewInsights }) {
  const t = useT(CARD_NS);
  const f = useFormat();

  if (reviews.count <= 0) {
    return (
      <Card>
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={t('rev.empty')} hint={t('rev.emptyHint')} />
      </Card>
    );
  }

  // [1★..5★] → eng ko'pi 100% (chiziqlar bir-biriga nisbatan)
  const dist = [1, 2, 3, 4, 5].map((_, i) => reviews.distribution[i] ?? 0);
  const maxCount = Math.max(1, ...dist);
  const answeredPct = reviews.count > 0 ? (reviews.answered / reviews.count) * 100 : 0;

  return (
    <div className="space-y-4">
      <Hint>{t('rev.aiHint')}</Hint>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader icon={<Star />} title={t('rev.title')} subtitle={t('rev.subtitle')} />
          <CardBody className="space-y-4">
            <div className="flex items-end gap-4">
              <div>
                <p className="tnum font-display text-3xl font-extrabold tracking-tight text-ink">{f.num(reviews.rating, 1)}</p>
                <Stars value={reviews.rating} />
              </div>
              <p className="ml-auto text-right text-xs text-muted">{t('rev.countN', { n: f.num(reviews.count) })}</p>
            </div>

            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = dist[star - 1] ?? 0;
                return (
                  <div key={star} className="flex items-center gap-2.5">
                    <span className="tnum flex w-8 items-center gap-1 text-xs text-muted">
                      {star}
                      <Star className="h-3 w-3 text-warn" />
                    </span>
                    <ProgressBar
                      className="flex-1"
                      value={(count / maxCount) * 100}
                      tone={star >= 4 ? 'brand' : star === 3 ? 'warn' : 'danger'}
                    />
                    <span className="tnum w-10 text-right text-xs text-ink-soft">{f.num(count)}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Metric
                label={t('rev.answered')}
                value={f.pct(answeredPct, 0)}
                hint={t('rev.answeredOf', { n: f.num(reviews.answered), total: f.num(reviews.count) })}
                tone={answeredPct >= 80 ? 'brand' : 'warn'}
              />
              <Metric
                label={t('rev.unanswered')}
                value={f.num(Math.max(0, reviews.count - reviews.answered))}
                tone={reviews.count - reviews.answered > 0 ? 'warn' : undefined}
              />
            </div>
            {reviews.count - reviews.answered > 0 ? (
              <Link to="/reviews" className="inline-block">
                <Button variant="outline" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                  {t('rev.reply')}
                </Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          <Card>
            <CardHeader icon={<ThumbsUp />} title={t('rev.pros')} />
            <CardBody>
              <Points items={reviews.pros} empty={t('rev.prosEmpty')} tone="brand" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<AlertTriangle />} title={t('rev.cons')} />
            <CardBody>
              <Points items={reviews.cons} empty={t('rev.consEmpty')} tone="danger" />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader icon={<MessageSquare />} title={t('rev.recent')} />
        <CardBody>
          {reviews.recent.length === 0 ? (
            <p className="text-sm text-muted">{t('rev.recentEmpty')}</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {reviews.recent.map((r, i) => (
                <li key={`${r.date}-${i}`} className="rounded-xl border border-line bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Stars value={r.rating} />
                    <span className="tnum text-2xs text-muted">{f.date(r.date)}</span>
                  </div>
                  <p className={cn('mt-2 break-words text-sm', r.text.trim() ? 'text-ink-soft' : 'text-muted')}>
                    {r.text.trim() || t('rev.noText')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Points({ items, empty, tone }: { items: string[]; empty: string; tone: 'brand' | 'danger' }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((text, i) => (
        <li key={`${i}-${text.slice(0, 24)}`} className="flex items-start gap-2.5 text-sm">
          <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'brand' ? 'bg-brand' : 'bg-danger')} />
          <span className="min-w-0 break-words text-ink-soft">{text}</span>
        </li>
      ))}
    </ul>
  );
}
