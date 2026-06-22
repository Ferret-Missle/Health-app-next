'use client'

import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth, signInWithGoogle, signOut, type User } from './firebase'

interface UseAuth {
  user:    User | null
  loading: boolean        // initial auth-state resolution
  error:   string | null
  signIn:  () => Promise<void>
  logout:  () => Promise<void>
}

export function useAuth(): UseAuth {
  const [user, setUser]       = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), u => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      await signInWithGoogle()
    } catch (e) {
      // Ignore the user closing the popup; surface real failures.
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const logout = useCallback(async () => {
    await signOut()
  }, [])

  return { user, loading, error, signIn, logout }
}
