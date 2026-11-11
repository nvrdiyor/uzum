import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * SavdoIQ belgisi (2026-11-12) — binafsha xarid sumkasi: ichida "U" belgisi,
 * ikki ustun va yuqoriga o'suvchi strelka.
 *
 * Egasi bergan rasm (PNG) bo'yicha vektorda chizilgan — koordinatalar asl
 * rasmning pikselidan olingan, shuning uchun 16 px favicon'dan katta ekrangacha
 * tiniq va har mavzuda bir xil. Foni shaffof: yumaloq "plitka" yo'q.
 * `public/favicon.svg` — aynan shu chizma; PNG ikonkalar (public/icons) va
 * og.png ham shu belgida. O'zgartirsangiz hammasini birga yangilang.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  // Sahifada bir nechta belgi bo'lsa ham gradient id'lari to'qnashmasin
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg viewBox="303 235 704 704" width={size} height={size} aria-hidden className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={id('h')} x1="506" y1="0" x2="805" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7E21D3" />
          <stop offset="1" stopColor="#6017BB" />
        </linearGradient>
        <linearGradient id={id('b')} x1="479" y1="342" x2="861" y2="1023" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8E24EC" />
          <stop offset=".1" stopColor="#861FE3" />
          <stop offset=".33" stopColor="#6616C8" />
          <stop offset=".56" stopColor="#410798" />
          <stop offset=".69" stopColor="#540DB2" />
          <stop offset=".8" stopColor="#7618D6" />
          <stop offset="1" stopColor="#9A28F0" />
        </linearGradient>
        <linearGradient id={id('l')} x1="0" y1="730" x2="0" y2="890" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FAF0FD" />
          <stop offset="1" stopColor="#AE6CF9" />
        </linearGradient>
        <linearGradient id={id('r')} x1="0" y1="663" x2="0" y2="872" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FBF2FE" />
          <stop offset="1" stopColor="#A964F9" />
        </linearGradient>
      </defs>
      {/* Dasta — sumka tanasi ostiga kirib turadi */}
      <path fill={url('h')} d="M506.5 410V392a149 149 0 0 1 298 0v18H753v-21.5a97.5 97.5 0 0 0-195 0V410Z" />
      <path
        fill={url('b')}
        d="M467.3 383.5h375.4a80 80 0 0 1 78.1 62.7l80.3 361.6a100 100 0 0 1-97.6 121.7H406.5a100 100 0 0 1-97.6-121.7l80.3-361.6a80 80 0 0 1 78.1-62.7Z"
      />
      <path
        fill="#fff"
        d="M554 467.5a12 12 0 0 1 12-12h17a12 12 0 0 1 12 12V516a60.5 60.5 0 0 0 121 0v-48.5a12 12 0 0 1 12-12h17a12 12 0 0 1 12 12V516a101.5 101.5 0 0 1-203 0Z"
      />
      <rect x="635.5" y="428" width="40" height="90.5" rx="13" fill="#fff" />
      {/* Ustunlarning pasti strelka ostida qoladi */}
      <path fill={url('l')} d="M462 749.5a19 19 0 0 1 19-19h82a19 19 0 0 1 19 19V880l-120 10Z" />
      <path fill={url('r')} d="M611 682.5a19 19 0 0 1 19-19h77a19 19 0 0 1 19 19V822l-115 50Z" />
      <path
        fill="#fff"
        stroke="#fff"
        strokeWidth="6"
        strokeLinejoin="round"
        d="M380 884C600 884 740 790 820 649L771 630L896 558L910 703L871 681C800 800 690 865 575 887C500 904 430 897 380 884Z"
      />
    </svg>
  );
}

/** "IQ" — belgining binafsha rangida (yozuv va belgi bitta logo bo'lib o'qilsin) */
const IQ_GRADIENT = 'linear-gradient(135deg, #B05CFF 0%, #7B2FF0 100%)';

/** "Savdo" — mavzu rangida, "IQ" — belgi gradientida */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-logo leading-none tracking-[-0.01em] text-ink', className)}>
      Savdo
      <span className="bg-clip-text text-transparent" style={{ backgroundImage: IQ_GRADIENT }}>
        IQ
      </span>
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
      <LogoMark size={size} />
      {!compact ? <Wordmark className={cn('text-[21px]', textClassName)} /> : null}
    </span>
  );
}
