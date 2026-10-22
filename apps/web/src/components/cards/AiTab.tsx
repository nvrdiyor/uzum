import { useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  buildCardPrompt,
  CARD_LANGS,
  CARD_LIMITS,
  findCardStopWords,
  findNewNumbers,
  parseCardAnswer,
  stripCardHtml,
  type CardAuditResult,
  type CardDetailResponse,
  type CardDraftDto,
  type CardLang,
  type ParsedCardText,
} from '@savdoiq/shared';
import { Bot, ChevronDown, ChevronUp, Copy, ExternalLink, Save, Sparkles, Trash2, Wand2 } from '@/components/icons';
import { Badge, Button, Card, CardBody, CardHeader, Segmented, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  activeKeywords,
  auditFor,
  CARD_NS,
  charLen,
  copyText,
  CopyTextButtons,
  errorText,
  Hint,
  HtmlPreview,
  IssueList,
  LangTag,
  overlayLang,
  ScoreShift,
  sourceText,
  useCardCache,
  useInvalidateCard,
  type CardTexts,
} from './shared';

type LangChoice = 'both' | 'ru' | 'uz';

/** Bepul chatbotlar — ro'yxatdan o'tgan bepul akkaunt yetarli */
const CHATBOTS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
  { name: 'Claude', url: 'https://claude.ai' },
] as const;

interface DraftPayload {
  lang: CardLang;
  title: string;
  descriptionHtml: string;
  usp: string[];
  source: 'ai_chat';
  scoreBefore: number;
  scoreAfter: number;
}

/**
 * Bepul AI yordamchi. Pullik API yo'q: SavdoIQ so'rov yozadi, sotuvchi uni
 * ChatGPT / Gemini / Claude.ai ga qo'yadi va javobni shu yerga qaytaradi.
 * Javob o'qiladi, HTML tozalanadi, ball qayta hisoblanadi va AI qo'shib
 * yuborgan bo'lishi mumkin bo'lgan sonlar ko'rsatiladi.
 */
export function AiTab({
  detail,
  texts,
  audit,
  canEdit,
  onSaved,
}: {
  detail: CardDetailResponse;
  texts: CardTexts;
  audit: CardAuditResult;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const t = useT(CARD_NS);
  const id = detail.product.id;
  const invalidate = useInvalidateCard(id);
  const patchCache = useCardCache(id);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [choice, setChoice] = useState<LangChoice>('both');
  const [showPrompt, setShowPrompt] = useState(false);
  const [answer, setAnswer] = useState('');

  const langs: CardLang[] = choice === 'both' ? [...CARD_LANGS] : [choice];

  const prompt = useMemo(
    () =>
      buildCardPrompt({
        langs: choice === 'both' ? [...CARD_LANGS] : [choice],
        category: detail.auditContext.category ?? detail.product.category,
        titles: texts.titles,
        descriptions: texts.descriptions,
        facts: detail.product.skuTitles,
        keywords: activeKeywords(detail),
        reviewPros: detail.reviews.pros,
        reviewCons: detail.reviews.cons,
      }),
    [choice, detail, texts],
  );

  const parsed = useMemo(() => (answer.trim() ? parseCardAnswer(answer) : null), [answer]);
  const parseFailed = answer.trim().length > 0 && parsed === null;
  const parsedLangs = CARD_LANGS.filter((l) => parsed?.[l]);
  const missingLangs = parsed ? langs.filter((l) => !parsed[l]) : [];

  const source = useMemo(() => sourceText(detail, texts), [detail, texts]);
  const allowedPhrases = useMemo(
    () => [detail.auditContext.category ?? '', ...activeKeywords(detail).map((k) => k.text)],
    [detail],
  );

  /**
   * "Qo'yilsa" ballari: har til alohida (faqat shu tilning matni
   * almashtiriladi) va javobda ikkala til bo'lsa — ikkalasi birga.
   */
  const after = useMemo(() => {
    const byLang: Partial<Record<CardLang, CardAuditResult>> = {};
    let all = texts;
    let count = 0;
    for (const lang of CARD_LANGS) {
      const d = parsed?.[lang];
      if (!d) continue;
      byLang[lang] = auditFor(detail, overlayLang(texts, lang, d.title, d.descriptionHtml));
      all = overlayLang(all, lang, d.title, d.descriptionHtml);
      count += 1;
    }
    return { byLang, combined: count > 1 ? auditFor(detail, all).score : null };
  }, [parsed, detail, texts]);
  const afterByLang = after.byLang;
  const combined = after.combined;

  const copyPrompt = async () => {
    const ok = await copyText(prompt);
    if (ok) {
      toast.success(t('ai.copied'), t('ai.copiedBody'));
      return;
    }
    // Nusxalab bo'lmadi — so'rov ochiladi va belgilanadi, sotuvchi Ctrl+C bosadi
    toast.error(t('ai.copyErr'), t('ai.copyErrBody'));
    setShowPrompt(true);
    window.setTimeout(() => {
      promptRef.current?.focus();
      promptRef.current?.select();
    }, 60);
  };

  const save = useMutation({
    mutationFn: async (items: DraftPayload[]) => {
      // Har til — alohida qoralama; ketma-ket yuboriladi
      const out: CardDraftDto[] = [];
      for (const item of items) out.push(await api.post<CardDraftDto>(`/cards/${id}/drafts`, item));
      return out;
    },
    onSuccess: (res) => {
      // "Qoralamalar" bo'limi qayta yuklash tugashini kutmasdan yangi qoralamalarni ko'rsatadi
      const fresh = res.filter((d) => d && d.id);
      if (fresh.length) {
        const ids = new Set(fresh.map((d) => d.id));
        patchCache((d) => ({ ...d, drafts: [...fresh, ...d.drafts.filter((x) => !ids.has(x.id))] }));
      }
      toast.success(t('ai.saved', { n: res.length }), t('ai.savedBody'));
      setAnswer('');
      onSaved();
    },
    onError: (err) => toast.error(t('ai.saveErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const saveDrafts = () => {
    if (!parsed) return;
    const items: DraftPayload[] = [];
    for (const lang of parsedLangs) {
      const d = parsed[lang];
      if (!d) continue;
      items.push({
        lang,
        // Javobda nom yoki tavsif bo'lmasa — joriy matn qoladi
        title: d.title || texts.titles[lang] || '',
        descriptionHtml: d.descriptionHtml || texts.descriptions[lang] || '',
        usp: d.usp,
        source: 'ai_chat',
        scoreBefore: audit.score,
        scoreAfter: afterByLang[lang]?.score ?? audit.score,
      });
    }
    if (items.length) save.mutate(items);
  };

  const noDescription = CARD_LANGS.every((l) => !texts.descriptions[l]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={<Bot />} title={t('ai.title')} subtitle={t('ai.subtitle')} />
        <CardBody className="space-y-5">
          <ol className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
                <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand-ink">
                  {n}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{t(`ai.step${n}.title`)}</p>
                  <p className="mt-0.5 text-xs text-muted">{t(`ai.step${n}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>

          {noDescription ? <Hint tone="warn">{t('ai.thin')}</Hint> : null}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="label">{t('ai.langs')}</span>
              <Segmented<LangChoice>
                value={choice}
                onChange={setChoice}
                options={[
                  { value: 'both', label: t('ai.lang.both') },
                  { value: 'ru', label: t('ai.lang.ru') },
                  { value: 'uz', label: t('ai.lang.uz') },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={showPrompt ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                onClick={() => setShowPrompt((v) => !v)}
                aria-expanded={showPrompt}
              >
                {showPrompt ? t('ai.hide') : t('ai.show')}
              </Button>
              <Button icon={<Copy className="h-4 w-4" />} onClick={() => void copyPrompt()}>
                {t('ai.copy')}
              </Button>
            </div>
          </div>

          {showPrompt ? (
            <div>
              <textarea
                ref={promptRef}
                readOnly
                rows={12}
                value={prompt}
                aria-label={t('ai.promptLabel')}
                onFocus={(e) => e.currentTarget.select()}
                className="input resize-y font-mono text-xs leading-5"
              />
              <p className="tnum mt-1 text-right text-2xs text-muted">{t('ai.promptChars', { n: prompt.length })}</p>
            </div>
          ) : null}

          <div>
            <span className="label">{t('ai.open')}</span>
            <div className="flex flex-wrap gap-2">
              {CHATBOTS.map((b) => (
                <a
                  key={b.name}
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {b.name}
                </a>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('ai.privacy')}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Wand2 />}
          title={t('ai.answer')}
          subtitle={t('ai.answerHint')}
          actions={
            answer ? (
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setAnswer('')}>
                {t('ai.clear')}
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          <textarea
            rows={8}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={t('ai.answerPlaceholder')}
            aria-label={t('ai.answer')}
            className={cn('input resize-y font-mono text-xs leading-5', parseFailed && 'border-danger/60 focus:border-danger/60')}
          />
          {parseFailed ? (
            <div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger-ink">
              <p className="font-semibold">{t('ai.parseErr')}</p>
              <p className="mt-0.5">{t('ai.parseErrHint')}</p>
            </div>
          ) : null}
          {missingLangs.length > 0 ? (
            <Hint tone="warn">{t('ai.missingLang', { lang: missingLangs.map((l) => l.toUpperCase()).join(', ') })}</Hint>
          ) : null}
        </CardBody>
      </Card>

      {parsed && parsedLangs.length > 0 ? (
        <>
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                {parsedLangs.map((lang) => (
                  <div key={lang}>
                    <p className="eyebrow">{t('ai.scoreIf', { lang: lang.toUpperCase() })}</p>
                    <ScoreShift before={audit.score} after={afterByLang[lang]?.score ?? audit.score} />
                  </div>
                ))}
                {combined !== null ? (
                  <div>
                    <p className="eyebrow">{t('ai.both')}</p>
                    <ScoreShift before={audit.score} after={combined} />
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={saveDrafts}>
                  {t('ai.save')}
                </Button>
              ) : null}
            </CardBody>
          </Card>

          <div className={cn('grid gap-4', parsedLangs.length > 1 && 'xl:grid-cols-2')}>
            {parsedLangs.map((lang) => {
              const d = parsed[lang];
              const after = afterByLang[lang];
              if (!d || !after) return null;
              return (
                <DraftResult
                  key={lang}
                  lang={lang}
                  draft={d}
                  before={audit.score}
                  after={after}
                  source={source}
                  allowed={allowedPhrases}
                />
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Bitta til natijasi: nom, USP, tavsif, ball va ogohlantirishlar */
function DraftResult({
  lang,
  draft,
  before,
  after,
  source,
  allowed,
}: {
  lang: CardLang;
  draft: ParsedCardText;
  before: number;
  after: CardAuditResult;
  source: string;
  /** Kategoriya va faol kalit so'zlar — auditdagi kabi stop-so'z istisnosi */
  allowed: string[];
}) {
  const t = useT(CARD_NS);
  const titleLen = charLen(draft.title);
  const titleOver = titleLen > CARD_LIMITS.titleMaxRecommended;

  const newNumbers = useMemo(
    () => findNewNumbers([draft.title, draft.descriptionHtml, ...draft.usp].join('\n'), source),
    [draft, source],
  );
  const stops = useMemo(
    () => [
      ...new Set([
        ...findCardStopWords(draft.title, lang, allowed),
        ...findCardStopWords(stripCardHtml(draft.descriptionHtml), lang, allowed),
        ...findCardStopWords(draft.usp.join('\n'), lang, allowed),
      ]),
    ],
    [draft, lang, allowed],
  );
  /** Qoralama qo'yilgandan keyin ham qoladigan kamchiliklar (shu til + kalit so'zlar) */
  const remaining = useMemo(
    () =>
      after.sections
        .filter((s) => s.available)
        .flatMap((s) =>
          s.id === 'keywords'
            ? s.issues.filter((i) => i.level !== 'info')
            : s.id === 'title' || s.id === 'description'
              ? s.issues.filter((i) => i.lang === lang)
              : [],
        ),
    [after, lang],
  );

  const warnings = newNumbers.length > 0 || stops.length > 0 || titleOver;

  return (
    <Card>
      <CardHeader
        icon={<Sparkles />}
        title={
          <span className="inline-flex items-center gap-2">
            {t('ai.result')}
            <LangTag lang={lang} />
          </span>
        }
        actions={<ScoreShift before={before} after={after.score} />}
      />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="eyebrow-lg">{t('ai.newTitle')}</span>
            <span className={cn('tnum text-xs', titleOver ? 'font-semibold text-danger' : 'text-muted')}>
              {t('content.titleCounter', { n: titleLen, max: CARD_LIMITS.titleMaxRecommended })}
            </span>
          </div>
          <p className={cn('break-words rounded-xl border border-line bg-surface-2 p-3 text-sm font-semibold', draft.title ? 'text-ink' : 'text-muted')}>
            {draft.title || t('ai.noTitle')}
          </p>
        </div>

        {draft.usp.length > 0 ? (
          <div>
            <span className="eyebrow-lg">{t('ai.usp')}</span>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {draft.usp.map((u, i) => (
                <li key={`${i}-${u}`}>
                  <Badge tone="brand">{u}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <span className="eyebrow-lg">{t('ai.desc')}</span>
          <div className="mt-1.5 max-h-[360px] overflow-y-auto rounded-xl border border-line bg-surface-2 p-3">
            <HtmlPreview html={draft.descriptionHtml} empty={t('ai.noDesc')} />
          </div>
        </div>

        {warnings ? (
          <div className="space-y-2">
            {newNumbers.length > 0 ? <Hint tone="warn">{t('ai.warnNumbers', { list: newNumbers.join(', ') })}</Hint> : null}
            {stops.length > 0 ? <Hint tone="warn">{t('ai.warnStop', { list: stops.join(', ') })}</Hint> : null}
            {titleOver ? (
              <Hint tone="warn">{t('ai.warnLong', { n: titleLen, max: CARD_LIMITS.titleMaxRecommended })}</Hint>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-brand-ink">{t('ai.noWarnings')}</p>
        )}

        {remaining.length > 0 ? (
          <div>
            <span className="eyebrow-lg">{t('ai.remaining')}</span>
            <IssueList issues={remaining} className="mt-1.5" />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <CopyTextButtons title={draft.title} descriptionHtml={draft.descriptionHtml} />
        </div>
      </CardBody>
    </Card>
  );
}
