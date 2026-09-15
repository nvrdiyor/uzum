import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BellRing, Gift, KeyRound, PackageSearch, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import type { LoginResponse, TelegramAuthPayload } from '@savdoiq/shared';
import { Button, Card, Segmented, toast } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/store/session';
import { BOT_LINK, BOT_USERNAME, EASE, TelegramIcon } from '@/components/landing/primitives';
import { AuthShell, BenefitRow, OrDivider } from '@/components/auth/primitives';
import { CodeInput } from '@/components/auth/CodeInput';
import { TelegramLoginButton, isTelegramWidgetSupported } from '@/components/auth/TelegramWidget';

/** Sahifaga xos qo'shimcha kalitlar (asosiy 'auth' lug'ati components/auth/primitives.tsx da) */
registerNamespace('auth', {
  uz: { 'login.hint': 'Kirish usulini tanlang' },
  ru: { 'login.hint': 'Выберите способ входа' },
  en: { 'login.hint': 'Choose how to sign in' },
});

const REF_KEY = 'sp-ref';
const CODE_LENGTH = 6;

type Method = 'telegram' | 'code';
type Busy = 'telegram' | 'code' | 'demo' | null;

/** ?ref=KOD ni saqlab qo'yamiz — ro'yxatdan o'tishda hamkorga biriktiriladi */
function resolveRef(urlRef: string | null): string {
  const clean = (urlRef ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  try {
    if (clean) {
      localStorage.setItem(REF_KEY, clean);
      return clean;
    }
    return localStorage.getItem(REF_KEY) ?? '';
  } catch {
    return clean;
  }
}

/** Faqat ichki manzillarga qaytaramiz */
function safePath(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  if (path.startsWith('/login') || path.startsWith('/auth')) return '/dashboard';
  return path;
}

function errText(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return undefined;
}

export default function Login() {
  const t = useT('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const me = useSession((s) => s.me);
  const login = useSession((s) => s.login);

  // Domen ulanmagan bo'lsa (IP/localhost) Telegram widget ishlamaydi — darhol bot kodini ochamiz
  const [method, setMethod] = useState<Method>(() => (isTelegramWidgetSupported() ? 'telegram' : 'code'));
  const [code, setCode] = useState('');
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [demoAvailable, setDemoAvailable] = useState(true);
  const [refCode] = useState(() => resolveRef(params.get('ref')));

  const target = safePath((location.state as { from?: string } | null)?.from);
  const botStartLink = BOT_USERNAME ? `${BOT_LINK}?start=login` : BOT_LINK;

  /** Token olindi → sessiyani yuklaymiz va ichkariga o'tamiz */
  const finish = useCallback(
    async (res: LoginResponse) => {
      const next = await login(res.token);
      if (!next) {
        toast.error(t('toast.error'));
        return;
      }
      const name = next.user.firstName ?? next.user.username ?? undefined;
      toast.success(t('toast.welcome'), name ?? undefined);
      navigate(target, { replace: true });
    },
    [login, navigate, t, target],
  );

  // ── 1. Telegram Login Widget ────────────────────────────────
  const handleTelegram = useCallback(
    (payload: TelegramAuthPayload) => {
      setBusy('telegram');
      api
        .post<LoginResponse>('/auth/telegram', { ...payload, ref: refCode || undefined })
        .then(finish)
        .catch((err: unknown) => toast.error(t('toast.error'), errText(err)))
        .finally(() => setBusy(null));
    },
    [finish, refCode, t],
  );

  // ── 2. Botdagi bir martalik kod ─────────────────────────────
  const submitCode = useCallback(
    async (raw: string) => {
      const value = raw.replace(/\D/g, '');
      if (value.length !== CODE_LENGTH) {
        setCodeInvalid(true);
        toast.error(t('err.codeLen'));
        return;
      }
      setBusy('code');
      setCodeInvalid(false);
      try {
        const res = await api.post<LoginResponse>('/auth/bot-code', { code: value, ref: refCode || undefined });
        await finish(res);
      } catch (err) {
        setCodeInvalid(true);
        toast.error(t('toast.error'), errText(err));
      } finally {
        setBusy(null);
      }
    },
    [finish, refCode, t],
  );

  // URL'da ?code=123456 bo'lsa — to'ldirib, darhol yuboramiz
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (autoSubmitted.current) return;
    const fromUrl = (params.get('code') ?? '').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (fromUrl.length !== CODE_LENGTH) return;
    autoSubmitted.current = true;
    setMethod('code');
    setCode(fromUrl);
    void submitCode(fromUrl);
  }, [params, submitCode]);

  // ── 3. Demo rejim ───────────────────────────────────────────
  const handleDemo = useCallback(async () => {
    setBusy('demo');
    try {
      const res = await api.post<LoginResponse>('/auth/demo');
      await finish(res);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        setDemoAvailable(false);
        toast.info(t('err.demo'));
      } else {
        toast.error(t('toast.error'), errText(err));
      }
    } finally {
      setBusy(null);
    }
  }, [finish, t]);

  if (me) return <Navigate to={target} replace />;

  const loading = busy !== null;

  return (
    <AuthShell className="justify-center">
      <div className="mx-auto grid w-full max-w-[1120px] items-center gap-12 lg:grid-cols-[1.05fr_minmax(0,430px)] lg:gap-16">
        {/* ───────── Chap ustun: brend bloki (faqat lg dan yuqorida) ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
          className="hidden lg:block"
        >
          <span className="chip bg-brand/10 text-brand ring-1 ring-inset ring-brand/20">
            <Sparkles className="h-3.5 w-3.5" />
            {t('side.eyebrow')}
          </span>

          <h1 className="text-balance mt-5 max-w-lg font-display text-[38px] font-extrabold leading-[1.1] tracking-tight text-ink xl:text-[44px]">
            {t('side.title')}
          </h1>
          <p className="text-balance mt-4 max-w-md text-base leading-relaxed text-muted">{t('side.subtitle')}</p>

          <ul className="mt-9 max-w-md space-y-6">
            <BenefitRow icon={<TrendingUp className="h-5 w-5" />} title={t('side.b1.t')} text={t('side.b1.d')} />
            <BenefitRow icon={<PackageSearch className="h-5 w-5" />} title={t('side.b2.t')} text={t('side.b2.d')} />
            <BenefitRow icon={<BellRing className="h-5 w-5" />} title={t('side.b3.t')} text={t('side.b3.d')} />
          </ul>

          <p className="mt-9 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand" />
            {t('side.note')}
          </p>
        </motion.div>

        {/* ───────── O'ng ustun: kirish kartasi ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
          className="w-full max-w-[440px] justify-self-center lg:justify-self-end"
        >
          <Card className="p-5 sm:p-7">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              {t('card.title')}
            </h2>
            <p className="mt-1.5 text-sm text-muted">{t('card.subtitle')}</p>

            {refCode ? (
              <span className="chip mt-4 bg-violet/[0.12] text-violet">
                <Gift className="h-3.5 w-3.5" />
                {t('ref.badge', { code: refCode })}
              </span>
            ) : null}

            <div role="group" aria-label={t('login.hint')} className="mt-5">
              <Segmented
                value={method}
                onChange={(v) => setMethod(v)}
                options={[
                  {
                    value: 'telegram',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <TelegramIcon className="h-3.5 w-3.5" />
                        {t('tab.telegram')}
                      </span>
                    ),
                  },
                  {
                    value: 'code',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5" />
                        {t('tab.code')}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {method === 'telegram' ? (
                <motion.div
                  key="telegram"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm leading-relaxed text-muted">{t('tg.hint')}</p>
                  <TelegramLoginButton onAuth={handleTelegram} disabled={loading} />
                  <ul className="space-y-1.5 pt-1">
                    {[t('tg.safe1'), t('tg.safe2')].map((x) => (
                      <li key={x} className="flex items-center gap-2 text-2xs text-muted">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-brand" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ) : (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm leading-relaxed text-muted">{t('code.hint')}</p>

                  <div>
                    <span className="label">{t('code.label')}</span>
                    <CodeInput
                      value={code}
                      onChange={(v) => {
                        setCode(v);
                        setCodeInvalid(false);
                      }}
                      onComplete={(v) => void submitCode(v)}
                      length={CODE_LENGTH}
                      disabled={busy === 'code'}
                      invalid={codeInvalid}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="flex-1"
                      loading={busy === 'code'}
                      disabled={loading || code.length !== CODE_LENGTH}
                      onClick={() => void submitCode(code)}
                    >
                      {t('code.submit')}
                    </Button>
                    <a href={botStartLink} target="_blank" rel="noreferrer" className="sm:w-auto">
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={loading}
                        icon={<TelegramIcon className="h-4 w-4" />}
                      >
                        {t('code.openBot')}
                      </Button>
                    </a>
                  </div>

                  <p className="text-2xs text-muted">{t('code.expire')}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {demoAvailable ? (
              <div className="mt-6 space-y-3">
                <OrDivider label={t('or')} />
                <Button
                  variant="outline"
                  className="w-full"
                  icon={<Sparkles className="h-4 w-4" />}
                  loading={busy === 'demo'}
                  disabled={loading}
                  onClick={() => void handleDemo()}
                >
                  {t('demo.btn')}
                </Button>
                <p className="text-center text-2xs leading-relaxed text-muted">{t('demo.hint')}</p>
              </div>
            ) : null}

            <div className="mt-6 border-t border-line pt-4 text-center text-xs text-muted">
              {t('foot.noAccount')}{' '}
              <a
                href={botStartLink}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                {t('foot.start')}
              </a>
            </div>
          </Card>

          <Link
            to="/"
            className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('foot.back')}
          </Link>
        </motion.div>
      </div>
    </AuthShell>
  );
}
