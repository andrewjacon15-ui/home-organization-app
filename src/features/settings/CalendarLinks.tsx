import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import { PERSON_COLORS } from '../../lib/colors'
import type { Member, SyncedCalendar } from '../../types'
import { addCalendarFeed, refreshCalendarFeed, removeCalendarFeed, updateCalendar, watchCalendars } from '../calendar/calendarApi'
import { SettingsSection } from './SettingRows'

interface Api {
  add: typeof addCalendarFeed
  refresh: typeof refreshCalendarFeed
  remove: typeof removeCalendarFeed
  update: typeof updateCalendar
  watch: typeof watchCalendars
}

const realApi: Api = { add: addCalendarFeed, refresh: refreshCalendarFeed, remove: removeCalendarFeed, update: updateCalendar, watch: watchCalendars }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const when = (d: Date) => d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Read-only calendars from a link: Apple Calendar's public link, school and team calendars, holidays. */
export function CalendarLinks({ familyId, userId, members, api = realApi }: { familyId: string; userId: string; members: Member[]; api?: Api }) {
  const [all, setAll] = useState<SyncedCalendar[]>([])
  const links = all.filter((c) => c.kind === 'ics')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [who, setWho] = useState<string[]>([userId])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => api.watch(familyId, setAll), [api, familyId])

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy('add')
    setError(null)
    setNote(null)
    try {
      const color = PERSON_COLORS[(7 + links.length) % PERSON_COLORS.length].hex
      const r = await api.add(familyId, url, name, who.length ? who : [userId], color)
      setNote(`Added ${r.name}: ${r.eventCount} event${r.eventCount === 1 ? '' : 's'} in the next four months.`)
      setUrl('')
      setName('')
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
    }
  }

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(null)
    }
  }

  const change = (c: SyncedCalendar, changes: Parameters<typeof updateCalendar>[2]) =>
    run(c.key, async () => {
      await api.update(familyId, c.key, changes)
      // Hiding a link removes its events; showing it brings them back.
      if ('enabled' in changes) await api.refresh(familyId, c.key)
    })

  return (
    <SettingsSection title="Calendar links" id="links">
      <p className="settings-note">
        Add a calendar anyone can subscribe to: your Apple (iCloud) calendar, a school or sports team calendar, or holidays. These are read-only and
        refresh about once an hour.
      </p>
      <details className="link-help">
        <summary>How to get a link</summary>
        <dl>
          <dt>Apple Calendar on iPhone or iPad</dt>
          <dd>Open Calendar → Calendars → the ⓘ next to the calendar → turn on Public Calendar → Share Link → Copy.</dd>
          <dt>Apple Calendar on a Mac</dt>
          <dd>Right-click the calendar → Share Calendar → tick Public Calendar → copy the link.</dd>
          <dt>School, sports, and team sites</dt>
          <dd>Look for Subscribe, iCal, ICS, or Add to calendar, and copy that link (it often starts with webcal://).</dd>
          <dt>Outlook</dt>
          <dd>Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.</dd>
        </dl>
        <p className="muted">Anyone with a public link can see that calendar, so only publish calendars you’re comfortable sharing.</p>
      </details>

      <form className="link-form" onSubmit={add}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="webcal://… or https://….ics" aria-label="Calendar link" inputMode="url" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" maxLength={60} />
        {members.length > 1 && <People members={members} value={who} label="For" onChange={setWho} />}
        <button className="button button--primary" disabled={!url.trim() || busy === 'add'}>
          {busy === 'add' ? 'Checking the link…' : 'Add calendar'}
        </button>
      </form>
      {note && (
        <p className="settings-note" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {links.length > 0 && (
        <ul className="calendar-list" aria-label="Calendar links">
          {links.map((c) => {
            const label = c.alias || c.name
            const open = editing === c.key
            return (
              <li key={c.key} className="calendar-item">
                <div className="calendar-item__row">
                  <button
                    type="button"
                    className="calendar-item__swatch"
                    style={{ '--pill': c.color } as CSSProperties}
                    aria-label={`Change color and details for ${label}`}
                    aria-expanded={open}
                    onClick={() => setEditing(open ? null : c.key)}
                  />
                  <span className="calendar-item__name">
                    {label}
                    <span className={`calendar-item__status${c.error ? ' calendar-item__status--error' : ''}`}>
                      {busy === c.key
                        ? 'Updating…'
                        : c.error
                          ? `Couldn’t update${c.lastSyncAt ? ` (${when(c.lastSyncAt)})` : ''}: ${c.error}`
                          : c.lastSyncAt
                            ? `${c.eventCount ?? 0} events · updated ${when(c.lastSyncAt)}`
                            : 'Waiting for the first update'}
                    </span>
                  </span>
                  <input type="checkbox" role="switch" className="switch" aria-label={`Show ${label}`} checked={c.enabled} onChange={(e) => void change(c, { enabled: e.target.checked })} />
                </div>
                {open && (
                  <div className="calendar-item__details">
                    <label className="field">
                      Name
                      <input
                        defaultValue={c.alias ?? ''}
                        placeholder={c.name}
                        maxLength={60}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (v !== (c.alias ?? '')) void change(c, { alias: v })
                        }}
                      />
                    </label>
                    <div className="field">
                      Color
                      <ColorPicker label={`${label} color`} value={c.color} onChange={(color) => void change(c, { color })} />
                    </div>
                    {members.length > 1 && (
                      <People members={members} value={c.memberIds} label={`People for ${label}`} onChange={(memberIds) => memberIds.length && void change(c, { memberIds })} />
                    )}
                    <p className="muted calendar-item__url">{c.url}</p>
                    <div className="row">
                      <button type="button" className="button" disabled={busy === c.key} onClick={() => void run(c.key, () => api.refresh(familyId, c.key))}>
                        Update now
                      </button>
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={busy === c.key}
                        onClick={() => {
                          if (confirm(`Remove ${label} and its events from the family calendar?`)) void run(c.key, () => api.remove(familyId, c.key))
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SettingsSection>
  )
}

function People({ members, value, label, onChange }: { members: Member[]; value: string[]; label: string; onChange: (ids: string[]) => void }) {
  return (
    <div className="row" role="group" aria-label={label}>
      {members.map((m) => {
        const on = value.includes(m.id)
        return (
          <button
            key={m.id}
            type="button"
            className={`chip${on ? ' chip--active' : ''}`}
            style={{ '--pill': m.color } as CSSProperties}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== m.id) : [...value, m.id])}
          >
            <span className="chip__dot" aria-hidden />
            {m.displayName.split(' ')[0]}
          </button>
        )
      })}
    </div>
  )
}
