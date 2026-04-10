'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/useAuth'

export interface AuthGuardProps {
  children: React.ReactNode
  /** When set, requires the user to have this role (currently 'admin'). */
  role?: 'admin'
}

/**
 * Client-side gate. Redirects to /login if unauthenticated, or to / if a
 * required role isn't satisfied. While loading, renders nothing — this matches
 * the old `body { visibility: hidden }` trick on the admin page.
 */
export function AuthGuard({ children, role }: AuthGuardProps) {
  const { user, authenticated, loading, error } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (error || !authenticated) {
      router.replace('/login')
      return
    }
    if (role && user?.role !== role) {
      router.replace('/')
    }
  }, [loading, authenticated, error, role, user, router])

  if (loading || !authenticated || (role && user?.role !== role)) {
    // Dark placeholder while auth resolves — prevents white flash
    return <div className="min-h-screen bg-[#0a0a0a]" />
  }
  return <>{children}</>
}
