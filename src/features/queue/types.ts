import type { Database } from '../../lib/database.types'

export type TicketStatus = Database['public']['Enums']['ticket_status']
export type QueueStatus = Database['public']['Enums']['queue_status']
export type SkipReason = Database['public']['Enums']['skip_reason']

export const ACTIVE_STATUSES = ['waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service'] as const
export const CALLED_STATUSES: readonly TicketStatus[] = ['getting_ready', 'on_the_way', 'arrived']
export const SKIP_REASONS: readonly SkipReason[] = ['no_show_after_grace', 'unreachable', 'invalid_phone', 'barber_override']

export interface QueueSession {
  id: string
  shop_id: string
  queue_date: string
  status: QueueStatus
  version: number
}

/** Barber-visible ticket columns only (the phone column is not granted; never select *). */
export interface QueueTicket {
  id: string
  ticket_number: number
  customer_name: string | null
  status: TicketStatus
  called_at: string | null
  service_started_at: string | null
}

export interface QueueStats {
  status: QueueStatus
  counts: Partial<Record<TicketStatus, number>>
  next_join_estimate: { available: boolean; minutes?: number }
}

/** Ticket numbers are padded to at least 3 digits and never capped (TD issue 13). */
export function formatTicketNumber(n: number): string {
  return String(n).padStart(3, '0')
}
