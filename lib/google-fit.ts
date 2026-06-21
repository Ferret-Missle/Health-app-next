const FIT_API = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate'

// Google Fit returns nanosecond timestamps as strings
interface FitPoint {
  startTimeNanos: string
  endTimeNanos:   string
  value: Array<{ fpVal?: number; intVal?: number }>
}

interface FitBucket {
  startTimeMillis: string
  endTimeMillis:   string
  dataset: Array<{ point: FitPoint[] }>
}

interface FitAggregateResponse {
  bucket?: FitBucket[]
}

async function aggregate(
  accessToken: string,
  dataTypeName: string,
  startMs: number,
  endMs: number,
): Promise<FitBucket[]> {
  const res = await fetch(FIT_API, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      aggregateBy:    [{ dataTypeName }],
      bucketByTime:   { durationMillis: 86400000 },
      startTimeMillis: startMs,
      endTimeMillis:   endMs,
    }),
  })
  if (!res.ok) {
    throw new Error(`Fit API [${dataTypeName}] ${res.status}: ${await res.text()}`)
  }
  const data = await res.json() as FitAggregateResponse
  return data.bucket ?? []
}

// Converts the start-of-bucket millis → JST date string YYYY-MM-DD
function toJstDate(ms: number): string {
  const jst = new Date(ms + 9 * 3600 * 1000)
  return jst.toISOString().slice(0, 10)
}

export interface DailyActivityData {
  date:          string
  burnKcal:      number | null  // total calories (BMR + active)
  steps:         number | null
  heartRateAvg:  number | null
  sleepMin:      number | null
}

export interface DailyBodyData {
  date:        string
  weightKg:    number | null
  bodyFatPct:  number | null
}

export async function fetchActivityData(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<DailyActivityData[]> {
  const [caloriesResult, stepsResult, hrResult, sleepResult, bmrResult] = await Promise.allSettled([
    aggregate(accessToken, 'com.google.calories.expended',   startMs, endMs),
    aggregate(accessToken, 'com.google.step_count.delta',    startMs, endMs),
    aggregate(accessToken, 'com.google.heart_rate.bpm',      startMs, endMs),
    aggregate(accessToken, 'com.google.sleep.segment',       startMs, endMs),
    aggregate(accessToken, 'com.google.calories.bmr',        startMs, endMs),
  ])

  const calories = caloriesResult.status === 'fulfilled' ? caloriesResult.value : []
  const steps    = stepsResult.status    === 'fulfilled' ? stepsResult.value    : []
  const hr       = hrResult.status       === 'fulfilled' ? hrResult.value       : []
  const sleep    = sleepResult.status    === 'fulfilled' ? sleepResult.value    : []
  const bmr      = bmrResult.status      === 'fulfilled' ? bmrResult.value      : []

  const byDate = new Map<string, DailyActivityData>()
  const get = (date: string): DailyActivityData => {
    if (!byDate.has(date)) byDate.set(date, { date, burnKcal: null, steps: null, heartRateAvg: null, sleepMin: null })
    return byDate.get(date)!
  }

  // Total calories (com.google.calories.expended includes activity-derived total from most sources)
  for (const b of calories) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const total = b.dataset[0]?.point.reduce((s, p) => s + (p.value[0]?.fpVal ?? 0), 0) ?? 0
    if (total > 0) get(date).burnKcal = Math.round(total)
  }

  // Fallback: for days where calories.expended = 0, use BMR (rateKcalPerDay * 1 day)
  for (const b of bmr) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const entry = get(date)
    if (!entry.burnKcal) {
      const pts = b.dataset[0]?.point ?? []
      if (pts.length > 0) {
        const avgRate = pts.reduce((s, p) => s + (p.value[0]?.fpVal ?? 0), 0) / pts.length
        entry.burnKcal = Math.round(avgRate)
      }
    }
  }

  // Steps
  for (const b of steps) {
    const date  = toJstDate(parseInt(b.startTimeMillis))
    const total = b.dataset[0]?.point.reduce((s, p) => s + (p.value[0]?.intVal ?? 0), 0) ?? 0
    if (total > 0) get(date).steps = total
  }

  // Heart rate (bucket average)
  for (const b of hr) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const pts  = b.dataset[0]?.point ?? []
    if (pts.length > 0) {
      const avg = pts.reduce((s, p) => s + (p.value[0]?.fpVal ?? 0), 0) / pts.length
      get(date).heartRateAvg = Math.round(avg)
    }
  }

  // Sleep: sum non-awake segments (segment type 3 = awake)
  for (const b of sleep) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const pts  = b.dataset[0]?.point ?? []
    const totalMs = pts
      .filter(p => (p.value[0]?.intVal ?? 0) !== 3)
      .reduce((s, p) => {
        const durationNs = BigInt(p.endTimeNanos) - BigInt(p.startTimeNanos)
        return s + Number(durationNs) / 1e6
      }, 0)
    if (totalMs > 0) get(date).sleepMin = Math.round(totalMs / 60000)
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchBodyData(
  accessToken: string,
  startMs: number,
  endMs: number,
): Promise<DailyBodyData[]> {
  const [weightResult, bfResult] = await Promise.allSettled([
    aggregate(accessToken, 'com.google.weight',              startMs, endMs),
    aggregate(accessToken, 'com.google.body.fat.percentage', startMs, endMs),
  ])

  const weights = weightResult.status === 'fulfilled' ? weightResult.value : []
  const bfPcts  = bfResult.status     === 'fulfilled' ? bfResult.value     : []

  const byDate = new Map<string, DailyBodyData>()
  const get = (date: string): DailyBodyData => {
    if (!byDate.has(date)) byDate.set(date, { date, weightKg: null, bodyFatPct: null })
    return byDate.get(date)!
  }

  for (const b of weights) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const pts  = b.dataset[0]?.point ?? []
    if (pts.length > 0) {
      const avg = pts.reduce((s, p) => s + (p.value[0]?.fpVal ?? 0), 0) / pts.length
      get(date).weightKg = Math.round(avg * 10) / 10
    }
  }

  for (const b of bfPcts) {
    const date = toJstDate(parseInt(b.startTimeMillis))
    const pts  = b.dataset[0]?.point ?? []
    if (pts.length > 0) {
      const avg = pts.reduce((s, p) => s + (p.value[0]?.fpVal ?? 0), 0) / pts.length
      get(date).bodyFatPct = Math.round(avg * 10) / 10
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
