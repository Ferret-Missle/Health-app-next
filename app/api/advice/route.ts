import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { rowsToDayData, type DailyRow } from '@/lib/data'
import { buildAdvicePrompt } from '@/lib/advisor'
import { chat, type LlmConfig, type RateLimit } from '@/lib/groq'
import { estimateQuota, recordUsage, cacheRpd, getCachedRpd } from '@/lib/quota'
import { ownerGuard } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

const DEFAULT_K = 7200

async function recentData(days = 14) {
  const rows = await sql`
    SELECT date::text AS date,
           burn_kcal, steps, heart_rate_avg, sleep_min,
           weight_kg, body_fat_pct,
           intake_kcal, p_g, f_g, c_g
    FROM (SELECT * FROM daily_data ORDER BY date DESC LIMIT ${days}) recent
    ORDER BY date ASC
  ` as DailyRow[]
  return rowsToDayData(rows)
}

// GET: quota estimate for the home button label (no LLM call).
export async function GET(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const quota = await estimateQuota(getCachedRpd())
  return NextResponse.json({ quota })
}

// POST: generate advice. Body: { tgtW, days, k?, provider?, apiKey?, baseUrl?, model? }
export async function POST(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as {
    tgtW?: number; days?: number; k?: number
  } & LlmConfig

  const provider = body.provider ?? 'groq'

  // Pre-flight quota check for the default (Groq) provider only — BYOK is the user's own budget.
  if (provider === 'groq') {
    const pre = await estimateQuota(getCachedRpd())
    if (pre.exhausted) {
      return NextResponse.json(
        { ok: false, reason: 'quota_exhausted', quota: pre },
        { status: 429 },
      )
    }
  }

  const data = await recentData(14)
  if (data.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no_data' }, { status: 400 })
  }

  const messages = buildAdvicePrompt({
    data,
    tgtW: body.tgtW ?? 72,
    days: body.days ?? 90,
    k:    body.k ?? DEFAULT_K,
  })

  try {
    const result = await chat(messages, {
      provider,
      apiKey:  body.apiKey,
      baseUrl: body.baseUrl,
      model:   body.model,
    })

    // Track usage (Groq free tier self-management). BYOK is the user's own budget,
    // but recording it lets us show token usage too.
    await recordUsage(result.promptTokens, result.compTokens, provider)
    cacheRpd(result.rateLimit)

    const quota = await estimateQuota(result.rateLimit.remainingRequests)

    return NextResponse.json({
      ok:     true,
      advice: result.text,
      usage:  { promptTokens: result.promptTokens, compTokens: result.compTokens },
      quota,
    })
  } catch (e) {
    const err = e as Error & { status?: number; rateLimit?: RateLimit }
    if (err.rateLimit) cacheRpd(err.rateLimit)
    const status = err.status === 429 ? 429 : 502
    const reason = err.status === 429 ? 'rate_limited' : 'llm_error'
    return NextResponse.json({ ok: false, reason, message: err.message }, { status })
  }
}
