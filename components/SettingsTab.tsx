'use client'

import { useEffect, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import type { TabProps } from '@/lib/types'
import type { QuotaInfo } from '@/lib/useAdvice'
import { authFetch } from '@/lib/authFetch'
import { getByokKey, setByokKey } from '@/lib/byok'
import { useLinkStatus } from '@/lib/useLinkStatus'
import { fx } from '@/lib/data'
import { VERSION_LABEL } from '@/lib/version'

export default function SettingsTab({ s, set, c, daysLeft, curW, syncing, lastSynced, sync }: TabProps) {
  const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP')

  const lastSyncedLabel = lastSynced
    ? lastSynced.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '未同期'

  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  useEffect(() => {
    authFetch('/api/advice', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { quota?: QuotaInfo }) => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const linked = useLinkStatus()

  // The OAuth start routes are owner-guarded, so we fetch them with a Bearer
  // token (a plain <a href> can't carry one) and navigate to the returned URL.
  const [linkBusy, setLinkBusy] = useState<string | null>(null)
  const startLink = async (href: string) => {
    setLinkBusy(href)
    try {
      const res = await authFetch(href, { cache: 'no-store' })
      const d = await res.json() as { url?: string; error?: string }
      if (d.url) { window.location.href = d.url; return }
      alert(`連携を開始できませんでした: ${d.error ?? res.status}`)
    } catch {
      alert('連携を開始できませんでした')
    } finally {
      setLinkBusy(null)
    }
  }

  // BYOK API key (stored on-device in localStorage; never sent to our DB).
  const [byokKey, setByokKeyState] = useState('')
  const [byokSaved, setByokSaved]  = useState(false)
  useEffect(() => { setByokKeyState(getByokKey()) }, [])
  const onByokChange = (v: string) => {
    setByokKeyState(v)
    setByokKey(v)
    setByokSaved(true)
    setTimeout(() => setByokSaved(false), 1500)
  }

  const need     = Math.max(0, curW - s.tgtW) * 7200
  const dailyT   = daysLeft > 0 ? need / daysLeft : 0
  const weekly   = daysLeft > 0 ? (curW - s.tgtW) / (daysLeft / 7) : 0

  const llmBtnSt = (active: boolean) => ({
    flex: 1, border: `1px solid ${active ? 'transparent' : c.outlineVar}`, borderRadius: 12,
    background: active ? c.secondaryC : 'transparent',
    color:      active ? c.onSecC : c.onSurfVar,
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', height: 44,
  })

  const sliderSt: React.CSSProperties = { width: '100%', accentColor: c.primary, height: 4 }

  const stepBtn = (onClick: () => void, icon: string, col: typeof c) => (
    <button type="button" onClick={onClick} aria-label={icon === 'add' ? '増やす' : '減らす'} style={{
      width: 32, height: 32, borderRadius: 999, border: `1px solid ${col.outlineVar}`,
      background: 'transparent', color: col.primary, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    }}>
      <span className="ms" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  )

  // Goal is an absolute date. days-left counts down on its own (see daysLeft prop).
  const tgtDateVal = s.tgtDate ? dayjs(s.tgtDate) : null
  const onDateChange = (v: Dayjs | null) => {
    if (v && v.isValid()) set({ tgtDate: v.format('YYYY-MM-DD') })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp .35s ease both' }}>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '10px 4px 0' }}>目標設定</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', background: c.surf, borderRadius: 12, marginBottom: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ms" style={{ fontSize: 18, color: c.primary }}>monitor_weight</span>
            <span style={{ fontSize: 13, color: c.onSurfVar }}>現在の体重(最新の取得値)</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{fx(curW)} kg</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
          <span style={{ fontSize: 13, color: c.onSurfVar }}>目標体重</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {stepBtn(() => set({ tgtW: Math.max(50, Math.round((s.tgtW - 0.5) * 2) / 2) }), 'remove', c)}
            <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"', minWidth: 64, textAlign: 'center' }}>{fx(s.tgtW)} kg</span>
            {stepBtn(() => set({ tgtW: Math.min(90, Math.round((s.tgtW + 0.5) * 2) / 2) }), 'add', c)}
          </div>
        </div>
        <input type="range" min={50} max={90} step={0.5} value={s.tgtW}
          onChange={e => set({ tgtW: parseFloat(e.target.value) })}
          style={sliderSt} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
          <span style={{ fontSize: 13, color: c.onSurfVar }}>目標達成日</span>
          <span style={{ fontSize: 12, color: c.onSurfVar, fontFeatureSettings: '"tnum"' }}>あと {daysLeft} 日</span>
        </div>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            value={tgtDateVal}
            onChange={onDateChange}
            minDate={dayjs().add(1, 'day')}
            format="YYYY/MM/DD"
            slotProps={{
              textField: {
                fullWidth: true,
                size: 'small',
                sx: {
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    color: c.onSurf,
                    fontFeatureSettings: '"tnum"',
                  },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: c.outline },
                  '& .MuiSvgIcon-root': { color: c.onSurfVar },
                },
              },
            }}
          />
        </LocalizationProvider>

        <div style={{
          marginTop: 20, background: c.secondaryC, borderRadius: 16, padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: c.onSecC, letterSpacing: '.4px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span className="ms" style={{ fontSize: 16 }}>insights</span>到達目安プレビュー
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: '週あたり',     value: `約${fx(Math.abs(weekly), 2)}`, unit: 'kg' },
              { label: '目標まで',     value: `約${Math.round(daysLeft / 7)}`,    unit: '週' },
              { label: '日次目標黒字', value: `+${fmt(dailyT)}`,                  unit: 'kcal' },
            ].map(m => (
              <div key={m.label} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: c.onSecC, opacity: .85, whiteSpace: 'nowrap' }}>{m.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.onSecC }}>{m.value}</span>
                  <span style={{ fontSize: 11, color: c.onSecC, opacity: .85 }}>{m.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: c.onSecC, opacity: .8, lineHeight: '15px' }}>
            係数 k=7,200 を使用した目安です。実測が貯まると個人係数 k で自動キャリブレーションされます。
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>データ連携</div>

      <div style={{ background: c.surfLow, borderRadius: 24, overflow: 'hidden' }}>
        {[
          { key: 'google'    as const, icon: 'favorite', col: c.primary, title: 'Google Health', sub: '消費・歩数・心拍・睡眠・体組成', href: '/api/auth/google' },
          { key: 'fatsecret' as const, icon: 'restaurant', col: c.tertiary, title: 'FatSecret', sub: '食事日記(3-legged OAuth・読み出し)', href: '/api/auth/fatsecret' },
        ].map((item, i) => {
          const isLinked = linked[item.key]
          return (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
              borderBottom: i === 0 ? `1px solid ${c.outlineVar}` : undefined,
            }}>
              <span className="ms" style={{ fontSize: 24, color: item.col }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {item.title}
                  {isLinked && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 600,
                      color: c.onTrack, background: c.onTrackC, padding: '1px 7px 1px 5px', borderRadius: 999,
                    }}>
                      <span className="ms" style={{ fontSize: 12 }}>check</span>連携済み
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: c.onSurfVar }}>{item.sub}</div>
              </div>
              <button type="button" onClick={() => startLink(item.href)} disabled={linkBusy === item.href} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                color: isLinked ? c.onSurfVar : c.primary,
                background: isLinked ? 'transparent' : c.primaryC,
                border: isLinked ? `1px solid ${c.outlineVar}` : 'none',
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                fontFamily: 'inherit', opacity: linkBusy === item.href ? .6 : 1,
              }}>
                <span className="ms" style={{ fontSize: 14 }}>{isLinked ? 'refresh' : 'link'}</span>
                {isLinked ? '再連携' : '連携する'}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>AIアドバイザー (LLM)</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: 18 }}>
        <div style={{ fontSize: 13, color: c.onSurfVar, marginBottom: 10 }}>プロバイダ</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => set({ llm: 'groq' })} style={llmBtnSt(s.llm === 'groq')}>Groq(無料)</button>
          <button type="button" onClick={() => set({ llm: 'byok' })} style={llmBtnSt(s.llm === 'byok')}>BYOK</button>
        </div>
        {s.llm === 'byok' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="byok-key" style={{ fontSize: 11, color: c.onSurfVar, display: 'flex', justifyContent: 'space-between' }}>
              <span>API キー</span>
              {byokSaved && <span style={{ color: c.onTrack }}>保存しました</span>}
            </label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${c.outline}`, borderRadius: 12, padding: '0 14px', height: 48,
            }}>
              <span className="ms" style={{ fontSize: 20, color: c.onSurfVar }}>key</span>
              <input id="byok-key" type="password" value={byokKey} placeholder="sk-..."
                onChange={e => onByokChange(e.target.value)} style={{
                  flex: 1, border: 'none', background: 'none', outline: 'none',
                  color: c.onSurf, fontFamily: 'inherit', fontSize: 14,
                }} />
              {byokKey && (
                <button type="button" onClick={() => onByokChange('')} aria-label="キーを削除" style={{
                  border: 'none', background: 'none', color: c.onSurfVar, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', padding: 0,
                }}>
                  <span className="ms" style={{ fontSize: 18 }}>close</span>
                </button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: c.onSurfVar, opacity: .8, lineHeight: '15px' }}>
              キーはこの端末内(ブラウザ)にのみ保存され、サーバーDBには保存されません。Groq互換のOpenAI形式エンドポイントを使用します。
            </div>
          </div>
        )}
        {s.llm === 'groq' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.onSurfVar,
            background: c.surf, padding: '12px 14px', borderRadius: 12,
          }}>
            <span className="ms" style={{ fontSize: 18 }}>bolt</span>
            <span style={{ fontFeatureSettings: '"tnum"' }}>
              {quota
                ? quota.exhausted
                  ? '本日のクォータを使い切りました ・ 深夜にリセット'
                  : `本日あと約 ${quota.remaining} 回 ・ 深夜にリセット`
                : 'クォータを確認中…'}
            </span>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>同期</div>

      <div style={{ background: c.surfLow, borderRadius: 24, padding: 18, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>自動取得スコープ</div>
            <div style={{ fontSize: 11, color: c.onSurfVar }}>起動時SWR + 前面復帰 + 手動</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>直近 7日</span>
        </div>
        <button type="button" onClick={() => { void sync() }} disabled={syncing} style={{
          marginTop: 16, width: '100%', height: 46,
          border: `1px solid ${c.outline}`, background: 'none', borderRadius: 999,
          color: c.primary, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span className="ms" style={{ fontSize: 20, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>sync</span>
          {syncing ? '同期中…' : `今すぐ同期 ・ 最終 ${lastSyncedLabel}`}
        </button>
      </div>

      {/* Release version footer */}
      <div style={{
        textAlign: 'center', fontSize: 11, color: c.onSurfVar, opacity: .8,
        margin: '10px 0 4px', fontFeatureSettings: '"tnum"',
      }}>
        健康収支トラッカー　{VERSION_LABEL}
      </div>

    </div>
  )
}
