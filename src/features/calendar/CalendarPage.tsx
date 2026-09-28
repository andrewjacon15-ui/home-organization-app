import { useEffect, useMemo, useState } from 'react'
import { addDays, fromDateKey } from '../../lib/dates'
import { useNow, useToday } from '../../lib/hooks'
import type { CalendarEvent, Member, SyncedCalendar } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { AddEventForm } from './AddEventForm'
import { addManualEvent, deleteManualEvent, watchCalendars, watchEvents } from './calendarApi'
import { CalendarFilter } from './CalendarFilter'
import { applyFilter, loadHidden, saveHidden, type HiddenSets } from './filter'
import { CalendarBoard } from './CalendarBoard'
import { CalendarConnect } from './CalendarConnect'
import { useCalendarConnection } from './useCalendarConnection'
import { viewRange, type CalendarViewKind } from './views'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

const VIEWS: { id: CalendarViewKind; label: string }[] = [
  { id: 'threeDay', label: '3 Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'schedule', label: 'Schedule' },
]

const VIEW_KEY = 'calendar-view'

/** Each device remembers its own view (the wall tablet might like 3 Day while phones use Week). */
function initialView(): CalendarViewKind {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.some((x) => x.id === v) ? (v as CalendarViewKind) : 'week'
  } catch {
    return 'week'
  }
}

function rememberView(v: CalendarViewKind) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    // convenience only
  }
}

export function CalendarPage({ familyId, userId, members }: Props) {
  const { settings } = useSettings()
  const today = useToday()
  const now = useNow()
  const [kind, setKind] = useState<CalendarViewKind>(initialView)
  // Pages away from the one containing today, so a wall display rolls forward on its own.
  const [offset, setOffset] = useState(0)
  const range = viewRange(kind, today, offset, settings)
  const first = range.days[0]
  const last = range.days[range.days.length - 1]
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<SyncedCalendar[]>([])
  const [hidden, setHidden] = useState<HiddenSets>(loadHidden)
  const calendarByKey = useMemo(() => new Map(calendars.map((c) => [c.key, c])), [calendars])
  const visible = useMemo(() => applyFilter(events, hidden, calendarByKey), [events, hidden, calendarByKey])
  const me = members.find((m) => m.id === userId)
  const conn = useCalendarConnection(familyId, me)
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  // Once connected, the card lives in Settings; here it only shows when there's something to do.
  // (Wait for the member record so it doesn't flash while loading.)
  const showConnect = !!me && (!conn.status || conn.status.status === 'needs_reconnect')

  useEffect(() => watchCalendars(familyId, setCalendars), [familyId])
  useEffect(() => watchEvents(familyId, fromDateKey(first), fromDateKey(addDays(last, 1)), setEvents), [familyId, first, last])

  return (
    <>
      {(error || conn.error) && (
        <p className="error" role="alert">
          {error ?? conn.error}{' '}
          <button
            className="link"
            onClick={() => {
              setError(null)
              conn.clearError()
            }}
          >
            Dismiss
          </button>
        </p>
      )}
      {showConnect && <CalendarConnect status={conn.status} busy={conn.busy} onConnect={conn.connect} onSync={conn.sync} onDisconnect={conn.disconnect} />}

      <section className="calendar" aria-labelledby="calendar-heading">
        <div className="calendar__toolbar">
          <div className="week-nav">
            <button type="button" className="button" onClick={() => setOffset(offset - 1)} aria-label="Previous">
              ‹
            </button>
            <h2 id="calendar-heading" className="week-nav__label">
              {range.label}
            </h2>
            <button type="button" className="button" onClick={() => setOffset(offset + 1)} aria-label="Next">
              ›
            </button>
            {offset !== 0 && (
              <button type="button" className="link" onClick={() => setOffset(0)}>
                Today
              </button>
            )}
          </div>
          <div className="segmented" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`segmented__item${kind === v.id ? ' segmented__item--active' : ''}`}
                aria-pressed={kind === v.id}
                onClick={() => {
                  setKind(v.id)
                  setOffset(0)
                  rememberView(v.id)
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <CalendarFilter
            members={members}
            calendars={calendars}
            hidden={hidden}
            onChange={(h) => {
              setHidden(h)
              saveHidden(h)
            }}
          />
          <AddEventForm
            defaultDate={range.days.includes(today) ? today : first}
            members={members}
            userId={userId}
            onAdd={(e) => addManualEvent(familyId, userId, e).catch(report)}
          />
        </div>

        <CalendarBoard
          kind={kind}
          range={range}
          today={today}
          now={now}
          events={visible}
          members={members}
          calendars={calendars}
          onDelete={(e) => deleteManualEvent(familyId, e.id).catch(report)}
        />
      </section>
    </>
  )
}
