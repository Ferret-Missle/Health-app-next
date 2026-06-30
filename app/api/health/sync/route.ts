import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAccessToken } from '@/lib/google-auth'
import { fetchActivityData, fetchBodyData } from '@/lib/google-health'
import { fetchIntakeData } from '@/lib/fatsecret'
import { sql } from '@/lib/db'
import { userGuard } from '@/lib/firebase-admin'

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
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const body = await req.json().catch(() => ({})) as { days?: number }
  // Recent syncs send 7; the full-period sync (post-link / settings button) sends
  // up to a year. Cap at 365 — that's also the display window ceiling.
  const days = Math.min(Math.max(body.days ?? 7, 1), 365)

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
        accessToken = await getGoogleAccessToken(uid)
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
        intakeData = await fetchIntakeData(uid, startMs, endMs)
      } catch (e) {
        errors.push(`intake: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Step 4: save to DB. Merge all three sources by date into one row each, then
      // upsert the days in parallel — Neon is in Singapore, so serial round-trips
      // (previously up to 3×N) add up and can blow the 60s function limit. Merging
      // by date also avoids concurrent upserts racing on the same row.
      progress(4, 'データベースに保存中…')
      try {
        type Merged = {
          date: string
          burnKcal?: number | null; steps?: number | null; heartRateAvg?: number | null; sleepMin?: number | null
          weightKg?: number | null; bodyFatPct?: number | null
          intakeKcal?: number | null; pG?: number | null; fG?: number | null; cG?: number | null; foods?: string | null
        }
        const byDate = new Map<string, Merged>()
        const at = (date: string) => { let m = byDate.get(date); if (!m) { m = { date }; byDate.set(date, m) } return m }
        for (const d of activityData) Object.assign(at(d.date), { burnKcal: d.burnKcal, steps: d.steps, heartRateAvg: d.heartRateAvg, sleepMin: d.sleepMin })
        for (const d of bodyData)     Object.assign(at(d.date), { weightKg: d.weightKg, bodyFatPct: d.bodyFatPct })
        for (const d of intakeData)   Object.assign(at(d.date), { intakeKcal: d.intakeKcal, pG: d.pG, fG: d.fG, cG: d.cG, foods: d.foods })

        await Promise.all([...byDate.values()].map(d => sql`
          INSERT INTO daily_data (user_id, date, burn_kcal, steps, heart_rate_avg, sleep_min, weight_kg, body_fat_pct, intake_kcal, p_g, f_g, c_g, foods)
          VALUES (${uid}, ${d.date}, ${d.burnKcal ?? null}, ${d.steps ?? null}, ${d.heartRateAvg ?? null}, ${d.sleepMin ?? null},
                  ${d.weightKg ?? null}, ${d.bodyFatPct ?? null}, ${d.intakeKcal ?? null}, ${d.pG ?? null}, ${d.fG ?? null}, ${d.cG ?? null}, ${d.foods ?? null})
          ON CONFLICT (user_id, date) DO UPDATE SET
            burn_kcal      = COALESCE(${d.burnKcal ?? null},     daily_data.burn_kcal),
            steps          = COALESCE(${d.steps ?? null},         daily_data.steps),
            heart_rate_avg = COALESCE(${d.heartRateAvg ?? null}, daily_data.heart_rate_avg),
            sleep_min      = COALESCE(${d.sleepMin ?? null},      daily_data.sleep_min),
            weight_kg      = COALESCE(${d.weightKg ?? null},      daily_data.weight_kg),
            body_fat_pct   = COALESCE(${d.bodyFatPct ?? null},    daily_data.body_fat_pct),
            intake_kcal    = COALESCE(${d.intakeKcal ?? null},    daily_data.intake_kcal),
            p_g            = COALESCE(${d.pG ?? null},            daily_data.p_g),
            f_g            = COALESCE(${d.fG ?? null},            daily_data.f_g),
            c_g            = COALESCE(${d.cG ?? null},            daily_data.c_g),
            foods          = COALESCE(${d.foods ?? null},         daily_data.foods),
            updated_at     = NOW()
        `))
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
