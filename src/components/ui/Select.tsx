import { useId, type Ref, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: string
  options: { value: string; label: string }[]
  id?: string
  ref?: Ref<HTMLSelectElement>
  /** Hide the visible label (it stays available to screen readers). */
  hideLabel?: boolean
}

/** Labelled native select, styled like Input. */
export function Select({ label, hint, options, id, className, hideLabel, ref, ...props }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? `sel-${autoId}`
  const hintId = hint ? `${selectId}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className={cn('text-sm font-medium text-soft', hideLabel && 'sr-only')}>{label}</label>
      <select ref={ref} id={selectId} aria-describedby={hintId}
        className={cn(
          'h-12 w-full rounded-control border border-line bg-surface px-4 text-base text-soft',
          'hover:border-graphite focus:outline-none focus-visible:outline-2 focus-visible:outline-signal',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...props}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p id={hintId} className="text-sm text-muted">{hint}</p>}
    </div>
  )
}
