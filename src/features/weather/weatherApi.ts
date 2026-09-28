// Open-Meteo: free, no API key, CORS-enabled. https://open-meteo.com/

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface DayForecast {
  /** YYYY-MM-DD in the location's timezone. */
  date: string
  code: number
  high: number
  low: number
}

export interface Forecast {
  current: { temp: number; code: number; isDay: boolean }
  daily: DayForecast[]
  unit: 'F' | 'C'
  fetchedAt: number
}

/** Finds places by city name or ZIP/postal code. */
export async function searchPlaces(query: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`)
  const data = (await res.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[] }
  return (data.results ?? []).map((r) => ({
    label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: Math.round(r.latitude * 1000) / 1000,
    lon: Math.round(r.longitude * 1000) / 1000,
  }))
}

export async function fetchForecast(place: Pick<Place, 'lat' | 'lon'>, unit: 'F' | 'C', fetchImpl: typeof fetch = fetch): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
    timezone: 'auto',
    forecast_days: '16',
  })
  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Weather unavailable (${res.status}).`)
  const d = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number }
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] }
  }
  return {
    current: { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, isDay: d.current.is_day === 1 },
    daily: d.daily.time.map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      high: Math.round(d.daily.temperature_2m_max[i]),
      low: Math.round(d.daily.temperature_2m_min[i]),
    })),
    unit,
    fetchedAt: Date.now(),
  }
}

/** WMO weather code → icon and words. https://open-meteo.com/en/docs#weathervariables */
export function describeWeather(code: number, isDay = true): { icon: string; text: string } {
  if (code === 0) return isDay ? { icon: '☀️', text: 'Clear' } : { icon: '🌙', text: 'Clear' }
  if (code === 1 || code === 2) return isDay ? { icon: '🌤️', text: 'Partly cloudy' } : { icon: '☁️', text: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', text: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫️', text: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'Drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨️', text: 'Snow' }
  if (code >= 95) return { icon: '⛈️', text: 'Thunderstorm' }
  return { icon: '🌡️', text: 'Weather' }
}
