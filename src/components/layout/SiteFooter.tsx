import { useTranslation } from 'react-i18next'
import { Logo } from '../brand/Logo'
import { Tagline } from '../brand/Tagline'

// Computed once at load; a long-lived tab showing last year's © is acceptable.
const YEAR = new Date().getFullYear()

export function SiteFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo variant="symbol" alt="SAFF" className="h-6 w-auto" />
          <Tagline className="text-sm" />
        </div>
        <p className="text-xs text-muted">{t('footer.rights', { year: YEAR })}</p>
      </div>
    </footer>
  )
}
