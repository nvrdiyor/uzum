import type { CardAuditResult, CardAuditSection, CardSectionId } from '@savdoiq/shared';
import { ArrowRight, Gauge, Hash, Info, ShieldCheck } from '@/components/icons';
import { Badge, Button, Card, CardBody, CardHeader, ProgressBar, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CARD_NS, IssueList, ScoreRing, SCORE_TEXT, scoreTone, useScoreLabel } from './shared';

export type CardTab = 'content' | 'keywords' | 'audit' | 'reviews' | 'ai' | 'drafts';

/** Bo'limdagi kamchilikni qayerda tuzatish mumkin */
const FIX_TAB: Record<CardSectionId, CardTab | null> = {
  title: 'content',
  description: 'content',
  keywords: 'keywords',
  social: 'reviews',
  health: null,
};

function barTone(pct: number): Tone {
  if (pct >= 80) return 'brand';
  if (pct >= 50) return 'warn';
  return 'danger';
}

/**
 * Audit: umumiy ball, bo'limlar bo'yicha chiziqlar, kamchiliklar ro'yxati va
 * kalit so'zlar qamrovi. Hammasi sahifada jonli hisoblanadi (saqlangan matn).
 */
export function AuditTab({ audit, onGo }: { audit: CardAuditResult; onGo: (tab: CardTab) => void }) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const scoreLabel = useScoreLabel();
  const cov = audit.coverage;
  const issuesTotal = audit.sections.filter((s) => s.available).reduce((n, s) => n + s.issues.length, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4">
        <Card>
          <CardHeader icon={<Gauge />} title={t('audit.title')} subtitle={t('audit.subtitle')} />
          <CardBody className="space-y-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={audit.score} size={112} stroke={10} caption="/ 100" />
              <div className="min-w-0">
                <p className={cn('font-display text-lg font-bold', SCORE_TEXT[scoreTone(audit.score)])}>
                  {scoreLabel(audit.score)}
                </p>
                <p className="mt-0.5 text-sm text-muted">{t('audit.issuesCount', { n: issuesTotal })}</p>
              </div>
            </div>

            <div className="space-y-3">
              {audit.sections.map((s) => (
                <SectionBar key={s.id} section={s} />
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Hash />} title={t('audit.coverage')} />
          <CardBody className="space-y-3">
            {cov.total === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">{t('audit.cov.none')}</p>
                <Button variant="outline" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => onGo('keywords')}>
                  {t('audit.cov.add')}
                </Button>
              </div>
            ) : (
              <>
                <CoverageRow label={t('audit.cov.inTitle')} n={cov.inTitle} total={cov.total} />
                <CoverageRow label={t('audit.cov.inAny')} n={cov.inAny} total={cov.total} />
                {cov.demandTotal > 0 ? (
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">{t('audit.cov.demand')}</span>
                      <span className="tnum font-semibold text-ink">
                        {f.num(cov.demandCovered)} / {f.num(cov.demandTotal)}
                      </span>
                    </div>
                    <ProgressBar
                      value={(cov.demandCovered / cov.demandTotal) * 100}
                      tone={barTone((cov.demandCovered / cov.demandTotal) * 100)}
                      showLabel
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t('audit.cov.noDemand')}</p>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="xl:col-span-2">
        <CardHeader icon={<ShieldCheck />} title={t('audit.issues')} subtitle={t('audit.disclaimer')} />
        <CardBody className="space-y-4">
          {audit.sections.map((s) => {
            const fix = FIX_TAB[s.id];
            return (
              <section key={s.id} className={cn('rounded-xl border border-line p-4', !s.available && 'bg-surface-2/60')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h4 className={cn('text-sm font-semibold', s.available ? 'text-ink' : 'text-muted')}>
                      {t(`section.${s.id}`)}
                    </h4>
                    {s.available ? (
                      <Badge tone={barTone(s.max > 0 ? (s.score / s.max) * 100 : 0)}>
                        <span className="tnum">
                          {Math.min(s.score, s.max)} / {s.max}
                        </span>
                      </Badge>
                    ) : (
                      <Badge tone="muted">{t('audit.naShort')}</Badge>
                    )}
                  </div>
                  {fix && (s.issues.length > 0 || !s.available) ? (
                    <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => onGo(fix)}>
                      {t('audit.fix')}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3">
                  {s.available ? (
                    <IssueList issues={s.issues} empty={t('audit.noIssues')} />
                  ) : (
                    <NotAvailable section={s} />
                  )}
                </div>
              </section>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}

function SectionBar({ section: s }: { section: CardAuditSection }) {
  const t = useT(CARD_NS);
  const pct = s.max > 0 ? (Math.min(s.score, s.max) / s.max) * 100 : 0;
  return (
    <div className={cn(!s.available && 'opacity-60')}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className={s.available ? 'font-medium text-ink-soft' : 'text-muted'}>{t(`section.${s.id}`)}</span>
        <span className="tnum text-muted">
          {s.available ? `${Math.min(s.score, s.max)} / ${s.max}` : t('audit.naShort')}
        </span>
      </div>
      <ProgressBar value={s.available ? pct : 0} tone={s.available ? barTone(pct) : 'muted'} />
      {!s.available ? <p className="mt-1 text-2xs text-muted">{t(`audit.na.${s.id}`)}</p> : null}
    </div>
  );
}

/** Ma'lumot yo'q bo'lim: nima uchun ballga kirmagani va nima qilish kerakligi */
function NotAvailable({ section }: { section: CardAuditSection }) {
  const t = useT(CARD_NS);
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {t(`audit.na.${section.id}`)} {t('audit.naNote')}
      </span>
    </p>
  );
}

function CoverageRow({ label, n, total }: { label: string; n: number; total: number }) {
  const pct = total > 0 ? (n / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="tnum font-semibold text-ink">
          {n} / {total}
        </span>
      </div>
      <ProgressBar value={pct} tone={barTone(pct)} showLabel />
    </div>
  );
}
