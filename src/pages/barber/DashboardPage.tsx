import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { shopToday } from '../../features/queue/api'
import { LiveQueue } from '../../features/queue/components/LiveQueue'
import { errorMessageKey } from '../../features/queue/errors'
import { useLatestSession, useQueueAction } from '../../features/queue/useQueue'
import { useMembership } from '../../features/shops/useMemberships'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function DashboardPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('queue.title'))
  const { shopId = '' } = useParams()
  const memberships = useMembership(shopId)
  const session = useLatestSession(shopId)
  const action = useQueueAction(shopId)

  if (memberships.isPending || session.isPending) return <LoadingState />
  if (!memberships.membership) return <EmptyState title={t('errors.not_authorized')} />
  if (session.isError) return <ErrorState onRetry={() => void session.refetch()} />

  const current = session.data
  const today = shopToday(memberships.membership.shop.timezone)
  const actionError = action.error ? <p role="alert" className="text-sm text-danger">{t(errorMessageKey(action.error))}</p> : null

  if (current && current.status !== 'finished') return <LiveQueue shopId={shopId} session={current} />

  if (current && current.status === 'finished' && current.queue_date === today) {
    return (
      <EmptyState title={t('queue.closedTodayTitle')} description={t('queue.closedTodayBody')}
        action={<div className="flex flex-col items-center gap-3">
          <Button loading={action.isPending} onClick={() => action.mutate({ name: 'reopen_queue', args: { p_session_id: current.id } })}>
            {t('queue.reopen')}
          </Button>
          {actionError}
        </div>} />
    )
  }

  return (
    <EmptyState title={t('queue.noSessionTitle')} description={t('queue.noSessionBody')}
      action={<div className="flex flex-col items-center gap-3">
        <Button size="lg" loading={action.isPending} onClick={() => action.mutate({ name: 'start_queue', args: { p_shop_id: shopId } })}>
          {t('queue.start')}
        </Button>
        {actionError}
      </div>} />
  )
}
