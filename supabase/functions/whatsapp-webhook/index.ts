// /whatsapp-webhook (public; RPC-SPEC §7.7). Meta's endpoint for delivery receipts.
//   GET  — subscription verification (hub.verify_token)
//   POST — signed status callbacks (X-Hub-Signature-256); statuses only move forward.
// Inbound customer messages are ignored in the MVP (phone verification is off, TD issue 6) and never logged.
import { constantTimeEqual, verifyMetaSignature } from '../_shared/crypto.ts'
import { rpc } from '../_shared/db.ts'
import { requireEnv } from '../_shared/env.ts'
import { error, json, serve } from '../_shared/http.ts'

interface StatusUpdate {
  id?: string
  status?: string
  timestamp?: string
  errors?: { code?: number }[]
}

serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const ok = url.searchParams.get('hub.mode') === 'subscribe'
      && constantTimeEqual(url.searchParams.get('hub.verify_token') ?? '', requireEnv('WHATSAPP_VERIFY_TOKEN'))
    const challenge = url.searchParams.get('hub.challenge') ?? ''
    return ok && /^[A-Za-z0-9_-]{1,128}$/.test(challenge)
      ? new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
      : error(req, 403, 'forbidden')
  }
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  if (Number(req.headers.get('Content-Length') ?? 0) > 1_000_000) return error(req, 413, 'payload_too_large')

  const raw = await req.text()
  if (!await verifyMetaSignature(requireEnv('WHATSAPP_APP_SECRET'), raw, req.headers.get('X-Hub-Signature-256'))) {
    return error(req, 401, 'invalid_signature')
  }

  const payload = JSON.parse(raw) as { entry?: { changes?: { value?: { statuses?: StatusUpdate[] } }[] }[] }
  let recorded = 0
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue
        const at = status.timestamp && /^\d{1,12}$/.test(status.timestamp)
          ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString()
        const changed = await rpc<boolean>('record_whatsapp_status', {
          p_provider_message_id: status.id, p_status: status.status, p_at: at,
          p_error_code: status.errors?.[0]?.code !== undefined ? `meta_${status.errors[0].code}` : null,
        })
        if (changed) recorded++
      }
    }
  }
  // Answer quickly with 200 so Meta does not retry; a database outage throws → 500 → Meta retries later.
  return json(req, 200, { ok: true, recorded })
})
