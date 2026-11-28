import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light' | 'inverse'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'press inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold ' +
  'disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const variants: Record<ButtonVariant, string> = {
  // Lime is reserved for the primary action (brand guidelines).
  // Disabled primary turns neutral: dimmed lime reads as a different colour, not as "unavailable".
  primary: 'bg-signal text-midnight hover:bg-signal/90 active:bg-signal/80 disabled:bg-line disabled:text-muted disabled:opacity-100',
  secondary: 'border border-line bg-surface text-soft hover:border-graphite hover:bg-line/60',
  ghost: 'text-soft hover:bg-surface',
  // Strong but not lime: lime stays reserved for the single next action on screen.
  light: 'bg-soft text-midnight hover:bg-soft/90 active:bg-soft/80',
  // On a lime screen (the customer's turn).
  inverse: 'bg-midnight text-soft hover:bg-midnight/90 active:bg-midnight/80',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-11 px-4 text-sm', // 44 px: the minimum touch target
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
