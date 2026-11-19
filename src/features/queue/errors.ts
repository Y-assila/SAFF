import type { ParseKeys } from 'i18next'

/** Error codes raised by the queue RPCs (RPC-SPEC §1.8) that have a translated message. */
const KNOWN_CODES = [
  'not_authorized', 'shop_not_found', 'queue_finished', 'queue_closed_today', 'queue_already_started',
  'reopen_not_allowed', 'called_slot_occupied', 'no_waiting_customers', 'service_in_progress',
  'invalid_transition', 'grace_not_elapsed', 'invalid_skip_reason', 'ticket_not_found', 'rate_limited',
] as const
export type RpcErrorCode = (typeof KNOWN_CODES)[number]

export class RpcError extends Error {
  readonly code: RpcErrorCode | 'network' | 'generic'
  constructor(code: RpcError['code']) {
    super(code)
    this.code = code
  }
}

/** Maps a PostgREST/Supabase error to an RpcError. RPCs raise the code as the message (P0001). */
export function toRpcError(error: { message?: string; code?: string } | null | undefined): RpcError {
  const message = error?.message ?? ''
  if ((KNOWN_CODES as readonly string[]).includes(message)) return new RpcError(message as RpcErrorCode)
  if (/fetch|network|Failed to fetch/i.test(message)) return new RpcError('network')
  return new RpcError('generic')
}

export function errorMessageKey(error: unknown): ParseKeys {
  const code = error instanceof RpcError ? error.code : 'generic'
  return `errors.${code}` as ParseKeys
}
