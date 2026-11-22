import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Card, Input } from '../../components/ui'
import { passwordProblem, PASSWORD_MIN } from '../../features/account/password'
import { useAuth } from '../../features/auth/authContext'
import { callFunction, FunctionError } from '../../lib/functions'
import { getSupabase } from '../../lib/supabase'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * /barber/password: choose a new password. Required after the SAFF team created the account or
 * reset its password (temporary password); also usable at any time.
 */
export function ChangePasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('account.title'))
  const { mustChangePassword, session } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const problem = passwordProblem(password)
  const mismatch = confirm !== password
  const fieldError = touched && problem ? t(`account.${problem}`, { min: PASSWORD_MIN }) : undefined

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setError(null)
    if (problem || mismatch) return
    setSubmitting(true)
    try {
      await callFunction('account-password', { password })
      // Supabase Auth ends the account's sessions when the password changes. Sign in again with the
      // new password: the new JWT no longer carries the temporary-password flag.
      const { error: signInError } = await getSupabase().auth.signInWithPassword({ email: session?.user.email ?? '', password })
      if (signInError) throw new FunctionError('network')
      queryClient.removeQueries() // nothing read under the temporary password may be reused
      if (mustChangePassword) {
        navigate('/barber', { replace: true })
      } else {
        setDone(true)
        setPassword('')
        setConfirm('')
        setTouched(false)
      }
    } catch (e) {
      const code = e instanceof FunctionError ? e.code : 'generic'
      setError(code === 'network' ? t('errors.network') : code === 'weak_password' ? t('account.weak') : t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">{mustChangePassword ? t('account.firstTitle') : t('account.title')}</h1>
        <p className="mt-2 text-sm text-muted">{mustChangePassword ? t('account.firstBody') : t('account.body')}</p>
        {session?.user.email && <p dir="ltr" className="mt-2 text-sm text-soft">{session.user.email}</p>}
      </div>
      <Card padding="lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {/* Hidden username field so password managers save the right account. */}
          <input type="email" name="username" autoComplete="username" value={session?.user.email ?? ''} readOnly hidden />
          <Input label={t('account.new')} hint={t('account.rule', { min: PASSWORD_MIN })} type="password" name="new-password"
            autoComplete="new-password" dir="ltr" required value={password} error={fieldError}
            onChange={(e) => { setDone(false); setPassword(e.target.value) }} />
          <Input label={t('account.confirm')} type="password" name="confirm-password" autoComplete="new-password" dir="ltr" required
            value={confirm} error={touched && !problem && mismatch ? t('account.mismatch') : undefined}
            onChange={(e) => { setDone(false); setConfirm(e.target.value) }} />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <span role="status" className="text-sm text-muted">{done ? t('account.changed') : ''}</span>
          <Button type="submit" fullWidth size="lg" loading={submitting} disabled={!password || !confirm}>
            {t('account.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
