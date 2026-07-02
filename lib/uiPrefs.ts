'use client'

// Per-user UI preferences (period-switch selections), persisted in localStorage
// keyed by Firebase uid so each account keeps its own choices on this device.
// (Not synced across devices — that would need a DB column; see useSettings for
// the server-persisted goal settings.)

export interface UiPrefs {
  range?:  number                       // balance window: 7 | 30 | 0
  view?:   'cumulative' | 'daily'       // balance view
  wRange?: number                       // weight-trend window: 30 | 90 | 0
  tRange?: number                       // trajectory window: 7 | 30 | 90 | 0
}

const keyFor = (uid: string) => `hp:prefs:${uid}`

export function loadUiPrefs(uid: string): UiPrefs {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(keyFor(uid)) || '{}') as UiPrefs
  } catch {
    return {}
  }
}

export function saveUiPrefs(uid: string, prefs: UiPrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(prefs))
  } catch {
    /* quota / private mode — ignore */
  }
}
