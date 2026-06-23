// One-off migration runner: applies db/schema.sql to the Neon database.
// Usage (from health-app-next/):  node scripts/migrate.mjs
// Reads DATABASE_URL from .env.local. Safe to re-run (all statements are IF NOT EXISTS).
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

// Minimal .env.local loader (avoids adding a dotenv dependency).
function loadEnv() {
  let text
  try { text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8') }
  catch { return }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && !process.env[m[1]]) {
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}

loadEnv()
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not found (checked env and .env.local)')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)
const rawSchema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')

// Strip `--` comments (full-line and inline) so a `;` inside a comment can't
// split a statement, then split on semicolons (schema has no `--` or `;` inside
// string literals).
const schema = rawSchema.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const statements = schema.split(';').map(s => s.trim()).filter(Boolean)

for (const stmt of statements) {
  await sql.query(stmt)
  console.log('OK:', stmt.split('\n')[0].slice(0, 70))
}
console.log(`\nApplied ${statements.length} statements.`)
