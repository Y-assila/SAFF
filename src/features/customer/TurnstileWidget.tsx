import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { loadTurnstile, turnstileSiteKey, type TurnstileApi } from './turnstile'

export interface TurnstileHandle {
  /** Tokens are single-use: reset after every submission attempt. */
  reset(): void
}

/** Bot protection for the join form (TD issue 6). Fails closed: no token, no join. */
export function TurnstileWidget({ onToken, ref }: { onToken: (token: string | null) => void; ref?: Ref<TurnstileHandle> }) {
  const { t, i18n } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const api = useRef<{ turnstile: TurnstileApi; id: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const siteKey = turnstileSiteKey()
  const onTokenRef = useRef(onToken)
  useLayoutEffect(() => {
    onTokenRef.current = onToken
  })

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current(null)
      if (api.current) api.current.turnstile.reset(api.current.id)
    },
  }), [])

  useEffect(() => {
    if (!siteKey || !container.current) return
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        const id = turnstile.render(container.current, {
          sitekey: siteKey,
          theme: 'dark',
          language: i18n.resolvedLanguage,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
        api.current = { turnstile, id }
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (api.current) api.current.turnstile.remove(api.current.id)
      api.current = null
    }
  }, [siteKey, i18n.resolvedLanguage])

  if (!siteKey || failed) return <p role="alert" className="text-sm text-danger">{t('join.botCheckUnavailable')}</p>
  return <div ref={container} className="min-h-16" data-testid="turnstile" />
}
