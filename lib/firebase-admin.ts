import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth'
import { NextResponse } from 'next/server'

// Server-side Admin SDK: verifies ID tokens and enforces single-owner access.
// Credentials come from FIREBASE_SERVICE_ACCOUNT (a JSON string of the service
// account key). ALLOWED_UID restricts the app to the owner's Firebase UID.

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

/**
 * Verify the Bearer ID token on a request and confirm it belongs to the owner.
 * Throws AuthError (401 unauthenticated / 403 not the owner) otherwise.
 */
export async function requireOwner(req: Request): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer (.+)$/)
  if (!match) throw new AuthError('Missing bearer token', 401)

  let decoded: DecodedIdToken
  try {
    decoded = await getAuth(adminApp()).verifyIdToken(match[1])
  } catch {
    throw new AuthError('Invalid or expired token', 401)
  }

  const allowed = process.env.ALLOWED_UID
  if (!allowed) throw new AuthError('ALLOWED_UID is not configured', 500)
  if (decoded.uid !== allowed) throw new AuthError('Not authorized', 403)

  return decoded
}

/**
 * Route guard: returns a NextResponse to short-circuit when auth fails, or null
 * when the owner is verified (let the handler continue).
 *   const denied = await ownerGuard(req); if (denied) return denied
 */
export async function ownerGuard(req: Request): Promise<NextResponse | null> {
  try {
    await requireOwner(req)
    return null
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
