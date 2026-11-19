import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo } from '../components/brand/Logo'
import { Card, CardDescription, CardTitle, buttonClasses } from '../components/ui'
import { ArrowForwardIcon, ShieldIcon } from '../components/ui/icons'
import { currentLocale } from '../i18n'
import { LOCALE_META } from '../i18n/config'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const stepKeys = ['scan', 'details', 'ticket', 'track'] as const
const pointKeys = ['fair', 'control', 'calm'] as const

/**
 * Preliminary marketing page. Describes only agreed MVP behaviour; contains no business data
 * and calls no backend.
 */
export function LandingPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('landing.title'))
  const numberFormat = new Intl.NumberFormat(LOCALE_META[currentLocale()].intl)

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        {/* Clear space around the lockup ≥ largest head diameter (brand guidelines). */}
        <div className="py-4">
          <Logo variant="primary" className="h-auto w-full max-w-[22rem] sm:max-w-[30rem]" />
        </div>
        <h1 className="mt-10 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-soft sm:text-5xl lg:text-6xl">
          {t('landing.heroLead')} <span className="text-signal">{t('landing.heroTail')}</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t('landing.heroBody')}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link to="/#how-it-works" className={buttonClasses({ size: 'lg' })}>
            {t('landing.ctaHow')}
            <ArrowForwardIcon />
          </Link>
          <Link to="/#for-shops" className={buttonClasses({ size: 'lg', variant: 'secondary' })}>
            {t('landing.ctaShops')}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="how-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t('landing.how.title')}
          </h2>
          <p className="mt-3 max-w-xl text-muted">{t('landing.how.intro')}</p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stepKeys.map((key, index) => (
              <Card as="li" key={key} className="flex flex-col gap-4">
                <span
                  aria-hidden="true"
                  className={
                    index === 0
                      ? 'flex size-9 items-center justify-center rounded-full bg-signal text-sm font-bold text-midnight'
                      : 'flex size-9 items-center justify-center rounded-full border border-line text-sm font-bold text-muted'
                  }
                >
                  {numberFormat.format(index + 1)}
                </span>
                <div>
                  <CardTitle>{t(`landing.how.steps.${key}.title`)}</CardTitle>
                  <CardDescription>{t(`landing.how.steps.${key}.body`)}</CardDescription>
                </div>
              </Card>
            ))}
          </ol>
        </div>
      </section>

      {/* For barbershops */}
      <section id="for-shops" aria-labelledby="shops-title" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="shops-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t('landing.shops.title')}
          </h2>
          <p className="mt-3 max-w-xl text-muted">{t('landing.shops.body')}</p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {pointKeys.map((key) => (
              <Card as="li" key={key}>
                <CardTitle>{t(`landing.shops.points.${key}.title`)}</CardTitle>
                <CardDescription>{t(`landing.shops.points.${key}.body`)}</CardDescription>
              </Card>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link to="/barber/login" className={buttonClasses({ variant: 'secondary' })}>
              {t('nav.barberSignIn')}
            </Link>
            <p className="text-sm text-muted">{t('landing.shops.access')}</p>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section aria-labelledby="privacy-title" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Card padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-signal">
              <ShieldIcon />
            </span>
            <div>
              <h2 id="privacy-title" className="text-lg font-semibold">
                {t('landing.privacy.title')}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{t('landing.privacy.body')}</p>
            </div>
          </Card>
        </div>
      </section>
    </>
  )
}
