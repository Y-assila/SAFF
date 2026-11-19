// HTTP helpers: CORS allow-list, safe JSON responses, client IP.
import { ConfigError } from './env.ts'

const BASE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

function allowedOrigins(): string[] {
  return (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean)
}

/** True when the request comes from one of the app's own origins. */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin')
  return origin !== null && allowedOrigins().includes(origin)
}

function corsHeaders(req: Request): Record<string, string> {
  if (!originAllowed(req)) return {}
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin')!,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...corsHeaders(req), ...extra } })
}

export function error(req: Request, status: number, code: string, extra: Record<string, string> = {}): Response {
  return json(req, status, { error: code }, extra)
}

export function preflight(req: Request): Response {
  return new Response(null, { status: originAllowed(req) ? 204 : 403, headers: { ...corsHeaders(req) } })
}

/**
 * Client IP for rate limiting (hashed before storage). Client-sent headers can be forged, so:
 *  - X-Forwarded-For is read from the RIGHT: proxies append, so the entry added by the nearest
 *    trusted proxy is authoritative. TRUSTED_PROXY_HOPS (default 1) = how many trusted proxies
 *    sit in front of the function.
 *  - CF-Connecting-IP is ignored unless TRUST_CF_CONNECTING_IP=true (only when Cloudflare is
 *    verified to be the edge in front of the platform, which overwrites the header).
 * Verify the platform's proxy chain on staging (docs/IMPLEMENTATION-PLAN.md).
 */
export function clientIp(req: Request): string {
  if (Deno.env.get('TRUST_CF_CONNECTING_IP') === 'true') {
    const cf = req.headers.get('cf-connecting-ip')?.trim()
    if (cf) return cf
  }
  const chain = (req.headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const hops = Math.max(1, Number.parseInt(Deno.env.get('TRUSTED_PROXY_HOPS') ?? '1', 10) || 1)
  return chain.length >= hops ? chain[chain.length - hops] : 'unknown'
}

/** Wraps a handler: unexpected errors become a generic 500 without leaking details. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    try {
      return await handler(req)
    } catch (e) {
      // Log the class of failure only: never tokens, phone numbers or names.
      console.error(e instanceof ConfigError ? `config: ${e.message}` : `internal: ${(e as Error)?.name ?? 'Error'}`)
      return error(req, 500, 'internal')
    }
  })
}
