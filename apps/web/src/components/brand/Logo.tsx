import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * SavdoIQ belgisi — yumaloq kvadrat ichida to'lqinlar va o'suvchi ustunlar.
 *
 * Dizayner bergan rasm (PNG) fonni kesishda buzilgan va kichik o'lchamda
 * xiralashardi, shuning uchun belgi vektorda qayta chizilgan: 16 px favicon'dan
 * katta ekrangacha tiniq, yorug' va qorong'i mavzuda bir xil ko'rinadi.
 * `public/favicon.svg` — aynan shu chizma, o'zgartirsangiz ikkalasini ham yangilang.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  // Sahifada bir nechta belgi bo'lsa ham gradient id'lari to'qnashmasin
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      className={cn('shrink-0 rounded-[23%]', className)}
    >
      <defs>
        <clipPath id={id('c')}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
        <linearGradient id={id('bg')} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B4A39" />
          <stop offset=".45" stopColor="#03170F" />
          <stop offset="1" stopColor="#021A13" />
        </linearGradient>
        <linearGradient id={id('top')} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#12B887" />
          <stop offset=".5" stopColor="#3EF0C3" />
          <stop offset="1" stopColor="#22DDA5" />
        </linearGradient>
        <linearGradient id={id('bar')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8CFBE1" />
          <stop offset=".5" stopColor="#2CE9B1" />
          <stop offset="1" stopColor="#14C690" />
        </linearGradient>
        <linearGradient id={id('bot')} x1="0" y1="0" x2="1" y2=".6">
          <stop offset="0" stopColor="#7DF9DA" />
          <stop offset=".45" stopColor="#22E2A7" />
          <stop offset="1" stopColor="#0C9F74" />
        </linearGradient>
      </defs>
      <g clipPath={url('c')}>
        <rect width="64" height="64" fill={url('bg')} />
        <path
          fill={url('top')}
          d="M-2 15C4 14 9 10 14 5.5C18 2 22-.5 30-2H61C57 3.5 50 5.4 42 6.3C32 7.4 24 9 18 14C12 19 6 23.5-2 25Z"
        />
        <g fill={url('bar')} stroke={url('bar')} strokeWidth="2.4" strokeLinejoin="round">
          <path d="M14.6 35.4L24.4 31.2V51H14.6Z" />
          <path d="M30 27.6L39.4 23.4V51H30Z" />
          <path d="M44.2 18.9L53.2 14.8V51H44.2Z" />
        </g>
        <path
          fill={url('bot')}
          d="M-2 50C2 44.2 6 42 11 42.2C22 42.7 34 47.8 44 49.3C51.5 50.4 56.5 48 59.2 42.5C60.8 39.3 61.8 36.2 62.5 33H66V40C60 49.5 50 56 42 59.5C36 62 30 64 26 66H-2Z"
        />
      </g>
      <rect x=".5" y=".5" width="63" height="63" rx="14.5" fill="none" stroke="#5FF5CF" strokeOpacity=".18" />
    </svg>
  );
}

/** "Savdo" — mavzu rangida, "IQ" — brend gradientida */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-logo leading-none tracking-[-0.01em] text-ink', className)}>
      Savdo<span className="bg-brand-grad bg-clip-text text-transparent">IQ</span>
    </span>
  );
}

/** Belgi + yozuv. `compact` — faqat belgi (yig'ilgan yon menyu uchun) */
export function BrandLogo({
  size = 36,
  compact,
  className,
  textClassName,
}: {
  size?: number;
  compact?: boolean;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={size} className="shadow-[0_8px_20px_-8px_rgb(var(--c-brand)/0.8)]" />
      {!compact ? <Wordmark className={cn('text-[21px]', textClassName)} /> : null}
    </span>
  );
}
