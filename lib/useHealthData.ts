import { useState, useEffect, useCallback, useRef } from 'react'
import { DATA, rowsToDayData, type DayData, type DailyRow } from './data'
import { authFetch } from './authFetch'

interface HealthData {
  data:       DayData[]   // real DB data, or seed mock as fallback
  isMock:     boolean     // true while showing seed data (DB empty / fetch failed)
  loading:    boolean     // initial fetch in flight
  syncing:    boolean     // a provider sync is in flight
  lastSynced: Date | null // when the last successful sync completed
  error:      string | null
  sync:       (days?: number) => Promise<void>
}

async function fetchData(days: number): Promise<DayData[]> {
  const res = await authFetch(`/api/health/data?days=${days}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`data fetch failed: ${res.status}`)
  const { rows } = await res.json() as { rows: DailyRow[] }
  return rowsToDayData(rows)
}

/**
 * Loads health data from the DB on mount and exposes a sync() that pulls fresh
 * data from the providers (Google Health / FatSecret) then re-reads the DB.
 * Falls back to the seed mock DATA when the DB has no rows yet.
 */
export function useHealthData(days = 120): HealthData {
  const [data, setData]             = useState<DayData[]>(DATA)
  const [isMock, setIsMock]         = useState(true)
  const [loading, setLoading]       = useState(true)
  const [syncing, setSyncing]       = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const syncingRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const rows = await fetchData(days)
      if (rows.length > 0) {
        setData(rows)
        setIsMock(false)
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [days])

  const sync = useCallback(async (n = days) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const res = await authFetch('/api/health/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ days: n }),
      })
      if (!res.ok) throw new Error(`sync failed: ${res.status}`)
      await load()
      setLastSynced(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [days, load])

  // Initial load on mount.
  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  return { data, isMock, loading, syncing, lastSynced, error, sync }
}
