import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Badge, buttonClasses, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { adminApi, adminKeys } from '../../features/admin/api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** /admin/shops — every shop with its status and today's activity. */
export function AdminShopsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.shops.title'))
  const shops = useQuery({ queryKey: adminKeys.shops, queryFn: adminApi.listShops })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t('admin.shops.title')}</h1>
        <Link to="/admin/shops/new" className={buttonClasses({ size: 'sm', className: 'ms-auto' })}>{t('admin.shops.new')}</Link>
      </div>
      {shops.isPending && <LoadingState />}
      {shops.isError && <ErrorState onRetry={() => void shops.refetch()} />}
      {shops.data?.length === 0 && <EmptyState title={t('admin.shops.empty')} />}
      {shops.data && shops.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shops.data.map((s) => (
            <li key={s.id}>
              <Card padding="md" className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/shops/${s.id}`} className="font-semibold underline-offset-2 hover:underline" dir="auto">{s.name}</Link>
                  <p dir="ltr" className="text-start font-mono text-xs text-muted">/s/{s.slug}</p>
                </div>
                <Badge tone={s.is_active ? 'neutral' : 'danger'} dot>{s.is_active ? t('admin.shops.active') : t('admin.shops.disabled')}</Badge>
                <span className="text-sm text-muted">{t('admin.shops.members', { count: s.members })}</span>
                <span className="text-sm text-muted">
                  {s.queue_today ? t(`admin.shops.queue.${s.queue_today}`) : t('admin.shops.queue.none')}
                  {' · '}{t('admin.shops.tickets', { count: s.tickets_today })}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
