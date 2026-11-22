import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { AppProviders } from './AppProviders'
import { createRoutes } from './routes'

function renderAt(path: string, dev = false) {
  const router = createMemoryRouter(createRoutes({ dev }), { initialEntries: [path] })
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  )
}

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('routing', () => {
  it('renders the landing page with the logo and tagline headline', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your turn. On your time.')
    expect(within(screen.getByRole('main')).getByRole('img', { name: 'SAFF' })).toHaveAttribute('src', '/brand/saff-primary.svg')
    expect(screen.getByRole('link', { name: 'SAFF — home' })).toBeInTheDocument()
  })

  it('/t without a ticket on this device explains how to get one', async () => {
    renderAt('/t')
    expect(await screen.findByRole('heading', { name: 'No ticket on this device' })).toBeInTheDocument()
  })

  it('/barber redirects to sign in when there is no session', async () => {
    renderAt('/barber')
    // Unit tests have no backend configured, so the sign-in page explains that.
    expect(await screen.findByRole('heading', { name: 'Sign in is not available' })).toBeInTheDocument()
  })

  it('/barber/<shop>/settings is also protected', async () => {
    renderAt('/barber/00000000-0000-0000-0000-000000000000/settings')
    expect(await screen.findByRole('heading', { name: 'Sign in is not available' })).toBeInTheDocument()
  })

  it('/admin (SAFF team console) is also protected', async () => {
    renderAt('/admin/shops')
    expect(await screen.findByRole('heading', { name: 'Sign in is not available' })).toBeInTheDocument()
  })

  it('renders 404 for unknown paths', () => {
    renderAt('/does-not-exist')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('does not register the design-system gallery outside development', () => {
    renderAt('/dev/ui', false)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('language switching in the shell', () => {
  it('switches to Arabic: RTL document and Arabic content', async () => {
    renderAt('/')
    const [desktopSwitcher] = screen.getAllByRole('group', { name: 'Language' })
    await userEvent.click(within(desktopSwitcher).getByRole('button', { name: 'العربية' }))
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('دورك، في الوقت المناسب لك.')
    expect(within(desktopSwitcher).getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('language options declare their own lang and dir', () => {
    renderAt('/')
    const [switcher] = screen.getAllByRole('group', { name: 'Language' })
    const arabic = within(switcher).getByRole('button', { name: 'العربية' })
    expect(arabic).toHaveAttribute('lang', 'ar')
    expect(arabic).toHaveAttribute('dir', 'rtl')
  })
})

describe('mobile navigation', () => {
  it('toggles the menu with aria-expanded', async () => {
    renderAt('/')
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
  })
})
