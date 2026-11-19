import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Button, Card, EmptyState, ErrorState, Input, LoadingState } from '../../components/ui'
import { errorMessageKey, toRpcError } from '../../features/queue/errors'
import { queueKeys } from '../../features/queue/useQueue'
import { useMembership } from '../../features/shops/useMemberships'
import { getSupabase } from '../../lib/supabase'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

interface Settings {
  grace_period_minutes: number
  default_service_minutes: number
  max_active_tickets: number
  whatsapp_enabled: boolean
}

/** Same ranges as the CHECK constraints on public.shop_settings (the database re-validates). */
const LIMITS = {
  grace_period_minutes: { min: 1, max: 60 },
  default_service_minutes: { min: 5, max: 180 },
  max_active_tickets: { min: 1, max: 500 },
} as const
type NumericField = keyof typeof LIMITS

const settingsKey = (shopId: string) => ['settings', shopId] as const

export function SettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.title'))
  const { shopId = '' } = useParams()
  const { membership, isPending: membershipPending } = useMembership(shopId)
  const settings = useQuery({
    queryKey: settingsKey(shopId),
    enabled: Boolean(shopId),
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await getSupabase()
        .from('shop_settings')
        .select('grace_period_minutes, default_service_minutes, max_active_tickets, whatsapp_enabled')
        .eq('shop_id', shopId)
        .single()
      if (error) throw toRpcError(error)
      return data
    },
  })

  if (membershipPending || settings.isPending) return <LoadingState />
  if (!membership) return <EmptyState title={t('errors.not_authorized')} />
  if (settings.isError) return <ErrorState onRetry={() => void settings.refetch()} />

  // Keyed by shop only: saving updates the cache without remounting (which would drop "saved").
  return <SettingsForm key={shopId} shopId={shopId} initial={settings.data} canEdit={membership.role === 'owner'} />
}

function SettingsForm({ shopId, initial, canEdit }: { shopId: string; initial: Settings; canEdit: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<NumericField, string>>({
    grace_period_minutes: String(initial.grace_period_minutes),
    default_service_minutes: String(initial.default_service_minutes),
    max_active_tickets: String(initial.max_active_tickets),
  })
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp_enabled)
  const [saved, setSaved] = useState(false)

  const invalid = (field: NumericField) => {
    const raw = values[field].trim()
    const n = Number(raw)
    const { min, max } = LIMITS[field]
    return !/^\d+$/.test(raw) || n < min || n > max
  }
  const hasErrors = (Object.keys(LIMITS) as NumericField[]).some(invalid)

  const save = useMutation({
    mutationFn: async () => {
      // Only the four columns the owner grant allows; RLS restricts the row to owners of this shop.
      const { data, error } = await getSupabase()
        .from('shop_settings')
        .update({
          grace_period_minutes: Number(values.grace_period_minutes),
          default_service_minutes: Number(values.default_service_minutes),
          max_active_tickets: Number(values.max_active_tickets),
          whatsapp_enabled: whatsapp,
        })
        .eq('shop_id', shopId)
        .select('grace_period_minutes, default_service_minutes, max_active_tickets, whatsapp_enabled')
        .single()
      if (error) throw toRpcError(error)
      return data
    },
    onSuccess: (data) => {
      setSaved(true)
      queryClient.setQueryData(settingsKey(shopId), data)
      void queryClient.invalidateQueries({ queryKey: queueKeys.all(shopId) })
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    if (!hasErrors) save.mutate()
  }

  const field = (name: NumericField, label: string, hint: string) => (
    <Input label={label} hint={hint} name={name} type="number" inputMode="numeric" dir="ltr"
      min={LIMITS[name].min} max={LIMITS[name].max} step={1} disabled={!canEdit}
      value={values[name]} onChange={(e) => { setSaved(false); setValues((v) => ({ ...v, [name]: e.target.value })) }}
      error={canEdit && invalid(name) ? t('settings.invalid', LIMITS[name]) : undefined} />
  )

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="text-xl font-bold">{t('settings.title')}</h1>
      {!canEdit && <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm text-muted">{t('settings.readOnly')}</p>}
      <Card padding="lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          {field('grace_period_minutes', t('settings.grace'), t('settings.graceHint'))}
          {field('default_service_minutes', t('settings.service'), t('settings.serviceHint'))}
          {field('max_active_tickets', t('settings.maxActive'), t('settings.maxActiveHint'))}
          <label className="flex items-start gap-3">
            <input type="checkbox" name="whatsapp_enabled" className="mt-1 size-4 accent-signal" disabled={!canEdit}
              checked={whatsapp} onChange={(e) => { setSaved(false); setWhatsapp(e.target.checked) }} />
            <span>
              <span className="block text-sm font-medium">{t('settings.whatsapp')}</span>
              <span className="block text-sm text-muted">{t('settings.whatsappHint')}</span>
            </span>
          </label>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" loading={save.isPending} disabled={hasErrors}>{t('settings.save')}</Button>
              <span role="status" className="text-sm text-muted">{saved ? t('settings.saved') : ''}</span>
            </div>
          )}
          {save.isError && <p role="alert" className="text-sm text-danger">{t(errorMessageKey(save.error))}</p>}
        </form>
      </Card>
    </div>
  )
}
