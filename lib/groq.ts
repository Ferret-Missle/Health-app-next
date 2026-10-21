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
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

const toInt = (v: string | null): number | null => {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

export async function chat(messages: LlmMessage[], cfg: LlmConfig = {}): Promise<LlmResult> {
  const isByok  = cfg.provider === 'byok'
  const baseUrl = isByok ? (cfg.baseUrl || DEFAULT_BASE) : DEFAULT_BASE
  const apiKey  = cfg.apiKey || process.env.GEMINI_API_KEY
  const model   = cfg.model || DEFAULT_MODEL

  if (!apiKey) throw new Error('LLM API key missing (set GEMINI_API_KEY or supply a BYOK key)')

  const res = await fetch(`${baseUrl}/chat/completions`, {
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
      max_tokens:  700,
      // Gemini 2.5 Flash は思考トークンが max_tokens を消費し本文が空になり得るため、
      // 既定プロバイダーでは思考を無効化する。BYOK 先が未知の API の場合は送らない。
      ...(isByok ? {} : { reasoning_effort: 'none' }),
    }),
  })

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
