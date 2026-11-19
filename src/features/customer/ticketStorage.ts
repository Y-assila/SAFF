/**
 * The ticket token stays on this device only (TD §7). It is never put in a query string, and the
 * app removes it from the address bar after reading it from the URL fragment.
 */
const KEY = 'saff.ticket'

export function saveTicketToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable: the ticket works for this page view only */
  }
}

export function loadTicketToken(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetTicketToken(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Reads `#<token>` from the URL, stores it, and strips it from the address bar. */
export function takeTokenFromFragment(location: Location = window.location, history: History = window.history): string | null {
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : ''
  if (!/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(fragment)) return null
  saveTicketToken(fragment)
  history.replaceState(history.state, '', location.pathname + location.search)
  return fragment
}
