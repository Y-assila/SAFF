import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge, EmptyState, buttonClasses } from '../components/ui'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export type PlaceholderKind = 'shop' | 'ticket' | 'barberSignIn' | 'dashboard'

/**
 * Honest placeholder for a route whose feature is not built yet.
 * It reads no URL data (in particular never the ticket token in the fragment) and calls no backend.
 */
export function PlaceholderPage({ kind }: { kind: PlaceholderKind }) {
  const { t } = useTranslation()
  const title = t(`placeholder.${kind}.title`)
  useDocumentTitle(title)

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16 sm:px-6">
      <Badge tone="outline">{t('placeholder.badge')}</Badge>
      <EmptyState
        title={title}
        description={t(`placeholder.${kind}.body`)}
        action={
          <Link to="/" className={buttonClasses({ variant: 'secondary' })}>
            {t('common.backHome')}
          </Link>
        }
      />
    </div>
  )
}
