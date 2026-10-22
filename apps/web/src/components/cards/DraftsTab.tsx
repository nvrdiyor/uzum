import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CardDetailResponse, CardDraftDto } from '@savdoiq/shared';
import { BadgeCheck, Bot, ChevronDown, ChevronUp, ExternalLink, NotebookPen, Trash2 } from '@/components/icons';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, IconButton, Modal, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import {
  CARD_NS,
  CopyTextButtons,
  errorText,
  Hint,
  HtmlPreview,
  LangTag,
  ScoreShift,
  useCardCache,
  useInvalidateCard,
} from './shared';

/** Uzum sotuvchi kabineti — matn faqat shu yerda o'zgartiriladi (API yozish imkonini bermaydi) */
const UZUM_CABINET_URL = 'https://seller.uzum.uz';

/**
 * Qoralamalar: AI yoki qo'lda tayyorlangan matnlar. Uzum'ga avtomatik
 * yozilmaydi — sotuvchi kabinetga o'zi qo'yadi va shu yerda belgilaydi.
 * Belgilangan kundan boshlab sotuvga ta'siri kuzatiladi.
 */
export function DraftsTab({
  detail,
  canEdit,
  onOpenAi,
}: {
  detail: CardDetailResponse;
  canEdit: boolean;
  onOpenAi: () => void;
}) {
  const t = useT(CARD_NS);
  const id = detail.product.id;
  const invalidate = useInvalidateCard(id);
  const patchCache = useCardCache(id);

  const [applyTarget, setApplyTarget] = useState<CardDraftDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CardDraftDto | null>(null);

  const drafts = useMemo(
    () => [...detail.drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [detail.drafts],
  );

  const apply = useMutation({
    mutationFn: (draftId: string) => api.post<{ ok: true }>(`/cards/${id}/drafts/${draftId}/apply`),
    onSuccess: () => {
      toast.success(t('dr.applied'), t('dr.appliedBody'));
      setApplyTarget(null);
    },
    onError: (err) => toast.error(t('dr.applyErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const remove = useMutation({
    mutationFn: (draftId: string) => api.del<{ ok: true }>(`/cards/${id}/drafts/${draftId}`),
    onSuccess: (_res, draftId) => {
      patchCache((d) => ({ ...d, drafts: d.drafts.filter((x) => x.id !== draftId) }));
      toast.success(t('dr.deleted'));
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(t('dr.delErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<NotebookPen className="h-6 w-6" />}
          title={t('dr.empty')}
          hint={t('dr.emptyHint')}
          action={
            <Button icon={<Bot className="h-4 w-4" />} onClick={onOpenAi}>
              {t('dr.toAi')}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader icon={<NotebookPen />} title={t('dr.title')} subtitle={t('dr.subtitle')} />
        <CardBody className="space-y-4">
          <Hint>{t('dr.steps')}</Hint>
          <ul className="space-y-3">
            {drafts.map((d) => (
              <DraftItem
                key={d.id}
                draft={d}
                canEdit={canEdit}
                onApply={() => setApplyTarget(d)}
                onDelete={() => setDeleteTarget(d)}
              />
            ))}
          </ul>
        </CardBody>
      </Card>

      <Modal
        open={applyTarget !== null}
        onClose={() => setApplyTarget(null)}
        size="sm"
        title={t('dr.applyTitle')}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setApplyTarget(null)}>
              {t('btn.cancel')}
            </Button>
            <Button
              icon={<BadgeCheck className="h-4 w-4" />}
              loading={apply.isPending}
              onClick={() => applyTarget && apply.mutate(applyTarget.id)}
            >
              {t('dr.applyConfirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-ink-soft">
          <p>{t('dr.applyBody', { lang: (applyTarget?.lang ?? '').toUpperCase() })}</p>
          <p className="text-xs text-muted">{t('dr.applyNote')}</p>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title={t('dr.deleteTitle')}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('btn.cancel')}
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              loading={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              {t('btn.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          {deleteTarget?.status === 'applied' ? t('dr.deleteBodyApplied') : t('dr.deleteBody')}
        </p>
      </Modal>
    </>
  );
}

function DraftItem({
  draft: d,
  canEdit,
  onApply,
  onDelete,
}: {
  draft: CardDraftDto;
  canEdit: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <LangTag lang={d.lang} />
          <Badge tone={d.status === 'applied' ? 'brand' : 'warn'} dot>
            {t(`dr.status.${d.status}`)}
          </Badge>
          <Badge tone={d.source === 'ai_chat' ? 'violet' : 'muted'}>{t(`dr.source.${d.source}`)}</Badge>
          <span className="tnum text-xs text-muted">{f.dateTime(d.createdAt)}</span>
        </div>
        {d.scoreBefore !== null && d.scoreAfter !== null ? (
          <span className="flex items-center gap-2">
            <span className="eyebrow">{t('dr.score')}</span>
            <ScoreShift before={d.scoreBefore} after={d.scoreAfter} />
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 break-words text-sm font-semibold text-ink">{d.title || '—'}</p>

      {d.usp.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {d.usp.map((u, i) => (
            <li key={`${i}-${u}`}>
              <Badge tone="muted">{u}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {d.status === 'applied' && d.appliedAt ? (
        <p className="mt-2 text-xs text-brand-ink">{t('dr.appliedAt', { date: f.date(d.appliedAt) })}</p>
      ) : null}

      {d.descriptionHtml.trim() ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="focusable inline-flex items-center gap-1 rounded-md text-xs font-semibold text-muted hover:text-ink"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? t('dr.hideDesc') : t('dr.showDesc')}
          </button>
          {open ? (
            <div className="mt-2 max-h-[360px] overflow-y-auto rounded-xl border border-line bg-surface-2 p-3">
              <HtmlPreview html={d.descriptionHtml} empty="—" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <CopyTextButtons title={d.title} descriptionHtml={d.descriptionHtml} />
        <a
          href={UZUM_CABINET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline gap-1.5 rounded-lg px-3 py-1.5 text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('dr.openCabinet')}
        </a>
        {canEdit ? (
          <span className="ml-auto flex items-center gap-2">
            {d.status === 'draft' ? (
              <Button size="sm" icon={<BadgeCheck className="h-3.5 w-3.5" />} onClick={onApply}>
                {t('dr.apply')}
              </Button>
            ) : null}
            <IconButton label={t('dr.delete')} onClick={onDelete} className="h-8 w-8 hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </span>
        ) : null}
      </div>
    </li>
  );
}
