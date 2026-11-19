import { BarberShell } from '../../components/layout/BarberShell'
import { BarberLoginPage } from '../../pages/barber/BarberLoginPage'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'

/** Barber auth lives only in the barber chunk: public and customer pages never load it. */
export function BarberLoginRoute() {
  return (
    <AuthProvider>
      <BarberLoginPage />
    </AuthProvider>
  )
}

export function BarberAreaRoute() {
  return (
    <AuthProvider>
      <RequireAuth>
        <BarberShell />
      </RequireAuth>
    </AuthProvider>
  )
}
