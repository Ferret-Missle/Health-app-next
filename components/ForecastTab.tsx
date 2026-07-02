'use client'

import type { TabProps } from '@/lib/types'
import { fx, type DayData } from '@/lib/data'
import { estimateWeightTrend, estimateAdaptiveTdee, buildTrajectory, TDEE_WINDOW_DAYS } from '@/lib/forecast'
import type { C } from '@/lib/colors'
import InfoTip from './InfoTip'

// Simple weight time-series for the selected window. Plots measured weight
// (days with w>0) as a line; the goal weight is drawn as a dashed reference.
function WeightTrendChart({ d, tgtW, c }: { d: DayData[], tgtW: number, c: C }) {
  const W = 352, H = 180, pl = 34, pr = 10, pt = 14, pb = 26
  const iw = W - pl - pr, ih = H - pt - pb
  const axisY = pt + ih

  const pts = d.map((x, i) => ({ i, w: x.w, md: x.md })).filter(p => p.w > 0)

  if (pts.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill={c.onSurfVar} fontSize={11}
          fontFamily="Roboto, sans-serif">この期間の体重データがありません</text>
      </svg>
    )
  }

  const ws   = pts.map(p => p.w)
  const ymin = Math.min(...ws, tgtW) - 0.5
  const ymax = Math.max(...ws, tgtW) + 0.5
  const n    = d.length
  const X = (i: number) => pl + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const Y = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {[ymax, (ymax + ymin) / 2, ymin].map((v, k2) => {
        const y = Y(v)
        return (
          <g key={k2}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />
            <text x={pl - 5} y={y + 3} textAnchor="end" fill={c.onSurfVar} fontSize={8.5}
              fontFamily="Roboto, sans-serif" style={{ fontFeatureSettings: '"tnum"' }}>{fx(v)}</text>
          </g>
        )
      })}
      <text x={2} y={pt - 2} textAnchor="start" fill={c.onSurfVar} fontSize={8} fontFamily="Roboto, sans-serif">kg</text>

      {/* goal reference line */}
      <line x1={pl} x2={W - pr} y1={Y(tgtW)} y2={Y(tgtW)} stroke={c.onSurfVar} strokeWidth={1.4} strokeDasharray="5 4" />
      <text x={W - pr} y={Y(tgtW) - 4} textAnchor="end" fill={c.onSurfVar} fontSize={8.5} fontFamily="Roboto, sans-serif">目標 {fx(tgtW)}</text>

      {/* measured weight line + points */}
      <polyline points={pts.map(p => `${X(p.i)},${Y(p.w)}`).join(' ')}
        fill="none" stroke={c.primary} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(p => <circle key={p.i} cx={X(p.i)} cy={Y(p.w)} r={2.8} fill={c.primary} />)}

      <line x1={pl} x2={W - pr} y1={axisY} y2={axisY} stroke={c.outlineVar} strokeWidth={1} />
      {/* first / last date ticks */}
      {[{ i: 0, md: d[0]?.md, a: 'start' as const }, { i: n - 1, md: d[n - 1]?.md, a: 'end' as const }].map((t, ti) => (
        <text key={ti} x={Math.min(Math.max(X(t.i), pl), W - pr)} y={axisY + 16}
          textAnchor={t.a} fill={c.onSurfVar} fontSize={9} fontFamily="Roboto, sans-serif"
          style={{ fontFeatureSettings: '"tnum"' }}>{t.md}</text>
      ))}
    </svg>
  )
}

// Predicted line is now a pure weight-vs-time trend extrapolation (outlier-
// cleaned, EWMA-smoothed, Theil-Sen slope) — it no longer depends on
// self-reported calorie balance. See lib/forecast.ts and docs/SPEC.md §5.2.4.
function TrajectoryChart({ d, tgtW, days, c }: { d: DayData[], tgtW: number, days: number, c: C }) {
  const W = 352, H = 214, pl = 30, pr = 12, pt = 12, pb = 36
  const iw = W - pl - pr, ih = H - pt - pb

  const trend = estimateWeightTrend(d)
  const traj  = buildTrajectory(d, trend, days)

  if (trend.n === 0 || traj.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <text x={W / 2} y={H / 2} textAnchor="middle" fill={c.onSurfVar} fontSize={11}
          fontFamily="Roboto, sans-serif">この期間の体重データがありません</text>
      </svg>
    )
  }

  const measured = trend.points.map(p => ({ i: p.i, v: p.smoothed }))
  const anchorI  = measured.length ? measured[0].i : 0
  const horizon  = traj.length
  const predVals = traj.map(p => p.value)

  const allVals = [...measured.map(m => m.v), ...predVals, tgtW]
  const ymin = Math.min(...allVals) - 0.5, ymax = Math.max(...allVals) + 0.5
  const axisY = pt + ih

  const X = (i: number) => pl + i / (horizon - 1) * iw
  const Y = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih

  const fmtD = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {[ymax, (ymax + ymin) / 2, ymin].map((v, k2) => {
        const y = Y(v)
        return (
          <g key={k2}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />
            <text x={pl - 5} y={y + 3} textAnchor="end" fill={c.onSurfVar} fontSize={9}
              fontFamily="Roboto" style={{ fontFeatureSettings: '"tnum"' }}>{fx(v)}</text>
          </g>
        )
      })}
      <line x1={X(0)} y1={Y(predVals[0])} x2={X(horizon - 1)} y2={Y(tgtW)}
        stroke={c.onSurfVar} strokeWidth={1.6} strokeDasharray="5 4" />
      <polyline points={traj.filter(p => p.i >= anchorI).map(p => `${X(p.i)},${Y(p.value)}`).join(' ')}
        fill="none" stroke={c.tertiary} strokeWidth={2} strokeDasharray="5 3" />
      <polyline points={measured.map(m => `${X(m.i)},${Y(m.v)}`).join(' ')}
        fill="none" stroke={c.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {measured.length > 0 && (
        <circle cx={X(measured[measured.length - 1].i)} cy={Y(measured[measured.length - 1].v)} r={4} fill={c.primary} />
      )}
      {/* Inline line-end labels so each line is identifiable without the legend */}
      {measured.length > 0 && (
        <text x={X(measured[measured.length - 1].i) + 6} y={Y(measured[measured.length - 1].v) + 3}
          fill={c.primary} fontSize={9} fontWeight={600} fontFamily="Roboto">実測</text>
      )}
      <text x={X(horizon - 1)} y={Y(predVals[horizon - 1]) + 11} textAnchor="end"
        fill={c.tertiary} fontSize={9} fontWeight={600} fontFamily="Roboto">予測</text>
      <line x1={X(d.length - 1)} y1={pt} x2={X(d.length - 1)} y2={axisY}
        stroke={c.primary} strokeWidth={1} strokeDasharray="2 3" opacity={0.45} />
      <line x1={pl} x2={W - pr} y1={axisY} y2={axisY} stroke={c.outlineVar} strokeWidth={1} />
      {[
        { i: 0,            label: fmtD(d[0].dt),                    a: 'start'  },
        { i: d.length - 1, label: '今日 ' + fmtD(d[d.length - 1].dt), a: 'middle' },
        { i: horizon - 1,  label: '目標 ' + fmtD(traj[horizon - 1].dt), a: 'end'    },
      ].map((t, ti) => {
        const x = X(t.i)
        return (
          <g key={ti}>
            <line x1={x} x2={x} y1={axisY} y2={axisY + 4} stroke={c.outlineVar} strokeWidth={1} />
            <text x={Math.min(Math.max(x, pl), W - pr)} y={axisY + 16}
              textAnchor={t.a as 'start' | 'middle' | 'end'} fill={c.onSurfVar} fontSize={9} fontFamily="Roboto"
              style={{ fontFeatureSettings: '"tnum"' }}>{t.label}</text>
          </g>
        )
      })}
      <text x={X(horizon - 1)} y={Y(tgtW) - 6} textAnchor="end"
        fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">目標 {fx(tgtW)}</text>
    </svg>
  )
}

function BodyCompChart({ d, dark, c }: { d: DayData[], dark: boolean, c: C }) {
  // Up to 5 evenly-spaced days that have both weight and body-fat measured.
  const measured = d.filter(x => x.w > 0 && x.bf > 0)
  const samples  = measured.length <= 5
    ? measured
    : Array.from({ length: 5 }, (_, i) => measured[Math.round(i * (measured.length - 1) / 4)])
  const W = 352, H = 150, pl = 6, pr = 6, pt = 10, pb = 22
  const iw = W - pl - pr, ih = H - pt - pb, n = samples.length
  const mx   = (Math.max(...samples.map(x => x.w)) || 1) * 1.05
  const slot  = iw / n, bw = Math.min(40, slot * 0.5)
  const Y = (v: number) => pt + ih - v / mx * ih
  const base  = pt + ih
  const lean  = dark ? '#9FD1BD' : '#286A56'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <line x1={pl} x2={W - pr} y1={base} y2={base} stroke={c.outlineVar} strokeWidth={1} />
      {samples.map((x, i) => {
        const cx    = pl + (i + 0.5) * slot
        const fat   = x.w * x.bf / 100
        const leanV = x.w - fat
        const yLean = Y(leanV), yFat = Y(x.w)
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={yLean} width={bw} height={base - yLean} fill={lean} />
            <rect x={cx - bw / 2} y={yFat}  width={bw} height={yLean - yFat}  fill={c.debit} rx={3} />
            <text x={cx} y={H - 6} textAnchor="middle" fill={c.onSurfVar} fontSize={8.5} fontFamily="Roboto">{x.md}</text>
            <text x={cx} y={yFat - 4} textAnchor="middle" fill={c.onSurfVar} fontSize={8.5}
              fontFamily="Roboto" style={{ fontFeatureSettings: '"tnum"' }}>{x.bf}%</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function ForecastTab({ s, set, c, data, daysLeft, onTrack }: TabProps) {
  // Weight-trend window (independent period switcher: 30 / 90 / all + offset).
  const wWindow = (() => {
    if (s.wRange === 0) return data.slice()
    const end = data.length - s.wOff * s.wRange
    return data.slice(Math.max(0, end - s.wRange), end)
  })()
  const wAtNow   = s.wOff === 0
  const wPrevDis = s.wRange === 0 || (data.length - (s.wOff + 1) * s.wRange) <= 0
  const wNextDis = s.wRange === 0 || s.wOff === 0
  const wLabel   = s.wRange === 0
    ? '全期間'
    : (wWindow[0]?.md ?? '') + '–' + (wWindow[wWindow.length - 1]?.md ?? '')

  const wRangeBtn = (val: number, lbl: string) => {
    const active = s.wRange === val
    return (
      <button type="button" onClick={() => set({ wRange: val, wOff: 0 })} style={{
        border: `1px solid ${active ? 'transparent' : c.outlineVar}`, borderRadius: 999,
        background: active ? c.secondaryC : 'transparent', color: active ? c.onSecC : c.onSurfVar,
        fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '5px 11px',
      }}>{lbl}</button>
    )
  }
  const wArrow = (disabled: boolean, onClick: () => void, dir: 'prev' | 'next') => (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: 30, height: 30, borderRadius: 999, border: 'none', background: 'transparent',
      color: c.onSurfVar, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.28 : 1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }}>
      <span className="ms" style={{ fontSize: 20 }}>{dir === 'prev' ? 'chevron_left' : 'chevron_right'}</span>
    </button>
  )

  // Generic period chip (used by the trajectory switcher).
  const rangeBtn = (active: boolean, lbl: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{
      border: `1px solid ${active ? 'transparent' : c.outlineVar}`, borderRadius: 999,
      background: active ? c.secondaryC : 'transparent', color: active ? c.onSecC : c.onSurfVar,
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', padding: '5px 11px',
    }}>{lbl}</button>
  )

  // Trajectory window: most recent N days (0 = all). Prediction horizon is added
  // inside the chart, so this only narrows the measured/observed portion.
  const tWindow = s.tRange === 0 ? data : data.slice(Math.max(0, data.length - s.tRange))

  // Pace diagnostic: fixed TDEE_WINDOW_DAYS window (independent of tRange),
  // comparing logged intake / adaptive TDEE / Google Health's estimated burn —
  // a large gap between adaptive TDEE and the device estimate is consistent
  // with under-logged intake. Replaces the retired "体重×累積黒字" k-scatter
  // card, whose whole premise (regressing weight vs. self-reported cumulative
  // balance) is exactly the mechanism found to be unreliable.
  const paceWindow = data.slice(-TDEE_WINDOW_DAYS)
  const paceTrend  = estimateWeightTrend(paceWindow)
  const paceTdee   = estimateAdaptiveTdee(paceWindow, paceTrend)
  const avgBurnWindow = paceWindow.length
    ? paceWindow.reduce((sum, x) => sum + x.burn, 0) / paceWindow.length
    : 0

  const diagnosisText = (() => {
    if (!paceTdee.usable) return 'データ不足のため診断できません（体重測定または食事記録が少ない可能性があります）。'
    if (avgBurnWindow <= 0) return 'Google Health未連携のため、実測消費との比較はできません。'
    const gapPct = (paceTdee.avgTdee - avgBurnWindow) / avgBurnWindow * 100
    // avgTdee = avgBurnFallback − (実際の摂取−申告摂取)。よって申告が実際より少ない
    // （過小申告・記録漏れ）ほどavgTdeeは下振れする。gapPctが負＝過小申告シグナル。
    if (gapPct < -15) return `アダプティブTDEE（${Math.round(paceTdee.avgTdee)}kcal）がGoogle Health推定（${Math.round(avgBurnWindow)}kcal）を大きく下回っています。摂取の記録漏れ（過小申告）の可能性があります。`
    if (gapPct > 15) return `アダプティブTDEE（${Math.round(paceTdee.avgTdee)}kcal）がGoogle Health推定（${Math.round(avgBurnWindow)}kcal）を上回っています。記録との整合を確認してみてください。`
    return '申告摂取量と実測消費はおおむね整合的です。'
  })()

  const statusBg   = onTrack ? c.onTrackC : c.offTrackC
  const statusText = onTrack ? c.onTrack  : c.offTrack

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .35s ease both' }}>

      {/* Weight trend (time series) with its own period switcher */}
      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, padding: '0 4px' }}>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            体重の推移
            <InfoTip c={c} text={
              '測定した体重の時系列。点線は目標体重。期間(30日/90日/全期間)を切り替えられ、矢印で前後に移動できます。日付ラベルをタップすると最新に戻ります。'
            } />
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {wRangeBtn(30, '30日')}
            {wRangeBtn(90, '90日')}
            {wRangeBtn(0, '全期間')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 2 }}>
          {wArrow(wPrevDis, () => set({ wOff: s.wOff + 1 }), 'prev')}
          <button type="button" onClick={() => set({ wOff: 0 })} disabled={wAtNow}
            title={wAtNow ? undefined : '最新に戻る'} style={{
              minWidth: 110, border: 'none', background: 'transparent', padding: '2px 6px',
              fontSize: 11, color: wAtNow ? c.onSurfVar : c.primary, fontWeight: wAtNow ? 400 : 600,
              fontFamily: 'inherit', fontFeatureSettings: '"tnum"',
              cursor: wAtNow ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
            {!wAtNow && <span className="ms" style={{ fontSize: 14 }}>today</span>}
            {wLabel}
          </button>
          {wArrow(wNextDis, () => set({ wOff: s.wOff - 1 }), 'next')}
        </div>
        <WeightTrendChart d={wWindow} tgtW={s.tgtW} c={c} />
      </div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              体重トラジェクトリ
              <InfoTip c={c} text={
                '実測(平滑)＝実際の体重(外れ値除去・平滑化)。予測＝体重の実測トレンドをそのまま延長した場合に到達する体重。目標＝目標体重までの直線。\n\n「オフトラック」= 目標達成に必要なペースより実際の減量ペースが遅い状態。「オントラック」= 必要なペース以上で進んでいる状態。'
              } />
            </div>
            <div style={{ fontSize: 11, color: c.onSurfVar, marginTop: 2 }}>予測 vs 実測 vs 目標</div>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600,
            padding: '4px 10px 4px 8px', borderRadius: 999,
            background: statusBg, color: statusText,
          }}>
            <span className="ms" style={{ fontSize: 14, marginRight: 3 }}>
              {onTrack ? 'trending_down' : 'priority_high'}
            </span>
            {onTrack ? 'オントラック' : 'オフトラック'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '0 4px' }}>
          {rangeBtn(s.tRange === 7,  '7日',   () => set({ tRange: 7 }))}
          {rangeBtn(s.tRange === 30, '30日',  () => set({ tRange: 30 }))}
          {rangeBtn(s.tRange === 90, '90日',  () => set({ tRange: 90 }))}
          {rangeBtn(s.tRange === 0,  '全期間', () => set({ tRange: 0 }))}
        </div>
        <div style={{ margin: '8px 0 2px' }}>
          <TrajectoryChart d={tWindow} tgtW={s.tgtW} days={daysLeft} c={c} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 4px 0', fontSize: 11, color: c.onSurfVar }}>
          {[
            { style: { width: 14, height: 0, borderTop: `3px solid ${c.primary}`, display: 'inline-block' }, label: '実測(平滑)' },
            { style: { width: 14, height: 0, borderTop: `2px dashed ${c.tertiary}`, display: 'inline-block' }, label: '予測' },
            { style: { width: 14, height: 0, borderTop: `2px dashed ${c.onSurfVar}`, display: 'inline-block' }, label: '目標' },
          ].map(item => (
            <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={item.style} />{item.label}
            </span>
          ))}
        </div>
      </div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', marginBottom: 2 }}>
          ペース診断
          <InfoTip c={c} text={
            `直近${TDEE_WINDOW_DAYS}日の「申告摂取量」「アダプティブTDEE(実際の体重変化から逆算した消費カロリー)」「Google Health推定消費」を比較。\n\nアダプティブTDEEがGoogle Health推定を大きく下回っている場合、摂取の記録漏れ(過小申告)の可能性があります。`
          } />
        </div>
        <div style={{ fontSize: 11, color: c.onSurfVar, padding: '0 4px', marginBottom: 14 }}>直近{TDEE_WINDOW_DAYS}日</div>
        {paceTdee.usable ? (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: '申告摂取(平均)', value: paceTdee.avgLoggedIntake, col: c.primary },
                { label: 'アダプティブTDEE', value: paceTdee.avgTdee, col: c.tertiary },
                { label: 'Google Health推定', value: avgBurnWindow, col: c.onSurfVar },
              ].map(m => (
                <div key={m.label} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: c.onSurfVar, whiteSpace: 'nowrap' }}>{m.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 600, fontFeatureSettings: '"tnum"', color: m.col }}>
                    {Math.round(m.value).toLocaleString('ja-JP')}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: c.onSurfVar, padding: '12px 4px 0', lineHeight: '17px' }}>{diagnosisText}</div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: c.onSurfVar, padding: '4px 4px 0' }}>{diagnosisText}</div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>セカンダリ指標</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            体組成内訳
            <InfoTip c={c} text={
              '体重を「脂肪量」と「除脂肪量(筋肉・骨・水分など)」に分解した内訳。脂肪量 = 体重 × 体脂肪率。\n\n体重が同じでも脂肪が減り除脂肪が保たれていれば「質の良い減量」。体重・体脂肪率の測定がある日のみ表示します。'
            } />
          </span>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: c.onSurfVar }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: c.debit, display: 'inline-block' }} />脂肪量
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: c.primary, display: 'inline-block' }} />除脂肪量
            </span>
          </div>
        </div>
        <BodyCompChart d={data} dark={s.dark} c={c} />
        <div style={{ fontSize: 11, color: c.onSurfVar, padding: '8px 4px 0' }}>
          体脂肪量 = 体重 × 体脂肪率(派生値)。質=脂肪が減っているか。
        </div>
      </div>

    </div>
  )
}
