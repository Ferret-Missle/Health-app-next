'use client'

import type { TabProps } from '@/lib/types'
import { type DayData } from '@/lib/data'
import type { C } from '@/lib/colors'
import InfoTip from './InfoTip'

function arrowBtn(disabled: boolean, onClick: () => void, dir: string, c: C) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: 30, height: 30, borderRadius: 999, border: 'none', background: 'transparent',
      color: c.onSurfVar, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? 0.28 : 1, padding: 0,
    }}>
      <span className="ms" style={{ fontSize: 20 }}>{dir === 'prev' ? 'chevron_left' : 'chevron_right'}</span>
    </button>
  )
}

// Tappable period label: when not at the latest window (atNow=false), tapping
// jumps back to the present. Shows a subtle "今へ" hint when off-current.
function dateLabel(text: string, atNow: boolean, onReset: () => void, minWidth: number, fontSize: number, c: C) {
  return (
    <button type="button" onClick={onReset} disabled={atNow}
      title={atNow ? undefined : '現在に戻る'} style={{
        minWidth, border: 'none', background: 'transparent', padding: '2px 4px',
        fontSize, color: atNow ? c.onSurfVar : c.primary, fontWeight: atNow ? 400 : 600,
        fontFamily: 'inherit', fontFeatureSettings: '"tnum"', textAlign: 'center',
        cursor: atNow ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
      {!atNow && <span className="ms" style={{ fontSize: fontSize + 3 }}>today</span>}
      {text}
    </button>
  )
}

function BalanceChart({ series, view, range, dailyTarget, c }: {
  series: DayData[], view: string, range: number, dailyTarget: number, c: C
}) {
  const W = 352, H = 196, pl = 34, pr = 8, pt = 12, pb = 24
  const iw = W - pl - pr, ih = H - pt - pb
  const effView = range === 0 ? 'cumulative' : view
  const n  = series.length
  const per = dailyTarget

  const txtEl = (id: string, x: number, y: number, str: string, anchor: string, col?: string, size?: number) => (
    <text key={`t-${id}`} x={x} y={y} textAnchor={anchor as 'start' | 'middle' | 'end'} fill={col || c.onSurfVar}
      fontSize={size || 9} fontFamily="Roboto, sans-serif" style={{ fontFeatureSettings: '"tnum"' }}>
      {str}
    </text>
  )

  const els: React.ReactNode[] = []

  if (effView === 'cumulative') {
    let cum = 0; const cumA = series.map(x => (cum += x.d))
    const tgtA  = series.map((_, i) => per * (i + 1))
    const ymax  = Math.max(...cumA, ...tgtA, 1) * 1.08
    const ymin  = Math.min(0, ...cumA)
    const X     = (i: number) => pl + (n <= 1 ? iw / 2 : i * iw / (n - 1))
    const Y     = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih
    const y0    = Y(0)

    ;[0, 0.5, 1].forEach((t, k) => {
      const v = ymin + (ymax - ymin) * t, y = Y(v)
      els.push(<line key={`g${k}`} x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />)
      els.push(txtEl(`grid${k}`, pl - 5, y + 3, Math.round(v / 1000) + 'k', 'end'))
    })

    const areaD = `M ${X(0)},${y0} ` + cumA.map((v, i) => `L ${X(i)},${Y(v)}`).join(' ') + ` L ${X(n - 1)},${y0} Z`
    els.push(<path key="ar" d={areaD} fill={c.credit} opacity={0.16} />)
    els.push(<polyline key="tg" points={tgtA.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
      fill="none" stroke={c.onSurfVar} strokeWidth={1.6} strokeDasharray="5 4" />)
    els.push(<polyline key="cl" points={cumA.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}
      fill="none" stroke={c.credit} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />)
    els.push(<circle key="end" cx={X(n - 1)} cy={Y(cumA[n - 1])} r={4} fill={c.credit} />)
    els.push(txtEl('x-start', X(0), H - 7, series[0].md, 'start'))
    els.push(txtEl('x-end', X(n - 1), H - 7, series[n - 1].md, 'end'))

  } else {
    const dvals = series.map(x => x.d)
    const ymax  = Math.max(0, ...dvals, per) * 1.15
    const ymin  = Math.min(0, ...dvals) * 1.18
    const X     = (i: number) => pl + (i + 0.5) * iw / n
    const Y     = (v: number) => pt + ih - (v - ymin) / ((ymax - ymin) || 1) * ih
    const y0    = Y(0)

    ;[ymax, (ymax + ymin) / 2, ymin].forEach((v, k) => {
      els.push(txtEl(`yaxis${k}`, pl - 5, Y(v) + 3, Math.round(v / 100) / 10 + 'k', 'end', undefined, undefined))
    })

    const bw = Math.min(20, iw / n * 0.62)
    series.forEach((x, i) => {
      const top = Y(Math.max(0, x.d)), bh = Math.abs(Y(x.d) - y0)
      els.push(<rect key={`b${i}`} x={X(i) - bw / 2} y={top} width={bw} height={Math.max(1, bh)} rx={3}
        fill={x.d >= 0 ? c.credit : c.debit} />)
    })
    els.push(<line key="tl" x1={pl} x2={W - pr} y1={Y(per)} y2={Y(per)}
      stroke={c.onSurfVar} strokeWidth={1.6} strokeDasharray="5 4" />)
    els.push(txtEl('target', W - pr, Y(per) - 4, '目標 +' + Math.round(per), 'end', c.onSurfVar, 8.5))
    els.push(<line key="z" x1={pl} x2={W - pr} y1={y0} y2={y0} stroke={c.onSurf} strokeWidth={1.4} />)
    if (n <= 12) series.forEach((x, i) => els.push(txtEl(`xlbl${i}`, X(i), H - 7, x.md.split('/')[1], 'middle', c.onSurfVar, 8)))
    else { els.push(txtEl('x-start', X(0), H - 7, series[0].md, 'start')); els.push(txtEl('x-end', X(n - 1), H - 7, series[n - 1].md, 'end')) }
  }

  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>{els}</svg>
}

function GroupedChart({ days, dark, c }: { days: DayData[], dark: boolean, c: C }) {
  const W = 352, H = 140, pl = 30, pr = 6, pt = 14, pb = 20
  const iw = W - pl - pr, ih = H - pt - pb, n = days.length
  const mx   = Math.max(1, ...days.map(x => Math.max(x.intake, x.burn))) * 1.08
  const slot = iw / n, bw = slot * 0.3
  const Y = (v: number) => pt + ih - v / mx * ih
  const stripe = dark ? 'rgba(10,14,12,0.6)' : 'rgba(255,255,255,0.6)'
  const axisY = pt + ih

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <pattern id="burnHatch" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={5} height={5} fill={c.tertiary} />
          <rect x={0} y={0} width={2.2} height={5} fill={stripe} />
        </pattern>
      </defs>
      {/* y-axis gridlines + kcal scale labels */}
      {[0, 0.5, 1].map((t, k) => {
        const v = mx * t, y = Y(v)
        return (
          <g key={`g${k}`}>
            <line x1={pl} x2={W - pr} y1={y} y2={y} stroke={c.grid} strokeWidth={1} />
            <text x={pl - 5} y={y + 3} textAnchor="end" fill={c.onSurfVar} fontSize={8.5}
              fontFamily="Roboto, sans-serif" style={{ fontFeatureSettings: '"tnum"' }}>
              {(Math.round(v / 100) / 10)}k
            </text>
          </g>
        )
      })}
      {/* vertical axis unit, rotated, clear of the tick numbers */}
      <text x={8} y={pt + ih / 2} textAnchor="middle" fill={c.onSurfVar} fontSize={8}
        fontFamily="Roboto, sans-serif" transform={`rotate(-90 8 ${pt + ih / 2})`}>kcal</text>
      <line x1={pl} x2={W - pr} y1={axisY} y2={axisY} stroke={c.outlineVar} strokeWidth={1} />
      {days.map((x, i) => {
        const cx = pl + (i + 0.5) * slot
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={Y(x.intake)} width={bw} height={pt + ih - Y(x.intake)} rx={2.5} fill={c.primary} />
            <rect x={cx + 1}     y={Y(x.burn)}   width={bw} height={pt + ih - Y(x.burn)}   rx={2.5}
              fill="url(#burnHatch)" stroke={c.tertiary} strokeWidth={1} />
            <text x={cx} y={H - 6} textAnchor="middle" fill={c.onSurfVar} fontSize={8} fontFamily="Roboto, sans-serif">{x.dom}</text>
          </g>
        )
      })}
    </svg>
  )
}

function CalendarHeatmap({ yr, mon, data, c }: { yr: number, mon: number, data: DayData[], c: C }) {
  const map: Record<number, number> = {}
  data.forEach(x => { if (x.yr === yr && x.mon === mon) map[x.dom] = x.d })

  const W = 348, cell = 40, gap = 6, top = 18
  const firstDow = (new Date(yr, mon, 1).getDay() + 6) % 7
  const days     = new Date(yr, mon + 1, 0).getDate()
  const labels   = ['月', '火', '水', '木', '金', '土', '日']

  const shade = (v: number | undefined) => {
    if (v == null) return { f: c.surf,   t: c.onSurfVar, o: 0.5 }
    if (v < 0)     return { f: c.debitC, t: c.debit,     o: 1 }
    if (v < 250)   return { f: c.creditC, t: c.credit,   o: 1 }
    return { f: c.credit, t: '#FFFFFF', o: 1 }
  }

  const rows = Math.ceil((firstDow + days) / 7)

  return (
    <svg viewBox={`0 0 ${W} ${top + rows * (cell + gap)}`} width="100%" style={{ display: 'block' }}>
      {labels.map((l, i) => (
        <text key={i} x={i * (cell + gap) + cell / 2} y={11} textAnchor="middle"
          fill={c.onSurfVar} fontSize={9} fontFamily="Roboto">{l}</text>
      ))}
      {Array.from({ length: days }, (_, d) => d + 1).map(day => {
        const idx = firstDow + day - 1
        const row = Math.floor(idx / 7), col = idx % 7
        const sh  = shade(map[day])
        const x   = col * (cell + gap), y = top + row * (cell + gap)
        return (
          <g key={day}>
            <rect x={x} y={y} width={cell} height={cell} rx={9} fill={sh.f} opacity={sh.o} />
            <text x={x + cell / 2} y={y + cell / 2 + 4} textAnchor="middle"
              fill={sh.t} fontSize={11} fontFamily="Roboto" opacity={sh.o}>{day}</text>
          </g>
        )
      })}
    </svg>
  )
}

function PfcChart({ p, f, cc, dark, c }: { p: number, f: number, cc: number, dark: boolean, c: C }) {
  const cal   = { p: p * 4, f: f * 9, c: cc * 4 }
  const total = (cal.p + cal.f + cal.c) || 1
  const W = 348, H = 34
  const segs = [
    { v: cal.p, col: c.primary },
    { v: cal.f, col: c.tertiary },
    { v: cal.c, col: dark ? '#7E9A8D' : '#9CB3A8' },
  ]
  let x = 0
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {segs.map((seg, i) => {
        const w  = seg.v / total * W
        const rx = (i === 0 || i === segs.length - 1) ? 8 : 4
        const el = <rect key={i} x={x + (i ? 2 : 0)} y={0} width={Math.max(0, w - (i ? 2 : 0))} height={H} rx={rx} fill={seg.col} />
        x += w
        return el
      })}
    </svg>
  )
}

export default function BalanceTab({ s, set, c, data, dailyTarget }: TabProps) {
  const all = data

  const rawWindow = () => {
    if (s.range === 0) return all.slice()
    const end = all.length - s.balOff * s.range
    return all.slice(Math.max(0, end - s.range), end)
  }
  const rw           = rawWindow()
  const series       = rw
  const balLabel     = s.range === 0 ? '全期間' : (rw[0]?.md + '–' + rw[rw.length - 1]?.md)
  const balPrevDis   = s.range === 0 || (all.length - (s.balOff + 1) * s.range) <= 0
  const balNextDis   = s.range === 0 || s.balOff === 0

  const WIN   = 10
  const gEnd  = all.length - s.grpOff * WIN
  const gDays = all.slice(Math.max(0, gEnd - WIN), gEnd)
  const grpLabel   = gDays[0]?.md + '–' + gDays[gDays.length - 1]?.md
  const grpPrevDis = (all.length - (s.grpOff + 1) * WIN) <= 0
  const grpNextDis = s.grpOff === 0

  const baseDate = new Date(2026, 5, 1); baseDate.setMonth(baseDate.getMonth() - s.calOff)
  const calYr    = baseDate.getFullYear(), calMon = baseDate.getMonth()
  const calPrevDis = !all.some(x => x.yr < calYr || (x.yr === calYr && x.mon < calMon))
  const calNextDis = s.calOff === 0

  const pfcDay     = all[Math.max(0, all.length - 1 - s.pfcOff)]
  const pfcPrevDis = (all.length - 1 - s.pfcOff) <= 0
  const pfcNextDis = s.pfcOff === 0

  const effView    = s.range === 0 ? 'cumulative' : s.view
  const subtitle   = s.range === 0 ? '累積固定' : (effView === 'cumulative' ? '累積黒字+目標線' : 'ゼロ基準・発散棒')

  const togSt = (active: boolean, disabled = false) => ({
    flex: 1, border: 'none', borderRadius: 999,
    background: active ? c.primary : 'transparent',
    color: active ? c.onPrimary : c.onSurfVar,
    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
    height: 34, opacity: disabled ? 0.45 : 1,
  })
  const chipSt = (active: boolean, disabled = false) => ({
    border: `1px solid ${active ? 'transparent' : c.outlineVar}`,
    borderRadius: 999,
    background: active ? c.secondaryC : 'transparent',
    color:       active ? c.onSecC : c.onSurfVar,
    fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer', padding: '7px 12px',
    opacity: disabled ? 0.4 : 1,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .35s ease both' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', borderRadius: 999, background: c.surf, padding: 3, flex: 1 }}>
            <button type="button" onClick={() => set({ view: 'cumulative' })} style={togSt(s.range === 0 || s.view === 'cumulative')}>累積</button>
            <button type="button" onClick={() => { if (s.range !== 0) set({ view: 'daily' }) }}
              style={togSt(s.range !== 0 && s.view === 'daily', s.range === 0)}>日次</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => set({ range: 7, balOff: 0 })} style={chipSt(s.range === 7)}>7日</button>
            <button type="button" onClick={() => set({ range: 30, balOff: 0 })} style={chipSt(s.range === 30)}>30日</button>
            <button type="button" onClick={() => set({ range: 0,  view: 'cumulative', balOff: 0 })} style={chipSt(s.range === 0)}>全期間</button>
          </div>
        </div>
      </div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, padding: '0 4px' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              カロリー収支
              <InfoTip c={c} text={
                '日々の収支 d = 消費 − 摂取。d>0=黒字(カロリーを削減できた=減量に有利)、d<0=赤字(オーバー)。\n\n「累積」表示は黒字の積み上がりと目標線、「日次」表示はゼロ基準の発散棒。上のトグルと期間(7日/30日/全期間)で切替。'
              } />
            </div>
            <div style={{ fontSize: 11, color: c.onSurfVar, marginTop: 1 }}>{subtitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {arrowBtn(balPrevDis, () => set({ balOff: s.balOff + 1 }), 'prev', c)}
            {dateLabel(balLabel, s.balOff === 0, () => set({ balOff: 0 }), 80, 11, c)}
            {arrowBtn(balNextDis, () => set({ balOff: s.balOff - 1 }), 'next', c)}
          </div>
        </div>
        <div style={{ margin: '6px 0 2px' }}>
          <BalanceChart series={series} view={s.view} range={s.range} dailyTarget={dailyTarget} c={c} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '6px 4px 0', fontSize: 11, color: c.onSurfVar }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: c.credit, display: 'inline-block' }} />黒字(削減)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: c.debit, display: 'inline-block' }} />赤字(オーバー)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${c.onSurfVar}`, display: 'inline-block' }} />目標
          </span>
        </div>
      </div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            摂取 と 消費
            <InfoTip c={c} text={
              '日ごとの摂取カロリー(無地の棒)と消費カロリー(斜線の棒)を並べて比較。消費が摂取を上回るほど黒字=減量に有利。左の目盛りはkcal。'
            } />
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {arrowBtn(grpPrevDis, () => set({ grpOff: s.grpOff + 1 }), 'prev', c)}
            {dateLabel(grpLabel, s.grpOff === 0, () => set({ grpOff: 0 }), 80, 11, c)}
            {arrowBtn(grpNextDis, () => set({ grpOff: s.grpOff - 1 }), 'next', c)}
          </div>
        </div>
        <GroupedChart days={gDays} dark={s.dark} c={c} />
        <div style={{ display: 'flex', gap: 16, padding: '8px 4px 0', fontSize: 11, color: c.onSurfVar }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: c.primary, display: 'inline-block' }} />摂取(無地)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px solid ${c.tertiary}`, display: 'inline-block' }} />消費(斜線)
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>セカンダリ指標</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            黒字カレンダー
            <InfoTip c={c} text={
              '1日ごとの収支を色の濃さで表したヒートマップ。緑が濃いほど黒字(削減)、赤いほど赤字(オーバー)。どの曜日・時期に崩れやすいか俯瞰できます。'
            } />
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {arrowBtn(calPrevDis, () => set({ calOff: s.calOff + 1 }), 'prev', c)}
            {dateLabel(`${calYr}年${calMon + 1}月`, s.calOff === 0, () => set({ calOff: 0 }), 84, 12, c)}
            {arrowBtn(calNextDis, () => set({ calOff: s.calOff - 1 }), 'next', c)}
          </div>
        </div>
        <CalendarHeatmap yr={calYr} mon={calMon} data={all} c={c} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11, color: c.onSurfVar }}>
          <span>赤字</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {[c.debitC, c.surfHighest, c.creditC, c.credit].map((bg, i) => (
              <span key={i} style={{ width: 14, height: 14, borderRadius: 4, background: bg, display: 'inline-block' }} />
            ))}
          </span>
          <span>黒字</span>
        </div>
      </div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            PFCバランス
            <InfoTip c={c} text={
              'その日の三大栄養素の内訳。P=タンパク質、F=脂質、C=炭水化物(各g)。タンパク質を確保しつつ総カロリーを抑えると、筋肉を保ちながら脂肪を減らしやすくなります。'
            } />
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {arrowBtn(pfcPrevDis, () => set({ pfcOff: s.pfcOff + 1 }), 'prev', c)}
            {dateLabel(pfcDay?.md ?? '', s.pfcOff === 0, () => set({ pfcOff: 0 }), 62, 12, c)}
            {arrowBtn(pfcNextDis, () => set({ pfcOff: s.pfcOff - 1 }), 'next', c)}
          </div>
        </div>
        <PfcChart p={pfcDay?.p ?? 0} f={pfcDay?.f ?? 0} cc={pfcDay?.cc ?? 0} dark={s.dark} c={c} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          {[
            { label: 'P 蛋白', val: pfcDay?.p ?? 0, col: c.primary },
            { label: 'F 脂質', val: pfcDay?.f ?? 0, col: c.tertiary },
            { label: 'C 炭水', val: pfcDay?.cc ?? 0, col: c.onSecC },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span style={{ fontSize: 11, color: c.onSurfVar }}>{item.label}</span>
              <span style={{ fontSize: 15, fontWeight: 600, fontFeatureSettings: '"tnum"', color: item.col }}>{item.val}g</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
