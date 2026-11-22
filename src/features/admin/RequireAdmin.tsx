import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState } from '../../components/ui'
import { ShieldIcon } from '../../components/ui/icons'
import { getSupabase } from '../../lib/supabase'
import { useAuth } from '../auth/authContext'
import { adminApi, adminKeys } from './api'

/**
 * Guard for /admin: the account must be a SAFF admin AND the session must have passed two-factor
 * (aal2). UI convenience only: every admin RPC and the admin-users function re-check both.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  // Keyed by access token: after the second factor the token changes and the status is re-read.
  const status = useQuery({ queryKey: adminKeys.status(session?.access_token), queryFn: adminApi.status, retry: 1 })

  if (status.isPending) return <LoadingState />
  if (status.isError) return <ErrorState onRetry={() => void status.refetch()} />
  if (!status.data.is_admin) {
    return (
      <EmptyState icon={<ShieldIcon />} title={t('admin.notAdminTitle')} description={t('admin.notAdminBody')}
        action={<Button variant="secondary" onClick={async () => { await signOut(); navigate('/admin/login', { replace: true }) }}>{t('auth.signOut')}</Button>} />
    )
  }
  if (status.data.aal !== 'aal2') return <TwoFactor />
  return children
}

type Factor = { id: string; status: string; factor_type: string }

function TwoFactor() {
  const { session } = useAuth()
  const factors = useQuery({
    queryKey: ['admin', 'factors', session?.user.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.mfa.listFactors()
      if (error) throw error
      return data.all as Factor[]
    },
  })
  if (factors.isPending) return <LoadingState />
  if (factors.isError) return <ErrorState onRetry={() => void factors.refetch()} />
  const verified = factors.data.find((f) => f.factor_type === 'totp' && f.status === 'verified')
  return verified ? <Challenge factorId={verified.id} /> : <Enroll unverified={factors.data.filter((f) => f.status !== 'verified').map((f) => f.id)} />
}

/** First admin sign in: link an authenticator app (scan the QR code or type the key). */
function Enroll({ unverified }: { unverified: string[] }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const enrollment = useQuery({
    queryKey: ['admin', 'enroll', session?.user.id],
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const mfa = getSupabase().auth.mfa
      for (const id of unverified) await mfa.unenroll({ factorId: id }) // leftovers from an abandoned setup
      const { data, error } = await mfa.enroll({ factorType: 'totp', friendlyName: 'SAFF admin' })
      if (error) throw error
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    },
  })

  return (
    <TwoFactorLayout title={t('admin.mfa.enrollTitle')} body={t('admin.mfa.enrollBody')}>
      {enrollment.isPending && <LoadingState />}
      {enrollment.isError && <ErrorState onRetry={() => void enrollment.refetch()} />}
      {enrollment.data && (
        <>
          <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm text-muted">
            <li>{t('admin.mfa.step1')}</li>
            <li>{t('admin.mfa.step2')}</li>
            <li>{t('admin.mfa.step3')}</li>
          </ol>
          <img src={enrollment.data.qr} alt={t('admin.mfa.qrAlt')} className="mx-auto size-48 rounded-control bg-white p-2" />
          <div className="text-sm">
            <p className="text-muted">{t('admin.mfa.manualKey')}</p>
            <p dir="ltr" data-testid="totp-secret" className="mt-1 break-all font-mono text-soft">{enrollment.data.secret}</p>
          </div>
          <CodeForm factorId={enrollment.data.factorId} />
        </>
      )}
    </TwoFactorLayout>
  )
}

function Challenge({ factorId }: { factorId: string }) {
  const { t } = useTranslation()
  return (
    <TwoFactorLayout title={t('admin.mfa.challengeTitle')} body={t('admin.mfa.challengeBody')}>
      <CodeForm factorId={factorId} />
    </TwoFactorLayout>
  )
}

function CodeForm({ factorId }: { factorId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: verifyError } = await getSupabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    setSubmitting(false)
    if (verifyError) {
      setError(verifyError.status && verifyError.status < 500 ? t('admin.mfa.invalidCode') : t('errors.network'))
      return
    }
    // The session now carries aal2; AuthProvider receives it and RequireAdmin re-reads the status.
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input label={t('admin.mfa.code')} name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr"
        maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={error ?? undefined} />
      <Button type="submit" fullWidth size="lg" loading={submitting} disabled={code.length !== 6}>{t('admin.mfa.verify')}</Button>
    </form>
  )
}

function TwoFactorLayout({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-12">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
      </div>
      <Card padding="lg"><div className="flex flex-col gap-5">{children}</div></Card>
      <Button variant="ghost" onClick={async () => { await signOut(); navigate('/admin/login', { replace: true }) }}>{t('auth.signOut')}</Button>
    </div>
  )
}
