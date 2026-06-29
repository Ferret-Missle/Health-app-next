import { type NextRequest, NextResponse } from 'next/server'
import { userGuard } from '@/lib/firebase-admin'
import { randomState, setStateCookieWithUid, GOOGLE_STATE_COOKIE } from '@/lib/oauth-state'

// Google Health API scopes (replaces legacy Google Fit fitness.* scopes).
// steps + total-calories → activity_and_fitness; heart-rate → health_metrics; sleep → sleep.
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ')

// Allow-list-guarded: called via authFetch (Bearer), returns the consent URL as
// JSON for the client to navigate to. Mints a CSRF `state` checked by the
// callback, and binds the linking user's uid to it via the state cookie.
export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const state = randomState()
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  })

  const res = NextResponse.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  })
  setStateCookieWithUid(res, GOOGLE_STATE_COOKIE, state, uid)
  return res
}
