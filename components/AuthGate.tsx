'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/lib/useAuth'
import { authFetch } from '@/lib/authFetch'

const backdrop = '#c4cfc8'

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: backdrop, padding: 24,
      fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif',
    }}>{children}</div>
  )
}

/**
 * Gates the whole app behind Google sign-in. The actual data authorization
 * (allow-list) is enforced server-side; here we additionally probe a guarded
 * endpoint after sign-in so a signed-in but not-allow-listed user sees a clear
 * "access denied" screen instead of a broken app showing mock data.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, error, signIn, logout } = useAuth()
  const [authz, setAuthz] = useState<'checking' | 'ok' | 'denied'>('checking')

  useEffect(() => {
    if (!user) { setAuthz('checking'); return }
    let cancelled = false
    setAuthz('checking')
    authFetch('/api/auth/status')
      .then(res => { if (!cancelled) setAuthz(res.status === 403 ? 'denied' : 'ok') })
      .catch(() => { if (!cancelled) setAuthz('ok') })  // network errors aren't authz failures
    return () => { cancelled = true }
  }, [user])

  if (loading) {
    return (
      <Centered>
        <span className="ms" style={{ fontSize: 36, color: '#175C49', animation: 'spin 1s linear infinite' }}>
          progress_activity
        </span>
      </Centered>
    )
  }

  if (!user) {
    return (
      <Centered>
        <div style={{
          width: 360, maxWidth: '100%', background: '#fff', borderRadius: 28,
          padding: '40px 28px', boxShadow: '0 18px 50px rgba(0,0,0,.22)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center',
        }}>
          <span className="ms" style={{ fontSize: 44, color: '#175C49' }}>monitoring</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1a2420' }}>健康収支トラッカー</div>
            <div style={{ fontSize: 13, color: '#52635c', marginTop: 6, lineHeight: '20px' }}>
              続けるには Google でサインインしてください。
            </div>
          </div>
          <button type="button" onClick={signIn} style={{
            width: '100%', height: 48, border: '1px solid #c4cfc8', borderRadius: 999,
            background: '#fff', color: '#1a2420', fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span className="ms" style={{ fontSize: 20, color: '#175C49' }}>login</span>
            Google でサインイン
          </button>
          {error && (
            <div style={{ fontSize: 12, color: '#b3261e', lineHeight: '17px' }}>{error}</div>
          )}
        </div>
      </Centered>
    )
  }

  if (authz === 'denied') {
    return (
      <Centered>
        <div style={{
          width: 360, maxWidth: '100%', background: '#fff', borderRadius: 28,
          padding: '40px 28px', boxShadow: '0 18px 50px rgba(0,0,0,.22)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center',
        }}>
          <span className="ms" style={{ fontSize: 44, color: '#b3261e' }}>block</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1a2420' }}>アクセスが許可されていません</div>
            <div style={{ fontSize: 13, color: '#52635c', marginTop: 6, lineHeight: '20px' }}>
              このアカウント（{user.email}）はこのアプリの利用を許可されていません。
              別のアカウントでサインインしてください。
            </div>
          </div>
          <button type="button" onClick={logout} style={{
            width: '100%', height: 48, border: '1px solid #c4cfc8', borderRadius: 999,
            background: '#fff', color: '#1a2420', fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span className="ms" style={{ fontSize: 20, color: '#175C49' }}>logout</span>
            サインアウト
          </button>
        </div>
      </Centered>
    )
  }

  if (authz === 'checking') {
    return (
      <Centered>
        <span className="ms" style={{ fontSize: 36, color: '#175C49', animation: 'spin 1s linear infinite' }}>
          progress_activity
        </span>
      </Centered>
    )
  }

  return <>{children}</>
}
