import type { Database } from '../../lib/database.types'
import { getSupabase } from '../../lib/supabase'
import { toRpcError } from './errors'
import { ACTIVE_STATUSES, type QueueSession, type QueueStats, type QueueTicket } from './types'

type Functions = Database['public']['Functions']
export type BarberRpc = Extract<keyof Functions,
  | 'start_queue' | 'pause_queue' | 'resume_queue' | 'close_queue' | 'reopen_queue'
  | 'call_next_customer' | 'mark_on_the_way' | 'mark_arrived' | 'start_service' | 'complete_service'
  | 'skip_ticket' | 'barber_cancel_ticket' | 'reveal_phone' | 'reissue_ticket_link'>

/** Calls a barber RPC; errors become RpcError with the database's error code. */
export async function callRpc<N extends BarberRpc>(name: N, args: Functions[N]['Args']): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabase().rpc(name, args as never)
  if (error) throw toRpcError(error)
  return (data ?? {}) as unknown as Record<string, unknown>
}

/** The shop's most recent session (live, or today's finished one for "reopen"). */
export async function fetchLatestSession(shopId: string): Promise<QueueSession | null> {
  const { data, error } = await getSupabase()
    .from('queue_sessions')
    .select('id, shop_id, queue_date, status, version')
    .eq('shop_id', shopId)
    .order('queue_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw toRpcError(error)
  return data
}

export async function fetchActiveTickets(sessionId: string): Promise<QueueTicket[]> {
  const { data, error } = await getSupabase()
    .from('tickets')
    .select('id, ticket_number, customer_name, status, joined_at, called_at, service_started_at')
    .eq('queue_session_id', sessionId)
    .in('status', [...ACTIVE_STATUSES])
    .order('ticket_number', { ascending: true })
  if (error) throw toRpcError(error)
  return data ?? []
}

export async function fetchStats(sessionId: string): Promise<QueueStats> {
  const { data, error } = await getSupabase().rpc('get_queue_stats', { p_session_id: sessionId })
  if (error) throw toRpcError(error)
  return data as unknown as QueueStats
}

export async function fetchGracePeriod(shopId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from('shop_settings').select('grace_period_minutes').eq('shop_id', shopId).single()
  if (error) throw toRpcError(error)
  return data.grace_period_minutes
}

/** Today's date (YYYY-MM-DD) in the shop's time zone. */
export function shopToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
