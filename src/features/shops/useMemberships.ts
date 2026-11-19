import { useQuery } from '@tanstack/react-query'
import type { Database } from '../../lib/database.types'
import { getSupabase } from '../../lib/supabase'
import { useAuth } from '../auth/authContext'

export type ShopRole = Database['public']['Enums']['shop_role']

export interface Membership {
  role: ShopRole
  shop: { id: string; name: string; slug: string; timezone: string }
}

/** The signed-in user's shops. RLS returns only their own membership rows. */
export function useMemberships() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await getSupabase()
        .from('shop_members')
        .select('role, shop:shops!inner(id, name, slug, timezone)')
        .eq('user_id', userId!)
      if (error) throw error
      return (data ?? []).sort((a, b) => a.shop.name.localeCompare(b.shop.name))
    },
  })
}

export function useMembership(shopId: string | undefined) {
  const query = useMemberships()
  return { ...query, membership: query.data?.find((m) => m.shop.id === shopId) }
}
