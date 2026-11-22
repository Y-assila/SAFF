import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth } from '../../features/auth/authContext'
import { cn } from '../../lib/cn'
import { Logo } from '../brand/Logo'
import { Badge, Button } from '../ui'
import { LanguageSwitcher } from './LanguageSwitcher'

/** Shell for the SAFF team console (/admin). */
export function AdminShell() {
  const { t } = useTranslation()
  const { signOut, session } = useAuth()
  const navigate = useNavigate()
  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-control px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-surface text-soft' : 'text-muted hover:text-soft')

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-signal focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-midnight">
        {t('common.skipToContent')}
      </a>
      <header data-print-hide className="sticky top-0 z-40 border-b border-line bg-midnight/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/admin" aria-label={t('admin.home')} className="-m-1 shrink-0 rounded-control p-1">
            <Logo variant="symbol" alt="" className="h-7 w-auto" />
          </Link>
          <Badge tone="outline">{t('admin.badge')}</Badge>
          <span dir="ltr" className="hidden min-w-0 truncate text-sm text-muted md:inline">{session?.user.email}</span>
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden sm:block"><LanguageSwitcher /></div>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate('/admin/login', { replace: true }) }}>
              {t('auth.signOut')}
            </Button>
          </div>
        </div>
        <nav aria-label={t('admin.nav')} className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 sm:px-6">
          <NavLink end to="/admin" className={navClass}>{t('admin.overview.nav')}</NavLink>
          <NavLink to="/admin/shops" className={navClass}>{t('admin.shops.nav')}</NavLink>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none sm:px-6">
        <Outlet />
      </main>
      <div data-print-hide className="border-t border-line px-4 py-3 sm:hidden"><LanguageSwitcher className="w-fit" /></div>
    </div>
  )
}
