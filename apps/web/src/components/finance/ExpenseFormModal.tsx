import { useEffect, useState } from 'react';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@savdoiq/shared';
import { Button, Input, Modal, Select } from '@/components/ui';
import { useStores } from '@/store/session';
import { pickLocalized, useFormat, useLang, useT } from '@/i18n';
import type { ExpenseInput, ExpenseRow } from './types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Xarajat qo'shish / tahrirlash oynasi */
export function ExpenseFormModal({
  open,
  onClose,
  initial,
  saving,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Tahrirlanayotgan yozuv (yangi qo'shishda null) */
  initial?: ExpenseRow | null;
  saving?: boolean;
  onSubmit: (input: ExpenseInput) => void;
}) {
  const t = useT('expenses');
  const tc = useT('common');
  const f = useFormat();
  const lang = useLang();
  const stores = useStores();

  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('marketing');
  const [amount, setAmount] = useState('');
  const [storeId, setStoreId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date?.slice(0, 10) || today());
    setCategory(initial?.category ?? 'marketing');
    setAmount(initial && initial.amount > 0 ? String(Math.round(initial.amount)) : '');
    setStoreId(initial?.storeId ?? '');
    setNote(initial?.note ?? '');
    setError(null);
  }, [open, initial]);

  const amountValue = Number(amount.replace(/\s/g, ''));
  const valid = Boolean(date) && Number.isFinite(amountValue) && amountValue > 0;

  const submit = () => {
    if (!valid) {
      setError(t('form.invalid'));
      return;
    }
    setError(null);
    onSubmit({
      date,
      category,
      amount: Math.round(amountValue),
      storeId: storeId || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('form.editTitle') : t('form.addTitle')}
      description={t('form.description')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {valid ? f.money(Math.round(amountValue)) : t('form.hintAmount')}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {tc('btn.cancel')}
            </Button>
            <Button onClick={submit} loading={saving} disabled={!valid}>
              {tc('btn.save')}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="expense-date">
              {tc('common.date')}
            </label>
            <Input
              id="expense-date"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="expense-category">
              {tc('common.category')}
            </label>
            <Select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickLocalized(c.label, lang)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="expense-amount">
              {tc('common.amount')}
            </label>
            <Input
              id="expense-amount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder="0"
              className="tnum"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="expense-store">
              {tc('common.store')}
            </label>
            <Select id="expense-store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">{t('form.allStores')}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="expense-note">
            {t('form.note')}
          </label>
          <textarea
            id="expense-note"
            className="input min-h-[84px] resize-y"
            maxLength={300}
            placeholder={t('form.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {/* Enter bilan yuborish uchun ko'rinmas tugma */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
