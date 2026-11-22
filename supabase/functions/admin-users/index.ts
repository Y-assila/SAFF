// POST /admin-users: SAFF team account management (decision D-17). Admins only, with two-factor.
//   create_account { shop_id, email, role }  → new login with a temporary password shown ONCE,
//                                              or an existing login added to the shop
//   reset_password { user_id }               → new temporary password shown once
//   set_disabled   { user_id, disabled }     → block or unblock the login
// The caller is authorized by the database (admin_assert, run with the caller's own JWT).
// Every change is written to the audit log. Temporary passwords are never stored or logged.
import { AuthApiError, authAdmin, bearer, rpcAsCaller } from '../_shared/authApi.ts'
import { DbError, rpc } from '../_shared/db.ts'
import { error, json, preflight, serve } from '../_shared/http.ts'
import { temporaryPassword } from '../_shared/password.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/
const DISABLED_FOR = '876000h' // ~100 years: "disabled until re-enabled"

const DB_ERRORS: Record<string, number> = { shop_not_found: 404, already_member: 409, invalid_input: 400, not_authorized: 403 }

type UserInfo = { user_id: string; email: string; is_platform_admin: boolean } | null

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  const jwt = bearer(req)
  if (!jwt) return error(req, 401, 'unauthenticated')

  let actor: string
  try {
    actor = await rpcAsCaller<string>(jwt, 'admin_assert')
  } catch (e) {
    if (e instanceof DbError && e.code === 'unauthenticated') return error(req, 401, 'unauthenticated')
    if (e instanceof DbError && e.code === 'not_authorized') return error(req, 403, 'not_authorized')
    throw e
  }

  const body = await req.json().catch(() => null)
  try {
    switch (body?.action) {
      case 'create_account': return await createAccount(req, actor, body)
      case 'reset_password': return await resetPassword(req, actor, body)
      case 'set_disabled': return await setDisabled(req, actor, body)
      default: return error(req, 400, 'invalid_request')
    }
  } catch (e) {
    if (e instanceof DbError && DB_ERRORS[e.code]) return error(req, DB_ERRORS[e.code], e.code)
    throw e
  }
})

async function createAccount(req: Request, actor: string, body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = body.role === 'owner' ? 'owner' : body.role === 'barber' ? 'barber' : null
  if (typeof body.shop_id !== 'string' || !UUID.test(body.shop_id) || !EMAIL.test(email) || email.length > 254 || !role) {
    return error(req, 400, 'invalid_request')
  }

  // An existing login (e.g. an owner of two shops) is only added to the shop: no password change.
  const existing = await rpc<{ user_id: string } | null>('admin_lookup_user', { p_email: email })
  if (existing?.user_id) {
    await rpc('admin_add_member', { p_actor: actor, p_shop_id: body.shop_id, p_user_id: existing.user_id, p_role: role, p_new_account: false })
    return json(req, 200, { result: 'added_existing', user_id: existing.user_id })
  }

  const password = temporaryPassword()
  let user: { id: string }
  try {
    user = await authAdmin<{ id: string }>('POST', 'users', {
      email, password, email_confirm: true, app_metadata: { must_change_password: true },
    })
  } catch (e) {
    if (e instanceof AuthApiError && (e.status === 422 || e.status === 409)) return error(req, 409, 'email_taken')
    throw e
  }
  try {
    await rpc('admin_add_member', { p_actor: actor, p_shop_id: body.shop_id, p_user_id: user.id, p_role: role, p_new_account: true })
  } catch (e) {
    await authAdmin('DELETE', `users/${user.id}`).catch(() => undefined) // no orphan login without a shop
    throw e
  }
  return json(req, 200, { result: 'created', user_id: user.id, temporary_password: password })
}

/** Targets must exist and must not be SAFF admins (admins are managed in the database only). */
async function target(req: Request, actor: string, userId: unknown): Promise<UserInfo | Response> {
  if (typeof userId !== 'string' || !UUID.test(userId)) return error(req, 400, 'invalid_request')
  const info = await rpc<UserInfo>('admin_user_info', { p_user_id: userId })
  if (!info) return error(req, 404, 'user_not_found')
  if (info.is_platform_admin || info.user_id === actor) return error(req, 403, 'forbidden_target')
  return info
}

async function resetPassword(req: Request, actor: string, body: Record<string, unknown>): Promise<Response> {
  const info = await target(req, actor, body.user_id)
  if (info instanceof Response) return info
  const password = temporaryPassword()
  await authAdmin('PUT', `users/${info!.user_id}`, { password, app_metadata: { must_change_password: true } })
  await rpc('admin_log_action', { p_actor: actor, p_action: 'password_reset', p_target: info!.user_id })
  return json(req, 200, { result: 'reset', temporary_password: password })
}

async function setDisabled(req: Request, actor: string, body: Record<string, unknown>): Promise<Response> {
  if (typeof body.disabled !== 'boolean') return error(req, 400, 'invalid_request')
  const info = await target(req, actor, body.user_id)
  if (info instanceof Response) return info
  await authAdmin('PUT', `users/${info!.user_id}`, { ban_duration: body.disabled ? DISABLED_FOR : 'none' })
  await rpc('admin_log_action', { p_actor: actor, p_action: body.disabled ? 'account_disabled' : 'account_enabled', p_target: info!.user_id })
  return json(req, 200, { result: body.disabled ? 'disabled' : 'enabled' })
}
