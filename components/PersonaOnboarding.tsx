'use client'

import { useState } from 'react'
import type { C } from '@/lib/colors'
import type { AdvisorPersona } from '@/lib/advisor'
import PersonaPicker from './PersonaPicker'

/**
 * First-launch nudge to pick an AI advisor persona. Shown whenever
 * advisorPersona is still null (server-persisted — see lib/useSettings.ts) —
 * dismissing it only hides it for this session (local state), it does NOT
 * save a persona, so it reappears next launch until the user actually picks
 * one. The Settings tab always has the same picker if they'd rather go there.
 */
export default function PersonaOnboarding({
  c, onChange,
}: {
  c: C
  onChange: (persona: AdvisorPersona, personaCustom: string | null) => void
}) {
  const [dismissed, setDismissed] = useState(false)
  const [persona, setPersona] = useState<AdvisorPersona | null>(null)
  const [customText, setCustomText] = useState<string | null>(null)

  if (dismissed) return null

  const confirm = () => {
    if (!persona) return
    onChange(persona, persona === 'custom' ? customText : null)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(0,0,0,.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, background: c.surface, borderRadius: '24px 24px 0 0',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 -8px 30px rgba(0,0,0,.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: c.onSurf }}>AIアドバイザーのキャラクターを選ぼう</div>
            <div style={{ fontSize: 12, color: c.onSurfVar, marginTop: 4, lineHeight: '18px' }}>
              どんな口調でアドバイスしてほしいですか？後から設定タブでいつでも変更できます。
            </div>
          </div>
          <button type="button" onClick={() => setDismissed(true)} aria-label="後で" style={{
            border: 'none', background: 'none', color: c.onSurfVar, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', padding: 4, flex: 'none',
          }}>
            <span className="ms" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <PersonaPicker c={c} persona={persona} personaCustom={customText}
          onChange={(p, custom) => { setPersona(p); setCustomText(custom) }} />

        <button type="button" onClick={confirm} disabled={!persona} style={{
          width: '100%', height: 48, border: 'none', borderRadius: 999,
          background: persona ? c.primary : c.surfHighest,
          color: persona ? '#fff' : c.onSurfVar,
          fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
          cursor: persona ? 'pointer' : 'not-allowed',
        }}>
          このキャラクターで始める
        </button>
      </div>
    </div>
  )
}
