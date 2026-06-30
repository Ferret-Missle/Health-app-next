import type { DayData } from './data'
import type { C } from './colors'

export type Tab = 'home' | 'balance' | 'forecast' | 'settings'

export interface State {
  tab:      Tab
  dark:     boolean
  view:     'cumulative' | 'daily'
  range:    number       // 7 | 30 | 0 (all)
  tgtW:     number
  tgtDate:  string       // goal date 'YYYY-MM-DD'; days-left is derived from it
  llm:      'groq' | 'byok'
  balOff:   number
  grpOff:   number
  calOff:   number
  pfcOff:   number
  wRange:   number       // weight chart window: 30 | 90 | 0 (all)
  wOff:     number       // weight chart period offset (0 = latest)
  tRange:   number       // trajectory window: 7 | 30 | 90 | 0 (all)
  kRange:   number       // weight×cum-balance (k) window: 10 | 30 | 0 (all)
}

export type Updater = (patch: Partial<State>) => void

export interface TabProps {
  s:           State
  set:         Updater
  c:           C
  data:        DayData[]
  daysLeft:    number     // derived: max(1, target_date − today JST)
  dailyTarget: number
  curW:        number
  startW:      number
  remainKg:    number
  pct:         number
  onTrack:     boolean
  today:       DayData
  kVal:        number
  kInfo:       { calibrated: boolean; daysShort: number; spanShort: number; outOfRange: boolean }
  syncing:     boolean
  lastSynced:  Date | null
  sync:        (days?: number) => Promise<void>
  weeklyAdvice: string | null   // FR-4.4: this week's auto-generated advice, if any
  userEmail:   string | null    // signed-in user's email (shown on the home header)
}
