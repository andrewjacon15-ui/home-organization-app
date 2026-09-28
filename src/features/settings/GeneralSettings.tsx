import { useState, type FormEvent } from 'react'
import { searchPlaces, type Place } from '../weather/weatherApi'
import { SelectRow, SettingsSection } from './SettingRows'
import { useSettings } from './SettingsContext'

interface Props {
  /** Injectable for tests. */
  search?: (query: string) => Promise<Place[]>
}

export function GeneralSettings({ search = searchPlaces }: Props) {
  const { settings, update } = useSettings()
  const save = (changes: Parameters<typeof update>[0]) => void update(changes)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  async function find(e: FormEvent) {
    e.preventDefault()
    setSearching(true)
    setError(null)
    try {
      setResults(await search(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  function pick(place: Place) {
    save({ weatherLocation: place })
    setResults(null)
    setQuery('')
  }

  return (
    <>
      <SettingsSection title="General" id="general">
        <div className="setting-row setting-row--stack">
          <div className="setting-row__label">
            Weather location
            <span className="setting-row__hint">
              {settings.weatherLocation ? settings.weatherLocation.label : 'Not set. Search by city or ZIP code.'}
            </span>
          </div>
          <form className="row" onSubmit={find} role="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City or ZIP code" aria-label="Search for a place" />
            <button className="button" disabled={searching || query.trim().length < 2}>
              {searching ? 'Searching…' : 'Search'}
            </button>
            {settings.weatherLocation && (
              <button type="button" className="link" onClick={() => save({ weatherLocation: null })}>
                Remove
              </button>
            )}
          </form>
          {error && <p className="error">{error}</p>}
          {results && (
            <ul className="place-results" aria-label="Places">
              {results.length === 0 && <li className="muted">No places found.</li>}
              {results.map((p) => (
                <li key={`${p.lat},${p.lon}`}>
                  <button type="button" className="link" onClick={() => pick(p)}>
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <SelectRow
          label="Temperature"
          value={settings.temperatureUnit}
          options={[
            { value: 'F', label: 'Fahrenheit (°F)' },
            { value: 'C', label: 'Celsius (°C)' },
          ]}
          onChange={(v) => save({ temperatureUnit: v })}
        />
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
