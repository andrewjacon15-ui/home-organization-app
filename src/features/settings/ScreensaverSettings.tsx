import { useScreensaver } from '../photos/ScreensaverContext'
import { SelectRow, SettingsSection, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

const AFTER_MINUTES = [1, 2, 5, 10, 15, 30, 60]
const SECONDS = [5, 8, 12, 20, 30, 60]

export function ScreensaverSettings() {
  const { settings, update } = useSettings()
  const { photos, startNow } = useScreensaver()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)

  return (
    <SettingsSection title="Photos & screensaver" id="photos">
      <ToggleRow label="Show Photos tab" checked={settings.showPhotosTab} onChange={(v) => save({ showPhotosTab: v })} />
      <ToggleRow
        label="Photo screensaver"
        hint={`The wall display shows family photos when nobody has touched it for a while (not during sleep mode). ${photos.length === 0 ? 'Add photos in the Photos tab first.' : `${photos.length} ${photos.length === 1 ? 'item' : 'items'} in the library.`}`}
        checked={settings.screensaverEnabled}
        onChange={(v) => save({ screensaverEnabled: v })}
      />
      {settings.screensaverEnabled && (
        <>
          <SelectRow
            label="Start after"
            value={settings.screensaverAfterMinutes}
            options={withCurrent(AFTER_MINUTES, settings.screensaverAfterMinutes).map((m) => ({ value: m, label: m === 1 ? '1 minute idle' : `${m} minutes idle` }))}
            onChange={(v) => save({ screensaverAfterMinutes: v })}
          />
          <SelectRow
            label="Each photo for"
            value={settings.screensaverSeconds}
            options={withCurrent(SECONDS, settings.screensaverSeconds).map((s) => ({ value: s, label: `${s} seconds` }))}
            onChange={(v) => save({ screensaverSeconds: v })}
          />
          <ToggleRow label="Shuffle" hint="Otherwise newest first." checked={settings.screensaverShuffle} onChange={(v) => save({ screensaverShuffle: v })} />
        </>
      )}
      <div className="setting-row">
        <span className="setting-row__label">
          Preview
          <span className="setting-row__hint">Tap anywhere to stop.</span>
        </span>
        <button type="button" className="button" disabled={photos.length === 0} onClick={startNow}>
          Start slideshow now
        </button>
      </div>
    </SettingsSection>
  )
}

/** Keeps a value set elsewhere selectable even if it isn't one of the presets. */
function withCurrent(presets: number[], current: number) {
  return presets.includes(current) ? presets : [...presets, current].sort((a, b) => a - b)
}
