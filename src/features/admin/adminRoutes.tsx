import { AdminShell } from '../../components/layout/AdminShell'
import { BarberLoginPage } from '../../pages/barber/BarberLoginPage'
import { AuthProvider } from '../auth/AuthProvider'
import { RequireAuth } from '../auth/RequireAuth'
import { RequireAdmin } from './RequireAdmin'

/** The SAFF team console lives in its own chunk: barbers and customers never load it. */
export function AdminLoginRoute() {
  return (
    <AuthProvider>
      <BarberLoginPage area="admin" />
    </AuthProvider>
  )
}

export function AdminAreaRoute() {
  return (
    <AuthProvider>
      <RequireAuth loginPath="/admin/login">
        <RequireAdmin>
          <AdminShell />
        </RequireAdmin>
      </RequireAuth>
    </AuthProvider>
  )
}
