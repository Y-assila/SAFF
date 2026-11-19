import { readPublicConfig } from '../../lib/env'
import { getSupabase } from '../../lib/supabase'

/** Errors the customer API can return (Edge Functions, RPC-SPEC §7.1). */
export type CustomerErrorCode =
  | 'invalid_request' | 'invalid_phone' | 'invalid_name' | 'captcha_failed' | 'rate_limited'
  | 'shop_not_found' | 'queue_closed' | 'queue_paused' | 'queue_full'
  | 'not_found' | 'invalid_transition' | 'network' | 'internal'

export class CustomerApiError extends Error {
  readonly code: CustomerErrorCode
  readonly status: number
  constructor(code: CustomerErrorCode, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

const KNOWN = new Set<CustomerErrorCode>(['invalid_request', 'invalid_phone', 'invalid_name', 'captcha_failed', 'rate_limited',
  'shop_not_found', 'queue_closed', 'queue_paused', 'queue_full', 'not_found', 'invalid_transition'])

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const config = readPublicConfig()
  if (!config) throw new CustomerApiError('network', 0)
  const headers: Record<string, string> = { apikey: config.supabaseAnonKey }
  if (init.body) headers['Content-Type'] = 'application/json'
  if (init.token) headers.Authorization = `Bearer ${init.token}` // ticket token: header only, never the URL
  let res: Response
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/${path}`, { ...init, headers, cache: 'no-store', referrerPolicy: 'no-referrer' })
  } catch {
    throw new CustomerApiError('network', 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const code = body?.error as CustomerErrorCode
    throw new CustomerApiError(KNOWN.has(code) ? code : 'internal', res.status)
  }
  return body as T
}

export interface PublicShop {
  result: 'ok'
  name: string
  logo_url: string | null
  address: string | null
  default_locale: string
  status: 'open' | 'paused' | 'closed'
  waiting_count: number
  session_id: string | null
  version: number | null
}

/** Public shop info (anon RPC, no personal data). Returns null for an unknown/inactive shop. */
export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const { data, error } = await getSupabase().rpc('public_get_shop', { p_slug: slug })
  if (error) throw new CustomerApiError('network', 0)
  const shop = data as unknown as PublicShop | { result: 'not_found' }
  return shop.result === 'ok' ? shop : null
}

export interface JoinRequest {
  shop_slug: string
  name: string
  phone: string
  locale: 'ar' | 'fr' | 'en'
  consent: true
  consent_text_version: string
  client_request_id: string
  turnstile_token: string
}

export type JoinResult =
  | { result: 'created'; ticket_number: number; token: string }
  | { result: 'existing'; whatsapp: boolean }

export function joinQueue(request: JoinRequest): Promise<JoinResult> {
  return call<JoinResult>('join-queue', { method: 'POST', body: JSON.stringify(request) })
}

export type TicketStatus = 'waiting' | 'getting_ready' | 'on_the_way' | 'arrived' | 'in_service'
  | 'completed' | 'skipped' | 'cancelled' | 'expired'

export interface TicketView {
  ticket_number: number
  customer_name: string
  status: TicketStatus
  people_ahead: number
  estimate: { available: boolean; minutes?: number } | null
  now_serving_number: number | null
  shop: { name: string; address: string | null; logo_url: string | null; timezone: string }
  queue_status: 'open' | 'paused' | 'finished'
  session_id: string
  version: number
  locale: 'ar' | 'fr' | 'en'
  called_at: string | null
  grace_period_minutes: number
}

export function getTicket(token: string): Promise<TicketView> {
  return call<TicketView>('ticket-get', { method: 'GET', token })
}

export function ticketAction(token: string, action: 'on_the_way' | 'cancel'): Promise<{ result: string }> {
  return call('ticket-action', { method: 'POST', token, body: JSON.stringify({ action }) })
}
