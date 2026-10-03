import { signOut, type User } from 'firebase/auth'
import { useEffect, useState, type FormEvent } from 'react'
import { checkInvite, clearPendingInvite, pendingInvite, type InviteState } from '../features/admin/householdInvites'
import { auth } from '../firebase'
import { createFamily } from '../lib/family'

interface Props {
  user: User
  onCreated: (familyId: string) => void
  /** Injectable for tests. */
  invite?: { code: string | null; check: (code: string) => Promise<InviteState> }
}

const INVITE_PROBLEM: Record<Exclude<InviteState, 'valid'>, string> = {
  used: 'That household invite link has already been used. Ask for a new one.',
  expired: 'That household invite link has expired. Ask for a new one.',
  missing: 'That household invite link isn’t valid (it may have been cancelled). Ask for a new one.',
}

/** Shown to a signed-in user who isn't in a family yet: start one (allowlisted, or with a household invite link). */
export function FamilySetup({ user, onCreated, invite = { code: pendingInvite(), check: checkInvite } }: Props) {
  const lastName = user.displayName?.split(' ').slice(-1)[0]
  const [name, setName] = useState(lastName ? `The ${lastName} Family` : 'Our Family')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = invite.code
  const [state, setState] = useState<InviteState | 'checking' | null>(code ? 'checking' : null)

  useEffect(() => {
    if (code) invite.check(code).then(setState, () => setState('missing'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await createFamily(user, name.trim() || 'Our Family', state === 'valid' && code ? code : undefined)
      clearPendingInvite()
      onCreated(id)
    } catch (err) {
      // Only approved accounts or invite links can start a family (firestore.rules); say so plainly.
      const denied = (err as { code?: string })?.code === 'permission-denied'
      setError(
        denied
          ? 'This account can’t start a new household. Ask for a household invite link, or ask your family’s organizer to add this email in Settings → Family.'
          : err instanceof Error
            ? err.message
            : String(err),
      )
      setBusy(false)
    }
  }

  const invited = state === 'valid'
  return (
    <main className="center-screen">
      <form className="card card--narrow" onSubmit={submit}>
        <h1>Welcome, {user.displayName?.split(' ')[0] ?? 'there'}</h1>
        {invited ? (
          <p>
            You’re invited to start your own household. Everything in it (calendar, lists, chores, meals, photos) is private to the people you add.
            After this, invite your family by email in <strong>Settings → Family</strong>.
          </p>
        ) : (
          <p>
            <strong>{user.email}</strong> hasn't been added to a family yet. If someone meant to invite you, ask them to add this email in their
            Settings → Family. Otherwise, start a new household:
          </p>
        )}
        {state && state !== 'valid' && state !== 'checking' && (
          <p className="error" role="alert">
            {INVITE_PROBLEM[state]}
          </p>
        )}
        <label className="field">
          Household name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <div className="row">
          <button className="button button--primary" disabled={busy || state === 'checking'}>
            {invited ? 'Create my household' : 'Create family'}
          </button>
          <button type="button" className="button" onClick={() => signOut(auth)}>
            Use a different account
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  )
}
