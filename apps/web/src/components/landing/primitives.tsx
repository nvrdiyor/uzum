import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Landing sahifasining umumiy "atomlari": animatsiya, sarlavha, aurora fon, logo. */

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Telegram bot foydalanuvchi nomi (env: VITE_BOT_USERNAME) */
export const BOT_USERNAME: string = String(import.meta.env.VITE_BOT_USERNAME ?? '').replace(/^@/, '');

export const BOT_LINK = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : 'https://t.me';

/** Scroll'da yumshoq "pastdan yuqoriga" chiqish */
export function FadeUp({
  children,
  delay = 0,
  y = 18,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Sahifa bo'limi qobig'i — bir xil kenglik va yumshoq scroll uchun joy */
export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{ scrollMarginTop: 90 }}
      className={cn('relative mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}
    >
      {children}
    </section>
  );
}

/** Bo'lim sarlavhasi: kichik yorliq + katta sarlavha + tavsif */
export function SectionHead({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto max-w-2xl text-center', className)}>
      {eyebrow ? (
        <span className="chip bg-brand/10 text-brand ring-1 ring-inset ring-brand/20">{eyebrow}</span>
      ) : null}
      <h2 className="text-balance mt-4 font-display text-[28px] font-extrabold leading-[1.15] tracking-tight text-ink sm:text-[38px]">
        {title}
      </h2>
      {subtitle ? <p className="text-balance mt-3.5 text-base leading-relaxed text-muted">{subtitle}</p> : null}
    </div>
  );
}

/** Yumshoq gradient "aurora" fon — sahifaning asosiy kayfiyati */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute -top-56 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand/15 blur-[140px]" />
      <div className="absolute -right-40 top-10 h-[420px] w-[520px] rounded-full bg-violet/12 blur-[130px]" />
      <div className="absolute -left-40 top-[380px] h-[380px] w-[480px] rounded-full bg-info/10 blur-[130px]" />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--c-brand) / 0.35), transparent)' }}
      />
    </div>
  );
}

/** Nozik to'r naqsh — hero fonini "mahsulot"ga o'xshatadi */
export function GridPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage:
          'linear-gradient(rgb(var(--c-border) / 0.55) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-border) / 0.55) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(70% 55% at 50% 0%, rgb(0 0 0 / 0.6), transparent 75%)',
        WebkitMaskImage: 'radial-gradient(70% 55% at 50% 0%, rgb(0 0 0 / 0.6), transparent 75%)',
      }}
    />
  );
}

export function LandingLogo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 outline-none', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-grad text-bg shadow-[0_10px_26px_-10px_rgb(var(--c-brand)/0.95)]">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 15h3.5L8 7l3.5 11L14 12h2" />
          <circle cx="19.5" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className="font-display text-[17px] font-extrabold tracking-tight text-ink">
        Savdo<span className="text-brand">IQ</span>
      </span>
    </Link>
  );
}

/** Telegram ikonkasi (lucide'da yo'q) */
export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.7 3.4 2.9 10.6c-1.1.4-1.1 1.1-.2 1.4l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.2-.5-1.8-1.2-1.5Zm-3.1 3.8-8.6 7.8-.3 3.6-1.8-5.5 10.4-6.5c.4-.3.7-.1.3.6Z" />
    </svg>
  );
}

/** Bo'limlar orasidagi nozik ajratgich */
export function SoftDivider() {
  return (
    <div
      aria-hidden
      className="mx-auto h-px w-full max-w-[1200px]"
      style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--c-border)), transparent)' }}
    />
  );
}

export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
