import { useState, useEffect, useCallback, useRef } from 'react'
import { DATA, rowsToDayData, type DayData, type DailyRow } from './data'
import { authFetch } from './authFetch'

// Sync scopes. Launch is the lightest (just catch up the last few days); the
// manual sync button pulls a slightly wider recent window; linking and the
// settings "全期間同期" button pull the full history (capped at 365 in the
// route, which is also the display-window ceiling).
export const LAUNCH_SYNC_DAYS = 3
export const RECENT_SYNC_DAYS = 7
export const FULL_SYNC_DAYS = 365

export interface SyncProgress {
  pct:   number   // 0–100
  label: string   // current step description
  days:  number   // how many days this sync is pulling (for the UI label)
}

interface HealthData {
  data:       DayData[]   // real DB data, or seed mock as fallback
  isMock:     boolean     // true while showing seed data (DB empty / fetch failed)
  loading:    boolean     // initial fetch in flight
  syncing:    boolean     // a provider sync is in flight
  progress:   SyncProgress | null  // live step progress during a sync
  lastSynced: Date | null // when the last successful sync completed
  error:      string | null
  sync:       (days?: number) => Promise<void>
}

async function fetchData(days: number): Promise<{ data: DayData[]; lastSynced: Date | null }> {
  const res = await authFetch(`/api/health/data?days=${days}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`data fetch failed: ${res.status}`)
  const { rows, lastSynced } = await res.json() as { rows: DailyRow[]; lastSynced: string | null }
  return { data: rowsToDayData(rows), lastSynced: lastSynced ? new Date(lastSynced) : null }
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
  const [progress, setProgress]     = useState<SyncProgress | null>(null)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const syncingRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const { data: rows, lastSynced: ls } = await fetchData(days)
      if (rows.length > 0) {
        setData(rows)
        setIsMock(false)
      }
      if (ls) setLastSynced(ls)   // persisted MAX(updated_at): survives reloads
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [days])

  const sync = useCallback(async (n = days) => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    setProgress({ pct: 0, label: '同期を開始しています…', days: n })
    try {
      const res = await authFetch('/api/health/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ days: n }),
      })
      if (!res.ok || !res.body) throw new Error(`sync failed: ${res.status}`)

      // Parse the Server-Sent Events stream: each "data: {json}\n\n" is one event.
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneEvent: { errors?: string[] } | null = null

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''   // keep the trailing partial event
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          const evt = JSON.parse(line.slice(5).trim()) as {
            type: string; pct: number; label: string; errors?: string[]
          }
          setProgress({ pct: evt.pct, label: evt.label, days: n })
          if (evt.type === 'done') doneEvent = evt
        }
      }

      await load()
      setLastSynced(new Date())
      setError(doneEvent?.errors?.length ? doneEvent.errors.join(' / ') : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setProgress(null)
    }
  }, [days, load])

  // Initial load on mount.
  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  return { data, isMock, loading, syncing, progress, lastSynced, error, sync }
}
