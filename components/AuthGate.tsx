'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/lib/useAuth'
import { authFetch } from '@/lib/authFetch'
import { isInAppBrowser, isAndroid } from '@/lib/inAppBrowser'

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
 * Shown on the sign-in screen when the app is opened inside an in-app browser
 * (WebView), where Google blocks OAuth (error 403: disallowed_useragent). Guides
 * the user to reopen in Chrome/Safari. On Android we can force-open Chrome via an
 * intent: URL; on iOS that isn't possible, so we offer to copy the URL.
 */
function InAppBrowserNotice() {
  const [copied, setCopied] = useState(false)

  const openExternally = () => {
    const { host, pathname, search } = window.location
    // intent: URL opens the link directly in Chrome on Android.
    window.location.href =
      `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{
      width: '100%', background: '#fff4e5', border: '1px solid #f0c98a', borderRadius: 16,
      padding: '16px 16px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="ms" style={{ fontSize: 20, color: '#9a6700' }}>open_in_new</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#7a4f00' }}>ブラウザで開いてください</span>
      </div>
      <div style={{ fontSize: 12.5, color: '#7a5a1e', lineHeight: '19px' }}>
        アプリ内ブラウザ（LINE・Instagram 等）では Google ログインが Google 側でブロックされます。
        Chrome または Safari で開き直してください。
      </div>
      {isAndroid() ? (
        <button type="button" onClick={openExternally} style={{
          width: '100%', height: 44, border: 'none', borderRadius: 999,
          background: '#175C49', color: '#fff', fontSize: 14, fontWeight: 600,
          fontFamily: 'inherit', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span className="ms" style={{ fontSize: 18 }}>open_in_browser</span>
          Chrome で開く
        </button>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#7a5a1e', lineHeight: '18px' }}>
            iPhone は右上のメニューから「Safari で開く」を選ぶか、下のボタンで URL をコピーして
            Safari に貼り付けてください。
          </div>
          <button type="button" onClick={copyUrl} style={{
            width: '100%', height: 44, border: '1px solid #c4cfc8', borderRadius: 999,
            background: '#fff', color: '#1a2420', fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span className="ms" style={{ fontSize: 18, color: '#175C49' }}>
              {copied ? 'check' : 'content_copy'}
            </span>
            {copied ? 'コピーしました' : 'URL をコピー'}
          </button>
        </>
      )}
    </div>
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
  // Detected after mount only — navigator isn't available during SSR and we must
  // avoid a hydration mismatch.
  const [inApp, setInApp] = useState(false)

  useEffect(() => { setInApp(isInAppBrowser()) }, [])

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
          {inApp && <InAppBrowserNotice />}
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
