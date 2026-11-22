import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { createShopWithStaff, createUser, grantPlatformAdmin, localStack, PASSWORD } from './fixtures'
import { freshTotp } from './totp'

async function signInAt(page: Page, path: string, email: string, password: string) {
  await page.goto(path)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** A SAFF admin signed in through the API with a verified authenticator factor (aal2). */
async function adminApiSession() {
  const admin = await createUser('admin')
  grantPlatformAdmin(admin.id)
  const { url, anonKey } = localStack()
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await client.auth.signInWithPassword({ email: admin.email, password: PASSWORD })
  const aal1 = (await client.auth.getSession()).data.session!.access_token
  const { data: factor, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' })
  if (error) throw error
  const verify = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: await freshTotp(factor.totp.secret) })
  if (verify.error) throw verify.error
  const aal2 = (await client.auth.getSession()).data.session!.access_token
  return { admin, aal1, aal2 }
}

async function callFn(name: string, token: string | null, body: unknown) {
  const { url, anonKey } = localStack()
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('SAFF admin: two-factor setup, new shop, barber account; the barber must replace the temporary password', async ({ page }) => {
  const admin = await createUser('admin')
  grantPlatformAdmin(admin.id)

  await signInAt(page, '/admin/login', admin.email, PASSWORD)
  await expect(page.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeVisible()
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim()
  await page.getByLabel('Code').fill(await freshTotp(secret))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()

  // New shop: the link is derived from the name.
  await page.getByRole('link', { name: 'Shops' }).click()
  await page.getByRole('link', { name: 'New shop' }).click()
  const name = `E2E Admin ${Date.now().toString(36)}`
  await page.getByLabel('Shop name').fill(name)
  await expect(page.getByLabel('Shop link')).toHaveValue(name.toLowerCase().replace(/ /g, '-'))
  await page.getByRole('button', { name: 'Create shop' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  const shopId = page.url().split('/').pop()!

  // New barber account: the temporary password is shown once.
  const email = `new-barber-${Date.now().toString(36)}@e2e.test`
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog', { name: 'Temporary password' })
  await expect(dialog).toBeVisible()
  const temporary = (await dialog.getByTestId('temporary-password').textContent())!.trim()
  expect(temporary).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/)
  await dialog.getByRole('button', { name: 'Done' }).click()
  const row = page.getByTestId('member-row').filter({ hasText: email })
  await expect(row).toContainText('Temporary password')

  // The audit log records both actions.
  await page.getByRole('link', { name: 'Overview' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: email })).toContainText('Account created')
  await expect(page.getByRole('listitem').filter({ hasText: name }).filter({ hasText: 'Shop created' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)

  // The barber signs in with the temporary password and must choose a new one before anything else.
  await signInAt(page, '/barber/login', email, temporary)
  await expect(page).toHaveURL(/\/barber\/password$/)
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible()
  await page.goto(`/barber/${shopId}`)
  await expect(page).toHaveURL(/\/barber\/password$/) // no way around it
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill('my-own-password-42')
  await page.getByLabel('Confirm the new password').fill('my-own-password-42')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page).toHaveURL(new RegExp(`/barber/${shopId}$`))
  await expect(page.getByRole('heading', { name: 'The queue is closed' })).toBeVisible()
})

test('a shop owner cannot use the SAFF console', async ({ page }) => {
  const { owner } = await createShopWithStaff()
  await signInAt(page, '/admin/login', owner.email, PASSWORD)
  await expect(page.getByRole('heading', { name: 'SAFF team only' })).toBeVisible()
})

test('admin-users: requires a SAFF admin WITH two-factor; manages accounts and keeps an audit trail', async () => {
  const { shop, owner, barber } = await createShopWithStaff()
  const { url, anonKey } = localStack()
  const ownerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  await ownerClient.auth.signInWithPassword({ email: owner.email, password: PASSWORD })
  const ownerToken = (await ownerClient.auth.getSession()).data.session!.access_token
  const { admin, aal1, aal2 } = await adminApiSession()

  const create = { action: 'create_account', shop_id: shop.id, email: `api-${Date.now()}@e2e.test`, role: 'barber' }
  expect((await callFn('admin-users', null, create)).status).toBe(401)
  expect((await callFn('admin-users', ownerToken, create)).status).toBe(403) // owner, not SAFF
  expect((await callFn('admin-users', aal1, create)).status).toBe(403)       // admin without two-factor

  const created = await callFn('admin-users', aal2, create)
  expect(created.status).toBe(200)
  expect(created.body.result).toBe('created')
  expect(created.body.temporary_password).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/)
  expect((await callFn('admin-users', aal2, create)).body.error).toBe('already_member')

  // Disable: the barber can no longer sign in. Enable: they can again.
  expect((await callFn('admin-users', aal2, { action: 'set_disabled', user_id: barber.id, disabled: true })).status).toBe(200)
  const blocked = await ownerClient.auth.signInWithPassword({ email: barber.email, password: PASSWORD })
  expect(blocked.error).not.toBeNull()
  expect((await callFn('admin-users', aal2, { action: 'set_disabled', user_id: barber.id, disabled: false })).status).toBe(200)

  // Reset: the old password stops working, the new one is temporary.
  const reset = await callFn('admin-users', aal2, { action: 'reset_password', user_id: barber.id })
  expect(reset.status).toBe(200)
  expect((await ownerClient.auth.signInWithPassword({ email: barber.email, password: PASSWORD })).error).not.toBeNull()
  const relogin = await ownerClient.auth.signInWithPassword({ email: barber.email, password: reset.body.temporary_password })
  expect(relogin.data.user?.app_metadata.must_change_password).toBe(true)
  // While the flag is set, the database grants no shop access.
  expect((await ownerClient.from('shops').select('id')).data).toEqual([])

  // SAFF admins cannot be targeted, not even by themselves.
  expect((await callFn('admin-users', aal2, { action: 'reset_password', user_id: admin.id })).body.error).toBe('forbidden_target')

  // account-password: needs a session and a long enough password; then the flag is cleared.
  const temp = relogin.data.session!.access_token
  expect((await callFn('account-password', null, { password: 'whatever-12345' })).status).toBe(401)
  expect((await callFn('account-password', temp, { password: 'short' })).body.error).toBe('too_short')
  expect((await callFn('account-password', temp, { password: 'barber-new-pass-1' })).status).toBe(200)
  // Changing the password ends the old sessions; the app signs in again with the new password.
  expect((await ownerClient.auth.refreshSession()).error).not.toBeNull()
  const fresh = await ownerClient.auth.signInWithPassword({ email: barber.email, password: 'barber-new-pass-1' })
  expect(fresh.data.user?.app_metadata.must_change_password).toBe(false)
  expect((await ownerClient.from('shops').select('id')).data).toEqual([{ id: shop.id }])
})
