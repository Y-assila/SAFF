import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Button, Card, ErrorState, Input, LoadingState } from '../../components/ui'
import { AlertIcon } from '../../components/ui/icons'
import { useAuth } from '../../features/auth/authContext'
import { safeReturnPath } from '../../features/auth/returnPath'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function BarberLoginPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('auth.title'))
  const { configured, loading, session, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const destination = safeReturnPath((location.state as { from?: unknown } | null)?.from)

  if (!configured) {
    return <ErrorState title={t('auth.notConfiguredTitle')} description={t('auth.notConfiguredBody')} />
  }
  if (loading) return <LoadingState />
  if (session) return <Navigate to={destination} replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.ok) navigate(destination, { replace: true })
    else setError(result.reason === 'invalid_credentials' ? t('auth.invalidCredentials') : t('errors.network'))
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">{t('auth.title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('auth.subtitle')}</p>
      </div>
      <Card padding="lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Input label={t('auth.email')} type="email" name="email" autoComplete="username" dir="ltr" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label={t('auth.password')} type="password" name="password" autoComplete="current-password" dir="ltr" required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm text-danger">
              <AlertIcon className="size-4 shrink-0" /> <span>{error}</span>
            </p>
          )}
          <Button type="submit" fullWidth size="lg" loading={submitting} disabled={!email || !password}>
            {t('auth.submit')}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-muted">{t('landing.shops.access')}</p>
    </div>
  )
}
