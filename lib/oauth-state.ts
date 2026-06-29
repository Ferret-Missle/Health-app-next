// Shared helpers for protecting the OAuth start/callback flows.
//
// The link/callback endpoints are reached by a top-level browser navigation, so
// they cannot carry a Bearer token. We defend them two ways:
//  1. The *start* route is hit via fetch (authFetch → Bearer), so requireUser
//     guards it. It mints a random `state`, stores it (with the user's uid) in an
//     httpOnly cookie, and returns the provider URL for the client to navigate to.
//  2. The *callback* compares the returned state against the cookie (constant
//     time) to block CSRF — an attacker can't forge a request that matches a
//     cookie value only our start route set.
import { randomBytes, timingSafeEqual } from 'crypto'
import type { NextResponse } from 'next/server'

/** Unpredictable, URL-safe state token. */
export function randomState(): string {
  return randomBytes(32).toString('base64url')
}

/** Constant-time string comparison; false on any length/encoding mismatch. */
export function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/** Persist a state value in a short-lived httpOnly cookie on the response. */
export function setStateCookie(res: NextResponse, name: string, value: string): void {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax', // 'lax' lets the OAuth provider's top-level redirect send it back
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 min — long enough to finish the consent screen
    path: '/',
  })
}

// Multi-user: the OAuth callback has no Bearer token, so it can't identify which
// user is linking. We bind the linking user's Firebase uid to the CSRF state by
// storing `${uid}:${state}` in the httpOnly state cookie (set by the owner-/
// allow-list-guarded start route). The callback recovers the uid only after the
// random state half matches, so the uid can't be forged without also matching state.

/** Store `${uid}:${state}` in the state cookie. */
export function setStateCookieWithUid(res: NextResponse, name: string, state: string, uid: string): void {
  setStateCookie(res, name, `${uid}:${state}`)
}

/** Split a `${uid}:${state}` cookie value. Returns null if malformed. */
export function parseStateCookie(value: string | undefined): { uid: string; state: string } | null {
  if (!value) return null
  const i = value.indexOf(':')
  if (i <= 0 || i === value.length - 1) return null
  return { uid: value.slice(0, i), state: value.slice(i + 1) }
}

export const GOOGLE_STATE_COOKIE = 'g_oauth_state'
export const FATSECRET_STATE_COOKIE = 'fs_oauth_state'
