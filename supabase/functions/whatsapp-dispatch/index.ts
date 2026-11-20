// POST /whatsapp-dispatch (internal; RPC-SPEC §7.6). Woken by pg_net after each outbox insert and by the
// minute sweeper. Claims due notifications, sends approved templates through the official WhatsApp
// Cloud API, and settles each row. A failure here never touches tickets.
import { constantTimeEqual } from '../_shared/crypto.ts'
import { rpc } from '../_shared/db.ts'
import { ConfigError, isLocal, requireEnv } from '../_shared/env.ts'
import { error, json, serve } from '../_shared/http.ts'
import { signTicketToken } from '../_shared/token.ts'
import { buildTemplateMessage, classifySendFailure, type ClaimedNotification } from '../_shared/whatsappMessages.ts'

const GRAPH = 'https://graph.facebook.com'
const BATCH = 20
const BUDGET_MS = 20_000

/** Graph API base. An offline test double is accepted only when SAFF_ENVIRONMENT=local. */
function graphBase(): string {
  const override = Deno.env.get('WHATSAPP_API_BASE')?.trim()
  if (!override) return GRAPH
  if (!isLocal()) throw new ConfigError('WHATSAPP_API_BASE may only be overridden when SAFF_ENVIRONMENT=local')
  return override.replace(/\/$/, '')
}

async function deliver(n: ClaimedNotification): Promise<'sent' | 'retry_scheduled' | 'failed'> {
  // The link is signed at send time with the ticket's CURRENT token_version (TD §7).
  const token = await signTicketToken(requireEnv('TICKET_HMAC_SECRET_V1'), n.ticket_id, n.token_version)
  const link = `${requireEnv('APP_BASE_URL').replace(/\/$/, '')}/t#${token}`
  const url = `${graphBase()}/${Deno.env.get('WHATSAPP_GRAPH_VERSION') ?? 'v23.0'}/${requireEnv('WHATSAPP_PHONE_NUMBER_ID')}/messages`

  let status = 0
  let body: unknown = null
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireEnv('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTemplateMessage(n, link)),
      signal: AbortSignal.timeout(10_000),
    })
    status = res.status
    body = await res.json().catch(() => null)
    const messageId = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id
    if (res.ok && messageId) {
      await rpc('mark_notification_sent', { p_id: n.id, p_provider_message_id: messageId })
      return 'sent'
    }
  } catch (e) {
    if (e instanceof ConfigError) throw e
    status = 0 // network error or timeout
  }
  const failure = classifySendFailure(status, body)
  return rpc<'retry_scheduled' | 'failed'>('mark_notification_failed', {
    p_id: n.id, p_error_code: failure.code, p_error_message: failure.message, p_retryable: failure.retryable,
  })
}

serve(async (req) => {
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  const header = req.headers.get('Authorization') ?? ''
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!constantTimeEqual(supplied, requireEnv('DISPATCH_SECRET'))) return error(req, 401, 'unauthorized')

  const totals = { sent: 0, retry_scheduled: 0, failed: 0 }
  const deadline = Date.now() + BUDGET_MS
  while (Date.now() < deadline) {
    const batch = await rpc<ClaimedNotification[]>('claim_notifications', { p_limit: BATCH })
    if (batch.length === 0) break
    for (const n of batch) {
      try {
        totals[await deliver(n)]++
      } catch (e) {
        // Unexpected error for one row: put it back for a retry, keep going with the others.
        if (e instanceof ConfigError) throw e
        await rpc('mark_notification_failed', { p_id: n.id, p_error_code: 'internal', p_error_message: '', p_retryable: true })
        totals.retry_scheduled++
      }
    }
  }
  // Counts only: no phone numbers, names or links in responses or logs.
  return json(req, 200, totals)
})
