import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState, buttonClasses } from '../components/ui'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <EmptyState
        title={t('notFound.title')}
        description={t('notFound.body')}
        action={
          <Link to="/" className={buttonClasses({ variant: 'secondary' })}>
            {t('common.backHome')}
          </Link>
        }
      />
    </div>
  )
}
