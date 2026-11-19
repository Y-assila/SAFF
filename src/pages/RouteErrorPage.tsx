import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorState, buttonClasses } from '../components/ui'

/** Router error boundary. Shows a generic message only — never error details or stack traces. */
export function RouteErrorPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <ErrorState
        action={
          <Link to="/" className={buttonClasses({ variant: 'secondary' })}>
            {t('common.backHome')}
          </Link>
        }
      />
    </div>
  )
}
