// Provider-agnostic LLM adapter (FR-4.3). Default = Groq free tier; BYOK lets
// the user point at any OpenAI-compatible /chat/completions endpoint.

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
  apiKey?:   string   // BYOK key; falls back to GROQ_API_KEY for groq
  baseUrl?:  string   // BYOK endpoint; defaults to Groq
  model?:    string
}

const GROQ_BASE  = 'https://api.groq.com/openai/v1'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

const toInt = (v: string | null): number | null => {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

export async function chat(messages: LlmMessage[], cfg: LlmConfig = {}): Promise<LlmResult> {
  const isByok  = cfg.provider === 'byok'
  const baseUrl = isByok ? (cfg.baseUrl || GROQ_BASE) : GROQ_BASE
  const apiKey  = cfg.apiKey || process.env.GROQ_API_KEY
  const model   = cfg.model || GROQ_MODEL

  if (!apiKey) throw new Error('LLM API key missing (set GROQ_API_KEY or supply a BYOK key)')

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
