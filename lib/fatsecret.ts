// FatSecret food diary reader (read-only, per FR-1.3).
// Pulls food_entries.get for each JST day and aggregates intake kcal + P/F/C.
import { callFatSecret, getFatSecretToken } from './fatsecret-auth'

const JST_OFFSET_MS = 9 * 3600 * 1000
const DAY_MS = 86400000

// FatSecret date_int = number of days since 1970-01-01.
// We attribute to JST calendar days.
function jstDateInt(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS)
}
function dateIntToStr(dateInt: number): string {
  return new Date(dateInt * DAY_MS).toISOString().slice(0, 10)
}

// food_entries.get response: { food_entries: { food_entry: entry | entry[] } }
// or { food_entries: "" } when the day has no entries.
interface FoodEntry {
  food_entry_name?: string
  calories?:        string
  protein?:         string
  fat?:             string
  carbohydrate?:    string
}
interface FoodEntriesResponse {
  food_entries?: { food_entry?: FoodEntry | FoodEntry[] } | string
  error?: { code: number; message: string }
}

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface DailyIntakeData {
  date:       string
  intakeKcal: number | null
  pG:         number | null
  fG:         number | null
  cG:         number | null
  foods:      string | null   // logged food names summarized as "name×count, …"
}

/** Summarize logged food names as "name×count, …" (most-eaten first), so advice
 *  can reference what was actually eaten. Caps length to keep the prompt small. */
function summarizeFoods(entries: FoodEntry[]): string | null {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const name = e.food_entry_name?.trim()
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => (n > 1 ? `${name}×${n}` : name))
  const joined = parts.join(', ')
  return joined.length > 300 ? joined.slice(0, 297) + '…' : joined
}

async function fetchOneDay(
  dateInt: number,
  token: string,
  secret: string,
): Promise<DailyIntakeData | null> {
  const data = await callFatSecret(
    'food_entries.get',
    { date: dateInt.toString() },
    token,
    secret,
  ) as FoodEntriesResponse

  if (data.error) throw new Error(`FatSecret food_entries.get: ${data.error.message}`)

  const fe = data.food_entries
  if (!fe || typeof fe === 'string' || !fe.food_entry) return null

  const entries = Array.isArray(fe.food_entry) ? fe.food_entry : [fe.food_entry]
  if (entries.length === 0) return null

  let kcal = 0, p = 0, f = 0, c = 0
  for (const e of entries) {
    kcal += num(e.calories)
    p    += num(e.protein)
    f    += num(e.fat)
    c    += num(e.carbohydrate)
  }

  return {
    date:       dateIntToStr(dateInt),
    intakeKcal: Math.round(kcal),
    pG:         Math.round(p * 10) / 10,
    fG:         Math.round(f * 10) / 10,
    cG:         Math.round(c * 10) / 10,
    foods:      summarizeFoods(entries),
  }
}

// Fetch intake for [startMs, endMs) one JST day at a time (FatSecret has no range
// query; food_entries.get is per-day). Days are fetched in small parallel batches
// to keep the total time well under the function timeout, while bounding
// concurrency so we don't trip FatSecret's rate limits. Empty days are skipped.
const FS_CONCURRENCY = 5

export async function fetchIntakeData(userId: string, startMs: number, endMs: number): Promise<DailyIntakeData[]> {
  const { token, secret } = await getFatSecretToken(userId)
  const startInt = jstDateInt(startMs)
  const endInt   = jstDateInt(endMs - 1)  // inclusive last JST day

  const dateInts: number[] = []
  for (let di = startInt; di <= endInt; di++) dateInts.push(di)

  const out: DailyIntakeData[] = []
  for (let i = 0; i < dateInts.length; i += FS_CONCURRENCY) {
    const batch = dateInts.slice(i, i + FS_CONCURRENCY)
    const results = await Promise.all(batch.map(di => fetchOneDay(di, token, secret)))
    for (const day of results) if (day) out.push(day)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
