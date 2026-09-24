import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import type { LoginResponse } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { registerNamespace, useT } from '@/i18n';
import { Button, toast } from '@/components/ui';
import { LogoMark } from '@/components/brand/Logo';

registerNamespace('adminLogin', {
  uz: {
    title: 'Administrator kirishi',
    subtitle: 'Bu sahifa faqat platforma administratorlari uchun',
    username: 'Login',
    password: 'Parol',
    submit: 'Kirish',
    back: '← Oddiy kirishga qaytish',
    'err.bad': 'Login yoki parol noto‘g‘ri',
    'err.disabled': 'Administrator kirishi sozlanmagan',
    'err.generic': 'Kirishda xatolik',
    note: 'Urinishlar cheklangan va qayd etiladi.',
  },
  ru: {
    title: 'Вход администратора',
    subtitle: 'Эта страница только для администраторов платформы',
    username: 'Логин',
    password: 'Пароль',
    submit: 'Войти',
    back: '← Вернуться к обычному входу',
    'err.bad': 'Неверный логин или пароль',
    'err.disabled': 'Вход администратора не настроен',
    'err.generic': 'Ошибка входа',
    note: 'Попытки ограничены и записываются.',
  },
  en: {
    title: 'Administrator sign-in',
    subtitle: 'This page is for platform administrators only',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    back: '← Back to normal sign-in',
    'err.bad': 'Wrong username or password',
    'err.disabled': 'Administrator sign-in is not configured',
    'err.generic': 'Sign-in failed',
    note: 'Attempts are rate-limited and logged.',
  },
});

export default function AdminLogin() {
  const t = useT('adminLogin');
  const navigate = useNavigate();
  const login = useSession((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<LoginResponse>('/auth/admin-login', { username, password });
      await login(res.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      toast.error(
        code === 'admin_disabled' ? t('err.disabled') : code === 'unauthorized' ? t('err.bad') : t('err.generic'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg bg-aurora px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={48} className="mb-3 shadow-[0_10px_30px_-12px_rgb(var(--c-brand)/0.9)]" />
          <h1 className="font-display text-xl font-extrabold tracking-tight text-ink">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="admin-user">
              {t('username')}
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="admin-user"
                className="input pl-9"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="admin-pass">
              {t('password')}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="admin-pass"
                className="input px-9"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:text-ink"
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" loading={busy} disabled={!username || !password}>
            {t('submit')}
          </Button>

          <p className="text-center text-2xs text-muted">{t('note')}</p>
        </form>

        <button
          onClick={() => navigate('/login')}
          className="mx-auto mt-5 block text-sm text-muted transition-colors hover:text-ink"
        >
          {t('back')}
        </button>
      </div>
    </div>
  );
}
