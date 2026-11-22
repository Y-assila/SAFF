import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../../components/brand/Logo'
import { Button } from '../../components/ui'
import { AlertIcon } from '../../components/ui/icons'
import i18n from '../../i18n'
import { qrBase, qrMatrix, qrPath, qrSvgFile, shopJoinUrl } from './qr'

const QUIET = 4
const POSTER_LANGUAGES = ['ar', 'fr', 'en'] as const

/** The shop's permanent QR poster (decisions D-02, D-04). Used by the barber area and the SAFF console. */
export function ShopQrPoster({ shop }: { shop: { name: string; slug: string } }) {
  const { t } = useTranslation()
  const { base, printable } = qrBase()
  const url = shopJoinUrl(base, shop.slug)
  const matrix = useMemo(() => qrMatrix(url), [url])
  const size = matrix.length + QUIET * 2

  const download = () => {
    const blob = new Blob([qrSvgFile(url)], { type: 'image/svg+xml' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `saff-qr-${shop.slug}.svg`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="flex flex-col gap-5">
      <div data-print-hide className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">{t('qr.title')}</h1>
        <p className="max-w-xl text-sm text-muted">{t('qr.intro')}</p>
        {!printable && (
          <div role="alert" className="flex max-w-xl items-start gap-3 rounded-control border border-danger/60 px-4 py-3 text-sm">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            <div>
              <p className="font-semibold">{t('qr.notPrintableTitle')}</p>
              <p className="mt-1 text-muted">{t('qr.notPrintableBody')}</p>
            </div>
          </div>
        )}
        <div className="text-sm">
          <p className="text-muted">{t('qr.permanent')}</p>
          <p dir="ltr" className="mt-1 break-all font-mono text-soft">{url}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button disabled={!printable} onClick={() => window.print()}>{t('qr.print')}</Button>
          <Button variant="secondary" disabled={!printable} onClick={download}>{t('qr.download')}</Button>
        </div>
      </div>

      {/* The poster: brand-dark card, white QR tile (scan contrast), call to action in all three languages. */}
      <section data-print-root aria-label={t('qr.title')}
        className="relative mx-auto flex w-full max-w-sm flex-col items-center gap-5 overflow-hidden rounded-card border border-line bg-midnight px-8 py-10 text-center print:max-w-none print:rounded-none print:border-0 print:min-h-screen print:justify-center">
        <Logo variant="primary" alt="SAFF" className="h-auto w-48" />
        <p className="text-lg font-semibold" dir="auto">{shop.name}</p>
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={url} shapeRendering="crispEdges"
          className="w-full max-w-64 rounded-control bg-white">
          <rect width={size} height={size} fill="#FFFFFF" />
          <path fill="#000000" d={qrPath(matrix, QUIET)} />
        </svg>
        <div className="flex flex-col gap-1">
          {POSTER_LANGUAGES.map((lng) => (
            <p key={lng} lang={lng} dir={lng === 'ar' ? 'rtl' : 'ltr'} className="text-base font-semibold text-signal">
              {i18n.getFixedT(lng)('qr.scanCall')}
            </p>
          ))}
        </div>
        <p dir="ltr" className="font-mono text-xs text-muted">{url.replace(/^https?:\/\//, '')}</p>
        {!printable && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-30 select-none whitespace-nowrap rounded-control border-2 border-danger bg-midnight/80 px-4 py-2 text-xl font-bold tracking-widest text-danger">
              {t('qr.watermark')}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
