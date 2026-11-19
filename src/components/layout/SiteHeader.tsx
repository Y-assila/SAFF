import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'
import { Logo } from '../brand/Logo'
import { buttonClasses } from '../ui'
import { CloseIcon, MenuIcon } from '../ui/icons'
import { LanguageSwitcher } from './LanguageSwitcher'
import { barberEntry, primaryNav } from './navigation'

export function SiteHeader() {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()

  const closeMenu = () => setMenuOpen(false)

  const linkClass = 'rounded-control px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-soft'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-midnight/90 backdrop-blur supports-[backdrop-filter]:bg-midnight/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" onClick={closeMenu} aria-label={t('common.homeLink')} className="-m-1 shrink-0 rounded-control p-1">
          {/* Compact context → standalone symbol (brand guidelines). */}
          <Logo variant="symbol" alt="" className="h-8 w-auto" />
        </Link>

        <nav aria-label={t('nav.primary')} className="hidden flex-1 items-center gap-1 md:flex">
          {primaryNav.map((item) => (
            <Link key={item.to} to={item.to} className={linkClass}>
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto hidden items-center gap-3 md:flex">
          <LanguageSwitcher />
          <Link to={barberEntry.to} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            {t(barberEntry.labelKey)}
          </Link>
        </div>

        <button
          type="button"
          className="ms-auto inline-flex size-10 items-center justify-center rounded-control text-soft hover:bg-surface md:hidden"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <div id={menuId} hidden={!menuOpen} className={cn('border-t border-line md:hidden')}>
        <nav aria-label={t('nav.primary')} className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
          {primaryNav.map((item) => (
            <Link key={item.to} to={item.to} onClick={closeMenu} className={cn(linkClass, 'py-3 text-base')}>
              {t(item.labelKey)}
            </Link>
          ))}
          <Link to={barberEntry.to} onClick={closeMenu} className={cn(linkClass, 'py-3 text-base')}>
            {t(barberEntry.labelKey)}
          </Link>
          <div className="mt-3 border-t border-line pt-4">
            <LanguageSwitcher className="w-fit" />
          </div>
        </nav>
      </div>
    </header>
  )
}
