import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  MessageSquare,
  MessageSquareOff,
  MessageSquareReply,
  Sparkles,
  Star,
  ThumbsUp,
  Wand2,
} from 'lucide-react';
import type { ReviewRow, ReviewsResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProgressBar,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useFeature } from '@/store/session';
import { cn } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('reviews', {
  uz: {
    title: 'Sharhlar',
    subtitle: 'Mijoz fikrlariga tez javob bering — reyting va konversiya shundan o‘sadi',

    'kpi.count': 'Sharhlar',
    'kpi.countHint': 'Tanlangan davr bo‘yicha',
    'kpi.rating': 'O‘rtacha reyting',
    'kpi.ratingHint': '5 balli tizimda',
    'kpi.answered': 'Javob berilgan',
    'kpi.answeredHint': 'Javob yozilgan sharhlar',
    'kpi.unanswered': 'Javobsiz',
    'kpi.unansweredHint': 'Javob kutayotgan sharhlar',

    'dist.title': 'Reyting taqsimoti',
    'dist.subtitle': 'Qaysi baho qanchalik tez-tez uchraydi',
    'dist.stars': '{n} yulduz',
    'dist.empty': 'Taqsimot uchun ma’lumot yo‘q',

    'filter.all': 'Barchasi',
    'filter.unanswered': 'Javobsiz',
    'filter.negative': 'Salbiy',

    'card.anonymous': 'Ismsiz mijoz',
    'card.noText': 'Matnsiz baho',
    'card.noProduct': 'Mahsulot ko‘rsatilmagan',
    'card.answer': 'Sizning javobingiz',
    'card.auto': 'Avto-javob',
    'card.reply': 'Javob yozish',
    'card.edit': 'Javobni tahrirlash',

    'btn.templates': 'Shablonlar',
    'btn.autoReply': 'Barcha javobsizlarga javob berish',
    'readonly.title': 'Javoblar Uzum kabinetida yoziladi',
    'readonly.body':
      'Uzum API sharhga javob yozishga ruxsat bermaydi. Javobni kabinetda yozing — u keyingi sinxronda shu yerda ham ko‘rinadi. Matnni shablonlardan nusxalab olishingiz mumkin.',
    'readonly.open': 'Uzum kabinetini ochish',
    'card.replyInUzum': 'Uzum’da javob berish',

    'reply.title': 'Sharhga javob',
    'reply.subtitle': 'Shablondan boshlang yoki o‘zingiz yozing',
    'reply.templates': 'Shablonlar',
    'reply.useTemplate': '{n} yulduz shabloni',
    'reply.noTemplates': 'Shablonlar hali to‘ldirilmagan',
    'reply.text': 'Javob matni',
    'reply.placeholder': 'Sharh uchun rahmat! ...',
    'reply.send': 'Javobni yuborish',
    'reply.ok': 'Javob yuborildi',
    'reply.err': 'Javobni yuborib bo‘lmadi',
    'reply.short': 'Javob juda qisqa',

    'tpl.title': 'Javob shablonlari',
    'tpl.subtitle': 'Har bir baho uchun bitta matn — avto-javob shulardan foydalanadi',
    'tpl.stars': '{n} yulduzli sharh uchun',
    'tpl.placeholders': 'O‘rin egallari: {name} — mijoz ismi, {product} — mahsulot nomi. Javob yuborilganda ular avtomatik almashtiriladi.',
    'tpl.save': 'Shablonlarni saqlash',
    'tpl.ok': 'Shablonlar saqlandi',
    'tpl.err': 'Shablonlarni saqlab bo‘lmadi',
    'tpl.placeholder': 'Masalan: {name}, sharhingiz uchun rahmat! {product} sizga yoqqanidan xursandmiz.',

    'auto.title': 'Avto-javob',
    'auto.body': '{n} ta javobsiz sharhga shablonlar asosida javob yoziladi. Davom etamizmi?',
    'auto.warn': 'Shablonlar to‘ldirilmagan bo‘lsa, avval ularni yozib chiqing.',
    'auto.confirm': 'Ha, javob bersin',
    'auto.ok': 'Avto-javob ishga tushdi',
    'auto.okBody': 'Javoblar navbat bo‘yicha yuboriladi',
    'auto.err': 'Avto-javobni ishga tushirib bo‘lmadi',
    'auto.none': 'Javobsiz sharh yo‘q',

    'empty.title': 'Sharh topilmadi',
    'empty.hint': 'Filtrni o‘zgartiring yoki boshqa davrni tanlang',
    'empty.none': 'Hali sharhlar yo‘q',
    'empty.noneHint': 'Sinxronizatsiya tugagach, mijoz sharhlari shu yerda ko‘rinadi',

    'pager.count': '{n} ta sharh',
  },
  ru: {
    title: 'Отзывы',
    subtitle: 'Отвечайте на отзывы быстро — от этого растут рейтинг и конверсия',

    'kpi.count': 'Отзывов',
    'kpi.countHint': 'За выбранный период',
    'kpi.rating': 'Средний рейтинг',
    'kpi.ratingHint': 'По 5-балльной шкале',
    'kpi.answered': 'Отвечено',
    'kpi.answeredHint': 'Отзывы с ответом',
    'kpi.unanswered': 'Без ответа',
    'kpi.unansweredHint': 'Отзывы ждут ответа',

    'dist.title': 'Распределение рейтинга',
    'dist.subtitle': 'Как часто встречается каждая оценка',
    'dist.stars': '{n} звёзд',
    'dist.empty': 'Нет данных для распределения',

    'filter.all': 'Все',
    'filter.unanswered': 'Без ответа',
    'filter.negative': 'Негативные',

    'card.anonymous': 'Аноним',
    'card.noText': 'Оценка без текста',
    'card.noProduct': 'Товар не указан',
    'card.answer': 'Ваш ответ',
    'card.auto': 'Авто-ответ',
    'card.reply': 'Ответить',
    'card.edit': 'Изменить ответ',

    'btn.templates': 'Шаблоны',
    'btn.autoReply': 'Ответить на все без ответа',
    'readonly.title': 'Ответы пишутся в кабинете Uzum',
    'readonly.body':
      'API Uzum не позволяет отвечать на отзывы. Напишите ответ в кабинете — при следующей синхронизации он появится и здесь. Текст можно скопировать из шаблонов.',
    'readonly.open': 'Открыть кабинет Uzum',
    'card.replyInUzum': 'Ответить в Uzum',

    'reply.title': 'Ответ на отзыв',
    'reply.subtitle': 'Начните с шаблона или напишите сами',
    'reply.templates': 'Шаблоны',
    'reply.useTemplate': 'Шаблон на {n} звёзд',
    'reply.noTemplates': 'Шаблоны ещё не заполнены',
    'reply.text': 'Текст ответа',
    'reply.placeholder': 'Спасибо за отзыв! ...',
    'reply.send': 'Отправить ответ',
    'reply.ok': 'Ответ отправлен',
    'reply.err': 'Не удалось отправить ответ',
    'reply.short': 'Ответ слишком короткий',

    'tpl.title': 'Шаблоны ответов',
    'tpl.subtitle': 'По одному тексту на каждую оценку — их использует авто-ответ',
    'tpl.stars': 'Для отзыва на {n} звёзд',
    'tpl.placeholders': 'Плейсхолдеры: {name} — имя покупателя, {product} — название товара. При отправке они подставляются автоматически.',
    'tpl.save': 'Сохранить шаблоны',
    'tpl.ok': 'Шаблоны сохранены',
    'tpl.err': 'Не удалось сохранить шаблоны',
    'tpl.placeholder': 'Например: {name}, спасибо за отзыв! Рады, что {product} вам понравился.',

    'auto.title': 'Авто-ответ',
    'auto.body': 'Ответы по шаблонам будут отправлены на {n} отзывов без ответа. Продолжить?',
    'auto.warn': 'Если шаблоны не заполнены, сначала напишите их.',
    'auto.confirm': 'Да, ответить',
    'auto.ok': 'Авто-ответ запущен',
    'auto.okBody': 'Ответы отправляются по очереди',
    'auto.err': 'Не удалось запустить авто-ответ',
    'auto.none': 'Нет отзывов без ответа',

    'empty.title': 'Отзывы не найдены',
    'empty.hint': 'Измените фильтр или выберите другой период',
    'empty.none': 'Отзывов пока нет',
    'empty.noneHint': 'Отзывы покупателей появятся здесь после синхронизации',

    'pager.count': '{n} отзывов',
  },
  en: {
    title: 'Reviews',
    subtitle: 'Answer customers quickly — your rating and conversion grow with it',

    'kpi.count': 'Reviews',
    'kpi.countHint': 'For the selected period',
    'kpi.rating': 'Average rating',
    'kpi.ratingHint': 'On a 5-point scale',
    'kpi.answered': 'Answered',
    'kpi.answeredHint': 'Reviews with a reply',
    'kpi.unanswered': 'Unanswered',
    'kpi.unansweredHint': 'Reviews waiting for a reply',

    'dist.title': 'Rating distribution',
    'dist.subtitle': 'How often each score appears',
    'dist.stars': '{n} stars',
    'dist.empty': 'No data for the distribution',

    'filter.all': 'All',
    'filter.unanswered': 'Unanswered',
    'filter.negative': 'Negative',

    'card.anonymous': 'Anonymous',
    'card.noText': 'Rating without text',
    'card.noProduct': 'No product specified',
    'card.answer': 'Your reply',
    'card.auto': 'Auto reply',
    'card.reply': 'Write a reply',
    'card.edit': 'Edit the reply',

    'btn.templates': 'Templates',
    'btn.autoReply': 'Reply to everything unanswered',
    'readonly.title': 'Replies are written in the Uzum cabinet',
    'readonly.body':
      'The Uzum API does not allow replying to reviews. Write the reply in the cabinet — it shows up here after the next sync. You can copy the text from your templates.',
    'readonly.open': 'Open the Uzum cabinet',
    'card.replyInUzum': 'Reply on Uzum',

    'reply.title': 'Reply to the review',
    'reply.subtitle': 'Start from a template or write your own',
    'reply.templates': 'Templates',
    'reply.useTemplate': '{n}-star template',
    'reply.noTemplates': 'Templates are not filled in yet',
    'reply.text': 'Reply text',
    'reply.placeholder': 'Thank you for your review! ...',
    'reply.send': 'Send the reply',
    'reply.ok': 'Reply sent',
    'reply.err': 'Could not send the reply',
    'reply.short': 'The reply is too short',

    'tpl.title': 'Reply templates',
    'tpl.subtitle': 'One text per score — the auto reply uses exactly these',
    'tpl.stars': 'For a {n}-star review',
    'tpl.placeholders': 'Placeholders: {name} — the customer name, {product} — the product name. They are substituted automatically when the reply is sent.',
    'tpl.save': 'Save templates',
    'tpl.ok': 'Templates saved',
    'tpl.err': 'Could not save the templates',
    'tpl.placeholder': 'For example: {name}, thank you for your review! We are glad you liked {product}.',

    'auto.title': 'Auto reply',
    'auto.body': 'Template replies will be sent to {n} unanswered reviews. Continue?',
    'auto.warn': 'If the templates are empty, write them first.',
    'auto.confirm': 'Yes, reply',
    'auto.ok': 'Auto reply started',
    'auto.okBody': 'Replies are sent one after another',
    'auto.err': 'Could not start the auto reply',
    'auto.none': 'Nothing is unanswered',

    'empty.title': 'No reviews found',
    'empty.hint': 'Change the filter or pick another period',
    'empty.none': 'No reviews yet',
    'empty.noneHint': 'Customer reviews appear here once the sync finishes',

    'pager.count': '{n} reviews',
  },
});

const PAGE_SIZE = 12;
const RATINGS = [5, 4, 3, 2, 1];

type FilterKey = 'all' | 'unanswered' | 'negative';

interface ReviewTemplate {
  rating: number;
  text: string;
}

/** Shablonlar javobi massiv yoki konvert bo'lishi mumkin */
type TemplatesPayload = ReviewTemplate[] | { templates: ReviewTemplate[] };

function toTemplates(payload: TemplatesPayload | undefined): ReviewTemplate[] {
  const list = Array.isArray(payload) ? payload : (payload?.templates ?? []);
  return RATINGS.map((rating) => ({
    rating,
    text: list.find((x) => x.rating === rating)?.text ?? '',
  }));
}

/** {name} va {product} o'rin egallarini almashtirish */
function fillPlaceholders(text: string, review: ReviewRow, fallbackName: string, fallbackProduct: string): string {
  return text
    .replace(/\{name\}/g, review.author?.trim() || fallbackName)
    .replace(/\{product\}/g, review.productTitle?.trim() || fallbackProduct);
}

function ratingTone(rating: number): 'brand' | 'warn' | 'danger' {
  if (rating >= 4) return 'brand';
  if (rating === 3) return 'warn';
  return 'danger';
}

/** Yulduzchalar qatori */
function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/5`}>
      {RATINGS.slice()
        .reverse()
        .map((star) => (
          <Star
            key={star}
            style={{ width: size, height: size }}
            className={cn(star <= Math.round(value) ? 'fill-warn text-warn' : 'text-line')}
          />
        ))}
    </span>
  );
}

export default function Reviews() {
  const t = useT('reviews');
  const f = useFormat();
  const qc = useQueryClient();
  const q = usePeriodQuery();
  const access = useFeature('reviews_autoreply');

  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [replyTo, setReplyTo] = useState<ReviewRow | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  useEffect(() => setPage(1), [filter, q.from, q.to, q.storeId]);

  const query = useMemo(
    () => ({ ...q, filter, page, pageSize: PAGE_SIZE }),
    [q, filter, page],
  );

  const reviews = useQuery({
    queryKey: ['reviews', query],
    queryFn: () => api.get<ReviewsResponse>('/reviews', query),
    placeholderData: (prev) => prev,
  });

  const templates = useQuery({
    queryKey: ['review-templates'],
    queryFn: () => api.get<TemplatesPayload>('/reviews/templates'),
    staleTime: 5 * 60_000,
  });

  const templateList = useMemo(() => toTemplates(templates.data), [templates.data]);

  const data = reviews.data;
  const rows = data?.rows.items ?? [];
  const totals = data?.totals;

  const distribution = useMemo(() => {
    const map = new Map((data?.distribution ?? []).map((d) => [d.rating, d.count] as const));
    const total = (data?.distribution ?? []).reduce((s, d) => s + d.count, 0);
    return RATINGS.map((rating) => {
      const count = map.get(rating) ?? 0;
      return { rating, count, share: total > 0 ? (count / total) * 100 : 0 };
    });
  }, [data]);

  const distributionTotal = distribution.reduce((s, d) => s + d.count, 0);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['reviews'] });
  };

  const autoReply = useMutation({
    mutationFn: () => api.post<unknown>('/reviews/auto-reply', {}),
    onSuccess: () => {
      toast.success(t('auto.ok'), t('auto.okBody'));
      setAutoOpen(false);
      invalidate();
    },
    onError: (err: unknown) => toast.error(t('auto.err'), err instanceof Error ? err.message : undefined),
  });

  const filterOptions: { value: FilterKey; label: string; count?: number }[] = [
    { value: 'all', label: t('filter.all'), count: totals?.count },
    { value: 'unanswered', label: t('filter.unanswered'), count: totals?.unanswered },
    { value: 'negative', label: t('filter.negative') },
  ];

  const locked = access !== 'full';
  const unanswered = totals?.unanswered ?? 0;
  /** Jonli rejimda Uzum API javob yozishga ruxsat bermaydi */
  const canReply = data?.canReply ?? true;

  return (
    <>
      <PageHeader
        icon={<MessageSquare className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="reviews_autoreply" />}
        actions={
          <>
            <Button
              variant="outline"
              icon={<FileText className="h-4 w-4" />}
              disabled={locked}
              onClick={() => setTemplatesOpen(true)}
            >
              {t('btn.templates')}
            </Button>
            {canReply ? (
              <Button
                icon={<Wand2 className="h-4 w-4" />}
                disabled={locked || unanswered === 0}
                onClick={() => setAutoOpen(true)}
              >
                {t('btn.autoReply')}
              </Button>
            ) : (
              <a href={UZUM_CABINET_URL} target="_blank" rel="noreferrer" className="btn-primary">
                <ExternalLink className="h-4 w-4" />
                {t('readonly.open')}
              </a>
            )}
          </>
        }
      />

      <FilterBar />

      <PlanGate feature="reviews_autoreply">
        {reviews.isError ? (
          <Card>
            <ErrorState
              message={reviews.error instanceof Error ? reviews.error.message : undefined}
              onRetry={() => void reviews.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {!canReply ? (
              <Card className="flex items-start gap-3 border-info/25 bg-info/5 p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{t('readonly.title')}</p>
                  <p className="mt-0.5 text-sm text-muted">{t('readonly.body')}</p>
                </div>
              </Card>
            ) : null}

            {/* ── KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.count')}
                value={f.num(totals?.count ?? 0)}
                hint={t('kpi.countHint')}
                icon={<MessageSquare className="h-5 w-5" />}
                loading={reviews.isLoading}
              />
              <StatCard
                label={t('kpi.rating')}
                value={f.num(totals?.avgRating ?? 0, 2)}
                hint={t('kpi.ratingHint')}
                icon={<Star className="h-5 w-5" />}
                tone="warn"
                loading={reviews.isLoading}
                footer={<Stars value={totals?.avgRating ?? 0} size={16} />}
              />
              <StatCard
                label={t('kpi.answered')}
                value={f.num(totals?.answered ?? 0)}
                hint={t('kpi.answeredHint')}
                icon={<ThumbsUp className="h-5 w-5" />}
                tone="brand"
                loading={reviews.isLoading}
              />
              <StatCard
                label={t('kpi.unanswered')}
                value={f.num(unanswered)}
                hint={t('kpi.unansweredHint')}
                icon={<MessageSquareOff className="h-5 w-5" />}
                tone={unanswered > 0 ? 'danger' : 'brand'}
                loading={reviews.isLoading}
              />
            </StatGrid>

            {/* ── Reyting taqsimoti ── */}
            <Card>
              <CardHeader icon={<Star className="h-4 w-4" />} title={t('dist.title')} subtitle={t('dist.subtitle')} />
              <CardBody className="space-y-3">
                {reviews.isLoading ? (
                  <div className="space-y-3">
                    {RATINGS.map((r) => (
                      <Skeleton key={r} className="h-6 w-full" />
                    ))}
                  </div>
                ) : distributionTotal === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{t('dist.empty')}</p>
                ) : (
                  distribution.map((d) => (
                    <div key={d.rating} className="flex items-center gap-3">
                      <span className="flex w-16 shrink-0 items-center gap-1 text-sm font-semibold text-ink">
                        <span className="tnum">{d.rating}</span>
                        <Star className="h-3.5 w-3.5 fill-warn text-warn" />
                      </span>
                      <ProgressBar value={d.share} tone={ratingTone(d.rating)} className="flex-1" />
                      <span className="tnum w-14 shrink-0 text-right text-sm text-ink-soft">{f.num(d.count)}</span>
                      <span className="tnum w-14 shrink-0 text-right text-xs text-muted">{f.pct(d.share)}</span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            {/* ── Filtr ── */}
            <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
              <Segmented<FilterKey> value={filter} onChange={setFilter} options={filterOptions} />
            </div>

            {/* ── Sharhlar ── */}
            {reviews.isLoading ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="p-5">
                    <Skeleton className="h-10 w-2/3" />
                    <Skeleton className="mt-4 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-4/5" />
                    <Skeleton className="mt-4 h-9 w-32" />
                  </Card>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<MessageSquare className="h-6 w-6" />}
                  title={(totals?.count ?? 0) === 0 ? t('empty.none') : t('empty.title')}
                  hint={(totals?.count ?? 0) === 0 ? t('empty.noneHint') : t('empty.hint')}
                  action={
                    filter !== 'all' ? (
                      <Button variant="outline" onClick={() => setFilter('all')}>
                        {t('filter.all')}
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <div className={cn('space-y-4', reviews.isFetching && 'opacity-70 transition-opacity')}>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {rows.map((review) => (
                    <ReviewCard key={review.id} review={review} canReply={canReply} onReply={() => setReplyTo(review)} />
                  ))}
                </div>

                <Pager
                  page={data?.rows.page ?? 1}
                  pages={data?.rows.pages ?? 1}
                  label={t('pager.count', { n: f.num(data?.rows.total ?? 0) })}
                  onPage={setPage}
                />
              </div>
            )}
          </div>
        )}
      </PlanGate>

      {/* ── Javob yozish ── */}
      <ReplyModal
        review={replyTo}
        templates={templateList}
        onClose={() => setReplyTo(null)}
        onSent={invalidate}
      />

      {/* ── Shablonlar ── */}
      <TemplatesModal
        open={templatesOpen}
        initial={templateList}
        onClose={() => setTemplatesOpen(false)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ['review-templates'] })}
      />

      {/* ── Avto-javob tasdig'i ── */}
      <Modal
        open={autoOpen}
        onClose={() => setAutoOpen(false)}
        size="sm"
        title={t('auto.title')}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAutoOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button
              icon={<Wand2 className="h-4 w-4" />}
              loading={autoReply.isPending}
              onClick={() => autoReply.mutate()}
            >
              {t('auto.confirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">{t('auto.body', { n: unanswered })}</p>
        {templateList.every((x) => !x.text.trim()) ? (
          <p className="mt-3 rounded-xl border border-warn/25 bg-warn/10 p-3 text-xs text-warn-ink">{t('auto.warn')}</p>
        ) : null}
      </Modal>
    </>
  );
}

/** Uzum sotuvchi kabineti — javob faqat shu yerda yoziladi */
const UZUM_CABINET_URL = 'https://seller.uzum.uz/';

// ─────────────────────────── Sharh kartochkasi ───────────────────────────

function ReviewCard({
  review,
  canReply,
  onReply,
}: {
  review: ReviewRow;
  canReply: boolean;
  onReply: () => void;
}) {
  const t = useT('reviews');
  const f = useFormat();

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          {review.imageUrl ? (
            <img src={review.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <MessageSquare className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{review.productTitle ?? t('card.noProduct')}</p>
          <p className="truncate text-xs text-muted">{review.sku ?? '—'}</p>
        </div>
        <Badge tone={ratingTone(review.rating)}>
          <Star className="h-3 w-3 fill-current" />
          <span className="tnum">{review.rating}</span>
        </Badge>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Stars value={review.rating} />
        <span className="text-xs font-medium text-ink-soft">{review.author?.trim() || t('card.anonymous')}</span>
        <span className="tnum text-xs text-muted">{f.date(review.publishedAt)}</span>
      </div>

      <p className={cn('mt-3 flex-1 text-sm', review.text ? 'text-ink-soft' : 'italic text-muted')}>
        {review.text?.trim() || t('card.noText')}
      </p>

      {review.answered && review.answerText ? (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/10 p-3.5">
          <div className="mb-1.5 flex items-center gap-2">
            <MessageSquareReply className="h-3.5 w-3.5 text-brand" />
            <span className="text-xs font-semibold text-brand-ink">{t('card.answer')}</span>
            {review.autoAnswered ? (
              <Badge tone="violet" className="ml-auto">
                <Bot className="h-3 w-3" />
                {t('card.auto')}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-ink-soft">{review.answerText}</p>
        </div>
      ) : (
        <div className="mt-4">
          {canReply ? (
            <Button variant="outline" size="sm" icon={<MessageSquareReply className="h-4 w-4" />} onClick={onReply}>
              {t('card.reply')}
            </Button>
          ) : (
            <a
              href={UZUM_CABINET_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-outline gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            >
              <ExternalLink className="h-4 w-4" />
              {t('card.replyInUzum')}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────── Javob oynasi ───────────────────────────

function ReplyModal({
  review,
  templates,
  onClose,
  onSent,
}: {
  review: ReviewRow | null;
  templates: ReviewTemplate[];
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useT('reviews');
  const f = useFormat();
  const [text, setText] = useState('');

  useEffect(() => {
    setText(review?.answerText ?? '');
  }, [review]);

  const send = useMutation({
    mutationFn: (vars: { id: string; text: string }) =>
      api.post<unknown>(`/reviews/${vars.id}/reply`, { text: vars.text }),
    onSuccess: () => {
      toast.success(t('reply.ok'));
      onSent();
      onClose();
    },
    onError: (err: unknown) => toast.error(t('reply.err'), err instanceof Error ? err.message : undefined),
  });

  const filled = templates.filter((tpl) => tpl.text.trim().length > 0);

  const applyTemplate = (tpl: ReviewTemplate) => {
    if (!review) return;
    setText(fillPlaceholders(tpl.text, review, t('card.anonymous'), t('card.noProduct')));
  };

  const submit = () => {
    if (!review) return;
    if (text.trim().length < 2) {
      toast.warning(t('reply.short'));
      return;
    }
    send.mutate({ id: review.id, text: text.trim() });
  };

  return (
    <Modal
      open={review !== null}
      onClose={onClose}
      size="lg"
      title={t('reply.title')}
      description={t('reply.subtitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
          <Button
            icon={<MessageSquareReply className="h-4 w-4" />}
            loading={send.isPending}
            onClick={submit}
          >
            {t('reply.send')}
          </Button>
        </div>
      }
    >
      {review ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Stars value={review.rating} />
              <span className="text-xs font-medium text-ink-soft">
                {review.author?.trim() || t('card.anonymous')}
              </span>
              <span className="tnum text-xs text-muted">{f.date(review.publishedAt)}</span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{review.text?.trim() || t('card.noText')}</p>
            <p className="mt-2 truncate text-xs text-muted">{review.productTitle ?? t('card.noProduct')}</p>
          </div>

          <div>
            <span className="label">{t('reply.templates')}</span>
            {filled.length === 0 ? (
              <p className="text-xs text-muted">{t('reply.noTemplates')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filled.map((tpl) => (
                  <button
                    key={tpl.rating}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                      tpl.rating === review.rating
                        ? 'border-brand/50 bg-brand/10 text-brand-ink'
                        : 'border-line bg-surface-2 text-muted hover:text-ink',
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('reply.useTemplate', { n: tpl.rating })}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="label">{t('reply.text')}</span>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('reply.placeholder')}
              className="input resize-none"
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ─────────────────────────── Shablonlar oynasi ───────────────────────────

function TemplatesModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ReviewTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT('reviews');
  const [items, setItems] = useState<ReviewTemplate[]>(initial);

  useEffect(() => {
    if (open) setItems(initial);
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (templates: ReviewTemplate[]) => api.put<unknown>('/reviews/templates', { templates }),
    onSuccess: () => {
      toast.success(t('tpl.ok'));
      onSaved();
      onClose();
    },
    onError: (err: unknown) => toast.error(t('tpl.err'), err instanceof Error ? err.message : undefined),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('tpl.title')}
      description={t('tpl.subtitle')}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('btn.cancel')}
          </Button>
          <Button icon={<FileText className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(items)}>
            {t('tpl.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl border border-info/25 bg-info/10 p-3 text-xs text-ink-soft">
          {t('tpl.placeholders')}
        </p>

        {items.map((tpl, index) => (
          <div key={tpl.rating}>
            <div className="mb-1.5 flex items-center gap-2">
              <Stars value={tpl.rating} />
              <span className="eyebrow-lg">
                {t('tpl.stars', { n: tpl.rating })}
              </span>
            </div>
            <textarea
              rows={2}
              value={tpl.text}
              placeholder={t('tpl.placeholder')}
              onChange={(e) => {
                const value = e.target.value;
                setItems((prev) => prev.map((x, i) => (i === index ? { ...x, text: value } : x)));
              }}
              className="input resize-none"
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─────────────────────────── Sahifalash ───────────────────────────

function Pager({
  page,
  pages,
  label,
  onPage,
}: {
  page: number;
  pages: number;
  label: string;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return <p className="text-center text-xs text-muted">{label}</p>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">
        {label} <span className="opacity-60">·</span> <span className="tnum">{page}</span> / {pages}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
