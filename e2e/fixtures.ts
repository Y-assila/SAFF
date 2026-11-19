import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Database } from '../src/lib/database.types'

/** Local stack only: read URL and service key from `supabase status` (never hard-coded). */
function localStack() {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1]
  const url = get('API_URL')
  const serviceKey = get('SERVICE_ROLE_KEY')
  if (!url || !serviceKey) throw new Error('Local Supabase is not running (npm run db:start).')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('E2E fixtures refuse to run against a non-local stack.')
  return { url, serviceKey }
}

let admin: SupabaseClient<Database> | null = null
export function adminClient() {
  if (!admin) {
    const { url, serviceKey } = localStack()
    admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

export const PASSWORD = 'E2e-Password-123!'

export async function createUser(label: string) {
  const email = `${label}-${randomUUID().slice(0, 8)}@e2e.test`
  const { data, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw error
  return { id: data.user.id, email }
}

/** A fresh shop with an owner and a barber (service role = platform admin, as in production onboarding). */
export async function createShopWithStaff() {
  const slug = `e2e-${randomUUID().slice(0, 8)}`
  const { data: shop, error } = await adminClient().from('shops').insert({ name: `E2E Salon ${slug.slice(4)}`, slug }).select('id, slug, name').single()
  if (error) throw error
  const owner = await createUser('owner')
  const barber = await createUser('barber')
  const { error: memberError } = await adminClient().from('shop_members').insert([
    { shop_id: shop.id, user_id: owner.id, role: 'owner' },
    { shop_id: shop.id, user_id: barber.id, role: 'barber' },
  ])
  if (memberError) throw memberError
  return { shop, owner, barber }
}

/** What the join-queue Edge Function will do in Milestone 4: call join_queue as the service role. */
export async function joinQueue(slug: string, name: string, phone: string) {
  const { data, error } = await adminClient().rpc('join_queue', {
    p_shop_slug: slug, p_name: name, p_phone_e164: phone, p_locale: 'fr',
    p_consent: true, p_consent_text_version: 'e2e', p_client_request_id: randomUUID(),
  })
  if (error) throw error
  return data as { result: string; ticket_number: number }
}
