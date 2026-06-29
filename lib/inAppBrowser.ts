'use client'

// Detect embedded in-app browsers (WebViews) and the OS, used to guide users out
// of contexts where Google OAuth is blocked.
//
// Google blocks OAuth sign-in from embedded WebViews ("Use secure browsers"
// policy → error 403: disallowed_useragent). When someone opens the app link
// inside LINE / Instagram / X / Facebook etc., Firebase sign-in fails no matter
// what we do client-side — the only fix is to reopen in a real browser. We detect
// the common in-app browsers so the UI can tell the user that.

function ua(): string {
  if (typeof navigator === 'undefined') return ''
  return navigator.userAgent || ''
}

// Known in-app browser user-agent signatures.
const IN_APP_SIGNATURES = [
  'Line/',            // LINE
  'FBAN', 'FBAV', 'FB_IAB',  // Facebook / Messenger
  'Instagram',        // Instagram
  'Twitter',          // X / Twitter
  'MicroMessenger',   // WeChat
  'BytedanceWebview', 'musical_ly',  // TikTok
  'KAKAOTALK',        // KakaoTalk
]

/**
 * True when running inside an embedded in-app browser (WebView) where Google
 * OAuth is likely to be blocked. Heuristic: known app signatures, or a generic
 * Android WebView (`; wv` token in the UA).
 */
export function isInAppBrowser(): boolean {
  const s = ua()
  if (!s) return false
  if (IN_APP_SIGNATURES.some(sig => s.includes(sig))) return true
  // Generic Android WebView marker.
  if (/\bwv\b/.test(s) || s.includes('; wv)')) return true
  return false
}

export function isAndroid(): boolean {
  return /Android/i.test(ua())
}

export function isIOS(): boolean {
  const s = ua()
  // iPadOS 13+ reports as Macintosh; fall back to touch detection.
  return /iPhone|iPad|iPod/i.test(s) ||
    (s.includes('Macintosh') && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
}
