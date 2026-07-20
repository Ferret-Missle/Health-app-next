import type { DayData } from './data'
import type { LlmMessage } from './groq'
import { estimateWeightTrend, estimateAdaptiveTdee, computeDailyTarget, evaluateOnTrack, TDEE_WINDOW_DAYS } from './forecast'

// How far back to fetch for advice generation. Deliberately longer than
// TDEE_WINDOW_DAYS (which still drives the trend/TDEE/target-intake
// calculations below, unchanged) — this wider window exists only to let the
// prompt contrast a genuine long-term trend against the recent one, so the
// model can praise sustained effort while gently flagging a recent dip
// instead of reacting to the last 7 days in isolation.
export const LONG_TERM_WINDOW_DAYS = 90

export type AdvisorPersona = 'friend' | 'trainer' | 'strict' | 'custom'

export interface AdviceContext {
  data: DayData[]   // ascending DayData; ideally spans LONG_TERM_WINDOW_DAYS (degrades gracefully with less)
  tgtW: number      // target weight (kg)
  days: number      // days remaining to target
  persona: AdvisorPersona
  personaCustom?: string | null   // only meaningful when persona === 'custom'
}

// Absolute, non-negotiable rules — factual accuracy and safety only. These
// never change with persona; everything about voice, structure, and how much
// to say is left to PERSONA_PROMPTS below.
const HARD_RULES = `# 厳守事項（口調に関わらず必ず守る）
- ユーザーが実際に記録した食品（食事ログ）以外を「減らせ」とは言わない。記録にない食品を挙げない。
- 提示されたデータの数値をそのまま使う。自分で計算し直したり、存在しない数値を作らない。
- データが無い項目には言及しない。憶測で数値を作らない。
- 医療診断、サプリ・薬の推奨はしない。`

// How to correctly *read* the numbers — kept shared across all personas
// because getting this wrong is a reasoning error, not a style choice (e.g.
// mistaking a logged surplus for real progress when the trend says
// otherwise). Voice and output structure are NOT dictated here; each
// persona in PERSONA_PROMPTS decides how to say this in its own way.
// IMPORTANT: this is internal reasoning material, not a checklist to narrate
// through — see OUTPUT_DISCIPLINE, which explicitly says not to report each
// point. Models were observed walking through every bullet here verbatim
// (restating every number, then repeating the same insight again in the
// action list), producing bloated, redundant output.
const ANALYSIS_GUIDANCE = `# データの読み解き方（内部判断用。逐一報告する項目リストではない）
- 収支 d = 消費kcal − 摂取kcal。d>0(黒字)=減量に有利、d<0(赤字)=オーバー。「日次目標黒字」が達成基準。
- 実測ペース(体重の実測トレンド、週あたり)と目標ペースの差が正なら「ペースが遅い」、負なら「先行」。
- 収支が悪化した日が1日あっても、その日単体を繰り返し責めない。「挽回プラン」の数値（今週中に取り戻す場合の上乗せ量 / 残り期間全体で均す場合の上乗せ量）を使い、上乗せ量が現実的でなければ後者（期間全体で均す）を勧める。
- 「長期ペース」（データ全期間の傾向）と「直近ペース」は必ず見比べる。長期は良好なのに直近だけ乱れている場合、長期の頑張りをまず認めた上で、直近の変化には原因を断定せず触れる（長期の実績を否定する言い方はしない）。逆に長期が停滞気味でも直近が改善しているなら、その改善を評価する。「直近7日 vs その前3週間」の摂取平均の差が示されていれば、この対比の材料に使う（差が小さければ話題にしない）。
- 「収支が黒字なのに実測ペースが目標ペースに届いていない」場合、摂取の記録漏れ（実際はもっと食べている）を疑う。収支の黒字を額面通り評価しない。アダプティブTDEEがGoogle Health推定消費より低ければ、これも過小申告の傾向として参考にできる。
- 摂取kcalが極端に低い日（1000kcal未満・未記録）は記録漏れの可能性が高く、「節制できた」と即断しない。
- 体重は測定日が飛ぶ。数日の上下動はノイズなので、傾向（増/減/横ばい）で語る。
- 栄養バランス（タンパク質目安との比較）・活動量（歩数目安との比較）もデータがあれば判断材料にする。`

// Explicit anti-verbosity rule, placed last (closest to generation) since
// models weight instructions near the end of a long prompt more heavily for
// shaping the immediate output. Directly targets the observed failure mode:
// narrating every ANALYSIS_GUIDANCE point with its raw numbers, then
// repeating the same point again in the action list.
const OUTPUT_DISCIPLINE = `# 結論ファースト・簡潔に（最重要）
- 「データの読み解き方」の各項目を律儀に全部言葉にして報告しない。今週のデータで実際に特筆すべき点だけを取り上げる。特筆すべき点がない項目には触れない。
- 数値を並べて経過や比較の過程を説明しない。結論を先に述べ、その根拠になった数値を1つだけ添える（例：「タンパク質が少し足りていないよ（67g、目安106g）」であって、目安と実測を両方並べて説明を続ける必要はない）。
- 同じ指摘を複数箇所で繰り返さない（気づきで言った内容をアクションでもう一度説明しない）。
- 全体を簡潔にまとめる。目安として全体で300〜400字程度。冗長な言い回し・前置きの言い換えを避ける。`

// Persona voice + structure. Deliberately NOT constrained to a fixed
// ①②③ shape — each persona decides its own output form.
const PERSONA_PROMPTS: Record<Exclude<AdvisorPersona, 'custom'>, string> = {
  friend: `あなたはユーザーの親しい友人・家族で、一緒に健康的な生活を目指しています。データはきちんと見ますが、話し方はカジュアルな話し言葉（「〜だね」「〜しよう」）で、長期の頑張りは具体的な数字を挙げてしっかり褒め、直近の乱れには温かい距離感で寄り添ってください。硬い箇条書きの型に縛られず、自然な会話文で語りかけてください。分量は無理に増やさず、話しかけるような長さで。行動提案をするときは「対象＋量＋カロリーの目安」を含め、記録にない食品を減らせとは言わないでください（例：「夕食のごはんを軽く1杯分（おにぎり1個分＝約180kcalに相当）控えよう」）。`,
  trainer: `あなたはユーザーが信頼する、プロのパーソナルトレーナーです。丁寧語（です・ます調）を保ちながら、専門的な視点をわかりやすく伝えてください。褒めるべき点は的確に評価し、改善点は根拠となる数値とともに、実行可能な形で提案してください。読みやすさのため要点を項目立ててよいですが、①②③のような固定の型に縛られる必要はありません。行動提案をするときは「対象＋量＋カロリーの目安」を含め、記録にない食品を減らすよう指示しないでください（例：「夕食のごはんを軽く1杯分（おにぎり1個分＝約180kcalに相当）控えましょう」）。`,
  strict: `あなたは結果にこだわる、厳しめのコーチです。数字を遠慮なく突きつけ、甘えを許さない口調で語ってください。ただし人格否定や暴言ではなく、「もっとできるはずだ」という期待に基づいた厳しさにしてください。長期で頑張れているなら「その調子を維持しろ」と鼓舞し、乱れているなら率直に指摘した上で、具体的な立て直し方を短く言い切ってください。前置きは要りません。行動提案をするときは「対象＋量＋カロリーの目安」を含め、記録にない食品を減らせとは言わないこと（例：「夕食のごはんを軽く1杯分、おにぎり1個分＝約180kcal減らせ」）。`,
}

/** Voice+structure instruction for the given persona. Custom text is capped
 *  defensively (the API route already truncates on save; this guards direct
 *  callers too) and wrapped so it can't be mistaken for a HARD_RULES override. */
function personaVoice(persona: AdvisorPersona, custom?: string | null): string {
  if (persona === 'custom') {
    const text = (custom ?? '').trim().slice(0, 300)
    return text
      ? `あなたのキャラクター・口調はユーザー本人が以下のように指定しています。この設定（話し方・文章の構成・絵文字の使用可否を含む）を一貫して反映してください。ただし下記の厳守事項とデータの読み解き方は必ず守ってください:\n"""${text}"""`
      : PERSONA_PROMPTS.trainer
  }
  return PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.trainer
}

function buildSystem(persona: AdvisorPersona, custom?: string | null): string {
  return `${personaVoice(persona, custom)}

${ANALYSIS_GUIDANCE}

${HARD_RULES}

${OUTPUT_DISCIPLINE}`
}

const r = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

function isSameJstDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Today (JST) as a Date matching the calendar-date construction rowsToDayData
 *  uses for DayData.dt (see lib/data.ts), so same-day comparison works. */
function todayJstDate(): Date {
  const s = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [yr, mon, dom] = s.split('-').map(Number)
  return new Date(yr, mon - 1, dom)
}

/** Build the chat messages for an advice request. `ctx.data` should ideally
 *  span LONG_TERM_WINDOW_DAYS and MAY include today. Today is intentionally
 *  kept for the weight trend (so a same-day weigh-in isn't a day stale) but
 *  excluded from every calorie-balance figure below (7-day table, TDEE
 *  window, etc.) since today's food/activity log is normally still partial.
 *  Degrades gracefully with less data. */
export function buildAdvicePrompt(ctx: AdviceContext): LlmMessage[] {
  const today = todayJstDate()
  // Completed days only — everything calorie-balance-derived is computed from
  // this, never from ctx.data directly, so a same-day partial log can't leak
  // in as a false surplus/deficit or a false "logged" day.
  const completedData = ctx.data.filter(d => !isSameJstDay(d.dt, today))

  const last7 = completedData.slice(-7)
  const calorieWindowData = completedData.slice(-TDEE_WINDOW_DAYS)
  // Includes today (if present) — weight isn't subject to the same
  // partial-day noise as calorie balance, so the trend should use the
  // freshest available weigh-in.
  const weightWindowData = ctx.data.slice(-TDEE_WINDOW_DAYS)

  // Weekly aggregates (7-day detail table / diary review — unrelated to the
  // TDEE_WINDOW_DAYS window used for the trend/TDEE calc below).
  const sumD      = last7.reduce((a, b) => a + b.d, 0)
  const avgBurn7  = last7.length ? last7.reduce((a, b) => a + b.burn, 0) / last7.length : 0
  const avgIntake = last7.length ? last7.reduce((a, b) => a + b.intake, 0) / last7.length : 0

  // Recent weight trend (outlier-cleaned, EWMA-smoothed, weight-vs-time only
  // — never against self-reported balance) drives the trajectory pace
  // comparison and the adaptive-TDEE-based target intake, same as before
  // ctx.data was widened to LONG_TERM_WINDOW_DAYS. See lib/forecast.ts.
  const recentTrend = estimateWeightTrend(weightWindowData)
  const curW   = recentTrend.latestSmoothed
  const tdee   = estimateAdaptiveTdee(calorieWindowData, recentTrend)
  const avgBurnWindow = calorieWindowData.length ? calorieWindowData.reduce((s, x) => s + x.burn, 0) / calorieWindowData.length : 0
  const { dailyTargetSurplus: dailyTarget, targetIntake, avgTdee, tdeeSource } =
    computeDailyTarget({ curW, tgtW: ctx.tgtW, daysLeft: ctx.days, tdee, avgBurnFallback: avgBurnWindow })
  const { onTrack, requiredPacePerDay, actualPacePerDay } =
    evaluateOnTrack({ curW, tgtW: ctx.tgtW, daysLeft: ctx.days, trend: recentTrend })

  // Long-term trend: the full fetched window (up to LONG_TERM_WINDOW_DAYS,
  // today included), used only for the long-vs-recent contrast below — never
  // feeds into the target-intake/TDEE numbers above, so existing calculations
  // are unaffected.
  const longTrend = estimateWeightTrend(ctx.data)
  const longTermLine = longTrend.n >= 10 && longTrend.spanDays >= 21
    ? `長期ペース(過去${r(longTrend.spanDays)}日間の傾向): 週あたり${r1(longTrend.slopePerDay * 7)}kg`
    : null

  // Recent-vs-baseline intake shift: catches "long-term diligent, but a
  // recent stretch (e.g. a run of social events) pushed intake up" without
  // needing to know *why* — just that the last 7 days' logged average
  // diverges from the 3 weeks before that. Logged-intake days only on both
  // sides, so differing logging-gap rates don't skew the comparison.
  const loggedDays7   = last7.filter(x => x.intake > 0)
  const avgIntakeLogged7 = loggedDays7.length ? loggedDays7.reduce((s, x) => s + x.intake, 0) / loggedDays7.length : 0
  const priorWindow    = completedData.slice(-28, -7)
  const priorLogged    = priorWindow.filter(x => x.intake > 0)
  const avgIntakePrior = priorLogged.length ? priorLogged.reduce((s, x) => s + x.intake, 0) / priorLogged.length : 0
  const intakeShiftLine = priorLogged.length >= 7 && loggedDays7.length >= 3
    ? (() => {
        const diff = avgIntakeLogged7 - avgIntakePrior
        return `直近7日の平均摂取${r(avgIntakeLogged7)}kcal は、その前3週間の平均${r(avgIntakePrior)}kcal と比べて${diff >= 0 ? '+' : ''}${r(diff)}kcal`
      })()
    : null

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
  // logged-intake days only (loggedDays7, computed above) so a logging gap
  // doesn't manufacture a false "shortfall" the same way avgLoggedIntake in
  // lib/forecast.ts avoids it.
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
    longTermLine,
    intakeShiftLine,
    catchUpLine,
    proteinLine,
    stepsLine,
  ].filter((line): line is string => line != null).join('\n')

  const user = `【直近7日の状況】\n${summary}\n\n【日別データ】\n${rows}\n\n上記をもとにアドバイスをください。`

  return [
    { role: 'system', content: buildSystem(ctx.persona, ctx.personaCustom) },
    { role: 'user',   content: user },
  ]
}
