import { playChime } from '../reminders/chime'
import { SelectRow, SettingsSection, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

const LEAD_TIMES = [5, 10, 15, 30, 45, 60, 120, 1440].map((n) => ({
  value: n,
  label: n === 1440 ? '1 day' : n >= 60 ? `${n / 60} hour${n === 60 ? '' : 's'}` : `${n} minutes`,
}))

export function ReminderSettings({ chime = playChime }: { chime?: () => void }) {
  const { settings, update } = useSettings()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)
  return (
    <>
      <SettingsSection title="Reminders">
        <ToggleRow label="At time of event" checked={settings.remindAtStart} onChange={(v) => save({ remindAtStart: v })} />
        <ToggleRow label="Before event" checked={settings.remindBeforeEnabled} onChange={(v) => save({ remindBeforeEnabled: v })} />
        {settings.remindBeforeEnabled && (
          <SelectRow label="How long before" value={settings.remindBeforeMinutes} options={LEAD_TIMES} onChange={(v) => save({ remindBeforeMinutes: v })} />
        )}
        <ToggleRow label="Chores when due" hint="Only applies to chores with due times." checked={settings.remindChoresDue} onChange={(v) => save({ remindChoresDue: v })} />
        <ToggleRow label="Reminder sound" checked={settings.reminderSound} onChange={(v) => save({ reminderSound: v })} />
        <div className="setting-row">
          <span className="setting-row__label">
            Test
            <span className="setting-row__hint">Reminders pop up on every screen showing the app.</span>
          </span>
          <button type="button" className="button" onClick={chime}>
            Play test sound
          </button>
        </div>
      </SettingsSection>
    </>
  )
}
