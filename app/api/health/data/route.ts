import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import type { DailyRow } from '@/lib/data'
import { userGuard } from '@/lib/firebase-admin'

// Always run at request time: this reads live DB rows.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const daysParam = req.nextUrl.searchParams.get('days')
  const days = Math.min(Math.max(parseInt(daysParam ?? '120', 10) || 120, 1), 365)

  // Most recent `days` rows, returned ascending so cum accumulates oldest→newest.
  const rows = await sql`
    SELECT date::text AS date,
           burn_kcal, steps, heart_rate_avg, sleep_min,
           weight_kg, body_fat_pct,
           intake_kcal, p_g, f_g, c_g
    FROM (
      SELECT * FROM daily_data WHERE user_id = ${uid} ORDER BY date DESC LIMIT ${days}
    ) recent
    ORDER BY date ASC
  ` as DailyRow[]

  // Latest write across this user's rows = last successful sync (survives reloads).
  const meta = await sql`SELECT MAX(updated_at) AS last_synced FROM daily_data WHERE user_id = ${uid}` as { last_synced: string | null }[]
  const lastSynced = meta[0]?.last_synced ?? null

  return NextResponse.json({ rows, lastSynced })
}
