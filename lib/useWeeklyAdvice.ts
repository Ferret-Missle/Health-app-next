import { useEffect, useRef, useState } from 'react'
import { authFetch } from './authFetch'
import { getByokKey } from './byok'

// FR-4.4 client side: on launch, ping the weekly auto-run once. The server runs
// it at most once per week (catch-up if Sunday was missed). We surface the
// resulting advice so the home tab can show "今週の自動アドバイス".

export interface WeeklyAdvice {
  advice:    string | null
  ran:       boolean        // true if this launch actually generated it
  weekStart: string | null
  skipped:   string | null  // reason when not run (e.g. quota_exhausted)
}

interface Args {
  tgtW:     number
  days:     number
  k:        number
  provider: 'groq' | 'byok'
  ready:    boolean   // wait until goal/settings are loaded before firing
}

export function useWeeklyAdvice(args: Args): WeeklyAdvice {
  const [state, setState] = useState<WeeklyAdvice>({ advice: null, ran: false, weekStart: null, skipped: null })
  const fired = useRef(false)

  useEffect(() => {
    if (!args.ready || fired.current) return
    fired.current = true // run exactly once per app session

    const apiKey = args.provider === 'byok' ? getByokKey() : undefined
    // BYOK with no key can't run server-side; let the manual button handle it.
    if (args.provider === 'byok' && !apiKey) return

    authFetch('/api/advice/weekly', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tgtW: args.tgtW, days: args.days, k: args.k, provider: args.provider, apiKey }),
    })
      .then(r => r.json())
      .then((d: { ran?: boolean; advice?: string; weekStart?: string; reason?: string }) => {
        setState({
          advice:    d.advice ?? null,
          ran:       d.ran ?? false,
          weekStart: d.weekStart ?? null,
          skipped:   d.ran === false && d.reason !== 'already_done' ? (d.reason ?? null) : null,
        })
      })
      .catch(() => {})
  }, [args.ready, args.provider, args.tgtW, args.days, args.k])

  return state
}
