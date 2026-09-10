import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, Coins, Lock, Percent, Save } from 'lucide-react';
import type { CompanySummary } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Input,
  Select,
  Skeleton,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useT } from '@/i18n';
import { errText } from './types';

const CURRENCIES = ['UZS', 'USD', 'RUB'];

/** 2-bo'lim: kompaniya — nom, soliq stavkasi, valyuta (faqat egasi tahrirlaydi) */
export function CompanySection() {
  const t = useT('settings');
  const qc = useQueryClient();
  const sessionCompany = useSession((s) => s.me?.company ?? null);
  const reloadSession = useSession((s) => s.load);

  const company = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get<CompanySummary>('/company'),
    initialData: sessionCompany ?? undefined,
  });

  const data = company.data ?? sessionCompany;
  const role = data?.role ?? 'viewer';
  const isOwner = role === 'owner';

  const [name, setName] = useState(data?.name ?? '');
  const [taxRate, setTaxRate] = useState(String(data?.taxRate ?? 1));
  const [currency, setCurrency] = useState(data?.currency ?? 'UZS');

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setTaxRate(String(data.taxRate));
    setCurrency(data.currency);
  }, [data?.id, data?.name, data?.taxRate, data?.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body: { name: string; taxRate: number; currency: string }) =>
      api.patch<CompanySummary>('/company', body),
    onSuccess: (res) => {
      qc.setQueryData(['company'], res);
      void qc.invalidateQueries({ queryKey: ['company'] });
      void reloadSession();
      toast.success(t('company.saved'));
    },
    onError: (err) => toast.error(t('company.saveErr'), errText(err)),
  });

  const taxNum = Number(taxRate.replace(',', '.'));
  const taxValid = Number.isFinite(taxNum) && taxNum >= 0 && taxNum <= 50;
  const taxChanged = data ? Math.abs((Number.isFinite(taxNum) ? taxNum : 0) - data.taxRate) > 0.001 : false;
  const dirty = Boolean(
    data && (name.trim() !== data.name || taxChanged || currency !== data.currency),
  );

  const submit = () => {
    if (!isOwner || !taxValid || name.trim().length < 2) return;
    save.mutate({ name: name.trim(), taxRate: taxNum, currency });
  };

  return (
    <Card>
      <CardHeader
        icon={<Building2 className="h-4 w-4" />}
        title={t('company.title')}
        subtitle={t('company.subtitle')}
        actions={
          <Badge tone={isOwner ? 'brand' : 'muted'} dot>
            {t(`team.role.${role}`)}
          </Badge>
        }
      />
      <CardBody className="space-y-5">
        {company.isError && !data ? (
          <ErrorState message={errText(company.error)} onRetry={() => void company.refetch()} />
        ) : company.isLoading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {!isOwner ? (
              <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{t('company.ownerOnly')}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {t('company.ownerOnlyHint', { role: t(`team.role.${role}`) })}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className="label">{t('company.name')}</span>
                <Input
                  value={name}
                  disabled={!isOwner}
                  placeholder={t('company.namePh')}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <span className="label flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5" />
                  {t('company.tax')}
                </span>
                <div className="relative">
                  <Input
                    value={taxRate}
                    disabled={!isOwner}
                    inputMode="decimal"
                    className="tnum pr-9"
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                    %
                  </span>
                </div>
                <p className={`mt-1.5 text-xs ${taxValid ? 'text-muted' : 'text-danger'}`}>{t('company.taxHint')}</p>
              </div>

              <div>
                <span className="label flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5" />
                  {t('company.currency')}
                </span>
                <Select value={currency} disabled={!isOwner} onChange={(e) => setCurrency(e.target.value)}>
                  {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                {data?.id ? (
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {t('company.id')}: <span className="tnum">{data.id}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* ── Soliq o'zgarganda ogohlantirish ── */}
            {taxChanged ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">{t('company.warnTitle')}</p>
                  <p className="mt-1 text-sm text-ink-soft">{t('company.warnBody')}</p>
                </div>
              </div>
            ) : null}

            {isOwner ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  icon={<Save className="h-4 w-4" />}
                  loading={save.isPending}
                  disabled={!dirty || !taxValid || name.trim().length < 2}
                  onClick={submit}
                >
                  {t('btn.save')}
                </Button>
                {dirty ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!data) return;
                      setName(data.name);
                      setTaxRate(String(data.taxRate));
                      setCurrency(data.currency);
                    }}
                  >
                    {t('company.reset')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
