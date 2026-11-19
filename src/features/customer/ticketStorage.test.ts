import { afterEach, describe, expect, it } from 'vitest'
import { forgetTicketToken, loadTicketToken, takeTokenFromFragment } from './ticketStorage'

const TOKEN = 'v1.' + 'A'.repeat(22) + '.' + 'B'.repeat(43)

afterEach(() => {
  forgetTicketToken()
  window.history.replaceState(null, '', '/')
})

describe('ticket token storage (TD §7)', () => {
  it('takes the token from the fragment, stores it, and removes it from the address bar', () => {
    window.history.replaceState(null, '', `/t#${TOKEN}`)
    expect(takeTokenFromFragment()).toBe(TOKEN)
    expect(loadTicketToken()).toBe(TOKEN)
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/t')
  })

  it('ignores fragments that are not ticket tokens', () => {
    window.history.replaceState(null, '', '/t#access_token=abc')
    expect(takeTokenFromFragment()).toBeNull()
    expect(loadTicketToken()).toBeNull()
    expect(window.location.hash).toBe('#access_token=abc')
  })
})
