import type { ReactNode } from 'react';
import { ProductThumb } from '@/components/ui';

/**
 * Jadvaldagi mahsulot katagi — nom IKKI qatorgacha sig'adi.
 *
 * Yadrodagi `ProductCell` nomni bir qatorda kesadi, lekin avtomatik
 * kenglikdagi jadvalda kesish ishlamaydi: ustun to'liq nom kengligiga
 * cho'zilib, 1366px ekranda o'ngdagi pul ustunlari ko'rinmay qolardi
 * (Qaytarishlar, Pullik saqlash, Voronka). Bu yerda nomga eng katta kenglik
 * berilgan va u ikkinchi qatorga o'tadi — raqamlar ekranga sig'adi.
 */
export function ProductTitleCell({
  title,
  subtitle,
  imageUrl,
  size = 40,
  maxWidth = 260,
  minWidth = 150,
  lead,
}: {
  title: string;
  subtitle?: ReactNode;
  imageUrl?: string | null;
  size?: number;
  /** Nom ustunining eng katta kengligi, px */
  maxWidth?: number;
  /**
   * Eng kichik kenglik, px. Ustunlar ko'p jadvalda brauzer o'ralgan matnli
   * ustunni eng uzun so'z kengligigacha siqib qo'yadi — nom har qatorda bitta
   * so'z bo'lib qolardi (Yo'qotishlar jadvali).
   */
  minWidth?: number;
  /** Rasm oldidagi qo'shimcha element (masalan, reyting o'rni) */
  lead?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {lead}
      <div
        className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2"
        style={{ width: size, height: size }}
      >
        <ProductThumb name={title} imageUrl={imageUrl} style={{ fontSize: Math.round(size * 0.33) }} />
      </div>
      <div className="min-w-0">
        <p
          className="line-clamp-2 whitespace-normal text-sm font-medium leading-snug text-ink"
          style={{ maxWidth, minWidth }}
          title={title}
        >
          {title}
        </p>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
