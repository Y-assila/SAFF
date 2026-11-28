import { expect, test, type Page } from '@playwright/test'
import { joinQueue as adminJoin, openShop, resetRateLimits } from './fixtures'
import { stubTurnstileWidget } from './turnstile'

test.beforeEach(async ({ page }) => {
  await resetRateLimits() // test isolation: every test's joins come from the same local IP
  await stubTurnstileWidget(page)
})

async function joinFromQrPage(page: Page, slug: string, name: string, phone: string) {
  await page.goto(`/s/${slug}`)
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel(/Mobile number/).fill(phone)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Join the queue' }).click()
}

test('a customer joins from the QR page and gets a private ticket', async ({ page }) => {
  const { shop } = await openShop()
  await adminJoin(shop.slug, 'Earlier', '+212600000401')
  await joinFromQrPage(page, shop.slug, 'Amine', '0612345601')

  await expect(page).toHaveURL(/\/t$/) // the token is never in the address bar
  await expect(page.getByText('002')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Your ticket/ })).toBeVisible()
  await expect(page.getByText('person ahead of you')).toBeVisible()
  await expect(page.getByText(/Estimated wait: about \d+ min/)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('0612345601')
  const stored = await page.evaluate(() => localStorage.getItem('saff.ticket'))
  expect(stored).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/)
  // TD §7: no third-party scripts on the ticket page.
  const thirdParty = await page.evaluate(() =>
    Array.from(document.scripts).map((s) => s.src).filter((src) => src && !src.startsWith(location.origin)))
  expect(thirdParty).toEqual([])
})

test('the ticket updates live when the barber calls, and the customer confirms', async ({ page }) => {
  const { shop, barberRpc, sessionId } = await openShop()
  await joinFromQrPage(page, shop.slug, 'Badr', '0612345602')
  await expect(page.getByText('You are next')).toBeVisible()

  const { error } = await barberRpc.rpc('call_next_customer', { p_session_id: sessionId })
  expect(error).toBeNull()
  await expect(page.getByRole('heading', { name: 'It’s your turn' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByText('min left to arrive')).toBeVisible()

  await page.getByRole('button', { name: 'I’m on my way' }).click()
  await expect(page.getByText('The barber knows you are coming')).toBeVisible()
})

test('a customer can cancel their ticket (with confirmation)', async ({ page }) => {
  const { shop } = await openShop()
  await joinFromQrPage(page, shop.slug, 'Chama', '0612345603')
  await page.getByRole('button', { name: 'Leave the queue' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, leave' }).click()
  await expect(page.getByText('You cancelled your ticket.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leave the queue' })).toHaveCount(0)
})

test('joining twice with the same phone does not create a second ticket', async ({ page, browser }) => {
  const { shop } = await openShop()
  await joinFromQrPage(page, shop.slug, 'Driss', '0612345604')
  await expect(page).toHaveURL(/\/t$/)

  const other = await browser.newPage()
  await stubTurnstileWidget(other)
  await joinFromQrPage(other, shop.slug, 'Someone else', '+212612345604')
  await expect(other.getByText('You already have a ticket at this shop')).toBeVisible()
  await expect(other.getByText('We sent your ticket link to your WhatsApp again.')).toBeVisible()
  await expect(other.locator('body')).not.toContainText('Driss') // no name leaks to the second device
  await other.close()
})

test('validation: mobile numbers only, consent required', async ({ page }) => {
  const { shop } = await openShop()
  await page.goto(`/s/${shop.slug}`)
  await page.getByLabel('Your name').fill('Ehsan')
  await page.getByLabel(/Mobile number/).fill('0522123456') // Moroccan landline
  await page.getByRole('button', { name: 'Join the queue' }).click()
  await expect(page.getByText('Please agree to continue.')).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Join the queue' }).click()
  await expect(page.getByText('Enter a valid mobile number.')).toBeVisible() // refused by the server (mobile only)
  await expect(page).toHaveURL(new RegExp(`/s/${shop.slug}$`))
})

test('closed and unknown shops', async ({ page }) => {
  await page.goto('/s/no-such-shop-anywhere')
  await expect(page.getByRole('heading', { name: 'Shop not found' })).toBeVisible()
  const { shop, barberRpc, sessionId } = await openShop()
  await barberRpc.rpc('close_queue', { p_session_id: sessionId })
  await page.goto(`/s/${shop.slug}`)
  await expect(page.getByRole('heading', { name: 'This queue is closed right now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Join the queue' })).toHaveCount(0)
})

test('the ticket page opens in the language the customer joined with (D-06)', async ({ page }) => {
  const { shop } = await openShop()
  await page.goto(`/s/${shop.slug}`)
  await page.getByLabel('Language').selectOption('ar') // customer screens: one compact picker, no menu
  await page.getByLabel('اسمك').fill('دعاء')
  await page.getByLabel(/رقم الهاتف المحمول/).fill('0612345605')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'الانضمام إلى الطابور' }).click()
  await expect(page.getByText('أشخاص قبلك').or(page.getByText('شخص قبلك')).or(page.getByText('أنت التالي'))).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
})
