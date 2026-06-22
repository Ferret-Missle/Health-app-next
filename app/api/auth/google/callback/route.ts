import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { encrypt, encryptNullable } from '@/lib/crypto'

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
  const base  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error || !code) {
    return NextResponse.redirect(`${base}/?auth_error=${error ?? 'no_code'}`)
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

  return NextResponse.redirect(`${base}/?auth=success`)
}
