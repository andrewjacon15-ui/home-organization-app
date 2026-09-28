import { SelectRow, SettingsSection, TextRow, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  value: d,
  label: new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'long' }),
}))

const SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => ({ value: n, label: String(n) }))

export function CalendarSettings({ familyName }: { familyName: string }) {
  const { settings, update } = useSettings()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)

  return (
    <>
      <SettingsSection title="Calendar" id="calendar">
        <TextRow label="Calendar display name" value={settings.calendarName} placeholder={familyName} maxLength={80} onSave={(v) => save({ calendarName: v })} />
        <SelectRow label="Start week on" value={settings.weekStartsOn} options={WEEKDAYS} onChange={(v) => save({ weekStartsOn: v })} />
        <SelectRow
          label="Show countdowns"
          value={settings.showCountdowns}
          options={[
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never' },
          ]}
          onChange={(v) => save({ showCountdowns: v })}
        />
        <ToggleRow label="Color code multi-profile events" checked={settings.colorCodeMultiProfile} onChange={(v) => save({ colorCodeMultiProfile: v })} />
        <ToggleRow label="Shade weekends" checked={settings.shadeWeekends} onChange={(v) => save({ shadeWeekends: v })} />
        <ToggleRow label="Dim past events" checked={settings.dimPastEvents} onChange={(v) => save({ dimPastEvents: v })} />
      </SettingsSection>

      <SettingsSection title="Week View">
        <ToggleRow label="Start on current day" checked={settings.weekStartToday} onChange={(v) => save({ weekStartToday: v })} />
      </SettingsSection>

      <SettingsSection title="Month View">
        <ToggleRow label="Start on current week" hint="Shows the next five weeks instead of the calendar month." checked={settings.monthStartCurrentWeek} onChange={(v) => save({ monthStartCurrentWeek: v })} />
      </SettingsSection>

      <SettingsSection title="Schedule View">
        <SelectRow label="Days displayed" value={settings.scheduleDays} options={SCHEDULE_DAYS} onChange={(v) => save({ scheduleDays: v })} />
        <ToggleRow label="Start on current day" checked={settings.scheduleStartToday} onChange={(v) => save({ scheduleStartToday: v })} />
      </SettingsSection>
    </>
  )
}
