import { useId, type InputHTMLAttributes, type Ref } from 'react'
import { cn } from '../../lib/cn'
import { AlertIcon } from './icons'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  /** Helper text shown under the field. */
  hint?: string
  /** Error message. Marks the field invalid and is announced via aria-describedby. */
  error?: string
  id?: string
  ref?: Ref<HTMLInputElement>
}

/**
 * Labelled text input. Uses logical properties so it mirrors in RTL.
 * For values that are always LTR (phone numbers, codes) pass `dir="ltr"`;
 * for free text such as names, the default `dir="auto"` follows what the user types.
 */
export function Input({ label, hint, error, id, className, dir = 'auto', required, ref, ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? `in-${autoId}`
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-soft">
        {label}
        {required && (
          <span aria-hidden="true" className="ms-1 text-muted">
            *
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={inputId}
        dir={dir}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-12 w-full rounded-control border bg-surface px-4 text-base text-soft placeholder:text-graphite',
          'transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line hover:border-graphite focus-visible:outline-signal',
        )}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger">
          <AlertIcon className="size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
