import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { userGuard } from '@/lib/firebase-admin'
import { generateAdvice, logAdvice, DEFAULT_K } from '@/lib/advice-core'
import type { LlmConfig } from '@/lib/groq'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// FR-4.4: weekly auto-run on Sunday + next-launch catch-up. No standing cron
// (NFR-4) — the client pings this on launch and we run it at most once per week.
// The "week" is keyed by the most recent Sunday (JST), so a launch any day after
// Sunday with no run yet still triggers the catch-up.

/** The JST date (YYYY-MM-DD) of the Sunday on/just before `now`. */
function currentWeekStartJst(now = new Date()): string {
  // Shift to JST, then back the date up to the preceding Sunday.
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const dow = jst.getUTCDay() // 0 = Sunday (in the shifted clock)
  jst.setUTCDate(jst.getUTCDate() - dow)
  return jst.toISOString().slice(0, 10)
}

// POST: run the weekly advice if this week's hasn't run yet.
// Body (optional): { tgtW, days, k, provider, apiKey, baseUrl, model }
export async function POST(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const body = await req.json().catch(() => ({})) as {
    tgtW?: number; days?: number; k?: number
  } & LlmConfig

  const weekStart = currentWeekStartJst()

  // Already ran this week? Return the stored advice instead of spending a call.
  const existing = await sql`
    SELECT advice, created_at FROM advice_log
    WHERE user_id = ${uid} AND kind = 'weekly' AND week_start = ${weekStart}
    LIMIT 1
  ` as { advice: string; created_at: string }[]
  if (existing.length) {
    return NextResponse.json({
      ran: false, reason: 'already_done', weekStart,
      advice: existing[0].advice, createdAt: existing[0].created_at,
    })
  }

  const result = await generateAdvice({
    userId: uid,
    tgtW: body.tgtW ?? 72,
    days: body.days ?? 90,
    k:    body.k ?? DEFAULT_K,
    cfg:  { provider: body.provider, apiKey: body.apiKey, baseUrl: body.baseUrl, model: body.model },
  })

  if (!result.ok) {
    // Quota exhausted → skip & notify (FR-4.4). Other failures are transient.
    return NextResponse.json({
      ran: false, reason: result.reason, weekStart,
      message: result.message, quota: result.quota,
    })
  }

  // Persist under a unique (week_start) index; a concurrent run loses the race
  // harmlessly (ON CONFLICT DO NOTHING) so we never double-charge a week.
  await sql`
    INSERT INTO advice_log (user_id, kind, week_start, advice)
    VALUES (${uid}, 'weekly', ${weekStart}, ${result.advice})
    ON CONFLICT (user_id, week_start) WHERE kind = 'weekly' DO NOTHING
  `

  return NextResponse.json({ ran: true, weekStart, advice: result.advice, quota: result.quota })
}
