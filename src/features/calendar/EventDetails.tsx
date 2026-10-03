import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { CalendarIcon, CloseIcon, ExternalLinkIcon, MapPinIcon } from '../../components/Icons'
import type { Member, SyncedCalendar } from '../../types'
import { mapsLink, whenText } from './eventText'
import type { OwnedEvent } from './views'

interface Props {
  event: OwnedEvent
  members: Map<string, Member>
  calendars?: Map<string, SyncedCalendar>
  onClose: () => void
  onDelete?: (event: OwnedEvent) => void
}

/**
 * Tap an event to see all of it: when, who, which calendar, where (with directions), and a
 * link back to Google Calendar. Hand-entered events can be deleted here.
 */
export function EventDetails({ event, members, calendars, onClose, onDelete }: Props) {
  const owners = event.ownerIds.map((id) => members.get(id)).filter((m) => m !== undefined)
  const calendarNames = [...new Set(event.calendarKeys.map((k) => calendars?.get(k)).filter((c) => c !== undefined).map((c) => c.alias || c.name))]
  const source = event.source === 'manual' ? 'Added in Family Organizer' : event.source === 'ics' ? 'From a calendar link' : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-label={event.title} onClick={onClose}>
      <div className="overlay__panel event-details" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-button overlay__close" onClick={onClose} aria-label="Close">
          <CloseIcon size={22} />
        </button>
        <h2 className="event-details__title">{event.title}</h2>
        <p className="event-details__when">{whenText(event)}</p>

        {owners.length > 0 && (
          <ul className="event-details__people" aria-label="Who">
            {owners.map((m) => (
              <li key={m.id}>
                <span className="initial" style={{ '--pill': m.color } as CSSProperties} aria-hidden>
                  {m.displayName.charAt(0).toUpperCase()}
                </span>
                {m.displayName}
              </li>
            ))}
          </ul>
        )}

        {event.location && (
          <div className="event-details__row">
            <MapPinIcon size={20} />
            <div>
              <p className="event-details__place">{event.location}</p>
              <a href={mapsLink(event.location)} target="_blank" rel="noreferrer noopener">
                Directions
              </a>
            </div>
          </div>
        )}

        {(calendarNames.length > 0 || source) && (
          <div className="event-details__row">
            <CalendarIcon size={20} />
            <p>{calendarNames.length ? calendarNames.join(', ') : source}</p>
          </div>
        )}

        <div className="row event-details__actions">
          {event.htmlLink && (
            <a className="button" href={event.htmlLink} target="_blank" rel="noreferrer noopener">
              Open in Google Calendar <ExternalLinkIcon size={16} />
            </a>
          )}
          {onDelete && event.source === 'manual' && (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                if (confirm(`Delete "${event.title}"?`)) {
                  onDelete(event)
                  onClose()
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
