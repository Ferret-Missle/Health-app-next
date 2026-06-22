// FatSecret OAuth 1.0 — Step 3: exchange authorized request token for an access
// token (using the request-token-secret stashed in the cookie) and persist it.
import { type NextRequest, NextResponse } from 'next/server'
import { getAccessToken, saveFatSecretToken } from '@/lib/fatsecret-auth'

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { searchParams } = req.nextUrl
  const oauthToken = searchParams.get('oauth_token')
  const verifier   = searchParams.get('oauth_verifier')
  const reqSecret  = req.cookies.get('fs_req_secret')?.value

  if (!oauthToken || !verifier || !reqSecret) {
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
  return res
}
