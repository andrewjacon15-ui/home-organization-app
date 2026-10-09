import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { addDays, fromDateKey, toDateKey } from '../../lib/dates'
import type { Device } from '../../lib/device'
import { useDevice } from '../../lib/DeviceContext'
import { useNow, useToday } from '../../lib/hooks'
import type { CalendarEvent, Member, SyncedCalendar } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { AddEventForm } from './AddEventForm'
import { addCountdown } from '../countdowns/countdownsApi'
import { addManualEvent, deleteManualEvent, watchCalendars, watchEvents } from './calendarApi'
import { CalendarFilter } from './CalendarFilter'
import { applyFilter, loadHidden, saveHidden, type HiddenSets } from './filter'
import { CalendarBoard } from './CalendarBoard'
import { CalendarConnect } from './CalendarConnect'
import { useCalendarConnection } from './useCalendarConnection'
import { viewRange, type CalendarViewKind } from './views'
import { BackIcon, NextIcon } from '../../components/Icons'
import { useUndo } from '../../lib/undo'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

/**
 * The views each kind of screen offers. A phone gets the same day counts as the tablet, a
 * running list, and a month of dots with the chosen day's events below.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const VIEWS_FOR: Record<Device, { id: CalendarViewKind; label: string }[]> = {
  phone: [
    { id: 'day', label: 'Day' },
    { id: 'threeDay', label: '3 Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'schedule', label: 'List' },
  ],
  tablet: [
    { id: 'day', label: 'Day' },
    { id: 'threeDay', label: '3 Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'schedule', label: 'Schedule' },
  ],
  desktop: [
    { id: 'day', label: 'Day' },
    { id: 'threeDay', label: '3 Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'schedule', label: 'Schedule' },
  ],
}

const DEFAULT_VIEW: Record<Device, CalendarViewKind> = { phone: 'schedule', tablet: 'week', desktop: 'week' }
const viewKey = (layout: Device) => `calendar-view-${layout}`
const offers = (layout: Device, v: unknown): v is CalendarViewKind => VIEWS_FOR[layout].some((x) => x.id === v)

/** Each layout remembers its own view, so a computer window squeezed to phone width gets it back when widened. */
function savedView(layout: Device): CalendarViewKind {
  try {
    const v = localStorage.getItem(viewKey(layout))
    if (offers(layout, v)) return v
  } catch {
    // fall through to the default
  }
  return DEFAULT_VIEW[layout]
}

function rememberView(layout: Device, v: CalendarViewKind) {
  try {
    localStorage.setItem(viewKey(layout), v)
  } catch {
    // convenience only
  }
}

/** Swipe left or right to page (phones and the wall tablet). */
function useSwipe(onPage: (by: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0]
      start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = start.current
      start.current = null
      const t = e.changedTouches[0]
      if (!s || !t) return
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) onPage(dx < 0 ? 1 : -1)
    },
  }
}

export function CalendarPage({ familyId, userId, members }: Props) {
  const { offer } = useUndo()
  const { settings } = useSettings()
  const today = useToday()
  const now = useNow()
  const { layout } = useDevice()
  const [chosen, setChosen] = useState<Partial<Record<Device, CalendarViewKind>>>({})
  const kind = chosen[layout] ?? savedView(layout)
  const views = VIEWS_FOR[layout]
  // Pages away from the one containing today, so a wall display rolls forward on its own.
  const [offset, setOffset] = useState(0)
  const swipe = useSwipe((by) => setOffset((o) => o + by))
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
              <BackIcon />
            </button>
            <h2 id="calendar-heading" className="week-nav__label">
              {range.label}
            </h2>
            <button type="button" className="button" onClick={() => setOffset(offset + 1)} aria-label="Next">
              <NextIcon />
            </button>
            {offset !== 0 && (
              <button type="button" className="link" onClick={() => setOffset(0)}>
                Today
              </button>
            )}
          </div>
          <div className="segmented" role="group" aria-label="View">
            {views.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`segmented__item${kind === v.id ? ' segmented__item--active' : ''}`}
                aria-pressed={kind === v.id}
                onClick={() => {
                  setChosen((c) => ({ ...c, [layout]: v.id }))
                  setOffset(0)
                  rememberView(layout, v.id)
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
            onAdd={(e, { countdown }) => {
              addManualEvent(familyId, userId, e).catch(report)
              if (countdown) addCountdown(familyId, userId, e.title, e.startDate ?? toDateKey(e.start)).catch(report)
            }}
          />
        </div>

        <div className="calendar__board" {...swipe}>
        <CalendarBoard
          kind={kind}
          layout={layout}
          range={range}
          today={today}
          now={now}
          events={visible}
          members={members}
          calendars={calendars}
          onDelete={(e) => deleteManualEvent(familyId, e.id).then((r) => offer(`Deleted “${e.title}”`, r), report)}
        />
        </div>
      </section>
    </>
  )
}
