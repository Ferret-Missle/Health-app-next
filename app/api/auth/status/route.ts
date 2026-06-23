import { type NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { ownerGuard } from '@/lib/firebase-admin'

export const dynamic = 'force-dynamic'

// Which external providers are currently linked (have a token row).
export async function GET(req: NextRequest) {
  const denied = await ownerGuard(req)
  if (denied) return denied

  const rows = await sql`SELECT provider FROM oauth_tokens` as { provider: string }[]
  const linked = new Set(rows.map(r => r.provider))

  return NextResponse.json({
    google:    linked.has('google'),
    fatsecret: linked.has('fatsecret'),
  })
}
