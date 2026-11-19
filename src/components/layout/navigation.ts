import type { ParseKeys } from 'i18next'

export interface NavItem {
  labelKey: ParseKeys
  to: string
}

/** Public navigation. Section anchors live on the landing page. */
export const primaryNav: NavItem[] = [
  { labelKey: 'nav.home', to: '/' },
  { labelKey: 'nav.howItWorks', to: '/#how-it-works' },
  { labelKey: 'nav.forShops', to: '/#for-shops' },
]

export const barberEntry: NavItem = { labelKey: 'nav.barberSignIn', to: '/barber/login' }
