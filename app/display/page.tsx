'use client'

import { useEffect, useRef } from 'react'
import { D } from '@/lib/colors'
import type { C } from '@/lib/colors'
import type { DayData } from '@/lib/data'
import { useAuth } from '@/lib/useAuth'
import { useHealthData, LAUNCH_SYNC_DAYS } from '@/lib/useHealthData'
import { useLinkStatus } from '@/lib/useLinkStatus'

/**
 * Resident-display page for small kiosk screens (Echo Show 5: 960×480).
 *
 * Shows the weekly calorie balance (直近7日間) for the signed-in user in very
 * large type, with no scrolling and no navigation chrome. It reuses the main
 * app's auth (Firebase session via useAuth), data layer (useHealthData /
 * DayData, where d = 消費 − 摂取 with the calibrated burn) and dark palette.
 * Like the main app's launch behaviour, it pulls a light provider sync on
 * mount (only when a provider is linked) and repeats it every 30 minutes so
 * the unattended display does not go stale.
 */

const c: C = D
const DOW = ['日', '月', '火', '水', '木', '金', '土']
const REFRESH_MS = 30 * 60 * 1000

const num = (v: number) => Math.round(v).toLocaleString('ja-JP')
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v))}`
const balColor = (v: number) => (v >= 0 ? c.credit : c.debit)

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: c.surface, color: c.onSurf, textAlign: 'center', padding: 32,
      fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif',
    }}>{children}</div>
  )
}

/** One day column: diverging bar from a centre zero line (CSS only). */
function DayBar({ day, maxAbs, isLatest }: { day: DayData; maxAbs: number; isLatest: boolean }) {
  const H = 148
  const frac = Math.min(1, Math.abs(day.d) / maxAbs)
  const barH = Math.max(3, frac * (H / 2 - 4))
  const col = balColor(day.d)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div style={{
        fontSize: 17, fontWeight: 700, color: col, fontFeatureSettings: '"tnum"',
        whiteSpace: 'nowrap',
      }}>{signed(day.d)}</div>
      <div style={{ position: 'relative', width: '100%', height: H }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: H / 2, height: 2,
          background: c.outline, transform: 'translateY(-1px)',
        }} />
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          width: 34, borderRadius: 6, background: col,
          ...(day.d >= 0
            ? { bottom: H / 2 + 1, height: barH }
            : { top: H / 2 + 1, height: barH }),
        }} />
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <div style={{
          fontSize: 19, fontWeight: isLatest ? 700 : 500,
          color: isLatest ? c.onSurf : c.onSurfVar,
        }}>{DOW[day.dow]}曜</div>
        <div style={{ fontSize: 15, color: c.onSurfVar, fontFeatureSettings: '"tnum"' }}>{day.md}</div>
      </div>
    </div>
  )
}

export default function DisplayPage() {
  const { user, loading: authLoading } = useAuth()
  const { data, isMock, loading, syncing, lastSynced, sync } = useHealthData()
  const link = useLinkStatus()

  // Launch sync + periodic refresh, mirroring the main app: only when a
  // provider is linked (otherwise there is nothing to pull).
  const startedRef = useRef(false)
  useEffect(() => {
    if (!user || link.loading) return
    if (!link.google && !link.fatsecret) return
    if (!startedRef.current) {
      startedRef.current = true
      void sync(LAUNCH_SYNC_DAYS)
    }
    const t = setInterval(() => { void sync(LAUNCH_SYNC_DAYS) }, REFRESH_MS)
    return () => clearInterval(t)
  }, [user, link.loading, link.google, link.fatsecret, sync])

  if (authLoading || (user && loading)) {
    return (
      <Centered>
        <span className="ms" style={{ fontSize: 44, color: c.primary, animation: 'spin 1s linear infinite' }}>
          progress_activity
        </span>
        <div style={{ fontSize: 20, color: c.onSurfVar }}>読み込み中…</div>
      </Centered>
    )
  }

  if (!user) {
    return (
      <Centered>
        <span className="ms" style={{ fontSize: 52, color: c.primary }}>monitoring</span>
        <div style={{ fontSize: 28, fontWeight: 700 }}>週間カロリー収支</div>
        <div style={{ fontSize: 18, color: c.onSurfVar, lineHeight: 1.6 }}>
          この表示を使うには、まずメイン画面で Google サインインしてください。
        </div>
        <a href="/" style={{
          marginTop: 8, padding: '12px 28px', borderRadius: 999,
          border: `1px solid ${c.outlineVar}`, color: c.onSurf,
          fontSize: 18, fontWeight: 600,
        }}>メイン画面を開く</a>
      </Centered>
    )
  }

  const week = data.slice(-7)
  const today = week[week.length - 1]
  if (!today) {
    return (
      <Centered>
        <div style={{ fontSize: 24, fontWeight: 600 }}>表示できるデータがまだありません</div>
        <div style={{ fontSize: 17, color: c.onSurfVar }}>メイン画面でプロバイダと連携し、同期してください。</div>
      </Centered>
    )
  }

  const weekSum = week.reduce((s, x) => s + x.d, 0)
  const weekAvg = weekSum / week.length
  const maxAbs = Math.max(400, ...week.map(x => Math.abs(x.d)))
  // Unlogged days use a provisional intake for d (intakeEst); show the same
  // basis here so the displayed intake adds up with the displayed balance.
  const todayIntake = today.intakeEst ?? today.intake
  const todayIsToday = today.md === (() => {
    const j = new Date(Date.now() + 9 * 3600_000)
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`
  })()

  const syncLabel = syncing
    ? '同期中…'
    : lastSynced
      ? `最終同期 ${lastSynced.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
      : ''

  return (
    <div style={{
      height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      background: c.surface, color: c.onSurf, padding: '22px 36px 16px',
      fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flex: 'none' }}>
        <div style={{ fontSize: 30, fontWeight: 700 }}>週間カロリー収支</div>
        <div style={{ fontSize: 19, color: c.onSurfVar, fontFeatureSettings: '"tnum"' }}>
          {week[0].md}（{DOW[week[0].dow]}）– {today.md}（{DOW[today.dow]}）
        </div>
        <div style={{ flex: 1 }} />
        {isMock && (
          <div style={{
            fontSize: 14, color: c.offTrack, border: `1px solid ${c.offTrack}`,
            borderRadius: 999, padding: '3px 12px',
          }}>サンプルデータ表示中</div>
        )}
        {syncLabel && <div style={{ fontSize: 16, color: c.onSurfVar }}>{syncLabel}</div>}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', gap: 40, minHeight: 0, paddingTop: 10 }}>
        {/* Latest day */}
        <div style={{
          width: 316, flex: 'none', display: 'flex', flexDirection: 'column',
          background: c.surfLow, borderRadius: 24, padding: '18px 24px',
        }}>
          <div style={{ fontSize: 20, color: c.onSurfVar }}>
            {todayIsToday ? '今日' : `${today.md}（${DOW[today.dow]}）`} の収支
          </div>
          <div style={{
            fontSize: 92, fontWeight: 700, lineHeight: 1.1, color: balColor(today.d),
            fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
          }}>{signed(today.d)}</div>
          <div style={{ fontSize: 17, color: c.onSurfVar, marginTop: -4 }}>kcal（消費 − 摂取）</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 19, color: c.onSurfVar }}>摂取{today.intakeEst ? '（推定）' : ''}</span>
              <span style={{ fontSize: 34, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                {num(todayIntake)}<span style={{ fontSize: 17, color: c.onSurfVar, fontWeight: 500 }}> kcal</span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 19, color: c.onSurfVar }}>消費</span>
              <span style={{ fontSize: 34, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                {num(today.burn)}<span style={{ fontSize: 17, color: c.onSurfVar, fontWeight: 500 }}> kcal</span>
              </span>
            </div>
          </div>
        </div>

        {/* Week */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <div style={{ fontSize: 20, color: c.onSurfVar }}>直近{week.length}日間の合計</div>
            <div style={{
              fontSize: 58, fontWeight: 700, lineHeight: 1.1, color: balColor(weekSum),
              fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap',
            }}>{signed(weekSum)}<span style={{ fontSize: 22, color: c.onSurfVar, fontWeight: 500 }}> kcal</span></div>
            <div style={{ fontSize: 18, color: c.onSurfVar, fontFeatureSettings: '"tnum"' }}>
              （1日平均 {signed(weekAvg)}）
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 10, paddingTop: 8 }}>
            {week.map((day, i) => (
              <DayBar key={day.dt.getTime()} day={day} maxAbs={maxAbs} isLatest={i === week.length - 1} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ flex: 'none', fontSize: 14, color: c.onSurfVar, paddingTop: 8 }}>
        収支がプラスの日は黒字（カロリーを削減できた日）、マイナスは赤字（オーバーした日）です。
      </div>
    </div>
  )
}
