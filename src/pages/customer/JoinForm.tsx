import { isValidPhoneNumber } from 'libphonenumber-js/min'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, buttonClasses } from '../../components/ui'
import { AlertIcon, ArrowForwardIcon } from '../../components/ui/icons'
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
  const [details, setDetails] = useState(false)
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
      <section role="status" className="mx-5 mt-8 flex flex-col gap-3 rounded-3xl bg-surface p-6 animate-rise">
        <h2 className="text-lg font-bold">{t('join.existingTitle')}</h2>
        <p className="text-sm leading-relaxed text-muted">{existing.whatsapp ? t('join.existingWhatsapp') : t('join.existingNoWhatsapp')}</p>
        {hasTicketHere && <a href="/t" className={buttonClasses({ variant: 'secondary', className: 'self-start' })}>{t('join.openMyTicket')}</a>}
      </section>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label={t('shopPage.joinTitle')} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3.5 px-5 pt-8">
        <FieldBox label={t('join.name')} error={errors.name}>
          {(id, describedBy) => (
            <input id={id} name="name" autoComplete="given-name" maxLength={60} required dir="auto"
              placeholder={t('join.nameHint')} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy}
              value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          )}
        </FieldBox>
        <FieldBox label={t('join.phone')} error={errors.phone} hint={t('join.phoneHint')}>
          {(id, describedBy) => (
            <input id={id} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={32} required
              placeholder={t('join.phonePlaceholder')} aria-invalid={errors.phone ? true : undefined} aria-describedby={describedBy}
              value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputClass} tabular-nums`} />
          )}
        </FieldBox>

        <div className="flex items-start gap-3 px-0.5 pt-2">
          <input id="consent" type="checkbox" name="consent" className="mt-0.5 size-[1.375rem] shrink-0 accent-signal" checked={consent}
                 aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'consent-error' : undefined}
                 onChange={(e) => setConsent(e.target.checked)} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="consent" className="text-sm leading-relaxed text-soft/90">{t('join.consentShort')}</label>
            <button type="button" aria-expanded={details} aria-controls="consent-details" onClick={() => setDetails((d) => !d)}
              className="press self-start text-[0.8125rem] font-semibold text-muted underline underline-offset-4 hover:text-soft">
              {details ? t('join.consentHide') : t('join.consentShow')}
            </button>
            {details && <p id="consent-details" className="text-[0.8125rem] leading-relaxed text-muted animate-rise">{t('join.consent', { shop: shopName })}</p>}
            {errors.consent && (
              <p id="consent-error" className="flex items-center gap-1.5 text-sm text-danger">
                <AlertIcon className="size-4 shrink-0" /> <span>{errors.consent}</span>
              </p>
            )}
          </div>
        </div>
        <TurnstileWidget ref={turnstile} onToken={setCaptcha} />
      </div>

      {/* The action stays under the thumb on every phone. */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2.5 border-t border-line/60 bg-midnight/95 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur">
        {formError && (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <AlertIcon className="size-4 shrink-0" /> <span>{formError}</span>
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={submitting} className="h-14 rounded-2xl text-lg font-bold">
          {t('join.submit')}
          <ArrowForwardIcon className="size-5" />
        </Button>
        <p className="text-center text-[0.8125rem] text-graphite">{t('join.footnote')}</p>
      </div>
    </form>
  )
}

const inputClass = 'h-7 w-full bg-transparent p-0 text-[1.0625rem] text-soft placeholder:text-graphite focus:outline-none'

/** Label and input in one tappable box; the border turns lime while typing. */
function FieldBox({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: (id: string, describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex flex-col gap-1 rounded-2xl border bg-surface px-4 py-3 transition-colors focus-within:border-signal ${error ? 'border-danger' : 'border-line'}`}>
        <label htmlFor={id} className="text-xs font-semibold text-muted">{label}</label>
        {children(id, [hintId, errorId].filter(Boolean).join(' ') || undefined)}
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 px-1 text-sm text-danger">
          <AlertIcon className="size-4 shrink-0" /> <span>{error}</span>
        </p>
      )}
      {hint && !error && <p id={hintId} className="px-1 text-[0.8125rem] text-graphite">{hint}</p>}
    </div>
  )
}
