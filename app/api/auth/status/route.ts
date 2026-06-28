import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { userGuard } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

// Which external providers are currently linked (have a token row) for this user.
export async function GET(req: NextRequest) {
  const auth = await userGuard(req)
  if (auth instanceof NextResponse) return auth
  const { uid } = auth

  const rows = await sql`SELECT provider FROM oauth_tokens WHERE user_id = ${uid}` as { provider: string }[]
  const linked = new Set(rows.map(r => r.provider))

  return NextResponse.json({
    google:    linked.has('google'),
    fatsecret: linked.has('fatsecret'),
  })
}
