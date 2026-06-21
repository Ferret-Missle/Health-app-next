import { sql } from './db'

interface TokenRow {
  access_token: string
  refresh_token: string | null
  expires_at: string
}

export async function getGoogleAccessToken(): Promise<string> {
  const rows = await sql`
    SELECT access_token, refresh_token, expires_at
    FROM oauth_tokens
    WHERE provider = 'google'
    LIMIT 1
  ` as TokenRow[]

  if (rows.length === 0) throw new Error('Google not connected')

  const { access_token, refresh_token, expires_at } = rows[0]

  if (new Date(expires_at).getTime() - Date.now() > 5 * 60 * 1000) {
    return access_token
  }

  if (!refresh_token) throw new Error('No refresh token — re-authorization required')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await sql`
    UPDATE oauth_tokens
    SET access_token = ${data.access_token},
        expires_at   = ${newExpiry},
        updated_at   = NOW()
    WHERE provider = 'google'
  `

  return data.access_token
}
