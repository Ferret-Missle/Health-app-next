'use client'

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  type Auth, type User,
} from 'firebase/auth'
import { isAndroid, isIOS } from './inAppBrowser'

// Client-side Firebase config (safe to expose; security is enforced server-side
// by verifying the ID token against the access allow-list on every API request).
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let _app: FirebaseApp | null = null
let _auth: Auth | null = null

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig)
    _auth = getAuth(_app)
  }
  return _auth
}

function isMobile(): boolean {
  return isAndroid() || isIOS()
}

/**
 * Start Google sign-in. On mobile we use a full-page redirect (popups are
 * unreliable in mobile browsers and often blocked); on desktop we use a popup,
 * falling back to redirect if the popup is blocked. On redirect the page
 * navigates away, so the returned promise only resolves for the popup path —
 * completion after a redirect is handled by completeRedirectSignIn() on load.
 */
export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider()
  const auth = getFirebaseAuth()

  if (isMobile()) {
    await signInWithRedirect(auth, provider)
    return null
  }

  try {
    const result = await signInWithPopup(auth, provider)
    return result.user
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return null
    }
    throw e
  }
}

/** Complete a redirect-based sign-in on page load; returns the user or null. */
export function completeRedirectSignIn(): Promise<User | null> {
  return getRedirectResult(getFirebaseAuth()).then(r => r?.user ?? null)
}

export function signOut(): Promise<void> {
  return fbSignOut(getFirebaseAuth())
}

/** Resolve once Firebase has restored the persisted auth state. */
function waitForUser(): Promise<User | null> {
  const auth = getFirebaseAuth()
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u) })
  })
}

/** Fresh ID token for the current user, or null if signed out. */
export async function getIdToken(): Promise<string | null> {
  const user = await waitForUser()
  return user ? user.getIdToken() : null
}

export type { User }
