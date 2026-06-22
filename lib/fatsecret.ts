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
  calories?:     string
  protein?:      string
  fat?:          string
  carbohydrate?: string
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
  }
}

// Fetch intake for [startMs, endMs) one JST day at a time (FatSecret has no range
// query; food_entries.get is per-day). Days with no diary entries are skipped.
export async function fetchIntakeData(startMs: number, endMs: number): Promise<DailyIntakeData[]> {
  const { token, secret } = await getFatSecretToken()
  const startInt = jstDateInt(startMs)
  const endInt   = jstDateInt(endMs - 1)  // inclusive last JST day

  const out: DailyIntakeData[] = []
  for (let di = startInt; di <= endInt; di++) {
    const day = await fetchOneDay(di, token, secret)
    if (day) out.push(day)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
