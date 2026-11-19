import { isValidPhoneNumber } from 'libphonenumber-js/min'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Input, buttonClasses } from '../../components/ui'
import { AlertIcon } from '../../components/ui/icons'
import { CustomerApiError, joinQueue, type JoinResult } from '../../features/customer/api'
import { CONSENT_TEXT_VERSION } from '../../features/customer/consent'
import { loadTicketToken, saveTicketToken } from '../../features/customer/ticketStorage'
import { TurnstileWidget, type TurnstileHandle } from '../../features/customer/TurnstileWidget'
import { currentLocale } from '../../i18n'

type FieldErrors = { name?: string; phone?: string; consent?: string }

/**
 * Customer join form. Client checks are for convenience only: the Edge Function and the database
 * re-validate everything (name, mobile number, consent, Turnstile, rate limits).
 */
export function JoinForm({ slug, shopName, onQueueChanged }: { slug: string; shopName: string; onQueueChanged: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false) // explicit opt-in: never pre-checked
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [existing, setExisting] = useState<Extract<JoinResult, { result: 'existing' }> | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // One id per form: a retried submission (double tap, network retry) returns the same ticket.
  const requestId = useRef(crypto.randomUUID())
  const turnstile = useRef<TurnstileHandle>(null)

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 60) next.name = t('join.errors.invalid_name')
    if (!isValidPhoneNumber(phone, 'MA')) next.phone = t('join.errors.invalid_phone')
    if (!consent) next.consent = t('join.consentRequired')
    return next
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const fieldErrors = validate()
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    if (!captcha) {
      setFormError(t('join.botCheckPending'))
      return
    }
    setSubmitting(true)
    try {
      const result = await joinQueue({
        shop_slug: slug, name: name.trim(), phone, locale: currentLocale(), consent: true,
        consent_text_version: CONSENT_TEXT_VERSION, client_request_id: requestId.current, turnstile_token: captcha,
      })
      if (result.result === 'created') {
        saveTicketToken(result.token)
        // Full page load: the ticket page starts without the Turnstile script (TD §7).
        window.location.assign('/t')
        return
      }
      setExisting(result)
    } catch (e) {
      const code = e instanceof CustomerApiError ? e.code : 'generic'
      if (code === 'invalid_phone') setErrors({ phone: t('join.errors.invalid_phone') })
      else if (code === 'invalid_name') setErrors({ name: t('join.errors.invalid_name') })
      else {
        const known = ['captcha_failed', 'rate_limited', 'queue_closed', 'queue_paused', 'queue_full', 'shop_not_found', 'network'] as const
        setFormError(t(`join.errors.${(known as readonly string[]).includes(code) ? (code as (typeof known)[number]) : 'generic'}`))
        if (['queue_closed', 'queue_paused', 'queue_full', 'shop_not_found'].includes(code)) onQueueChanged()
      }
    } finally {
      setSubmitting(false)
      turnstile.current?.reset() // Turnstile tokens are single-use
    }
  }

  if (existing) {
    const hasTicketHere = loadTicketToken() !== null
    return (
      <Card padding="lg" role="status" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('join.existingTitle')}</h2>
        <p className="text-sm text-muted">{existing.whatsapp ? t('join.existingWhatsapp') : t('join.existingNoWhatsapp')}</p>
        {hasTicketHere && <a href="/t" className={buttonClasses({ variant: 'secondary', className: 'self-start' })}>{t('join.openMyTicket')}</a>}
      </Card>
    )
  }

  return (
    <Card padding="lg">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <h2 className="text-lg font-semibold">{t('shopPage.joinTitle')}</h2>
        <Input label={t('join.name')} hint={t('join.nameHint')} name="name" autoComplete="given-name" maxLength={60} required
               value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input label={t('join.phone')} hint={t('join.phoneHint')} name="phone" type="tel" inputMode="tel" autoComplete="tel"
               dir="ltr" placeholder={t('join.phonePlaceholder')} maxLength={32} required
               value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="consent" className="mt-1 size-4 shrink-0 accent-signal" checked={consent}
                   aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'consent-error' : undefined}
                   onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-sm leading-relaxed text-muted">{t('join.consent', { shop: shopName })}</span>
          </label>
          {errors.consent && (
            <p id="consent-error" className="flex items-center gap-1.5 text-sm text-danger">
              <AlertIcon className="size-4 shrink-0" /> <span>{errors.consent}</span>
            </p>
          )}
        </div>
        <TurnstileWidget ref={turnstile} onToken={setCaptcha} />
        {formError && (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <AlertIcon className="size-4 shrink-0" /> <span>{formError}</span>
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={submitting}>{t('join.submit')}</Button>
      </form>
    </Card>
  )
}
