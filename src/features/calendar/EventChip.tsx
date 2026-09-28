import type { CSSProperties } from 'react'
import type { Member } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { countdownLabel, isPast, type OwnedEvent } from './views'

interface Props {
  event: OwnedEvent
  members: Map<string, Member>
  now: Date
  today: string
  compact?: boolean
  onDelete?: (event: OwnedEvent) => void
}

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Stripes of each owner's color for shared events; a single color otherwise. */
function ownerBackground(colors: string[], multi: boolean): string {
  if (!multi || colors.length < 2) return colors[0]
  const step = 100 / colors.length
  return `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}

export function EventChip({ event, members, now, today, compact, onDelete }: Props) {
  const { settings } = useSettings()
  const owners = event.ownerIds.map((id) => members.get(id)).filter((m) => m !== undefined)
  const colors = owners.length ? owners.map((m) => m.color) : ['var(--muted)']
  const past = settings.dimPastEvents && isPast(event, now, today)
  const countdown = settings.showCountdowns === 'always' ? countdownLabel(event, now) : null
  const style = {
    '--pill': colors[0],
    '--owner-bar': ownerBackground(colors, settings.colorCodeMultiProfile),
  } as CSSProperties

  const when = event.allDay ? 'All day' : `${time(event.start)}${compact ? '' : ` – ${time(event.end)}`}`

  return (
    <div className={`event${event.allDay ? ' event--allday' : ''}${past ? ' event--past' : ''}${compact ? ' event--compact' : ''}`} style={style}>
      <div className="event__body">
        <span className="event__title">{event.title}</span>
        <span className="event__time">
          {when}
          {countdown && <span className="event__countdown"> · {countdown}</span>}
        </span>
        {!compact && event.location && <span className="event__location">{event.location}</span>}
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
          ✕
        </button>
      )}
    </div>
  )
}
