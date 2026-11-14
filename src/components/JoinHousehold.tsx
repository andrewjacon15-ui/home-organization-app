import { signOut, type User } from 'firebase/auth'
import { useState } from 'react'
import { auth } from '../firebase'
import { declineInvite, joinFamily, type PendingInvite } from '../lib/family'

interface Props {
  user: User
  invite: PendingInvite
  onJoined: (familyId: string) => void
  onDeclined: () => void
  /** Injectable for tests. */
  api?: { join: typeof joinFamily; decline: typeof declineInvite }
}

/**
 * Shown to someone who has been invited to a household but hasn't joined: they choose.
 * (Nobody is put in a household just because its owner typed their email.)
 */
export function JoinHousehold({ user, invite, onJoined, onDeclined, api = { join: joinFamily, decline: declineInvite } }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const household = invite.familyName ? <strong>{invite.familyName}</strong> : 'a household'

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <main className="center-screen">
      <div className="card card--narrow">
        <h1>Join this household?</h1>
        <p>
          {invite.inviterName ? <strong>{invite.inviterName}</strong> : 'Someone'} invited <strong>{user.email}</strong> to join {household}.
        </p>
        <p>
          Joining shares its calendar, lists, chores, meals and photos with you, and anything you add there is seen by everyone in it. Only join a household you know.
        </p>
        <div className="row">
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void run(async () => onJoined(await api.join(user, invite.familyId)))}>
            Join
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api.decline(user)
                onDeclined()
              })
            }
          >
            No thanks
          </button>
          <button type="button" className="button" disabled={busy} onClick={() => signOut(auth)}>
            Use a different account
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
