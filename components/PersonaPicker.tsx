'use client'

import type { C } from '@/lib/colors'
import type { AdvisorPersona } from '@/lib/advisor'

const PRESETS: { key: Exclude<AdvisorPersona, 'custom'>; label: string; desc: string }[] = [
  { key: 'friend',  label: '友人・家族',   desc: 'カジュアルで温かい口調' },
  { key: 'trainer', label: 'トレーナー',   desc: '丁寧語・専門的な信頼感' },
  { key: 'strict',  label: '厳しめコーチ', desc: '率直に数字を突きつける' },
]

/** Shared persona picker used by both SettingsTab and the first-launch
 *  onboarding prompt. Selecting a preset clears personaCustom; selecting
 *  「自由記述」reveals a textarea bound to personaCustom. */
export default function PersonaPicker({
  c, persona, personaCustom, onChange,
}: {
  c: C
  persona: AdvisorPersona | null
  personaCustom: string | null
  onChange: (persona: AdvisorPersona, personaCustom: string | null) => void
}) {
  const btnSt = (active: boolean): React.CSSProperties => ({
    flex: '1 1 auto', minWidth: 92, border: `1px solid ${active ? 'transparent' : c.outlineVar}`, borderRadius: 12,
    background: active ? c.secondaryC : 'transparent',
    color:      active ? c.onSecC : c.onSurf,
    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
    padding: '10px 8px', textAlign: 'center',
  })
  const descSt = (active: boolean): React.CSSProperties => ({
    fontSize: 10, fontWeight: 400, marginTop: 2,
    color: active ? c.onSecC : c.onSurfVar, opacity: active ? .9 : .8,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p.key} type="button" onClick={() => onChange(p.key, null)} style={btnSt(persona === p.key)}>
            {p.label}
            <div style={descSt(persona === p.key)}>{p.desc}</div>
          </button>
        ))}
        <button type="button" onClick={() => onChange('custom', personaCustom ?? '')} style={btnSt(persona === 'custom')}>
          自由記述
          <div style={descSt(persona === 'custom')}>キャラを自分で指定</div>
        </button>
      </div>
      {persona === 'custom' && (
        <textarea
          value={personaCustom ?? ''}
          onChange={e => onChange('custom', e.target.value)}
          placeholder="例：関西弁でツッコむ先輩、のように話し方や性格を数行で書いてください"
          rows={3}
          maxLength={300}
          style={{
            width: '100%', border: `1px solid ${c.outline}`, borderRadius: 12,
            padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', lineHeight: '19px',
            color: c.onSurf, background: c.surf, resize: 'vertical',
          }}
        />
      )}
    </div>
  )
}
