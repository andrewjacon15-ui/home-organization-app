import type { Member } from '../../types'
import { CalendarConnect } from '../calendar/CalendarConnect'
import { useCalendarConnection } from '../calendar/useCalendarConnection'
import { SettingsSection } from './SettingRows'

export function GoogleCalendarSettings({ familyId, me }: { familyId: string; me: Member | undefined }) {
  const conn = useCalendarConnection(familyId, me)
  return (
    <SettingsSection title="Google Calendar" id="google">
      <CalendarConnect status={conn.status} busy={conn.busy} onConnect={conn.connect} onSync={conn.sync} onDisconnect={conn.disconnect} />
      {conn.error && (
        <p className="error" role="alert">
          {conn.error}
        </p>
      )}
    </SettingsSection>
  )
}
