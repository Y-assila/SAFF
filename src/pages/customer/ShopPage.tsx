import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Badge, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { getPublicShop } from '../../features/customer/api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { JoinForm } from './JoinForm'

/** /s/:slug — the page behind each shop's permanent QR code (decision D-02). */
export function ShopPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams()
  const shop = useQuery({
    queryKey: ['public-shop', slug],
    queryFn: () => getPublicShop(slug.toLowerCase()),
    refetchInterval: 30_000,
  })
  useDocumentTitle(shop.data?.name ?? t('shopPage.joinTitle'))

  if (shop.isPending) return <LoadingState />
  if (shop.isError) return <ErrorState onRetry={() => void shop.refetch()} />
  if (!shop.data) return <EmptyState title={t('shopPage.notFoundTitle')} description={t('shopPage.notFoundBody')} />

  const { name, status, waiting_count } = shop.data
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold" dir="auto">{name}</h1>
        {status === 'open' && (
          <Badge tone="neutral" dot className="self-start">
            {waiting_count > 0 ? t('shopPage.waiting', { count: waiting_count }) : t('shopPage.waitingNone')}
          </Badge>
        )}
      </div>
      {status === 'open' && <JoinForm slug={slug.toLowerCase()} shopName={name} onQueueChanged={() => void shop.refetch()} />}
      {status === 'paused' && <EmptyState title={t('shopPage.pausedTitle')} description={t('shopPage.pausedBody')} />}
      {status === 'closed' && <EmptyState title={t('shopPage.closedTitle')} description={t('shopPage.closedBody')} />}
    </div>
  )
}
