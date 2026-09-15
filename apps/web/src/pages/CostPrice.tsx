import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CircleDollarSign,
  Coins,
  CornerDownLeft,
  Layers,
  Percent,
  RotateCcw,
  Save,
  Tags,
  Undo2,
} from 'lucide-react';
import { DEFAULTS } from '@savdoiq/shared';
import type { ProductsResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { CostInput } from '@/components/costprice/CostInput';
import {
  effectiveCost,
  effectiveExtra,
  flattenSkuRows,
  isRowDirty,
  rowEconomics,
  valueTone,
  type CostAssumptions,
  type CostEdits,
  type CostRow,
} from '@/components/costprice/helpers';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('costPrice', {
  uz: {
    title: 'Tannarx',
    subtitle: 'Har bir SKU tannarxini kiriting — foyda, marja va ROI shundan hisoblanadi',

    'warn.title': 'Tannarx kiritilmagan: {n} ta SKU',
    'warn.body': 'Tannarxsiz SKU bo‘yicha foyda, marja va ROI noto‘g‘ri hisoblanadi.',
    'warn.action': 'Faqat shularini ko‘rsatish',
    'warn.ok': 'Barcha SKU tannarxi kiritilgan',
    'warn.okBody': 'Hisobotlardagi foyda va marja to‘liq ishonchli.',

    'kpi.skus': 'Jami SKU',
    'kpi.skusHint': 'Tanlangan do‘kon bo‘yicha',
    'kpi.missing': 'Tannarxsiz SKU',
    'kpi.missingHint': 'Tannarx 0 yoki kiritilmagan',
    'kpi.margin': 'O‘rtacha marja',
    'kpi.marginHint': 'Tannarxi kiritilgan SKU bo‘yicha',
    'kpi.dirty': 'O‘zgartirilgan',
    'kpi.dirtyHint': 'Saqlanmagan qatorlar soni',

    'filter.all': 'Barchasi',
    'filter.missing': 'Tannarxsiz',
    'search.placeholder': 'Nomi yoki SKU bo‘yicha qidirish',

    'bulk.title': 'Tanlanganlarga qo‘llash',
    'bulk.subtitle': 'Bir xil qiymatni belgilangan qatorlarga birdan yozing',
    'bulk.field': 'Maydon',
    'bulk.cost': 'Tannarx',
    'bulk.extra': 'Qo‘shimcha xarajat',
    'bulk.value': 'Qiymat',
    'bulk.apply': 'Qo‘llash',
    'bulk.selected': '{n} ta tanlandi',
    'bulk.clear': 'Tanlovni tozalash',
    'bulk.none': 'Avval qatorlarni belgilang',
    'bulk.done': '{n} ta qatorga qo‘llandi',

    'table.title': 'SKU tannarxlari',
    'table.selectAll': 'Sahifadagi barchasini tanlash',
    'col.product': 'Mahsulot',
    'col.price': 'Sotuv narxi',
    'col.cost': 'Tannarx',
    'col.extra': 'Qo‘shimcha',
    'col.margin': 'Marja',
    'col.roi': 'ROI',
    'col.sold': 'Sotildi',
    'col.actions': '',

    'hint.assumptions': 'Marja va ROI taxminiy: komissiya {c}, logistika {l}, soliq {t}',
    'hint.enter': 'Enter — keyingi qatorga o‘tish',
    'hint.truncated': 'Faqat birinchi {n} ta mahsulot yuklandi — qidiruv yoki do‘kon filtridan foydalaning',

    'bar.dirty': '{n} ta qator o‘zgardi',
    'bar.save': 'Saqlash ({n})',
    'bar.reset': 'O‘zgarishlarni bekor qilish',

    'save.ok': 'Tannarxlar saqlandi',
    'save.okBody': '{n} ta SKU yangilandi',
    'save.err': 'Saqlab bo‘lmadi',
    'row.save': 'Shu qatorni saqlash',
    'row.reset': 'Qatorni tiklash',
    'row.ok': 'Qator saqlandi',

    'value.noPrice': 'Narx yo‘q',
    'value.noCost': 'Tannarx yo‘q',

    'empty.title': 'SKU topilmadi',
    'empty.hint': 'Qidiruvni tozalang yoki boshqa do‘konni tanlang',
    'empty.none': 'Hali mahsulot yuklanmagan',
    'empty.noneHint': 'Sinxronizatsiya tugagach, katalog shu yerda paydo bo‘ladi',

    'leave.confirm': 'Saqlanmagan o‘zgarishlar bor. Sahifadan chiqasizmi?',
  },
  ru: {
    title: 'Себестоимость',
    subtitle: 'Укажите себестоимость каждого SKU — от неё считаются прибыль, маржа и ROI',

    'warn.title': 'Себестоимость не указана: {n} SKU',
    'warn.body': 'Без себестоимости прибыль, маржа и ROI считаются неверно.',
    'warn.action': 'Показать только их',
    'warn.ok': 'Себестоимость указана у всех SKU',
    'warn.okBody': 'Прибыль и маржа в отчётах полностью достоверны.',

    'kpi.skus': 'Всего SKU',
    'kpi.skusHint': 'По выбранному магазину',
    'kpi.missing': 'SKU без себестоимости',
    'kpi.missingHint': 'Себестоимость 0 или не указана',
    'kpi.margin': 'Средняя маржа',
    'kpi.marginHint': 'По SKU с указанной себестоимостью',
    'kpi.dirty': 'Изменено',
    'kpi.dirtyHint': 'Несохранённых строк',

    'filter.all': 'Все',
    'filter.missing': 'Без себестоимости',
    'search.placeholder': 'Поиск по названию или SKU',

    'bulk.title': 'Применить к выбранным',
    'bulk.subtitle': 'Запишите одно значение сразу во все отмеченные строки',
    'bulk.field': 'Поле',
    'bulk.cost': 'Себестоимость',
    'bulk.extra': 'Доп. расходы',
    'bulk.value': 'Значение',
    'bulk.apply': 'Применить',
    'bulk.selected': 'Выбрано: {n}',
    'bulk.clear': 'Сбросить выбор',
    'bulk.none': 'Сначала отметьте строки',
    'bulk.done': 'Применено к {n} строкам',

    'table.title': 'Себестоимость SKU',
    'table.selectAll': 'Выбрать все на странице',
    'col.product': 'Товар',
    'col.price': 'Цена продажи',
    'col.cost': 'Себестоимость',
    'col.extra': 'Доп. расходы',
    'col.margin': 'Маржа',
    'col.roi': 'ROI',
    'col.sold': 'Продано',
    'col.actions': '',

    'hint.assumptions': 'Маржа и ROI примерные: комиссия {c}, логистика {l}, налог {t}',
    'hint.enter': 'Enter — переход к следующей строке',
    'hint.truncated': 'Загружены только первые {n} товаров — используйте поиск или фильтр магазина',

    'bar.dirty': 'Изменено строк: {n}',
    'bar.save': 'Сохранить ({n})',
    'bar.reset': 'Отменить изменения',

    'save.ok': 'Себестоимость сохранена',
    'save.okBody': 'Обновлено SKU: {n}',
    'save.err': 'Не удалось сохранить',
    'row.save': 'Сохранить строку',
    'row.reset': 'Вернуть строку',
    'row.ok': 'Строка сохранена',

    'value.noPrice': 'Нет цены',
    'value.noCost': 'Нет себестоимости',

    'empty.title': 'SKU не найдены',
    'empty.hint': 'Очистите поиск или выберите другой магазин',
    'empty.none': 'Товары ещё не загружены',
    'empty.noneHint': 'Каталог появится здесь после синхронизации',

    'leave.confirm': 'Есть несохранённые изменения. Покинуть страницу?',
  },
  en: {
    title: 'Cost price',
    subtitle: 'Set the cost of every SKU — profit, margin and ROI are derived from it',

    'warn.title': 'Cost price missing: {n} SKUs',
    'warn.body': 'Without a cost price, profit, margin and ROI are calculated incorrectly.',
    'warn.action': 'Show only these',
    'warn.ok': 'Every SKU has a cost price',
    'warn.okBody': 'Profit and margin across the reports are fully reliable.',

    'kpi.skus': 'Total SKUs',
    'kpi.skusHint': 'For the selected store',
    'kpi.missing': 'SKUs without cost',
    'kpi.missingHint': 'Cost is zero or not set',
    'kpi.margin': 'Average margin',
    'kpi.marginHint': 'Across SKUs that have a cost',
    'kpi.dirty': 'Edited',
    'kpi.dirtyHint': 'Unsaved rows',

    'filter.all': 'All',
    'filter.missing': 'Without cost',
    'search.placeholder': 'Search by name or SKU',

    'bulk.title': 'Apply to selected',
    'bulk.subtitle': 'Write one value into every checked row at once',
    'bulk.field': 'Field',
    'bulk.cost': 'Cost price',
    'bulk.extra': 'Extra cost',
    'bulk.value': 'Value',
    'bulk.apply': 'Apply',
    'bulk.selected': '{n} selected',
    'bulk.clear': 'Clear selection',
    'bulk.none': 'Check some rows first',
    'bulk.done': 'Applied to {n} rows',

    'table.title': 'SKU cost prices',
    'table.selectAll': 'Select everything on this page',
    'col.product': 'Product',
    'col.price': 'Sale price',
    'col.cost': 'Cost price',
    'col.extra': 'Extra',
    'col.margin': 'Margin',
    'col.roi': 'ROI',
    'col.sold': 'Sold',
    'col.actions': '',

    'hint.assumptions': 'Margin and ROI are estimates: commission {c}, logistics {l}, tax {t}',
    'hint.enter': 'Enter — jump to the next row',
    'hint.truncated': 'Only the first {n} products were loaded — use the search or the store filter',

    'bar.dirty': '{n} rows changed',
    'bar.save': 'Save ({n})',
    'bar.reset': 'Discard changes',

    'save.ok': 'Cost prices saved',
    'save.okBody': '{n} SKUs updated',
    'save.err': 'Could not save',
    'row.save': 'Save this row',
    'row.reset': 'Revert this row',
    'row.ok': 'Row saved',

    'value.noPrice': 'No price',
    'value.noCost': 'No cost',

    'empty.title': 'No SKUs found',
    'empty.hint': 'Clear the search or pick another store',
    'empty.none': 'No products loaded yet',
    'empty.noneHint': 'The catalogue appears here once the sync finishes',

    'leave.confirm': 'You have unsaved changes. Leave this page?',
  },
});

/** Katalog bir marta yuklanadi — filtr/sahifalash brauzerda tez ishlaydi */
const FETCH_SIZE = 500;
const PAGE_SIZE = 25;

type FilterKey = 'all' | 'missing';
type BulkField = 'cost' | 'extra';

interface BulkItem {
  skuId: string;
  purchasePrice: number;
  extraCost: number;
}

export default function CostPrice() {
  const t = useT('costPrice');
  const f = useFormat();
  const qc = useQueryClient();
  const periodQuery = usePeriodQuery();
  const taxRate = useSession((s) => s.me?.company?.taxRate ?? DEFAULTS.taxPct);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<CostEdits>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<BulkField>('cost');
  const [bulkValue, setBulkValue] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim().toLowerCase());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo(
    () => ({ ...periodQuery, page: 1, pageSize: FETCH_SIZE }),
    [periodQuery],
  );

  const products = useQuery({
    queryKey: ['cost-price', query],
    queryFn: () => api.get<ProductsResponse>('/products', query),
    placeholderData: (prev) => prev,
  });

  const assumptions = useMemo<CostAssumptions>(
    () => ({
      commissionPct: DEFAULTS.commissionPct,
      logistics: DEFAULTS.logisticsPerUnit,
      taxPct: taxRate,
    }),
    [taxRate],
  );

  const allRows = useMemo(
    () => flattenSkuRows(products.data?.items.items ?? []),
    [products.data],
  );

  const loadedProducts = products.data?.items.items.length ?? 0;
  const totalProducts = products.data?.items.total ?? 0;
  const truncated = totalProducts > loadedProducts;

  /** Serverdagi holat bo'yicha tannarxsizlar — filtr shu ro'yxat ustida ishlaydi
   *  (tahrir paytida qator ko'zdan yo'qolib qolmasligi uchun) */
  const missingSavedIds = useMemo(
    () => new Set(allRows.filter((r) => r.purchasePrice <= 0).map((r) => r.skuId)),
    [allRows],
  );

  /** Tahrirlarni hisobga olgan jonli hisob */
  const missingNow = useMemo(
    () => allRows.filter((r) => effectiveCost(r, edits) <= 0).length,
    [allRows, edits],
  );

  const dirtyRows = useMemo(() => allRows.filter((r) => isRowDirty(r, edits)), [allRows, edits]);

  const avgMargin = useMemo(() => {
    const values: number[] = [];
    for (const row of allRows) {
      const econ = rowEconomics(
        row.price,
        effectiveCost(row, edits),
        effectiveExtra(row, edits),
        assumptions,
      );
      if (econ) values.push(econ.margin);
    }
    if (!values.length) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [allRows, edits, assumptions]);

  const filtered = useMemo(() => {
    return allRows.filter((row) => {
      if (filter === 'missing' && !missingSavedIds.has(row.skuId)) return false;
      if (!debounced) return true;
      return (
        row.title.toLowerCase().includes(debounced) ||
        row.sku.toLowerCase().includes(debounced) ||
        row.productTitle.toLowerCase().includes(debounced)
      );
    });
  }, [allRows, filter, missingSavedIds, debounced]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => {
    inputsRef.current.length = pageRows.length;
  }, [pageRows.length]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const pageIds = useMemo(() => pageRows.map((r) => r.skuId), [pageRows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));

  // ─────────────────── Tahrir amallari ───────────────────

  const setRowValue = (row: CostRow, field: BulkField, value: number) => {
    setEdits((prev) => {
      const current = prev[row.skuId] ?? { purchasePrice: row.purchasePrice, extraCost: row.extraCost };
      return {
        ...prev,
        [row.skuId]:
          field === 'cost'
            ? { ...current, purchasePrice: value }
            : { ...current, extraCost: value },
      };
    });
  };

  const resetRow = (row: CostRow) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[row.skuId];
      return next;
    });
  };

  const toggleRow = (skuId: string) =>
    setSelected((prev) => (prev.includes(skuId) ? prev.filter((x) => x !== skuId) : [...prev, skuId]));

  const toggleAllOnPage = () =>
    setSelected((prev) =>
      allPageSelected
        ? prev.filter((id) => !pageIds.includes(id))
        : Array.from(new Set([...prev, ...pageIds])),
    );

  const applyToSelected = () => {
    if (!selected.length) {
      toast.warning(t('bulk.none'));
      return;
    }
    const byId = new Map(allRows.map((r) => [r.skuId, r] as const));
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const row = byId.get(id);
        if (!row) continue;
        const current = next[id] ?? { purchasePrice: row.purchasePrice, extraCost: row.extraCost };
        next[id] =
          bulkField === 'cost'
            ? { ...current, purchasePrice: bulkValue }
            : { ...current, extraCost: bulkValue };
      }
      return next;
    });
    toast.success(t('bulk.done', { n: selected.length }));
  };

  const focusNext = (index: number) => {
    const el = inputsRef.current[index + 1];
    if (el) {
      el.focus();
      el.select();
    } else {
      inputsRef.current[index]?.blur();
    }
  };

  // ─────────────────── Saqlash ───────────────────

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cost-price'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const bulkSave = useMutation({
    mutationFn: (items: BulkItem[]) => api.post<unknown>('/products/sku/bulk-cost', { items }),
    onSuccess: (_res, items) => {
      toast.success(t('save.ok'), t('save.okBody', { n: items.length }));
      setEdits({});
      setSelected([]);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(t('save.err'), err instanceof Error ? err.message : undefined);
    },
  });

  const rowSave = useMutation({
    mutationFn: (item: BulkItem) =>
      api.patch<unknown>(`/products/sku/${item.skuId}`, {
        purchasePrice: item.purchasePrice,
        extraCost: item.extraCost,
      }),
    onMutate: (item) => setSavingId(item.skuId),
    onSuccess: (_res, item) => {
      toast.success(t('row.ok'));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[item.skuId];
        return next;
      });
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(t('save.err'), err instanceof Error ? err.message : undefined);
    },
    onSettled: () => setSavingId(null),
  });

  const saveAll = () => {
    if (!dirtyRows.length) return;
    bulkSave.mutate(
      dirtyRows.map((row) => ({
        skuId: row.skuId,
        purchasePrice: effectiveCost(row, edits),
        extraCost: effectiveExtra(row, edits),
      })),
    );
  };

  // ─────────────────── Saqlanmagan o'zgarishlar ogohlantiruvi ───────────────────

  const dirtyCount = dirtyRows.length;

  useEffect(() => {
    if (dirtyCount === 0) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target && link.target !== '_self') return;
      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('/') || href === window.location.pathname) return;
      if (!window.confirm(t('leave.confirm'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirtyCount, t]);

  // ─────────────────── Jadval ustunlari ───────────────────

  const columns: Column<CostRow>[] = [
    {
      key: 'select',
      width: 40,
      header: (
        <input
          type="checkbox"
          aria-label={t('table.selectAll')}
          checked={allPageSelected}
          onChange={toggleAllOnPage}
          className="h-4 w-4 cursor-pointer rounded border-line bg-surface-2 accent-brand"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={row.title}
          checked={selectedSet.has(row.skuId)}
          onChange={() => toggleRow(row.skuId)}
          className="h-4 w-4 cursor-pointer rounded border-line bg-surface-2 accent-brand"
        />
      ),
    },
    {
      key: 'product',
      header: t('col.product'),
      width: 280,
      render: (row) => <ProductCell title={row.title} subtitle={row.sku} imageUrl={row.imageUrl} size={38} />,
    },
    {
      key: 'price',
      header: t('col.price'),
      align: 'right',
      render: (row) =>
        row.price > 0 ? (
          <span className="tnum text-ink">{f.money(row.price)}</span>
        ) : (
          <span className="text-xs text-muted">{t('value.noPrice')}</span>
        ),
    },
    {
      key: 'cost',
      header: t('col.cost'),
      align: 'right',
      width: 150,
      render: (row, index) => (
        <CostInput
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          value={effectiveCost(row, edits)}
          warn={effectiveCost(row, edits) <= 0}
          dirty={isRowDirty(row, edits)}
          ariaLabel={`${t('col.cost')} — ${row.title}`}
          placeholder="0"
          onChange={(v) => setRowValue(row, 'cost', v)}
          onEnter={() => focusNext(index)}
        />
      ),
    },
    {
      key: 'extra',
      header: t('col.extra'),
      align: 'right',
      width: 150,
      hideOnMobile: true,
      render: (row, index) => (
        <CostInput
          value={effectiveExtra(row, edits)}
          dirty={isRowDirty(row, edits)}
          ariaLabel={`${t('col.extra')} — ${row.title}`}
          placeholder="0"
          onChange={(v) => setRowValue(row, 'extra', v)}
          onEnter={() => focusNext(index)}
        />
      ),
    },
    {
      key: 'margin',
      header: t('col.margin'),
      align: 'right',
      render: (row) => {
        const econ = rowEconomics(
          row.price,
          effectiveCost(row, edits),
          effectiveExtra(row, edits),
          assumptions,
        );
        if (!econ) return <span className="text-xs text-muted">—</span>;
        return <span className={cn('tnum font-semibold', valueTone(econ.margin))}>{f.pct(econ.margin)}</span>;
      },
    },
    {
      key: 'roi',
      header: t('col.roi'),
      align: 'right',
      hideOnMobile: true,
      render: (row) => {
        const econ = rowEconomics(
          row.price,
          effectiveCost(row, edits),
          effectiveExtra(row, edits),
          assumptions,
        );
        if (!econ) return <span className="text-xs text-muted">—</span>;
        return <span className={cn('tnum', valueTone(econ.roi))}>{f.pct(econ.roi)}</span>;
      },
    },
    {
      key: 'sold',
      header: t('col.sold'),
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tnum text-muted">{f.num(row.sold)}</span>,
    },
    {
      key: 'actions',
      header: t('col.actions'),
      align: 'right',
      width: 84,
      render: (row) => {
        if (!isRowDirty(row, edits)) return null;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <IconButton
              label={t('row.save')}
              disabled={savingId === row.skuId}
              className="h-8 w-8 border-brand/40 text-brand"
              onClick={() =>
                rowSave.mutate({
                  skuId: row.skuId,
                  purchasePrice: effectiveCost(row, edits),
                  extraCost: effectiveExtra(row, edits),
                })
              }
            >
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton label={t('row.reset')} className="h-8 w-8" onClick={() => resetRow(row)}>
              <Undo2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        );
      },
    },
  ];

  const hasProducts = allRows.length > 0;

  return (
    <>
      <PageHeader
        icon={<Tags className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="cost_price" />}
        actions={
          <Button
            icon={<Save className="h-4 w-4" />}
            disabled={dirtyCount === 0}
            loading={bulkSave.isPending}
            onClick={saveAll}
          >
            {t('bar.save', { n: dirtyCount })}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="cost_price">
        {products.isError ? (
          <Card>
            <ErrorState
              message={products.error instanceof Error ? products.error.message : undefined}
              onRetry={() => void products.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* ── Tannarxsiz SKU haqida ogohlantirish ── */}
            {!products.isLoading && hasProducts ? (
              missingNow > 0 ? (
                <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 sm:p-5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold text-ink">{t('warn.title', { n: missingNow })}</p>
                    <p className="mt-1 text-sm text-ink-soft">{t('warn.body')}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFilter('missing');
                      setPage(1);
                    }}
                  >
                    {t('warn.action')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-brand/25 bg-brand/10 p-4 sm:p-5">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm font-bold text-ink">{t('warn.ok')}</p>
                    <p className="mt-1 text-sm text-ink-soft">{t('warn.okBody')}</p>
                  </div>
                </div>
              )
            ) : null}

            {/* ── KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.skus')}
                value={f.num(allRows.length)}
                hint={t('kpi.skusHint')}
                icon={<Layers className="h-5 w-5" />}
                loading={products.isLoading}
              />
              <StatCard
                label={t('kpi.missing')}
                value={f.num(missingNow)}
                hint={t('kpi.missingHint')}
                icon={<CircleDollarSign className="h-5 w-5" />}
                tone={missingNow > 0 ? 'warn' : 'brand'}
                loading={products.isLoading}
              />
              <StatCard
                label={t('kpi.margin')}
                value={f.pct(avgMargin)}
                hint={t('kpi.marginHint')}
                icon={<Percent className="h-5 w-5" />}
                tone="info"
                loading={products.isLoading}
              />
              <StatCard
                label={t('kpi.dirty')}
                value={f.num(dirtyCount)}
                hint={t('kpi.dirtyHint')}
                icon={<Coins className="h-5 w-5" />}
                tone={dirtyCount > 0 ? 'violet' : 'brand'}
                loading={products.isLoading}
              />
            </StatGrid>

            {/* ── Ommaviy qo'llash ── */}
            <Card>
              <CardHeader
                icon={<Coins className="h-4 w-4" />}
                title={t('bulk.title')}
                subtitle={t('bulk.subtitle')}
                actions={
                  selected.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">{t('bulk.selected', { n: selected.length })}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                        {t('bulk.clear')}
                      </Button>
                    </div>
                  ) : null
                }
              />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <span className="label">{t('bulk.field')}</span>
                  <Select value={bulkField} onChange={(e) => setBulkField(e.target.value as BulkField)}>
                    <option value="cost">{t('bulk.cost')}</option>
                    <option value="extra">{t('bulk.extra')}</option>
                  </Select>
                </div>
                <div>
                  <span className="label">{t('bulk.value')}</span>
                  <CostInput
                    value={bulkValue}
                    onChange={setBulkValue}
                    onEnter={applyToSelected}
                    ariaLabel={t('bulk.value')}
                    placeholder="0"
                    className="h-[42px] px-3.5 text-left"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    variant="outline"
                    icon={<CornerDownLeft className="h-4 w-4" />}
                    disabled={selected.length === 0}
                    onClick={applyToSelected}
                  >
                    {t('bulk.apply')}
                  </Button>
                </div>
              </CardBody>
            </Card>

            {/* ── Jadval ── */}
            <Card className="overflow-hidden">
              <CardHeader
                title={t('table.title')}
                subtitle={t('hint.assumptions', {
                  c: f.pct(assumptions.commissionPct, 0),
                  l: f.money(assumptions.logistics),
                  t: f.pct(assumptions.taxPct, 0),
                })}
                actions={
                  <Segmented<FilterKey>
                    size="sm"
                    value={filter}
                    onChange={(v) => {
                      setFilter(v);
                      setPage(1);
                    }}
                    options={[
                      { value: 'all', label: t('filter.all'), count: allRows.length },
                      { value: 'missing', label: t('filter.missing'), count: missingSavedIds.size },
                    ]}
                  />
                }
              />

              <div className="flex flex-col gap-3 px-5 pt-3 sm:flex-row sm:items-center">
                <SearchInput
                  className="sm:max-w-xs"
                  value={search}
                  onChange={setSearch}
                  placeholder={t('search.placeholder')}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted sm:ml-auto sm:justify-end">
                  <span className="inline-flex items-center gap-1.5">
                    <CornerDownLeft className="h-3.5 w-3.5" />
                    {t('hint.enter')}
                  </span>
                  {truncated ? (
                    <span className="text-warn">{t('hint.truncated', { n: loadedProducts })}</span>
                  ) : null}
                </div>
              </div>

              <div className={cn('mt-3', products.isFetching && !products.isLoading && 'opacity-70')}>
                <DataTable<CostRow>
                  columns={columns}
                  rows={pageRows}
                  rowKey={(r) => r.skuId}
                  loading={products.isLoading}
                  localSort={false}
                  density="compact"
                  empty={
                    <EmptyState
                      icon={<Tags className="h-6 w-6" />}
                      title={hasProducts ? t('empty.title') : t('empty.none')}
                      hint={hasProducts ? t('empty.hint') : t('empty.noneHint')}
                      action={
                        hasProducts ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSearch('');
                              setFilter('all');
                              setPage(1);
                            }}
                          >
                            {t('filter.all')}
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                  pagination={{
                    page: safePage,
                    pages,
                    total: filtered.length,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                />
              </div>
            </Card>

            {/* ── Saqlash paneli ── */}
            {dirtyCount > 0 ? (
              <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/35 bg-surface/95 p-3.5 shadow-pop backdrop-blur">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/[0.12] text-brand">
                    <Save className="h-4 w-4" />
                  </span>
                  <p className="truncate text-sm font-semibold text-ink">{t('bar.dirty', { n: dirtyCount })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    icon={<RotateCcw className="h-4 w-4" />}
                    onClick={() => setEdits({})}
                    disabled={bulkSave.isPending}
                  >
                    {t('bar.reset')}
                  </Button>
                  <Button icon={<Save className="h-4 w-4" />} loading={bulkSave.isPending} onClick={saveAll}>
                    {t('bar.save', { n: dirtyCount })}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </PlanGate>
    </>
  );
}
