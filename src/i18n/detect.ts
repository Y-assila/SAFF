import { DEFAULT_LOCALE, STORAGE_KEY, isLocale, type Locale } from './config'

/** Map a BCP 47 tag such as "ar-MA" or "fr-FR" to a supported locale. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const base = tag.toLowerCase().split(/[-_]/)[0]
  return isLocale(base) ? base : null
}

export function readStoredLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Not an error.
    return null
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Ignore: the choice simply will not persist on this device.
  }
}

/** Order: explicit user choice on this device → browser languages → default. */
export function detectLocale(languages: readonly string[] = navigator.languages ?? []): Locale {
  const stored = readStoredLocale()
  if (stored) return stored
  for (const tag of languages) {
    const match = matchLocale(tag)
    if (match) return match
  }
  return DEFAULT_LOCALE
}
