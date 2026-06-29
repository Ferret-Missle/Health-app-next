'use client'

import { useEffect, useState } from 'react'
import { authFetch } from './authFetch'

export interface LinkStatus {
  google:    boolean
  fatsecret: boolean
  loading:   boolean
}

/**
 * Which external providers are linked for the current user. Backed by
 * /api/auth/status (scoped server-side to the signed-in uid). `reloadKey` lets a
 * caller force a refetch (e.g. after returning from an OAuth link flow).
 */
export function useLinkStatus(reloadKey: unknown = 0): LinkStatus {
  const [status, setStatus] = useState<LinkStatus>({ google: false, fatsecret: false, loading: true })

  useEffect(() => {
    let cancelled = false
    authFetch('/api/auth/status', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { google: false, fatsecret: false })
      .then((d: { google: boolean; fatsecret: boolean }) => {
        if (!cancelled) setStatus({ google: !!d.google, fatsecret: !!d.fatsecret, loading: false })
      })
      .catch(() => { if (!cancelled) setStatus(s => ({ ...s, loading: false })) })
    return () => { cancelled = true }
  }, [reloadKey])

  return status
}
