import { sql } from './db'
import type { RateLimit } from './groq'

// Groq free-tier daily token budget (TPD). Not exposed via headers, so we track
// it ourselves in llm_usage and reset at JST midnight (NFR-7 / §143).
const TPD_LIMIT     = parseInt(process.env.GROQ_TPD_LIMIT || '100000', 10)
const BOOTSTRAP_AVG = parseInt(process.env.GROQ_BOOTSTRAP_TOKENS || '900', 10) // avg tokens/question before we have history

export interface QuotaEstimate {
  remaining:     number   // 本日あと約N回
  exhausted:     boolean
  tokensUsed:    number   // today's tokens (JST)
  avgPerQuestion: number  // moving avg used in the estimate
  remainingRpd:  number | null  // from last response header, if known
}

/** Today's (JST) total tokens and the moving-average tokens per question. */
async function todayUsage(provider = 'groq'): Promise<{ used: number; avg: number; count: number }> {
  const rows = await sql`
    SELECT prompt_tokens, comp_tokens
    FROM llm_usage
    WHERE provider = ${provider}
      AND DATE(used_at AT TIME ZONE 'Asia/Tokyo') = DATE(NOW() AT TIME ZONE 'Asia/Tokyo')
    ORDER BY used_at DESC
  ` as { prompt_tokens: number; comp_tokens: number }[]

  const used = rows.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.comp_tokens ?? 0), 0)

  // Moving average over the last few requests (today + recent), bootstrap when empty.
  const recent = await sql`
    SELECT prompt_tokens, comp_tokens
    FROM llm_usage
    WHERE provider = ${provider}
    ORDER BY used_at DESC
    LIMIT 5
  ` as { prompt_tokens: number; comp_tokens: number }[]

  const avg = recent.length
    ? recent.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.comp_tokens ?? 0), 0) / recent.length
    : BOOTSTRAP_AVG

  return { used, avg: Math.max(avg, 1), count: rows.length }
}

/**
 * 本日あと約N回 ≒ min(残りRPD, 本日の残りトークン ÷ 1質問の平均トークン)  (§143)
 * remainingRpd comes from the most recent Groq response header (persisted by the
 * caller); if unknown, only the token budget bounds the estimate.
 */
export async function estimateQuota(remainingRpd: number | null = null, provider = 'groq'): Promise<QuotaEstimate> {
  const { used, avg } = await todayUsage(provider)
  const remainingTokens = Math.max(0, TPD_LIMIT - used)
  const byTokens = Math.floor(remainingTokens / avg)
  const remaining = remainingRpd != null ? Math.min(remainingRpd, byTokens) : byTokens

  return {
    remaining:      Math.max(0, remaining),
    exhausted:      remaining <= 0,
    tokensUsed:     used,
    avgPerQuestion: Math.round(avg),
    remainingRpd,
  }
}

/** Record one LLM call's token usage. */
export async function recordUsage(promptTokens: number, compTokens: number, provider = 'groq'): Promise<void> {
  await sql`
    INSERT INTO llm_usage (provider, prompt_tokens, comp_tokens)
    VALUES (${provider}, ${promptTokens}, ${compTokens})
  `
}

/** Persist the latest header-reported remaining RPD so GET can show it without a call. */
const rpdCache: { value: number | null; at: number } = { value: null, at: 0 }

export function cacheRpd(rl: RateLimit): void {
  if (rl.remainingRequests != null) {
    rpdCache.value = rl.remainingRequests
    rpdCache.at = Date.now()
  }
}

export function getCachedRpd(): number | null {
  // Treat as stale after 10 min (RPD resets daily, but a stale value is only a hint).
  if (Date.now() - rpdCache.at > 10 * 60 * 1000) return null
  return rpdCache.value
}
