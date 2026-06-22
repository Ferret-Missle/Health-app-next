// FatSecret OAuth 1.0 (3-legged / Signed and Delegated) authentication.
//
// Self-contained HMAC-SHA1 signing via Node's crypto — no external OAuth lib.
// OAuth 1.0 user access tokens do not expire, so once linked they persist
// (no refresh flow, unlike Google). Stored in oauth_tokens with provider='fatsecret'.
//
// Docs: https://platform.fatsecret.com/docs/guides/authentication/oauth1
import { createHmac, randomBytes } from 'crypto'
import { sql } from './db'
import { encrypt, decrypt } from './crypto'

const REQUEST_TOKEN_URL = 'https://authentication.fatsecret.com/oauth/request_token'
const AUTHORIZE_URL     = 'https://authentication.fatsecret.com/oauth/authorize'
const ACCESS_TOKEN_URL  = 'https://authentication.fatsecret.com/oauth/access_token'
export const REST_URL   = 'https://platform.fatsecret.com/rest/server.api'

// RFC3986 percent-encoding (stricter than encodeURIComponent).
function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

// Build OAuth 1.0 HMAC-SHA1 signature for a request.
// `tokenSecret` is empty for request_token, the request-token-secret for the
// access_token exchange, and the access-token-secret for API calls.
export function sign(
  method: 'GET' | 'POST',
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = '',
): string {
  const sorted = Object.keys(params).sort()
  const paramStr = sorted.map(k => `${rfc3986(k)}=${rfc3986(params[k])}`).join('&')
  const base = `${method}&${rfc3986(url)}&${rfc3986(paramStr)}`
  const key = `${rfc3986(consumerSecret)}&${rfc3986(tokenSecret)}`
  return createHmac('sha1', key).update(base).digest('base64')
}

// Common oauth_* params (minus signature).
function baseOAuthParams(): Record<string, string> {
  return {
    oauth_consumer_key:     process.env.FATSECRET_CONSUMER_KEY!,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_nonce:            randomBytes(16).toString('hex'),
    oauth_version:          '1.0',
  }
}

function parseFormEncoded(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of text.split('&')) {
    const [k, v] = pair.split('=')
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
  }
  return out
}

// ── Step 1: request token ────────────────────────────────────────────────────
export async function getRequestToken(callbackUrl: string): Promise<{ token: string; secret: string }> {
  const params = { ...baseOAuthParams(), oauth_callback: callbackUrl }
  const signature = sign('GET', REQUEST_TOKEN_URL, params, process.env.FATSECRET_CONSUMER_SECRET!)
  const qs = new URLSearchParams({ ...params, oauth_signature: signature })
  const res = await fetch(`${REQUEST_TOKEN_URL}?${qs}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`FatSecret request_token ${res.status}: ${text}`)
  const parsed = parseFormEncoded(text)
  if (!parsed.oauth_token) throw new Error(`FatSecret request_token bad response: ${text}`)
  return { token: parsed.oauth_token, secret: parsed.oauth_token_secret }
}

export function authorizeUrl(requestToken: string): string {
  return `${AUTHORIZE_URL}?oauth_token=${rfc3986(requestToken)}`
}

// ── Step 3: exchange for access token ────────────────────────────────────────
export async function getAccessToken(
  requestToken: string,
  requestTokenSecret: string,
  verifier: string,
): Promise<{ token: string; secret: string }> {
  const params = { ...baseOAuthParams(), oauth_token: requestToken, oauth_verifier: verifier }
  const signature = sign('GET', ACCESS_TOKEN_URL, params, process.env.FATSECRET_CONSUMER_SECRET!, requestTokenSecret)
  const qs = new URLSearchParams({ ...params, oauth_signature: signature })
  const res = await fetch(`${ACCESS_TOKEN_URL}?${qs}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`FatSecret access_token ${res.status}: ${text}`)
  const parsed = parseFormEncoded(text)
  if (!parsed.oauth_token) throw new Error(`FatSecret access_token bad response: ${text}`)
  return { token: parsed.oauth_token, secret: parsed.oauth_token_secret }
}

// ── Persisted access token ───────────────────────────────────────────────────
interface FsTokenRow { access_token: string; refresh_token: string | null }

// We reuse oauth_tokens: access_token = oauth_token, refresh_token = oauth_token_secret
// (OAuth 1.0 has a token *secret*, not a refresh token; the column is repurposed).
// expires_at is set far in the future since OAuth 1.0 tokens don't expire.
export async function saveFatSecretToken(token: string, secret: string): Promise<void> {
  const farFuture = new Date('2099-12-31T00:00:00Z').toISOString()
  const encToken  = encrypt(token)
  const encSecret = encrypt(secret)
  await sql`
    INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at)
    VALUES ('fatsecret', ${encToken}, ${encSecret}, ${farFuture})
    ON CONFLICT (provider) DO UPDATE SET
      access_token  = ${encToken},
      refresh_token = ${encSecret},
      expires_at    = ${farFuture},
      updated_at    = NOW()
  `
}

export async function getFatSecretToken(): Promise<{ token: string; secret: string }> {
  const rows = await sql`
    SELECT access_token, refresh_token FROM oauth_tokens WHERE provider = 'fatsecret' LIMIT 1
  ` as FsTokenRow[]
  if (rows.length === 0 || !rows[0].refresh_token) {
    throw new Error('FatSecret not connected')
  }
  return { token: decrypt(rows[0].access_token)!, secret: decrypt(rows[0].refresh_token)! }
}

// ── Signed API call (food_entries.get etc.) ──────────────────────────────────
export async function callFatSecret(
  method: string,
  extraParams: Record<string, string>,
  token: string,
  tokenSecret: string,
): Promise<unknown> {
  const params: Record<string, string> = {
    ...baseOAuthParams(),
    oauth_token: token,
    method,
    format: 'json',
    ...extraParams,
  }
  const signature = sign('GET', REST_URL, params, process.env.FATSECRET_CONSUMER_SECRET!, tokenSecret)
  const qs = new URLSearchParams({ ...params, oauth_signature: signature })
  const res = await fetch(`${REST_URL}?${qs}`)
  const text = await res.text()
  if (!res.ok) throw new Error(`FatSecret ${method} ${res.status}: ${text}`)
  return JSON.parse(text)
}
