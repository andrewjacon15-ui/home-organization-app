import { useEffect, useState } from 'react'
import { addDays, daysBetween, fromDateKey, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import type { CalendarEvent, Member } from '../../types'
import { addManualEvent, connectCalendar, deleteManualEvent, disconnectCalendar, syncMyCalendar, watchEvents } from './calendarApi'
import { CalendarConnect } from './CalendarConnect'
import { CalendarWeek } from './CalendarWeek'
import { ConnectCancelled, loadGoogleIdentity, requestCalendarCode } from './googleIdentity'

interface Props {
  familyId: string
  userId: string
  members: Member[]
}

export function CalendarPage({ familyId, userId, members }: Props) {
  const today = useToday()
  const currentWeekStart = startOfWeek(today)
  // An offset (not a fixed date) so the wall display rolls to the new week on its own.
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = addDays(currentWeekStart, weekOffset * 7)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const me = members.find((m) => m.id === userId)

  useEffect(
    () => watchEvents(familyId, fromDateKey(weekStart), fromDateKey(addDays(weekStart, 7)), setEvents),
    [familyId, weekStart],
  )

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
      <CalendarWeek
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        today={today}
        events={events}
        members={members}
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onAdd={(e) => addManualEvent(familyId, userId, e).catch(report)}
        onDelete={(e) => deleteManualEvent(familyId, e.id).catch(report)}
      />
    </>
  )
}
