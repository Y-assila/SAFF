// Resolves the customer's ticket from `Authorization: Bearer <ticket token>` (TD §7).
// Every failure is the same 404, counted against the caller's IP.
import { select } from './db.ts'
import { requireEnv } from './env.ts'
import { clientIp, error } from './http.ts'
import { allow, LIMITS } from './ratelimit.ts'
import { parseTicketToken, verifyTicketToken } from './token.ts'

export type TicketAuth = { ok: true; ticketId: string; tokenVersion: number } | { ok: false; response: Response }

export async function authenticateTicket(req: Request): Promise<TicketAuth> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const parsed = parseTicketToken(token)
  if (parsed) {
    const rows = await select<{ token_version: number }>('tickets', `id=eq.${parsed.ticketId}&select=token_version`)
    const version = rows[0]?.token_version
    if (version !== undefined && await verifyTicketToken(requireEnv('TICKET_HMAC_SECRET_V1'), token, version)) {
      return { ok: true, ticketId: parsed.ticketId, tokenVersion: version }
    }
  }
  return { ok: false, response: await notFound(req) }
}

/** Generic 404; after too many failures from one IP the answer becomes 429. */
export async function notFound(req: Request): Promise<Response> {
  const { window, max } = LIMITS.ticketFailuresPerIp
  const allowed = await allow('ticket-fail-ip', clientIp(req), window, max)
  return allowed ? error(req, 404, 'not_found') : error(req, 429, 'rate_limited', { 'Retry-After': String(window) })
}
