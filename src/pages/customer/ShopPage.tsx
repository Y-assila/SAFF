import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui'
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

  const { name, address, status, waiting_count } = shop.data
  return (
    <div className="flex flex-1 flex-col">
      <section className="flex flex-col gap-2 px-5 pt-9">
        <h1 className="text-[2.5rem] leading-[1.02] font-extrabold tracking-tighter" dir="auto">{name}</h1>
        {address && <p className="text-[0.9375rem] text-muted" dir="auto">{address}</p>}
        <div className="mt-4 flex items-center gap-5">
          <div className="flex flex-col">
            <span className="display text-3xl">
              <span dir="ltr">{waiting_count}</span>
            </span>
            <span className="text-sm text-muted">{t('shopPage.waitingLabel')}</span>
          </div>
          <StatusPill status={status} />
        </div>
      </section>

      {status === 'open' && <JoinForm slug={slug.toLowerCase()} shopName={name} onQueueChanged={() => void shop.refetch()} />}
      {status === 'paused' && <EmptyState title={t('shopPage.pausedTitle')} description={t('shopPage.pausedBody')} />}
      {status === 'closed' && <EmptyState title={t('shopPage.closedTitle')} description={t('shopPage.closedBody')} />}
    </div>
  )
}

function StatusPill({ status }: { status: 'open' | 'paused' | 'closed' }) {
  const { t } = useTranslation()
  const open = status === 'open'
  return (
    <span className={`ms-auto inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-bold ${open ? 'bg-signal/12 text-signal' : 'bg-surface text-muted'}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${open ? 'animate-live bg-signal' : 'bg-graphite'}`} />
      {t(`shopPage.status.${status}`)}
    </span>
  )
}
