import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerApiError, type TicketView } from '../../features/customer/api'
import { forgetTicketToken, saveTicketToken } from '../../features/customer/ticketStorage'
import i18n from '../../i18n'
import { TicketPage } from './TicketPage'

const getTicket = vi.fn()
const ticketAction = vi.fn()
vi.mock('../../features/customer/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/customer/api')>()),
  getTicket: (...a: unknown[]) => getTicket(...a),
  ticketAction: (...a: unknown[]) => ticketAction(...a),
}))
vi.mock('../../lib/supabase', () => ({
  getSupabase: () => ({ channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel: vi.fn() }),
}))

const TOKEN = 'v1.' + 'A'.repeat(22) + '.' + 'B'.repeat(43)
const view = (over: Partial<TicketView> = {}): TicketView => ({
  ticket_number: 14, customer_name: 'Amine', status: 'waiting', people_ahead: 3,
  estimate: { available: true, minutes: 45 }, now_serving_number: 11,
  shop: { name: 'Salon Amine', address: null, logo_url: null, timezone: 'Africa/Casablanca' },
  queue_status: 'open', session_id: 's1', version: 1, locale: 'en', called_at: null, grace_period_minutes: 10, ...over,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><TicketPage /></QueryClientProvider>)
}

beforeEach(() => { getTicket.mockReset(); ticketAction.mockReset(); saveTicketToken(TOKEN) })
afterEach(async () => { forgetTicketToken(); await i18n.changeLanguage('en') })

describe('TicketPage', () => {
  it('shows number, position, estimate and the number being served — never a phone', async () => {
    getTicket.mockResolvedValue(view())
    const { container } = renderPage()
    expect(await screen.findByText('014')).toBeInTheDocument()
    expect(screen.getByText('people ahead of you').closest('p')).toHaveTextContent('3people ahead of you')
    expect(screen.getByText('Estimated wait: about 45 min')).toBeInTheDocument()
    expect(screen.getByText('011')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\+?\d{9,}/)
    expect(getTicket).toHaveBeenCalledWith(TOKEN)
  })

  it('when called, offers "I’m on my way" (countdown never exceeds the grace period)', async () => {
    // called_at slightly in the future: the device clock is behind the server's.
    getTicket.mockResolvedValue(view({ status: 'getting_ready', called_at: new Date(Date.now() + 20_000).toISOString() }))
    ticketAction.mockResolvedValue({ result: 'on_the_way' })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'It’s your turn' })).toBeInTheDocument()
    expect(screen.getByText('min left to arrive').closest('p')).toHaveTextContent('10min left to arrive')
    await userEvent.click(screen.getByRole('button', { name: 'I’m on my way' }))
    expect(ticketAction).toHaveBeenCalledWith(TOKEN, 'on_the_way')
  })

  it('leaving the queue needs confirmation', async () => {
    getTicket.mockResolvedValue(view())
    ticketAction.mockResolvedValue({ result: 'cancelled' })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Leave the queue' }))
    expect(ticketAction).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, leave' }))
    expect(ticketAction).toHaveBeenCalledWith(TOKEN, 'cancel')
  })

  it('an invalid or expired link shows one generic message', async () => {
    getTicket.mockImplementation(() => Promise.reject(new CustomerApiError('not_found', 404)))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'This ticket link is not valid' })).toBeInTheDocument()
  })

  it('a server or network problem is not reported as an invalid link', { timeout: 10_000 }, async () => {
    getTicket.mockImplementation(() => Promise.reject(new CustomerApiError('internal', 500)))
    renderPage()
    // The page retries a server error twice (about 3 s) before showing it.
    expect(await screen.findByRole('alert', {}, { timeout: 6_000 })).toHaveTextContent('We couldn’t load your ticket right now')
    expect(screen.queryByText('This ticket link is not valid')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('opens in the language the customer joined with (D-06)', async () => {
    getTicket.mockResolvedValue(view({ locale: 'ar' }))
    renderPage()
    expect(await screen.findByText('أشخاص قبلك')).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })
})
