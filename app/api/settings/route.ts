import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { userGuard } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

interface SettingsRow { target_kg: string; target_days: number; target_date: string | null; llm: string }

const DEFAULT_DAYS = 86

// The goal is stored as an absolute date (target_date). Days-left is derived on
// the client from (target_date − today), so it counts down as time passes.
function todayPlusDaysJst(days: number): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  jst.setUTCDate(jst.getUTCDate() + days)
  return jst.toISOString().slice(0, 10)
}

function defaults() {
  return { tgtW: 72.0, tgtDate: todayPlusDaysJst(DEFAULT_DAYS), llm: 'groq' as const }
}

// GET: current goal settings (defaults if no row yet).
export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const rows = await sql`SELECT target_kg, target_days, target_date::text AS target_date, llm
                         FROM user_settings WHERE user_id = ${uid}` as SettingsRow[]
  if (rows.length === 0) return NextResponse.json(defaults())

  const row = rows[0]
  // Migrate legacy rows that only have target_days: anchor the date at today+days.
  const tgtDate = row.target_date ?? todayPlusDaysJst(row.target_days ?? DEFAULT_DAYS)

  return NextResponse.json({
    tgtW:    parseFloat(row.target_kg),
    tgtDate,
    llm:     row.llm,
  })
}

// PUT: upsert goal settings. Body: { tgtW?, tgtDate?, llm? }
export async function PUT(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const body = await req.json().catch(() => ({})) as { tgtW?: number; tgtDate?: string; llm?: string }

  const tgtW = body.tgtW != null ? Math.min(Math.max(body.tgtW, 30), 200) : 72.0
  const llm  = body.llm === 'byok' ? 'byok' : 'groq'
  // Accept YYYY-MM-DD only; fall back to default horizon if malformed.
  const tgtDate = /^\d{4}-\d{2}-\d{2}$/.test(body.tgtDate ?? '')
    ? body.tgtDate!
    : todayPlusDaysJst(DEFAULT_DAYS)

  await sql`
    INSERT INTO user_settings (user_id, target_kg, target_date, llm)
    VALUES (${uid}, ${tgtW}, ${tgtDate}, ${llm})
    ON CONFLICT (user_id) DO UPDATE SET
      target_kg   = ${tgtW},
      target_date = ${tgtDate},
      llm         = ${llm},
      updated_at  = NOW()
  `

  return NextResponse.json({ ok: true, tgtW, tgtDate, llm })
}
