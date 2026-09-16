import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { TelegramAuthPayload } from '@savdoiq/shared';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { BOT_USERNAME } from '@/components/landing/primitives';

declare global {
  interface Window {
    /** Telegram Login Widget global callback'i (data-onauth) */
    onTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

/**
 * Telegram Login Widget faqat HAQIQIY DOMEN bilan ishlaydi — u domen @BotFather'da
 * /setdomain orqali botga biriktirilgan bo'lishi kerak. IP manzil yoki localhost'da
 * Telegram "Bot domain invalid" xatosini ko'rsatadi, shuning uchun bunday holatda
 * widget umuman yuklanmaydi va foydalanuvchiga bot kodi taklif qilinadi.
 */
export function isTelegramWidgetSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  if (!h) return false;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false; // IPv4
  if (h.includes(':')) return false; // IPv6
  return h.includes('.');
}

/**
 * Telegram Login Widget — skript dinamik yuklanadi, callback `window.onTelegramAuth`
 * ga qo'yiladi va komponent yo'qolganda tozalanadi.
 */
export function TelegramLoginButton({
  onAuth,
  disabled = false,
  className,
}: {
  onAuth: (payload: TelegramAuthPayload) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT('auth');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const authRef = useRef(onAuth);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  /**
   * Domen @BotFather'da botga biriktirilganmi. Biriktirilmagan bo'lsa Telegram
   * foydalanuvchini tasdiqlaydi-yu, ma'lumotni saytga qaytarmaydi: oynacha
   * chiqib yo'qoladi va hech narsa bo'lmaydi. Sabab brauzerga ko'rinmaydi
   * (iframe boshqa domenda), shuning uchun serverdan so'raymiz.
   */
  const [domainOk, setDomainOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTelegramWidgetSupported()) return;
    let alive = true;
    api
      .get<{ ok: boolean }>('/auth/telegram/widget', { origin: window.location.origin })
      .then((r) => {
        if (alive) setDomainOk(r.ok);
      })
      // Tekshiruv o'zi yiqilsa widget'ni to'smaymiz
      .catch(() => alive && setDomainOk(true));
    return () => {
      alive = false;
    };
  }, []);

  // Callback har doim eng so'nggi bo'lsin, lekin skript qayta yuklanmasin
  useEffect(() => {
    authRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    const host = hostRef.current;
    // Domen tekshiruvi tugamaguncha yoki ruxsat bo'lmasa skript yuklanmaydi
    if (!host || !BOT_USERNAME || !isTelegramWidgetSupported() || domainOk !== true) return;

    window.onTelegramAuth = (user: TelegramAuthPayload) => authRef.current(user);

    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.async = true;
    script.setAttribute('data-telegram-login', BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'true');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-request-access', 'write');
    /*
     * `data-onauth` — funksiya NOMI emas, bajariladigan JavaScript IFODASI.
     * Telegram widget'i uni `user` o'zgaruvchisi bilan birga baholaydi, ya'ni
     * chaqiruv qavslari SHART: `onTelegramAuth(user)`.
     *
     * Faqat nom yozilganda ifoda funksiyaga havola berib, uni CHAQIRMASDAN
     * tugaydi: Telegram foydalanuvchini tasdiqlaydi va "saytga kirdingiz"
     * xabarini yuboradi, lekin sahifada hech narsa bo'lmaydi.
     */
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.onload = () => setState('ready');
    script.onerror = () => setState('failed');
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
      delete window.onTelegramAuth;
    };
  }, [domainOk]);

  // Domen botga biriktirilmagan — tugmani ko'rsatish foydasiz, sabab aytamiz
  if (BOT_USERNAME && isTelegramWidgetSupported() && domainOk === false) {
    return (
      <div className={cn('flex gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4', className)}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t('tg.domainOff')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('tg.domainOffHint')}</p>
        </div>
      </div>
    );
  }

  if (BOT_USERNAME && !isTelegramWidgetSupported()) {
    return (
      <div className={cn('flex gap-3 rounded-2xl border border-info/25 bg-info/10 p-4', className)}>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t('tg.noDomain')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('tg.noDomainHint')}</p>
        </div>
      </div>
    );
  }

  if (!BOT_USERNAME) {
    return (
      <div className={cn('flex gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4', className)}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{t('tg.missing')}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t('tg.missingHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-[56px]', className)}>
      <div
        ref={hostRef}
        className={cn(
          'flex justify-center transition-opacity duration-300',
          state === 'ready' ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0',
          disabled && 'pointer-events-none opacity-50',
        )}
      />

      {state === 'loading' ? (
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-11 w-56 rounded-xl" />
          <p className="text-2xs text-muted">{t('tg.loading')}</p>
        </div>
      ) : null}

      {state === 'failed' ? (
        <div className="flex gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-ink-soft">{t('tg.failed')}</p>
        </div>
      ) : null}
    </div>
  );
}
