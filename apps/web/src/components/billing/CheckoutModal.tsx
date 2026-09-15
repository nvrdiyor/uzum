/**
 * To'lov oynasi: oy soni, to'lov usuli, referal bonus va yakuniy summa hisobi.
 * `POST /billing/subscribe` → payUrl bo'lsa provayder sahifasi ochiladi,
 * qo'lda to'lovda esa rekvizit va admin tasdig'i haqidagi ko'rsatma ko'rsatiladi.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BadgePercent,
  Check,
  Copy,
  CreditCard,
  Gift,
  Landmark,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { APP, planPrice, type InvoiceRow, type PlanPublic } from '@savdoiq/shared';
import { Badge, Button, Modal, Segmented, toast } from '@/components/ui';
import { BOT_URL as BOT_URL_SHARED } from '@/lib/bot';
import { api } from '@/lib/api';
import { copyToClipboard, cn } from '@/lib/utils';
import { useFormat, useT } from '@/i18n';

export type Months = '1' | '3' | '6' | '12';
export type Provider = 'payme' | 'click' | 'manual';

const PROVIDERS: { value: Provider; icon: typeof Wallet }[] = [
  { value: 'payme', icon: Wallet },
  { value: 'click', icon: CreditCard },
  { value: 'manual', icon: Landmark },
];

const BOT_URL = BOT_URL_SHARED;
const PAY_CARD = import.meta.env.VITE_PAY_CARD as string | undefined;
const PAY_CARD_HOLDER = import.meta.env.VITE_PAY_CARD_HOLDER as string | undefined;

export function CheckoutModal({
  open,
  plan,
  defaultMonths,
  bonus,
  onClose,
  onPaid,
}: {
  open: boolean;
  plan: PlanPublic | null;
  defaultMonths: Months;
  bonus: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const t = useT('pricing');
  const f = useFormat();

  const [months, setMonths] = useState<Months>(defaultMonths);
  const [provider, setProvider] = useState<Provider>('payme');
  const [useBonus, setUseBonus] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    if (open) {
      setMonths(defaultMonths);
      setProvider('payme');
      setUseBonus(bonus > 0);
      setInvoice(null);
    }
  }, [open, defaultMonths, bonus]);

  const n = Number(months);
  const calc = useMemo(() => {
    if (!plan) return { base: 0, discount: 0, afterDiscount: 0, bonusUsed: 0, total: 0, discountPct: 0 };
    const base = plan.price * n;
    const afterDiscount = planPrice(plan.id, n);
    const discount = Math.max(0, base - afterDiscount);
    const bonusUsed = useBonus ? Math.min(Math.max(0, bonus), afterDiscount) : 0;
    return {
      base,
      discount,
      afterDiscount,
      bonusUsed,
      total: Math.max(0, afterDiscount - bonusUsed),
      discountPct: base > 0 ? Math.round((discount / base) * 100) : 0,
    };
  }, [plan, n, bonus, useBonus]);

  const subscribe = useMutation({
    mutationFn: () =>
      api.post<InvoiceRow>('/billing/subscribe', {
        plan: plan?.id,
        months: n,
        provider,
        useBonus,
      }),
    onSuccess: (inv) => {
      onPaid();
      if (inv?.payUrl) {
        window.open(inv.payUrl, '_blank', 'noopener,noreferrer');
        toast.success(t('pay.opened'), t('pay.openedBody'));
        onClose();
        return;
      }
      setInvoice(inv ?? null);
      toast.success(t('pay.created'), t('pay.createdBody'));
    },
    onError: (err: unknown) => {
      toast.error(t('pay.error'), err instanceof Error ? err.message : undefined);
    },
  });

  const copy = (value: string) => {
    void copyToClipboard(value).then(() => toast.success(t('pay.copied')));
  };

  if (!plan) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('pay.title', { plan: plan.name })}
      description={t('pay.subtitle')}
      footer={
        invoice ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">{t('pay.manualFooter')}</p>
            <Button variant="outline" onClick={onClose}>
              {t('pay.close')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t('pay.total')}</p>
              <p className="tnum font-display text-xl font-extrabold text-ink">{f.money(calc.total)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t('pay.cancel')}
              </Button>
              <Button
                icon={<ShieldCheck className="h-4 w-4" />}
                loading={subscribe.isPending}
                onClick={() => subscribe.mutate()}
              >
                {t('pay.submit')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {invoice ? (
        <ManualInstructions invoice={invoice} onCopy={copy} />
      ) : (
        <div className="space-y-6">
          {/* Muddat */}
          <div>
            <span className="label">{t('pay.months')}</span>
            <div className="overflow-x-auto no-scrollbar">
              <Segmented<Months>
                options={[
                  { value: '1', label: t('pay.m1') },
                  { value: '3', label: t('pay.m3') },
                  { value: '6', label: t('pay.m6') },
                  { value: '12', label: t('pay.m12') },
                ]}
                value={months}
                onChange={setMonths}
              />
            </div>
            {n >= 12 && plan.yearlyDiscount > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-ink">
                <BadgePercent className="h-3.5 w-3.5" />
                {t('pay.yearlyHint', { pct: plan.yearlyDiscount })}
              </p>
            ) : null}
          </div>

          {/* To'lov usuli */}
          <div>
            <span className="label">{t('pay.method')}</span>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                const active = provider === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setProvider(p.value)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ease-spring',
                      active
                        ? 'border-brand/50 bg-brand/10 shadow-glow'
                        : 'border-line bg-surface-2 hover:border-line-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-brand/[0.12] text-brand-ink' : 'bg-surface-3 text-muted',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{t(`pay.${p.value}`)}</span>
                      <span className="block truncate text-2xs text-muted">{t(`pay.${p.value}Hint`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Referal bonus */}
          {bonus > 0 ? (
            <button
              type="button"
              onClick={() => setUseBonus((v) => !v)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-200',
                useBonus ? 'border-brand/45 bg-brand/10' : 'border-line bg-surface-2 hover:border-line-strong',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  useBonus ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface',
                )}
              >
                {useBonus ? <Check className="h-3 w-3" /> : null}
              </span>
              <Gift className="h-4 w-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{t('pay.bonus')}</span>
                <span className="block text-xs text-muted">
                  {t('pay.bonusHint', { amount: f.money(bonus) })}
                </span>
              </span>
            </button>
          ) : null}

          {/* Hisob */}
          <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
            <Row label={t('pay.rowBase', { n })} value={f.money(calc.base)} />
            {calc.discount > 0 ? (
              <Row
                label={t('pay.rowDiscount', { pct: calc.discountPct })}
                value={`− ${f.money(calc.discount)}`}
                tone="brand"
              />
            ) : null}
            {calc.bonusUsed > 0 ? (
              <Row label={t('pay.rowBonus')} value={`− ${f.money(calc.bonusUsed)}`} tone="brand" />
            ) : null}
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="text-sm font-semibold text-ink">{t('pay.total')}</span>
              <span className="tnum font-display text-lg font-extrabold text-ink">{f.money(calc.total)}</span>
            </div>
            {n >= 12 && plan.yearlyDiscount > 0 ? (
              <div className="mt-3">
                <Badge tone="brand">{t('pay.twoMonthsFree')}</Badge>
              </div>
            ) : null}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            {t('pay.note')}
          </p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'brand' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm text-muted">{label}</span>
      <span className={cn('tnum text-sm font-semibold', tone === 'brand' ? 'text-brand-ink' : 'text-ink')}>{value}</span>
    </div>
  );
}

/** Qo'lda to'lov ko'rsatmasi */
function ManualInstructions({ invoice, onCopy }: { invoice: InvoiceRow; onCopy: (v: string) => void }) {
  const t = useT('pricing');
  const f = useFormat();

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4">
        <p className="text-2xs font-semibold uppercase tracking-wider text-brand-ink">{t('pay.invoice')}</p>
        <p className="tnum mt-1 font-display text-2xl font-extrabold text-ink">{f.money(invoice.amount)}</p>
        <p className="mt-1 text-xs text-muted">
          {t('pay.invoiceNo')}: <span className="font-mono text-ink-soft">{invoice.id.slice(0, 10).toUpperCase()}</span>
        </p>
      </div>

      {PAY_CARD ? (
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <p className="label mb-2">{t('pay.card')}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="tnum font-mono text-lg font-bold tracking-wider text-ink">{PAY_CARD}</span>
            <Button size="sm" variant="outline" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => onCopy(PAY_CARD)}>
              {t('pay.copy')}
            </Button>
          </div>
          {PAY_CARD_HOLDER ? <p className="mt-1.5 text-xs text-muted">{PAY_CARD_HOLDER}</p> : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <p className="label mb-1.5">{t('pay.card')}</p>
          <p className="text-sm text-ink-soft">{t('pay.cardFromBot')}</p>
        </div>
      )}

      <ol className="space-y-2.5">
        {['s1', 's2', 's3'].map((k, i) => (
          <li key={k} className="flex gap-3 text-sm text-ink-soft">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-bold text-muted">
              {i + 1}
            </span>
            {t(`pay.${k}`)}
          </li>
        ))}
      </ol>

      <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn/10 p-3.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <p className="text-sm text-ink-soft">{t('pay.adminConfirm')}</p>
      </div>

      <a href={BOT_URL} target="_blank" rel="noreferrer" className="block">
        <Button className="w-full" iconRight={<ArrowUpRight className="h-4 w-4" />}>
          {t('pay.openBot')}
        </Button>
      </a>
    </div>
  );
}
