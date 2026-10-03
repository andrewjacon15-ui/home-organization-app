import { useEffect, useState, type FormEvent } from 'react'
import { useNow } from '../../lib/hooks'
import { formatBytes } from '../photos/photosApi'
import { SettingsSection } from '../settings/SettingRows'
import { INVITE_DEVICE_LABELS, INVITE_DEVICES, inviteMessage, type InviteDevice } from './inviteMessage'
import { amIAdmin, createInvite, fetchHouseholds, inviteLink, revokeInvite, watchInvites, type HouseholdInvite, type HouseholdSummary } from './householdInvites'

/** Free Cloud Storage shared by every household (photos and cookbooks). */
const FREE_STORAGE = 5 * 1024 ** 3

interface Api {
  isAdmin: typeof amIAdmin
  watch: typeof watchInvites
  create: typeof createInvite
  revoke: typeof revokeInvite
  households: typeof fetchHouseholds
}

const realApi: Api = { isAdmin: amIAdmin, watch: watchInvites, create: createInvite, revoke: revokeInvite, households: fetchHouseholds }
const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

/**
 * Settings → Households: the app administrator's invite links and household list.
 * Renders nothing for anyone else (the rules only let admins list invites).
 */
export function HouseholdsAdmin({ userId, api = realApi }: { userId: string; api?: Api }) {
  const [admin, setAdmin] = useState(false)
  const [invites, setInvites] = useState<HouseholdInvite[]>([])
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null)
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [device, setDevice] = useState<InviteDevice>('iphone')
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow()

  useEffect(() => {
    let live = true
    void api.isAdmin().then((yes) => live && setAdmin(yes))
    return () => {
      live = false
    }
  }, [api])
  useEffect(() => (admin ? api.watch(setInvites) : undefined), [admin, api])

  if (!admin) return null

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  async function make(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const code = await api.create(userId, note)
      setFresh(code)
      setCopied(null)
      setNote('')
    } catch (err) {
      report(err)
    } finally {
      setBusy(false)
    }
  }

  // On a phone, the share sheet sends it straight to Messages or WhatsApp; elsewhere it's copied.
  async function send(what: 'link' | 'message', code: string) {
    const link = inviteLink(code)
    const text = what === 'link' ? link : inviteMessage(link, device)
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share(what === 'link' ? { title: 'Your household invite', url: link } : { title: 'Your household invite', text })
      else await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      // Cancelled share sheet, or no clipboard access: the text is on screen to copy by hand.
    }
  }

  const show = (code: string) => {
    setFresh(code)
    setCopied(null)
  }

  const open = invites.filter((i) => !i.usedBy && i.expiresAt > now)
  const done = invites.filter((i) => i.usedBy)
  const stored = households?.reduce((n, h) => n + h.photoBytes + h.cookbookBytes, 0) ?? 0

  return (
    <SettingsSection title="Households (admin)" id="admin">
      <p className="settings-note">
        Only you see this. An invite link lets one person start their own household on this app. Their household is private: you see its name and
        size here, never its contents. Links work once and expire after 14 days.
      </p>

      <form className="row" onSubmit={make}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who it’s for (optional)" aria-label="Who it’s for" maxLength={80} />
        <button className="button button--primary" disabled={busy}>
          Create invite link
        </button>
      </form>
      {fresh && (
        <div className="invite-link" role="status">
          <code>{inviteLink(fresh)}</code>
          <div className="invite-link__device">
            <span id="invite-device">Setup steps for their</span>
            <div className="segmented" role="group" aria-labelledby="invite-device">
              {INVITE_DEVICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`segmented__item${d === device ? ' segmented__item--active' : ''}`}
                  aria-pressed={d === device}
                  onClick={() => {
                    setDevice(d)
                    setCopied(null)
                  }}
                >
                  {INVITE_DEVICE_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <p className="invite-message" aria-label="Invite message">
            {inviteMessage(inviteLink(fresh), device)}
          </p>
          <div className="row">
            <button type="button" className="button button--primary" onClick={() => void send('message', fresh)}>
              {copied === 'message' ? 'Copied' : 'Copy message'}
            </button>
            <button type="button" className="button" onClick={() => void send('link', fresh)}>
              {copied === 'link' ? 'Copied' : 'Copy link only'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {open.length > 0 && (
        <>
          <h3>Waiting to be used</h3>
          <ul className="admin-list" aria-label="Open invite links">
            {open.map((i) => (
              <li key={i.code}>
                <span>
                  {i.note || 'Invite link'}
                  <span className="muted"> · expires {day(i.expiresAt)}</span>
                </span>
                <span className="row">
                  <button type="button" className="link" onClick={() => show(i.code)} aria-pressed={fresh === i.code}>
                    Message
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      if (confirm('Cancel this invite link? It will stop working.')) api.revoke(i.code).catch(report)
                    }}
                  >
                    Cancel
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Households</h3>
      {households === null ? (
        <button type="button" className="button admin-show" onClick={() => api.households().then(setHouseholds, report)}>
          Show households and usage
        </button>
      ) : (
        <>
          <p className="settings-note">
            {households.length} household{households.length === 1 ? '' : 's'} · photos and cookbooks use {formatBytes(stored)} of the 5 GB free (
            {Math.round((stored / FREE_STORAGE) * 100)}%).
          </p>
          <ul className="admin-list" aria-label="Households">
            {households.map((h) => (
              <li key={h.id}>
                <span>
                  <strong>{h.name || 'Unnamed'}</strong>
                  <span className="muted">
                    {' '}
                    · {h.ownerEmail ?? 'owner unknown'} · since {day(h.createdAt ? new Date(h.createdAt) : null)}
                  </span>
                </span>
                <span className="muted admin-list__stats">
                  {h.members} {h.members === 1 ? 'person' : 'people'} · {h.events} events · {h.recipes} recipes · {h.photos} photos ·{' '}
                  {formatBytes(h.photoBytes + h.cookbookBytes)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {done.length > 0 && (
        <p className="settings-note">
          Used links: {done.map((i) => `${i.note || i.usedEmail} (${day(i.usedAt)})`).join(', ')}.
        </p>
      )}
    </SettingsSection>
  )
}
