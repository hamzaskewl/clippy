'use client'

import useSWR from 'swr'
import type { AuthMe } from './types'
import { swrFetcher } from './api'

/** Read-once auth check. Returns user, loading, and authenticated. */
export function useAuth() {
  const { data, error, isLoading, mutate } = useSWR<AuthMe>('/auth/me', swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  return {
    user: data?.user,
    authenticated: data?.authenticated ?? false,
    loading: isLoading,
    error,
    mutate,
  }
}
