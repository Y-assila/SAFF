import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card } from '../../../components/ui'
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

function SlotCard({ title, empty, children, highlight }: { title: string; empty: string; children?: ReactNode; highlight?: boolean }) {
  return (
    <Card as="section" aria-label={title} className={cn('flex min-h-44 flex-col gap-4', highlight && 'border-signal/60')}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
      {children ?? <p className="my-auto text-center text-sm text-muted">{empty}</p>}
    </Card>
  )
}

export function InServiceCard({ ticket, busy, onComplete, onMore }: {
  ticket: QueueTicket | undefined; busy: boolean; onComplete: () => void; onMore: () => void
}) {
  const { t } = useTranslation()
  return (
    <SlotCard title={t('queue.inService')} empty={t('queue.emptyInService')}>
      {ticket && (
        <>
          <div className="flex items-baseline gap-3">
            <TicketNumber value={ticket.ticket_number} className="text-4xl" />
            <CustomerName name={ticket.customer_name} className="text-lg font-semibold" />
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button size="lg" className="flex-1" loading={busy} onClick={onComplete}>{t('queue.actions.complete')}</Button>
            <Button variant="ghost" size="lg" onClick={onMore} aria-label={t('queue.actions.more', { number: formatTicketNumber(ticket.ticket_number) })}>⋯</Button>
          </div>
        </>
      )}
    </SlotCard>
  )
}

export function CalledCard({ ticket, now, graceMinutes, serviceBusy, busy, onArrived, onStart, onStartNow, onOnTheWay, onSkip, onMore }: {
  ticket: QueueTicket | undefined
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
  if (!ticket) return <SlotCard title={t('queue.called')} empty={t('queue.emptyCalled')} />

  const calledMinutes = ticket.called_at ? Math.max(0, Math.floor((now - Date.parse(ticket.called_at)) / 60_000)) : 0
  const graceLeft = graceMinutes === undefined ? undefined : graceMinutes - calledMinutes
  const arrived = ticket.status === 'arrived'

  return (
    <SlotCard title={t('queue.called')} empty="" highlight>
      <div className="flex flex-wrap items-baseline gap-3">
        <TicketNumber value={ticket.ticket_number} className="text-4xl" />
        <CustomerName name={ticket.customer_name} className="text-lg font-semibold" />
        <Badge tone="signal" dot className="ms-auto">{t(`queue.ticketStatus.${ticket.status}`)}</Badge>
      </div>
      <p className="text-sm text-muted">
        {t('queue.calledAgo', { minutes: calledMinutes })}
        {!arrived && graceLeft !== undefined && (
          <> · {graceLeft > 0 ? t('queue.graceLeft', { minutes: graceLeft }) : t('queue.graceOver')}</>
        )}
      </p>
      <div className="mt-auto flex flex-col gap-2">
        {arrived ? (
          <Button size="lg" loading={busy} disabled={serviceBusy} onClick={onStart}>{t('queue.actions.start')}</Button>
        ) : (
          <Button size="lg" loading={busy} onClick={onArrived}>{t('queue.actions.arrived')}</Button>
        )}
        <div className="flex flex-wrap gap-2">
          {!arrived && <Button variant="secondary" size="sm" disabled={serviceBusy} onClick={onStartNow}>{t('queue.actions.startNow')}</Button>}
          {ticket.status === 'getting_ready' && <Button variant="secondary" size="sm" onClick={onOnTheWay}>{t('queue.actions.onTheWay')}</Button>}
          <Button variant="secondary" size="sm" onClick={onSkip}>{t('queue.actions.skip')}</Button>
          <Button variant="ghost" size="sm" onClick={onMore} aria-label={t('queue.actions.more', { number: formatTicketNumber(ticket.ticket_number) })}>⋯</Button>
        </div>
      </div>
    </SlotCard>
  )
}

export function WaitingList({ tickets, onMore }: { tickets: QueueTicket[]; onMore: (ticket: QueueTicket) => void }) {
  const { t } = useTranslation()
  return (
    <Card as="section" aria-label={t('queue.waiting')} padding="none">
      <h2 className="px-5 pt-5 text-xs font-semibold uppercase tracking-widest text-muted">
        {t('queue.waiting')} · {t('queue.waitingCount', { count: tickets.length })}
      </h2>
      {tickets.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">{t('queue.emptyWaiting')}</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {tickets.map((ticket, index) => (
            <li key={ticket.id} className="flex items-center gap-4 px-5 py-3">
              <TicketNumber value={ticket.ticket_number} className={cn('w-12 text-lg', index === 0 ? 'text-signal' : 'text-soft')} />
              <CustomerName name={ticket.customer_name} className="min-w-0 flex-1" />
              <Button variant="ghost" size="sm" onClick={() => onMore(ticket)}
                      aria-label={t('queue.actions.more', { number: formatTicketNumber(ticket.ticket_number) })}>⋯</Button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
