import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { signMetaBody } from '../supabase/functions/_shared/crypto'
import { adminClient, localStack, openShop, resetRateLimits } from './fixtures'
import { functionsEnv, sentMessages, waitFor } from './whatsapp'

// WhatsApp pipeline against the real stack: outbox → pg_net → whatsapp-dispatch → (Meta double) → webhook.
const ORIGIN = 'http://127.0.0.1:5174'
const { url, anonKey } = localStack()
const fn = (name: string) => `${url}/functions/v1/${name}`

async function join(slug: string, phone: string) {
  const res = await fetch(fn('join-queue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Origin: ORIGIN },
    body: JSON.stringify({ shop_slug: slug, name: 'Client', phone, locale: 'fr', consent: true,
      consent_text_version: 'draft-2026-11', client_request_id: randomUUID(), turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX' }),
  })
  expect(res.status).toBe(201)
  return (await res.json()) as { ticket_number: number; token: string }
}

/** A fresh Moroccan mobile number per test (re-runnable against a long-lived local database).
 *  Uses the allocated 0661 mobile range. `ending` selects the Meta double's behaviour:
 *  99 → temporary error, 98 → permanent error; the default (10–97) always succeeds. */
function uniquePhone(ending = String(10 + Math.floor(Math.random() * 88))) {
  const middle = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')
  const local = `0661${middle}${ending}`
  return { local, e164: `+212${local.slice(1)}`, wa: `212${local.slice(1)}` }
}

/** The test shop's notification of a given type (each test creates its own shop). */
async function notification(shopId: string, type: string) {
  const { data } = await adminClient().from('notifications')
    .select('status, attempts, error_code, provider_message_id, next_attempt_at')
    .eq('shop_id', shopId).eq('notification_type', type as never).maybeSingle()
  return data
}

test.beforeEach(async () => {
  await resetRateLimits()
})

test('a new ticket sends the approved template with a working private link', async () => {
  const { shop } = await openShop()
  const phone = uniquePhone()
  await join(shop.slug, phone.local)
  const msg = await waitFor(async () => (await sentMessages()).find((m) => m.to === phone.wa))
  expect(msg.template).toBe('queue_ticket_created')
  expect(msg.language).toBe('fr')
  expect(msg.parameters.slice(0, 2)).toEqual([shop.name, '001'])

  // The link in the message opens the customer's ticket (token signed at send time).
  const token = msg.parameters[2].split('#')[1]
  const ticket = await fetch(fn('ticket-get'), { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
  expect(ticket.status).toBe(200)
  expect((await ticket.json()).ticket_number).toBe(1)

  const row = await waitFor(async () => {
    const n = await notification(shop.id, 'ticket_created')
    return n?.status === 'sent' ? n : null
  })
  expect(row!.provider_message_id).toBe(msg.id)
})

test('CALL NEXT sends "turn approaching" with the grace period', async () => {
  const { shop, barberRpc, sessionId } = await openShop()
  const phone = uniquePhone()
  await join(shop.slug, phone.local)
  await barberRpc.rpc('call_next_customer', { p_session_id: sessionId })
  const msg = await waitFor(async () => (await sentMessages()).find((m) => m.to === phone.wa && m.template === 'queue_turn_approaching'))
  expect(msg.parameters.slice(0, 3)).toEqual([shop.name, '001', '10'])
})

test('a temporary WhatsApp failure is retried later and never affects the ticket', async () => {
  const { shop } = await openShop()
  const { token } = await join(shop.slug, uniquePhone('99').local) // the Meta double answers 503 for numbers ending in 99
  const row = await waitFor(async () => {
    const n = await notification(shop.id, 'ticket_created')
    return n?.error_code ? n : null
  })
  expect(row).toMatchObject({ status: 'pending', attempts: 1, error_code: 'meta_131000' })
  expect(new Date(row!.next_attempt_at!).getTime()).toBeGreaterThan(Date.now() + 30_000)
  const ticket = await fetch(fn('ticket-get'), { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
  expect((await ticket.json()).status).toBe('waiting')
})

test('a permanent failure is recorded as failed without retries', async () => {
  const { shop } = await openShop()
  await join(shop.slug, uniquePhone('98').local) // the Meta double answers 131026 (undeliverable) for numbers ending in 98
  const row = await waitFor(async () => {
    const n = await notification(shop.id, 'ticket_created')
    return n?.status === 'failed' ? n : null
  })
  expect(row).toMatchObject({ attempts: 1, error_code: 'meta_131026' })
})

test('no messages for shops with WhatsApp disabled', async () => {
  const { shop } = await openShop()
  await adminClient().from('shop_settings').update({ whatsapp_enabled: false }).eq('shop_id', shop.id)
  const phone = uniquePhone()
  await join(shop.slug, phone.local)
  await new Promise((r) => setTimeout(r, 2_000))
  expect((await sentMessages()).some((m) => m.to === phone.wa)).toBe(false)
  expect(await notification(shop.id, 'ticket_created')).toBeNull()
})

test('the dispatcher only accepts the database\'s shared secret', async () => {
  for (const auth of [undefined, 'Bearer wrong-secret']) {
    const res = await fetch(fn('whatsapp-dispatch'), { method: 'POST', headers: auth ? { Authorization: auth } : {} })
    expect(res.status).toBe(401)
  }
})

test('webhook: verification handshake and signed delivery receipts', async () => {
  const verify = functionsEnv('WHATSAPP_VERIFY_TOKEN')
  const ok = await fetch(fn(`whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=abc123`))
  expect(ok.status).toBe(200)
  expect(await ok.text()).toBe('abc123')
  expect((await fetch(fn('whatsapp-webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc123'))).status).toBe(403)

  const { shop } = await openShop()
  const phone = uniquePhone()
  await join(shop.slug, phone.local)
  const msg = await waitFor(async () => (await sentMessages()).find((m) => m.to === phone.wa))
  const receipt = (status: string) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
    statuses: [{ id: msg.id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: msg.to }] } }] }] })
  const post = async (body: string, signature?: string) => fetch(fn('whatsapp-webhook'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Hub-Signature-256': signature } : {}) }, body })

  expect((await post(receipt('delivered'))).status).toBe(401) // unsigned
  expect((await post(receipt('delivered'), await signMetaBody('wrong-secret', receipt('delivered')))).status).toBe(401)

  const secret = functionsEnv('WHATSAPP_APP_SECRET')
  expect((await post(receipt('delivered'), await signMetaBody(secret, receipt('delivered')))).status).toBe(200)
  expect((await notification(shop.id, 'ticket_created'))?.status).toBe('delivered')
  await post(receipt('read'), await signMetaBody(secret, receipt('read')))
  await post(receipt('sent'), await signMetaBody(secret, receipt('sent'))) // late, out of order: ignored
  expect((await notification(shop.id, 'ticket_created'))?.status).toBe('read')
})
