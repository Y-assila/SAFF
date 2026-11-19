import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, Dialog, EmptyState, LoadingState } from '../../components/ui'
import { AlertIcon } from '../../components/ui/icons'
import { CustomerApiError, getTicket, ticketAction, type TicketView } from '../../features/customer/api'
import { loadTicketToken, takeTokenFromFragment } from '../../features/customer/ticketStorage'
import { formatTicketNumber } from '../../features/queue/types'
import { useNow } from '../../features/queue/useQueue'
import { getSupabase } from '../../lib/supabase'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import i18n from '../../i18n'

const POLL_MS = 20_000
const ACTIVE: TicketView['status'][] = ['waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service']

/** /t — the customer's private ticket. The token comes from the URL fragment or this device's storage. */
export function TicketPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('ticket.title'))
  const [token] = useState(() => takeTokenFromFragment() ?? loadTicketToken())
  const queryClient = useQueryClient()
  const now = useNow(15_000)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const localeApplied = useRef(false)

  const ticket = useQuery({
    queryKey: ['ticket', token],
    queryFn: () => getTicket(token!),
    enabled: Boolean(token),
    refetchInterval: POLL_MS, // fallback when Realtime is unavailable (TD issue 4)
    retry: (count, error) => !(error instanceof CustomerApiError && error.code === 'not_found') && count < 2,
  })
  const view = ticket.data

  // D-06: open in the language the customer joined with (once; they can still switch).
  useEffect(() => {
    if (view && !localeApplied.current) {
      localeApplied.current = true
      if (i18n.resolvedLanguage !== view.locale) void i18n.changeLanguage(view.locale)
    }
  }, [view])

  // Realtime ping on the public per-session channel carries only {v}; refetch through ticket-get.
  const sessionId = view?.session_id
  useEffect(() => {
    if (!sessionId) return
    const supabase = getSupabase()
    const refetch = () => void queryClient.invalidateQueries({ queryKey: ['ticket', token] })
    const channel = supabase.channel(`qs:${sessionId}`)
      .on('broadcast', { event: 'queue_changed' }, refetch)
      .subscribe((status) => status === 'SUBSCRIBED' && refetch())
    return () => void supabase.removeChannel(channel)
  }, [queryClient, sessionId, token])

  const act = useMutation({
    mutationFn: (action: 'on_the_way' | 'cancel') => ticketAction(token!, action),
    onSuccess: () => setConfirmCancel(false),
    onError: () => { setConfirmCancel(false); setActionError(t('ticket.actionFailed')) },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['ticket', token] }),
  })

  if (!token) return <EmptyState title={t('ticket.noTicketTitle')} description={t('ticket.noTicketBody')} />
  if (ticket.isPending) return <LoadingState />
  if (ticket.isError || !view) {
    return <EmptyState title={t('ticket.invalidTitle')} description={t('ticket.invalidBody')} />
  }

  const active = ACTIVE.includes(view.status)
  const called = view.status === 'getting_ready' || view.status === 'on_the_way'
  // Clamped: the device clock may be slightly behind the server's called_at.
  const minutesSinceCalled = view.called_at ? Math.max(0, Math.floor((now - Date.parse(view.called_at)) / 60_000)) : 0
  const graceLeft = view.grace_period_minutes - minutesSinceCalled

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 py-8">
      <p className="text-sm text-muted" dir="auto">{view.shop.name}</p>

      <Card padding="lg" className={called ? 'border-signal/70' : undefined} aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t('ticket.number')}</p>
        {/* Digits are isolated LTR inside a block that keeps the page direction (start-aligned in RTL). */}
        <p className={`mt-1 text-6xl font-bold tabular-nums ${called ? 'text-signal' : 'text-soft'}`}>
          <span dir="ltr">{formatTicketNumber(view.ticket_number)}</span>
        </p>
        <p className="mt-2 text-sm text-muted"><bdi>{view.customer_name}</bdi></p>
        <p className="mt-5 text-lg font-semibold">{t(`ticket.state.${view.status}`)}</p>

        {view.status === 'waiting' && (
          <div className="mt-3 flex flex-col gap-1 text-sm text-muted">
            <p>{view.people_ahead > 0 ? t('ticket.peopleAhead', { count: view.people_ahead }) : t('ticket.nobodyAhead')}</p>
            <p>{view.estimate?.available ? t('ticket.estimate', { minutes: view.estimate.minutes }) : t('ticket.estimateUnavailable')}</p>
          </div>
        )}
        {called && view.called_at && (
          <Badge tone="signal" dot className="mt-3">
            {graceLeft > 0 ? t('ticket.graceLeft', { minutes: graceLeft }) : t('ticket.graceOver')}
          </Badge>
        )}
        {active && view.now_serving_number !== null && view.status !== 'in_service' && (
          <p className="mt-4 text-sm text-muted">
            {t('ticket.nowServing', { number: '' })}<span dir="ltr" className="font-semibold tabular-nums text-soft">{formatTicketNumber(view.now_serving_number)}</span>
          </p>
        )}
      </Card>

      {view.queue_status === 'paused' && active && (
        <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm">{t('ticket.queuePaused')}</p>
      )}

      {actionError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger"><AlertIcon className="size-4 shrink-0" /> <span>{actionError}</span></p>
      )}

      {view.status === 'getting_ready' && (
        <Button size="lg" fullWidth loading={act.isPending && act.variables === 'on_the_way'} onClick={() => { setActionError(null); act.mutate('on_the_way') }}>
          {t('ticket.onTheWay')}
        </Button>
      )}
      {active && view.status !== 'in_service' && (
        <Button variant="ghost" fullWidth onClick={() => { setActionError(null); setConfirmCancel(true) }}>{t('ticket.cancel')}</Button>
      )}
      {active && <p className="text-center text-xs text-muted">{t('ticket.live')}</p>}

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t('ticket.cancelTitle')} description={t('ticket.cancelBody')}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t('ticket.keep')}</Button>
          <Button loading={act.isPending && act.variables === 'cancel'} onClick={() => act.mutate('cancel')}>{t('ticket.cancel')}</Button>
        </>} />
    </div>
  )
}
