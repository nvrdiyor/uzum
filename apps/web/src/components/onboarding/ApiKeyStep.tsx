import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { UzumAccountSummary } from '@savdoiq/shared';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

const SELLER_URL = 'https://seller.uzum.uz';

const GUIDE = [
  { key: 's1', icon: ExternalLink },
  { key: 's2', icon: UserRound },
  { key: 's3', icon: KeyRound },
  { key: 's4', icon: PlusCircle },
  { key: 's5', icon: Copy },
] as const;

/**
 * 3-qadam: Uzum API kalitini ulash — mahsulotning eng muhim ekrani.
 * Chapda qadamma-qadam yo'riqnoma, o'ngda forma va muqobil yo'llar.
 */
export function ApiKeyStep({ onConnected }: { onConnected: () => void }) {
  const t = useT('onboarding');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);

  /** Botda yuborilgan kalit allaqachon ulangan bo'lishi mumkin */
  const accounts = useQuery({
    queryKey: ['onboarding', 'uzum-accounts'],
    queryFn: () => api.get<UzumAccountSummary[]>('/uzum'),
    staleTime: 0,
  });

  const existing = (accounts.data ?? []).find((a) => a.status === 'active' || a.status === 'pending') ?? null;

  const connect = useMutation({
    mutationFn: (body: { label: string; apiKey: string }) => api.post<UzumAccountSummary>('/uzum', body),
    onSuccess: () => onConnected(),
  });

  const keyError = touched && apiKey.trim().length < 8 ? t('api.errKey') : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (apiKey.trim().length < 8) return;
    connect.mutate({ label: label.trim() || t('api.labelDefault'), apiKey: apiKey.trim() });
  };

  /** Demo rejim: haqiqiy kalitsiz namunaviy ma'lumot bilan davom etish */
  const startDemo = () => connect.mutate({ label: t('api.demoLabel'), apiKey: 'demo' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      {/* ── Chap: yo'riqnoma ─────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="border-b border-line bg-aurora px-6 py-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/12 text-brand">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{t('api.guideTitle')}</h2>
              <p className="mt-1 text-sm text-muted">{t('api.guideSubtitle')}</p>
            </div>
          </div>
        </div>

        <ol className="space-y-1 p-4 sm:p-5">
          {GUIDE.map((g, i) => {
            const Icon = g.icon;
            return (
              <li key={g.key} className="flex gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-surface-2/70">
                <div className="relative flex flex-col items-center">
                  <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-xs font-bold text-ink">
                    {i + 1}
                  </span>
                  {i < GUIDE.length - 1 ? <span className="mt-1 w-px flex-1 bg-line" /> : null}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
                    {t(`api.${g.key}.title`)}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(`api.${g.key}.body`)}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="px-5 pb-5">
          <a href={SELLER_URL} target="_blank" rel="noreferrer" className="block">
            <Button variant="outline" className="w-full" iconRight={<ExternalLink className="h-4 w-4" />}>
              {t('api.open')}
            </Button>
          </a>
        </div>
      </div>

      {/* ── O'ng: forma ──────────────────────────────────── */}
      <div className="space-y-4">
        <form onSubmit={submit} className="card overflow-hidden">
          <div className="border-b border-line px-6 py-5">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">{t('api.formTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('api.formSubtitle')}</p>
          </div>

          <div className="space-y-4 p-6">
            {existing ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/8 px-3.5 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{t('api.found', { label: existing.label })}</p>
                  <p className="mt-0.5 text-xs text-muted">{t('api.foundHint')}</p>
                  <Button
                    size="sm"
                    className="mt-2.5"
                    onClick={onConnected}
                    type="button"
                    iconRight={<ArrowRight className="h-3.5 w-3.5" />}
                  >
                    {t('api.continue')}
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <label className="label" htmlFor="ob-key-label">
                {t('api.label')}
              </label>
              <Input
                id="ob-key-label"
                value={label}
                placeholder={t('api.labelPh')}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="ob-key-value">
                {t('api.key')}
              </label>
              <div className="relative">
                <Input
                  id="ob-key-value"
                  type={show ? 'text' : 'password'}
                  value={apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('api.keyPh')}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className={cn('pr-11 font-mono text-xs', keyError && 'border-danger/60')}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? t('api.hide') : t('api.show')}
                  title={show ? t('api.hide') : t('api.show')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {keyError ? <p className="mt-1.5 text-xs text-danger">{keyError}</p> : null}
            </div>

            {connect.isError ? (
              <p className="rounded-xl border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-xs text-danger">
                {connect.error instanceof ApiError ? connect.error.message : t('api.errSave')}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={connect.isPending}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              {t('api.submit')}
            </Button>

            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/70 px-3.5 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink">{t('api.secure.title')}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('api.secure.body')}</p>
              </div>
            </div>
          </div>
        </form>

        {/* Muqobil yo'llar */}
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('api.alt.title')}</p>

          <div className="mt-3 flex items-start gap-2.5">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t('api.alt.bot')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('api.alt.botBody')}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2.5"
                type="button"
                loading={accounts.isFetching}
                onClick={() => void accounts.refetch()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                {t('api.alt.check')}
              </Button>
              {accounts.isFetched && !existing && !accounts.isFetching ? (
                <p className="mt-2 text-xs text-warn">{t('api.alt.notFound')}</p>
              ) : null}
            </div>
          </div>

          <div className="hairline my-4" />

          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t('api.alt.demo')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('api.alt.demoBody')}</p>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="mt-2.5"
                onClick={startDemo}
                disabled={connect.isPending}
                iconRight={<ArrowRight className="h-3.5 w-3.5" />}
              >
                {t('api.alt.demoBtn')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
