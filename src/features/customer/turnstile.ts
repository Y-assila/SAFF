// Loads Cloudflare Turnstile on demand. Only the join form loads it, never the ticket page
// (TD §7: no third-party scripts on ticket pages).
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string
  reset(widgetId?: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.referrerPolicy = 'no-referrer'
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile unavailable')))
    script.onerror = () => {
      loading = null
      reject(new Error('turnstile failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function turnstileSiteKey(): string | null {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || null
}
