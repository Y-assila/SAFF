import { useTranslation } from 'react-i18next'
import { Badge, Button } from '../../../components/ui'
import { cn } from '../../../lib/cn'
import { formatTicketNumber, type QueueTicket } from '../types'

export function TicketNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span dir="ltr" className={cn('font-bold tabular-nums', className)}>
      {formatTicketNumber(value)}
    </span>
  )
}

/**
 * Customer-provided names may be in any script. The <bdi> isolates the name's direction inside a
 * cell that keeps the page direction, so an Arabic name in an English list stays start-aligned.
 */
export function CustomerName({ name, className }: { name: string | null; className?: string }) {
  return (
    <span className={cn('truncate', className)}>
      <bdi>{name ?? '—'}</bdi>
    </span>
  )
}

const minutesSince = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0

function MoreButton({ ticket, onMore, className }: { ticket: QueueTicket; onMore: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onMore} aria-label={t('queue.actions.more', { number: formatTicketNumber(ticket.ticket_number) })}
      className={cn('press flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-soft', className)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
      </svg>
    </button>
  )
}

/** The customer in the chair: the biggest thing on the screen. */
export function InServiceCard({ ticket, now, busy, onComplete, onMore }: {
  ticket: QueueTicket; now: number; busy: boolean; onComplete: () => void; onMore: () => void
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('queue.inService')} className="flex flex-col gap-4 animate-rise">
      <div className="flex items-center gap-3">
        <Badge tone="neutral">{t('queue.inService')}</Badge>
        {ticket.service_started_at && (
          <span className="text-sm text-muted">{t('queue.startedAgo', { minutes: minutesSince(ticket.service_started_at, now) })}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="display text-7xl sm:text-8xl lg:text-[8.5rem]"><span dir="ltr">{formatTicketNumber(ticket.ticket_number)}</span></span>
        <CustomerName name={ticket.customer_name} className="min-w-0 text-3xl font-bold tracking-tight sm:text-4xl" />
      </div>
      <div className="flex gap-2">
        <Button size="lg" variant="light" loading={busy} onClick={onComplete} className="h-16 flex-1 rounded-2xl text-lg font-bold">
          {t('queue.actions.complete')}
        </Button>
        <MoreButton ticket={ticket} onMore={onMore} className="size-16 rounded-2xl border border-line" />
      </div>
    </section>
  )
}

/** The customer who was called. Its main action is the one lime button on screen. */
export function CalledCard({ ticket, now, graceMinutes, serviceBusy, busy, onArrived, onStart, onStartNow, onOnTheWay, onSkip, onMore }: {
  ticket: QueueTicket
  now: number
  graceMinutes: number | undefined
  serviceBusy: boolean
  busy: boolean
  onArrived: () => void
  onStart: () => void
  onStartNow: () => void
  onOnTheWay: () => void
  onSkip: () => void
  onMore: () => void
}) {
  const { t } = useTranslation()
  const calledMinutes = minutesSince(ticket.called_at, now)
  const graceLeft = graceMinutes === undefined ? undefined : graceMinutes - calledMinutes
  const arrived = ticket.status === 'arrived'

  return (
    <section aria-label={t('queue.called')} className="flex flex-col gap-4 rounded-3xl bg-surface p-5 sm:p-6 animate-rise">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="signal" dot>{t(`queue.ticketStatus.${ticket.status}`)}</Badge>
        <span className="text-sm text-muted">
          {calledMinutes === 0 ? t('queue.calledJustNow') : t('queue.calledAgo', { minutes: calledMinutes })}
          {!arrived && graceLeft !== undefined && (
            <> · {graceLeft > 0 ? t('queue.graceLeft', { minutes: graceLeft }) : t('queue.graceOver')}</>
          )}
        </span>
      </div>
      <div className="flex min-w-0 items-baseline gap-4">
        <span className="display text-6xl"><span dir="ltr">{formatTicketNumber(ticket.ticket_number)}</span></span>
        <CustomerName name={ticket.customer_name} className="min-w-0 text-2xl font-bold tracking-tight" />
      </div>
      {arrived ? (
        <Button size="lg" loading={busy} disabled={serviceBusy} onClick={onStart} className="h-16 rounded-2xl text-lg font-bold">
          {t('queue.actions.start')}
        </Button>
      ) : (
        <Button size="lg" loading={busy} onClick={onArrived} className="h-16 rounded-2xl text-lg font-bold">
          {t('queue.actions.arrived')}
        </Button>
      )}
      {serviceBusy && arrived && <p className="text-sm text-muted">{t('queue.finishFirst')}</p>}
      <div className="flex flex-wrap gap-2">
        {!arrived && <Button variant="secondary" size="sm" disabled={serviceBusy} onClick={onStartNow}>{t('queue.actions.startNow')}</Button>}
        {ticket.status === 'getting_ready' && <Button variant="secondary" size="sm" onClick={onOnTheWay}>{t('queue.actions.onTheWay')}</Button>}
        <Button variant="secondary" size="sm" onClick={onSkip}>{t('queue.actions.skip')}</Button>
        <MoreButton ticket={ticket} onMore={onMore} className="ms-auto" />
      </div>
    </section>
  )
}

export function WaitingList({ tickets, now, onMore }: { tickets: QueueTicket[]; now: number; onMore: (ticket: QueueTicket) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('queue.waiting')} className="flex flex-col">
      <h2 className="flex items-baseline gap-2.5 px-2 pb-3 text-xl font-extrabold tracking-tight">
        {t('queue.waiting')} <span dir="ltr" className="tabular-nums text-graphite">{tickets.length}</span>
      </h2>
      {tickets.length === 0 ? (
        <p className="px-2 py-2 text-sm leading-relaxed text-muted">{t('queue.emptyWaiting')}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {tickets.map((ticket, index) => (
            <li key={ticket.id} className={cn('flex h-16 items-center gap-4 rounded-2xl ps-4 pe-2', index === 0 && 'bg-surface')}>
              <TicketNumber value={ticket.ticket_number} className={cn('w-12 text-xl font-extrabold', index === 0 ? 'text-signal' : 'text-graphite')} />
              <CustomerName name={ticket.customer_name} className="min-w-0 flex-1 text-base font-semibold" />
              {ticket.joined_at && (
                <span className="text-sm text-muted">{t('queue.waitedMinutes', { minutes: minutesSince(ticket.joined_at, now) })}</span>
              )}
              <MoreButton ticket={ticket} onMore={() => onMore(ticket)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
