import { useEffect, useState } from 'react'
import { addDays, fromDateKey } from '../../lib/dates'
import { useNow, useToday } from '../../lib/hooks'
import type { CalendarEvent, Member } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { AddEventForm } from './AddEventForm'
import { addManualEvent, connectCalendar, deleteManualEvent, disconnectCalendar, syncMyCalendar, watchEvents } from './calendarApi'
import { CalendarBoard } from './CalendarBoard'
import { CalendarConnect } from './CalendarConnect'
import { ConnectCancelled, loadGoogleIdentity, requestCalendarCode } from './googleIdentity'
import { viewRange, type CalendarViewKind } from './views'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

const VIEWS: { id: CalendarViewKind; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'schedule', label: 'Schedule' },
]

export function CalendarPage({ familyId, userId, members }: Props) {
  const { settings } = useSettings()
  const today = useToday()
  const now = useNow()
  const [kind, setKind] = useState<CalendarViewKind>('week')
  // Pages away from the one containing today, so a wall display rolls forward on its own.
  const [offset, setOffset] = useState(0)
  const range = viewRange(kind, today, offset, settings)
  const first = range.days[0]
  const last = range.days[range.days.length - 1]
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const me = members.find((m) => m.id === userId)

  useEffect(() => watchEvents(familyId, fromDateKey(first), fromDateKey(addDays(last, 1)), setEvents), [familyId, first, last])

  // Load Google's script ahead of time so the consent popup opens directly from the click.
  useEffect(() => {
    loadGoogleIdentity().catch(() => undefined)
  }, [])

  // Callable errors arrive as "Message. [400]"; drop the status code.
  const report = (e: unknown) => setError((e instanceof Error ? e.message : String(e)).replace(/\s*\[\d{3}\]$/, ''))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      if (!(e instanceof ConnectCancelled)) report(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <CalendarConnect
        status={me?.calendar}
        busy={busy}
        onConnect={() => run(async () => connectCalendar(familyId, await requestCalendarCode(me?.email)))}
        onSync={() => run(() => syncMyCalendar(familyId))}
        onDisconnect={() => {
          if (confirm('Disconnect your Google Calendar? Your synced events will be removed from the family calendar.')) {
            run(() => disconnectCalendar(familyId))
          }
        }}
      />

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
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <AddEventForm
          defaultDate={range.days.includes(today) ? today : first}
          members={members}
          userId={userId}
          onAdd={(e) => addManualEvent(familyId, userId, e).catch(report)}
        />

        <CalendarBoard
          kind={kind}
          range={range}
          today={today}
          now={now}
          events={events}
          members={members}
          onDelete={(e) => deleteManualEvent(familyId, e.id).catch(report)}
        />
      </section>
    </>
  )
}
