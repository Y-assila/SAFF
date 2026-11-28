import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo } from '../components/brand/Logo'
import { buttonClasses } from '../components/ui'
import { ArrowForwardIcon, ShieldIcon } from '../components/ui/icons'
import { currentLocale } from '../i18n'
import { LOCALE_META } from '../i18n/config'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { BarberMockup, TicketMockup } from './landing/Mockups'

const stepKeys = ['scan', 'details', 'ticket', 'track'] as const
const pointKeys = ['fair', 'control', 'calm'] as const

/** Public landing page. Describes only agreed MVP behaviour; contains no business data and calls no backend. */
export function LandingPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('landing.title'))
  const numberFormat = new Intl.NumberFormat(LOCALE_META[currentLocale()].intl)

  return (
    <>
      {/* Hero: the promise on one side, the product on the other. */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20 lg:pb-28">
        <div className="animate-rise">
          {/* Clear space around the lockup ≥ largest head diameter (brand guidelines). */}
          <Logo variant="primary" className="h-auto w-full max-w-[15rem] sm:max-w-[18rem]" />
          <h1 className="mt-12 max-w-2xl text-5xl leading-[0.98] font-extrabold tracking-tighter text-soft sm:text-6xl lg:text-7xl">
            {t('landing.heroLead')} <span className="text-signal">{t('landing.heroTail')}</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">{t('landing.heroBody')}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link to="/#how-it-works" className={buttonClasses({ size: 'lg', className: 'rounded-2xl' })}>
              {t('landing.ctaHow')}
              <ArrowForwardIcon />
            </Link>
            <Link to="/#for-shops" className={buttonClasses({ size: 'lg', variant: 'secondary', className: 'rounded-2xl' })}>
              {t('landing.ctaShops')}
            </Link>
          </div>
        </div>
        <TicketMockup />
      </section>

      {/* How it works: four steps in a row, numbers instead of boxes. */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <h2 id="how-title" className="text-4xl font-extrabold tracking-tighter sm:text-5xl">{t('landing.how.title')}</h2>
          <p className="mt-4 max-w-xl text-lg text-muted">{t('landing.how.intro')}</p>
          <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {stepKeys.map((key, index) => (
              <li key={key} className="flex flex-col gap-3 border-t border-line pt-6">
                <span aria-hidden="true" className={`display text-5xl ${index === 0 ? 'text-signal' : 'text-graphite'}`}>
                  {numberFormat.format(index + 1)}
                </span>
                <h3 className="text-lg font-bold tracking-tight">{t(`landing.how.steps.${key}.title`)}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-muted">{t(`landing.how.steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* For barbershops: what the barber sees. */}
      <section id="for-shops" aria-labelledby="shops-title" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2">
          <div>
            <h2 id="shops-title" className="text-4xl font-extrabold tracking-tighter sm:text-5xl">{t('landing.shops.title')}</h2>
            <p className="mt-4 max-w-lg text-lg text-muted">{t('landing.shops.body')}</p>
            <ul className="mt-10 flex flex-col gap-6">
              {pointKeys.map((key) => (
                <li key={key} className="flex gap-4">
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-signal" />
                  <div>
                    <h3 className="font-bold">{t(`landing.shops.points.${key}.title`)}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{t(`landing.shops.points.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <Link to="/barber/login" className={buttonClasses({ variant: 'secondary', className: 'rounded-2xl' })}>
                {t('nav.barberSignIn')}
              </Link>
              <p className="text-sm text-muted">{t('landing.shops.access')}</p>
            </div>
          </div>
          <BarberMockup />
        </div>
      </section>

      {/* Privacy: one clear statement. */}
      <section aria-labelledby="privacy-title" className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-20 sm:flex-row sm:items-center sm:gap-8 sm:px-6">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface text-signal">
            <ShieldIcon />
          </span>
          <div>
            <h2 id="privacy-title" className="text-2xl font-extrabold tracking-tight">{t('landing.privacy.title')}</h2>
            <p className="mt-2 max-w-2xl leading-relaxed text-muted">{t('landing.privacy.body')}</p>
          </div>
        </div>
      </section>
    </>
  )
}
