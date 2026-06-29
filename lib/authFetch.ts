'use client'

import { getIdToken } from './firebase'

/**
 * fetch wrapper that attaches the current user's Firebase ID token as a Bearer
 * header. Server routes verify it against the allow-list (see lib/firebase-admin.ts).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getIdToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
