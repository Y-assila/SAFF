import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

// Self-hosted fonts (no third-party font requests — keeps ticket pages free of external calls).
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import './styles/index.css'

import { AppProviders } from './app/AppProviders'
import { createRoutes } from './app/routes'
import { initI18n } from './i18n'

initI18n()

const router = createBrowserRouter(createRoutes())

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
