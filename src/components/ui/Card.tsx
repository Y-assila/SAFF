import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type CardElement = 'div' | 'section' | 'article' | 'li'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement
  padding?: 'none' | 'md' | 'lg'
  children?: ReactNode
}

const paddings = { none: '', md: 'p-5', lg: 'p-6 sm:p-8' }

export function Card({ as: Tag = 'div', padding = 'md', className, children, ...props }: CardProps) {
  return (
    <Tag className={cn('rounded-card border border-line bg-surface', paddings[padding], className)} {...props}>
      {children}
    </Tag>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-base font-semibold text-soft', className)} {...props}>
      {children}
    </h3>
  )
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mt-1.5 text-sm leading-relaxed text-muted', className)} {...props}>
      {children}
    </p>
  )
}
