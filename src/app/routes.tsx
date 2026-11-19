import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import { LoadingState } from '../components/ui'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { RouteErrorPage } from '../pages/RouteErrorPage'

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
 *   /barber/login   barber sign in (Supabase Auth)
 *   /barber         barber queue dashboard
 *   /dev/ui         component gallery — development builds only
 */
export function createRoutes({ dev = import.meta.env.DEV }: { dev?: boolean } = {}): RouteObject[] {
  const children: RouteObject[] = [
    { index: true, element: <LandingPage /> },
    { path: 's/:slug', element: <PlaceholderPage kind="shop" /> },
    { path: 't', element: <PlaceholderPage kind="ticket" /> },
    { path: 'barber/login', element: <PlaceholderPage kind="barberSignIn" /> },
    { path: 'barber', element: <PlaceholderPage kind="dashboard" /> },
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

  return [{ path: '/', element: <AppShell />, errorElement: <RouteErrorPage />, children }]
}
