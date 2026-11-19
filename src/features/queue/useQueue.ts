import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { getSupabase } from '../../lib/supabase'
import { callRpc, fetchActiveTickets, fetchGracePeriod, fetchLatestSession, fetchStats, type BarberRpc } from './api'

/** Polling fallback when Realtime is unavailable (TD issue 4). */
export const POLL_INTERVAL_MS = 20_000

export const queueKeys = {
  all: (shopId: string) => ['queue', shopId] as const,
  session: (shopId: string) => ['queue', shopId, 'session'] as const,
  tickets: (shopId: string, sessionId: string) => ['queue', shopId, 'tickets', sessionId] as const,
  stats: (shopId: string, sessionId: string) => ['queue', shopId, 'stats', sessionId] as const,
  grace: (shopId: string) => ['queue', shopId, 'grace'] as const,
}

export function useLatestSession(shopId: string) {
  return useQuery({ queryKey: queueKeys.session(shopId), queryFn: () => fetchLatestSession(shopId), refetchInterval: POLL_INTERVAL_MS })
}

export function useActiveTickets(shopId: string, sessionId: string | undefined) {
  return useQuery({
    queryKey: queueKeys.tickets(shopId, sessionId ?? ''),
    queryFn: () => fetchActiveTickets(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: POLL_INTERVAL_MS,
  })
}

export function useQueueStats(shopId: string, sessionId: string | undefined) {
  return useQuery({
    queryKey: queueKeys.stats(shopId, sessionId ?? ''),
    queryFn: () => fetchStats(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: POLL_INTERVAL_MS,
  })
}

export function useGracePeriod(shopId: string) {
  return useQuery({ queryKey: queueKeys.grace(shopId), queryFn: () => fetchGracePeriod(shopId), staleTime: 60_000 })
}

/**
 * Realtime: the database broadcasts only {v} on channel qs:<session> after each committed change
 * (TD §2 decision 5). On any ping we refetch authoritative state; no data travels over Realtime.
 */
export function useQueueRealtime(shopId: string, sessionId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!sessionId) return
    const supabase = getSupabase()
    const refetch = () => void queryClient.invalidateQueries({ queryKey: queueKeys.all(shopId) })
    const channel = supabase
      .channel(`qs:${sessionId}`)
      .on('broadcast', { event: 'queue_changed' }, refetch)
      // Changes committed between the first fetch and the subscription would otherwise wait for
      // the next poll: refetch once whenever the channel (re)connects.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, shopId, sessionId])
}

/** Runs a queue action; always refetches afterwards so the screen reflects the database. */
export function useQueueAction(shopId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, args }: { name: BarberRpc; args: Record<string, unknown> }) => callRpc(name, args as never),
    // Success or failure, the authoritative state may have changed (e.g. invalid_transition means
    // someone else acted first), so always refetch.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queueKeys.all(shopId) })
    },
  })
}

/** Current time, refreshed periodically (for "called N min ago" and grace countdowns). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
