import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { LoadingState } from '../components/ui'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'

// Route config module, not a component module: fast-refresh boundaries do not apply here.
/* oxlint-disable react/only-export-components */
const ShopPage = lazy(() => import('../pages/customer/ShopPage').then((m) => ({ default: m.ShopPage })))
const TicketPage = lazy(() => import('../pages/customer/TicketPage').then((m) => ({ default: m.TicketPage })))
const BarberLoginRoute = lazy(() => import('../features/auth/barberRoutes').then((m) => ({ default: m.BarberLoginRoute })))
const BarberAreaRoute = lazy(() => import('../features/auth/barberRoutes').then((m) => ({ default: m.BarberAreaRoute })))
const BarberHomePage = lazy(() => import('../pages/barber/BarberHomePage').then((m) => ({ default: m.BarberHomePage })))
const DashboardPage = lazy(() => import('../pages/barber/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const SettingsPage = lazy(() => import('../pages/barber/SettingsPage').then((m) => ({ default: m.SettingsPage })))
// The DEV guard is statically replaced by Vite, so production builds do not even emit the chunk.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('../pages/DesignSystemPage')) : null
/* oxlint-enable react/only-export-components */

const load = (element: ReactNode) => <Suspense fallback={<LoadingState />}>{element}</Suspense>

/**
 * Route map. Each feature area is a separate chunk.
 *
 *   /                          landing page
 *   /s/:slug                   customer join page; PERMANENT QR address (decision D-02; slugs are immutable)
 *   /t                         customer ticket page (token in the URL fragment or this device; TD §7)
 *   /barber/login              barber sign in (Supabase Auth)
 *   /barber                    shop resolution (one shop → its dashboard; several → choose)
 *   /barber/:shopId            queue dashboard
 *   /barber/:shopId/settings   shop settings (owner can edit; barbers read-only)
 *   /dev/ui                    component gallery — development builds only
 */
export function createRoutes({ dev = import.meta.env.DEV }: { dev?: boolean } = {}): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <LandingPage /> },
    { path: 's/:slug', element: load(<ShopPage />) },
    { path: 't', element: load(<TicketPage />) },
    { path: 'barber/login', element: load(<BarberLoginRoute />) },
    { path: '*', element: <NotFoundPage /> },
  ]

  if (dev && DesignSystemPage) {
    children.push({ path: 'dev/ui', element: load(<DesignSystemPage />) })
  }

  return [
    { path: '/', element: <AppShell />, errorElement: <RouteErrorPage />, children },
    {
      path: '/barber',
      element: load(<BarberAreaRoute />),
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: load(<BarberHomePage />) },
        { path: ':shopId', element: load(<DashboardPage />) },
        { path: ':shopId/settings', element: load(<SettingsPage />) },
      ],
    },
  ]
}
