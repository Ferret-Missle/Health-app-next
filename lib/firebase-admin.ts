import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { NextResponse } from 'next/server'

// Server-side Admin SDK: verifies ID tokens and enforces allow-list access.
// Credentials come from FIREBASE_SERVICE_ACCOUNT (a JSON string of the service
// account key).
//
// Access is restricted to an allow-list (multi-user): a request is accepted if
// the verified token's email is in ALLOWED_EMAILS, or its uid is in
// ALLOWED_UIDS (legacy single-value ALLOWED_UID is still honored). The uid is
// then used as the per-user partition key for all data.

let _app: App | null = null

function adminApp(): App {
  if (_app) return _app
  if (getApps().length) { _app = getApp(); return _app }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  const sa = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string }
  // Env vars often escape newlines in the private key.
  sa.private_key = sa.private_key.replace(/\\n/g, '\n')

  _app = initializeApp({
    credential: cert({
      projectId:   sa.project_id,
      clientEmail: sa.client_email,
      privateKey:  sa.private_key,
    }),
  })
  return _app
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

/** Parse a comma/space-separated env list into a lowercased, trimmed set. */
function envSet(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(/[,\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** Whether the verified token is on the access allow-list. */
function isAllowed(decoded: DecodedIdToken): boolean {
  const emails = envSet('ALLOWED_EMAILS')
  const uids = envSet('ALLOWED_UIDS')
  // Legacy single-value var stays supported.
  const legacyUid = process.env.ALLOWED_UID?.trim().toLowerCase()
  if (legacyUid) uids.add(legacyUid)

  if (uids.has(decoded.uid.toLowerCase())) return true
  if (decoded.email && decoded.email_verified && emails.has(decoded.email.toLowerCase())) return true
  return false
}

/**
 * Verify the Bearer ID token on a request and confirm it is on the allow-list.
 * Returns the decoded token (whose `uid` is the per-user partition key).
 * Throws AuthError (401 unauthenticated / 403 not allowed / 500 misconfigured).
 */
export async function requireUser(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer (.+)$/)
  if (!match) throw new AuthError('Missing bearer token', 401)

  let decoded: DecodedIdToken
  try {
    decoded = await getAuth(adminApp()).verifyIdToken(match[1])
  } catch {
    throw new AuthError('Invalid or expired token', 401)
  }

  const configured = envSet('ALLOWED_EMAILS').size + envSet('ALLOWED_UIDS').size + (process.env.ALLOWED_UID ? 1 : 0)
  if (configured === 0) throw new AuthError('No allow-list configured (set ALLOWED_EMAILS)', 500)
  if (!isAllowed(decoded)) throw new AuthError('Not authorized', 403)

  return decoded
}

/**
 * Route guard: returns the authenticated user's `{ uid }` on success, or a
 * NextResponse to short-circuit when auth fails.
 *   const auth = await userGuard(req)
 *   if (auth instanceof NextResponse) return auth
 *   const { uid } = auth
 */
export async function userGuard(req: Request): Promise<{ uid: string } | NextResponse> {
  try {
    const decoded = await requireUser(req)
    return { uid: decoded.uid }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
