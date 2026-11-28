import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerApiError } from '../../features/customer/api'
import { JoinForm } from './JoinForm'

const joinQueue = vi.fn()
// Rejections are produced by a plain function (not vi.fn's own promise tracking, which reports
// a handled rejection as unhandled in this Vitest version).
let rejectWith: Error | null = null
vi.mock('../../features/customer/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/customer/api')>()),
  joinQueue: (...args: unknown[]) => {
    if (rejectWith) {
      const error = rejectWith
      return new Promise((_, reject) => setTimeout(() => reject(error), 0))
    }
    return joinQueue(...args)
  },
}))
// Stand-in for Cloudflare's widget: immediately yields Cloudflare's documented test token.
vi.mock('../../features/customer/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => {
    queueMicrotask(() => onToken('XXXX.DUMMY.TOKEN.XXXX'))
    return null
  },
}))

beforeEach(() => {
  joinQueue.mockReset()
  rejectWith = null
})

async function fill({ name = 'Amine', phone = '0612345678', consent = true } = {}) {
  render(<JoinForm slug="salon-amine" shopName="Salon Amine" onQueueChanged={vi.fn()} />)
  if (name) await userEvent.type(screen.getByLabelText(/Your name/), name)
  if (phone) await userEvent.type(screen.getByLabelText(/Mobile number/), phone)
  if (consent) await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Join the queue' }))
}

describe('JoinForm', () => {
  it('consent is explicit: unchecked by default, required, and names the shop', async () => {
    await fill({ consent: false })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    // Layered notice: a short label, and the full text (naming the shop) one tap away.
    expect(screen.getByRole('checkbox', { name: /WhatsApp updates about this ticket only/ })).toBeInTheDocument()
    expect(screen.queryByText(/I agree that Salon Amine and SAFF/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'What we keep, and for how long' }))
    expect(screen.getByText(/I agree that Salon Amine and SAFF/)).toBeInTheDocument()
    expect(screen.getByText('Please agree to continue.')).toBeInTheDocument()
    expect(joinQueue).not.toHaveBeenCalled()
  })

  it('validates the phone number before calling the server', async () => {
    await fill({ phone: '123' })
    expect(screen.getByText('Enter a valid mobile number.')).toBeInTheDocument()
    expect(joinQueue).not.toHaveBeenCalled()
  })

  it('sends the request with consent version, locale, idempotency key and Turnstile token', async () => {
    joinQueue.mockResolvedValue({ result: 'existing', whatsapp: true })
    await fill()
    expect(joinQueue).toHaveBeenCalledWith(expect.objectContaining({
      shop_slug: 'salon-amine', name: 'Amine', phone: '0612345678', consent: true,
      consent_text_version: 'draft-2026-11b', locale: 'en', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX',
      client_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    }))
    expect(await screen.findByText('You already have a ticket at this shop')).toBeInTheDocument()
    expect(screen.getByText('We sent your ticket link to your WhatsApp again.')).toBeInTheDocument()
  })

  it('shows server refusals as translated messages', async () => {
    rejectWith = new CustomerApiError('queue_full', 409)
    await fill()
    expect(await screen.findByRole('alert')).toHaveTextContent('The queue is full right now.')
  })
})
