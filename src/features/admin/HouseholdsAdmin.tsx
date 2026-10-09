import { useEffect, useState, type FormEvent } from 'react'
import { Select } from '../../components/Select'
import { CloseIcon, SearchIcon } from '../../components/Icons'
import { useNow } from '../../lib/hooks'
import { formatBytes } from '../photos/photosApi'
import { SettingsSection } from '../settings/SettingRows'
import { INVITE_DEVICE_LABELS, INVITE_DEVICES, inviteMessage, type InviteDevice } from './inviteMessage'
import { SORTS, sortHouseholds, type Sort } from './householdSort'
import { adminApi, inviteLink, type AdminApi, type AppUsage, type HouseholdInvite, type HouseholdSummary } from './householdInvites'

/** Free Cloud Storage shared by every household (photos and cookbooks). */
const FREE_STORAGE = 5 * 1024 ** 3

const day = (d: Date | null | undefined) => (d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const bytesOf = (h: HouseholdSummary) => h.photoBytes + h.cookbookBytes + h.otherBytes
/** A size, or "none" (the formatter rounds anything up to at least 1 KB). */
const size = (n: number) => (n > 0 ? formatBytes(n) : 'none')
const pct = (n: number) => `${Math.min(100, Math.max(0, (n / FREE_STORAGE) * 100))}%`

/**
 * Settings → Admin: the app administrator's own tab. Usage across every household, each
 * household's people and size (never its contents), rename and delete, and invite links.
 * Only shown to the admin (the rules and functions refuse anyone else).
 */
export function AdminPage({ userId, familyId, api = adminApi }: { userId: string; familyId: string; api?: AdminApi }) {
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null)
  const [app, setApp] = useState<AppUsage | null>(null)
  const [sort, setSort] = useState<Sort>('oldest')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const load = () => {
    setLoading(true)
    setError(null)
    api
      .households()
      .then((r) => {
        setHouseholds(r.households)
        setApp(r.app)
      }, report)
      .finally(() => setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [api])

  return (
    <>
      <UsageSection households={households} app={app} loading={loading} onRefresh={load} error={error} />
      <SettingsSection title="Households" id="admin-households">
        <p className="settings-note">Each household is private: you see its name, people and size, never its photos, lists or events.</p>
        {households !== null && households.length > 1 && (
          <div className="admin-tools">
            <label className="admin-tools__search">
              <SearchIcon size={18} aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a household or person" aria-label="Find a household or person" maxLength={80} />
            </label>
            <Select value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS} aria-label="Sort households" />
          </div>
        )}
        {households === null ? (
          <p className="muted">{loading ? 'Loading households…' : 'Couldn’t load the households.'}</p>
        ) : (
          <ul className="household-cards" aria-label="Households">
            {sortHouseholds(households, sort, query).length === 0 && <li className="muted">No household matches “{query.trim()}”.</li>}
            {sortHouseholds(households, sort, query).map((h) => (
              <HouseholdCard
                key={h.id}
                h={h}
                mine={h.id === familyId}
                onRename={async (name) => {
                  await api.rename(h.id, name)
                  setHouseholds((list) => list?.map((x) => (x.id === h.id ? { ...x, name } : x)) ?? null)
                }}
                onDelete={async (confirm) => {
                  await api.remove(h.id, confirm)
                  setHouseholds((list) => list?.filter((x) => x.id !== h.id) ?? null)
                }}
                onRemovePerson={async (uid) => {
                  await api.removeMember(h.id, uid)
                  setHouseholds((list) => list?.map((x) => (x.id === h.id ? { ...x, members: x.members - 1, people: x.people.filter((p) => p.id !== uid) } : x)) ?? null)
                }}
                userId={userId}
              />
            ))}
          </ul>
        )}
      </SettingsSection>
      <InvitesSection userId={userId} api={api} />
      <AccessSection creators={app?.creators ?? null} api={api} onChange={(creators) => setApp((a) => (a ? { ...a, creators } : a))} />
    </>
  )
}

/** Who may start a household without an invite link (everyone else needs one). */
function AccessSection({ creators, api, onChange }: { creators: string[] | null; api: AdminApi; onChange: (list: string[]) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (address: string, allow: boolean) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await api.setCreator(address, allow))
      if (allow) setEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingsSection title="Starting households" id="admin-access">
      <p className="settings-note">People on this list can start their own household with their Google account, without an invite link. Anyone else needs a link.</p>
      {creators === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="admin-list" aria-label="Can start a household">
          {creators.length === 0 && <li className="muted">Nobody yet. Invite links still work.</li>}
          {creators.map((c) => (
            <li key={c}>
              <span>{c}</span>
              <button type="button" className="icon-button" aria-label={`Remove ${c}`} disabled={busy} onClick={() => void run(c, false)}>
                <CloseIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row admin-tools"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) void run(email.trim(), true)
        }}
      >
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Email to allow" maxLength={200} />
        <button className="button" disabled={busy || !email.trim()}>
          Allow
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </SettingsSection>
  )
}

function UsageSection({ households, app, loading, onRefresh, error }: { households: HouseholdSummary[] | null; app: AppUsage | null; loading: boolean; onRefresh: () => void; error: string | null }) {
  const list = households ?? []
  const photos = list.reduce((n, h) => n + h.photoBytes, 0)
  const books = list.reduce((n, h) => n + h.cookbookBytes, 0)
  const other = list.reduce((n, h) => n + h.otherBytes, 0)
  const stored = photos + books + other
  return (
    <SettingsSection title="Usage" id="admin-usage">
      {households && (
        <>
          <dl className="usage-stats">
            <div>
              <dt>Households</dt>
              <dd>{list.length}</dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{list.reduce((n, h) => n + h.members, 0)}</dd>
            </div>
            <div>
              <dt>Photos</dt>
              <dd>{list.reduce((n, h) => n + h.photos, 0)}</dd>
            </div>
            <div>
              <dt>Recipes</dt>
              <dd>{list.reduce((n, h) => n + h.recipes, 0)}</dd>
            </div>
          </dl>
          <div className="usage-meter" aria-label={`Storage: ${formatBytes(stored)} of 5 GB free`}>
            <div className="usage-meter__track" aria-hidden>
              <span className="usage-meter__photos" style={{ width: pct(photos) }} />
              <span className="usage-meter__books" style={{ width: pct(books + other) }} />
            </div>
            <p className="usage-meter__text">
              <strong>{stored > 0 ? formatBytes(stored) : 'Nothing'}</strong> of the 5 GB free storage ({Math.round((stored / FREE_STORAGE) * 100)}%)
            </p>
            <p className="usage-meter__key">
              <span className="usage-key usage-key--photos">Photos and videos {size(photos)}</span>
              <span className="usage-key usage-key--books">Cookbooks {size(books + other)}</span>
            </p>
          </div>
          {app && app.searchCap > 0 && (
            <div className="usage-meter" aria-label={`Online recipe searches: ${app.searches} of ${app.searchCap} this month`}>
              <div className="usage-meter__track" aria-hidden>
                <span className="usage-meter__photos" style={{ width: `${Math.min(100, (app.searches / app.searchCap) * 100)}%` }} />
              </div>
              <p className="usage-meter__text">
                <strong>{app.searches}</strong> of {app.searchCap} online recipe searches this month
              </p>
            </div>
          )}
          <p className="settings-note">{app && app.searchCap > 0 && `Searches stop at ${app.searchCap} a month, inside the free credit. `}Storage is measured from the files themselves. Firestore reads and writes for the day are in the Firebase console (Usage tab).</p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button admin-show" onClick={onRefresh} disabled={loading}>
        {loading ? 'Measuring…' : 'Refresh'}
      </button>
    </SettingsSection>
  )
}

function HouseholdCard({
  h,
  mine,
  userId,
  onRename,
  onDelete,
  onRemovePerson,
}: {
  h: HouseholdSummary
  mine: boolean
  userId: string
  onRename: (name: string) => Promise<void>
  onDelete: (confirm: string) => Promise<void>
  onRemovePerson: (uid: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view')
  const [removing, setRemoving] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const size = bytesOf(h)

  const act = async (e: FormEvent | React.MouseEvent, run: () => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await run()
      setMode('view')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="household-card" aria-label={h.name || 'Unnamed household'}>
      <div className="household-card__head">
        <strong className="household-card__name">{h.name || 'Unnamed'}</strong>
        {mine && <span className="badge">Yours</span>}
      </div>
      <p className="household-card__meta muted">
        {h.ownerEmail ?? 'owner unknown'} · since {day(h.createdAt ? new Date(h.createdAt) : null)}
      </p>
      <p className="household-card__stats">
        {plural(h.members, 'person', 'people')} · {plural(h.events, 'event')} · {plural(h.recipes, 'recipe')} · {plural(h.photos, 'photo')} · {formatBytes(size)}
      </p>
      <div className="usage-meter__track household-card__bar" aria-hidden>
        <span className="usage-meter__photos" style={{ width: pct(h.photoBytes) }} />
        <span className="usage-meter__books" style={{ width: pct(h.cookbookBytes + h.otherBytes) }} />
      </div>
      {h.people.length > 0 && (
        <details className="household-card__people">
          <summary>People</summary>
          <ul>
            {h.people.map((p) => (
              <li key={p.id} className="household-person">
                <span className="household-person__who">
                  {p.name || 'No name'}
                  {p.email && <span className="muted"> · {p.email}</span>}
                  {p.owner && <span className="muted"> · owner</span>}
                </span>
                {!p.owner && p.id !== userId && removing !== p.id && (
                  <button type="button" className="link" onClick={() => setRemoving(p.id)}>
                    Remove
                  </button>
                )}
                {removing === p.id && (
                  <span className="row household-person__confirm">
                    <span>Remove {p.name.split(' ')[0] || 'them'} from {h.name || 'this household'}?</span>
                    <button
                      type="button"
                      className="button button--danger"
                      disabled={busy}
                      onClick={(e) =>
                        void act(e, async () => {
                          await onRemovePerson(p.id)
                          setRemoving(null)
                        })
                      }
                    >
                      Remove
                    </button>
                    <button type="button" className="button" onClick={() => setRemoving(null)}>
                      Cancel
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {mode === 'view' && (
        <div className="row household-card__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              setText(h.name)
              setError(null)
              setMode('rename')
            }}
          >
            Rename
          </button>
          {!mine && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                setText('')
                setError(null)
                setMode('delete')
              }}
            >
              Delete…
            </button>
          )}
        </div>
      )}
      {mode === 'rename' && (
        <form className="row household-card__form" onSubmit={(e) => void act(e, () => onRename(text.trim()))}>
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="New name" maxLength={80} autoFocus />
          <button className="button button--primary" disabled={busy || !text.trim()}>
            Save
          </button>
          <button type="button" className="button" onClick={() => setMode('view')}>
            Cancel
          </button>
        </form>
      )}
      {mode === 'delete' && (
        <form className="household-card__delete" onSubmit={(e) => void act(e, () => onDelete(text))}>
          <p>
            This deletes <strong>{h.name || 'this household'}</strong> for everyone in it: its calendar, lists, recipes, {plural(h.photos, 'photo')} and cookbooks. It can’t be
            undone. Type the household’s name to confirm.
          </p>
          <div className="row">
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Household name to confirm" placeholder={h.name} autoFocus />
            <button className="button button--danger" disabled={busy || text.trim().toLowerCase() !== h.name.trim().toLowerCase()}>
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
            <button type="button" className="button" onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/** Invite links: each lets one person start their own household. */
function InvitesSection({ userId, api }: { userId: string; api: AdminApi }) {
  const [invites, setInvites] = useState<HouseholdInvite[]>([])
  const [note, setNote] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [device, setDevice] = useState<InviteDevice>('iphone')
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow()

  useEffect(() => api.watch(setInvites), [api])

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

  return (
    <SettingsSection title="Invite links" id="admin-invites">
      <p className="settings-note">An invite link lets one person start their own household on this app. Links work once and expire after 14 days.</p>

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
      {done.length > 0 && <p className="settings-note">Used links: {done.map((i) => `${i.note || i.usedEmail} (${day(i.usedAt)})`).join(', ')}.</p>}
    </SettingsSection>
  )
}
