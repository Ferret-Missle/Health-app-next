// One-off migration runner for the Neon database.
// Usage (from health-app-next/):  node scripts/migrate.mjs
// Reads DATABASE_URL from .env.local. Safe to re-run.
//
// Two phases:
//  1. migrateMultiUser(): upgrades a pre-existing single-user database to the
//     multi-user (user_id-partitioned) layout — adds user_id columns, backfills
//     existing rows with LEGACY_OWNER_UID (falls back to ALLOWED_UID), and
//     rewrites primary keys / unique indexes. Idempotent via catalog checks;
//     a no-op on a fresh database (no tables yet).
//  2. applySchema(): runs db/schema.sql, which creates anything missing for a
//     fresh install and recreates the new indexes. All statements are
//     IF NOT EXISTS, so this is safe after phase 1.
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
const LEGACY_UID = (process.env.LEGACY_OWNER_UID || process.env.ALLOWED_UID || '').trim()

// ── Catalog helpers ──────────────────────────────────────────────────────────
async function tableExists(table) {
  const r = await sql.query('SELECT to_regclass($1) AS oid', [table])
  return r[0].oid != null
}
async function columnExists(table, column) {
  const r = await sql.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  )
  return r.length > 0
}
async function primaryKeyColumns(table) {
  const r = await sql.query(
    `SELECT a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = to_regclass($1) AND i.indisprimary
      ORDER BY a.attnum`,
    [table],
  )
  return r.map(x => x.col)
}
async function pkConstraintName(table) {
  const r = await sql.query(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = to_regclass($1) AND contype = 'p'`,
    [table],
  )
  return r[0]?.conname ?? null
}

// Add user_id, backfill existing rows with the legacy owner UID. Requires a
// legacy UID only when there are rows to backfill (so fresh installs need none).
async function addUserIdAndBackfill(table) {
  if (!(await tableExists(table))) return
  await sql.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS user_id TEXT`)
  const pending = await sql.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id IS NULL`)
  if (pending[0].n > 0) {
    if (!LEGACY_UID) {
      throw new Error(
        `${table} has ${pending[0].n} row(s) without user_id but LEGACY_OWNER_UID (or ALLOWED_UID) ` +
        `is not set — refusing to backfill with an empty owner. Set LEGACY_OWNER_UID to the existing ` +
        `owner's Firebase UID and re-run.`,
      )
    }
    await sql.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [LEGACY_UID])
    console.log(`  backfilled ${pending[0].n} row(s) in ${table} → ${LEGACY_UID}`)
  }
}

// Rewrite the primary key to `cols` (array) if it isn't already that.
async function setPrimaryKey(table, cols) {
  if (!(await tableExists(table))) return
  const current = await primaryKeyColumns(table)
  if (current.join(',') === cols.join(',')) return
  for (const c of cols) await sql.query(`ALTER TABLE ${table} ALTER COLUMN ${c} SET NOT NULL`)
  const conname = await pkConstraintName(table)
  if (conname) await sql.query(`ALTER TABLE ${table} DROP CONSTRAINT ${conname}`)
  await sql.query(`ALTER TABLE ${table} ADD PRIMARY KEY (${cols.join(', ')})`)
  console.log(`  set ${table} primary key → (${cols.join(', ')})`)
}

async function migrateMultiUser() {
  console.log('Phase 1: multi-user migration')

  // oauth_tokens: PK (provider) → (user_id, provider)
  await addUserIdAndBackfill('oauth_tokens')
  await setPrimaryKey('oauth_tokens', ['user_id', 'provider'])

  // daily_data: PK (date) → (user_id, date)
  await addUserIdAndBackfill('daily_data')
  await setPrimaryKey('daily_data', ['user_id', 'date'])

  // llm_usage: keep id PK, add user_id NOT NULL; drop the old (no-user) index so
  // schema.sql can recreate the per-user one.
  await addUserIdAndBackfill('llm_usage')
  if (await columnExists('llm_usage', 'user_id')) {
    await sql.query(`ALTER TABLE llm_usage ALTER COLUMN user_id SET NOT NULL`)
  }
  await sql.query(`DROP INDEX IF EXISTS llm_usage_date_idx`)

  // advice_log: keep id PK, add user_id NOT NULL; drop the old weekly unique
  // index (same name, (week_start) only) so schema.sql recreates (user_id, week_start).
  await addUserIdAndBackfill('advice_log')
  if (await columnExists('advice_log', 'user_id')) {
    await sql.query(`ALTER TABLE advice_log ALTER COLUMN user_id SET NOT NULL`)
  }
  if (await tableExists('advice_log')) {
    const idx = await sql.query(
      `SELECT array_agg(a.attname ORDER BY a.attnum) AS cols
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indexrelid = to_regclass('advice_log_weekly_uniq')`,
    )
    const cols = idx[0]?.cols
    if (cols && !(cols.length === 2 && cols.includes('user_id'))) {
      await sql.query(`DROP INDEX IF EXISTS advice_log_weekly_uniq`)
      console.log('  dropped legacy advice_log_weekly_uniq (will be recreated per-user)')
    }
  }

  // user_settings: singleton (id=1) → keyed by user_id.
  if (await tableExists('user_settings')) {
    await addUserIdAndBackfill('user_settings')
    await sql.query(`ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_singleton`)
    if ((await primaryKeyColumns('user_settings')).join(',') !== 'user_id') {
      await setPrimaryKey('user_settings', ['user_id'])
    }
    await sql.query(`ALTER TABLE user_settings DROP COLUMN IF EXISTS id`)
  }

  console.log('Phase 1 done.')
}

// ── Phase 2: apply schema.sql ────────────────────────────────────────────────
async function applySchema() {
  console.log('Phase 2: apply db/schema.sql')
  const rawSchema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  // Strip `--` comments (full-line and inline) so a `;` inside a comment can't
  // split a statement, then split on semicolons (schema has no `--` or `;` inside
  // string literals). Normalize CRLF first: on a Windows checkout the trailing
  // `\r` defeats the `/--.*$/` strip (`.` and `$` don't span `\r`), which would
  // leave a `;`-containing comment intact and split a statement mid-comment.
  const schema = rawSchema
    .replace(/\r\n?/g, '\n')
    .split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean)
  for (const stmt of statements) {
    await sql.query(stmt)
    console.log('  OK:', stmt.split('\n')[0].slice(0, 70))
  }
  console.log(`Phase 2 done (${statements.length} statements).`)
}

await migrateMultiUser()
await applySchema()
console.log('\nMigration complete.')
