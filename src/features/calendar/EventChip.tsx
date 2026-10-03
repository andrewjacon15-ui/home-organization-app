import { CloseIcon } from '../../components/Icons'
import type { CSSProperties } from 'react'
import type { Member, SyncedCalendar } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { countdownLabel, isPast, shortRange, type OwnedEvent } from './views'

interface Props {
  event: OwnedEvent
  members: Map<string, Member>
  calendars?: Map<string, SyncedCalendar>
  now: Date
  today: string
  /** true = month cell (one line); 'column' = narrow week column (short times, no location) */
  compact?: boolean | 'column'
  onDelete?: (event: OwnedEvent) => void
}

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Stripes of each owner's color for shared events; a single color otherwise. */
function ownerBackground(colors: string[], multi: boolean): string {
  if (!multi || colors.length < 2) return colors[0]
  const step = 100 / colors.length
  return `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}

export function EventChip({ event, members, calendars, now, today, compact, onDelete }: Props) {
  const { settings } = useSettings()
  const owners = event.ownerIds.map((id) => members.get(id)).filter((m) => m !== undefined)
  const personColors = owners.length ? owners.map((m) => m.color) : ['var(--ink-2)']
  // "By calendar" uses each source calendar's color (e.g. a purple Work calendar); hand-entered events keep the person's color.
  const calendarColors = [...new Set(event.calendarKeys.map((k) => calendars?.get(k)?.color).filter((c): c is string => !!c))]
  const colors = settings.colorEventsBy === 'calendar' && calendarColors.length ? calendarColors : personColors
  const calendarNames = event.calendarKeys.map((k) => calendars?.get(k)).filter((c) => c !== undefined).map((c) => c.alias || c.name)
  const past = settings.dimPastEvents && isPast(event, now, today)
  const countdown = settings.showCountdowns === 'always' ? countdownLabel(event, now) : null
  const style = {
    '--pill': colors[0],
    '--owner-bar': ownerBackground(colors, settings.colorCodeMultiProfile),
  } as CSSProperties

  const when = event.allDay ? 'All day' : compact === true ? time(event.start) : compact === 'column' ? shortRange(event.start, event.end) : `${time(event.start)} – ${time(event.end)}`

  return (
    <div className={`event${event.allDay ? ' event--allday' : ''}${past ? ' event--past' : ''}${compact === true ? ' event--compact' : ''}${compact === 'column' ? ' event--column' : ''}`} style={style}>
      <div className="event__body">
        <span className="event__title">{event.title}</span>
        <span className="event__time">
          {when}
          {countdown && <span className="event__countdown"> · {countdown}</span>}
        </span>
        {!compact && event.location && <span className="event__location">{event.location}</span>}
        {calendarNames.length > 0 && <span className="visually-hidden"> (calendar: {calendarNames.join(', ')})</span>}
      </div>
      <div className="event__owners" role="group" aria-label={`For ${owners.map((m) => m.displayName).join(', ') || 'someone'}`}>
        {owners.map((m) => (
          <span key={m.id} className="initial" style={{ '--pill': m.color } as CSSProperties} aria-hidden>
            {m.displayName.charAt(0).toUpperCase()}
          </span>
        ))}
      </div>
      {onDelete && event.source === 'manual' && (
        <button type="button" className="icon-button event__delete" onClick={() => onDelete(event)} aria-label={`Delete "${event.title}"`}>
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  )
}
