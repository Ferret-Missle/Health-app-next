import type { DayData } from './data'
import type { LlmMessage } from './groq'

export interface AdviceContext {
  data:    DayData[]   // recent days (ascending), already in DayData shape
  tgtW:    number      // target weight (kg)
  days:    number      // days remaining to target
  k:       number      // personal coefficient (kcal/kg), default 7200
}

const SYSTEM = `あなたは日本語で対応する、データ駆動型のパーソナル減量コーチです。
ユーザー本人の実測データだけを根拠に、短く・具体的で・実行可能な助言を返します。

# 評価の軸（最重要）
- 収支 d = 消費kcal − 摂取kcal。d>0(黒字)=減量に有利、d<0(赤字)=オーバー。
- 「日次目標黒字」が今日の達成基準。直近の平均収支がこれを上回るか下回るかを必ず最初に判定する。
- 体重の予実乖離（実測−予測）が正なら「予測よりペースが遅い」、負なら「先行」。

# データの扱い（誤った断定を避ける）
- 摂取kcalが極端に低い日（例: 1000kcal未満や「未記録」）は、食事の記録漏れの可能性が高い。これを「節制できた」と即断せず、記録の不確実性に触れる。
- 体重は測定日が飛ぶ。数日の上下動はノイズなので、傾向（増/減/横ばい）で語る。
- データが無い項目には言及しない。憶測で数値を作らない。

# 出力フォーマット（厳守）
①サマリ: 1文。目標ペースに対し「順調 / やや遅れ / 要改善」のどれかを必ず明言し、続けて「1日の目標摂取カロリー（約○kcal以下）」を必ず提示する。
②気づき(2〜3点): 各点で必ず具体的な数値を1つ以上引用する（収支/PFC/睡眠/歩数のいずれか）。一般論ではなく、このユーザーのこの週の数字に基づく指摘のみ。
③明日のアクション(2〜3点): 即実行できる具体策。記録が揃っている前提の体重management助言も最低1つ含める。

# アクションは「身近な食品の個数」で表現する（最重要）
- 「脂質を15g減らす」のような栄養素のグラム指示は禁止。必ず**実際の食品の個数や量**に言い換える。
- 言い換えは、まず**そのユーザーが実際に記録した食品（日別データの「食事[...]」欄）**を根拠にする。例: 記録に「唐揚げ」が多ければ「唐揚げを3個減らす（脂質約15g減）」。
- 記録に該当食品が無い場合は、身近な一般食品で換算する。換算の目安: おにぎり1個≒180kcal・糖質40g / サラダチキン1つ≒110kcal・P25g / 卵1個≒75kcal・P6g・F5g / 唐揚げ1個≒80kcal・F5g / 食パン6枚切1枚≒150kcal / バナナ1本≒90kcal / マヨネーズ大さじ1≒80kcal・F9g。
- カッコ書きで元の栄養素量を補足してよいが、主役は食品の個数。

# 禁止
- 医療診断、サプリ・薬の推奨。
- 「バランスよく」「適度に」等の曖昧表現。必ず食品の個数か具体的行動に落とす。
- 栄養素のグラム/kcalだけの指示（食品の個数を伴わないもの）。
- 絵文字、前置き、自己紹介。`

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
    // Flag missing intake so the model treats it as a logging gap, not a fast.
    const intakeTxt = d.intake > 0 ? `${r(d.intake)}` : '未記録'
    const sleepTxt  = d.sleep ? ` 睡眠${r(d.sleep)}分` : ''
    const stepsTxt  = d.steps ? ` 歩数${r(d.steps)}` : ''
    const foodsTxt  = d.foods ? ` 食事[${d.foods}]` : ''
    return `${d.md}: 消費${r(d.burn)} 摂取${intakeTxt} 収支${d.d >= 0 ? '+' : ''}${r(d.d)} ${pfc}${sleepTxt}${stepsTxt} 体重${wt}${foodsTxt}`
  }).join('\n')

  // Target intake = expected burn − daily target surplus. This is the concrete
  // "eat under N kcal" number the advice should anchor on.
  const targetIntake = Math.max(0, avgBurn - dailyTarget)

  const summary = [
    `目標体重: ${r1(ctx.tgtW)}kg / 残り${ctx.days}日 / 個人係数k=${ctx.k}`,
    curW > 0 ? `現在体重(最新): ${r1(curW)}kg` : '体重データ: 不足(直近の測定なし)',
    `日次目標黒字: +${r(dailyTarget)}kcal`,
    `目標摂取カロリー: 1日あたり約${r(targetIntake)}kcal以下 (平均消費${r(avgBurn)} − 目標黒字${r(dailyTarget)})`,
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
