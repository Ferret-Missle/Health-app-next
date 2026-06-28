import { sql } from './db'
import { rowsToDayData, type DailyRow } from './data'
import { buildAdvicePrompt } from './advisor'
import { chat, type LlmConfig } from './groq'
import { estimateQuota, recordUsage, cacheRpd, getCachedRpd, type QuotaEstimate } from './quota'

// Shared advice-generation core, used by both the manual route and the weekly
// auto-run (FR-4.4). Keeps quota tracking / usage recording in one place.

export const DEFAULT_K = 7200

export interface GenerateArgs {
  userId: string
  tgtW: number
  days: number
  k:    number
  cfg:  LlmConfig
}

export type GenerateResult =
  | { ok: true;  advice: string; quota: QuotaEstimate; promptTokens: number; compTokens: number }
  | { ok: false; reason: 'quota_exhausted' | 'no_data' | 'rate_limited' | 'llm_error'; quota?: QuotaEstimate; message?: string }

/** Today's JST calendar date as 'YYYY-MM-DD'. */
function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function recentData(userId: string, days = 14) {
  // Exclude today (JST): the current day's food log is usually incomplete, so it
  // shows up as an outlier (near-zero intake). Advice should look at completed
  // days only. We fetch one extra day and drop today to keep `days` full.
  const rows = await sql`
    SELECT date::text AS date,
           burn_kcal, steps, heart_rate_avg, sleep_min,
           weight_kg, body_fat_pct,
           intake_kcal, p_g, f_g, c_g, foods
    FROM (
      SELECT * FROM daily_data
      WHERE user_id = ${userId} AND date < ${todayJst()}::date
      ORDER BY date DESC LIMIT ${days}
    ) recent
    ORDER BY date ASC
  ` as DailyRow[]
  return rowsToDayData(rows)
}

/**
 * Generate advice from the last 14 days and record token usage. Performs a
 * pre-flight quota check for the default (Groq) provider; BYOK skips it (the
 * user's own budget). Does NOT persist to advice_log — the caller decides that.
 */
export async function generateAdvice(args: GenerateArgs): Promise<GenerateResult> {
  const provider = args.cfg.provider ?? 'groq'
  const { userId } = args

  if (provider === 'groq') {
    const pre = await estimateQuota(userId, getCachedRpd(userId))
    if (pre.exhausted) return { ok: false, reason: 'quota_exhausted', quota: pre }
  }

  const data = await recentData(userId, 14)
  if (data.length === 0) return { ok: false, reason: 'no_data' }

  const messages = buildAdvicePrompt({ data, tgtW: args.tgtW, days: args.days, k: args.k })

  try {
    const result = await chat(messages, args.cfg)
    await recordUsage(userId, result.promptTokens, result.compTokens, provider)
    cacheRpd(userId, result.rateLimit)
    const quota = await estimateQuota(userId, result.rateLimit.remainingRequests)
    return {
      ok: true, advice: result.text, quota,
      promptTokens: result.promptTokens, compTokens: result.compTokens,
    }
  } catch (e) {
    const err = e as Error & { status?: number; rateLimit?: import('./groq').RateLimit }
    if (err.rateLimit) cacheRpd(userId, err.rateLimit)
    return {
      ok: false,
      reason: err.status === 429 ? 'rate_limited' : 'llm_error',
      message: err.message,
    }
  }
}

/** Save an advice entry. week_start is required for kind='weekly'. */
export async function logAdvice(userId: string, kind: 'manual' | 'weekly', advice: string, weekStart?: string): Promise<void> {
  await sql`
    INSERT INTO advice_log (user_id, kind, week_start, advice)
    VALUES (${userId}, ${kind}, ${weekStart ?? null}, ${advice})
  `
}
