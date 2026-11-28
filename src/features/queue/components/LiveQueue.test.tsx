import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError } from '../errors'
import type { QueueSession, QueueTicket } from '../types'
import { LiveQueue } from './LiveQueue'

const mutate = vi.fn()
let tickets: QueueTicket[] = []

vi.mock('../useQueue', () => ({
  useActiveTickets: () => ({ isPending: false, isError: false, data: tickets }),
  useQueueStats: () => ({ data: { next_join_estimate: { available: true, minutes: 50 } } }),
  useGracePeriod: () => ({ data: 10 }),
  useQueueRealtime: vi.fn(),
  useNow: () => Date.parse('2026-11-19T10:15:00Z'),
  useQueueAction: () => ({ mutate, mutateAsync: vi.fn(), isPending: false, variables: undefined }),
}))

const session: QueueSession = { id: 'sess-1', shop_id: 'shop-1', queue_date: '2026-11-19', status: 'open', version: 1 }
const ticket = (n: number, status: QueueTicket['status'], extra: Partial<QueueTicket> = {}): QueueTicket =>
  ({ id: `t${n}`, ticket_number: n, customer_name: `Client ${n}`, status, called_at: null, service_started_at: null, ...extra })

beforeEach(() => {
  mutate.mockReset()
})

describe('LiveQueue', () => {
  it('shows the slots, the waiting list and the next number on CALL NEXT', () => {
    tickets = [ticket(1, 'in_service'), ticket(2, 'waiting'), ticket(3, 'waiting')]
    render(<LiveQueue shopId="shop-1" session={session} />)
    expect(within(screen.getByRole('region', { name: 'In service' })).getByText('001')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Called' })).toBeNull() // nobody called: no empty box
    expect(within(screen.getByRole('region', { name: 'Waiting' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Call next/ })).toHaveTextContent('002')
    expect(screen.getByText(/2 waiting · A new customer waits about 50 min/)).toBeInTheDocument()
  })

  it('never renders phone numbers (none are fetched)', () => {
    tickets = [ticket(1, 'waiting')]
    const { container } = render(<LiveQueue shopId="shop-1" session={session} />)
    expect(container.textContent).not.toMatch(/\+?\d{9,}/)
  })

  it('hides CALL NEXT while someone is called (one called customer at a time)', () => {
    tickets = [ticket(1, 'getting_ready', { called_at: '2026-11-19T10:12:00Z' }), ticket(2, 'waiting')]
    render(<LiveQueue shopId="shop-1" session={session} />)
    expect(screen.queryByRole('button', { name: /Call next/ })).toBeNull()
    expect(screen.getByText(/Called 3 min ago · 7 min left to arrive/)).toBeInTheDocument()
  })

  it('sends the right RPC for CALL NEXT and COMPLETE', async () => {
    tickets = [ticket(1, 'in_service'), ticket(2, 'waiting')]
    render(<LiveQueue shopId="shop-1" session={session} />)
    await userEvent.click(screen.getByRole('button', { name: /Call next/ }))
    expect(mutate).toHaveBeenLastCalledWith({ name: 'call_next_customer', args: { p_session_id: 'sess-1' } }, expect.anything())
    await userEvent.click(screen.getByRole('button', { name: 'Complete service' }))
    expect(mutate).toHaveBeenLastCalledWith(
      { name: 'complete_service', args: { p_session_id: 'sess-1', p_ticket_id: 't1' } }, expect.anything())
  })

  it('asks for confirmation before closing the queue', async () => {
    tickets = []
    render(<LiveQueue shopId="shop-1" session={session} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close queue' }))
    const dialog = screen.getByRole('dialog', { name: 'Close today’s queue?' })
    expect(mutate).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close queue' }))
    expect(mutate).toHaveBeenLastCalledWith({ name: 'close_queue', args: { p_session_id: 'sess-1' } }, expect.anything())
  })

  it('requires a reason to skip, and hides no-show for a waiting customer', async () => {
    tickets = [ticket(4, 'waiting')]
    render(<LiveQueue shopId="shop-1" session={session} />)
    await userEvent.click(screen.getByRole('button', { name: 'More actions for ticket 004' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    const dialog = screen.getByRole('dialog', { name: 'Skip ticket 004' })
    expect(within(dialog).queryByLabelText('Did not arrive after the grace period')).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Skip' })).toBeDisabled()
    await userEvent.click(within(dialog).getByLabelText('Unreachable'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip' }))
    expect(mutate).toHaveBeenLastCalledWith(
      { name: 'skip_ticket', args: { p_session_id: 'sess-1', p_ticket_id: 't4', p_reason: 'unreachable' } }, expect.anything())
  })

  it('shows a translated message when the database refuses an action', async () => {
    tickets = [ticket(2, 'waiting')]
    mutate.mockImplementation((_vars, opts) => opts.onError(new RpcError('called_slot_occupied')))
    render(<LiveQueue shopId="shop-1" session={session} />)
    await userEvent.click(screen.getByRole('button', { name: /Call next/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('A customer is already called. Start, skip or cancel them first.')
  })
})
