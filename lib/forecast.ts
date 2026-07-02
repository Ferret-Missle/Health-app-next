import type { DayData } from './data'

// Shared calculation module for weight-trend estimation, daily calorie targets,
// and trajectory prediction. Pure TypeScript — no `window`, no `sql` — so it can
// be imported from both client components and server route handlers / lib/advisor.ts.
//
// Design背景 (see docs/SPEC.md §5.2.3/§5.2.4): the previous k-calibration
// (OLS regression of weight vs. self-reported cumulative calorie balance) was
// found to be dominated by systematic intake under-reporting bias, which no
// amount of robust-regression cleanup on the weight (y) axis can fix, because
// the bias lives on the cumulative-balance (x) axis. This module instead:
//   (A) estimates the weight trend from weight-vs-TIME only (never against
//       self-reported balance), so it's structurally immune to that bias, and
//   (B) treats k as a fixed physical constant and back-solves an "adaptive
//       TDEE" from the user's own logged intake + their actual weight-trend
//       change, so a stable logging bias cancels out in the final
//       recommendation (both terms are expressed in the same as-logged units).

/** Fixed physical constant, kcal per kg of body-mass change. No longer
 *  calibrated per user via regression. */
export const K_CONST = 7200

/** Default lookback window (days) for the adaptive-TDEE and weight-trend calcs. */
export const TDEE_WINDOW_DAYS = 21

const DAY_MS = 86400000

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ── Weight-trend estimator ──────────────────────────────────────────────────

export interface WeightTrendOptions {
  hampelWindow?:      number  // default 5
  hampelK?:           number  // default 3 (× 1.4826 MAD)
  ewmaAlpha?:         number  // default 0.1
  clipMaxPerDayKg?:   number  // default 1.5, scaled by gap between weigh-ins
  maxTheilSenPoints?: number  // default 400, defensive subsample cap
}

export interface WeightTrendPoint {
  i:         number   // index into the source DayData[] array passed in
  dt:        Date
  raw:       number   // as-logged weight
  clipped:   number   // after physiological clip
  isOutlier: boolean  // Hampel/MAD flag
  cleaned:   number   // outlier-replaced value (median substitution when flagged)
  smoothed:  number   // EWMA output — the "trend weight" at this point
}

export type TrendConfidence = 'none' | 'low' | 'medium' | 'high'

export interface WeightTrend {
  points:            WeightTrendPoint[]  // ascending by date, one per weighed day in input
  n:                 number
  spanDays:          number              // 0 when n < 2
  slopePerDay:        number             // kg/day, Theil-Sen median slope; 0 when n < 2
  interceptAtAnchor: number              // fitted trend-line value at anchorDate; 0 when n === 0
  anchorDate:        Date | null
  latestDate:        Date | null
  latestSmoothed:    number              // trend value at the most recent weighed day; 0 when n === 0
  confidence:        TrendConfidence
  outlierCount:      number
}

/**
 * Weight-trend estimator: physiological clip → Hampel/MAD outlier rejection →
 * EWMA smoothing → Theil-Sen slope, applied only to weight vs. calendar time
 * (never against self-reported cumulative balance — see docs/SPEC.md §5.2.4).
 * Never throws, never returns NaN/Infinity; degrades to n=0/'none' on empty input.
 */
export function estimateWeightTrend(data: DayData[], opts: WeightTrendOptions = {}): WeightTrend {
  const {
    hampelWindow = 5,
    hampelK = 3,
    ewmaAlpha = 0.1,
    clipMaxPerDayKg = 1.5,
    maxTheilSenPoints = 400,
  } = opts

  const weighed = data
    .map((d, i) => ({ d, i }))
    .filter(x => x.d.w > 0)
    .sort((a, b) => a.d.dt.getTime() - b.d.dt.getTime())
  const n = weighed.length

  if (n === 0) {
    return {
      points: [], n: 0, spanDays: 0, slopePerDay: 0, interceptAtAnchor: 0,
      anchorDate: null, latestDate: null, latestSmoothed: 0, confidence: 'none', outlierCount: 0,
    }
  }

  // ① Physiological clip: bound each day's change from the previous *cleaned*
  // value, scaled by the gap between weigh-ins (measurements aren't daily).
  const clipped: number[] = [weighed[0].d.w]
  for (let j = 1; j < n; j++) {
    const gapDays = Math.max(1, (weighed[j].d.dt.getTime() - weighed[j - 1].d.dt.getTime()) / DAY_MS)
    const maxDelta = clipMaxPerDayKg * gapDays
    const delta = weighed[j].d.w - clipped[j - 1]
    clipped.push(clipped[j - 1] + Math.max(-maxDelta, Math.min(maxDelta, delta)))
  }

  // ② Hampel/MAD outlier detection — skip below hampelWindow points (a MAD
  // estimate that small is unreliable and would manufacture false flags).
  const half = Math.floor(hampelWindow / 2)
  const cleaned: number[] = [...clipped]
  const isOutlier: boolean[] = new Array(n).fill(false)
  let outlierCount = 0
  if (n >= hampelWindow) {
    for (let j = 0; j < n; j++) {
      const lo = Math.max(0, j - half), hi = Math.min(n - 1, j + half)
      const window = clipped.slice(lo, hi + 1)
      const med = median(window)
      const mad = median(window.map(v => Math.abs(v - med))) * 1.4826
      if (mad > 0 && Math.abs(clipped[j] - med) > hampelK * mad) {
        cleaned[j] = med
        isOutlier[j] = true
        outlierCount++
      }
    }
  }

  // ③ EWMA smoothing over the (irregular-gap) weighed sequence.
  const smoothed: number[] = [cleaned[0]]
  for (let j = 1; j < n; j++) smoothed.push(smoothed[j - 1] + ewmaAlpha * (cleaned[j] - smoothed[j - 1]))

  const anchorDate = weighed[0].d.dt
  const latestDate = weighed[n - 1].d.dt
  const spanDays = (latestDate.getTime() - anchorDate.getTime()) / DAY_MS
  const daysSinceAnchor = weighed.map(x => (x.d.dt.getTime() - anchorDate.getTime()) / DAY_MS)

  // ④ Theil-Sen slope on (daysSinceAnchor, smoothed) — both axes bias-free
  // (no cumulative-balance axis involved, unlike the retired v1.0/v2.0 approach).
  let slopePerDay = 0
  let interceptAtAnchor = smoothed[0]
  if (n >= 2) {
    let idx = Array.from({ length: n }, (_, i) => i)
    if (n > maxTheilSenPoints) {
      // Even subsample, preserving the full date range (not just "most recent").
      const step = n / maxTheilSenPoints
      idx = Array.from({ length: maxTheilSenPoints }, (_, i) => Math.min(n - 1, Math.round(i * step)))
    }
    const slopes: number[] = []
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        const ia = idx[a], ib = idx[b]
        const dx = daysSinceAnchor[ib] - daysSinceAnchor[ia]
        if (dx === 0) continue
        slopes.push((smoothed[ib] - smoothed[ia]) / dx)
      }
    }
    if (slopes.length > 0) {
      const m = median(slopes)
      if (Number.isFinite(m)) {
        slopePerDay = m
        const intercepts = idx.map(i => smoothed[i] - m * daysSinceAnchor[i])
        interceptAtAnchor = median(intercepts)
      }
    }
  }

  const points: WeightTrendPoint[] = weighed.map((x, j) => ({
    i: x.i, dt: x.d.dt, raw: x.d.w, clipped: clipped[j],
    isOutlier: isOutlier[j], cleaned: cleaned[j], smoothed: smoothed[j],
  }))

  const confidence: TrendConfidence =
    n < 2 ? 'none' :
    (n < 10 || spanDays < 14) ? 'low' :
    (n >= 30 && spanDays >= 45) ? 'high' : 'medium'

  return {
    points, n, spanDays, slopePerDay, interceptAtAnchor,
    anchorDate, latestDate, latestSmoothed: smoothed[n - 1], confidence, outlierCount,
  }
}

/** Trend-line value (kg) at an arbitrary Date — interpolates within the fitted
 *  window and extrapolates linearly beyond it using slopePerDay. Returns 0
 *  when trend.n === 0 (caller must check trend.n before trusting this). */
export function trendValueAt(trend: WeightTrend, date: Date): number {
  if (trend.n === 0 || !trend.anchorDate) return 0
  const days = (date.getTime() - trend.anchorDate.getTime()) / DAY_MS
  return trend.interceptAtAnchor + trend.slopePerDay * days
}

// ── Adaptive TDEE ────────────────────────────────────────────────────────────

export interface TdeeEstimate {
  avgTdee:         number   // kcal/day, in the SAME as-logged units as data[].intake
  windowDays:      number   // actual calendar days of data used
  avgLoggedIntake: number   // kcal/day
  deltaWKg:        number   // signed trend weight change over the window (negative = loss)
  usable:          boolean  // false ⇒ caller must fall back (see computeDailyTarget)
}

/**
 * Back-solve the user's effective TDEE, expressed in the same (possibly
 * under-reported) units they log intake in, from their actual weight-trend
 * change over the window + their own logged intake. A stable logging bias
 * cancels out because both the TDEE estimate and the eventual target-intake
 * recommendation are expressed in the same as-logged units.
 */
export function estimateAdaptiveTdee(
  data: DayData[],
  trend: WeightTrend,
  opts: { windowDays?: number; kConst?: number } = {},
): TdeeEstimate {
  const { windowDays = TDEE_WINDOW_DAYS, kConst = K_CONST } = opts
  const window = data.slice(-windowDays)
  const loggedDays = window.filter(x => x.intake > 0)
  const avgLoggedIntake = loggedDays.length
    ? loggedDays.reduce((s, x) => s + x.intake, 0) / loggedDays.length
    : 0

  const start = window[0]?.dt
  const end = window[window.length - 1]?.dt
  const actualWindowDays = start && end ? Math.max(1, (end.getTime() - start.getTime()) / DAY_MS) : 0
  const deltaWKg = trend.n >= 2 && start && end
    ? trendValueAt(trend, end) - trendValueAt(trend, start)
    : 0

  const usable = trend.n >= 2 && trend.spanDays >= 5 && loggedDays.length >= 3 && actualWindowDays >= 1

  const avgTdee = usable
    ? Math.max(0, avgLoggedIntake - (deltaWKg * kConst) / actualWindowDays)
    : 0

  return { avgTdee, windowDays: actualWindowDays, avgLoggedIntake, deltaWKg, usable }
}

// ── Daily target / target intake (single source of truth) ──────────────────

export type TdeeSource = 'adaptive' | 'avgBurnFallback' | 'insufficientData'

export interface DailyTargetResult {
  dailyTargetSurplus: number  // desired deficit = (curW−tgtW)×kConst/daysLeft, kcal/day, ≥0
  targetIntake:       number  // max(0, avgTdee − dailyTargetSurplus), as-logged units
  avgTdee:            number  // the TDEE actually used (0 when tdeeSource==='insufficientData')
  tdeeSource:         TdeeSource
}

export function computeDailyTarget(args: {
  curW:            number
  tgtW:            number
  daysLeft:        number
  tdee:            TdeeEstimate
  avgBurnFallback: number   // avg of data[].burn over the same window, for the fallback tier
  kConst?:         number
}): DailyTargetResult {
  const { curW, tgtW, daysLeft, tdee, avgBurnFallback, kConst = K_CONST } = args
  const dailyTargetSurplus = daysLeft > 0 ? Math.max(0, (curW - tgtW) * kConst / daysLeft) : 0

  if (tdee.usable) {
    return {
      dailyTargetSurplus,
      targetIntake: Math.max(0, tdee.avgTdee - dailyTargetSurplus),
      avgTdee: tdee.avgTdee,
      tdeeSource: 'adaptive',
    }
  }
  if (avgBurnFallback > 0) {
    return {
      dailyTargetSurplus,
      targetIntake: Math.max(0, avgBurnFallback - dailyTargetSurplus),
      avgTdee: avgBurnFallback,
      tdeeSource: 'avgBurnFallback',
    }
  }
  return { dailyTargetSurplus, targetIntake: 0, avgTdee: 0, tdeeSource: 'insufficientData' }
}

// ── Trajectory (weight-trend extrapolation, replaces cum-balance prediction) ─

export interface TrajectoryPoint { i: number; dt: Date; value: number }

/** Builds the fitted trend line from index 0 through data.length-1+horizonDays
 *  (calendar-day indexed to match the chart's existing X(i) pixel convention).
 *  Empty when trend.n === 0 or data is empty. */
export function buildTrajectory(data: DayData[], trend: WeightTrend, horizonDays: number): TrajectoryPoint[] {
  if (trend.n === 0 || data.length === 0) return []
  const horizon = data.length + horizonDays
  const out: TrajectoryPoint[] = []
  for (let i = 0; i < horizon; i++) {
    const dt = i < data.length ? data[i].dt : new Date(data[0].dt.getTime() + i * DAY_MS)
    out.push({ i, dt, value: trendValueAt(trend, dt) })
  }
  return out
}

// ── On-track evaluation (bias-immune replacement for comparing a single
// self-reported day's balance against the target surplus) ──────────────────

export interface OnTrackResult {
  onTrack:            boolean
  requiredPacePerDay: number       // kg/day, negative for weight loss; 0 if daysLeft<=0
  actualPacePerDay:   number | null // trend.slopePerDay, or null if trend.n < 2
}

export function evaluateOnTrack(args: {
  curW: number; tgtW: number; daysLeft: number; trend: WeightTrend
}): OnTrackResult {
  const { curW, tgtW, daysLeft, trend } = args
  const requiredPacePerDay = daysLeft > 0 ? (tgtW - curW) / daysLeft : 0
  if (trend.n < 2) return { onTrack: false, requiredPacePerDay, actualPacePerDay: null }
  const actualPacePerDay = trend.slopePerDay
  // On track when the actual pace is at least ~80% as fast as required (same
  // tolerance the previous today.d>=dailyTarget*0.8 check used). Already at
  // or past goal (requiredPacePerDay >= 0) counts as on track unconditionally.
  const onTrack = requiredPacePerDay >= 0 ? true : actualPacePerDay <= requiredPacePerDay * 0.8
  return { onTrack, requiredPacePerDay, actualPacePerDay }
}
