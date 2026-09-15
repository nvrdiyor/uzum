import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Building2, Percent } from 'lucide-react';
import type { CompanySummary } from '@savdoiq/shared';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Tez tanlash uchun eng ko'p uchraydigan soliq stavkalari (%) */
const TAX_PRESETS = [0, 1, 4, 12];

/**
 * 2-qadam: kompaniya nomi va soliq stavkasi.
 * Botda kiritilgan bo'lsa maydonlar oldindan to'ldirilgan bo'ladi.
 */
export function CompanyStep({
  initialName,
  initialTaxRate,
  prefilled,
  onDone,
}: {
  initialName: string;
  initialTaxRate: number;
  prefilled: boolean;
  onDone: () => void;
}) {
  const t = useT('onboarding');
  const [name, setName] = useState(initialName);
  const [taxRate, setTaxRate] = useState(String(initialTaxRate));
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim().length < 2 ? t('company.errName') : null;

  const save = useMutation({
    mutationFn: () =>
      api.patch<CompanySummary>('/company', {
        name: name.trim(),
        taxRate: Number(taxRate) || 0,
      }),
    onSuccess: () => onDone(),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim().length < 2) return;
    save.mutate();
  };

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="card overflow-hidden"
    >
      <div className="border-b border-line bg-aurora px-6 py-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/[0.12] text-brand-ink">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{t('company.title')}</h2>
            <p className="mt-1 text-sm text-muted">{t('company.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {prefilled ? (
          <p className="rounded-xl border border-line bg-brand/5 px-3.5 py-2.5 text-xs text-ink-soft">
            {t('company.prefilled')}
          </p>
        ) : null}

        <div>
          <label className="label" htmlFor="ob-company-name">
            {t('company.name')}
          </label>
          <Input
            id="ob-company-name"
            value={name}
            autoFocus
            placeholder={t('company.namePh')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            className={cn(nameError && 'border-danger/60')}
          />
          {nameError ? <p className="mt-1.5 text-xs text-danger">{nameError}</p> : null}
        </div>

        <div>
          <label className="label" htmlFor="ob-company-tax">
            {t('company.tax')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-32">
              <Input
                id="ob-company-tax"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="tnum pr-8"
              />
              <Percent className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TAX_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTaxRate(String(p))}
                  className={cn(
                    'tnum rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    Number(taxRate) === p
                      ? 'border-brand/50 bg-brand/[0.12] text-brand-ink'
                      : 'border-line bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted">{t('company.taxHint')}</p>
        </div>

        {save.isError ? (
          <p className="rounded-xl border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-xs text-danger-ink">
            {save.error instanceof ApiError ? save.error.message : t('company.errSave')}
          </p>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button type="submit" loading={save.isPending} iconRight={<ArrowRight className="h-4 w-4" />}>
            {t('company.next')}
          </Button>
        </div>
      </div>
    </motion.form>
  );
}
