import { signOut } from 'firebase/auth'
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { auth } from '../../firebase'
import { detectTimezone, timezoneOptions } from '../../lib/dates'
import { ColorPicker } from '../../components/ColorPicker'
import { inviteMember, removeInvite, updateFamily, updateMember, watchInvites } from '../../lib/family'
import type { Family, Invite, Member } from '../../types'

interface Props {
  family: Family
  members: Member[]
  userId: string
}

export function FamilyPage({ family, members, userId }: Props) {
  const isOwner = family.ownerId === userId
  const me = members.find((m) => m.id === userId)
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const deviceTz = detectTimezone()

  useEffect(() => watchInvites(family.id, setInvites), [family.id])

  const joinedEmails = new Set(members.map((m) => m.email))
  const pending = invites.filter((i) => !joinedEmails.has(i.email))
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  async function invite(e: FormEvent) {
    e.preventDefault()
    try {
      await inviteMember(family.id, userId, email)
      setEmail('')
    } catch (err) {
      report(err)
    }
  }

  return (
    <section className="family-page">
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      <div className="card">
        <h2>{family.name}</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              <span className="avatar" style={{ '--pill': m.color } as CSSProperties} aria-hidden>
                {m.displayName.charAt(0)}
              </span>
              <span>
                {m.displayName}
                {m.id === family.ownerId && <span className="muted"> · owner</span>}
                <br />
                <span className="muted">{m.email}</span>
              </span>
            </li>
          ))}
          {pending.map((i) => (
            <li key={i.email}>
              <span className="avatar avatar--pending" aria-hidden>?</span>
              <span>
                {i.email}
                <br />
                <span className="muted">Invited, hasn't signed in yet</span>
              </span>
              {isOwner && (
                <button className="link" onClick={() => removeInvite(i.email).catch(report)}>
                  Cancel invite
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <form className="row" onSubmit={invite}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Google account email"
              aria-label="Invite by email"
            />
            <button className="button button--primary">Invite</button>
          </form>
        )}
      </div>

      {me && (
        <div className="card">
          <h2>You</h2>
          <label className="field">
            Display name
            <input
              defaultValue={me.displayName}
              maxLength={60}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== me.displayName) updateMember(family.id, userId, { displayName: v }).catch(report)
              }}
            />
          </label>
          <div className="field">
            Your color
            <ColorPicker label="Your color" value={me.color} onChange={(c) => updateMember(family.id, userId, { color: c }).catch(report)} />
          </div>
        </div>
      )}

      <div className="card">
        <h2>Time zone</h2>
        <p className="muted">
          Used for the daily digest and reminders. This device is set to <strong>{deviceTz}</strong>.
        </p>
        <select
          value={family.timezone}
          disabled={!isOwner}
          onChange={(e) => updateFamily(family.id, { timezone: e.target.value }).catch(report)}
          aria-label="Family time zone"
        >
          {timezoneOptions(family.timezone).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        {isOwner && family.timezone !== deviceTz && (
          <button className="link" onClick={() => updateFamily(family.id, { timezone: deviceTz }).catch(report)}>
            Use this device's time zone
          </button>
        )}
      </div>

      <button className="button" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </section>
  )
}
