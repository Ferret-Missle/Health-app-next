'use client'

import { useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { L, D } from '@/lib/colors'
import type { C } from '@/lib/colors'
import { movingAvg, daysUntil } from '@/lib/data'
import { useHealthData } from '@/lib/useHealthData'
import { useAuth } from '@/lib/useAuth'
import { useSettings } from '@/lib/useSettings'
import { useWeeklyAdvice } from '@/lib/useWeeklyAdvice'
import type { Tab, State, Updater, TabProps } from '@/lib/types'
import HomeTab from '@/components/HomeTab'
import BalanceTab from '@/components/BalanceTab'
import ForecastTab from '@/components/ForecastTab'
import SettingsTab from '@/components/SettingsTab'
import AuthGate from '@/components/AuthGate'

const NAV = [
  { key: 'home'     as Tab, icon: 'home',       label: 'ホーム' },
  { key: 'balance'  as Tab, icon: 'monitoring',  label: '収支'   },
  { key: 'forecast' as Tab, icon: 'flag',        label: '予実'   },
  { key: 'settings' as Tab, icon: 'settings',    label: '設定'   },
]

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  )
}

function AppInner() {
  const [s, setS] = useState<State>({
    tab: 'home', dark: false,
    view: 'cumulative', range: 30,
    tgtW: 72.0, tgtDate: '', llm: 'groq',
    balOff: 0, grpOff: 0, calOff: 0, pfcOff: 0,
    wRange: 90, wOff: 0,
  })

  const { data: DATA, syncing, progress, lastSynced, sync } = useHealthData()
  const { logout } = useAuth()
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const set: Updater = (patch) => setS(prev => ({ ...prev, ...patch }))

  // Persist goal settings to the cloud; load stored values on mount.
  useSettings(
    { tgtW: s.tgtW, tgtDate: s.tgtDate, llm: s.llm },
    loaded => { set({ tgtW: loaded.tgtW, tgtDate: loaded.tgtDate, llm: loaded.llm }); setSettingsLoaded(true) },
  )

  // Days remaining is DERIVED from the goal date, so it counts down over time
  // and keeps the balance-target line correct. Falls back to a sane horizon
  // before settings load (tgtDate is still '').
  const daysLeft = s.tgtDate ? daysUntil(s.tgtDate) : 86

  const c: C = s.dark ? D : L

  const theme = createTheme({
    palette: { mode: s.dark ? 'dark' : 'light' },
    typography: { fontFamily: 'Roboto, "Noto Sans JP", system-ui, sans-serif' },
  })

  const handleSync = () => { void sync() }

  // Only days with a measured weight feed the weight-based stats (others are 0).
  const weighed     = DATA.filter(x => x.w > 0)
  const smoothW     = movingAvg(weighed.map(x => x.w), 7)
  const curW        = smoothW.length ? Math.round(smoothW[smoothW.length - 1] * 10) / 10 : 0
  const startW      = smoothW.length ? Math.round(smoothW[0] * 10) / 10 : 0
  const remainKg    = Math.max(0, curW - s.tgtW)
  const pct         = Math.min(100, Math.max(0, (startW - curW) / ((startW - s.tgtW) || 1) * 100))
  const dailyTarget = daysLeft > 0 ? Math.max(0, (curW - s.tgtW) * 7200 / daysLeft) : 0
  const today       = DATA[DATA.length - 1]
  const onTrack     = today.d >= dailyTarget * 0.8

  const xs = weighed.map(x => x.cum)
  const ys = weighed.map(x => x.w)
  const n  = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  const slope = num / (den || 1)

  // Personal coefficient k (kcal per kg). Calibrate from the regression only once
  // there's enough signal (≥3 weeks span, ≥10 weighed days) AND the result is
  // physiologically plausible (~7,200 ± band). Otherwise fall back to the default
  // 7,200 — sparse/early data produces wild slopes (e.g. k≈62,000). (§5.2)
  const MIN_DAYS = 10, MIN_SPAN = 21
  const spanDays = n >= 2 ? (weighed[n - 1].dt.getTime() - weighed[0].dt.getTime()) / 86400000 : 0
  const rawK     = slope !== 0 && Number.isFinite(slope) ? -1 / slope : 0
  const calibrated = n >= MIN_DAYS && spanDays >= MIN_SPAN && rawK >= 4000 && rawK <= 12000
  const kVal = calibrated ? Math.round(rawK / 50) * 50 : 7200

  // How much more weight data is needed before k can calibrate (for the UI hint).
  const kInfo = {
    calibrated,
    daysShort: Math.max(0, MIN_DAYS - n),                  // more measured days needed
    spanShort: Math.max(0, Math.ceil(MIN_SPAN - spanDays)), // more calendar days of span needed
    outOfRange: n >= MIN_DAYS && spanDays >= MIN_SPAN && (rawK < 4000 || rawK > 12000),
  }

  // FR-4.4: on launch, run this week's auto-advice once (catch-up if Sunday was
  // missed). Wait until goal settings are loaded so we pass the real target.
  const { advice: weeklyAdvice } = useWeeklyAdvice({
    tgtW: s.tgtW, days: daysLeft, k: kVal, provider: s.llm, ready: settingsLoaded,
  })

  const tabTitle = { home: 'ホーム', balance: '収支', forecast: '予実', settings: '設定' }[s.tab]
  const backdrop = s.dark ? '#05140f' : '#c4cfc8'

  const props: TabProps = { s, set, c, data: DATA, daysLeft, dailyTarget, curW, startW, remainKg, pct, onTrack, today, kVal, kInfo, syncing, lastSynced, sync, weeklyAdvice }

  const syncLabel = (() => {
    if (!lastSynced) return '未同期'
    const now = new Date()
    const sameDay = lastSynced.toDateString() === now.toDateString()
    const time = lastSynced.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return `最終同期 ${time}`
    const date = lastSynced.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    return `最終同期 ${date} ${time}`
  })()

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{
        minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        background: backdrop, padding: '22px 12px',
        fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif',
        transition: 'background .3s',
      }}>
        <div style={{
          width: 412, maxWidth: '100%', height: 868,
          background: c.surface, color: c.onSurf,
          borderRadius: 34, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 18px 50px rgba(0,0,0,.32),0 0 0 1px rgba(0,0,0,.04)',
          position: 'relative',
        }}>

          {/* Top App Bar */}
          <div style={{
            flex: 'none', height: 60, display: 'flex', alignItems: 'center',
            gap: 4, padding: '0 8px 0 18px',
            background: c.surface, position: 'relative', zIndex: 5,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 500, lineHeight: '26px', color: c.onSurf }}>{tabTitle}</div>
              <div style={{ fontSize: 11, color: c.onSurfVar, lineHeight: '14px', marginTop: 1 }}>{syncLabel}</div>
            </div>
            <button type="button" onClick={handleSync} title="同期" style={{
              width: 44, height: 44, border: 'none', background: 'none',
              borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: c.onSurfVar,
            }}>
              <span className="ms" style={{
                fontSize: 22, display: 'inline-block',
                animation: syncing ? 'spin 1s linear infinite' : 'none',
              }}>sync</span>
            </button>
            <button type="button" onClick={() => set({ dark: !s.dark })} title="テーマ切替" style={{
              width: 44, height: 44, border: 'none', background: 'none',
              borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: c.onSurfVar,
            }}>
              <span className="ms" style={{ fontSize: 22 }}>{s.dark ? 'light_mode' : 'dark_mode'}</span>
            </button>
            <button type="button" onClick={() => { void logout() }} title="サインアウト" style={{
              width: 44, height: 44, border: 'none', background: 'none',
              borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: c.onSurfVar,
            }}>
              <span className="ms" style={{ fontSize: 22 }}>logout</span>
            </button>
          </div>

          {/* Sync progress bar (determinate, step-based). 3px track + label row. */}
          <div style={{
            flex: 'none', height: 3, background: syncing ? c.primaryC : 'transparent',
            overflow: 'hidden', position: 'relative', zIndex: 5,
          }} role="progressbar"
            aria-valuenow={progress?.pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="同期の進捗">
            {syncing && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0,
                width: `${progress?.pct ?? 0}%`, background: c.primary,
                transition: 'width .3s ease',
              }} />
            )}
          </div>
          {syncing && progress && (
            <div style={{
              flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 16px', background: c.surface, zIndex: 5,
              fontSize: 11, color: c.onSurfVar,
            }}>
              <span>{progress.label}</span>
              <span style={{ fontFeatureSettings: '"tnum"' }}>{progress.pct}%</span>
            </div>
          )}

          {/* Scroll content */}
          <div className="scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 14px 96px' }}>
            {s.tab === 'home'     && <HomeTab     {...props} />}
            {s.tab === 'balance'  && <BalanceTab  {...props} />}
            {s.tab === 'forecast' && <ForecastTab {...props} />}
            {s.tab === 'settings' && <SettingsTab {...props} />}
          </div>

          {/* Bottom Navigation */}
          <div style={{
            flex: 'none', height: 80,
            background: c.surf, borderTop: `1px solid ${c.outlineVar}`,
            display: 'flex', alignItems: 'flex-start',
            padding: '12px 8px 0', position: 'relative', zIndex: 5,
          }}>
            {NAV.map(item => {
              const active = s.tab === item.key
              return (
                <button type="button" key={item.key} onClick={() => set({ tab: item.key })} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, background: 'none', border: 'none', padding: '2px 0',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{
                    width: 60, height: 30, borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? c.secondaryC : 'transparent',
                    transition: 'background .2s',
                  }}>
                    <span className="ms" style={{
                      fontSize: 23,
                      color: active ? c.onSecC : c.onSurfVar,
                      fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                    }}>{item.icon}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? c.onSurf : c.onSurfVar }}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>

        </div>
      </div>
    </ThemeProvider>
  )
}
