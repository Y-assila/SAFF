import { useTranslation } from 'react-i18next'
import { changeLocale } from '../../i18n'
import { LOCALE_META, SUPPORTED_LOCALES, isLocale } from '../../i18n/config'
import { cn } from '../../lib/cn'

/** Compact language picker for customer screens: one 44 px pill, the native menu on tap. */
export function LanguageSelect({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'signal' }) {
  const { t, i18n } = useTranslation()
  const active = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : SUPPORTED_LOCALES[0]
  return (
    <label className={cn('relative inline-flex', className)}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={active}
        onChange={(e) => isLocale(e.target.value) && void changeLocale(e.target.value)}
        className={cn(
          'press h-11 cursor-pointer appearance-none rounded-full border bg-transparent ps-4 pe-9 text-sm font-semibold',
          tone === 'signal' ? 'border-midnight/25 text-midnight' : 'border-line text-soft hover:border-graphite',
        )}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale} className="bg-surface text-soft">
            {LOCALE_META[locale].nativeName}
          </option>
        ))}
      </select>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  )
}
