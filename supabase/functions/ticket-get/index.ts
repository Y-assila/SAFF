// GET /ticket-get (RPC-SPEC §7.3): the customer's own ticket view, authorised by the ticket token.
import { DbError, rpc } from '../_shared/db.ts'
import { error, json, preflight, serve } from '../_shared/http.ts'
import { authenticateTicket, notFound } from '../_shared/ticketAuth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'GET') return error(req, 405, 'method_not_allowed')
  const auth = await authenticateTicket(req)
  if (!auth.ok) return auth.response
  try {
    const view = await rpc('customer_get_ticket', { p_ticket_id: auth.ticketId, p_token_version: auth.tokenVersion })
    return json(req, 200, view)
  } catch (e) {
    if (e instanceof DbError && e.code === 'not_found') return notFound(req)
    throw e
  }
})
