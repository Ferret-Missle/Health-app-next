import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { encrypt, encryptNullable } from '@/lib/crypto'
import { timingSafeEq, GOOGLE_STATE_COOKIE } from '@/lib/oauth-state'
import { appBaseUrl } from '@/lib/app-url'

interface TokenResponse {
  access_token:  string
  refresh_token?: string
  expires_in:    number
  token_type:    string
  error?:        string
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')
  const base  = appBaseUrl()

  if (error || !code) {
    return NextResponse.redirect(`${base}/?auth_error=${error ?? 'no_code'}`)
  }

  // CSRF: the state must match the cookie our owner-guarded start route set.
  const cookieState = req.cookies.get(GOOGLE_STATE_COOKIE)?.value
  if (!state || !cookieState || !timingSafeEq(state, cookieState)) {
    return NextResponse.redirect(`${base}/?auth_error=state_mismatch`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${base}/?auth_error=token_exchange`)
  }

  const tokens = await tokenRes.json() as TokenResponse
  if (tokens.error) {
    return NextResponse.redirect(`${base}/?auth_error=${tokens.error}`)
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const encAccess  = encrypt(tokens.access_token)
  const encRefresh = encryptNullable(tokens.refresh_token ?? null)

  await sql`
    INSERT INTO oauth_tokens (provider, access_token, refresh_token, expires_at)
    VALUES ('google', ${encAccess}, ${encRefresh}, ${expiresAt})
    ON CONFLICT (provider) DO UPDATE SET
      access_token  = ${encAccess},
      refresh_token = COALESCE(${encRefresh}, oauth_tokens.refresh_token),
      expires_at    = ${expiresAt},
      updated_at    = NOW()
  `

  const res = NextResponse.redirect(`${base}/?auth=success`)
  res.cookies.delete(GOOGLE_STATE_COOKIE)
  return res
}
