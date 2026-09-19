import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink, ScanBarcode, ShieldAlert, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { useDebounced } from '@/components/sales/useDebounced';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  ProductCell,
  SearchInput,
  Segmented,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';

registerNamespace('mxik', {
  uz: {
    title: 'MXIK kod',
    subtitle: 'Har bir tovar uchun soliq klassifikatori kodi',
    'kpi.total': 'Jami SKU',
    'kpi.missing': 'Kodi yo‘q',
    'kpi.missingHint': 'Soliq idorasi bunday tovarni sotishga yo‘l qo‘ymasligi mumkin',
    'kpi.done': 'Kodi bor',
    'why.title': 'MXIK nima va nega kerak',
    'why.body':
      'MXIK — Mahsulot va Xizmatlar Identifikatsiya Kodi. O‘zbekistonda har bir tovar uchun majburiy: u chek va hisob-fakturaga tushadi. Kod noto‘g‘ri bo‘lsa soliq idorasi tovarni sotishga yo‘l qo‘ymaydi.',
    'why.source':
      'Kodlar Soliq qo‘mitasining rasmiy registridan (tasnif.soliq.uz) qidiriladi. Uzum kabinetida kod kiritilgan bo‘lsa, u avtomatik ko‘rinadi.',
    'why.manual':
      'Kodni biz avtomatik biriktirmaymiz. Registr o‘xshash, lekin noto‘g‘ri kodlarni ham qaytaradi — noto‘g‘ri kod esa sotuvingizni to‘xtatadi. Shuning uchun tanlovni siz qilasiz.',
    'seg.all': 'Barchasi',
    'seg.missing': 'Kodi yo‘q',
    'seg.done': 'Kodi bor',
    'col.product': 'Mahsulot',
    'col.barcode': 'Shtrix-kod',
    'col.mxik': 'MXIK',
    'col.action': '',
    'btn.pick': 'Kod tanlash',
    'btn.change': 'O‘zgartirish',
    'btn.clear': 'Olib tashlash',
    none: 'Kiritilmagan',
    'search.title': 'Registrdan kod tanlash',
    'search.for': '{title} uchun',
    'search.placeholder': 'Tovar nomini yozing — masalan «quloqchin»',
    'search.hint': 'Kamida 2 ta harf yozing',
    'search.empty': 'Bu so‘rov bo‘yicha kod topilmadi. Boshqacha nom bilan urinib ko‘ring.',
    'search.offline': 'Registr javob bermadi — faqat ilgari topilgan kodlar ko‘rsatilyapti.',
    'search.units': 'O‘lchov birligi',
    'search.group': 'Guruh',
    'search.class': 'Sinf',
    'search.choose': 'Tanlash',
    'toast.saved': 'MXIK saqlandi',
    'toast.cleared': 'MXIK olib tashlandi',
    'toast.failed': 'Saqlab bo‘lmadi',
    'filter.search': 'Nomi yoki SKU bo‘yicha qidirish',
    empty: 'Mahsulot topilmadi',
    'registry.open': 'Registrni ochish',
  },
  ru: {
    title: 'Код МХИК',
    subtitle: 'Код налогового классификатора для каждого товара',
    'kpi.total': 'Всего SKU',
    'kpi.missing': 'Без кода',
    'kpi.missingHint': 'Налоговая может не допустить такой товар к продаже',
    'kpi.done': 'С кодом',
    'why.title': 'Что такое МХИК и зачем он',
    'why.body':
      'МХИК — идентификационный код товаров и услуг. В Узбекистане обязателен для каждого товара: он попадает в чек и счёт-фактуру. Неверный код — налоговая не допустит товар к продаже.',
    'why.source':
      'Коды ищутся в официальном реестре Налогового комитета (tasnif.soliq.uz). Если код указан в кабинете Uzum, он подтянется автоматически.',
    'why.manual':
      'Мы не подставляем код автоматически. Реестр возвращает и похожие, но неверные коды — а неверный код останавливает продажи. Поэтому выбор за вами.',
    'seg.all': 'Все',
    'seg.missing': 'Без кода',
    'seg.done': 'С кодом',
    'col.product': 'Товар',
    'col.barcode': 'Штрихкод',
    'col.mxik': 'МХИК',
    'col.action': '',
    'btn.pick': 'Выбрать код',
    'btn.change': 'Изменить',
    'btn.clear': 'Убрать',
    none: 'Не указан',
    'search.title': 'Выбор кода из реестра',
    'search.for': 'для «{title}»',
    'search.placeholder': 'Введите название товара — например «наушники»',
    'search.hint': 'Введите минимум 2 буквы',
    'search.empty': 'По этому запросу код не найден. Попробуйте другое название.',
    'search.offline': 'Реестр не ответил — показаны только ранее найденные коды.',
    'search.units': 'Единица измерения',
    'search.group': 'Группа',
    'search.class': 'Класс',
    'search.choose': 'Выбрать',
    'toast.saved': 'МХИК сохранён',
    'toast.cleared': 'МХИК убран',
    'toast.failed': 'Не удалось сохранить',
    'filter.search': 'Поиск по названию или SKU',
    empty: 'Товары не найдены',
    'registry.open': 'Открыть реестр',
  },
  en: {
    title: 'MXIK code',
    subtitle: 'Tax classifier code for every product',
    'kpi.total': 'Total SKUs',
    'kpi.missing': 'Missing code',
    'kpi.missingHint': 'The tax office may block such goods from sale',
    'kpi.done': 'Has a code',
    'why.title': 'What MXIK is and why it matters',
    'why.body':
      'MXIK is the Uzbek goods and services identification code. It is mandatory for every product and appears on receipts and invoices. A wrong code means the tax office will not let the item be sold.',
    'why.source':
      'Codes are searched in the Tax Committee registry (tasnif.soliq.uz). If the code is set in your Uzum cabinet it appears here automatically.',
    'why.manual':
      'We never assign a code automatically. The registry returns similar but wrong codes too, and a wrong code stops your sales. The choice is yours.',
    'seg.all': 'All',
    'seg.missing': 'Missing',
    'seg.done': 'Has code',
    'col.product': 'Product',
    'col.barcode': 'Barcode',
    'col.mxik': 'MXIK',
    'col.action': '',
    'btn.pick': 'Pick a code',
    'btn.change': 'Change',
    'btn.clear': 'Remove',
    none: 'Not set',
    'search.title': 'Pick a code from the registry',
    'search.for': 'for “{title}”',
    'search.placeholder': 'Type the product name — e.g. “headphones”',
    'search.hint': 'Type at least 2 characters',
    'search.empty': 'Nothing found for this query. Try a different name.',
    'search.offline': 'The registry did not respond — showing previously found codes only.',
    'search.units': 'Unit',
    'search.group': 'Group',
    'search.class': 'Class',
    'search.choose': 'Choose',
    'toast.saved': 'MXIK saved',
    'toast.cleared': 'MXIK removed',
    'toast.failed': 'Could not save',
    'filter.search': 'Search by name or SKU',
    empty: 'No products found',
    'registry.open': 'Open the registry',
  },
});

interface MxikRow {
  skuId: string;
  sku: string;
  title: string;
  productTitle: string;
  category: string;
  imageUrl: string;
  barcode: string;
  price: number;
  ikpu: string;
  ikpuName: string;
}

interface MxikListResponse {
  items: MxikRow[];
  total: number;
  missing: number;
}

interface MxikHit {
  code: string;
  name: string;
  fullName: string;
  groupName: string;
  className: string;
  unitsName: string;
}

type Segment = 'all' | 'missing' | 'done';

export default function Mxik() {
  const t = useT('mxik');
  const f = useFormat();
  const qc = useQueryClient();

  const [segment, setSegment] = useState<Segment>('missing');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState<MxikRow | null>(null);

  const list = useQuery({
    queryKey: ['mxik'],
    queryFn: () => api.get<MxikListResponse>('/mxik'),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (input: { skuId: string; ikpu: string }) =>
      api.patch(`/mxik/${input.skuId}`, { ikpu: input.ikpu }),
    onSuccess: (_d, input) => {
      toast.success(t(input.ikpu ? 'toast.saved' : 'toast.cleared'));
      setPicking(null);
      void qc.invalidateQueries({ queryKey: ['mxik'] });
    },
    onError: () => toast.error(t('toast.failed')),
  });

  const rows = useMemo(() => {
    const all = list.data?.items ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (segment === 'missing' && r.ikpu) return false;
      if (segment === 'done' && !r.ikpu) return false;
      if (!q) return true;
      return `${r.title} ${r.sku} ${r.productTitle}`.toLowerCase().includes(q);
    });
  }, [list.data, segment, search]);

  const columns: Column<MxikRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
    },
    {
      key: 'barcode',
      header: t('col.barcode'),
      render: (r) => <span className="tnum text-xs text-muted">{r.barcode || '—'}</span>,
    },
    {
      key: 'mxik',
      header: t('col.mxik'),
      render: (r) =>
        r.ikpu ? (
          <div className="min-w-0">
            <span className="tnum text-sm font-semibold text-ink">{r.ikpu}</span>
            {r.ikpuName ? <p className="truncate text-xs text-muted">{r.ikpuName}</p> : null}
          </div>
        ) : (
          <Badge tone="warn" dot>
            {t('none')}
          </Badge>
        ),
    },
    {
      key: 'action',
      header: t('col.action'),
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant={r.ikpu ? 'outline' : 'primary'} onClick={() => setPicking(r)}>
            {t(r.ikpu ? 'btn.change' : 'btn.pick')}
          </Button>
          {r.ikpu ? (
            <Button
              size="sm"
              variant="ghost"
              loading={save.isPending}
              onClick={() => save.mutate({ skuId: r.skuId, ikpu: '' })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  const total = list.data?.total ?? 0;
  const missing = list.data?.missing ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader icon={<ScanBarcode className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />

      <StatGrid>
        <StatCard
          label={t('kpi.total')}
          value={f.num(total)}
          icon={<ScanBarcode className="h-5 w-5" />}
          loading={list.isLoading}
        />
        <StatCard
          label={t('kpi.missing')}
          value={f.num(missing)}
          hint={t('kpi.missingHint')}
          tone={missing > 0 ? 'warn' : 'brand'}
          icon={<ShieldAlert className="h-5 w-5" />}
          loading={list.isLoading}
        />
        <StatCard
          label={t('kpi.done')}
          value={f.num(Math.max(0, total - missing))}
          tone="brand"
          icon={<BadgeCheck className="h-5 w-5" />}
          loading={list.isLoading}
        />
      </StatGrid>

      <Card>
        <CardHeader title={t('why.title')} icon={<ShieldAlert className="h-4 w-4" />} />
        <CardBody className="space-y-2 text-sm leading-relaxed text-muted">
          <p>{t('why.body')}</p>
          <p>{t('why.source')}</p>
          <p className="text-ink-soft">{t('why.manual')}</p>
          <a
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"
            href="https://tasnif.soliq.uz"
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('registry.open')}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('title')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder={t('filter.search')} />
              <Segmented<Segment>
                value={segment}
                onChange={setSegment}
                options={[
                  { value: 'missing', label: t('seg.missing') },
                  { value: 'done', label: t('seg.done') },
                  { value: 'all', label: t('seg.all') },
                ]}
              />
            </div>
          }
        />
        <CardBody>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.skuId}
            loading={list.isLoading}
            empty={<EmptyState icon={<ScanBarcode className="h-6 w-6" />} title={t('empty')} />}
          />
        </CardBody>
      </Card>

      {picking ? (
        <RegistryPicker
          row={picking}
          onClose={() => setPicking(null)}
          onPick={(code) => save.mutate({ skuId: picking.skuId, ikpu: code })}
          saving={save.isPending}
        />
      ) : null}
    </div>
  );
}

/**
 * Registrdan kod tanlash oynasi.
 *
 * Qidiruv sotuvchi tovarining nomi bilan oldindan to'ldiriladi — ko'p
 * holatda birinchi urinishdayoq to'g'ri guruh chiqadi. Lekin tanlashni
 * hech qachon o'zimiz qilmaymiz.
 */
function RegistryPicker({
  row,
  onClose,
  onPick,
  saving,
}: {
  row: MxikRow;
  onClose: () => void;
  onPick: (code: string) => void;
  saving: boolean;
}) {
  const t = useT('mxik');
  const [query, setQuery] = useState(row.title.split(/[,(]/)[0]?.trim().slice(0, 40) ?? '');
  const debounced = useDebounced(query, 400);

  const hits = useQuery({
    queryKey: ['mxik', 'search', debounced],
    queryFn: () => api.get<{ items: MxikHit[]; source?: string }>('/mxik/search', { q: debounced }),
    enabled: debounced.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

  const items = hits.data?.items ?? [];

  return (
    <Modal open onClose={onClose} title={t('search.title')} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('search.for', { title: row.title })}</p>

        <SearchInput value={query} onChange={setQuery} placeholder={t('search.placeholder')} />

        {debounced.trim().length < 2 ? (
          <p className="text-sm text-muted">{t('search.hint')}</p>
        ) : hits.isLoading ? (
          <p className="text-sm text-muted">…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">{t('search.empty')}</p>
        ) : (
          <>
            {hits.data?.source === 'cache' ? (
              <p className="text-xs text-warn-ink">{t('search.offline')}</p>
            ) : null}
            <ul className="max-h-[52vh] space-y-2 overflow-y-auto">
              {items.map((h) => (
                <li key={h.code} className="panel p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{h.name}</p>
                      <p className="tnum mt-0.5 text-xs text-muted">{h.code}</p>
                      {h.groupName ? (
                        <p className="mt-1 text-xs text-muted">
                          {t('search.group')}: {h.groupName}
                          {h.className ? ` · ${t('search.class')}: ${h.className}` : ''}
                        </p>
                      ) : null}
                      {h.unitsName ? (
                        <p className="text-xs text-muted">
                          {t('search.units')}: {h.unitsName}
                        </p>
                      ) : null}
                    </div>
                    <Button size="sm" loading={saving} onClick={() => onPick(h.code)}>
                      {t('search.choose')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
