import { FirebaseError } from 'firebase/app'
import { signInWithPopup, signInWithRedirect } from 'firebase/auth'
import { useState } from 'react'
import { auth, googleProvider } from '../firebase'

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      // Kiosk browsers and installed PWAs often block popups; fall back to a full-page redirect.
      if (e instanceof FirebaseError && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      if (!(e instanceof FirebaseError && e.code === 'auth/popup-closed-by-user')) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="center-screen">
      <div className="card card--narrow">
        <h1>Family Organizer</h1>
        <p>Sign in with your Google account to see the family's chores, meals, and calendar.</p>
        <button className="button button--primary button--large" onClick={signIn} disabled={busy}>
          Sign in with Google
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  )
}
