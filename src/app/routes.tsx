import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { CustomerShell } from '../components/layout/CustomerShell'
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
const ShopQrPage = lazy(() => import('../pages/barber/ShopQrPage').then((m) => ({ default: m.ShopQrPage })))
const SettingsPage = lazy(() => import('../pages/barber/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ChangePasswordPage = lazy(() => import('../pages/barber/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })))
const AdminLoginRoute = lazy(() => import('../features/admin/adminRoutes').then((m) => ({ default: m.AdminLoginRoute })))
const AdminAreaRoute = lazy(() => import('../features/admin/adminRoutes').then((m) => ({ default: m.AdminAreaRoute })))
const AdminOverviewPage = lazy(() => import('../pages/admin/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })))
const AdminShopsPage = lazy(() => import('../pages/admin/AdminShopsPage').then((m) => ({ default: m.AdminShopsPage })))
const AdminNewShopPage = lazy(() => import('../pages/admin/AdminNewShopPage').then((m) => ({ default: m.AdminNewShopPage })))
const AdminShopPage = lazy(() => import('../pages/admin/AdminShopPage').then((m) => ({ default: m.AdminShopPage })))
const AdminShopQrPage = lazy(() => import('../pages/admin/AdminShopQrPage').then((m) => ({ default: m.AdminShopQrPage })))
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
 *   /barber/:shopId/qr         printable shop QR poster (watermarked until the production domain is set)
 *   /barber/:shopId/settings   shop settings (owner can edit; barbers read-only)
 *   /barber/password           choose a new password (required after a temporary one)
 *   /admin/login               SAFF team sign in
 *   /admin                     SAFF team console (admins + two-factor only): overview
 *   /admin/shops[/new|/:id[/qr]]  shops, team accounts, QR posters
 *   /dev/ui                    component gallery — development builds only
 */
export function createRoutes({ dev = import.meta.env.DEV }: { dev?: boolean } = {}): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <LandingPage /> },
    { path: 'barber/login', element: load(<BarberLoginRoute />) },
    { path: 'admin/login', element: load(<AdminLoginRoute />) },
    { path: '*', element: <NotFoundPage /> },
  ]

  if (dev && DesignSystemPage) {
    children.push({ path: 'dev/ui', element: load(<DesignSystemPage />) })
  }

  return [
    { path: '/', element: <AppShell />, errorElement: <RouteErrorPage />, children },
    {
      element: <CustomerShell />,
      errorElement: <RouteErrorPage />,
      children: [
        { path: '/s/:slug', element: load(<ShopPage />) },
        { path: '/t', element: load(<TicketPage />) },
      ],
    },
    {
      path: '/barber',
      element: load(<BarberAreaRoute />),
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: load(<BarberHomePage />) },
        { path: 'password', element: load(<ChangePasswordPage />) },
        { path: ':shopId', element: load(<DashboardPage />) },
        { path: ':shopId/qr', element: load(<ShopQrPage />) },
        { path: ':shopId/settings', element: load(<SettingsPage />) },
      ],
    },
    {
      path: '/admin',
      element: load(<AdminAreaRoute />),
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: load(<AdminOverviewPage />) },
        { path: 'shops', element: load(<AdminShopsPage />) },
        { path: 'shops/new', element: load(<AdminNewShopPage />) },
        { path: 'shops/:shopId', element: load(<AdminShopPage />) },
        { path: 'shops/:shopId/qr', element: load(<AdminShopQrPage />) },
      ],
    },
  ]
}
