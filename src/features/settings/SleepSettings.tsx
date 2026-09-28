import { useSleep } from '../sleep/SleepContext'
import { formatHHMM } from '../sleep/sleep'
import { SettingsSection, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

export function SleepSettings() {
  const { settings, update } = useSettings()
  const { applies, sleepNow } = useSleep()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)

  return (
    <SettingsSection title="Sleep mode" id="sleep">
      <ToggleRow
        label="Sleep mode"
        hint={`Blanks the wall display from ${formatHHMM(settings.sleepFrom)} to ${formatHHMM(settings.sleepTo)}. Tap the screen anytime to wake it. Phones aren't affected.`}
        checked={settings.sleepEnabled}
        onChange={(v) => save({ sleepEnabled: v })}
      />
      {settings.sleepEnabled && (
        <div className="setting-row">
          <span className="setting-row__label">Schedule</span>
          <div className="row">
            <label className="sleep-time">
              From
              <input type="time" value={settings.sleepFrom} onChange={(e) => e.target.value && save({ sleepFrom: e.target.value })} />
            </label>
            <label className="sleep-time">
              To
              <input type="time" value={settings.sleepTo} onChange={(e) => e.target.value && save({ sleepTo: e.target.value })} />
            </label>
          </div>
        </div>
      )}
      {applies && (
        <div className="setting-row">
          <span className="setting-row__label">
            Sleep now
            <span className="setting-row__hint">Until someone taps the screen.</span>
          </span>
          <button type="button" className="button" onClick={sleepNow}>
            Enter sleep mode now
          </button>
        </div>
      )}
    </SettingsSection>
  )
}
