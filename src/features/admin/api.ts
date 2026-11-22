import { callFunction } from '../../lib/functions'
import { getSupabase } from '../../lib/supabase'
import { toRpcError } from '../queue/errors'
import type { ShopRole } from '../shops/useMemberships'

/** Error codes the admin RPCs and the admin-users function return (translated under admin.errors). */
export const ADMIN_ERROR_CODES = [
  'not_authorized', 'shop_not_found', 'slug_taken', 'invalid_input', 'member_not_found', 'already_member',
  'email_taken', 'forbidden_target', 'user_not_found', 'invalid_request', 'network',
] as const
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number] | 'generic'

export class AdminError extends Error {
  readonly code: AdminErrorCode
  constructor(code: string) {
    super(code)
    this.code = (ADMIN_ERROR_CODES as readonly string[]).includes(code) ? (code as AdminErrorCode) : 'generic'
  }
}

export interface AdminStatus { is_admin: boolean; aal: string }

export interface AdminShopRow {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  members: number
  queue_today: 'open' | 'paused' | 'finished' | null
  tickets_today: number
}

export interface AdminMember {
  user_id: string
  email: string
  role: ShopRole
  added_at: string
  last_sign_in_at: string | null
  disabled: boolean
  must_change_password: boolean
  is_platform_admin: boolean
}

export interface AdminShop {
  id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  timezone: string
  default_locale: 'fr' | 'ar' | 'en'
  is_active: boolean
  created_at: string
  members: AdminMember[]
}

export interface AdminAction {
  created_at: string
  action: string
  details: Record<string, unknown>
  shop_id: string | null
  shop_name: string | null
  actor_email: string | null
  target_email: string | null
}

export interface AdminOverview {
  shops_total: number
  shops_active: number
  queues_live: number
  tickets_today: number
  health: {
    outbox: { pending_overdue: number; sending_stuck: number; sent_24h: number; failed_24h: number; dispatch_configured: boolean }
    queues: { live: number; stale: number }
    retention: { overdue_anonymisation: number }
    jobs: Record<string, { active: boolean; last_status: string | null; failures_24h: number }>
  }
  recent_actions: AdminAction[]
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  // The admin RPCs are typed in database.types.ts but return jsonb; the shapes above document them.
  const { data, error } = await getSupabase().rpc(name as never, args as never)
  if (error) {
    const rpcError = toRpcError(error)
    throw new AdminError(rpcError.code === 'network' ? 'network' : error.message)
  }
  return data as T
}

async function fn<T>(body: Record<string, unknown>): Promise<T> {
  try {
    return await callFunction<T>('admin-users', body)
  } catch (e) {
    throw new AdminError((e as { code?: string }).code ?? 'generic')
  }
}

export const adminApi = {
  status: () => rpc<AdminStatus>('admin_status'),
  overview: () => rpc<AdminOverview>('admin_overview'),
  listShops: () => rpc<AdminShopRow[]>('admin_list_shops'),
  getShop: (shopId: string) => rpc<AdminShop>('admin_get_shop', { p_shop_id: shopId }),
  createShop: (input: { name: string; slug: string; defaultLocale: string; address: string; phone: string }) =>
    rpc<{ shop_id: string }>('admin_create_shop', {
      p_name: input.name, p_slug: input.slug, p_timezone: 'Africa/Casablanca', p_default_locale: input.defaultLocale,
      p_address: input.address, p_phone: input.phone,
    }),
  updateShop: (shopId: string, input: { name: string; defaultLocale: string; address: string; phone: string }) =>
    rpc('admin_update_shop', { p_shop_id: shopId, p_name: input.name, p_default_locale: input.defaultLocale, p_address: input.address, p_phone: input.phone }),
  setShopActive: (shopId: string, active: boolean) => rpc('admin_set_shop_active', { p_shop_id: shopId, p_active: active }),
  setMemberRole: (shopId: string, userId: string, role: ShopRole) =>
    rpc('admin_set_member_role', { p_shop_id: shopId, p_user_id: userId, p_role: role }),
  removeMember: (shopId: string, userId: string) => rpc('admin_remove_member', { p_shop_id: shopId, p_user_id: userId }),
  createAccount: (shopId: string, email: string, role: ShopRole) =>
    fn<{ result: 'created' | 'added_existing'; temporary_password?: string }>({ action: 'create_account', shop_id: shopId, email, role }),
  resetPassword: (userId: string) => fn<{ temporary_password: string }>({ action: 'reset_password', user_id: userId }),
  setDisabled: (userId: string, disabled: boolean) => fn({ action: 'set_disabled', user_id: userId, disabled }),
}

export const adminKeys = {
  status: (token: string | undefined) => ['admin', 'status', token] as const,
  overview: ['admin', 'overview'] as const,
  shops: ['admin', 'shops'] as const,
  shop: (id: string) => ['admin', 'shop', id] as const,
}

/** URL-safe link from a shop name ("Salon Atlas" → "salon-atlas"); same rule as the shops.slug CHECK. */
export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Same rule as the shops.phone CHECK. */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/
