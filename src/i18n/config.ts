export const SUPPORTED_LOCALES = ['ar', 'fr', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]
export type Direction = 'rtl' | 'ltr'

/**
 * Default UI locale when nothing better is known.
 * Matches the technical design default (`shops.default_locale = 'fr'`).
 * See docs/IMPLEMENTATION-PLAN.md §10 (D-08) — pending product confirmation.
 */
export const DEFAULT_LOCALE: Locale = 'fr'

export const STORAGE_KEY = 'saff.locale'

interface LocaleMeta {
  dir: Direction
  /** Name of the language written in that language (shown in the switcher). */
  nativeName: string
  /** BCP 47 tag for Intl formatting. Morocco-oriented; Arabic keeps Latin digits. */
  intl: string
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  ar: { dir: 'rtl', nativeName: 'العربية', intl: 'ar-MA-u-nu-latn' },
  fr: { dir: 'ltr', nativeName: 'Français', intl: 'fr-MA' },
  en: { dir: 'ltr', nativeName: 'English', intl: 'en' },
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function directionOf(locale: Locale): Direction {
  return LOCALE_META[locale].dir
}
