import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { ArrowForwardIcon } from '../../components/ui/icons'
import { useMemberships } from '../../features/shops/useMemberships'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** Resolves which shop to open: none → explain, one → open it, several → choose. */
export function BarberHomePage() {
  const { t } = useTranslation()
  useDocumentTitle(t('barber.chooseShop'))
  const { data, isPending, isError, refetch } = useMemberships()

  if (isPending) return <LoadingState />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (data.length === 0) return <EmptyState title={t('barber.noShopTitle')} description={t('barber.noShopBody')} />
  if (data.length === 1) return <Navigate to={`/barber/${data[0].shop.id}`} replace />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('barber.chooseShop')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.map((m) => (
          <li key={m.shop.id}>
            <Link to={`/barber/${m.shop.id}`} className="block rounded-card focus-visible:outline-2 focus-visible:outline-signal">
              <Card className="flex items-center justify-between gap-3 hover:border-graphite">
                <div className="min-w-0">
                  <p className="truncate font-semibold" dir="auto">{m.shop.name}</p>
                  <Badge tone="outline" className="mt-2">{t(`barber.role.${m.role}`)}</Badge>
                </div>
                <ArrowForwardIcon className="size-5 shrink-0 text-muted" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
