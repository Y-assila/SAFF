import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, directionOf, isLocale, type Locale } from './config'
import { detectLocale, storeLocale } from './detect'
import ar from './locales/ar'
import en from './locales/en'
import fr from './locales/fr'

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  ar: { translation: ar },
} as const

/**
 * Sets `lang` and `dir` on <html>. Direction is handled at the document level so the browser,
 * flexbox/grid and Tailwind logical utilities (ms-*, pe-*, start-*, text-start…) mirror the layout
 * naturally. Nothing is reversed manually.
 */
export function applyDocumentLocale(locale: Locale, doc: Document = document): void {
  doc.documentElement.lang = locale
  doc.documentElement.dir = directionOf(locale)
}

export function currentLocale(): Locale {
  return isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE
}

export async function changeLocale(locale: Locale): Promise<void> {
  storeLocale(locale)
  await i18n.changeLanguage(locale)
}

export function initI18n(initial: Locale = detectLocale()) {
  if (i18n.isInitialized) return i18n

  i18n.on('languageChanged', (lng) => {
    if (isLocale(lng)) applyDocumentLocale(lng)
  })

  void i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    // React already escapes rendered text.
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  })

  applyDocumentLocale(initial)
  return i18n
}

export default i18n
