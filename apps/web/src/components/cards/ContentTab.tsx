import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CARD_LANGS,
  CARD_LIMITS,
  cleanCardDescription,
  cleanCardTitle,
  detectCardLang,
  stripCardHtml,
  type CardAuditResult,
  type CardContentDto,
  type CardDetailResponse,
  type CardLang,
} from '@savdoiq/shared';
import { Check, Eye, FileText, Save, Undo2 } from '@/components/icons';
import { Badge, Button, Card, CardBody, CardHeader, Input, Segmented, toast, type Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  auditFor,
  CARD_NS,
  charLen,
  errorText,
  Hint,
  HtmlPreview,
  replaceLang,
  ScoreShift,
  useCardCache,
  useInvalidateCard,
  type CardTexts,
  type ContentEdits,
} from './shared';

const SOURCE_TONE: Record<CardContentDto['source'] | 'none', Tone> = {
  seller_api: 'info',
  manual: 'brand',
  draft: 'violet',
  none: 'muted',
};

/**
 * "Matn" bo'limi: RU/UZ nom va tavsif. Seller API faqat bitta tildagi nomni
 * beradi — tavsifni sotuvchi Uzum kabinetidan nusxalab joylaydi.
 * Tahrir holati sahifada saqlanadi: bo'lim yoki til almashtirilsa yozilgan
 * matn yo'qolmaydi.
 */
export function ContentTab({
  detail,
  texts,
  audit,
  canEdit,
  edits,
  onEdit,
}: {
  detail: CardDetailResponse;
  texts: CardTexts;
  audit: CardAuditResult;
  canEdit: boolean;
  edits: ContentEdits;
  onEdit: (lang: CardLang, value: { title: string; descriptionHtml: string } | null) => void;
}) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const invalidate = useInvalidateCard(detail.product.id);
  const patchCache = useCardCache(detail.product.id);

  const [lang, setLang] = useState<CardLang>(() => {
    // Birinchi bo'lib matni bor til ochiladi (odatda Seller API bergan nom)
    const withText = CARD_LANGS.find((l) => detail.contents.some((c) => c.lang === l && c.title.trim()));
    return withText ?? 'ru';
  });

  const content = detail.contents.find((c) => c.lang === lang) ?? null;
  const saved = { title: content?.title ?? '', descriptionHtml: content?.descriptionHtml ?? '' };
  const value = edits[lang] ?? saved;
  const dirty = value.title !== saved.title || value.descriptionHtml !== saved.descriptionHtml;

  const set = (patch: Partial<typeof value>) => {
    const next = { ...value, ...patch };
    // Saqlangan matnga qaytgan bo'lsa — "o'zgarish" ham yo'q
    onEdit(lang, next.title === saved.title && next.descriptionHtml === saved.descriptionHtml ? null : next);
  };

  /**
   * "Saqlansa" bali — server saqlaydigan matn bo'yicha: o'sha tozalash
   * (cleanCardTitle/cleanCardDescription) va o'sha qoida — API tilida nom bo'sh
   * bo'lsa Seller API nomi qoladi. Aks holda saqlangach ball boshqacha chiqardi.
   */
  const after = useMemo(() => {
    const productTitle = detail.product.title;
    const cleanTitle = cleanCardTitle(value.title);
    const title = cleanTitle || lang !== detectCardLang(productTitle) ? cleanTitle : productTitle;
    return auditFor(detail, replaceLang(texts, lang, title, cleanCardDescription(value.descriptionHtml))).score;
  }, [detail, texts, lang, value.title, value.descriptionHtml]);

  const save = useMutation({
    mutationFn: (v: { lang: CardLang; title: string; descriptionHtml: string }) =>
      api.put<CardContentDto>(`/cards/${detail.product.id}/content/${v.lang}`, {
        title: v.title,
        descriptionHtml: v.descriptionHtml,
      }),
    onSuccess: (res, v) => {
      // Ikkala maydon bo'sh saqlansa server Seller API nomini (yoki bo'sh) qaytaradi
      patchCache((d) => ({
        ...d,
        contents: [
          ...d.contents.filter((c) => c.lang !== v.lang),
          ...(res && (res.title || res.descriptionHtml) ? [res] : []),
        ],
      }));
      toast.success(v.title || v.descriptionHtml ? t('content.saved') : t('content.cleared'));
      onEdit(v.lang, null);
    },
    onError: (err) => toast.error(t('content.saveErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const submit = () => {
    const title = value.title.replace(/\s+/g, ' ').trim();
    const descriptionHtml = value.descriptionHtml.trim();
    save.mutate({ lang, title, descriptionHtml });
  };

  const titleLen = charLen(value.title);
  const descLen = charLen(stripCardHtml(value.descriptionHtml));
  const titleOver = titleLen > CARD_LIMITS.titleMaxRecommended;
  const titleShort = titleLen > 0 && titleLen < CARD_LIMITS.titleMinRecommended;
  const sourceKey = content?.source ?? 'none';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<CardLang>
          value={lang}
          onChange={setLang}
          options={CARD_LANGS.map((l) => ({
            value: l,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {t(`lang.${l}Full`)}
                {edits[l] ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label={t('content.unsaved')} />
                ) : texts.titles[l] ? (
                  <Check className="h-3.5 w-3.5 text-brand" />
                ) : null}
              </span>
            ),
          }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SOURCE_TONE[sourceKey]}>{t(`content.source.${sourceKey}`)}</Badge>
          {content?.updatedAt ? (
            <span className="text-xs text-muted">{t('content.updated', { date: f.dateTime(content.updatedAt) })}</span>
          ) : null}
        </div>
      </div>

      <Hint>{t('content.hint')}</Hint>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<FileText />} title={t('content.title')} subtitle={t('content.subtitle')} />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <label htmlFor="card-title" className="eyebrow-lg">
                  {t('content.titleLabel', { lang: lang.toUpperCase() })}
                </label>
                <span
                  className={cn(
                    'tnum text-xs',
                    titleOver ? 'font-semibold text-danger' : titleShort ? 'text-warn-ink' : 'text-muted',
                  )}
                >
                  {t('content.titleCounter', { n: titleLen, max: CARD_LIMITS.titleMaxRecommended })}
                </span>
              </div>
              <Input
                id="card-title"
                value={value.title}
                readOnly={!canEdit || save.isPending}
                placeholder={t('content.titlePlaceholder')}
                onChange={(e) => set({ title: e.target.value })}
              />
              {titleShort ? (
                <p className="mt-1 text-xs text-warn-ink">
                  {t('content.titleShortHint', { min: CARD_LIMITS.titleMinRecommended })}
                </p>
              ) : null}
            </div>

            <div>
              <div className="mb-1.5 flex items-end justify-between gap-3">
                <label htmlFor="card-desc" className="eyebrow-lg">
                  {t('content.descLabel')}
                </label>
                <span
                  className={cn(
                    'tnum text-xs',
                    descLen > 0 && descLen < CARD_LIMITS.descriptionMinChars ? 'text-warn-ink' : 'text-muted',
                  )}
                >
                  {t('content.descCounter', { n: f.num(descLen), min: CARD_LIMITS.descriptionMinChars })}
                </span>
              </div>
              <textarea
                id="card-desc"
                rows={12}
                value={value.descriptionHtml}
                readOnly={!canEdit || save.isPending}
                placeholder={t('content.descPlaceholder')}
                onChange={(e) => set({ descriptionHtml: e.target.value })}
                className="input min-h-[220px] resize-y leading-6"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="eyebrow">{t('content.liveScore')}</p>
                <ScoreShift before={audit.score} after={after} />
              </div>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  {dirty ? (
                    <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => onEdit(lang, null)}>
                      {t('content.reset')}
                    </Button>
                  ) : null}
                  <Button icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={submit}>
                    {t('content.save')}
                  </Button>
                </div>
              ) : null}
            </div>
            {canEdit ? (
              <p className="text-xs text-muted">{t('content.clearNote')}</p>
            ) : (
              <p className="text-xs text-muted">{t('content.readOnly')}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Eye />} title={t('content.preview')} subtitle={t('content.previewHint')} />
          <CardBody className="space-y-3">
            <p className={cn('break-words text-base font-semibold', value.title.trim() ? 'text-ink' : 'text-muted')}>
              {value.title.trim() || t('content.noTitle')}
            </p>
            <div className="hairline pt-3">
              <HtmlPreview html={value.descriptionHtml} empty={t('content.previewEmpty')} />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
