import { type NextRequest, NextResponse } from 'next/server'
import type { LlmConfig } from '@/lib/groq'
import { estimateQuota, getCachedRpd } from '@/lib/quota'
import { ownerGuard } from '@/lib/firebase-admin'
import { generateAdvice, logAdvice, DEFAULT_K } from '@/lib/advice-core'

export const dynamic = 'force-dynamic'
// LLM generation can take a while; lift above the default function timeout.
export const maxDuration = 60

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

  const result = await generateAdvice({
    tgtW: body.tgtW ?? 72,
    days: body.days ?? 90,
    k:    body.k ?? DEFAULT_K,
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

  await logAdvice('manual', result.advice)

  return NextResponse.json({
    ok:     true,
    advice: result.advice,
    usage:  { promptTokens: result.promptTokens, compTokens: result.compTokens },
    quota:  result.quota,
  })
}
