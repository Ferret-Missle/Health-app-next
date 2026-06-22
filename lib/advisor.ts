import type { DayData } from './data'
import type { LlmMessage } from './groq'

export interface AdviceContext {
  data:    DayData[]   // recent days (ascending), already in DayData shape
  tgtW:    number      // target weight (kg)
  days:    number      // days remaining to target
  k:       number      // personal coefficient (kcal/kg), default 7200
}

const SYSTEM = `あなたは日本語で答える健康・減量コーチです。ユーザーの直近1週間の食事(摂取kcal・PFC)と活動(消費kcal・歩数・睡眠)、体重の予実乖離をもとに、原因の推測と具体的な改善提案を返します。
- 収支規約: d = 消費 − 摂取。d>0=黒字=カロリーを削減できた(減量に有利)、d<0=赤字=オーバー。
- 出力は簡潔に。①現状の一言サマリ ②気づいた点(1〜3個) ③明日からの具体的アクション(1〜3個) の順。医療診断はしない。絵文字や過度な前置きは不要。`

const r = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

/** Build the chat messages for an advice request from the last 7 days of data. */
export function buildAdvicePrompt(ctx: AdviceContext): LlmMessage[] {
  const last7 = ctx.data.slice(-7)

  // Weekly aggregates
  const sumD      = last7.reduce((a, b) => a + b.d, 0)
  const avgBurn   = last7.length ? last7.reduce((a, b) => a + b.burn, 0) / last7.length : 0
  const avgIntake = last7.length ? last7.reduce((a, b) => a + b.intake, 0) / last7.length : 0

  // Predicted vs actual weight (§5.3). Anchor at the first weighed day in the
  // window; predicted = W0 − (cumulative balance accrued since then) ÷ k.
  const weighed   = ctx.data.filter(x => x.w > 0)
  const W0        = weighed.length ? weighed[0].w : 0
  const cum0      = weighed.length ? weighed[0].cum : 0
  const curW      = weighed.length ? weighed[weighed.length - 1].w : 0
  const cumNow    = ctx.data.length ? ctx.data[ctx.data.length - 1].cum : 0
  const predNow   = W0 > 0 ? W0 - (cumNow - cum0) / ctx.k : 0
  const deviation = curW > 0 && predNow > 0 ? curW - predNow : null

  const dailyTarget = ctx.days > 0 ? Math.max(0, (curW - ctx.tgtW) * ctx.k / ctx.days) : 0

  const rows = last7.map(d => {
    const pfc = `P${r(d.p)}/F${r(d.f)}/C${r(d.cc)}g`
    const wt  = d.w > 0 ? `${r1(d.w)}kg` : '—'
    return `${d.md}: 消費${r(d.burn)} 摂取${r(d.intake)} 収支${d.d >= 0 ? '+' : ''}${r(d.d)} ${pfc} 体重${wt}`
  }).join('\n')

  const summary = [
    `目標体重: ${r1(ctx.tgtW)}kg / 残り${ctx.days}日 / 個人係数k=${ctx.k}`,
    curW > 0 ? `現在体重(最新): ${r1(curW)}kg` : '体重データ: 不足(直近の測定なし)',
    `日次目標黒字: +${r(dailyTarget)}kcal`,
    `直近7日の累積収支: ${sumD >= 0 ? '+' : ''}${r(sumD)}kcal (平均 消費${r(avgBurn)} / 摂取${r(avgIntake)})`,
    deviation != null
      ? `予実乖離: 実測${r1(curW)}kg − 予測${r1(predNow)}kg = ${deviation >= 0 ? '+' : ''}${r1(deviation)}kg (正=予測より重い=ペース遅れ)`
      : '予実乖離: 体重データ不足のため算出不可',
  ].join('\n')

  const user = `【直近7日の状況】\n${summary}\n\n【日別データ】\n${rows}\n\n上記をもとにアドバイスをください。`

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: user },
  ]
}
