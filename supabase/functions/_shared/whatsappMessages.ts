// WhatsApp Cloud API message building and error classification. Runtime-neutral (no Deno APIs).
// Only pre-approved UTILITY templates are sent (TD issue 6); see docs/WHATSAPP-TEMPLATES.md.

export interface ClaimedNotification {
  id: string
  notification_type: 'ticket_created' | 'turn_approaching' | 'queue_closed' | 'link_resent' | 'queue_update'
  recipient_phone: string
  template_name: string
  template_language: string
  attempt: number
  ticket_id: string
  ticket_number: number
  token_version: number
  shop_name: string
  grace_period_minutes: number
}

/** Ticket numbers are padded to at least 3 digits, never capped (TD issue 13). */
export function formatTicketNumber(n: number): string {
  return String(n).padStart(3, '0')
}

/** Meta language codes for SAFF locales. */
const LANGUAGE: Record<string, string> = { fr: 'fr', ar: 'ar', en: 'en' }

/**
 * Body parameters, in template order ({{1}}, {{2}}, …). Must match the templates submitted to Meta.
 *   queue_ticket_created    (ticket_created, link_resent): shop, ticket number, ticket link
 *   queue_turn_approaching  (turn_approaching):            shop, ticket number, grace minutes, ticket link
 *   queue_closed            (queue_closed):                shop, ticket number
 */
export function templateParameters(n: ClaimedNotification, ticketLink: string): string[] {
  const ticket = formatTicketNumber(n.ticket_number)
  switch (n.template_name) {
    case 'queue_ticket_created':
      return [n.shop_name, ticket, ticketLink]
    case 'queue_turn_approaching':
      return [n.shop_name, ticket, String(n.grace_period_minutes), ticketLink]
    case 'queue_closed':
      return [n.shop_name, ticket]
    default:
      throw new Error(`unknown template ${n.template_name}`)
  }
}

export function buildTemplateMessage(n: ClaimedNotification, ticketLink: string) {
  const language = LANGUAGE[n.template_language] ?? 'fr'
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: n.recipient_phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: n.template_name,
      language: { code: language },
      components: [{ type: 'body', parameters: templateParameters(n, ticketLink).map((text) => ({ type: 'text', text })) }],
    },
  }
}

// Meta error codes that are temporary (throttling / service availability): retry with backoff.
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131048, 131056, 133004])

export interface SendFailure {
  retryable: boolean
  code: string
  message: string
}

/** Classifies a failed send. status 0 = network error / timeout. Unknown 4xx are permanent. */
export function classifySendFailure(status: number, body: unknown): SendFailure {
  const error = (body as { error?: { code?: number; message?: string } } | null)?.error
  const metaCode = typeof error?.code === 'number' ? error.code : undefined
  const message = typeof error?.message === 'string' ? error.message : ''
  if (status === 0) return { retryable: true, code: 'network', message }
  if (metaCode !== undefined && RETRYABLE_META_CODES.has(metaCode)) return { retryable: true, code: `meta_${metaCode}`, message }
  if (status === 429) return { retryable: true, code: 'http_429', message }
  if (status >= 500) return { retryable: true, code: `http_${status}`, message }
  return { retryable: false, code: metaCode !== undefined ? `meta_${metaCode}` : `http_${status}`, message }
}
