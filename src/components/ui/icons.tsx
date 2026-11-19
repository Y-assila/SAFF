import type { SVGProps } from 'react'

/**
 * Minimal inline UI icons (stroke-based, currentColor). Decorative by default (aria-hidden).
 * Directional icons carry `rtl:-scale-x-100` so they point the right way in Arabic.
 */
type IconProps = SVGProps<SVGSVGElement>

function Base({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'size-5'}
      {...props}
    >
      {children}
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </Base>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M4 13h4.5l1 2h5l1-2H20" />
    </Base>
  )
}

export function ArrowForwardIcon({ className, ...props }: IconProps) {
  return (
    <Base className={`${className ?? 'size-5'} rtl:-scale-x-100`} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Base>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Base>
  )
}
