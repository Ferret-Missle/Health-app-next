'use client'

// BYOK (bring-your-own-key) API key storage. Kept in localStorage on the device
// only — the user's third-party key is never persisted to our DB. It is sent to
// our own /api/advice per request, which forwards it to the chosen provider.

const KEY = 'health-app:byok-key'

export function getByokKey(): string {
  if (typeof window === 'undefined') return ''
  try { return window.localStorage.getItem(KEY) ?? '' } catch { return '' }
}

export function setByokKey(value: string): void {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(KEY, value)
    else window.localStorage.removeItem(KEY)
  } catch { /* ignore quota/availability errors */ }
}
