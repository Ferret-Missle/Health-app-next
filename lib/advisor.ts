import type { DayData } from './data'
import type { LlmMessage } from './groq'
import { estimateWeightTrend, estimateAdaptiveTdee, computeDailyTarget, evaluateOnTrack, TDEE_WINDOW_DAYS } from './forecast'

export interface AdviceContext {
  data: DayData[]   // recent days (ascending), already in DayData shape
  tgtW: number      // target weight (kg)
  days: number      // days remaining to target
}

const SYSTEM = `あなたは日本語で対応する、データ駆動型のパーソナル減量コーチです。
ユーザー本人の実測データだけを根拠に、短く・具体的で・実行可能な助言を返します。

# 評価の軸（最重要）
- 収支 d = 消費kcal − 摂取kcal。d>0(黒字)=減量に有利、d<0(赤字)=オーバー。
- 「日次目標黒字」が今日の達成基準。直近の平均収支がこれを上回るか下回るかを必ず最初に判定する。
- 実測ペース(体重の実測トレンド、週あたり)と目標ペースの差が正なら「ペースが遅い」、負なら「先行」。
- 栄養バランス（タンパク質が目安に対して足りているか）と活動量（歩数が目安に対して足りているか）も、データがあれば評価軸に含める。

# 単日の暴食を引きずらない（重要）
- 収支が悪化した日が1日あっても、その日単体を繰り返し責めない。数日分の助言で同じ日を何度も持ち出さない。
- 直近7日が目標収支より遅れている場合、【直近7日の状況】の「挽回プラン」の数値を使い、「今週中に無理に取り戻す（1日あたりの上乗せ量）」と「無理せず残りの目標期間全体で薄く均す（1日あたりの上乗せ量）」の両方を提示し、上乗せ量が現実的でない場合は後者（期間全体で均す）を推す。「今週はこのままで、来週以降で少しずつ調整すればいい」という前向きな着地でよい。

# データの扱い（誤った断定を避ける）
- 摂取kcalが極端に低い日（例: 1000kcal未満や「未記録」）は、食事の記録漏れの可能性が高い。これを「節制できた」と即断せず、記録の不確実性に触れる。
- 重要: 「収支が黒字（プラス）なのに実測ペースが目標ペースに届いていない」場合、最も疑うべきは摂取の記録漏れ（実際はもっと食べている）である。この時は収支の黒字を額面通り評価せず、まず記録の精度を上げる助言を最優先にする。アダプティブTDEE（Google Health実測消費より低ければ過小申告の兆候）の値も参考にしてよい。
- 体重は測定日が飛ぶ。数日の上下動はノイズなので、傾向（増/減/横ばい）で語る。
- データが無い項目には言及しない。憶測で数値を作らない。
- 数値を引用するときは、提示された【直近7日の状況】の値をそのまま使う。自分で平均を計算し直して別の数字を出さない。

# 出力フォーマット（厳守）
①サマリ: 1文。目標ペースに対し「順調 / やや遅れ / 要改善」のどれかを必ず明言し、続けて「1日の目標摂取カロリー（約○kcal以下）」を必ず提示する。
②気づき(2〜3点): 各点で必ず具体的な数値を1つ以上引用する（収支/PFC/睡眠/歩数のいずれか）。一般論ではなく、このユーザーのこの週の数字に基づく指摘のみ。収支と体重ペースが食い違う場合は、その理由（記録漏れ等）まで踏み込んで述べる。
③明日のアクション(2〜3点): 即実行できる具体策。各アクションは「対象＋量＋カロリーの目安」を必ず含め、曖昧な言い回し（「高カロリーな食品を減らす」等）にしない。最低1つは運動や食事タイミング等の食事量以外の助言にする。

# アクションの書き方（最重要・誤りを防ぐ）
1. 「減らす／変える対象」は、ユーザーが実際に記録した食品（日別データの「食事[...]」欄）だけにする。記録に無い食品を『減らせ』とは絶対に言わない（食べていない物は減らせない）。
2. 量の大きさは「○○1個分（約N kcal）」という例えで示してよいが、それは "減らす量のイメージ" を伝える物差しに過ぎない。例えに使う食品（おにぎり等）を実際に食べた前提にしない。
   - 良い例:「夕食のごはんを軽く1杯分（おにぎり1個分＝約180kcalに相当）控える」
   - 悪い例:「ごはんを1/2減らし、代わりにおにぎりを1個減らす」（"代わりに"なのに両方減らす矛盾／食べていないおにぎり）
3. 栄養素だけのグラム指示（例:「脂質を15g減らす」）は単独で使わない。必ず実際の食品の量＋カロリーの目安に翻訳する。
4. カロリー量の物差しの目安: ごはん茶碗1杯≒240kcal / おにぎり1個≒180kcal / 食パン6枚切1枚≒150kcal / 唐揚げ1個≒80kcal / 缶ビール1本≒150kcal / サラダチキン1つ≒110kcal（タンパク質補給用）。

# 禁止
- 医療診断、サプリ・薬の推奨。
- 「バランスよく」「適度に」等の曖昧表現。必ず具体的な量・行動に落とす。
- 記録に無い食品を減らす指示。「代わりに」と言いながら両方減らす等の矛盾した指示。
- 絵文字、前置き、自己紹介。`

const r = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

/** Build the chat messages for an advice request. `ctx.data` should span at
 *  least TDEE_WINDOW_DAYS for a stable weight trend / adaptive-TDEE estimate. */
export function buildAdvicePrompt(ctx: AdviceContext): LlmMessage[] {
  const last7 = ctx.data.slice(-7)

  // Weekly aggregates (7-day detail table / diary review — unrelated to the
  // TDEE_WINDOW_DAYS window used for the trend/TDEE calc below).
  const sumD      = last7.reduce((a, b) => a + b.d, 0)
  const avgBurn7  = last7.length ? last7.reduce((a, b) => a + b.burn, 0) / last7.length : 0
  const avgIntake = last7.length ? last7.reduce((a, b) => a + b.intake, 0) / last7.length : 0

  // Weight trend (outlier-cleaned, EWMA-smoothed, weight-vs-time only — never
  // against self-reported balance) drives both the trajectory pace comparison
  // and the adaptive-TDEE-based target intake. See lib/forecast.ts.
  const trend  = estimateWeightTrend(ctx.data)
  const curW   = trend.latestSmoothed
  const tdee   = estimateAdaptiveTdee(ctx.data, trend)
  const avgBurnWindow = ctx.data.length ? ctx.data.reduce((s, x) => s + x.burn, 0) / ctx.data.length : 0
  const { dailyTargetSurplus: dailyTarget, targetIntake, avgTdee, tdeeSource } =
    computeDailyTarget({ curW, tgtW: ctx.tgtW, daysLeft: ctx.days, tdee, avgBurnFallback: avgBurnWindow })
  const { onTrack, requiredPacePerDay, actualPacePerDay } =
    evaluateOnTrack({ curW, tgtW: ctx.tgtW, daysLeft: ctx.days, trend })

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

  const paceLine = actualPacePerDay != null
    ? (() => {
        const devPerWeek = (actualPacePerDay - requiredPacePerDay) * 7
        return `実測ペース vs 目標ペース: 実測${r1(actualPacePerDay * 7)}kg/週 − 目標${r1(requiredPacePerDay * 7)}kg/週 = ${devPerWeek >= 0 ? '+' : ''}${r1(devPerWeek)}kg/週 (正=ペース遅れ、負=先行) [${onTrack ? 'オントラック' : 'オフトラック'}]`
      })()
    : '実測ペース: 体重データ不足のため算出不可'

  const tdeeNote = tdeeSource === 'insufficientData'
    ? '目標摂取カロリー: データ不足のため算出不可'
    : `目標摂取カロリー: 1日あたり約${r(targetIntake)}kcal以下 (${tdeeSource === 'adaptive' ? 'アダプティブTDEE' : 'Google Health推定消費'}${r(avgTdee)} − 目標黒字${r(dailyTarget)})`

  // Catch-up framing: rather than repeatedly flagging one bad day with no way
  // forward, compare "fully offset within the next 7 days" against "spread
  // gently across the whole remaining goal period" so the model can recommend
  // whichever is realistic. Only shown once behind by a non-trivial amount.
  const shortfall = dailyTarget * 7 - sumD  // positive = behind this week's target sum
  const catchUpLine =
    shortfall > 50   ? `挽回プラン: 今週の目標収支に対し${r(shortfall)}kcal不足。今週中に取り戻すなら1日+${r(shortfall / 7)}kcal上乗せ、無理せず残り${ctx.days}日全体で均すなら1日+${ctx.days > 0 ? r(shortfall / ctx.days) : 0}kcalの上乗せで済む` :
    shortfall < -50  ? `挽回プラン: 今週は目標収支を${r(-shortfall)}kcal上回るペースで先行` :
                       `挽回プラン: 今週の収支はほぼ目標どおり`

  // Protein target: a common rule of thumb while cutting (retain lean mass),
  // 1.6g/kg of the (stable, trend-based) current weight. Averaged over
  // logged-intake days only so a logging gap doesn't manufacture a false
  // "shortfall" the same way avgLoggedIntake in lib/forecast.ts avoids it.
  const loggedDays7  = last7.filter(x => x.intake > 0)
  const avgProtein7  = loggedDays7.length ? loggedDays7.reduce((s, x) => s + x.p, 0) / loggedDays7.length : 0
  const proteinTarget = curW > 0 ? Math.round(curW * 1.6) : 0
  const proteinLine = proteinTarget > 0 && loggedDays7.length >= 3
    ? `タンパク質: 直近7日平均${r(avgProtein7)}g (目安${proteinTarget}g ≈ 体重×1.6g/kg)`
    : null

  // Activity: a commonly-cited public-health reference (8,000 steps/day),
  // shown only when step data actually exists (many users won't have it).
  const loggedSteps7 = last7.filter(x => (x.steps ?? 0) > 0)
  const avgSteps7 = loggedSteps7.length ? loggedSteps7.reduce((s, x) => s + (x.steps ?? 0), 0) / loggedSteps7.length : 0
  const stepsLine = loggedSteps7.length >= 3
    ? `歩数: 直近7日平均${r(avgSteps7)}歩 (参考目安 8,000歩/日)`
    : null

  const summary = [
    `目標体重: ${r1(ctx.tgtW)}kg / 残り${ctx.days}日`,
    curW > 0 ? `現在体重(トレンド): ${r1(curW)}kg` : '体重データ: 不足(直近の測定なし)',
    `日次目標黒字: +${r(dailyTarget)}kcal`,
    tdeeNote,
    `参考: Google Health推定消費(直近${TDEE_WINDOW_DAYS}日平均) ${r(avgBurnWindow)}kcal/日`,
    `直近7日の累積収支: ${sumD >= 0 ? '+' : ''}${r(sumD)}kcal (平均 消費${r(avgBurn7)} / 摂取${r(avgIntake)})`,
    paceLine,
    catchUpLine,
    proteinLine,
    stepsLine,
  ].filter((line): line is string => line != null).join('\n')

  const user = `【直近7日の状況】\n${summary}\n\n【日別データ】\n${rows}\n\n上記をもとにアドバイスをください。`

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: user },
  ]
}
