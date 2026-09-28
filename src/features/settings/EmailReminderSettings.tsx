import { useEffect, useState } from 'react'
import { defaultPrefs, saveReminderPrefs, watchReminderPrefs, type ReminderPrefs } from '../reminders/reminderPrefsApi'
import { SelectRow, SettingsSection, ToggleRow } from './SettingRows'

const LEAD_TIMES = [5, 10, 15, 30, 45, 60, 120, 1440].map((n) => ({
  value: n,
  label: n === 1440 ? '1 day' : n >= 60 ? `${n / 60} hour${n === 60 ? '' : 's'}` : `${n} minutes`,
}))

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}` }))

interface Props {
  email: string
  timezone: string
  prefs: ReminderPrefs
  onChange: (prefs: ReminderPrefs) => void
}

/** Your own reminder emails. Everyone in the family sets these for themselves. */
export function EmailReminderRows({ email, timezone, prefs, onChange }: Props) {
  // Keep the zone current: it follows the family setting whenever you change something here.
  const save = (changes: Partial<ReminderPrefs>) => onChange({ ...prefs, ...changes, timezone })
  return (
    <SettingsSection title="Email reminders" id="email">
      <p className="settings-note">
        Sent to <strong>{email}</strong>. Only you see these settings; each person sets their own.
      </p>
      <ToggleRow label="Email me before my events" checked={prefs.eventEmailsEnabled} onChange={(v) => save({ eventEmailsEnabled: v })} />
      {prefs.eventEmailsEnabled && (
        <SelectRow label="How long before" value={prefs.leadTimeMinutes} options={withCurrent(LEAD_TIMES, prefs.leadTimeMinutes)} onChange={(v) => save({ leadTimeMinutes: v })} />
      )}
      <ToggleRow
        label="Daily digest"
        hint="One email each morning with your events, chores, and the day's meals."
        checked={prefs.dailyDigestEnabled}
        onChange={(v) => save({ dailyDigestEnabled: v })}
      />
      {prefs.dailyDigestEnabled && <SelectRow label="Send at" value={prefs.digestHourLocal} options={HOURS} onChange={(v) => save({ digestHourLocal: v })} />}
    </SettingsSection>
  )
}

function withCurrent(options: { value: number; label: string }[], current: number) {
  return options.some((o) => o.value === current) ? options : [...options, { value: current, label: `${current} minutes` }].sort((a, b) => a.value - b.value)
}

export function EmailReminderSettings({ familyId, userId, email, timezone }: { familyId: string; userId: string; email: string; timezone: string }) {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => watchReminderPrefs(familyId, userId, defaultPrefs(timezone), setPrefs), [familyId, userId, timezone])

  if (!prefs) return null
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <EmailReminderRows
        email={email}
        timezone={timezone}
        prefs={prefs}
        onChange={(next) => {
          setPrefs(next)
          saveReminderPrefs(familyId, userId, next).catch((e) => setError(e instanceof Error ? e.message : String(e)))
        }}
      />
    </>
  )
}
