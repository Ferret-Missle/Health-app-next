// Google Health API (health.googleapis.com/v4) client.
// Replaces the legacy Google Fit REST API (fitness.googleapis.com).
//
// Field names and request/response shapes below were confirmed against a real
// account (Pixel Watch 4 / Fitbit platform) via the /api/health/debug route.
//
// Two methods are used:
//   - dailyRollUp (POST): steps, total-calories, heart-rate. Aggregates per civil
//     (local-time) day. HARD LIMIT: max 14 days per request → we chunk the window.
//   - list (GET): sleep. dailyRollUp is NOT supported for sleep; we fetch raw
//     sessions and sum non-AWAKE stage durations per JST day ourselves.

const HEALTH_API = 'https://health.googleapis.com/v4'
const JST_OFFSET_SECONDS = 9 * 3600
const MAX_ROLLUP_DAYS = 14
const DAY_MS = 86400000

// ── CivilDateTime: { date:{year,month,day}, time:{hours,...} }, NO timezone ──
interface CivilDate { year: number; month: number; day: number }
interface CivilDateTime { date: CivilDate; time?: { hours?: number; minutes?: number; seconds?: number; nanos?: number } }

function jstCivil(ms: number): CivilDateTime {
  const j = new Date(ms + JST_OFFSET_SECONDS * 1000)
  return {
    date: { year: j.getUTCFullYear(), month: j.getUTCMonth() + 1, day: j.getUTCDate() },
    time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
  }
}

function civilToDateStr(c: CivilDateTime | undefined): string {
  if (!c?.date) return ''
  const { year, month, day } = c.date
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── dailyRollUp ──────────────────────────────────────────────────────────────
interface RollupPoint {
  civilStartTime?: CivilDateTime
  steps?:         { countSum?: string }
  totalCalories?: { kcalSum?: number }
  heartRate?:     { beatsPerMinuteAvg?: number; beatsPerMinuteMax?: number; beatsPerMinuteMin?: number }
  weight?:        { weightGramsAvg?: number }
  bodyFat?:       { bodyFatPercentageAvg?: number }
}
interface DailyRollUpResponse { rollupDataPoints?: RollupPoint[]; nextPageToken?: string }

async function dailyRollUpChunk(
  accessToken: string,
  dataType: string,
  startMs: number,
  endMs: number,
): Promise<RollupPoint[]> {
  const body = {
    range: { start: jstCivil(startMs), end: jstCivil(endMs) },
    windowSizeDays: 1,
  }
  const points: RollupPoint[] = []
  let pageToken: string | undefined
  do {
    const res = await fetch(
      `${HEALTH_API}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pageToken ? { ...body, pageToken } : body),
      },
    )
    if (!res.ok) throw new Error(`Health[${dataType}] ${res.status}: ${await res.text()}`)
    const data = await res.json() as DailyRollUpResponse
    points.push(...(data.rollupDataPoints ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return points
}

// Split [startMs,endMs) into ≤14-day chunks (API limit) and concat results.
async function dailyRollUp(
  accessToken: string,
  dataType: string,
  startMs: number,
  endMs: number,
): Promise<RollupPoint[]> {
  const all: RollupPoint[] = []
  for (let s = startMs; s < endMs; s += MAX_ROLLUP_DAYS * DAY_MS) {
    const e = Math.min(s + MAX_ROLLUP_DAYS * DAY_MS, endMs)
    all.push(...await dailyRollUpChunk(accessToken, dataType, s, e))
  }
  return all
}

// ── sleep via list ───────────────────────────────────────────────────────────
interface SleepStage { startTime: string; endTime: string; type: string }
interface SleepDataPoint { sleep?: { interval?: { startTime?: string; endTime?: string }; stages?: SleepStage[] } }
interface SleepListResponse { dataPoints?: SleepDataPoint[]; nextPageToken?: string }

// JST date string for an RFC3339 instant.
function jstDateStrFromIso(iso: string): string {
  const ms = new Date(iso).getTime() + JST_OFFSET_SECONDS * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

async function fetchSleepMinutesByDate(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<Map<string, number>> {
  const byDate = new Map<string, number>()
  let pageToken: string | undefined
  do {
    const url = new URL(`${HEALTH_API}/users/me/dataTypes/sleep/dataPoints`)
    url.searchParams.set('pageSize', '100')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Health[sleep] ${res.status}: ${await res.text()}`)
    const data = await res.json() as SleepListResponse

    for (const dp of data.dataPoints ?? []) {
      const stages = dp.sleep?.stages ?? []
      // Attribute the session to the JST date of its end (wake) time — matches how
      // a night of sleep is conventionally logged to "that morning's" date.
      const endIso = dp.sleep?.interval?.endTime
      if (!endIso) continue
      const inWindow = new Date(endIso).getTime()
      if (inWindow < startMs || inWindow >= endMs) continue
      const date = jstDateStrFromIso(endIso)

      let asleepMs = 0
      for (const st of stages) {
        if (st.type === 'AWAKE') continue
        asleepMs += new Date(st.endTime).getTime() - new Date(st.startTime).getTime()
      }
      // Fallback: no stage breakdown → use whole interval.
      if (asleepMs === 0 && dp.sleep?.interval?.startTime) {
        asleepMs = new Date(endIso).getTime() - new Date(dp.sleep.interval.startTime).getTime()
      }
      byDate.set(date, (byDate.get(date) ?? 0) + asleepMs / 60000)
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return byDate
}

export interface DailyActivityData {
  date:          string
  burnKcal:      number | null
  steps:         number | null
  heartRateAvg:  number | null
  sleepMin:      number | null
}

export async function fetchActivityData(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<DailyActivityData[]> {
  const [stepsRes, calRes, hrRes, sleepRes] = await Promise.allSettled([
    dailyRollUp(accessToken, 'steps',          startMs, endMs),
    dailyRollUp(accessToken, 'total-calories', startMs, endMs),
    dailyRollUp(accessToken, 'heart-rate',     startMs, endMs),
    fetchSleepMinutesByDate(accessToken, startMs, endMs),
  ])

  const steps    = stepsRes.status === 'fulfilled' ? stepsRes.value : []
  const calories = calRes.status   === 'fulfilled' ? calRes.value   : []
  const hr       = hrRes.status    === 'fulfilled' ? hrRes.value    : []
  const sleep    = sleepRes.status === 'fulfilled' ? sleepRes.value : new Map<string, number>()

  const byDate = new Map<string, DailyActivityData>()
  const get = (date: string): DailyActivityData => {
    if (!byDate.has(date)) byDate.set(date, { date, burnKcal: null, steps: null, heartRateAvg: null, sleepMin: null })
    return byDate.get(date)!
  }

  for (const p of steps) {
    const date = civilToDateStr(p.civilStartTime)
    const v = p.steps?.countSum
    if (date && v != null) get(date).steps = parseInt(v, 10)
  }
  for (const p of calories) {
    const date = civilToDateStr(p.civilStartTime)
    const v = p.totalCalories?.kcalSum
    if (date && v != null) get(date).burnKcal = Math.round(v)
  }
  for (const p of hr) {
    const date = civilToDateStr(p.civilStartTime)
    const v = p.heartRate?.beatsPerMinuteAvg
    if (date && v != null) get(date).heartRateAvg = Math.round(v)
  }
  for (const [date, minutes] of sleep) {
    get(date).sleepMin = Math.round(minutes)
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Body composition (weight / body fat) ─────────────────────────────────────
// Per spec v0.10, body composition comes from Google Health directly (Tanita data
// is assumed already synced into Google Health, R7). Both are health_metrics scope.
// weight is returned in GRAMS → convert to kg.
export interface DailyBodyData {
  date:        string
  weightKg:    number | null
  bodyFatPct:  number | null
}

export async function fetchBodyData(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<DailyBodyData[]> {
  const [weightRes, bfRes] = await Promise.allSettled([
    dailyRollUp(accessToken, 'weight',   startMs, endMs),
    dailyRollUp(accessToken, 'body-fat', startMs, endMs),
  ])

  const weights = weightRes.status === 'fulfilled' ? weightRes.value : []
  const bfPcts  = bfRes.status     === 'fulfilled' ? bfRes.value     : []

  const byDate = new Map<string, DailyBodyData>()
  const get = (date: string): DailyBodyData => {
    if (!byDate.has(date)) byDate.set(date, { date, weightKg: null, bodyFatPct: null })
    return byDate.get(date)!
  }

  for (const p of weights) {
    const date = civilToDateStr(p.civilStartTime)
    const grams = p.weight?.weightGramsAvg
    if (date && grams != null) get(date).weightKg = Math.round(grams / 100) / 10  // g → kg, 1 decimal
  }
  for (const p of bfPcts) {
    const date = civilToDateStr(p.civilStartTime)
    const pct = p.bodyFat?.bodyFatPercentageAvg
    if (date && pct != null) get(date).bodyFatPct = Math.round(pct * 10) / 10
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
