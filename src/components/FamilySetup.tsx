import { signOut, type User } from 'firebase/auth'
import { useState, type FormEvent } from 'react'
import { auth } from '../firebase'
import { createFamily } from '../lib/family'

interface Props {
  user: User
  onCreated: (familyId: string) => void
}

/** Shown to a signed-in user who hasn't been invited to a family. */
export function FamilySetup({ user, onCreated }: Props) {
  const lastName = user.displayName?.split(' ').slice(-1)[0]
  const [name, setName] = useState(lastName ? `The ${lastName} Family` : 'Our Family')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createFamily(user, name.trim() || 'Our Family'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <main className="center-screen">
      <form className="card card--narrow" onSubmit={submit}>
        <h1>Welcome, {user.displayName?.split(' ')[0] ?? 'there'}</h1>
        <p>
          <strong>{user.email}</strong> hasn't been added to a family yet. If someone meant to invite you, ask them to add
          this email in their Family tab. Otherwise, start a new family:
        </p>
        <label className="field">
          Family name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <div className="row">
          <button className="button button--primary" disabled={busy}>
            Create family
          </button>
          <button type="button" className="button" onClick={() => signOut(auth)}>
            Use a different account
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  )
}
