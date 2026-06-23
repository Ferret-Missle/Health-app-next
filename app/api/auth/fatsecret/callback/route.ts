// FatSecret OAuth 1.0 — Step 3: exchange authorized request token for an access
// token (using the request-token-secret stashed in the cookie) and persist it.
import { type NextRequest, NextResponse } from 'next/server'
import { getAccessToken, saveFatSecretToken } from '@/lib/fatsecret-auth'
import { FATSECRET_STATE_COOKIE } from '@/lib/oauth-state'
import { appBaseUrl } from '@/lib/app-url'

export async function GET(req: NextRequest) {
  const base = appBaseUrl()
  const { searchParams } = req.nextUrl
  const oauthToken = searchParams.get('oauth_token')
  const verifier   = searchParams.get('oauth_verifier')
  const reqSecret  = req.cookies.get('fs_req_secret')?.value
  // OAuth 1.0 returns no `state`, so we just confirm our state cookie is present
  // — only our owner-guarded start route could have set this httpOnly value.
  const stateCookie = req.cookies.get(FATSECRET_STATE_COOKIE)?.value

  if (!oauthToken || !verifier || !reqSecret || !stateCookie) {
    return NextResponse.redirect(`${base}/?fatsecret_error=missing_params`)
  }

  let token: string, secret: string
  try {
    ({ token, secret } = await getAccessToken(oauthToken, reqSecret, verifier))
    await saveFatSecretToken(token, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(`${base}/?fatsecret_error=${encodeURIComponent(msg)}`)
  }

  const res = NextResponse.redirect(`${base}/?fatsecret=success`)
  res.cookies.delete('fs_req_secret')
  res.cookies.delete(FATSECRET_STATE_COOKIE)
  return res
}
