'use client'

import type { TabProps } from '@/lib/types'
import { useAdvice } from '@/lib/useAdvice'
import { useLinkStatus } from '@/lib/useLinkStatus'
import { getByokKey } from '@/lib/byok'
import { fx } from '@/lib/data'
import InfoTip from './InfoTip'

export default function HomeTab({ s, set, c, data, daysLeft, dailyTarget, curW, remainKg, pct, onTrack, today, kVal, weeklyAdvice, userEmail }: TabProps) {
  const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP')
  const link = useLinkStatus()
  // List providers that still need linking (only shown when something is missing).
  const unlinked = [
    !link.google    && { name: 'Google Health', sub: '消費・歩数・心拍・睡眠・体組成' },
    !link.fatsecret && { name: 'FatSecret',     sub: '食事(摂取カロリー・PFC)' },
  ].filter(Boolean) as { name: string; sub: string }[]
  // Today's date in JST (replaces a former hardcoded placeholder date).
  const todayLabel = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
  })
  const { status, advice, quota, error, ask } = useAdvice()
  // Show the manual result if there is one; otherwise fall back to this week's
  // auto-generated advice (FR-4.4) so the card isn't empty on launch.
  const shownAdvice = (status === 'done' && advice) ? advice : weeklyAdvice

  const exhausted   = status === 'exhausted' || (quota?.exhausted ?? false)
  const loading     = status === 'loading'
  // BYOK requires an on-device key; block the button (not "exhausted") when missing.
  const byokMissing = s.llm === 'byok' && !getByokKey()
  const askAdvice = () => {
    if (byokMissing) return
    const apiKey = s.llm === 'byok' ? getByokKey() : undefined
    ask({ tgtW: s.tgtW, days: daysLeft, k: kVal, provider: s.llm, apiKey })
  }

  const last7  = data.slice(-7)
  const sumW   = last7.reduce((a, b) => a + b.d, 0)

  const W = 348, H = 60, p = 6
  const vals = last7.map(x => x.d)
  const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals)
  const X = (i: number) => p + i * (W - 2 * p) / (last7.length - 1)
  const Y = (v: number) => H - p - (v - mn) / ((mx - mn) || 1) * (H - 2 * p)
  const y0   = Y(0)
  const pts  = last7.map((x, i) => `${X(i)},${Y(x.d)}`).join(' ')
  const area = `M ${X(0)},${y0} ` + last7.map((x, i) => `L ${X(i)},${Y(x.d)}`).join(' ') + ` L ${X(last7.length - 1)},${y0} Z`

  const statusBg   = onTrack ? c.onTrackC : c.offTrackC
  const statusText = onTrack ? c.onTrack  : c.offTrack

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .35s ease both' }}>

      <div style={{
        fontSize: 13, color: c.onSurfVar, marginTop: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {todayLabel}{userEmail ? ` ・ ${userEmail}` : ''}
      </div>

      {/* Data-link status: warn when a provider isn't connected (data won't update). */}
      {!link.loading && unlinked.length > 0 && (
        <div style={{
          background: c.offTrackC, borderRadius: 16, padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ms" style={{ fontSize: 20, color: c.offTrack }}>link_off</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: c.offTrack }}>データ未連携</span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '19px', color: c.offTrack }}>
            {unlinked.map(u => u.name).join(' と ')} が未連携です。連携するとデータが自動取得されます。
            {unlinked.map(u => (
              <div key={u.name} style={{ fontSize: 11, opacity: .85, marginTop: 4 }}>・{u.name}：{u.sub}</div>
            ))}
          </div>
          <button type="button" onClick={() => set({ tab: 'settings' })} style={{
            alignSelf: 'flex-start', border: 'none', borderRadius: 999,
            background: c.offTrack, color: c.surface, fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer', padding: '8px 16px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="ms" style={{ fontSize: 16 }}>settings</span>
            設定で連携する
          </button>
        </div>
      )}

      {/* Today KPI card */}
      <div style={{ background: c.surfLow, borderRadius: 24, padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '.1px', color: c.onSurfVar, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            今日のカロリー収支
            <InfoTip c={c} text={'収支 = 消費 − 摂取。プラス(黒字)はカロリーを削減できた日=減量に有利、マイナス(赤字)は摂りすぎた日。'} />
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600,
            padding: '4px 10px', borderRadius: 999,
            background: today.d >= 0 ? c.creditC : c.debitC,
            color:      today.d >= 0 ? c.credit  : c.debit,
          }}>{today.d >= 0 ? '黒字' : '赤字'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.onSurfVar }}>{today.d >= 0 ? '+' : '−'}</span>
          <span style={{ fontSize: 52, lineHeight: '56px', fontWeight: 500, fontFeatureSettings: '"tnum"', letterSpacing: '-1px', color: c.onSurf }}>
            {fmt(Math.abs(today.d))}
          </span>
          <span style={{ fontSize: 15, color: c.onSurfVar, fontWeight: 500 }}>kcal</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: c.onSurfVar }}>消費</span>
            <span style={{ fontSize: 17, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.tertiary }}>{fmt(today.burn)}</span>
          </div>
          <div style={{ width: 1, background: c.outlineVar, opacity: .6 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: c.onSurfVar }}>摂取</span>
            <span style={{ fontSize: 17, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.primary }}>{fmt(today.intake)}</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ alignSelf: 'flex-end', fontSize: 11, color: c.onSurfVar }}>消費 − 摂取</div>
        </div>
      </div>

      {/* Goal progress card */}
      <div style={{ background: c.surfLow, borderRadius: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.onSurfVar, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            目標達成まで
            <InfoTip c={c} text={'目標体重まで残り何kg・残り何日かを表示。「オントラック」は今の収支ペースで目標に間に合う見込み、「要調整」はペース不足。'} />
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600,
            padding: '4px 10px 4px 8px', borderRadius: 999,
            background: statusBg, color: statusText,
          }}>
            <span className="ms" style={{ fontSize: 14, marginRight: 3 }}>
              {onTrack ? 'trending_down' : 'priority_high'}
            </span>
            {onTrack ? 'オントラック' : '要調整'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 500, fontFeatureSettings: '"tnum"', lineHeight: '34px' }}>残り {fx(remainKg)}</div>
            <div style={{ fontSize: 12, color: c.onSurfVar, marginTop: 2 }}>kg</div>
          </div>
          <div style={{ width: 1, height: 30, background: c.outlineVar, opacity: .6, marginBottom: 14 }} />
          <div>
            <div style={{ fontSize: 32, fontWeight: 500, fontFeatureSettings: '"tnum"', lineHeight: '34px' }}>残り {daysLeft}</div>
            <div style={{ fontSize: 12, color: c.onSurfVar, marginTop: 2 }}>日</div>
          </div>
        </div>
        <div style={{ marginTop: 16, height: 10, borderRadius: 999, background: c.surfHighest, overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', borderRadius: 999, background: c.primary, width: `${Math.round(pct)}%`, transition: 'width .4s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 11, fontFeatureSettings: '"tnum"', color: c.onSurfVar }}>
          <span>現在 {fx(curW)} kg</span>
          <span>目標 {fx(s.tgtW)} kg</span>
        </div>
      </div>

      {/* Sparkline card */}
      <div style={{ background: c.surfLow, borderRadius: 24, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.onSurfVar }}>直近7日の収支</span>
          <span style={{ fontSize: 12, color: c.onSurfVar, fontFeatureSettings: '"tnum"' }}>
            合計 {sumW >= 0 ? '+' : '−'}{fmt(Math.abs(sumW))} kcal
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          <path d={area} fill={c.credit} opacity={0.12} />
          <line x1={p} x2={W - p} y1={y0} y2={y0} stroke={c.outlineVar} strokeWidth={1} strokeDasharray="2 3" />
          <polyline points={pts} fill="none" stroke={c.credit} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {last7.map((x, i) => (
            <circle key={i} cx={X(i)} cy={Y(x.d)} r={2.6} fill={x.d >= 0 ? c.credit : c.debit} />
          ))}
        </svg>
      </div>

      {/* AI Advisor card */}
      <div style={{ background: c.primaryC, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="ms" style={{ fontSize: 24, color: c.onPrimaryC }}>auto_awesome</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: c.onPrimaryC, marginBottom: 4 }}>AIアドバイザー</div>
            <div style={{ fontSize: 12.5, lineHeight: '19px', color: c.onPrimaryC, opacity: .9, whiteSpace: 'pre-wrap' }}>
              {loading
                ? 'データを分析しています…'
                : shownAdvice
                  ? shownAdvice
                  : status === 'error'
                    ? `生成に失敗しました: ${error ?? '不明なエラー'}`
                    : byokMissing
                      ? '設定でBYOKのAPIキーを入力すると、アドバイスを生成できます。'
                      : exhausted
                        ? '本日のGroq無料クォータを使い切りました。深夜にリセットされます。設定からBYOK(自分のAPIキー)に切り替えるとすぐ利用できます。'
                        : '直近1週間の食事・運動・体重の予実乖離をもとに、改善ポイントを提案します。'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" onClick={askAdvice} disabled={loading || exhausted || byokMissing} style={{
            border: 'none', borderRadius: 999,
            background: (loading || exhausted || byokMissing) ? c.surfHighest : c.primary,
            color: (loading || exhausted || byokMissing) ? c.onSurfVar : c.onPrimary,
            height: 48, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
            cursor: (loading || exhausted || byokMissing) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span className="ms" style={{ fontSize: 20, animation: loading ? 'spin 1s linear infinite' : 'none' }}>
              {loading ? 'progress_activity' : 'auto_awesome'}
            </span>
            {loading ? '生成中…' : shownAdvice ? 'もう一度もらう' : 'アドバイスをもらう'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 11, color: c.onPrimaryC, opacity: .85 }}>
            <span className="ms" style={{ fontSize: 14 }}>bolt</span>
            <span style={{ fontFeatureSettings: '"tnum"' }}>
              {s.llm === 'byok'
                ? (byokMissing ? '設定でAPIキーを入力してください' : 'BYOK(自分のAPIキー)を使用')
                : quota
                  ? exhausted ? '本日のクォータを使い切りました' : `本日あと約 ${quota.remaining} 回 ・ 深夜にリセット`
                  : 'クォータを確認中…'}
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}
