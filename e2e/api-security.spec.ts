import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { localStack, openShop, resetRateLimits } from './fixtures'

// API-level checks against the real Edge Functions (no browser).
const ORIGIN = 'http://127.0.0.1:5174'
const { url, anonKey } = localStack()
const fn = (name: string) => `${url}/functions/v1/${name}`

function joinBody(slug: string, phone: string, overrides: Record<string, unknown> = {}) {
  return {
    shop_slug: slug, name: 'API', phone, locale: 'fr', consent: true, consent_text_version: 'draft-2026-11',
    client_request_id: randomUUID(), turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX', ...overrides,
  }
}

test.describe('Edge Function security', () => {
  test.beforeEach(async () => {
    await resetRateLimits()
  })

  test('join requires the app origin, a valid bot check and a mobile number', async ({ request }) => {
    const { shop } = await openShop()
    const headers = { apikey: anonKey, Origin: ORIGIN }
    expect((await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0612340001'), headers: { apikey: anonKey } })).status()).toBe(403)
    const badCaptcha = await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0612340001', { turnstile_token: 'forged' }), headers })
    expect(badCaptcha.status()).toBe(403)
    expect(await badCaptcha.json()).toEqual({ error: 'captcha_failed' })
    const landline = await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0522123456'), headers })
    expect(await landline.json()).toEqual({ error: 'invalid_phone' })
    const ok = await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0612340001'), headers })
    expect(ok.status()).toBe(201)
    expect(ok.headers()['cache-control']).toBe('no-store')
  })

  test('ticket tokens: valid works; tampered, forged and revoked tokens are a generic 404', async ({ request }) => {
    const { shop, barberRpc, sessionId } = await openShop()
    const join = await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0612340002'), headers: { apikey: anonKey, Origin: ORIGIN } })
    const { token } = await join.json()
    const get = (t: string) => request.get(fn('ticket-get'), { headers: { apikey: anonKey, Authorization: `Bearer ${t}` } })

    const view = await (await get(token)).json()
    expect(view.ticket_number).toBe(1)
    expect(JSON.stringify(view)).not.toContain('612340002') // no phone in the ticket view

    const [v, id, sig] = token.split('.')
    const flipped = `${v}.${id}.${sig.slice(0, -2)}${sig.at(-2) === 'A' ? 'B' : 'A'}${sig.at(-1)}`
    for (const bad of [flipped, `${v}.${'A'.repeat(22)}.${sig}`, 'garbage', '']) {
      const res = await get(bad)
      expect(res.status()).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
    }

    // Reissuing the link (barber action) revokes the old token.
    const { data: tickets } = await barberRpc.from('tickets').select('id').eq('queue_session_id', sessionId)
    await barberRpc.rpc('reissue_ticket_link', { p_session_id: sessionId, p_ticket_id: tickets![0].id })
    expect((await get(token)).status()).toBe(404)
  })

  test('joins are rate limited per IP, and a forged X-Forwarded-For does not bypass it', async ({ request }) => {
    const { shop } = await openShop()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      // Each attempt claims a different client IP; the function must ignore the forged entry.
      const res = await request.post(fn('join-queue'), {
        data: joinBody(shop.slug, `06123410${String(i).padStart(2, '0')}`),
        headers: { apikey: anonKey, Origin: ORIGIN, 'X-Forwarded-For': `203.0.113.${i}`, 'CF-Connecting-IP': `198.51.100.${i}` },
      })
      statuses.push(res.status())
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  test('customers can only confirm on the way or cancel', async ({ request }) => {
    const { shop } = await openShop()
    const { token } = await (await request.post(fn('join-queue'), { data: joinBody(shop.slug, '0612340003'), headers: { apikey: anonKey, Origin: ORIGIN } })).json()
    const act = (action: string) => request.post(fn('ticket-action'), { data: { action }, headers: { apikey: anonKey, Authorization: `Bearer ${token}` } })
    expect((await act('complete')).status()).toBe(400)
    expect((await act('on_the_way')).status()).toBe(409) // waiting customers cannot confirm yet
    expect((await act('cancel')).status()).toBe(200)
  })
})
