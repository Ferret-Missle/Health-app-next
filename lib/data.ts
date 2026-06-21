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

export function movingAvg(arr: number[], k: number): number[] {
  return arr.map((_, i) => {
    const a = arr.slice(Math.max(0, i - k + 1), i + 1);
    return a.reduce((s, v) => s + v, 0) / a.length;
  });
}
