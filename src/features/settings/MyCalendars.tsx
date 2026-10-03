import { useState, type CSSProperties } from 'react'
import { ColorPicker } from '../../components/ColorPicker'
import type { Member, SyncedCalendar } from '../../types'

interface Props {
  userId: string
  members: Member[]
  calendars: SyncedCalendar[]
  onChange: (key: string, changes: Partial<Pick<SyncedCalendar, 'enabled' | 'color' | 'alias' | 'memberIds'>>) => void
}

/** Your Google calendars: which ones show on the family board, their color, nickname, and whose they are. */
export function MyCalendars({ userId, members, calendars, onChange }: Props) {
  const mine = calendars.filter((c) => c.ownerId === userId && c.kind !== 'ics')
  const [editing, setEditing] = useState<string | null>(null)

  if (mine.length === 0) return null

  return (
    <div className="my-calendars">
      <h3>Your calendars</h3>
      <p className="setting-row__hint">Turn on the calendars you want on the family board. New calendars start on if they're checked in Google Calendar.</p>
      <ul className="calendar-list">
        {mine.map((c) => {
          const open = editing === c.key
          const label = c.alias || c.name
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
                  {c.alias && <span className="muted"> ({c.name})</span>}
                  {c.primary && <span className="muted"> · main</span>}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  aria-label={`Show ${label}`}
                  checked={c.enabled}
                  onChange={(e) => onChange(c.key, { enabled: e.target.checked })}
                />
              </div>
              {open && (
                <div className="calendar-item__details">
                  <label className="field">
                    Nickname
                    <input
                      defaultValue={c.alias ?? ''}
                      placeholder={c.name}
                      maxLength={60}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (c.alias ?? '')) onChange(c.key, { alias: v })
                      }}
                    />
                  </label>
                  <div className="field">
                    Color
                    <ColorPicker label={`${label} color`} value={c.color} onChange={(color) => onChange(c.key, { color })} />
                    {c.color !== c.googleColor && (
                      <button type="button" className="link" onClick={() => onChange(c.key, { color: c.googleColor })}>
                        Use Google's color
                      </button>
                    )}
                  </div>
                  {members.length > 1 && (
                    <div className="field">
                      Whose calendar is this?
                      <div className="row" role="group" aria-label={`People for ${label}`}>
                        {members.map((m) => {
                          const on = c.memberIds.includes(m.id)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              className={`chip${on ? ' chip--active' : ''}`}
                              style={{ '--pill': m.color } as CSSProperties}
                              aria-pressed={on}
                              onClick={() => {
                                const next = on ? c.memberIds.filter((id) => id !== m.id) : [...c.memberIds, m.id]
                                if (next.length) onChange(c.key, { memberIds: next })
                              }}
                            >
                              <span className="chip__dot" aria-hidden />
                              {m.displayName.split(' ')[0]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
