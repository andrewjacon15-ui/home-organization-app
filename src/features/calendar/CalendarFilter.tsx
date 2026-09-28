import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Member, SyncedCalendar } from '../../types'
import type { HiddenSets } from './filter'

interface Props {
  members: Member[]
  calendars: SyncedCalendar[]
  hidden: HiddenSets
  onChange: (hidden: HiddenSets) => void
}

/** "Filter" button with a menu of people and calendars to show or hide on this screen. */
export function CalendarFilter({ members, calendars, hidden, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const count = hidden.people.length + hidden.calendars.length
  const shown = calendars.filter((c) => c.enabled)
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName.split(' ')[0] ?? ''

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const toggle = (list: 'people' | 'calendars', id: string) => {
    const cur = hidden[list]
    onChange({ ...hidden, [list]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
  }

  return (
    <div className="filter" ref={box}>
      <button type="button" className={`button filter__button${count ? ' filter__button--on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        Filter{count ? ` · ${count} hidden` : ''}
      </button>
      {open && (
        <div className="filter__menu" role="dialog" aria-label="Filter calendar">
          <fieldset>
            <legend>People</legend>
            {members.map((m) => (
              <label key={m.id} className="filter__row">
                <input type="checkbox" checked={!hidden.people.includes(m.id)} onChange={() => toggle('people', m.id)} />
                <span className="filter__swatch filter__swatch--round" style={{ '--pill': m.color } as CSSProperties} aria-hidden />
                {m.displayName}
              </label>
            ))}
          </fieldset>
          {shown.length > 0 && (
            <fieldset>
              <legend>Calendars</legend>
              {shown.map((c) => (
                <label key={c.key} className="filter__row">
                  <input type="checkbox" checked={!hidden.calendars.includes(c.key)} onChange={() => toggle('calendars', c.key)} />
                  <span className="filter__swatch" style={{ '--pill': c.color } as CSSProperties} aria-hidden />
                  {c.alias || c.name}
                  <span className="muted"> · {nameOf(c.ownerId)}</span>
                </label>
              ))}
            </fieldset>
          )}
          {count > 0 && (
            <button type="button" className="link" onClick={() => onChange({ people: [], calendars: [] })}>
              Show everything
            </button>
          )}
        </div>
      )}
    </div>
  )
}
