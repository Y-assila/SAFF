// POST /account-password { password }: the signed-in user replaces their password and, in the same
// step, clears app_metadata.must_change_password (set when the SAFF team gave a temporary one).
// Users cannot edit app_metadata themselves, so this runs server side. The app then refreshes
// the session so the new JWT no longer carries the flag.
import { AuthApiError, authAdmin, authUser, bearer } from '../_shared/authApi.ts'
import { error, json, preflight, serve } from '../_shared/http.ts'
import { passwordProblem } from '../_shared/password.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return error(req, 405, 'method_not_allowed')
  const jwt = bearer(req)
  const user = jwt ? await authUser(jwt) : null
  if (!user) return error(req, 401, 'unauthenticated')

  const body = await req.json().catch(() => null)
  const problem = passwordProblem(body?.password)
  if (problem) return error(req, 400, problem)
  try {
    await authAdmin('PUT', `users/${user.id}`, { password: body.password, app_metadata: { must_change_password: false } })
  } catch (e) {
    if (e instanceof AuthApiError && e.status === 422) return error(req, 400, 'weak_password')
    throw e
  }
  return json(req, 200, { result: 'changed' })
})
