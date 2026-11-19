import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { Button } from './Button'
import { AlertIcon, InboxIcon } from './icons'
import { Spinner } from './Spinner'

interface StateShellProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  role?: 'status' | 'alert'
}

function StateShell({ icon, title, description, action, className, role }: StateShellProps) {
  return (
    <div
      role={role}
      className={cn('mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center', className)}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-muted">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-soft">{title}</h2>
      {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export interface LoadingStateProps {
  /** Accessible label; defaults to the localised "Loading…". */
  label?: string
  className?: string
}

/** Announced politely to screen readers via role="status". */
export function LoadingState({ label, className }: LoadingStateProps) {
  const { t } = useTranslation()
  const text = label ?? t('common.loading')
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center justify-center gap-3 py-12', className)}>
      <Spinner className="size-6 text-signal" />
      <span className="text-sm text-muted">{text}</span>
    </div>
  )
}

export interface EmptyStateProps {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <StateShell
      icon={icon ?? <InboxIcon />}
      title={title ?? t('states.emptyTitle')}
      description={description}
      action={action}
      className={className}
    />
  )
}

export interface ErrorStateProps {
  title?: string
  description?: string
  /** When provided, shows a "Try again" button. */
  onRetry?: () => void
  action?: ReactNode
  className?: string
}

/** Uses role="alert" so the error is announced immediately. */
export function ErrorState({ title, description, onRetry, action, className }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    <StateShell
      role="alert"
      icon={<AlertIcon className="size-5 text-danger" />}
      title={title ?? t('states.errorTitle')}
      description={description ?? t('states.errorBody')}
      action={
        action ??
        (onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ))
      }
      className={className}
    />
  )
}
