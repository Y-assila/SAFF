import { describe, expect, it } from 'vitest'
import { shopToday } from './api'
import { errorMessageKey, RpcError, toRpcError } from './errors'
import { formatTicketNumber } from './types'

describe('queue helpers', () => {
  it('pads ticket numbers to 3 digits without capping', () => {
    expect(formatTicketNumber(7)).toBe('007')
    expect(formatTicketNumber(42)).toBe('042')
    expect(formatTicketNumber(1234)).toBe('1234')
  })

  it('maps database error codes to translated messages', () => {
    expect(toRpcError({ message: 'called_slot_occupied' }).code).toBe('called_slot_occupied')
    expect(errorMessageKey(toRpcError({ message: 'grace_not_elapsed' }))).toBe('errors.grace_not_elapsed')
  })

  it('never surfaces raw database messages', () => {
    expect(toRpcError({ message: 'permission denied for table tickets' }).code).toBe('generic')
    expect(toRpcError({ message: 'TypeError: Failed to fetch' }).code).toBe('network')
    expect(errorMessageKey(new Error('boom'))).toBe('errors.generic')
    expect(new RpcError('rate_limited').code).toBe('rate_limited')
  })

  it('computes today in the shop time zone', () => {
    // Offsets come from the IANA tz database, never a hard-coded UTC+1 (TD issue 8).
    // Per tz data (checked identical in PostgreSQL): Casablanca is UTC+1 on 1 July 2026, UTC+0 on 19 Nov 2026.
    expect(shopToday('Africa/Casablanca', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02')
    expect(shopToday('Africa/Casablanca', new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-19')
    expect(shopToday('UTC', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-01')
  })
})
