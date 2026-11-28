import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, ScrollRestoration } from 'react-router'
import { CustomerToneContext, type CustomerTone } from '../../features/customer/tone'
import { cn } from '../../lib/cn'
import { Logo } from '../brand/Logo'
import { LanguageSelect } from './LanguageSelect'

/**
 * Shell for the customer flow (/s/:slug, /t): no site menu or footer, just the mark and the
 * language. Nothing on these screens should pull a customer away from joining or their ticket.
 */
export function CustomerShell() {
  const { t } = useTranslation()
  const [tone, setTone] = useState<CustomerTone>('dark')
  const signal = tone === 'signal'
  return (
    <CustomerToneContext.Provider value={setTone}>
      <div className={cn('flex min-h-dvh flex-col transition-colors duration-500', signal ? 'bg-signal text-midnight' : 'bg-midnight text-soft')}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-signal focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-midnight">
          {t('common.skipToContent')}
        </a>
        <header className="mx-auto flex w-full max-w-lg items-center gap-3 px-5 pt-4">
          <Link to="/" aria-label={t('common.homeLink')} className="-m-1 rounded-control p-1">
            <Logo variant="symbol" alt="" className="h-6 w-auto" />
          </Link>
          <LanguageSelect className="ms-auto" tone={tone} />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-lg flex-1 flex-col focus:outline-none">
          <Outlet />
        </main>
        <ScrollRestoration />
      </div>
    </CustomerToneContext.Provider>
  )
}
