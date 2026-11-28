import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ErrorState, LoadingState } from '../../../components/ui'
import { AlertIcon, CloseIcon } from '../../../components/ui/icons'
import { errorMessageKey } from '../errors'
import { CALLED_STATUSES, formatTicketNumber, type QueueSession, type QueueTicket, type SkipReason } from '../types'
import { useActiveTickets, useGracePeriod, useNow, useQueueAction, useQueueRealtime, useQueueStats } from '../useQueue'
import { ConfirmDialog, PhoneDialog, SkipDialog, TicketMenuDialog, type TicketMenuAction } from './QueueDialogs'
import { CalledCard, CustomerName, InServiceCard, WaitingList } from './TicketCards'

type DialogState =
  | { kind: 'none' }
  | { kind: 'close' }
  | { kind: 'startNow' | 'cancel' | 'skip' | 'phone' | 'resend' | 'menu'; ticket: QueueTicket }

/** The barber's live queue: In service / Called slots, waiting list, and every queue action. */
export function LiveQueue({ shopId, session }: { shopId: string; session: QueueSession }) {
  const { t } = useTranslation()
  const tickets = useActiveTickets(shopId, session.id)
  const stats = useQueueStats(shopId, session.id)
  const grace = useGracePeriod(shopId)
  useQueueRealtime(shopId, session.id)
  const now = useNow()
  const action = useQueueAction(shopId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const [error, setError] = useState<string | null>(null)

  if (tickets.isPending) return <LoadingState />
  if (tickets.isError) return <ErrorState onRetry={() => void tickets.refetch()} />

  const list = tickets.data
  const inService = list.find((x) => x.status === 'in_service')
  const called = list.find((x) => CALLED_STATUSES.includes(x.status))
  const waiting = list.filter((x) => x.status === 'waiting')
  const paused = session.status === 'paused'
  const sid = session.id
  const closeDialog = () => setDialog({ kind: 'none' })

  function run(name: Parameters<typeof action.mutate>[0]['name'], args: Record<string, unknown>) {
    setError(null)
    action.mutate({ name, args }, {
      onSuccess: closeDialog,
      onError: (e) => { closeDialog(); setError(t(errorMessageKey(e))) },
    })
  }

  const menuActions = (ticket: QueueTicket): TicketMenuAction[] =>
    ticket.status === 'in_service' ? ['phone', 'resend'] : ['phone', 'resend', 'skip', 'cancel']

  const estimate = stats.data?.next_join_estimate
  const dialogTicket = dialog.kind !== 'none' && dialog.kind !== 'close' ? dialog.ticket : null

  const nextUp = waiting[0]
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-7">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold tracking-tight">{t('queue.title')}</h1>
          <span className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-bold ${paused ? 'bg-surface text-muted' : 'bg-signal/12 text-signal'}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${paused ? 'bg-graphite' : 'animate-live bg-signal'}`} />
            {t(`queue.status.${session.status}`)}
          </span>
          <div className="ms-auto flex gap-2">
            {paused
              ? <Button variant="secondary" size="sm" onClick={() => run('resume_queue', { p_session_id: sid })}>{t('queue.resume')}</Button>
              : <Button variant="secondary" size="sm" onClick={() => run('pause_queue', { p_session_id: sid })}>{t('queue.pause')}</Button>}
            <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: 'close' })}>{t('queue.close')}</Button>
          </div>
        </div>

        {paused && <p className="rounded-2xl border border-line px-4 py-3 text-sm">{t('queue.pausedNotice')}</p>}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/60 px-4 py-3 text-sm">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label={t('common.close')} className="press -m-2 flex size-9 items-center justify-center text-muted hover:text-soft">
              <CloseIcon className="size-4" />
            </button>
          </div>
        )}

        {inService ? (
          <InServiceCard ticket={inService} now={now}
            busy={action.isPending && action.variables?.name === 'complete_service'}
            onComplete={() => run('complete_service', { p_session_id: sid, p_ticket_id: inService.id })}
            onMore={() => setDialog({ kind: 'menu', ticket: inService })} />
        ) : (
          <div className="flex flex-col gap-1 animate-rise">
            <p className="text-sm text-muted">{t('queue.chairFree')}</p>
            <p className="text-4xl font-extrabold tracking-tighter sm:text-5xl">
              {called ? t('queue.waitingForCalled') : nextUp ? t('queue.readyForNext') : t('queue.allCaughtUp')}
            </p>
          </div>
        )}

        {called && (
          <CalledCard ticket={called} now={now} graceMinutes={grace.data} serviceBusy={Boolean(inService)}
            busy={action.isPending && ['mark_arrived', 'start_service'].includes(action.variables?.name ?? '')}
            onArrived={() => run('mark_arrived', { p_session_id: sid, p_ticket_id: called.id })}
            onStart={() => run('start_service', { p_session_id: sid, p_ticket_id: called.id })}
            onStartNow={() => setDialog({ kind: 'startNow', ticket: called })}
            onOnTheWay={() => run('mark_on_the_way', { p_session_id: sid, p_ticket_id: called.id })}
            onSkip={() => setDialog({ kind: 'skip', ticket: called })}
            onMore={() => setDialog({ kind: 'menu', ticket: called })} />
        )}

        {/* One customer can be called at a time, so CALL NEXT only appears when it can be used. */}
        {!called && nextUp && (
          <Button size="lg" fullWidth loading={action.isPending && action.variables?.name === 'call_next_customer'}
            onClick={() => run('call_next_customer', { p_session_id: sid })}
            className="h-20 rounded-3xl text-xl font-extrabold">
            {t('queue.callNext')}
            <span aria-hidden="true" className="opacity-50">·</span>
            <span dir="ltr" className="tabular-nums opacity-70">{formatTicketNumber(nextUp.ticket_number)}</span>
            <CustomerName name={nextUp.customer_name} className="max-w-40 font-semibold opacity-70" />
          </Button>
        )}

        <p className="border-t border-line pt-5 text-sm text-muted" aria-live="polite">
          {t('queue.waitingCount', { count: waiting.length })}
          {' · '}
          {estimate?.available ? t('queue.estimate', { minutes: estimate.minutes }) : t('queue.estimateUnavailable')}
        </p>
      </div>

      <aside className="lg:border-s lg:border-line lg:ps-8">
        <WaitingList tickets={waiting} now={now} onMore={(ticket) => setDialog({ kind: 'menu', ticket })} />
      </aside>

      {/* ── Dialogs ── */}
      <TicketMenuDialog ticket={dialog.kind === 'menu' ? dialog.ticket : null}
        actions={dialog.kind === 'menu' ? menuActions(dialog.ticket) : []}
        onClose={closeDialog}
        onSelect={(a) => dialog.kind === 'menu' && setDialog({ kind: a, ticket: dialog.ticket })} />

      <ConfirmDialog open={dialog.kind === 'close'} busy={action.isPending}
        title={t('queue.confirm.closeTitle')} body={t('queue.confirm.closeBody')} confirmLabel={t('queue.close')}
        onClose={closeDialog} onConfirm={() => run('close_queue', { p_session_id: sid })} />

      <ConfirmDialog open={dialog.kind === 'startNow'} busy={action.isPending}
        title={t('queue.confirm.startNowTitle')} body={t('queue.confirm.startNowBody')} confirmLabel={t('queue.actions.start')}
        onClose={closeDialog}
        onConfirm={() => dialogTicket && run('start_service', { p_session_id: sid, p_ticket_id: dialogTicket.id, p_skip_arrival: true })} />

      <ConfirmDialog open={dialog.kind === 'cancel'} busy={action.isPending}
        title={t('queue.confirm.cancelTitle', { number: dialogTicket ? formatTicketNumber(dialogTicket.ticket_number) : '' })}
        body={t('queue.confirm.cancelBody')} confirmLabel={t('queue.actions.cancel')}
        onClose={closeDialog} onConfirm={() => dialogTicket && run('barber_cancel_ticket', { p_session_id: sid, p_ticket_id: dialogTicket.id })} />

      <ConfirmDialog open={dialog.kind === 'resend'} busy={action.isPending}
        title={t('queue.confirm.resendTitle', { number: dialogTicket ? formatTicketNumber(dialogTicket.ticket_number) : '' })}
        body={t('queue.confirm.resendBody')} confirmLabel={t('queue.actions.resendLink')}
        onClose={closeDialog} onConfirm={() => dialogTicket && run('reissue_ticket_link', { p_session_id: sid, p_ticket_id: dialogTicket.id })} />

      <SkipDialog ticket={dialog.kind === 'skip' ? dialog.ticket : null} busy={action.isPending} onClose={closeDialog}
        onConfirm={(reason: SkipReason) => dialogTicket && run('skip_ticket', { p_session_id: sid, p_ticket_id: dialogTicket.id, p_reason: reason })} />

      <PhoneDialog ticket={dialog.kind === 'phone' ? dialog.ticket : null} onClose={closeDialog}
        onReveal={async () => {
          if (!dialogTicket) return {}
          try {
            const result = await action.mutateAsync({ name: 'reveal_phone', args: { p_ticket_id: dialogTicket.id } })
            return result.result === 'ok' ? { phone: String(result.phone) } : { unavailable: true }
          } catch (e) {
            closeDialog()
            setError(t(errorMessageKey(e)))
            throw e
          }
        }} />
    </div>
  )
}
