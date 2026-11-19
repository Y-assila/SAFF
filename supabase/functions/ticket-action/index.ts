// POST /ticket-action (RPC-SPEC §7.4): the only two things a customer can do — on_the_way, cancel.
import { DbError, rpc } from '../_shared/db.ts'
import { error, json, preflight, serve } from '../_shared/http.ts'
import { authenticateTicket, notFound } from '../_shared/ticketAuth.ts'

const ACTIONS = { on_the_way: 'customer_confirm_on_the_way', cancel: 'customer_cancel_ticket' } as const

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  const body = await req.json().catch(() => null)
  const action = body?.action as keyof typeof ACTIONS
  if (!Object.hasOwn(ACTIONS, action)) return error(req, 400, 'invalid_request')
  const auth = await authenticateTicket(req)
  if (!auth.ok) return auth.response
  try {
    const result = await rpc(ACTIONS[action], { p_ticket_id: auth.ticketId, p_token_version: auth.tokenVersion })
    return json(req, 200, result)
  } catch (e) {
    if (e instanceof DbError && e.code === 'not_found') return notFound(req)
    if (e instanceof DbError && e.code === 'invalid_transition') return error(req, 409, 'invalid_transition')
    throw e
  }
})
