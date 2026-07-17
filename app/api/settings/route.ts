import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { userGuard } from '@/lib/firebase-admin'
import type { AdvisorPersona } from '@/lib/advisor'

export const dynamic = 'force-dynamic'

interface SettingsRow {
  target_kg: string; target_days: number; target_date: string | null; llm: string
  advisor_persona: string | null; advisor_persona_custom: string | null
}

const DEFAULT_DAYS = 86
const PERSONAS: AdvisorPersona[] = ['friend', 'trainer', 'strict', 'custom']
const PERSONA_CUSTOM_MAX_LEN = 300

// The goal is stored as an absolute date (target_date). Days-left is derived on
// the client from (target_date − today), so it counts down as time passes.
function todayPlusDaysJst(days: number): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  jst.setUTCDate(jst.getUTCDate() + days)
  return jst.toISOString().slice(0, 10)
}

function defaults() {
  // advisorPersona: null (not yet chosen) — the client prompts a first-launch
  // onboarding pick rather than silently defaulting to one.
  return {
    tgtW: 72.0, tgtDate: todayPlusDaysJst(DEFAULT_DAYS), llm: 'groq' as const,
    advisorPersona: null as AdvisorPersona | null, advisorPersonaCustom: null as string | null,
  }
}

// GET: current goal settings (defaults if no row yet).
export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const rows = await sql`SELECT target_kg, target_days, target_date::text AS target_date, llm,
                                advisor_persona, advisor_persona_custom
                         FROM user_settings WHERE user_id = ${uid}` as SettingsRow[]
  if (rows.length === 0) return NextResponse.json(defaults())

  const row = rows[0]
  // Migrate legacy rows that only have target_days: anchor the date at today+days.
  const tgtDate = row.target_date ?? todayPlusDaysJst(row.target_days ?? DEFAULT_DAYS)
  const advisorPersona = PERSONAS.includes(row.advisor_persona as AdvisorPersona)
    ? (row.advisor_persona as AdvisorPersona) : null

  return NextResponse.json({
    tgtW:    parseFloat(row.target_kg),
    tgtDate,
    llm:     row.llm,
    advisorPersona,
    advisorPersonaCustom: advisorPersona === 'custom' ? row.advisor_persona_custom : null,
  })
}

// PUT: upsert goal settings. Body: { tgtW?, tgtDate?, llm?, advisorPersona?, advisorPersonaCustom? }
export async function PUT(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const body = await req.json().catch(() => ({})) as {
    tgtW?: number; tgtDate?: string; llm?: string
    advisorPersona?: string | null; advisorPersonaCustom?: string | null
  }

  const tgtW = body.tgtW != null ? Math.min(Math.max(body.tgtW, 30), 200) : 72.0
  const llm  = body.llm === 'byok' ? 'byok' : 'groq'
  // Accept YYYY-MM-DD only; fall back to default horizon if malformed.
  const tgtDate = /^\d{4}-\d{2}-\d{2}$/.test(body.tgtDate ?? '')
    ? body.tgtDate!
    : todayPlusDaysJst(DEFAULT_DAYS)

  const advisorPersona = PERSONAS.includes(body.advisorPersona as AdvisorPersona)
    ? (body.advisorPersona as AdvisorPersona) : null
  // Custom text only means anything for persona='custom'; drop it otherwise so a
  // stale free-text description can't linger and reappear if the user switches back.
  const advisorPersonaCustom = advisorPersona === 'custom' && body.advisorPersonaCustom
    ? body.advisorPersonaCustom.trim().slice(0, PERSONA_CUSTOM_MAX_LEN)
    : null

  await sql`
    INSERT INTO user_settings (user_id, target_kg, target_date, llm, advisor_persona, advisor_persona_custom)
    VALUES (${uid}, ${tgtW}, ${tgtDate}, ${llm}, ${advisorPersona}, ${advisorPersonaCustom})
    ON CONFLICT (user_id) DO UPDATE SET
      target_kg              = ${tgtW},
      target_date             = ${tgtDate},
      llm                     = ${llm},
      advisor_persona         = ${advisorPersona},
      advisor_persona_custom  = ${advisorPersonaCustom},
      updated_at              = NOW()
  `

  return NextResponse.json({ ok: true, tgtW, tgtDate, llm, advisorPersona, advisorPersonaCustom })
}
