import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  ChevronDown,
  Gauge,
  Info,
  Package,
  Search,
  ShieldAlert,
  Wand2,
} from '@/components/icons';
import { CARD_LANGS, type CardLang, type CardListResponse, type CardListRow } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useFeature } from '@/store/session';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import { useDebounced } from '@/components/sales/useDebounced';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  ProductCell,
  SearchInput,
  Segmented,
  StatCard,
  StatGrid,
  type Column,
  type Tone,
} from '@/components/ui';

const PAGE_SIZE = 50;
/** Tushuntirish kartasi yig'ilganmi — faqat shu brauzer uchun qulaylik */
const HOW_KEY = 'sq-cards-how-hidden';

registerNamespace('cards', {
  uz: {
    title: 'Kartochka SEO',
    subtitle: 'Qaysi kartochkani birinchi tuzatish kerak: ball, kalit so‘zlar va tushumga qarab navbat',
    'kpi.cards': 'Kartochkalar',
    'kpi.cardsHint': '{n} tasida tavsif kiritilgan',
    'kpi.avg': 'O‘rtacha ball',
    'kpi.avgHint': '100 balldan',
    'kpi.low': '60 baldan past',
    'kpi.lowHint': 'Avval shularni tuzating',
    'kpi.applied': 'Yangilangan',
    'kpi.appliedHint': 'Yangi matn Uzum’ga qo‘yilgan',
    'how.title': 'Bu qanday ishlaydi',
    'how.show': 'Ko‘rsatish',
    'how.hide': 'Yashirish',
    'how.score':
      'Ball bepul hisoblanadi — kartochka matni, kalit so‘zlar, sharhlar va SKU holatidan. Pullik AI yoki tashqi xizmat ishlatilmaydi.',
    'how.desc':
      'Seller API faqat kartochka nomini beradi. Tavsifni Uzum kabinetidan nusxa olib, kartochka sahifasiga qo‘ying — shunda u ham baholanadi.',
    'how.ai':
      'Yangi matnni bepul chatbotda (ChatGPT, Gemini yoki Claude.ai) yaratasiz: biz tayyor so‘rov beramiz, javobni bu yerga qaytarasiz — uni tekshirib, baholaymiz.',
    'how.manual':
      'Uzum’ga hech narsa avtomatik yozilmaydi. Matnni kabinetga o‘zingiz qo‘yasiz va bu yerda «Qo‘llandi» deb belgilaysiz.',
    'how.demand':
      'Uzum’da qidiruv chastotasi ochiq manbada yo‘q. Shuning uchun talab raqamlari faqat o‘zingiz import qilsangiz ko‘rinadi.',
    'sort.opportunity': 'Imkoniyat',
    'sort.score': 'Eng past ball',
    'sort.revenue': 'Tushum',
    'filter.search': 'Nomi bo‘yicha qidirish',
    'table.title': 'Tuzatish navbati',
    'table.hint':
      'Imkoniyat = 30 kunlik tushum × balldagi kamchilik; omborda yo‘q tovar pastga tushadi. Qatorni bosing — kartochka ochiladi.',
    'col.product': 'Mahsulot',
    'col.score': 'Ball',
    'col.sections': 'Bo‘limlar',
    'col.revenue': 'Tushum, 30 kun',
    'col.profit': 'Foyda, 30 kun',
    'col.stock': 'Qoldiq',
    'col.opportunity': 'Imkoniyat',
    'col.description': 'Tavsif',
    'col.keywords': 'Kalit so‘zlar',
    'col.status': 'Holat',
    'sec.title': 'Nom',
    'sec.keywords': 'Kalit',
    'sec.description': 'Tavsif',
    'desc.has': '{lang} tavsifi bor',
    'desc.missing': '{lang} tavsifi kiritilmagan',
    'status.none': 'Boshlanmagan',
    'status.draft': 'Qoralama',
    'status.applied': 'Qo‘llandi',
    'empty.title': 'Kartochka topilmadi',
    'empty.hint': 'Qidiruvni o‘zgartiring yoki boshqa do‘konni tanlang',
    'empty.none': 'Hali mahsulot yo‘q',
    'empty.noneHint': 'Uzum kabinetini ulang va sinxronizatsiya tugashini kuting',
  },
  ru: {
    title: 'SEO карточек',
    subtitle: 'Какие карточки исправить первыми: очередь по баллу, ключевым словам и выручке',
    'kpi.cards': 'Карточки',
    'kpi.cardsHint': 'Описание есть у {n}',
    'kpi.avg': 'Средний балл',
    'kpi.avgHint': 'из 100',
    'kpi.low': 'Ниже 60 баллов',
    'kpi.lowHint': 'Исправьте их в первую очередь',
    'kpi.applied': 'Обновлено',
    'kpi.appliedHint': 'Новый текст выложен в Uzum',
    'how.title': 'Как это работает',
    'how.show': 'Показать',
    'how.hide': 'Скрыть',
    'how.score':
      'Балл считается бесплатно — по тексту карточки, ключевым словам, отзывам и состоянию SKU. Платный AI и внешние сервисы не используются.',
    'how.desc':
      'Seller API отдаёт только название карточки. Скопируйте описание из кабинета Uzum и вставьте на странице карточки — тогда оно тоже будет оценено.',
    'how.ai':
      'Новый текст вы делаете в бесплатном чат-боте (ChatGPT, Gemini или Claude.ai): мы готовим запрос, вы вставляете ответ сюда — мы его проверяем и оцениваем.',
    'how.manual':
      'В Uzum ничего не записывается автоматически. Текст вы выкладываете в кабинет сами и отмечаете здесь «Применено».',
    'how.demand':
      'Частоты поисковых запросов Uzum нет в открытом доступе. Поэтому спрос виден, только если вы импортируете его сами.',
    'sort.opportunity': 'Потенциал',
    'sort.score': 'Худший балл',
    'sort.revenue': 'Выручка',
    'filter.search': 'Поиск по названию',
    'table.title': 'Очередь исправлений',
    'table.hint':
      'Потенциал = выручка за 30 дней × недобор балла; товары без остатка опускаются вниз. Нажмите на строку, чтобы открыть карточку.',
    'col.product': 'Товар',
    'col.score': 'Балл',
    'col.sections': 'Разделы',
    'col.revenue': 'Выручка, 30 дн.',
    'col.profit': 'Прибыль, 30 дн.',
    'col.stock': 'Остаток',
    'col.opportunity': 'Потенциал',
    'col.description': 'Описание',
    'col.keywords': 'Ключевые слова',
    'col.status': 'Статус',
    'sec.title': 'Название',
    'sec.keywords': 'Ключи',
    'sec.description': 'Описание',
    'desc.has': 'Описание {lang} есть',
    'desc.missing': 'Описание {lang} не добавлено',
    'status.none': 'Не начато',
    'status.draft': 'Черновик',
    'status.applied': 'Применено',
    'empty.title': 'Карточки не найдены',
    'empty.hint': 'Измените поиск или выберите другой магазин',
    'empty.none': 'Товаров пока нет',
    'empty.noneHint': 'Подключите кабинет Uzum и дождитесь окончания синхронизации',
  },
  en: {
    title: 'Card SEO',
    subtitle: 'Which product cards to fix first: a queue by score, keywords and revenue',
    'kpi.cards': 'Cards',
    'kpi.cardsHint': '{n} have a description',
    'kpi.avg': 'Average score',
    'kpi.avgHint': 'out of 100',
    'kpi.low': 'Below 60',
    'kpi.lowHint': 'Fix these first',
    'kpi.applied': 'Updated',
    'kpi.appliedHint': 'New copy published on Uzum',
    'how.title': 'How it works',
    'how.show': 'Show',
    'how.hide': 'Hide',
    'how.score':
      'The score is computed for free from your card text, keywords, reviews and SKU health. No paid AI or external service is used.',
    'how.desc':
      'The Seller API returns only the card title. Copy the description from your Uzum cabinet and paste it on the card page so it gets scored too.',
    'how.ai':
      'New copy is written in a free chatbot (ChatGPT, Gemini or Claude.ai): we prepare the prompt, you paste the answer back here, and we check and score it.',
    'how.manual':
      'Nothing is written to Uzum automatically. You publish the text in your cabinet yourself and mark it “Applied” here.',
    'how.demand':
      'Uzum has no public search-frequency source, so demand numbers appear only if you import them yourself.',
    'sort.opportunity': 'Opportunity',
    'sort.score': 'Lowest score',
    'sort.revenue': 'Revenue',
    'filter.search': 'Search by title',
    'table.title': 'Fix queue',
    'table.hint':
      'Opportunity = 30-day revenue × missing score share; out-of-stock items sink. Click a row to open the card.',
    'col.product': 'Product',
    'col.score': 'Score',
    'col.sections': 'Sections',
    'col.revenue': 'Revenue, 30 d',
    'col.profit': 'Profit, 30 d',
    'col.stock': 'Stock',
    'col.opportunity': 'Opportunity',
    'col.description': 'Description',
    'col.keywords': 'Keywords',
    'col.status': 'Status',
    'sec.title': 'Title',
    'sec.keywords': 'Keys',
    'sec.description': 'Desc.',
    'desc.has': '{lang} description added',
    'desc.missing': '{lang} description missing',
    'status.none': 'Not started',
    'status.draft': 'Draft',
    'status.applied': 'Applied',
    'empty.title': 'No cards found',
    'empty.hint': 'Change the search or pick another store',
    'empty.none': 'No products yet',
    'empty.noneHint': 'Connect your Uzum cabinet and wait for the sync to finish',
  },
});

type SortKey = 'opportunity' | 'score' | 'revenue';

/** Ball pastdan yuqoriga — eng yomonlari birinchi; qolganlari kattadan kichikka */
const SORT_ORDER: Record<SortKey, 'asc' | 'desc'> = {
  opportunity: 'desc',
  score: 'asc',
  revenue: 'desc',
};

/** Ro'yxatda ko'rsatiladigan bo'limlar (ijtimoiy va holat — kartochka sahifasida) */
const LIST_SECTIONS = ['title', 'keywords', 'description'] as const;

const STATUS_TONE: Record<CardListRow['draftStatus'], Tone> = {
  none: 'muted',
  draft: 'info',
  applied: 'brand',
};

function scoreTone(score: number): 'brand' | 'warn' | 'danger' {
  if (score >= 80) return 'brand';
  if (score >= 60) return 'warn';
  return 'danger';
}

const SCORE_CLASS: Record<ReturnType<typeof scoreTone>, string> = {
  brand: 'bg-brand/10 text-brand-ink',
  warn: 'bg-warn/10 text-warn-ink',
  danger: 'bg-danger/10 text-danger-ink',
};

const BAR_CLASS: Record<ReturnType<typeof scoreTone>, string> = {
  brand: 'bg-brand',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

function readHowHidden(): boolean {
  try {
    return localStorage.getItem(HOW_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHowHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HOW_KEY, '1');
    else localStorage.removeItem(HOW_KEY);
  } catch {
    /* noop */
  }
}

export default function Cards() {
  const t = useT('cards');
  const f = useFormat();
  const navigate = useNavigate();
  const { storeId } = usePeriodQuery();
  // Tarifda yo'q bo'lsa so'rov yuborilmaydi — aks holda 402 xatosi qulf oynasini yopib qo'yardi
  const access = useFeature('card_seo');

  const [sort, setSort] = useState<SortKey>('opportunity');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [page, setPage] = useState(1);
  const [howHidden, setHowHidden] = useState(readHowHidden);

  useEffect(() => {
    setPage(1);
  }, [search, sort, storeId]);

  // Ro'yxat davrga bog'liq emas (doim oxirgi 30 kun) — davr so'rovga qo'shilmaydi
  const query = {
    storeId,
    page,
    pageSize: PAGE_SIZE,
    sort,
    order: SORT_ORDER[sort],
    search: search.trim() || undefined,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['cards', query],
    queryFn: () => api.get<CardListResponse>('/cards', query),
    placeholderData: keepPreviousData,
    enabled: access === 'full',
  });

  const rows = data?.items ?? [];
  const totals = data?.totals;

  const toggleHow = () => {
    setHowHidden((v) => {
      writeHowHidden(!v);
      return !v;
    });
  };

  const columns: Column<CardListRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: 300,
      render: (r) => (
        <ProductCell
          title={r.title}
          subtitle={r.category ? `${r.storeTitle} · ${r.category}` : r.storeTitle}
          imageUrl={r.imageUrl}
        />
      ),
    },
    {
      key: 'score',
      header: t('col.score'),
      align: 'center',
      render: (r) => (
        <span
          className={cn(
            'tnum inline-flex h-8 min-w-10 items-center justify-center rounded-lg px-2 font-display text-sm font-bold',
            SCORE_CLASS[scoreTone(r.score)],
          )}
        >
          {f.num(r.score)}
        </span>
      ),
    },
    {
      key: 'sections',
      header: t('col.sections'),
      hideOnMobile: true,
      render: (r) => (
        <div className="grid w-40 gap-1">
          {LIST_SECTIONS.map((id) => {
            const v = r.sections[id];
            return (
              <div key={id} className="flex items-center gap-2 text-2xs">
                <span className="w-12 shrink-0 truncate text-muted">{t(`sec.${id}`)}</span>
                {v == null ? (
                  <span className="flex-1 text-muted">—</span>
                ) : (
                  <>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className={cn('block h-full rounded-full', BAR_CLASS[scoreTone(v)])}
                        style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                      />
                    </span>
                    <span className="tnum w-7 shrink-0 text-right text-ink-soft">{f.num(v)}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      key: 'revenue30',
      header: t('col.revenue'),
      align: 'right',
      render: (r) => <span className="tnum text-ink">{f.money(r.revenue30)}</span>,
    },
    {
      key: 'profit30',
      header: t('col.profit'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => (
        <span className={cn('tnum', r.profit30 < 0 ? 'font-semibold text-danger' : 'text-ink-soft')}>
          {f.money(r.profit30)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: t('col.stock'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => (
        <span className={cn('tnum', r.stock > 0 ? 'text-ink-soft' : 'text-muted')}>{f.num(r.stock)}</span>
      ),
    },
    {
      key: 'opportunity',
      header: t('col.opportunity'),
      align: 'right',
      render: (r) => (
        <span className={cn('tnum', r.opportunity > 0 ? 'font-semibold text-ink' : 'text-muted')}>
          {f.money(r.opportunity)}
        </span>
      ),
    },
    {
      key: 'description',
      header: t('col.description'),
      render: (r) => (
        <div className="flex items-center gap-1">
          {CARD_LANGS.map((lang) => (
            <DescLangBadge
              key={lang}
              lang={lang}
              has={r.descriptionLangs.includes(lang)}
              title={t(r.descriptionLangs.includes(lang) ? 'desc.has' : 'desc.missing', {
                lang: lang.toUpperCase(),
              })}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'keywords',
      header: t('col.keywords'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => (
        <span className={cn('tnum', r.keywordsCount > 0 ? 'text-ink-soft' : 'text-muted')}>
          {r.keywordsCount > 0 ? f.num(r.keywordsCount) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('col.status'),
      render: (r) => (
        <div className="min-w-0">
          <Badge tone={STATUS_TONE[r.draftStatus]} dot>
            {t(`status.${r.draftStatus}`)}
          </Badge>
          {r.draftStatus === 'applied' && r.appliedAt ? (
            <p className="tnum mt-0.5 text-2xs text-muted">{f.date(r.appliedAt)}</p>
          ) : null}
        </div>
      ),
    },
  ];

  const header = (
    <PageHeader icon={<Wand2 className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
  );

  if (isError) {
    return (
      <>
        {header}
        <Card>
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
        </Card>
      </>
    );
  }

  const searching = Boolean(search.trim());

  return (
    <>
      {header}

      <PlanGate feature="card_seo">
        <div className="space-y-5">
          <StatGrid>
            <StatCard
              label={t('kpi.cards')}
              value={f.num(totals?.cards ?? 0)}
              hint={t('kpi.cardsHint', { n: f.num(totals?.withDescription ?? 0) })}
              icon={<Package className="h-5 w-5" />}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.avg')}
              value={f.num(totals?.avgScore ?? 0)}
              hint={t('kpi.avgHint')}
              icon={<Gauge className="h-5 w-5" />}
              tone={totals && totals.cards > 0 ? scoreTone(totals.avgScore) : undefined}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.low')}
              value={f.num(totals?.lowScore ?? 0)}
              hint={t('kpi.lowHint')}
              icon={<ShieldAlert className="h-5 w-5" />}
              tone={totals && totals.lowScore > 0 ? 'danger' : undefined}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.applied')}
              value={f.num(totals?.applied ?? 0)}
              hint={t('kpi.appliedHint')}
              icon={<BadgeCheck className="h-5 w-5" />}
              tone="brand"
              loading={isLoading}
            />
          </StatGrid>

          <Card>
            <CardHeader
              icon={<Info className="h-4 w-4" />}
              title={t('how.title')}
              className={cn(howHidden && 'pb-5')}
              actions={
                <button
                  type="button"
                  onClick={toggleHow}
                  aria-expanded={!howHidden}
                  className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {howHidden ? t('how.show') : t('how.hide')}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !howHidden && 'rotate-180')} />
                </button>
              }
            />
            {howHidden ? null : (
              <CardBody>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted marker:text-line-strong">
                  <li>{t('how.score')}</li>
                  <li>{t('how.desc')}</li>
                  <li>{t('how.ai')}</li>
                  <li className="text-ink-soft">{t('how.manual')}</li>
                  <li>{t('how.demand')}</li>
                </ul>
              </CardBody>
            )}
          </Card>

          <div>
            <FilterBar>
              <Segmented<SortKey>
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'opportunity', label: t('sort.opportunity') },
                  { value: 'score', label: t('sort.score') },
                  { value: 'revenue', label: t('sort.revenue') },
                ]}
              />
              <SearchInput
                value={searchInput}
                onChange={setSearchInput}
                placeholder={t('filter.search')}
                className="w-full sm:w-64"
              />
            </FilterBar>

            <Card>
              <CardHeader icon={<Wand2 className="h-4 w-4" />} title={t('table.title')} subtitle={t('table.hint')} />
              {/* Saralash serverda — mahalliy saralash o'chiq, aks holda faqat joriy sahifa saralanardi */}
              <DataTable<CardListRow>
                columns={columns}
                rows={rows}
                rowKey={(r) => r.productId}
                loading={isLoading}
                localSort={false}
                onRowClick={(r) => navigate(`/cards/${r.productId}`)}
                pagination={{
                  page: data?.page ?? 1,
                  pages: data?.pages ?? 1,
                  total: data?.total ?? 0,
                  pageSize: data?.pageSize ?? PAGE_SIZE,
                  onPage: setPage,
                }}
                empty={
                  searching ? (
                    <EmptyState icon={<Search className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
                  ) : (
                    <EmptyState
                      icon={<Package className="h-6 w-6" />}
                      title={t('empty.none')}
                      hint={t('empty.noneHint')}
                    />
                  )
                }
              />
            </Card>
          </div>
        </div>
      </PlanGate>
    </>
  );
}

/** RU/UZ tavsif belgisi: bor — yashil, yo'q — xira va ustidan chizilgan */
function DescLangBadge({ lang, has, title }: { lang: CardLang; has: boolean; title: string }) {
  return (
    <Badge tone={has ? 'brand' : 'muted'} title={title} className={cn(!has && 'line-through opacity-70')}>
      {lang.toUpperCase()}
    </Badge>
  );
}
