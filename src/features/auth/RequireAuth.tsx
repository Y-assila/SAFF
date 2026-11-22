import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { LoadingState } from '../../components/ui'
import { useAuth } from './authContext'

export const CHANGE_PASSWORD_PATH = '/barber/password'

/** Route guard for signed-in areas. UI convenience only: the database enforces access (RLS). */
export function RequireAuth({ children, loginPath = '/barber/login' }: { children: ReactNode; loginPath?: string }) {
  const { loading, session, mustChangePassword } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!session) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  // A temporary password must be replaced first (the database also denies shop access until then).
  if (mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  return children
}
