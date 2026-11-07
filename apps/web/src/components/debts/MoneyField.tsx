/**
 * Pul maydoni — qarz shakli va yozuv oynasi uchun.
 *
 *  • fokussiz — mingliklar bo'yicha ajratilgan ("50 000 000"), fokusda — toza
 *    raqam (CostInput dagidek);
 *  • kasr bor: dollarda sent, bank SMS'idagi tiyin. lib/utils parseAmount
 *    vergulni tashlab yuborardi ("1 250,5" → 12505), shuning uchun o'z o'quvchisi;
 *  • ostida jonli aks-sado "= 50 mln so‘m" — ortiqcha yozilgan nol darhol
 *    ko'rinadi (50 mln o'rniga 500 mln yozib qo'yish qarzda qimmat xato).
 *
 * Tushunib bo'lmaydigan matn qiymatni NaN qiladi: shakl uni jimgina eski
 * raqam bilan saqlab yubormaydi, "Raqamni tekshiring" deydi.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { DebtCurrency } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { compactMoney, moneyInputText, parseMoney, rawMoneyText } from './format';

export function MoneyField({
  label,
  labelAside,
  value,
  onChange,
  currency,
  hint,
  error,
  placeholder,
  autoFocus,
  disabled,
  className,
}: {
  label?: ReactNode;
  /** Yorliq qatorining o'ng chetida (masalan, valyuta tanlagich) */
  labelAside?: ReactNode;
  /** null — bo'sh; NaN — tushunib bo'lmaydigan matn yozilgan */
  value: number | null;
  onChange: (v: number | null) => void;
  currency: DebtCurrency;
  hint?: ReactNode;
  /** Shakl tekshiruvi xatosi (maydon qizil bo'ladi) */
  error?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const t = useT('debts');
  const { lang } = useFormat();
  const id = useId();
  const focused = useRef(false);
  /** Fokusdan keyin foydalanuvchi o'zi yozdimi — yozmagan bo'lsa yangi qiymat ko'rinadi */
  const typed = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(() => rawMoneyText(value, lang));
  const bad = value !== null && Number.isNaN(value);

  // Tashqaridan kelgan qiymat (chip bosildi, taxmin to'ldirildi, yangi ma'lumot keldi) —
  // yozilayotgan matnga tegilmaydi; oyna ochilib avtofokus bo'lgan, lekin hali yozilmagan maydon yangilanadi
  useEffect(() => {
    if ((!focused.current || !typed.current) && !(value !== null && Number.isNaN(value))) setText(rawMoneyText(value, lang));
  }, [value, lang]);

  // Fokussiz — chiroyli ko'rinish; noto'g'ri matn esa o'zicha qoladi (xato ko'rinib tursin)
  const shown = isFocused || bad ? text : moneyInputText(value, lang);
  const unit = currency === 'USD' ? '$' : t('unit.uzs');
  const echo = value !== null && !bad && Math.abs(value) >= 1000 ? compactMoney(value, currency, lang) : null;
  const message = bad ? t('err.number') : (error ?? null);

  return (
    <div className={cn('min-w-0', className)}>
      {label || labelAside ? (
        <div className="mb-1.5 flex min-h-[20px] items-center justify-between gap-2">
          {label ? (
            <label htmlFor={id} className="eyebrow-lg min-w-0 truncate">
              {label}
            </label>
          ) : (
            <span />
          )}
          {labelAside ? <span className="shrink-0">{labelAside}</span> : null}
        </div>
      ) : null}
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder ?? '0'}
          value={shown}
          aria-invalid={message ? true : undefined}
          onFocus={(e) => {
            focused.current = true;
            typed.current = false;
            setIsFocused(true);
            if (!bad) setText(rawMoneyText(value, lang));
            const el = e.currentTarget;
            requestAnimationFrame(() => el.select());
          }}
          onBlur={() => {
            focused.current = false;
            setIsFocused(false);
          }}
          onChange={(e) => {
            const raw = e.target.value;
            typed.current = true;
            setText(raw);
            onChange(parseMoney(raw));
          }}
          className={cn('input tnum pr-14 font-semibold', message && 'border-danger/60')}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
          {unit}
        </span>
      </div>
      {message ? (
        <p className="mt-1.5 text-2xs font-medium leading-snug text-danger-ink">{message}</p>
      ) : echo ? (
        <p className="tnum mt-1.5 text-2xs font-medium leading-snug text-ink-soft">
          {echo.exact ? '=' : '≈'} {echo.text}
        </p>
      ) : null}
      {hint && !message ? <p className={cn('text-2xs leading-relaxed text-muted', echo ? 'mt-0.5' : 'mt-1.5')}>{hint}</p> : null}
    </div>
  );
}
