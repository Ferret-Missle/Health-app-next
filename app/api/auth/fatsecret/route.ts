// FatSecret OAuth 1.0 — Step 1: get request token, redirect user to authorize.
// The request token secret must survive until the callback, so we stash it in a
// short-lived httpOnly cookie (it is not a long-term secret).
import { NextResponse } from 'next/server'
import { getRequestToken, authorizeUrl } from '@/lib/fatsecret-auth'

export async function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const callback = `${base}/api/auth/fatsecret/callback`

  let token: string, secret: string
  try {
    ({ token, secret } = await getRequestToken(callback))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(`${base}/?fatsecret_error=${encodeURIComponent(msg)}`)
  }

  const res = NextResponse.redirect(authorizeUrl(token))
  res.cookies.set('fs_req_secret', secret, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600, // 10 min
    path: '/',
  })
  return res
}
