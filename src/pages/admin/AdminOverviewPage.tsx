import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Card, ErrorState, LoadingState } from '../../components/ui'
import { adminApi, adminKeys, type AdminOverview } from '../../features/admin/api'
import { formatDateTime } from '../../features/admin/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** /admin — numbers across all shops, system health and the latest admin actions. */
export function AdminOverviewPage() {
  const { t, i18n } = useTranslation()
  useDocumentTitle(t('admin.overview.title'))
  const overview = useQuery({ queryKey: adminKeys.overview, queryFn: adminApi.overview, refetchInterval: 60_000 })
  if (overview.isPending) return <LoadingState />
  if (overview.isError) return <ErrorState onRetry={() => void overview.refetch()} />
  const o = overview.data
  const warnings = healthWarnings(o, t)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{t('admin.overview.title')}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('admin.overview.shops')} value={`${o.shops_active} / ${o.shops_total}`} hint={t('admin.overview.shopsHint')} />
        <Stat label={t('admin.overview.liveQueues')} value={String(o.queues_live)} />
        <Stat label={t('admin.overview.ticketsToday')} value={String(o.tickets_today)} />
        <Stat label={t('admin.overview.whatsapp')} value={`${o.health.outbox.sent_24h} / ${o.health.outbox.failed_24h}`} hint={t('admin.overview.whatsappHint')} />
      </div>

      <Card padding="lg">
        <h2 className="text-base font-semibold">{t('admin.overview.health')}</h2>
        {warnings.length === 0
          ? <p className="mt-2 text-sm text-muted">{t('admin.overview.healthOk')}</p>
          : <ul className="mt-2 flex flex-col gap-1.5 text-sm text-danger">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </Card>

      <Card padding="lg">
        <h2 className="text-base font-semibold">{t('admin.overview.recent')}</h2>
        {o.recent_actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('admin.overview.noActions')}</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {o.recent_actions.map((a, i) => (
              <li key={`${a.created_at}-${i}`} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                <span dir="ltr" className="shrink-0 text-xs text-muted sm:w-40">{formatDateTime(a.created_at, i18n.language)}</span>
                <span className="font-medium">{t(`admin.actions.${a.action}`, { defaultValue: a.action })}</span>
                {a.shop_id && a.shop_name && <Link to={`/admin/shops/${a.shop_id}`} className="text-soft underline-offset-2 hover:underline" dir="auto">{a.shop_name}</Link>}
                {a.target_email && <span dir="ltr" className="text-muted">{a.target_email}</span>}
                {a.actor_email && <span className="text-xs text-muted sm:ms-auto">{t('admin.overview.by')} <span dir="ltr">{a.actor_email}</span></span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="md">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p dir="ltr" className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

function healthWarnings(o: AdminOverview, t: TFunction): string[] {
  const h = o.health
  const out: string[] = []
  if (!h.outbox.dispatch_configured) out.push(t('admin.health.dispatchMissing'))
  if (h.outbox.pending_overdue > 0) out.push(t('admin.health.pendingOverdue', { count: h.outbox.pending_overdue }))
  if (h.outbox.sending_stuck > 0) out.push(t('admin.health.sendingStuck', { count: h.outbox.sending_stuck }))
  if (h.queues.stale > 0) out.push(t('admin.health.staleQueues', { count: h.queues.stale }))
  if (h.retention.overdue_anonymisation > 0) out.push(t('admin.health.retention', { count: h.retention.overdue_anonymisation }))
  for (const [name, job] of Object.entries(h.jobs ?? {})) {
    if (!job.active || job.failures_24h > 0) out.push(t('admin.health.job', { name }))
  }
  return out
}
