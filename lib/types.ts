import type { DayData } from './data'
import type { C } from './colors'

export type Tab = 'home' | 'balance' | 'forecast' | 'settings'

export interface State {
  tab:      Tab
  dark:     boolean
  gran:     'daily' | 'weekly'
  view:     'cumulative' | 'daily'
  range:    number       // 7 | 30 | 0 (all)
  tgtW:     number
  days:     number
  llm:      'groq' | 'byok'
  balOff:   number
  grpOff:   number
  calOff:   number
  pfcOff:   number
}

export type Updater = (patch: Partial<State>) => void

export interface TabProps {
  s:           State
  set:         Updater
  c:           C
  data:        DayData[]
  dailyTarget: number
  curW:        number
  startW:      number
  remainKg:    number
  pct:         number
  onTrack:     boolean
  today:       DayData
  kVal:        number
}
