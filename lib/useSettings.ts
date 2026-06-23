import { useEffect, useRef, useCallback } from 'react'
import { authFetch } from './authFetch'

export interface GoalSettings {
  tgtW:    number
  tgtDate: string
  llm:     'groq' | 'byok'
}

/**
 * Loads persisted goal settings once on mount (applied via onLoad), then saves
 * changes back to /api/settings, debounced to avoid a write per slider tick.
 */
export function useSettings(
  current: GoalSettings,
  onLoad: (s: GoalSettings) => void,
) {
  const loaded = useRef(false)
  const timer  = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Initial load.
  useEffect(() => {
    authFetch('/api/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: GoalSettings) => { loaded.current = true; onLoad(d) })
      .catch(() => { loaded.current = true })
    // onLoad is stable enough for a one-shot mount load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback((s: GoalSettings) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void authFetch('/api/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(s),
      }).catch(() => {})
    }, 600)
  }, [])

  // Persist on change, but not until after the initial load has applied
  // (otherwise the default state would overwrite the stored values).
  useEffect(() => {
    if (!loaded.current) return
    save(current)
  }, [current.tgtW, current.tgtDate, current.llm, save])
}
