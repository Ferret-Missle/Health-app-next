'use client'

import { useState } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { L, D } from '@/lib/colors'
import type { C } from '@/lib/colors'
import { movingAvg } from '@/lib/data'
import { useHealthData } from '@/lib/useHealthData'
import { useAuth } from '@/lib/useAuth'
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
    gran: 'daily', view: 'cumulative', range: 30,
    tgtW: 72.0, days: 86, llm: 'groq',
    balOff: 0, grpOff: 0, calOff: 0, pfcOff: 0,
  })

  const { data: DATA, syncing, lastSynced, sync } = useHealthData()
  const { logout } = useAuth()

  const set: Updater = (patch) => setS(prev => ({ ...prev, ...patch }))

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
  const dailyTarget = s.days > 0 ? Math.max(0, (curW - s.tgtW) * 7200 / s.days) : 0
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
  const kVal  = slope !== 0 && Number.isFinite(slope) ? Math.round(-1 / slope / 50) * 50 : 7200

  const tabTitle = { home: 'ホーム', balance: '収支', forecast: '予実', settings: '設定' }[s.tab]
  const backdrop = s.dark ? '#05140f' : '#c4cfc8'

  const props: TabProps = { s, set, c, data: DATA, dailyTarget, curW, startW, remainKg, pct, onTrack, today, kVal }

  const syncLabel = lastSynced
    ? `最終同期 ${lastSynced.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
    : '未同期'

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
