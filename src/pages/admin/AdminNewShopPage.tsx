import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button, Card, Input, Select } from '../../components/ui'
import { AdminError, adminApi, PHONE_PATTERN, slugify, SLUG_PATTERN } from '../../features/admin/api'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** /admin/shops/new — create a shop. Its link (/s/<slug>) is permanent: it is printed on the QR poster. */
export function AdminNewShopPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('admin.newShop.title'))
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [locale, setLocale] = useState('fr')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)

  const effectiveSlug = slugEdited ? slug : slugify(name)
  const nameError = name.trim().length < 2 || name.trim().length > 80
  const slugError = !SLUG_PATTERN.test(effectiveSlug) || effectiveSlug.length < 3 || effectiveSlug.length > 60
  const phoneError = phone.trim() !== '' && !PHONE_PATTERN.test(phone.trim())

  const create = useMutation({
    mutationFn: () => adminApi.createShop({ name, slug: effectiveSlug, defaultLocale: locale, address, phone }),
    onSuccess: async ({ shop_id }) => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      navigate(`/admin/shops/${shop_id}`, { replace: true })
    },
  })
  const serverCode = create.error instanceof AdminError ? create.error.code : create.isError ? 'generic' : null

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!nameError && !slugError && !phoneError) create.mutate()
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <h1 className="text-xl font-bold">{t('admin.newShop.title')}</h1>
      <Card padding="lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <Input label={t('admin.shop.name')} name="name" required value={name} maxLength={80}
            onChange={(e) => setName(e.target.value)} error={touched && nameError ? t('admin.shop.nameInvalid') : undefined} />
          <Input label={t('admin.newShop.slug')} name="slug" dir="ltr" required value={effectiveSlug} maxLength={60}
            hint={t('admin.newShop.slugHint', { slug: effectiveSlug || '…' })}
            onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase()) }}
            error={serverCode === 'slug_taken' ? t('admin.errors.slug_taken') : touched && slugError ? t('admin.newShop.slugInvalid') : undefined} />
          <Select label={t('admin.shop.language')} name="locale" value={locale} onChange={(e) => setLocale(e.target.value)}
            options={[{ value: 'fr', label: 'Français' }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          <Input label={t('admin.shop.address')} name="address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
          <Input label={t('admin.shop.phone')} name="phone" type="tel" dir="ltr" placeholder="+212522000000" value={phone}
            onChange={(e) => setPhone(e.target.value)} error={touched && phoneError ? t('admin.shop.phoneInvalid') : undefined} />
          <p className="text-sm text-muted">{t('admin.newShop.timezone')}</p>
          {serverCode && serverCode !== 'slug_taken' && <p role="alert" className="text-sm text-danger">{t(`admin.errors.${serverCode}`)}</p>}
          <Button type="submit" loading={create.isPending}>{t('admin.newShop.submit')}</Button>
        </form>
      </Card>
    </div>
  )
}
