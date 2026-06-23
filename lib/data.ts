export interface DayData {
  dt: Date;
  md: string;    // "6/20"
  dom: number;
  mon: number;
  yr: number;
  dow: number;
  burn: number;
  intake: number;
  d: number;     // balance = burn - intake
  w: number;     // weight kg
  bf: number;    // body fat %
  p: number;     // protein g
  f: number;     // fat g
  cc: number;    // carbs g
  cum: number;   // cumulative balance
}

function gen(): DayData[] {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const N = 120;
  const today = new Date(2026, 5, 20); // June 20, 2026
  const arr: Omit<DayData, 'cum'>[] = [];

  for (let i = N - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - i);
    const burn   = Math.round(2180 + rnd() * 470);
    const intake = Math.round(1720 + rnd() * 560);
    const d  = burn - intake;
    const w  = Math.round((81.0  - (N - 1 - i) * 0.047 + (rnd() - 0.5) * 0.62) * 10) / 10;
    const bf = Math.round((27.5  - (N - 1 - i) * 0.014 + (rnd() - 0.5) * 0.4)  * 10) / 10;
    const p  = Math.round(intake * (0.24 + rnd() * 0.04) / 4);
    const f  = Math.round(intake * (0.26 + rnd() * 0.04) / 9);
    const cc = Math.round(intake * (0.46 + rnd() * 0.04) / 4);
    arr.push({
      dt,
      md:  `${dt.getMonth() + 1}/${dt.getDate()}`,
      dom: dt.getDate(),
      mon: dt.getMonth(),
      yr:  dt.getFullYear(),
      dow: dt.getDay(),
      burn, intake, d, w, bf, p, f, cc,
    });
  }

  let cum = 0;
  return arr.map(x => ({ ...x, cum: (cum += x.d) }));
}

export const DATA: DayData[] = gen();

/** A daily_data row as returned from the DB (snake_case, numerics may be strings). */
export interface DailyRow {
  date:           string;        // 'YYYY-MM-DD' (JST calendar date)
  burn_kcal:      number | null;
  steps:          number | null;
  heart_rate_avg: number | null;
  sleep_min:      number | null;
  weight_kg:      number | string | null;
  body_fat_pct:   number | string | null;
  intake_kcal:    number | null;
  p_g:            number | string | null;
  f_g:            number | string | null;
  c_g:            number | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n == null || Number.isNaN(n) ? 0 : n;
};

/**
 * Convert DB rows (one per JST date) into the DayData[] shape the UI consumes.
 * Rows are expected sorted ascending by date. cum (cumulative balance) is
 * recomputed across the returned window, matching the seed generator's logic.
 */
export function rowsToDayData(rows: DailyRow[]): DayData[] {
  let cum = 0;
  return rows.map(r => {
    // 'YYYY-MM-DD' -> local Date at midnight (treat the string as the calendar date)
    const [yr, mon, dom] = r.date.split('-').map(Number);
    const dt = new Date(yr, mon - 1, dom);
    const burn   = num(r.burn_kcal);
    const intake = num(r.intake_kcal);
    const d      = burn - intake;
    cum += d;
    return {
      dt,
      md:  `${dt.getMonth() + 1}/${dt.getDate()}`,
      dom: dt.getDate(),
      mon: dt.getMonth(),
      yr:  dt.getFullYear(),
      dow: dt.getDay(),
      burn,
      intake,
      d,
      w:  num(r.weight_kg),
      bf: num(r.body_fat_pct),
      p:  num(r.p_g),
      f:  num(r.f_g),
      cc: num(r.c_g),
      cum,
    };
  });
}

export function movingAvg(arr: number[], k: number): number[] {
  return arr.map((_, i) => {
    const a = arr.slice(Math.max(0, i - k + 1), i + 1);
    return a.reduce((s, v) => s + v, 0) / a.length;
  });
}

/**
 * Days remaining until a goal date (YYYY-MM-DD), measured in whole JST calendar
 * days. Clamped to a minimum of 1 so past-due dates don't break daily-target /
 * trajectory math (we treat an overdue goal as "1 day left").
 */
export function daysUntil(tgtDate: string, now: Date = new Date()): number {
  const target = new Date(`${tgtDate}T00:00:00+09:00`).getTime()
  // Start of today in JST.
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  jst.setUTCHours(0, 0, 0, 0)
  const todayJst = jst.getTime() - 9 * 60 * 60 * 1000
  const diff = Math.round((target - todayJst) / 86400000)
  return Math.max(1, diff)
}
