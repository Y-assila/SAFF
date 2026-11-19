import { describe, expect, it } from 'vitest'
import { parseTicketToken, signTicketToken, verifyTicketToken } from './token'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const ID = '2f1c7a5e-9b0d-4c3e-8f6a-1d2b3c4d5e6f'

describe('ticket tokens (TD §7)', () => {
  it('round-trips: sign, parse, verify', async () => {
    const token = await signTicketToken(SECRET, ID, 1)
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/)
    expect(parseTicketToken(token)?.ticketId).toBe(ID)
    expect(await verifyTicketToken(SECRET, token, 1)).toBe(true)
  })

  it('a reissued link (bumped token_version) revokes the old one', async () => {
    const old = await signTicketToken(SECRET, ID, 1)
    expect(await verifyTicketToken(SECRET, old, 2)).toBe(false)
    expect(await verifyTicketToken(SECRET, await signTicketToken(SECRET, ID, 2), 2)).toBe(true)
  })

  it('rejects a token signed with another secret', async () => {
    const forged = await signTicketToken('another-secret-0123456789abcdef0123456789', ID, 1)
    expect(await verifyTicketToken(SECRET, forged, 1)).toBe(false)
  })

  it('rejects tampering with the ticket id or the signature', async () => {
    const token = await signTicketToken(SECRET, ID, 1)
    const [v, id, sig] = token.split('.')
    const otherId = (await signTicketToken(SECRET, '00000000-0000-4000-8000-000000000000', 1)).split('.')[1]
    expect(await verifyTicketToken(SECRET, `${v}.${otherId}.${sig}`, 1)).toBe(false)
    const flipped = sig.slice(0, -2) + (sig.at(-2) === 'A' ? 'B' : 'A') + sig.at(-1)
    expect(await verifyTicketToken(SECRET, `${v}.${id}.${flipped}`, 1)).toBe(false)
  })

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', 'v2.abc.def', 'v1..', 'Bearer x', 'v1.' + 'A'.repeat(22) + '.' + 'A'.repeat(42)]) {
      expect(parseTicketToken(bad)).toBeNull()
      expect(await verifyTicketToken(SECRET, bad, 1)).toBe(false)
    }
  })

  it('refuses weak secrets', async () => {
    await expect(signTicketToken('short', ID, 1)).rejects.toThrow()
  })
})
