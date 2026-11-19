import { useTranslation } from 'react-i18next'
import { LOCALE_META, SUPPORTED_LOCALES, isLocale } from '../../i18n/config'
import { changeLocale } from '../../i18n'
import { cn } from '../../lib/cn'

/**
 * Segmented language control. Each option declares its own `lang` and `dir`, so a language
 * name renders in its correct script, font and direction regardless of the page language.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation()
  // useTranslation re-renders this component on language change.
  const active = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : null

  return (
    <div role="group" aria-label={t('language.label')} className={cn('flex rounded-control border border-line p-0.5', className)}>
      {SUPPORTED_LOCALES.map((locale) => {
        const meta = LOCALE_META[locale]
        const selected = locale === active
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            dir={meta.dir}
            aria-pressed={selected}
            onClick={() => void changeLocale(locale)}
            className={cn(
              'h-8 rounded-[0.6rem] px-2.5 text-xs font-semibold transition-colors',
              selected ? 'bg-line text-soft' : 'text-muted hover:text-soft',
            )}
          >
            {meta.nativeName}
          </button>
        )
      })}
    </div>
  )
}
