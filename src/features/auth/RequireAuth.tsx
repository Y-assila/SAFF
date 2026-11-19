import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { LoadingState } from '../../components/ui'
import { useAuth } from './authContext'

/** Route guard for the barber area. UI convenience only: the database enforces access (RLS). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/barber/login" replace state={{ from: location.pathname }} />
  return children
}

