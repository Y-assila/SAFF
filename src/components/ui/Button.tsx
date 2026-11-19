import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { buttonClasses, type ButtonStyleOptions } from './buttonStyles'
import { Spinner } from './Spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleOptions {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean
  startIcon?: ReactNode
  endIcon?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  disabled,
  startIcon,
  endIcon,
  className,
  children,
  type = 'button',
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : startIcon}
      <span className="inline-flex items-center gap-2">{children}</span>
      {!loading && endIcon}
    </button>
  )
}
