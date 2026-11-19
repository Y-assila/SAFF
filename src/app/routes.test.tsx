import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { createRoutes } from './routes'

function renderAt(path: string, dev = false) {
  const router = createMemoryRouter(createRoutes({ dev }), { initialEntries: [path] })
  return render(<RouterProvider router={router} />)
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

  it.each([
    ['/s/some-shop', 'Join the queue'],
    ['/t', 'Your ticket'],
    ['/barber/login', 'Barber sign in'],
    ['/barber', 'Queue dashboard'],
  ])('%s shows an honest "coming soon" placeholder', (path, title) => {
    renderAt(path)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
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
