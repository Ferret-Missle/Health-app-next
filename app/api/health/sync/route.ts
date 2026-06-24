import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAccessToken } from '@/lib/google-auth'
import { fetchActivityData, fetchBodyData } from '@/lib/google-health'
import { fetchIntakeData } from '@/lib/fatsecret'
import { sql } from '@/lib/db'
import { ownerGuard } from '@/lib/firebase-admin'

// Backfills can fetch many days (chunked); allow the full Hobby-tier ceiling so
// month-scale syncs don't hit the default 10s function timeout (R3).
export const maxDuration = 60

// Streams sync progress as Server-Sent Events so the UI can show a real,
// step-based progress bar instead of an indeterminate spinner.
//
// Steps (each advances the bar): Google activity → body composition →
// FatSecret intake → DB save → done. Providers are independent: a failure in
// one is reported but doesn't abort the others.

export async function POST(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { days?: number }
  const days = Math.min(body.days ?? 7, 90)

  // JST-midnight-aligned window
  const jstOffset = 9 * 3600 * 1000
  const todayJst  = new Date(Date.now() + jstOffset)
  todayJst.setUTCHours(0, 0, 0, 0)
  const endMs   = todayJst.getTime() - jstOffset + 86400000
  const startMs = endMs - days * 86400000

  const STEPS = 5  // activity, body, intake, save, done

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: Record<string, unknown>) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))
      const progress = (step: number, label: string) =>
        send({ type: 'progress', step, total: STEPS, pct: Math.round((step / STEPS) * 100), label })

      const errors: string[] = []
      let accessToken: string | null = null

      // Step 1: Google activity
      progress(0, 'Google Health に接続中…')
      let activityData: Awaited<ReturnType<typeof fetchActivityData>> = []
      let bodyData: Awaited<ReturnType<typeof fetchBodyData>> = []
      try {
        accessToken = await getGoogleAccessToken()
        progress(1, '活動データ(消費・歩数・心拍・睡眠)を取得中…')
        activityData = await fetchActivityData(accessToken, startMs, endMs)
      } catch (e) {
        errors.push(`google: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Step 2: Google body composition (only if Google auth succeeded)
      progress(2, '体重・体脂肪を取得中…')
      if (accessToken) {
        try {
          bodyData = await fetchBodyData(accessToken, startMs, endMs)
        } catch (e) {
          errors.push(`google-body: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // Step 3: FatSecret intake
      progress(3, '食事(摂取カロリー・PFC)を取得中…')
      let intakeData: Awaited<ReturnType<typeof fetchIntakeData>> = []
      try {
        intakeData = await fetchIntakeData(startMs, endMs)
      } catch (e) {
        errors.push(`intake: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Step 4: save to DB
      progress(4, 'データベースに保存中…')
      try {
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
            INSERT INTO daily_data (date, intake_kcal, p_g, f_g, c_g, foods)
            VALUES (${d.date}, ${d.intakeKcal}, ${d.pG}, ${d.fG}, ${d.cG}, ${d.foods})
            ON CONFLICT (date) DO UPDATE SET
              intake_kcal = COALESCE(${d.intakeKcal}, daily_data.intake_kcal),
              p_g         = COALESCE(${d.pG},          daily_data.p_g),
              f_g         = COALESCE(${d.fG},          daily_data.f_g),
              c_g         = COALESCE(${d.cG},          daily_data.c_g),
              foods       = COALESCE(${d.foods},       daily_data.foods),
              updated_at  = NOW()
          `
        }
      } catch (e) {
        errors.push(`save: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Step 5: done
      send({
        type:   'done',
        step:   STEPS,
        total:  STEPS,
        pct:    100,
        label:  '完了',
        synced: { activity: activityData.length, body: bodyData.length, intake: intakeData.length },
        ...(errors.length ? { errors } : {}),
      })
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
    },
  })
}
