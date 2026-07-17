import { type NextRequest, NextResponse } from 'next/server'
import type { LlmConfig } from '@/lib/groq'
import { estimateQuota, getCachedRpd } from '@/lib/quota'
import { userGuard } from '@/lib/firebase-admin'
import { generateAdvice, logAdvice } from '@/lib/advice-core'
import type { AdvisorPersona } from '@/lib/advisor'

const PERSONAS: AdvisorPersona[] = ['friend', 'trainer', 'strict', 'custom']

export const dynamic = 'force-dynamic'
// LLM generation can take a while; lift above the default function timeout.
export const maxDuration = 60

// GET: quota estimate for the home button label (no LLM call).
export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const quota = await estimateQuota(uid, getCachedRpd(uid))
  return NextResponse.json({ quota })
}

// POST: generate advice. Body: { tgtW, days, persona?, personaCustom?, provider?, apiKey?, baseUrl?, model? }
export async function POST(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const body = await req.json().catch(() => ({})) as {
    tgtW?: number; days?: number; persona?: string; personaCustom?: string
  } & LlmConfig

  const persona = PERSONAS.includes(body.persona as AdvisorPersona) ? (body.persona as AdvisorPersona) : 'trainer'

  const result = await generateAdvice({
    userId: uid,
    tgtW: body.tgtW ?? 72,
    days: body.days ?? 90,
    persona, personaCustom: body.personaCustom,
    cfg:  { provider: body.provider, apiKey: body.apiKey, baseUrl: body.baseUrl, model: body.model },
  })

  if (!result.ok) {
    const status = result.reason === 'quota_exhausted' || result.reason === 'rate_limited' ? 429
      : result.reason === 'no_data' ? 400 : 502
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message, quota: result.quota },
      { status },
    )
  }

  await logAdvice(uid, 'manual', result.advice)

  return NextResponse.json({
    ok:     true,
    advice: result.advice,
    usage:  { promptTokens: result.promptTokens, compTokens: result.compTokens },
    quota:  result.quota,
  })
}
