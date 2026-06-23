// FatSecret OAuth 1.0 — Step 1: get request token, redirect user to authorize.
// The request token secret must survive until the callback, so we stash it in a
// short-lived httpOnly cookie (it is not a long-term secret).
import { type NextRequest, NextResponse } from 'next/server'
import { getRequestToken, authorizeUrl } from '@/lib/fatsecret-auth'
import { ownerGuard } from '@/lib/firebase-admin'
import { randomState, setStateCookie, FATSECRET_STATE_COOKIE } from '@/lib/oauth-state'
import { appBaseUrl } from '@/lib/app-url'

// Owner-guarded: called via authFetch (Bearer), returns the authorize URL as
// JSON for the client to navigate to. OAuth 1.0 has no `state` param, so we add
// our own state cookie checked by the callback to block forged callbacks.
export async function GET(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const base = appBaseUrl()
  const callback = `${base}/api/auth/fatsecret/callback`

  let token: string, secret: string
  try {
    ({ token, secret } = await getRequestToken(callback))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const state = randomState()
  const res = NextResponse.json({ url: authorizeUrl(token) })
  res.cookies.set('fs_req_secret', secret, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 min
    path: '/',
  })
  setStateCookie(res, FATSECRET_STATE_COOKIE, state)
  return res
}
