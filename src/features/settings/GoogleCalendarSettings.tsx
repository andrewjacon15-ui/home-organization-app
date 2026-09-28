import { useEffect, useRef, useState } from 'react'
import type { Member, SyncedCalendar } from '../../types'
import { syncMyCalendar, updateCalendar, watchCalendars } from '../calendar/calendarApi'
import { MyCalendars } from './MyCalendars'
import { CalendarConnect } from '../calendar/CalendarConnect'
import { useCalendarConnection } from '../calendar/useCalendarConnection'
import { SettingsSection } from './SettingRows'

export function GoogleCalendarSettings({ familyId, me, members }: { familyId: string; me: Member | undefined; members: Member[] }) {
  const conn = useCalendarConnection(familyId, me)
  const [calendars, setCalendars] = useState<SyncedCalendar[]>([])
  const [error, setError] = useState<string | null>(null)
  const resync = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => watchCalendars(familyId, setCalendars), [familyId])
  useEffect(() => () => clearTimeout(resync.current ?? undefined), [])
  return (
    <SettingsSection title="Google Calendar" id="google">
      <CalendarConnect status={conn.status} busy={conn.busy} onConnect={conn.connect} onSync={conn.sync} onDisconnect={conn.disconnect} />
      {me && (
        <MyCalendars
          userId={me.id}
          members={members}
          calendars={calendars}
          onChange={(key, changes) => {
            setError(null)
            updateCalendar(familyId, key, changes).catch((e) => setError(e instanceof Error ? e.message : String(e)))
            // Showing or hiding a calendar needs a sync to add or remove its events; batch quick toggles.
            if ('enabled' in changes) {
              clearTimeout(resync.current ?? undefined)
              resync.current = setTimeout(() => void syncMyCalendar(familyId).catch(() => undefined), 1500)
            }
          }}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {conn.error && (
        <p className="error" role="alert">
          {conn.error}
        </p>
      )}
    </SettingsSection>
  )
}
