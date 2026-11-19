import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold ' +
  'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const variants: Record<ButtonVariant, string> = {
  // Lime is reserved for the primary action (brand guidelines).
  // Disabled primary turns neutral: dimmed lime reads as a different colour, not as "unavailable".
  primary: 'bg-signal text-midnight hover:bg-signal/90 active:bg-signal/80 disabled:bg-line disabled:text-muted disabled:opacity-100',
  secondary: 'border border-line bg-surface text-soft hover:border-graphite hover:bg-line/60',
  ghost: 'text-soft hover:bg-surface',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-6 text-base',
}

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
}

/** Button styles, reusable for router links that must look like buttons. */
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth, className }: ButtonStyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)
}
