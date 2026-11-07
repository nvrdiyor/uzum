import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Pos {
  top: number;
  left: number;
  width: number;
  /** Pastga sig'magani uchun tugma ustiga ko'chirilgan — qayta o'lchanmaydi */
  flipped: boolean;
}

/**
 * Kichik izoh oynasi ("Qanday hisoblandi?", "Taxminiy hisob"): tugma ostida
 * suzib chiqadi. body'ga portal bilan chiziladi — kartochkaning overflow-hidden'i
 * va sahifa o'ramining transform'i uni kesmaydi; telefonda ham ekran chetidan
 * chiqmaydi. Tashqariga bosish, Escape yoki aylantirish yopadi.
 *
 * Portal ichidagi bosish React daraxti bo'ylab ota elementga ham ko'tariladi —
 * shuning uchun to'xtatiladi: aks holda qarz kartochkasi ochilib ketardi.
 */
export function InfoPopover({
  label,
  title,
  children,
  className,
}: {
  label: ReactNode;
  /** Tugma va oyna nomi (ekran o'quvchi uchun) */
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const open = pos !== null;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const width = Math.min(340, vw - 24);
    const left = Math.max(12, Math.min(r.left, vw - width - 12));
    setPos({ top: r.bottom + 8, left, width, flipped: false });
  };

  // Pastga sig'masa — tugma ustiga (bir marta)
  useLayoutEffect(() => {
    if (!pos || pos.flipped || !panel.current || !btn.current) return;
    const h = panel.current.offsetHeight;
    const r = btn.current.getBoundingClientRect();
    if (pos.top + h > window.innerHeight - 12 && r.top - h - 8 >= 12) setPos({ ...pos, top: r.top - h - 8, flipped: true });
  }, [pos]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (panel.current?.contains(target) || btn.current?.contains(target))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setPos(null);
          else place();
        }}
        className={className}
      >
        {label}
      </button>
      {pos
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={title}
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
              className="z-[120] rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-ink-soft shadow-pop"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
