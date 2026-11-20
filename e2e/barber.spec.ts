import { expect, test, type Page } from '@playwright/test'
import { createShopWithStaff, joinQueue, PASSWORD } from './fixtures'

async function submitSignIn(page: Page, email: string, password: string) {
  await page.goto('/barber/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Signs in and waits until the app has left the sign-in page (session stored). */
async function signIn(page: Page, email: string) {
  await submitSignIn(page, email, PASSWORD)
  await expect(page).not.toHaveURL(/\/barber\/login/)
}

async function openQueue(page: Page) {
  await page.getByRole('button', { name: 'Open today’s queue' }).click()
  await expect(page.getByRole('heading', { name: 'Today’s queue' })).toBeVisible()
}

test('wrong credentials show one generic error', async ({ page }) => {
  const { owner } = await createShopWithStaff()
  await submitSignIn(page, owner.email, 'not-the-password')
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.')
})

test('unauthenticated visitors are sent to sign in', async ({ page }) => {
  await page.goto('/barber')
  await expect(page).toHaveURL(/\/barber\/login$/)
})

test('a full service cycle, with live updates and no reloads', async ({ page }) => {
  const { shop, barber } = await createShopWithStaff()
  await signIn(page, barber.email)

  // One shop → straight to its dashboard; no queue yet.
  await expect(page.getByRole('heading', { name: 'The queue is closed' })).toBeVisible()
  await openQueue(page)

  // Customers join from outside the app; the Realtime ping refreshes the list (well before the 20 s poll).
  await joinQueue(shop.slug, 'Amine', '+212600000101')
  await joinQueue(shop.slug, 'Badr', '+212600000102')
  const waiting = page.getByRole('region', { name: 'Waiting' })
  await expect(waiting.getByRole('listitem')).toHaveCount(2, { timeout: 5_000 })
  await expect(waiting).toContainText('Amine')
  await expect(page.locator('body')).not.toContainText('+212600000101') // phones never on screen

  // CALL NEXT → called slot; then arrived → start → complete.
  await page.getByRole('button', { name: /Call next/ }).click()
  const called = page.getByRole('region', { name: 'Called' })
  await expect(called).toContainText('001')
  await expect(page.getByRole('button', { name: /Call next/ })).toBeDisabled()
  await called.getByRole('button', { name: 'Mark arrived' }).click()
  await called.getByRole('button', { name: 'Start service' }).click()
  const inService = page.getByRole('region', { name: 'In service' })
  await expect(inService).toContainText('Amine')

  // Next customer called while the first is in service.
  await page.getByRole('button', { name: /Call next/ }).click()
  await expect(called).toContainText('002')
  await inService.getByRole('button', { name: 'Complete service' }).click()
  await expect(inService).toContainText('No one in service')

  // Phone reveal is explicit and audited.
  await called.getByRole('button', { name: 'More actions for ticket 002' }).click()
  await page.getByRole('button', { name: 'Show phone' }).click()
  await page.getByRole('button', { name: 'Show number' }).click()
  await expect(page.getByRole('link', { name: '+212600000102' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  // Closing needs confirmation; then today's closed state offers reopen.
  await page.getByRole('button', { name: 'Close queue' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close queue' }).click()
  await expect(page.getByRole('heading', { name: 'Today’s queue is closed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reopen queue' })).toBeVisible()
})

test('database refusals are shown as translated messages', async ({ page }) => {
  const { shop, barber } = await createShopWithStaff()
  await signIn(page, barber.email)
  await openQueue(page)
  await joinQueue(shop.slug, 'Chama', '+212600000201')
  await page.getByRole('button', { name: /Call next/ }).click()
  const called = page.getByRole('region', { name: 'Called' })
  await expect(called).toContainText('001')
  // Skipping before the grace period with a non-override reason is refused by the database.
  await called.getByRole('button', { name: 'Skip' }).click()
  await page.getByLabel('Unreachable').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('alert')).toContainText('The grace period is not over yet')
  await expect(called).toContainText('001') // nothing changed
})

test('settings: owners edit, barbers read only', async ({ page }) => {
  const { shop, owner, barber } = await createShopWithStaff()

  await signIn(page, barber.email)
  await page.goto(`/barber/${shop.id}/settings`)
  await expect(page.getByText('Only the shop owner can change these settings.')).toBeVisible()
  await expect(page.getByLabel('Grace period (minutes)')).toBeDisabled()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/barber\/login$/)

  await signIn(page, owner.email)
  await page.goto(`/barber/${shop.id}/settings`)
  const grace = page.getByLabel('Grace period (minutes)')
  await grace.fill('99')
  await expect(page.getByText('Enter a whole number between 1 and 60.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  await grace.fill('15')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.reload()
  await expect(page.getByLabel('Grace period (minutes)')).toHaveValue('15')
})

test('the dashboard works in Arabic (RTL)', async ({ page }) => {
  const { barber } = await createShopWithStaff()
  await signIn(page, barber.email)
  await openQueue(page)
  await page.getByRole('group', { name: 'Language' }).first().getByRole('button', { name: 'العربية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'طابور اليوم' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'نادِ التالي' })).toBeVisible()
})

test('the shop QR poster encodes /s/<slug> and cannot be printed before the domain is set (D-04)', async ({ page }) => {
  const { shop, owner } = await createShopWithStaff()
  await signIn(page, owner.email)
  await page.goto(`/barber/${shop.id}/qr`)
  await expect(page.getByRole('alert')).toContainText('Not ready for printing')
  await expect(page.getByRole('button', { name: 'Print poster' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download QR (SVG)' })).toBeDisabled()
  await expect(page.getByRole('img', { name: new RegExp(`/s/${shop.slug}$`) })).toBeVisible()
  await expect(page.getByText('NOT FOR PRINTING')).toBeVisible()
  // The call to action appears in all three languages on the poster.
  for (const text of ['Scan to join the queue', 'Scannez pour rejoindre la file', 'امسح للانضمام إلى الطابور']) {
    await expect(page.getByText(text)).toBeVisible()
  }
})
