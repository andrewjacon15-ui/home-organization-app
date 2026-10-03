import { useDevice } from '../../lib/DeviceContext'
import { DEVICE_LABELS, type Device } from '../../lib/device'
import { LocationPicker } from '../weather/LocationPicker'
import type { Place } from '../weather/weatherApi'
import { WEATHER_DETAILS, WEATHER_VIEWS, weatherViewFor, type WeatherView } from '../weather/weatherOptions'
import { SelectRow, SettingsSection, ToggleRow } from './SettingRows'
import { useSettings } from './SettingsContext'

interface Props {
  /** Injectable for tests. */
  search?: (query: string) => Promise<Place[]>
}

const DEVICES: Device[] = ['tablet', 'phone', 'desktop']

export function GeneralSettings({ search }: Props) {
  const { settings, update } = useSettings()
  const { device: current } = useDevice()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)
  const details = new Set(settings.weatherDetails)
  const toggleDetail = (id: string, on: boolean) =>
    // Keep the list in display order.
    save({ weatherDetails: WEATHER_DETAILS.map((d) => d.id).filter((d) => (d === id ? on : details.has(d))) })

  return (
    <>
      <SettingsSection title="Weather" id="general">
        <div className="setting-row setting-row--stack">
          <div className="setting-row__label">
            Weather location
            <span className="setting-row__hint">
              {settings.weatherLocation ? settings.weatherLocation.label : 'Not set. Search by city or ZIP code.'}
            </span>
          </div>
          <LocationPicker search={search} />
        </div>
        <SelectRow
          label="Units"
          value={settings.temperatureUnit}
          options={[
            { value: 'F', label: '°F, inches, mph' },
            { value: 'C', label: '°C, mm, km/h' },
          ]}
          onChange={(v) => save({ temperatureUnit: v })}
        />
        {DEVICES.map((d) => (
          <SelectRow<WeatherView>
            key={d}
            label={`${DEVICE_LABELS[d]}${d === current ? ' (this one)' : ''} opens to`}
            value={weatherViewFor(settings.weatherView, d)}
            options={WEATHER_VIEWS.map((v) => ({ value: v.id, label: v.id === 'day' ? 'Today in detail' : v.label }))}
            onChange={(v) => save({ weatherView: { ...settings.weatherView, [d]: v } })}
          />
        ))}
        <fieldset className="setting-row setting-row--stack weather-detail-picker">
          <legend className="setting-row__label">
            Show on the Weather tab
            <span className="setting-row__hint">The temperature and sky always show.</span>
          </legend>
          {WEATHER_DETAILS.map((d) => (
            <label key={d.id} className="check-row">
              <input type="checkbox" checked={details.has(d.id)} onChange={(e) => toggleDetail(d.id, e.target.checked)} />
              <span>
                {d.label}
                {d.hint && <span className="setting-row__hint">{d.hint}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        <ToggleRow
          label="Weather alerts"
          hint="Warnings and watches from the National Weather Service (United States only)"
          checked={settings.weatherAlerts}
          onChange={(v) => save({ weatherAlerts: v })}
        />
        <ToggleRow label="Weather on the calendar" hint="A small icon and the high on each day" checked={settings.weatherOnCalendar} onChange={(v) => save({ weatherOnCalendar: v })} />
      </SettingsSection>

      <SettingsSection title="Display" id="display">
        <SelectRow
          label="Text size"
          value={settings.textSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(v) => save({ textSize: v })}
        />
        <SelectRow
          label="Density"
          value={settings.density}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'cozy', label: 'Cozy' },
            { value: 'comfortable', label: 'Comfortable' },
          ]}
          onChange={(v) => save({ density: v })}
        />
      </SettingsSection>
    </>
  )
}
