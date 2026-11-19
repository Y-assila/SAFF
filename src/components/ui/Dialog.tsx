import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { CloseIcon } from './icons'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  /** Action buttons, rendered at the end of the dialog. */
  footer?: ReactNode
  className?: string
}

/**
 * Modal dialog built on the native <dialog> element: the browser provides the focus trap,
 * Escape handling, top-layer rendering and inert background. Focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape key: let React state drive closing.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // Click on the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-0 text-soft',
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-me-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted hover:bg-line hover:text-soft"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
        {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </dialog>
  )
}
