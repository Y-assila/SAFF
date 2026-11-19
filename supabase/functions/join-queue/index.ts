// POST /join-queue (RPC-SPEC §7.2). Public endpoint: validation → rate limits → Turnstile →
// phone normalisation → join_queue (service role) → signed ticket token.
import { DbError, rpc, select } from '../_shared/db.ts'
import { requireEnv } from '../_shared/env.ts'
import { clientIp, error, json, originAllowed, preflight, serve } from '../_shared/http.ts'
import { normaliseMobile } from '../_shared/phone.ts'
import { allow, LIMITS } from '../_shared/ratelimit.ts'
import { signTicketToken } from '../_shared/token.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Intentional: names must not contain control characters.
// oxlint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/

interface JoinBody {
  shop_slug: string; name: string; phone: string; locale: 'ar' | 'fr' | 'en'
  consent: true; consent_text_version: string; client_request_id: string; turnstile_token: string
}

function validate(raw: unknown): JoinBody | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const ok =
    typeof b.shop_slug === 'string' && b.shop_slug.length >= 3 && b.shop_slug.length <= 60 && SLUG_RE.test(b.shop_slug) &&
    name.length >= 1 && name.length <= 60 && !CONTROL_RE.test(name) &&
    typeof b.phone === 'string' && b.phone.length <= 32 &&
    (b.locale === 'ar' || b.locale === 'fr' || b.locale === 'en') &&
    b.consent === true &&
    typeof b.consent_text_version === 'string' && b.consent_text_version.length >= 1 && b.consent_text_version.length <= 40 &&
    typeof b.client_request_id === 'string' && UUID_RE.test(b.client_request_id) &&
    typeof b.turnstile_token === 'string' && b.turnstile_token.length >= 1 && b.turnstile_token.length <= 2048
  return ok ? { ...(b as unknown as JoinBody), name } : null
}

const DB_ERRORS: Record<string, number> = {
  consent_required: 400, invalid_name: 400, invalid_phone: 400, invalid_request: 400,
  shop_not_found: 404, queue_closed: 409, queue_paused: 409, queue_full: 409,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  if (!originAllowed(req)) return error(req, 403, 'forbidden_origin')
  if (Number(req.headers.get('Content-Length') ?? 0) > 4096) return error(req, 413, 'payload_too_large')

  const body = validate(await req.json().catch(() => null))
  if (!body) return error(req, 400, 'invalid_request')

  const ip = clientIp(req)
  const tooMany = (window: number) => error(req, 429, 'rate_limited', { 'Retry-After': String(window) })
  if (!await allow('join-ip', ip, LIMITS.joinPerIp.window, LIMITS.joinPerIp.max)) return tooMany(LIMITS.joinPerIp.window)

  if (!await verifyTurnstile(body.turnstile_token, ip)) return error(req, 403, 'captcha_failed')

  const phone = normaliseMobile(body.phone)
  if (!phone) return error(req, 400, 'invalid_phone')
  if (!await allow('join-phone', phone, LIMITS.joinPerPhone.window, LIMITS.joinPerPhone.max)) return tooMany(LIMITS.joinPerPhone.window)
  if (!await allow('join-shop', body.shop_slug, LIMITS.joinPerShop.window, LIMITS.joinPerShop.max)) return tooMany(LIMITS.joinPerShop.window)

  let result: { result: 'created' | 'existing'; ticket_id?: string; ticket_number?: number; token_version?: number }
  try {
    result = await rpc('join_queue', {
      p_shop_slug: body.shop_slug, p_name: body.name, p_phone_e164: phone, p_locale: body.locale,
      p_consent: true, p_consent_text_version: body.consent_text_version, p_client_request_id: body.client_request_id,
    })
  } catch (e) {
    if (e instanceof DbError && DB_ERRORS[e.code]) return error(req, DB_ERRORS[e.code], e.code)
    throw e
  }

  if (result.result === 'existing') {
    // No token, number or name (TD §7). Say whether the link was re-sent by WhatsApp.
    const rows = await select<{ shop_settings: { whatsapp_enabled: boolean } | null }>(
      'shops', `slug=eq.${body.shop_slug}&select=shop_settings(whatsapp_enabled)`)
    return json(req, 200, { result: 'existing', whatsapp: rows[0]?.shop_settings?.whatsapp_enabled ?? false })
  }

  const token = await signTicketToken(requireEnv('TICKET_HMAC_SECRET_V1'), result.ticket_id!, result.token_version!)
  return json(req, 201, { result: 'created', ticket_number: result.ticket_number, token })
})
