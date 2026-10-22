import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  CARD_LANGS,
  CARD_LIMITS,
  normalizeCardText,
  parseKeywordTable,
  type CardAuditResult,
  type CardDetailResponse,
  type CardKeywordCoverage,
  type CardKeywordDto,
  type CardKeywordInput,
  type CardLang,
} from '@savdoiq/shared';
import { Check, FileSpreadsheet, Hash, Lightbulb, Plus, Sparkles, Trash2, X } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconButton,
  Segmented,
  Toggle,
  toast,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat, useT, type TFunc } from '@/i18n';
import { cn } from '@/lib/utils';
import { auditFor, CARD_NS, errorText, Hint, useCardCache, useInvalidateCard, type CardTexts } from './shared';

type AddMode = 'manual' | 'import' | 'suggest';
type KeywordSource = CardKeywordDto['source'];

const SOURCE_TONE: Record<KeywordSource, Tone> = { seller: 'brand', auto: 'violet', import: 'info' };

/** Qo'lda yozilgan qatorlar: bo'shliqlar bir xil, takrorlar va mavjudlari tashlanadi */
function parseLines(text: string, existing: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const phrase = raw.replace(/\s+/g, ' ').trim();
    const norm = normalizeCardText(phrase);
    if (norm.length < 2 || norm.length > CARD_LIMITS.keywordMaxChars) continue;
    if (seen.has(norm) || existing.has(norm)) continue;
    seen.add(norm);
    out.push(phrase);
  }
  return out;
}

/**
 * "Kalit so'zlar" bo'limi. Talab (ko'rishlar soni) faqat sotuvchi Uzum
 * kabinetidan import qilganda bor — biz uni taxmin qilmaymiz. Nom va
 * tavsifdagi moslik saytning o'zida, audit bilan bir xil qoida bo'yicha.
 */
export function KeywordsTab({
  detail,
  texts,
  audit,
  canEdit,
}: {
  detail: CardDetailResponse;
  texts: CardTexts;
  audit: CardAuditResult;
  canEdit: boolean;
}) {
  const t = useT(CARD_NS);
  const f = useFormat();
  const id = detail.product.id;
  const invalidate = useInvalidateCard(id);
  const patchCache = useCardCache(id);

  const [mode, setMode] = useState<AddMode>('manual');
  const [manual, setManual] = useState('');
  const [table, setTable] = useState('');
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const keywords = detail.keywords;
  const existing = useMemo(() => new Set(keywords.map((k) => normalizeCardText(k.text))), [keywords]);

  /** Har bir ibora (chiqarilganlari ham) uchun moslik — audit bilan bir xil hisob */
  const coverage = useMemo(() => {
    const all = auditFor(
      detail,
      texts,
      keywords.map((k) => ({ text: k.text, demand: k.demand })),
    ).keywords;
    const map = new Map<string, CardKeywordCoverage>();
    keywords.forEach((k, i) => {
      const c = all[i];
      if (c) map.set(k.id, c);
    });
    return map;
  }, [detail, texts, keywords]);

  const rows = useMemo(
    () =>
      [...keywords].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        const da = a.demand ?? -1;
        const db = b.demand ?? -1;
        if (da !== db) return db - da;
        return a.text.localeCompare(b.text);
      }),
    [keywords],
  );

  const manualItems = useMemo(() => parseLines(manual, existing), [manual, existing]);
  const tableItems = useMemo(() => parseKeywordTable(table), [table]);
  const remaining = Math.max(0, CARD_LIMITS.keywordsMax - keywords.length);

  // ─────────── So'rovlar ───────────

  const add = useMutation({
    mutationFn: (v: { items: CardKeywordInput[]; source: KeywordSource }) =>
      api.post<{ items: CardKeywordDto[] }>(`/cards/${id}/keywords`, {
        items: v.items.map((k) => (k.demand ? { text: k.text, demand: k.demand } : { text: k.text })),
        source: v.source,
      }),
    onSuccess: (res, v) => {
      // Server mahsulotning barcha iboralarini qaytaradi
      if (Array.isArray(res?.items)) patchCache((d) => ({ ...d, keywords: res.items }));
      toast.success(t('kw.saved', { n: v.items.length }));
      if (v.source === 'seller') setManual('');
      if (v.source === 'import') setTable('');
      if (v.source === 'auto') {
        const added = new Set(v.items.map((k) => k.text));
        setSuggestions((cur) => (cur ? cur.filter((s) => !added.has(s)) : cur));
        setPicked(new Set());
      }
    },
    onError: (err) => toast.error(t('kw.saveErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; status: CardKeywordDto['status'] }) =>
      api.patch<CardKeywordDto>(`/cards/${id}/keywords/${v.id}`, { status: v.status }),
    onSuccess: (res, v) =>
      patchCache((d) => ({
        ...d,
        keywords: d.keywords.map((k) => (k.id === v.id ? (res?.id ? res : { ...k, status: v.status }) : k)),
      })),
    onError: (err) => toast.error(t('kw.updErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const remove = useMutation({
    mutationFn: (kwId: string) => api.del<{ ok: true }>(`/cards/${id}/keywords/${kwId}`),
    onSuccess: (_res, kwId) => {
      patchCache((d) => ({ ...d, keywords: d.keywords.filter((k) => k.id !== kwId) }));
      toast.success(t('kw.deleted'));
    },
    onError: (err) => toast.error(t('kw.delErr'), errorText(err)),
    onSettled: () => void invalidate(),
  });

  const suggest = useMutation({
    mutationFn: () => api.post<{ items: string[] }>(`/cards/${id}/keywords/suggest`),
    onSuccess: (res) => {
      const items = (res.items ?? []).filter((s) => !existing.has(normalizeCardText(s)));
      setSuggestions(items);
      setPicked(new Set(items));
    },
    onError: (err) => toast.error(t('kw.suggestErr'), errorText(err)),
  });

  /**
   * Kartochkadagi chegaradan oshmasin — ortiqchasi tashlanadi va sotuvchiga aytiladi.
   * Bor iboralar (importda talabi yangilanadi) chegaraga kirmaydi, faqat yangilari
   * sanaladi: aks holda server butun importni rad etardi.
   */
  const send = (items: CardKeywordInput[], source: KeywordSource) => {
    if (items.length === 0) return;
    const known = items.filter((k) => existing.has(normalizeCardText(k.text)));
    const fresh = items.filter((k) => !existing.has(normalizeCardText(k.text)));
    const capped = [...known, ...fresh.slice(0, remaining)];
    if (fresh.length > remaining) {
      if (capped.length === 0) {
        toast.warning(t('kw.limit', { max: CARD_LIMITS.keywordsMax }));
        return;
      }
      toast.info(t('kw.limit', { max: CARD_LIMITS.keywordsMax }));
    }
    add.mutate({ items: capped, source });
  };

  const demandKnown = tableItems.filter((k) => k.demand).length;
  const cov = audit.coverage;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader
          icon={<Hash />}
          title={t('kw.title')}
          subtitle={t('kw.subtitle')}
          actions={
            cov.total > 0 ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={cov.inTitle / cov.total >= 0.5 ? 'brand' : 'warn'}>
                  {t('kw.inTitleShort', { n: cov.inTitle, total: cov.total })}
                </Badge>
                <Badge tone="muted">{t('kw.inAnyShort', { n: cov.inAny, total: cov.total })}</Badge>
                {cov.demandTotal > 0 ? (
                  <Badge tone="info">{t('kw.demandShort', { pct: f.pct((cov.demandCovered / cov.demandTotal) * 100, 0) })}</Badge>
                ) : null}
              </span>
            ) : undefined
          }
        />
        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState icon={<Hash className="h-6 w-6" />} title={t('kw.empty')} hint={t('kw.emptyHint')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="table-head border-b border-line px-4 py-2.5 text-left">{t('kw.col.text')}</th>
                    <th className="table-head border-b border-line px-3 py-2.5 text-right">{t('kw.col.demand')}</th>
                    <th className="table-head border-b border-line px-3 py-2.5 text-left">{t('kw.col.title')}</th>
                    <th className="table-head border-b border-line px-3 py-2.5 text-left">{t('kw.col.desc')}</th>
                    <th className="table-head border-b border-line px-3 py-2.5 text-left">{t('kw.col.source')}</th>
                    <th className="table-head border-b border-line px-3 py-2.5 text-left">{t('kw.col.status')}</th>
                    {canEdit ? <th className="table-head border-b border-line px-3 py-2.5" aria-label={t('kw.delete')} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((k) => {
                    const c = coverage.get(k.id);
                    const busy =
                      (patch.isPending && patch.variables?.id === k.id) || (remove.isPending && remove.variables === k.id);
                    return (
                      <tr
                        key={k.id}
                        className={cn('border-b border-line/60 last:border-0', k.status === 'excluded' && 'opacity-60')}
                      >
                        <td className="max-w-[280px] px-4 py-2.5">
                          <span className="break-words font-medium text-ink">{k.text}</span>
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-2.5 text-right">
                          {k.demand !== null ? (
                            <span className="font-semibold text-ink">{f.num(k.demand)}</span>
                          ) : (
                            <span className="cursor-help text-muted" title={t('kw.demandNone')}>
                              {'—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Marks values={c?.inTitle ?? {}} t={t} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Marks values={c?.inDescription ?? {}} t={t} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={SOURCE_TONE[k.source]}>{t(`kw.source.${k.source}`)}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {canEdit ? (
                            <div className="flex items-center gap-2">
                              <Toggle
                                checked={k.status === 'active'}
                                onChange={(v) => {
                                  if (!busy) patch.mutate({ id: k.id, status: v ? 'active' : 'excluded' });
                                }}
                              />
                              <span className="whitespace-nowrap text-xs text-muted">{t(`kw.status.${k.status}`)}</span>
                            </div>
                          ) : (
                            <Badge tone={k.status === 'active' ? 'brand' : 'muted'}>{t(`kw.status.${k.status}`)}</Badge>
                          )}
                        </td>
                        {canEdit ? (
                          <td className="px-3 py-2.5 text-right">
                            <IconButton
                              label={t('kw.delete')}
                              disabled={busy}
                              onClick={() => remove.mutate(k.id)}
                              className="h-8 w-8 hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {rows.length > 0 ? <p className="px-5 pb-4 pt-3 text-xs text-muted">{t('kw.matchNote')}</p> : null}
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader
            icon={<Plus />}
            title={t('kw.add.title')}
            subtitle={t('kw.add.subtitle', { n: keywords.length, max: CARD_LIMITS.keywordsMax })}
          />
          <CardBody className="space-y-4">
            <Segmented<AddMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'manual', label: t('kw.mode.manual') },
                { value: 'import', label: t('kw.mode.import') },
                { value: 'suggest', label: t('kw.mode.suggest') },
              ]}
            />

            {mode === 'manual' ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="kw-manual" className="label">
                    {t('kw.manual.label')}
                  </label>
                  <textarea
                    id="kw-manual"
                    rows={6}
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder={t('kw.manual.placeholder')}
                    className="input resize-y"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted">{t('kw.manual.count', { n: manualItems.length })}</span>
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    loading={add.isPending && add.variables?.source === 'seller'}
                    disabled={manualItems.length === 0}
                    onClick={() => send(manualItems.map((text) => ({ text })), 'seller')}
                  >
                    {t('kw.manual.add')}
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === 'import' ? (
              <div className="space-y-3">
                <Hint>{t('kw.import.hint')}</Hint>
                <div>
                  <label htmlFor="kw-import" className="label">
                    {t('kw.import.label')}
                  </label>
                  <textarea
                    id="kw-import"
                    rows={7}
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    placeholder={t('kw.import.placeholder')}
                    className="input resize-y font-mono text-xs"
                  />
                </div>
                {tableItems.length > 0 ? (
                  <div className="rounded-xl border border-line bg-surface-2 p-3">
                    <p className="text-xs font-semibold text-ink">
                      {t('kw.import.parsed', { n: tableItems.length, d: demandKnown })}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {tableItems.slice(0, 5).map((k) => (
                        <li key={k.text} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-ink-soft">{k.text}</span>
                          <span className="tnum shrink-0 text-muted">{k.demand ? f.num(k.demand) : '—'}</span>
                        </li>
                      ))}
                      {tableItems.length > 5 ? (
                        <li className="text-xs text-muted">{t('kw.import.more', { n: tableItems.length - 5 })}</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    icon={<FileSpreadsheet className="h-4 w-4" />}
                    loading={add.isPending && add.variables?.source === 'import'}
                    disabled={tableItems.length === 0}
                    onClick={() => send(tableItems, 'import')}
                  >
                    {t('kw.import.btn')}
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === 'suggest' ? (
              <div className="space-y-3">
                <Hint>{t('kw.suggest.hint')}</Hint>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={suggestions ? 'outline' : 'primary'}
                    icon={<Lightbulb className="h-4 w-4" />}
                    loading={suggest.isPending}
                    onClick={() => suggest.mutate()}
                  >
                    {suggestions ? t('kw.suggest.again') : t('kw.suggest.btn')}
                  </Button>
                  {suggestions && suggestions.length > 0 ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(suggestions))}>
                        {t('kw.suggest.all')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                        {t('kw.suggest.clear')}
                      </Button>
                    </>
                  ) : null}
                </div>
                {suggestions && suggestions.length === 0 ? (
                  <p className="text-sm text-muted">{t('kw.suggest.none')}</p>
                ) : null}
                {suggestions && suggestions.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s) => {
                        const on = picked.has(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setPicked((cur) => {
                                const next = new Set(cur);
                                if (next.has(s)) next.delete(s);
                                else next.add(s);
                                return next;
                              })
                            }
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                              on
                                ? 'border-brand/50 bg-brand/10 text-brand-ink'
                                : 'border-line bg-surface-2 text-muted hover:text-ink',
                            )}
                          >
                            {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        icon={<Sparkles className="h-4 w-4" />}
                        loading={add.isPending && add.variables?.source === 'auto'}
                        disabled={picked.size === 0}
                        onClick={() => send([...picked].map((text) => ({ text })), 'auto')}
                      >
                        {t('kw.suggest.addSelected', { n: picked.size })}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

/** Til bo'yicha belgi: ✓ bor, ✕ yo'q, "—" shu tilda matn kiritilmagan */
function Marks({ values, t }: { values: Partial<Record<CardLang, boolean>>; t: TFunc }) {
  return (
    <span className="flex items-center gap-1">
      {CARD_LANGS.map((lang) => {
        const v = values[lang];
        if (v === undefined) {
          return (
            <span
              key={lang}
              className="chip bg-surface-2 uppercase text-muted/70"
              title={t('kw.noLang', { lang: lang.toUpperCase() })}
            >
              {lang}
              {' —'}
            </span>
          );
        }
        return (
          <span
            key={lang}
            className={cn('chip uppercase', v ? 'bg-brand/10 text-brand-ink' : 'bg-danger/10 text-danger-ink')}
            title={v ? t('kw.yes') : t('kw.no')}
          >
            {v ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {lang}
          </span>
        );
      })}
    </span>
  );
}
