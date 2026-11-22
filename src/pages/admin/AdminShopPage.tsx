import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { Badge, Button, buttonClasses, Card, Dialog, ErrorState, Input, LoadingState, Select } from '../../components/ui'
import { AdminError, adminApi, adminKeys, PHONE_PATTERN, type AdminMember, type AdminShop } from '../../features/admin/api'
import { formatDateTime } from '../../features/admin/format'
import type { ShopRole } from '../../features/shops/useMemberships'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const errorKey = (e: unknown) => `admin.errors.${e instanceof AdminError ? e.code : 'generic'}` as const

/** /admin/shops/:shopId — shop details, status, team and account creation. */
export function AdminShopPage() {
  const { t } = useTranslation()
  const { shopId = '' } = useParams()
  const shop = useQuery({ queryKey: adminKeys.shop(shopId), queryFn: () => adminApi.getShop(shopId) })
  useDocumentTitle(shop.data?.name ?? t('admin.shops.title'))

  if (shop.isPending) return <LoadingState />
  if (shop.isError) return <ErrorState title={t(errorKey(shop.error))} onRetry={() => void shop.refetch()} />
  const s = shop.data

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold" dir="auto">{s.name}</h1>
        <Badge tone={s.is_active ? 'neutral' : 'danger'} dot>{s.is_active ? t('admin.shops.active') : t('admin.shops.disabled')}</Badge>
        <div className="ms-auto flex flex-wrap gap-2">
          <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('admin.shop.customerPage')}</a>
          <Link to={`/admin/shops/${s.id}/qr`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>{t('qr.nav')}</Link>
        </div>
      </div>
      <p dir="ltr" className="-mt-3 text-start font-mono text-xs text-muted">/s/{s.slug} · {s.timezone}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        <DetailsCard key={`${s.id}-${s.name}-${s.address}-${s.phone}-${s.default_locale}`} shop={s} />
        <div className="flex flex-col gap-5">
          <AddAccountCard shopId={s.id} />
          <StatusCard shop={s} />
        </div>
      </div>
      <TeamCard shop={s} />
    </div>
  )
}

function useRefreshShop(shopId: string) {
  const queryClient = useQueryClient()
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.shop(shopId) }),
    queryClient.invalidateQueries({ queryKey: adminKeys.shops }),
    queryClient.invalidateQueries({ queryKey: adminKeys.overview }),
  ])
}

function DetailsCard({ shop }: { shop: AdminShop }) {
  const { t } = useTranslation()
  const refresh = useRefreshShop(shop.id)
  const [name, setName] = useState(shop.name)
  const [locale, setLocale] = useState<string>(shop.default_locale)
  const [address, setAddress] = useState(shop.address ?? '')
  const [phone, setPhone] = useState(shop.phone ?? '')
  const nameError = name.trim().length < 2 || name.trim().length > 80
  const phoneError = phone.trim() !== '' && !PHONE_PATTERN.test(phone.trim())
  const save = useMutation({ mutationFn: () => adminApi.updateShop(shop.id, { name, defaultLocale: locale, address, phone }), onSuccess: refresh })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!nameError && !phoneError) save.mutate()
  }

  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold">{t('admin.shop.details')}</h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <Input label={t('admin.shop.name')} name="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          error={nameError ? t('admin.shop.nameInvalid') : undefined} />
        <Select label={t('admin.shop.language')} name="locale" value={locale} onChange={(e) => setLocale(e.target.value)}
          options={[{ value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
        <Input label={t('admin.shop.address')} name="address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
        <Input label={t('admin.shop.phone')} name="phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)}
          error={phoneError ? t('admin.shop.phoneInvalid') : undefined} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="secondary" loading={save.isPending} disabled={nameError || phoneError}>{t('settings.save')}</Button>
          <span role="status" className="text-sm text-muted">{save.isSuccess ? t('settings.saved') : ''}</span>
        </div>
        {save.isError && <p role="alert" className="text-sm text-danger">{t(errorKey(save.error))}</p>}
      </form>
    </Card>
  )
}

function StatusCard({ shop }: { shop: AdminShop }) {
  const { t } = useTranslation()
  const refresh = useRefreshShop(shop.id)
  const [confirming, setConfirming] = useState(false)
  const toggle = useMutation({
    mutationFn: () => adminApi.setShopActive(shop.id, !shop.is_active),
    onSuccess: async () => { setConfirming(false); await refresh() },
  })
  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold">{t('admin.shop.status')}</h2>
      <p className="mt-2 text-sm text-muted">{shop.is_active ? t('admin.shop.activeBody') : t('admin.shop.disabledBody')}</p>
      <div className="mt-4">
        {shop.is_active
          ? <Button variant="secondary" onClick={() => setConfirming(true)}>{t('admin.shop.disable')}</Button>
          : <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>{t('admin.shop.enable')}</Button>}
      </div>
      {toggle.isError && <p role="alert" className="mt-3 text-sm text-danger">{t(errorKey(toggle.error))}</p>}
      <Dialog open={confirming} onClose={() => setConfirming(false)} title={t('admin.shop.disableTitle')} description={t('admin.shop.disableBody')}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirming(false)}>{t('admin.cancel')}</Button>
          <Button loading={toggle.isPending} onClick={() => toggle.mutate()}>{t('admin.shop.disable')}</Button>
        </>} />
    </Card>
  )
}

function AddAccountCard({ shopId }: { shopId: string }) {
  const { t } = useTranslation()
  const refresh = useRefreshShop(shopId)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ShopRole>('barber')
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null)
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const create = useMutation({
    mutationFn: () => adminApi.createAccount(shopId, email.trim().toLowerCase(), role),
    onSuccess: async (result) => {
      if (result.temporary_password) setPassword({ email: email.trim().toLowerCase(), value: result.temporary_password })
      setEmail('')
      await refresh()
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (emailValid) create.mutate()
  }

  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold">{t('admin.account.title')}</h2>
      <p className="mt-2 text-sm text-muted">{t('admin.account.body')}</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <Input label={t('auth.email')} type="email" name="account-email" autoComplete="off" dir="ltr" value={email}
          onChange={(e) => { create.reset(); setEmail(e.target.value) }} />
        <Select label={t('admin.account.role')} name="role" value={role} onChange={(e) => setRole(e.target.value as ShopRole)}
          options={[{ value: 'barber', label: t('admin.roles.barber') }, { value: 'owner', label: t('admin.roles.owner') }]} />
        <Button type="submit" loading={create.isPending} disabled={!emailValid}>{t('admin.account.submit')}</Button>
        <span role="status" className="text-sm text-muted">
          {create.data?.result === 'added_existing' ? t('admin.account.addedExisting') : ''}
        </span>
        {create.isError && <p role="alert" className="text-sm text-danger">{t(errorKey(create.error))}</p>}
      </form>
      <TemporaryPasswordDialog password={password} onClose={() => setPassword(null)} />
    </Card>
  )
}

/** Shown once: SAFF never stores the temporary password. */
function TemporaryPasswordDialog({ password, onClose }: { password: { email: string; value: string } | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const close = () => { setCopied(false); onClose() }
  return (
    <Dialog open={password !== null} onClose={close} title={t('admin.password.title')} description={t('admin.password.body')}
      footer={<>
        <Button variant="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(password?.value ?? ''); setCopied(true) } catch { setCopied(false) }
        }}>{copied ? t('admin.password.copied') : t('admin.password.copy')}</Button>
        <Button onClick={close}>{t('admin.password.done')}</Button>
      </>}>
      <div className="flex flex-col gap-2 rounded-control border border-line bg-midnight px-4 py-3">
        <span dir="ltr" className="text-sm text-muted">{password?.email}</span>
        <span dir="ltr" data-testid="temporary-password" className="select-all break-all font-mono text-lg font-semibold text-signal">{password?.value}</span>
      </div>
      <p className="text-sm text-muted">{t('admin.password.warning')}</p>
    </Dialog>
  )
}

type PendingAction = { kind: 'remove' | 'disable' | 'reset'; member: AdminMember }

function TeamCard({ shop }: { shop: AdminShop }) {
  const { t, i18n } = useTranslation()
  const refresh = useRefreshShop(shop.id)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [password, setPassword] = useState<{ email: string; value: string } | null>(null)

  const act = useMutation({
    mutationFn: async (action: PendingAction | { kind: 'enable' | 'role'; member: AdminMember; role?: ShopRole }) => {
      const id = action.member.user_id
      switch (action.kind) {
        case 'remove': return adminApi.removeMember(shop.id, id)
        case 'disable': return adminApi.setDisabled(id, true)
        case 'enable': return adminApi.setDisabled(id, false)
        case 'role': return adminApi.setMemberRole(shop.id, id, action.role!)
        case 'reset': {
          const r = await adminApi.resetPassword(id)
          setPassword({ email: action.member.email, value: r.temporary_password })
          return r
        }
      }
    },
    onSuccess: async () => { setPending(null); await refresh() },
  })

  const confirmText = pending && {
    remove: { title: t('admin.team.removeTitle'), body: t('admin.team.removeBody', { email: pending.member.email }), cta: t('admin.team.remove') },
    disable: { title: t('admin.team.disableTitle'), body: t('admin.team.disableBody', { email: pending.member.email }), cta: t('admin.team.disable') },
    reset: { title: t('admin.team.resetTitle'), body: t('admin.team.resetBody', { email: pending.member.email }), cta: t('admin.team.reset') },
  }[pending.kind]

  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold">{t('admin.team.title')}</h2>
      {shop.members.length === 0 && <p className="mt-2 text-sm text-muted">{t('admin.team.empty')}</p>}
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {shop.members.map((m) => (
          <li key={m.user_id} data-testid="member-row" className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p dir="ltr" className="truncate text-start font-medium">{m.email}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {m.disabled && <Badge tone="danger">{t('admin.team.disabled')}</Badge>}
                {m.must_change_password && <Badge tone="outline">{t('admin.team.temporary')}</Badge>}
                {m.is_platform_admin && <Badge tone="outline">{t('admin.badge')}</Badge>}
                <span className="text-xs text-muted">{t('admin.team.lastSignIn')} <span dir="ltr">{formatDateTime(m.last_sign_in_at, i18n.language)}</span></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select label={t('admin.account.role')} hideLabel className="w-36" value={m.role} disabled={act.isPending}
                onChange={(e) => act.mutate({ kind: 'role', member: m, role: e.target.value as ShopRole })}
                options={[{ value: 'barber', label: t('admin.roles.barber') }, { value: 'owner', label: t('admin.roles.owner') }]} />
              {!m.is_platform_admin && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'reset', member: m })}>{t('admin.team.reset')}</Button>
                  {m.disabled
                    ? <Button size="sm" variant="secondary" onClick={() => act.mutate({ kind: 'enable', member: m })}>{t('admin.team.enable')}</Button>
                    : <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'disable', member: m })}>{t('admin.team.disable')}</Button>}
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'remove', member: m })}>{t('admin.team.remove')}</Button>
            </div>
          </li>
        ))}
      </ul>
      {act.isError && !pending && <p role="alert" className="mt-3 text-sm text-danger">{t(errorKey(act.error))}</p>}
      <Dialog open={pending !== null} onClose={() => { act.reset(); setPending(null) }} title={confirmText?.title ?? ''} description={confirmText?.body}
        footer={<>
          <Button variant="ghost" onClick={() => { act.reset(); setPending(null) }}>{t('admin.cancel')}</Button>
          <Button loading={act.isPending} onClick={() => pending && act.mutate(pending)}>{confirmText?.cta}</Button>
        </>}>
        {act.isError && <p role="alert" className="text-sm text-danger">{t(errorKey(act.error))}</p>}
      </Dialog>
      <TemporaryPasswordDialog password={password} onClose={() => setPassword(null)} />
    </Card>
  )
}
