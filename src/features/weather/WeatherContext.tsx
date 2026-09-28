import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../settings/SettingsContext'
import { fetchForecast, type DayForecast, type Forecast } from './weatherApi'

const REFRESH_MS = 15 * 60 * 1000
const CACHE_KEY = 'weather-cache-v1'

const WeatherContext = createContext<Forecast | null>(null)

function readCache(key: string): Forecast | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as { key: string; forecast: Forecast }) : null
    return parsed?.key === key ? parsed.forecast : null
  } catch {
    return null
  }
}

function writeCache(key: string, forecast: Forecast) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, forecast }))
  } catch {
    // Storage can be unavailable (private mode, kiosk policies); weather still works live.
  }
}

/** Fetches the forecast for the family's location and refreshes it every 15 minutes. */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const loc = settings.weatherLocation
  const unit = settings.temperatureUnit
  const key = loc ? `${loc.lat},${loc.lon},${unit}` : ''
  const [forecast, setForecast] = useState<Forecast | null>(() => (key ? readCache(key) : null))
  const [forecastKey, setForecastKey] = useState(key)

  // Location or unit changed: show the cached forecast for the new key (if any) until the fetch lands.
  if (forecastKey !== key) {
    setForecastKey(key)
    setForecast(key ? readCache(key) : null)
  }

  useEffect(() => {
    if (!loc) return
    let cancelled = false
    const load = () =>
      fetchForecast(loc, unit)
        .then((f) => {
          if (cancelled) return
          setForecast(f)
          writeCache(key, f)
        })
        .catch(() => undefined) // keep showing the last forecast when offline
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return <WeatherContext.Provider value={forecast}>{children}</WeatherContext.Provider>
}

/** Test helper. */
export function StaticWeather({ forecast, children }: { forecast: Forecast | null; children: ReactNode }) {
  return <WeatherContext.Provider value={forecast}>{children}</WeatherContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWeather() {
  return useContext(WeatherContext)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDayForecast(date: string): DayForecast | undefined {
  return useWeather()?.daily.find((d) => d.date === date)
}
