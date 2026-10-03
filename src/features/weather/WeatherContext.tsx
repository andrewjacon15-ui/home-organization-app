import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../settings/SettingsContext'
import { fetchAirQuality, fetchAlerts, fetchForecast, type DayForecast, type Forecast, type WeatherAlert } from './weatherApi'

const REFRESH_MS = 15 * 60 * 1000
const CACHE_KEY = 'weather-cache-v2'

export interface WeatherInfo {
  forecast: Forecast | null
  /** Active weather alerts (US), most severe first. */
  alerts: WeatherAlert[]
  /** US AQI now, when air quality is turned on and known. */
  aqi: number | null
}

const EMPTY: WeatherInfo = { forecast: null, alerts: [], aqi: null }
const WeatherContext = createContext<WeatherInfo>(EMPTY)

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

/** Fetches the forecast (and alerts / air quality when turned on) for the family's location every 15 minutes. */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const loc = settings.weatherLocation
  const unit = settings.temperatureUnit
  const wantAlerts = settings.weatherAlerts
  const wantAqi = settings.weatherDetails.includes('aqi')
  const key = loc ? `${loc.lat},${loc.lon},${unit}` : ''
  const [forecast, setForecast] = useState<Forecast | null>(() => (key ? readCache(key) : null))
  const [alerts, setAlerts] = useState<WeatherAlert[]>([])
  const [aqi, setAqi] = useState<number | null>(null)
  const [forecastKey, setForecastKey] = useState(key)

  // Location or unit changed: show the cached forecast for the new key (if any) until the fetch lands.
  if (forecastKey !== key) {
    setForecastKey(key)
    setForecast(key ? readCache(key) : null)
    setAlerts([])
    setAqi(null)
  }

  useEffect(() => {
    if (!loc) return
    let cancelled = false
    const load = () => {
      fetchForecast(loc, unit)
        .then((f) => {
          if (cancelled) return
          setForecast(f)
          writeCache(key, f)
        })
        .catch(() => undefined) // keep showing the last forecast when offline
      if (wantAlerts) fetchAlerts(loc).then((a) => !cancelled && setAlerts(a), () => undefined)
      if (wantAqi) fetchAirQuality(loc).then((a) => !cancelled && setAqi(a), () => undefined)
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wantAlerts, wantAqi])

  const value = { forecast, alerts: wantAlerts ? alerts : [], aqi: wantAqi ? aqi : null }
  return <WeatherContext.Provider value={value}>{children}</WeatherContext.Provider>
}

/** Test helper. */
export function StaticWeather({ forecast, alerts = [], aqi = null, children }: { forecast: Forecast | null; alerts?: WeatherAlert[]; aqi?: number | null; children: ReactNode }) {
  return <WeatherContext.Provider value={{ forecast, alerts, aqi }}>{children}</WeatherContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWeather() {
  return useContext(WeatherContext).forecast
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWeatherInfo() {
  return useContext(WeatherContext)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDayForecast(date: string): DayForecast | undefined {
  return useWeather()?.daily.find((d) => d.date === date)
}
