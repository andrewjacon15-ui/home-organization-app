import { useState, type FormEvent } from 'react'
import { useSettings } from '../settings/SettingsContext'
import { searchPlaces, type Place } from './weatherApi'

/** Search by city or ZIP and save the pick as the family's weather location. */
export function LocationPicker({ search = searchPlaces }: { search?: (query: string) => Promise<Place[]> }) {
  const { settings, update } = useSettings()
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
    void update({ weatherLocation: place })
    setResults(null)
    setQuery('')
  }

  return (
    <>
      <form className="row" onSubmit={find} role="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City or ZIP code" aria-label="Search for a place" />
        <button className="button" disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {settings.weatherLocation && (
          <button type="button" className="link" onClick={() => void update({ weatherLocation: null })}>
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
    </>
  )
}
