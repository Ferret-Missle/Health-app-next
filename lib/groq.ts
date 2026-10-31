// Provider-agnostic LLM adapter (FR-4.3). Default = Gemini free tier (Google AI
// Studio, OpenAI-compatible endpoint); BYOK lets the user point at any
// OpenAI-compatible /chat/completions endpoint.
// Groq の llama-3.3-70b-versatile は 2026-08-16 に廃止されたため既定を変更した。

export interface LlmMessage {
  role:    'system' | 'user' | 'assistant'
  content: string
}

/** Rate-limit signals parsed from Groq's x-ratelimit-* response headers. */
export interface RateLimit {
  remainingRequests: number | null  // x-ratelimit-remaining-requests (RPD remaining)
  remainingTokens:   number | null  // x-ratelimit-remaining-tokens (TPM remaining, per minute)
  resetRequests:     string | null  // x-ratelimit-reset-requests (e.g. "2m59s")
}

export interface LlmResult {
  text:         string
  promptTokens: number
  compTokens:   number
  rateLimit:    RateLimit
}

export interface LlmConfig {
  provider?: 'groq' | 'byok'
  apiKey?:   string   // BYOK key; falls back to GEMINI_API_KEY for the default provider
  baseUrl?:  string   // BYOK endpoint; defaults to Gemini
  model?:    string
}

const DEFAULT_BASE  = 'https://generativelanguage.googleapis.com/v1beta/openai'
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
// 既定経路は思考トークンも max_tokens を消費するため、BYOK より大きく取る。
const BYOK_MAX_TOKENS    = 700
const DEFAULT_MAX_TOKENS = 2048

const toInt = (v: string | null): number | null => {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

// 一時的な過負荷 (503: high demand 等) は数秒で解消することが多いため自動リトライする。
// route の maxDuration (60s) に収まるよう、待機は合計 ~7s に抑える。
const RETRY_STATUSES   = new Set([500, 502, 503, 504])
const MAX_ATTEMPTS     = 4
const RETRY_BASE_MS    = 1000
const RETRY_MAX_WAIT_MS = 5000

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Retry-After (秒) があればそれを、無ければ指数バックオフ (1s, 2s, 4s) を返す。 */
function retryDelay(res: Response, attempt: number): number {
  const ra = Number(res.headers.get('retry-after'))
  const ms = Number.isFinite(ra) && ra > 0 ? ra * 1000 : RETRY_BASE_MS * 2 ** attempt
  return Math.min(ms, RETRY_MAX_WAIT_MS)
}

export async function chat(messages: LlmMessage[], cfg: LlmConfig = {}): Promise<LlmResult> {
  const isByok  = cfg.provider === 'byok'
  const baseUrl = isByok ? (cfg.baseUrl || DEFAULT_BASE) : DEFAULT_BASE
  const apiKey  = cfg.apiKey || process.env.GEMINI_API_KEY
  const model   = cfg.model || DEFAULT_MODEL

  if (!apiKey) throw new Error('LLM API key missing (set GEMINI_API_KEY or supply a BYOK key)')

  const init: RequestInit = {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // Low temperature for consistency: the same week's data should yield
      // stable advice rather than a different angle each run.
      temperature: 0.2,
      max_tokens:  isByok ? BYOK_MAX_TOKENS : DEFAULT_MAX_TOKENS,
      // Gemini 3 は思考を完全に無効化できず、'minimal' はエラーになるため 'low' を指定する。
      // BYOK 先が未知の API の場合は送らない。
      ...(isByok ? {} : { reasoning_effort: 'low' }),
    }),
  }

  let res = await fetch(`${baseUrl}/chat/completions`, init)
  for (let attempt = 0; attempt < MAX_ATTEMPTS - 1 && RETRY_STATUSES.has(res.status); attempt++) {
    await res.text().catch(() => '')  // 接続を解放
    await sleep(retryDelay(res, attempt))
    res = await fetch(`${baseUrl}/chat/completions`, init)
  }

  const rateLimit: RateLimit = {
    remainingRequests: toInt(res.headers.get('x-ratelimit-remaining-requests')),
    remainingTokens:   toInt(res.headers.get('x-ratelimit-remaining-tokens')),
    resetRequests:     res.headers.get('x-ratelimit-reset-requests'),
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const err = new Error(`LLM request failed: ${res.status} ${detail}`) as Error & { status?: number; rateLimit?: RateLimit }
    err.status = res.status
    err.rateLimit = rateLimit
    throw err
  }

  const json = await res.json() as {
    choices?: { message?: { content?: string } }[]
    usage?:   { prompt_tokens?: number; completion_tokens?: number }
  }

  return {
    text:         json.choices?.[0]?.message?.content?.trim() ?? '',
    promptTokens: json.usage?.prompt_tokens ?? 0,
    compTokens:   json.usage?.completion_tokens ?? 0,
    rateLimit,
  }
}
