import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { EmptyState, LoadingState } from '../../components/ui'
import { ShopQrPoster } from '../../features/shops/ShopQrPoster'
import { useMembership } from '../../features/shops/useMemberships'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** /barber/:shopId/qr — the shop's permanent QR poster (decisions D-02, D-04). */
export function ShopQrPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('qr.title'))
  const { shopId = '' } = useParams()
  const { membership, isPending } = useMembership(shopId)
  if (isPending) return <LoadingState />
  if (!membership) return <EmptyState title={t('errors.not_authorized')} />
  return <ShopQrPoster shop={membership.shop} />
}
