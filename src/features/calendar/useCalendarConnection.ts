import { useEffect, useState } from 'react'
import type { Member } from '../../types'
import { connectCalendar, disconnectCalendar, syncMyCalendar } from './calendarApi'
import { ConnectCancelled, loadGoogleIdentity, requestCalendarCode } from './googleIdentity'

/** Connect / sync / disconnect the signed-in person's Google Calendar, with busy + error state. */
export function useCalendarConnection(familyId: string, me: Member | undefined) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load Google's script ahead of time so the consent popup opens directly from the click.
  useEffect(() => {
    loadGoogleIdentity().catch(() => undefined)
  }, [])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      // Callable errors arrive as "Message. [400]"; drop the status code.
      if (!(e instanceof ConnectCancelled)) setError((e instanceof Error ? e.message : String(e)).replace(/\s*\[\d{3}\]$/, ''))
    } finally {
      setBusy(false)
    }
  }

  return {
    status: me?.calendar,
    busy,
    error,
    clearError: () => setError(null),
    connect: () => run(async () => connectCalendar(familyId, await requestCalendarCode(me?.email))),
    sync: () => run(() => syncMyCalendar(familyId)),
    disconnect: () => {
      if (confirm('Disconnect your Google Calendar? Your synced events will be removed from the family calendar.')) {
        void run(() => disconnectCalendar(familyId))
      }
    },
  }
}
