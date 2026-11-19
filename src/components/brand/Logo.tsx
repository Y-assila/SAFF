import { cn } from '../../lib/cn'

/**
 * The approved SAFF logo, rendered from the unmodified brand-kit files copied to /public/brand
 * (byte-identical — enforced by src/components/brand/logo-assets.test.ts).
 *
 * Rules (SAFF Brand Guidelines v1.2):
 * - never redraw, recolour, stretch, skew or add effects; size it by height only;
 * - full lockup where there is room, standalone symbol in compact contexts;
 * - keep clear space at least equal to the largest head diameter;
 * - the artwork is never mirrored in RTL (an <img> is not affected by `dir`).
 */
export type LogoVariant = 'primary' | 'symbol'

const assets: Record<LogoVariant, { src: string; width: number; height: number }> = {
  // Full lockup: queue mark, divider, SAFF wordmark and English tagline.
  primary: { src: '/brand/saff-primary.svg', width: 1160, height: 230 },
  // Queue mark only (two graphite figures, lime leading figure).
  symbol: { src: '/brand/saff-symbol.svg', width: 365, height: 222 },
}

export interface LogoProps {
  variant?: LogoVariant
  /** Sizing classes, e.g. "h-8 w-auto" or "h-auto w-full". Always keep one axis on auto. */
  className?: string
  /** Accessible name. Pass "" when the logo sits inside a link that already has a label. */
  alt?: string
}

export function Logo({ variant = 'primary', className, alt = 'SAFF' }: LogoProps) {
  const asset = assets[variant]
  return (
    <img
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={alt}
      draggable={false}
      decoding="async"
      className={cn('block select-none', className ?? 'h-8 w-auto')}
    />
  )
}
