import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { BarberShell } from '../components/layout/BarberShell'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoadingState } from '../components/ui'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { BarberHomePage } from '../pages/barber/BarberHomePage'
import { BarberLoginPage } from '../pages/barber/BarberLoginPage'
import { DashboardPage } from '../pages/barber/DashboardPage'
import { SettingsPage } from '../pages/barber/SettingsPage'

// Route config module, not a component module: fast-refresh boundaries do not apply here.
// The DEV guard is statically replaced by Vite, so production builds do not even emit the chunk.
// oxlint-disable-next-line react/only-export-components
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('../pages/DesignSystemPage')) : null

/**
 * Route map. Feature routes are honest placeholders until their milestone ships.
 *
 *   /               landing page
 *   /s/:slug        customer join page for a shop     — PROVISIONAL path, see plan D-02 (permanent QR URL)
 *   /t              customer ticket page (token in the URL fragment, per technical design §7)
 *   /barber/login              barber sign in (Supabase Auth)
 *   /barber                    shop resolution (one shop → its dashboard; several → choose)
 *   /barber/:shopId            queue dashboard
 *   /barber/:shopId/settings   shop settings (owner can edit; barbers read-only)
 *   /dev/ui         component gallery — development builds only
 */
export function createRoutes({ dev = import.meta.env.DEV }: { dev?: boolean } = {}): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <LandingPage /> },
    { path: 's/:slug', element: <PlaceholderPage kind="shop" /> },
    { path: 't', element: <PlaceholderPage kind="ticket" /> },
    { path: 'barber/login', element: <BarberLoginPage /> },
    { path: '*', element: <NotFoundPage /> },
  ]

  if (dev && DesignSystemPage) {
    children.push({
      path: 'dev/ui',
      element: (
        <Suspense fallback={<LoadingState />}>
          <DesignSystemPage />
        </Suspense>
      ),
    })
  }

  return [
    { path: '/', element: <AppShell />, errorElement: <RouteErrorPage />, children },
    {
      path: '/barber',
      element: (
        <RequireAuth>
          <BarberShell />
        </RequireAuth>
      ),
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <BarberHomePage /> },
        { path: ':shopId', element: <DashboardPage /> },
        { path: ':shopId/settings', element: <SettingsPage /> },
      ],
    },
  ]
}
