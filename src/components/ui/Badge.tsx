import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/**
 * Status badge. Always carries a text label — colour is never the only signal (brand guidelines).
 * `signal` (lime) is reserved for the active / next-in-line state.
 */
export type BadgeTone = 'neutral' | 'signal' | 'outline' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-line text-soft',
  signal: 'bg-signal text-midnight',
  outline: 'border border-line text-muted',
  danger: 'border border-danger/60 text-danger',
}

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-graphite',
  signal: 'bg-midnight',
  outline: 'bg-graphite',
  danger: 'bg-danger',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden="true" className={cn('size-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  )
}
