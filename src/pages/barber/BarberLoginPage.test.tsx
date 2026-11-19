import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../features/auth/authContext'
import { BarberLoginPage } from './BarberLoginPage'

function renderLogin(auth: Partial<AuthState>) {
  const value: AuthState = { configured: true, loading: false, session: null, signIn: vi.fn(), signOut: vi.fn(), ...auth }
  const router = createMemoryRouter(
    [{ path: '/barber/login', element: <BarberLoginPage /> }, { path: '/barber', element: <p>dashboard</p> }],
    { initialEntries: ['/barber/login'] })
  render(<AuthContext.Provider value={value}><RouterProvider router={router} /></AuthContext.Provider>)
  return value
}

describe('BarberLoginPage', () => {
  it('shows one generic message for bad credentials', async () => {
    const auth = renderLogin({ signIn: vi.fn().mockResolvedValue({ ok: false, reason: 'invalid_credentials' }) })
    await userEvent.type(screen.getByLabelText(/Email/), 'barber@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signIn).toHaveBeenCalledWith('barber@example.com', 'wrong-password')
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })

  it('goes to the barber area after signing in', async () => {
    renderLogin({ signIn: vi.fn().mockResolvedValue({ ok: true }) })
    await userEvent.type(screen.getByLabelText(/Email/), 'barber@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'correct-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })

  it('keeps the submit button disabled until both fields are filled', () => {
    renderLogin({})
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})
