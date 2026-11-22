import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ErrorState, LoadingState } from '../../components/ui'
import { adminApi, adminKeys } from '../../features/admin/api'
import { ShopQrPoster } from '../../features/shops/ShopQrPoster'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/** /admin/shops/:shopId/qr — the same poster the shop sees, for the SAFF team to print. */
export function AdminShopQrPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('qr.title'))
  const { shopId = '' } = useParams()
  const shop = useQuery({ queryKey: adminKeys.shop(shopId), queryFn: () => adminApi.getShop(shopId) })
  if (shop.isPending) return <LoadingState />
  if (shop.isError) return <ErrorState onRetry={() => void shop.refetch()} />
  return <ShopQrPoster shop={shop.data} />
}
