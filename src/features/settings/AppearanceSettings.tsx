import { ColorPicker } from '../../components/ColorPicker'
import { SelectRow, SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'

export function AppearanceSettings() {
  const { settings, update } = useSettings()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)
  return (
    <SettingsSection title="Appearance" id="appearance">
      <SelectRow
        label="Theme"
        value={settings.theme}
        options={[
          { value: 'system', label: 'Match device' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(v) => save({ theme: v })}
      />
      <div className="setting-row setting-row--stack">
        <span className="setting-row__label">
          Highlight color
          <span className="setting-row__hint">Used for today, buttons, and selected items.</span>
        </span>
        <ColorPicker label="Highlight color" value={settings.accentColor} onChange={(v) => save({ accentColor: v })} />
      </div>
    </SettingsSection>
  )
}
