'use client'

import { useEffect, useState } from 'react'
import type { TabProps } from '@/lib/types'
import type { QuotaInfo } from '@/lib/useAdvice'
import { authFetch } from '@/lib/authFetch'

export default function SettingsTab({ s, set, c, curW }: TabProps) {
  const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP')

  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  useEffect(() => {
    authFetch('/api/advice', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { quota?: QuotaInfo }) => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const need     = Math.max(0, curW - s.tgtW) * 7200
  const dailyT   = s.days > 0 ? need / s.days : 0
  const weekly   = s.days > 0 ? (curW - s.tgtW) / (s.days / 7) : 0

  const llmBtnSt = (active: boolean) => ({
    flex: 1, border: `1px solid ${active ? 'transparent' : c.outlineVar}`, borderRadius: 12,
    background: active ? c.secondaryC : 'transparent',
    color:      active ? c.onSecC : c.onSurfVar,
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', height: 44,
  })

  const sliderSt: React.CSSProperties = { width: '100%', accentColor: c.primary, height: 4 }

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
          <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{curW.toFixed(1)} kg</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
          <span style={{ fontSize: 13, color: c.onSurfVar }}>目標体重</span>
          <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{s.tgtW.toFixed(1)} kg</span>
        </div>
        <input type="range" min={50} max={90} step={0.1} value={s.tgtW}
          onChange={e => set({ tgtW: parseFloat(e.target.value) })}
          style={sliderSt} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 6px' }}>
          <span style={{ fontSize: 13, color: c.onSurfVar }}>目標達成日まで</span>
          <span style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{s.days} 日</span>
        </div>
        <input type="range" min={30} max={240} step={1} value={s.days}
          onChange={e => set({ days: parseInt(e.target.value) })}
          style={sliderSt} />

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
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: c.onSecC, opacity: .85 }}>週あたり</div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.onSecC }}>
                約 {Math.abs(weekly).toFixed(2)} kg
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: c.onSecC, opacity: .85 }}>目標まで</div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.onSecC }}>
                約 {Math.round(s.days / 7)} 週
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: c.onSecC, opacity: .85 }}>日次目標黒字</div>
              <div style={{ fontSize: 20, fontWeight: 600, fontFeatureSettings: '"tnum"', color: c.onSecC }}>
                +{fmt(dailyT)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: c.onSecC, opacity: .8, lineHeight: '15px' }}>
            係数 k=7,200 を使用した目安です。実測が貯まると個人係数 k で自動キャリブレーションされます。
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: c.onSurfVar, letterSpacing: '.6px', margin: '6px 4px 0' }}>データ連携</div>

      <div style={{ background: c.surfLow, borderRadius: 24, overflow: 'hidden' }}>
        {[
          { icon: 'favorite', col: c.primary, title: 'Google Health', sub: '消費・歩数・心拍・睡眠・体組成', href: '/api/auth/google' },
          { icon: 'restaurant', col: c.tertiary, title: 'FatSecret', sub: '食事日記(3-legged OAuth・読み出し)', href: '/api/auth/fatsecret' },
        ].map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
            borderBottom: i === 0 ? `1px solid ${c.outlineVar}` : undefined,
          }}>
            <span className="ms" style={{ fontSize: 24, color: item.col }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: c.onSurfVar }}>{item.sub}</div>
            </div>
            <a href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
              color: c.primary, background: c.primaryC, padding: '4px 10px', borderRadius: 999,
              textDecoration: 'none',
            }}>
              <span className="ms" style={{ fontSize: 14 }}>link</span>連携する
            </a>
          </div>
        ))}
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
            <label style={{ fontSize: 11, color: c.onSurfVar }}>API キー</label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${c.outline}`, borderRadius: 12, padding: '0 14px', height: 48,
            }}>
              <span className="ms" style={{ fontSize: 20, color: c.onSurfVar }}>key</span>
              <input type="password" defaultValue="" placeholder="sk-..." style={{
                flex: 1, border: 'none', background: 'none', outline: 'none',
                color: c.onSurf, fontFamily: 'inherit', fontSize: 14,
              }} />
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
        <button type="button" style={{
          marginTop: 16, width: '100%', height: 46,
          border: `1px solid ${c.outline}`, background: 'none', borderRadius: 999,
          color: c.primary, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span className="ms" style={{ fontSize: 20 }}>sync</span>今すぐ同期 ・ 最終 14:32
        </button>
      </div>

    </div>
  )
}
