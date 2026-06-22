import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAccessToken } from '@/lib/google-auth'
import { fetchActivityData, fetchBodyData } from '@/lib/google-health'
import { fetchIntakeData } from '@/lib/fatsecret'
import { sql } from '@/lib/db'
import { ownerGuard } from '@/lib/firebase-admin'

export async function POST(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { days?: number }
  const days = Math.min(body.days ?? 7, 90)

  // Compute JST-midnight-aligned window
  const nowUtcMs  = Date.now()
  const jstOffset = 9 * 3600 * 1000
  const todayJst  = new Date(nowUtcMs + jstOffset)
  todayJst.setUTCHours(0, 0, 0, 0)
  const endMs   = todayJst.getTime() - jstOffset + 86400000  // end of today JST in UTC ms
  const startMs = endMs - days * 86400000

  // Each provider is independent: one being unlinked must not block the others.
  // Per spec v0.10: activity + body composition = Google Health; intake = FatSecret.
  const googleData = (async () => {
    const accessToken = await getGoogleAccessToken()
    return Promise.all([
      fetchActivityData(accessToken, startMs, endMs),
      fetchBodyData(accessToken, startMs, endMs),
    ])
  })()

  const [googleResult, intakeResult] = await Promise.allSettled([
    googleData,
    fetchIntakeData(startMs, endMs),
  ])

  const [activityData, bodyData] =
    googleResult.status === 'fulfilled' ? googleResult.value : [[], []]
  const intakeData = intakeResult.status === 'fulfilled' ? intakeResult.value : []

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

  for (const d of intakeData) {
    await sql`
      INSERT INTO daily_data (date, intake_kcal, p_g, f_g, c_g)
      VALUES (${d.date}, ${d.intakeKcal}, ${d.pG}, ${d.fG}, ${d.cG})
      ON CONFLICT (date) DO UPDATE SET
        intake_kcal = COALESCE(${d.intakeKcal}, daily_data.intake_kcal),
        p_g         = COALESCE(${d.pG},          daily_data.p_g),
        f_g         = COALESCE(${d.fG},          daily_data.f_g),
        c_g         = COALESCE(${d.cG},          daily_data.c_g),
        updated_at  = NOW()
    `
  }

  const errors: string[] = []
  if (googleResult.status === 'rejected') errors.push(`google: ${googleResult.reason}`)
  if (intakeResult.status === 'rejected') errors.push(`intake: ${intakeResult.reason}`)

  return NextResponse.json({
    ok:     true,
    synced: { activity: activityData.length, body: bodyData.length, intake: intakeData.length },
    ...(errors.length ? { errors } : {}),
  })
}
