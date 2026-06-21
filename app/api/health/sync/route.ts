import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAccessToken } from '@/lib/google-auth'
import { fetchActivityData, fetchBodyData } from '@/lib/google-fit'
import { sql } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { days?: number }
  const days = Math.min(body.days ?? 7, 90)

  let accessToken: string
  try {
    accessToken = await getGoogleAccessToken()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'Google not connected', detail: msg }, { status: 401 })
  }

  // Compute JST-midnight-aligned window
  const nowUtcMs  = Date.now()
  const jstOffset = 9 * 3600 * 1000
  const todayJst  = new Date(nowUtcMs + jstOffset)
  todayJst.setUTCHours(0, 0, 0, 0)
  const endMs   = todayJst.getTime() - jstOffset + 86400000  // end of today JST in UTC ms
  const startMs = endMs - days * 86400000

  const [activityResult, bodyResult] = await Promise.allSettled([
    fetchActivityData(accessToken, startMs, endMs),
    fetchBodyData(accessToken, startMs, endMs),
  ])

  const activityData = activityResult.status === 'fulfilled' ? activityResult.value : []
  const bodyData     = bodyResult.status      === 'fulfilled' ? bodyResult.value     : []

  for (const d of activityData) {
    await sql`
      INSERT INTO daily_data (date, burn_kcal, steps, heart_rate_avg, sleep_min)
      VALUES (${d.date}, ${d.burnKcal}, ${d.steps}, ${d.heartRateAvg}, ${d.sleepMin})
      ON CONFLICT (date) DO UPDATE SET
        burn_kcal      = COALESCE(${d.burnKcal},     daily_data.burn_kcal),
        steps          = COALESCE(${d.steps},         daily_data.steps),
        heart_rate_avg = COALESCE(${d.heartRateAvg}, daily_data.heart_rate_avg),
        sleep_min      = COALESCE(${d.sleepMin},      daily_data.sleep_min),
        updated_at     = NOW()
    `
  }

  for (const d of bodyData) {
    await sql`
      INSERT INTO daily_data (date, weight_kg, body_fat_pct)
      VALUES (${d.date}, ${d.weightKg}, ${d.bodyFatPct})
      ON CONFLICT (date) DO UPDATE SET
        weight_kg    = COALESCE(${d.weightKg},   daily_data.weight_kg),
        body_fat_pct = COALESCE(${d.bodyFatPct}, daily_data.body_fat_pct),
        updated_at   = NOW()
    `
  }

  const errors: string[] = []
  if (activityResult.status === 'rejected') errors.push(`activity: ${activityResult.reason}`)
  if (bodyResult.status     === 'rejected') errors.push(`body: ${bodyResult.reason}`)

  return NextResponse.json({
    ok:     true,
    synced: { activity: activityData.length, body: bodyData.length },
    ...(errors.length ? { errors } : {}),
  })
}
