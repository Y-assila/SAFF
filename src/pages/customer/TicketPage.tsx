import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { AlertIcon } from '../../components/ui/icons'
import { CustomerApiError, getTicket, ticketAction, type TicketView } from '../../features/customer/api'
import { loadTicketToken, takeTokenFromFragment } from '../../features/customer/ticketStorage'
import { useCustomerTone } from '../../features/customer/tone'
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
  const called = view?.status === 'getting_ready' || view?.status === 'on_the_way'
  useCustomerTone(called ? 'signal' : 'dark') // the whole screen turns lime when it is your turn

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
  // Only a genuine 404 means the link is invalid or replaced; anything else (network, server,
  // misconfiguration) must not tell a customer their ticket is gone.
  if (ticket.isError && !(ticket.error instanceof CustomerApiError && ticket.error.code === 'not_found')) {
    return <ErrorState title={t('ticket.loadErrorTitle')} description={t('ticket.loadErrorBody')} onRetry={() => void ticket.refetch()} />
  }
  if (ticket.isError || !view) {
    return <EmptyState title={t('ticket.invalidTitle')} description={t('ticket.invalidBody')} />
  }

  const active = ACTIVE.includes(view.status)
  // Clamped: the device clock may be slightly behind the server's called_at.
  const minutesSinceCalled = view.called_at ? Math.max(0, Math.floor((now - Date.parse(view.called_at)) / 60_000)) : 0
  const graceLeft = view.grace_period_minutes - minutesSinceCalled
  const number = formatTicketNumber(view.ticket_number)
  const leave = active && view.status !== 'in_service' && (
    <button type="button" onClick={() => { setActionError(null); setConfirmCancel(true) }}
      className={`press h-11 self-center px-4 text-sm font-medium underline underline-offset-4 ${called ? 'text-midnight/70 hover:text-midnight' : 'text-muted hover:text-soft'}`}>
      {t('ticket.cancel')}
    </button>
  )

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-7 pb-5" aria-live="polite">
      {called ? (
        <section className="flex flex-1 flex-col animate-rise">
          <p className="text-[0.9375rem] font-semibold text-midnight/70">
            <span dir="auto">{view.shop.name}</span> · <span dir="ltr" className="tabular-nums">{number}</span> · <bdi>{view.customer_name}</bdi>
          </p>
          <h1 className="mt-3 text-[3.75rem] leading-[0.98] font-extrabold tracking-tighter">
            {view.status === 'on_the_way' ? t('ticket.onTheWayTitle') : t('ticket.calledTitle')}
          </h1>
          <p className="mt-4 max-w-xs text-lg leading-snug font-medium">
            {view.status === 'on_the_way' ? t('ticket.state.on_the_way') : t('ticket.calledBody')}
          </p>
          {view.called_at && (
            <p className="mt-7 flex items-baseline gap-2">
              {graceLeft > 0 ? (
                <>
                  <span className="display text-[2.75rem]"><span dir="ltr">{graceLeft}</span></span>
                  <span className="text-[0.9375rem] font-semibold text-midnight/70">{t('ticket.minLeft')}</span>
                </>
              ) : (
                <span className="text-xl font-bold">{t('ticket.graceOver')}</span>
              )}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2.5 pt-8">
            {actionError && <ActionError message={actionError} />}
            {view.status === 'getting_ready' ? (
              <Button size="lg" variant="inverse" fullWidth loading={act.isPending && act.variables === 'on_the_way'}
                onClick={() => { setActionError(null); act.mutate('on_the_way') }}
                className="h-15 rounded-2xl text-lg font-bold">
                {t('ticket.onTheWay')}
              </Button>
            ) : (
              <p className="flex h-15 items-center justify-center gap-2.5 rounded-2xl border-2 border-midnight text-base font-bold">
                <CheckIcon /> {t('ticket.confirmed')}
              </p>
            )}
            {leave}
          </div>
        </section>
      ) : active ? (
        <>
          <section aria-labelledby="ticket-title" className="overflow-hidden rounded-3xl bg-surface animate-rise">
            <div className="flex flex-col px-6 pt-5 pb-4">
              <h1 id="ticket-title" className="text-[0.8125rem] font-medium text-muted">
                {t('ticket.title')} · <span dir="auto">{view.shop.name}</span>
              </h1>
              {/* Digits are isolated LTR inside a block that keeps the page direction. */}
              <p className="display mt-1 text-[7rem]"><span dir="ltr">{number}</span></p>
              <p className="mt-2 text-[1.0625rem] font-semibold"><bdi>{view.customer_name}</bdi></p>
            </div>
            <Perforation />
            <div className="flex flex-col gap-4 px-6 pt-4 pb-6">
              {view.status === 'waiting' ? (
                <>
                  {view.people_ahead > 0 ? (
                    <p className="flex items-baseline gap-2.5">
                      <span className="display text-[3.5rem]"><span dir="ltr">{view.people_ahead}</span></span>
                      <span className="text-[1.0625rem] leading-tight font-semibold">
                        {view.people_ahead === 1 ? t('ticket.aheadOne') : t('ticket.aheadMany')}
                      </span>
                    </p>
                  ) : (
                    <p className="text-[2rem] leading-tight font-extrabold tracking-tight text-signal">{t('ticket.nobodyAhead')}</p>
                  )}
                  <QueueDots ahead={view.people_ahead} />
                  <p className="text-[0.9375rem] leading-relaxed text-muted">
                    {view.estimate?.available ? t('ticket.estimate', { minutes: view.estimate.minutes }) : t('ticket.estimateUnavailable')}
                  </p>
                </>
              ) : (
                <p className="text-[1.375rem] leading-snug font-bold tracking-tight">{t(`ticket.state.${view.status}`)}</p>
              )}
              {view.now_serving_number !== null && view.status !== 'in_service' && (
                <p className="text-sm text-muted">
                  {t('ticket.nowServing', { number: '' })}<span dir="ltr" className="font-semibold tabular-nums text-soft">{formatTicketNumber(view.now_serving_number)}</span>
                </p>
              )}
            </div>
          </section>

          {view.queue_status === 'paused' && (
            <p className="rounded-2xl border border-line px-4 py-3 text-sm">{t('ticket.queuePaused')}</p>
          )}
          <p className="flex items-center gap-2.5 px-1 text-sm text-muted">
            <span aria-hidden="true" className="size-2 shrink-0 animate-live rounded-full bg-signal" />
            {t('ticket.live')}
          </p>
          <div className="mt-auto flex flex-col gap-2">
            {actionError && <ActionError message={actionError} />}
            {leave}
          </div>
        </>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center animate-rise">
          <span className="flex size-16 items-center justify-center rounded-full bg-surface text-signal"><CheckIcon className="size-7" /></span>
          <h1 className="max-w-xs text-2xl leading-tight font-extrabold tracking-tight">{t(`ticket.state.${view.status}`)}</h1>
          <p className="text-sm text-muted">
            <span dir="ltr" className="tabular-nums">{number}</span> · <span dir="auto">{view.shop.name}</span>
          </p>
        </section>
      )}

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t('ticket.cancelTitle')} description={t('ticket.cancelBody')}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t('ticket.keep')}</Button>
          <Button loading={act.isPending && act.variables === 'cancel'} onClick={() => act.mutate('cancel')}>{t('ticket.cancelConfirm')}</Button>
        </>} />
    </div>
  )
}

function ActionError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-center gap-2 rounded-2xl bg-midnight px-4 py-3 text-sm text-danger">
      <AlertIcon className="size-4 shrink-0" /> <span>{message}</span>
    </p>
  )
}

/** The tear line of a paper ticket: two notches and a dashed rule. */
function Perforation() {
  return (
    <div aria-hidden="true" className="flex h-6 items-center">
      <span className="-ms-3 size-6 shrink-0 rounded-full bg-midnight" />
      <span className="mx-1.5 flex-1 border-t-2 border-dashed border-line" />
      <span className="-me-3 size-6 shrink-0 rounded-full bg-midnight" />
    </div>
  )
}

const MAX_DOTS = 8

/** People ahead as dots, the customer as the lime dot at the end. */
function QueueDots({ ahead }: { ahead: number }) {
  const { t } = useTranslation()
  const shown = Math.min(ahead, MAX_DOTS)
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      {Array.from({ length: shown }, (_, i) => <span key={i} className="size-3 rounded-full bg-line" />)}
      {ahead > MAX_DOTS && <span dir="ltr" className="text-xs font-semibold text-graphite">+{ahead - MAX_DOTS}</span>}
      <span className="size-4 rounded-full bg-signal" />
      <span className="ms-1 text-[0.8125rem] text-muted">{t('ticket.you')}</span>
    </div>
  )
}

function CheckIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
