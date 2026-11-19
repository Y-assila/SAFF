import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '../../../components/ui'
import { formatTicketNumber, SKIP_REASONS, type QueueTicket, type SkipReason } from '../types'

export function ConfirmDialog({ open, title, body, confirmLabel, busy, onConfirm, onClose }: {
  open: boolean; title: string; body: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onClose={onClose} title={title} description={body}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('queue.confirm.back')}</Button>
        <Button loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </>} />
  )
}

/** Reason is required; waiting customers cannot be skipped for no-show (never called). */
export function SkipDialog({ ticket, busy, onConfirm, onClose }: {
  ticket: QueueTicket | null; busy: boolean; onConfirm: (reason: SkipReason) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<SkipReason | null>(null)
  const reasons = ticket?.status === 'waiting' ? SKIP_REASONS.filter((r) => r !== 'no_show_after_grace') : SKIP_REASONS
  const close = () => { setReason(null); onClose() }
  return (
    <Dialog open={Boolean(ticket)} onClose={close}
      title={t('queue.confirm.skipTitle', { number: ticket ? formatTicketNumber(ticket.ticket_number) : '' })}
      description={t('queue.confirm.skipBody')}
      footer={<>
        <Button variant="ghost" onClick={close}>{t('queue.confirm.back')}</Button>
        <Button loading={busy} disabled={!reason} onClick={() => reason && onConfirm(reason)}>{t('queue.actions.skip')}</Button>
      </>}>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">{t('queue.confirm.skipBody')}</legend>
        {reasons.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 rounded-control border border-line px-4 py-3 has-[:checked]:border-signal">
            <input type="radio" name="skip-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-signal" />
            <span className="text-sm">{t(`queue.confirm.skipReason.${r}`)}</span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}

/** Phone numbers are hidden by default; revealing one is an audited server action. */
export function PhoneDialog({ ticket, onReveal, onClose }: {
  ticket: QueueTicket | null; onReveal: () => Promise<{ phone?: string; unavailable?: boolean }>; onClose: () => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<{ phone?: string; unavailable?: boolean; busy?: boolean }>({})
  const close = () => { setState({}); onClose() }
  return (
    <Dialog open={Boolean(ticket)} onClose={close}
      title={t('queue.confirm.phoneTitle', { number: ticket ? formatTicketNumber(ticket.ticket_number) : '' })}
      description={t('queue.confirm.phoneBody')}
      footer={state.phone || state.unavailable
        ? <Button variant="secondary" onClick={close}>{t('queue.done')}</Button>
        : <>
            <Button variant="ghost" onClick={close}>{t('queue.confirm.back')}</Button>
            <Button loading={state.busy} onClick={async () => {
              setState({ busy: true })
              try { setState(await onReveal()) } catch { setState({}) }
            }}>{t('queue.confirm.phoneReveal')}</Button>
          </>}>
      {state.phone && (
        <a href={`tel:${state.phone}`} dir="ltr" className="text-2xl font-bold tabular-nums text-soft underline-offset-4 hover:underline">
          {state.phone}
        </a>
      )}
      {state.unavailable && <p className="text-sm text-muted">{t('queue.confirm.phoneUnavailable')}</p>}
    </Dialog>
  )
}

export type TicketMenuAction = 'phone' | 'resend' | 'skip' | 'cancel'

export function TicketMenuDialog({ ticket, actions, onSelect, onClose }: {
  ticket: QueueTicket | null; actions: TicketMenuAction[]; onSelect: (action: TicketMenuAction) => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const labels: Record<TicketMenuAction, string> = {
    phone: t('queue.actions.showPhone'), resend: t('queue.actions.resendLink'),
    skip: t('queue.actions.skip'), cancel: t('queue.actions.cancel'),
  }
  return (
    <Dialog open={Boolean(ticket)} onClose={onClose}
      title={ticket ? t('queue.actions.more', { number: formatTicketNumber(ticket.ticket_number) }) : ''}>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Button key={a} variant="secondary" fullWidth onClick={() => onSelect(a)}>{labels[a]}</Button>
        ))}
      </div>
    </Dialog>
  )
}
