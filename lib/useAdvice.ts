import { useState, useEffect, useCallback } from 'react'
import { authFetch } from './authFetch'

export interface QuotaInfo {
  remaining:      number
  exhausted:      boolean
  tokensUsed:     number
  avgPerQuestion: number
  remainingRpd:   number | null
}

export type AdviceStatus = 'idle' | 'loading' | 'done' | 'error' | 'exhausted'

interface AdviceArgs {
  tgtW:     number
  days:     number
  k:        number
  provider: 'groq' | 'byok'
  apiKey?:  string
}

interface UseAdvice {
  status: AdviceStatus
  advice: string | null
  quota:  QuotaInfo | null
  error:  string | null
  ask:    (args: AdviceArgs) => Promise<void>
}

export function useAdvice(): UseAdvice {
  const [status, setStatus] = useState<AdviceStatus>('idle')
  const [advice, setAdvice] = useState<string | null>(null)
  const [quota, setQuota]   = useState<QuotaInfo | null>(null)
  const [error, setError]   = useState<string | null>(null)

  // Fetch the quota estimate on mount so the button can show "本日あと約N回".
  useEffect(() => {
    authFetch('/api/advice', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { quota?: QuotaInfo }) => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const ask = useCallback(async (args: AdviceArgs) => {
    setStatus('loading')
    setError(null)
    try {
      const res = await authFetch('/api/advice', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(args),
      })
      const data = await res.json() as {
        ok: boolean; advice?: string; quota?: QuotaInfo; reason?: string; message?: string
      }
      if (data.quota) setQuota(data.quota)

      if (!res.ok || !data.ok) {
        if (data.reason === 'quota_exhausted' || res.status === 429) {
          setStatus('exhausted')
          return
        }
        setError(data.message || data.reason || `エラー (${res.status})`)
        setStatus('error')
        return
      }

      setAdvice(data.advice ?? '')
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [])

  return { status, advice, quota, error, ask }
}
