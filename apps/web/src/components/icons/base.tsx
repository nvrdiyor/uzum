/**
 * Ikonka komponenti: Phosphor duotone chiziqlaridan (256×256 maydon) yasaladi.
 * Och fon qatlami 20% shaffoflikda — rang `currentColor`dan olinadi.
 *
 * `size` berilmasa 24 px; odatda o'lcham Tailwind sinfi (`h-4 w-4`) bilan
 * beriladi. `strokeWidth` va `weight` — eski kutubxonadan qolgan, e'tiborsiz.
 * Bezak ikonkalar ekran o'quvchidan yashiriladi (`aria-label` berilmasa).
 */
import { forwardRef, type ForwardRefExoticComponent, type RefAttributes, type SVGProps } from 'react';

export type AppIconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & {
  size?: number | string;
  color?: string;
  mirrored?: boolean;
  strokeWidth?: number | string;
  weight?: string;
};

export type AppIcon = ForwardRefExoticComponent<AppIconProps & RefAttributes<SVGSVGElement>>;

export function makeIcon(name: string, bg: string, fg: string): AppIcon {
  const Icon = forwardRef<SVGSVGElement, AppIconProps>(function Icon(
    { size = 24, color = 'currentColor', mirrored, strokeWidth: _strokeWidth, weight: _weight, style, children, ...rest },
    ref,
  ) {
    const hidden = rest['aria-label'] || rest['aria-labelledby'] ? undefined : true;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        fill={color}
        aria-hidden={hidden}
        focusable="false"
        style={mirrored ? { transform: 'scaleX(-1)', ...style } : style}
        {...rest}
      >
        {children}
        <path d={bg} opacity="0.2" />
        <path d={fg} />
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}
