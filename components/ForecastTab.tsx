'use client'

import type { TabProps } from '@/lib/types'
import { movingAvg, type DayData } from '@/lib/data'
import type { C } from '@/lib/colors'

function TrajectoryChart({ d, tgtW, days, c }: { d: DayData[], tgtW: number, days: number, c: C }) {
  const W = 352, H = 214, pl = 30, pr = 12, pt = 12, pb = 36
  const iw = W - pl - pr, ih = H - pt - pb

  // Plot only days with a measured weight, keeping each point at its real day index.
  const weighedIdx = d.map((x, i) => ({ i, w: x.w })).filter(p => p.w > 0)
  const smoothed   = movingAvg(weighedIdx.map(p => p.w), 7)
  const measured   = weighedIdx.map((p, j) => ({ i: p.i, v: smoothed[j] }))
  const W0         = measured.length ? measured[0].v : 0
  const k          = 7200
  const horizon    = d.length + days
  const avgD       = d.reduce((s, x) => s + x.d, 0) / d.length

  const pred: number[] = []
  for (let i = 0; i < horizon; i++) {
    const cum = i < d.length ? d[i].cum : d[d.length - 1].cum + avgD * (i - d.length + 1)
    pred.push(W0 - cum / k)
  }

  const allVals = [...measured.map(m => m.v), ...pred, W0, tgtW]
  const ymin = Math.min(...allVals) - 0.5, ymax = Math.max(...allVals) + 0.5
  const axisY = pt + ih

  const X = (i: number) => pl + i / (horizon - 1) * iw
  const Y = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih

  const fmtD = (dt: Date) => `${dt.getMonth() + 1}/${dt.getDate()}`
  const dateAt = (i: number) => { const dt = new Date(d[0].dt); dt.setDate(dt.getDate() + i); return dt }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {[ymax, (ymax + ymin) / 2, ymin].map((v, k2) => {
        const y = Y(v)
        return (
          <g key={k2}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />
            <text x={pl - 5} y={y + 3} textAnchor="end" fill={c.onSurfVar} fontSize={9}
              fontFamily="Roboto" style={{ fontFeatureSettings: '"tnum"' }}>{v.toFixed(1)}</text>
          </g>
        )
      })}
      <line x1={X(0)} y1={Y(W0)} x2={X(horizon - 1)} y2={Y(tgtW)}
        stroke={c.onSurfVar} strokeWidth={1.6} strokeDasharray="5 4" />
      <polyline points={pred.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
        fill="none" stroke={c.tertiary} strokeWidth={2} strokeDasharray="5 3" />
      <polyline points={measured.map(m => `${X(m.i)},${Y(m.v)}`).join(' ')}
        fill="none" stroke={c.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {measured.length > 0 && (
        <circle cx={X(measured[measured.length - 1].i)} cy={Y(measured[measured.length - 1].v)} r={4} fill={c.primary} />
      )}
      <line x1={X(d.length - 1)} y1={pt} x2={X(d.length - 1)} y2={axisY}
        stroke={c.primary} strokeWidth={1} strokeDasharray="2 3" opacity={0.45} />
      <line x1={pl} x2={W - pr} y1={axisY} y2={axisY} stroke={c.outlineVar} strokeWidth={1} />
      {[
        { i: 0,            label: fmtD(d[0].dt),                    a: 'start'  },
        { i: d.length - 1, label: '今日 ' + fmtD(d[d.length - 1].dt), a: 'middle' },
        { i: horizon - 1,  label: '目標 ' + fmtD(dateAt(horizon - 1)), a: 'end'    },
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
        fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">目標 {tgtW.toFixed(1)}</text>
    </svg>
  )
}

function ScatterChart({ d, c }: { d: DayData[], kVal: number, c: C }) {
  const W = 352, H = 190, pl = 32, pr = 10, pt = 12, pb = 26
  const iw = W - pl - pr, ih = H - pt - pb

  const dw   = d.filter(x => x.w > 0)   // only days with a measured weight
  const xs   = dw.map(x => x.cum), ys = dw.map(x => x.w)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys) - 0.3, ymax = Math.max(...ys) + 0.3

  const X = (v: number) => pl + (v - xmin) / ((xmax - xmin) || 1) * iw
  const Y = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih

  const n  = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  const slope = num / (den || 1), intercept = my - slope * mx

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {[ymax, (ymax + ymin) / 2, ymin].map((v, k) => {
        const y = Y(v)
        return (
          <g key={k}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />
            <text x={pl - 5} y={y + 3} textAnchor="end" fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">{v.toFixed(1)}</text>
          </g>
        )
      })}
      <line
        x1={X(xmin)} y1={Y(slope * xmin + intercept)}
        x2={X(xmax)} y2={Y(slope * xmax + intercept)}
        stroke={c.primary} strokeWidth={2.4} />
      {dw.map((x, i) => <circle key={i} cx={X(x.cum)} cy={Y(x.w)} r={3} fill={c.tertiary} opacity={0.75} />)}
      <text x={W - pr} y={H - 6} textAnchor="end" fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">累積黒字 →</text>
      <text x={pl - 5} y={pt - 2} textAnchor="start" fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">体重 kg</text>
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

export default function ForecastTab({ s, c, data, onTrack, kVal }: TabProps) {
  const statusBg   = onTrack ? c.onTrackC : c.offTrackC
  const statusText = onTrack ? c.onTrack  : c.offTrack

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .35s ease both' }}>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>体重トラジェクトリ</div>
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
        <div style={{ margin: '8px 0 2px' }}>
          <TrajectoryChart d={data} tgtW={s.tgtW} days={s.days} c={c} />
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>体重 × 累積黒字</div>
            <div style={{ fontSize: 11, color: c.onSurfVar, marginTop: 2 }}>回帰の傾き = 1/k</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: c.onSurfVar }}>個人係数 k</div>
            <div style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.primary }}>
              ≈ {kVal.toLocaleString('ja-JP')}
            </div>
          </div>
        </div>
        <div style={{ margin: '8px 0 2px' }}>
          <ScatterChart d={data} kVal={kVal} c={c} />
        </div>
        <div style={{ fontSize: 11, color: c.onSurfVar, padding: '4px 4px 0' }}>
          サンプル {data.length}日 / 3週間以上で k0=7,200 からキャリブ値へ切替
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>セカンダリ指標</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>体組成内訳</span>
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
