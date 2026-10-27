/**
 * Raqobatchi narxini qo'shish / tahrirlash — kartaning o'zida, oyna ochilmaydi
 * (2026-10-24). Tekshiruv server bilan bir xil qoidalardan (shared
 * COMPETITOR_LIMITS, normalizeCompetitorUrl), lekin hal qiluvchi — server.
 *
 * Havola maydoni oddiy matn (type="url" EMAS): brauzer "uzum.uz/…" kabi
 * sxemasiz nusxani rad etardi, server esa unga https:// qo'shib saqlaydi.
 * Havola faqat saqlanadi — hech qayerda ochilmaydi va o'qilmaydi.
 */
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { COMPETITOR_LIMITS, normalizeCompetitorUrl, priceGapPct, toBusinessDate } from '@savdoiq/shared';
import { Button, Input, Select } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn, groupDigits, parseAmount } from '@/lib/utils';
import './texts';

export interface CompetitorFormSku {
  id: string;
  sku: string;
  /** Variant nomi (mahsulot nomisiz) */
  label: string;
  price: number | null | undefined;
  archived?: boolean;
}

export interface CompetitorFormValue {
  title: string;
  /** Faqat raqamlar */
  price: string;
  url: string;
  /** '' — butun mahsulot */
  skuId: string;
  /** YYYY-MM-DD (Toshkent savdo kuni) */
  checkedAt: string;
  note: string;
}

type FieldError = Partial<Record<'title' | 'price' | 'url' | 'checkedAt', string>>;

export const todayBusiness = (): string => toBusinessDate(new Date());

export function CompetitorForm({
  mode,
  initial,
  skus,
  ourMinPrice,
  breakEven,
  saving,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit';
  initial: CompetitorFormValue;
  skus: CompetitorFormSku[];
  ourMinPrice: number | null | undefined;
  breakEven: number | null | undefined;
  saving: boolean;
  onSubmit: (value: CompetitorFormValue) => void;
  onCancel: () => void;
}) {
  const t = useT('competitors');
  const f = useFormat();
  const today = todayBusiness();
  const [v, setV] = useState<CompetitorFormValue>(initial);
  const [tried, setTried] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);

  const price = parseAmount(v.price);
  const errors: FieldError = {};
  const title = v.title.trim();
  if (!title) errors.title = t('err.title');
  else if (title.length > COMPETITOR_LIMITS.titleMax) errors.title = t('err.titleLong', { n: COMPETITOR_LIMITS.titleMax });
  if (!(price > 0)) errors.price = t('err.price');
  else if (price > COMPETITOR_LIMITS.priceMax) errors.price = t('err.priceMax');
  const url = normalizeCompetitorUrl(v.url);
  if (!url.ok) errors.url = url.reason === 'tooLong' ? t('err.urlLong', { n: COMPETITOR_LIMITS.urlMax }) : t('err.url');
  if (v.checkedAt && v.checkedAt > today) errors.checkedAt = t('err.date');
  const shown: FieldError = tried ? errors : {};

  // Jonli taqqoslash: tanlangan variant narxi, bo'lmasa eng arzon faol variant
  const linked = v.skuId ? skus.find((s) => s.id === v.skuId && !s.archived) : undefined;
  const ref = linked && typeof linked.price === 'number' && linked.price > 0 ? linked.price : (ourMinPrice ?? null);
  const diff = price > 0 ? priceGapPct(price, ref) : null;
  const below = price > 0 && typeof breakEven === 'number' && breakEven > 0 && price < breakEven;

  const set = (patch: Partial<CompetitorFormValue>) => setV((cur) => ({ ...cur, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(errors).length > 0 || saving) return;
    onSubmit({ ...v, title, price: String(price) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const diffText =
    diff === null
      ? null
      : diff < 0
        ? t('diff.cheaper', { v: f.pct(Math.abs(diff)) })
        : diff > 0
          ? t('diff.pricier', { v: f.pct(Math.abs(diff)) })
          : t('diff.same');

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      noValidate
      className="well space-y-3 p-3.5 sm:p-4"
      aria-label={mode === 'add' ? t('form.addTitle') : t('form.editTitle')}
    >
      <p className="eyebrow">{mode === 'add' ? t('form.addTitle') : t('form.editTitle')}</p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Field label={t('form.title')} error={shown.title}>
          <Input
            value={v.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={t('form.titlePh')}
            maxLength={COMPETITOR_LIMITS.titleMax}
            autoFocus
            autoComplete="off"
            aria-invalid={Boolean(shown.title)}
          />
        </Field>
        <Field label={t('form.price')} error={shown.price}>
          <Input
            value={priceFocused ? v.price : groupDigits(price)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
              // Tahrirda narx o'zgarsa — sana ham bugun (server ham shunday qiladi), agar sotuvchi o'zi tanlamagan bo'lsa
              set(mode === 'edit' && !dateTouched ? { price: digits, checkedAt: today } : { price: digits });
            }}
            onFocus={() => setPriceFocused(true)}
            onBlur={() => setPriceFocused(false)}
            inputMode="numeric"
            placeholder="0"
            className="tnum text-right"
            autoComplete="off"
            aria-invalid={Boolean(shown.price)}
          />
        </Field>
      </div>

      <Field label={t('form.url')} error={shown.url} hint={t('form.urlHint')}>
        <Input
          value={v.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder={t('form.urlPh')}
          inputMode="url"
          maxLength={COMPETITOR_LIMITS.urlMax}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(shown.url)}
        />
      </Field>

      <div className={cn('grid gap-3', skus.length > 1 ? 'sm:grid-cols-2' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
        {skus.length > 1 ? (
          <Field label={t('form.sku')}>
            <Select value={v.skuId} onChange={(e) => set({ skuId: e.target.value })}>
              <option value="">{t('form.skuAll')}</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {typeof s.price === 'number' && s.price > 0 ? ` · ${f.money(s.price)}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={t('form.checkedAt')} error={shown.checkedAt}>
          <Input
            type="date"
            value={v.checkedAt}
            max={today}
            onChange={(e) => {
              setDateTouched(true);
              set({ checkedAt: e.target.value || today });
            }}
            aria-invalid={Boolean(shown.checkedAt)}
          />
        </Field>
        <Field label={t('form.note')} className={skus.length > 1 ? 'sm:col-span-2' : undefined}>
          <Input
            value={v.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder={t('form.notePh')}
            maxLength={COMPETITOR_LIMITS.noteMax}
            autoComplete="off"
          />
        </Field>
      </div>

      {diffText !== null && ref !== null ? (
        <p className={cn('tnum text-xs', below ? 'font-medium text-danger-ink' : 'text-muted')}>
          {t('form.preview', { our: f.money(ref), diff: diffText })}
          {below ? ` · ${t('form.previewBelow', { v: f.money(breakEven as number) })}` : ''}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {t('form.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {t('form.save')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-danger-ink">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-2xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
