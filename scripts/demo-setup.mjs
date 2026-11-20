// LOCAL DEMO DATA for trying SAFF by hand. Refuses to run against anything but the local stack.
// Usage: npm run demo:setup   (after `npm run db:start`). Safe to re-run.
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

let out = ''
try {
  out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.error('Local Supabase is not running. Start Docker, then run `npm run db:start`.')
  process.exit(1)
}
const get = (k) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1]
const url = get('API_URL')
const serviceKey = get('SERVICE_ROLE_KEY')
if (!url || !serviceKey) throw new Error('Local Supabase is not running. Run `npm run db:start` first.')
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('Refusing: demo data is for the LOCAL stack only.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const SLUG = 'demo-salon'
const PASSWORD = 'demo-password-123' // local demo only
const accounts = [
  { email: 'owner@saff.local', role: 'owner' },
  { email: 'barber@saff.local', role: 'barber' },
]

// 1. Shop (slug is permanent; re-runs reuse it)
let { data: shop } = await admin.from('shops').select('id, slug').eq('slug', SLUG).maybeSingle()
if (!shop) {
  const res = await admin.from('shops').insert({ name: 'Salon Démo', slug: SLUG, address: 'Casablanca' }).select('id, slug').single()
  if (res.error) throw res.error
  shop = res.data
}

// 2. Accounts + memberships
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
for (const a of accounts) {
  let user = list.users.find((u) => u.email === a.email)
  if (!user) {
    const res = await admin.auth.admin.createUser({ email: a.email, password: PASSWORD, email_confirm: true })
    if (res.error) throw res.error
    user = res.data.user
  }
  await admin.from('shop_members').upsert({ shop_id: shop.id, user_id: user.id, role: a.role }, { onConflict: 'shop_id,user_id' })
}

// 3. Open today's queue (as the barber, through the real RPC) and add a few customers
const barber = createClient(url, get('ANON_KEY'), { auth: { persistSession: false } })
await barber.auth.signInWithPassword({ email: 'barber@saff.local', password: PASSWORD })
const start = await barber.rpc('start_queue', { p_shop_id: shop.id })
const opened = start.data?.result === 'started'
if (opened) {
  for (const [name, phone] of [['Amine', '+212600000001'], ['Badr', '+212600000002'], ['Chama', '+212600000003']]) {
    await admin.rpc('join_queue', { p_shop_slug: SLUG, p_name: name, p_phone_e164: phone, p_locale: 'fr',
      p_consent: true, p_consent_text_version: 'demo', p_client_request_id: randomUUID() })
  }
}

console.log(`
SAFF local demo ready${opened ? ' (queue opened with 3 waiting customers)' : ' (queue already open or closed today — left as is)'}

  App:            http://localhost:5173
  Customer page:  http://localhost:5173/s/${SLUG}      (the QR code page — join with any 06/07 mobile number)
  Barber sign in: http://localhost:5173/barber/login
      owner@saff.local  / ${PASSWORD}   (can edit settings)
      barber@saff.local / ${PASSWORD}
`)
