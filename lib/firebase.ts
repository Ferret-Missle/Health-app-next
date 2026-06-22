'use client'

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  type Auth, type User,
} from 'firebase/auth'

// Client-side Firebase config (safe to expose; security is enforced server-side
// by verifying the ID token + ALLOWED_UID on every API request).
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

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(getFirebaseAuth(), provider)
  return result.user
}

export function signOut(): Promise<void> {
  return fbSignOut(getFirebaseAuth())
}

/** Fresh ID token for the current user, or null if signed out. */
export async function getIdToken(): Promise<string | null> {
  const user = getFirebaseAuth().currentUser
  return user ? user.getIdToken() : null
}

export type { User }
