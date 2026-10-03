// Open-Meteo: free, no API key, CORS-enabled. https://open-meteo.com/
// US weather alerts: the National Weather Service, also free and keyless. https://www.weather.gov/documentation/services-web-api

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
  feelsHigh?: number
  feelsLow?: number
  /** Highest chance of rain or snow in any hour, 0–100. */
  precipChance?: number
  /** Total rain + melted snow, in the precipitation unit. */
  precip?: number
  /** Snowfall, in inches or centimetres. */
  snow?: number
  windMax?: number
  gustMax?: number
  uvMax?: number
  /** Local times, "06:58". */
  sunrise?: string
  sunset?: string
}

export interface HourForecast {
  /** Local "YYYY-MM-DDTHH:00". */
  time: string
  temp: number
  code: number
  isDay: boolean
  precipChance: number
  precip: number
  wind: number
}

export interface CurrentWeather {
  temp: number
  code: number
  isDay: boolean
  feels?: number
  humidity?: number
  wind?: number
  gust?: number
  /** Degrees the wind comes from. */
  windDir?: number
  precip?: number
}

export interface Units {
  temp: 'F' | 'C'
  precip: 'in' | 'mm'
  snow: 'in' | 'cm'
  wind: 'mph' | 'km/h'
}

export interface Forecast {
  current: CurrentWeather
  daily: DayForecast[]
  /** The rest of today and the next three days. */
  hourly?: HourForecast[]
  unit: 'F' | 'C'
  fetchedAt: number
}

export interface WeatherAlert {
  id: string
  event: string
  headline: string
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown'
  ends: string | null
}

export const unitsFor = (unit: 'F' | 'C'): Units =>
  unit === 'F' ? { temp: 'F', precip: 'in', snow: 'in', wind: 'mph' } : { temp: 'C', precip: 'mm', snow: 'cm', wind: 'km/h' }

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

const HOURLY_DAYS = 4
const round = (n: number | null | undefined) => (typeof n === 'number' ? Math.round(n) : undefined)
const tenth = (n: number | null | undefined) => (typeof n === 'number' ? Math.round(n * 10) / 10 : undefined)
const clock = (iso: string | undefined) => iso?.slice(11, 16)

interface Raw {
  current: Record<string, number>
  hourly?: Record<string, (number | string)[]>
  daily: Record<string, (number | string | null)[]>
}

/** One call a refresh: current conditions, hour by hour for a few days, and 16 days. */
export async function fetchForecast(place: Pick<Place, 'lat' | 'lon'>, unit: 'F' | 'C', fetchImpl: typeof fetch = fetch): Promise<Forecast> {
  const metric = unit === 'C'
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability,precipitation,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset',
    temperature_unit: metric ? 'celsius' : 'fahrenheit',
    precipitation_unit: metric ? 'mm' : 'inch',
    wind_speed_unit: metric ? 'kmh' : 'mph',
    timezone: 'auto',
    forecast_days: '16',
  })
  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Weather unavailable (${res.status}).`)
  const d = (await res.json()) as Raw
  const c = d.current
  const day = d.daily
  const num = (key: string, i: number) => (day[key]?.[i] ?? undefined) as number | undefined
  const dates = day.time as string[]
  const keepUntil = dates[HOURLY_DAYS] ?? '9999'
  const h = d.hourly
  const hourly: HourForecast[] | undefined = h
    ? (h.time as string[])
        .map((time, i) => ({
          time,
          temp: Math.round(h.temperature_2m[i] as number),
          code: h.weather_code[i] as number,
          isDay: h.is_day[i] === 1,
          precipChance: (h.precipitation_probability?.[i] as number | null) ?? 0,
          precip: tenth(h.precipitation?.[i] as number) ?? 0,
          wind: Math.round((h.wind_speed_10m?.[i] as number) ?? 0),
        }))
        // Only what the views use, so the saved copy stays small.
        .filter((x) => x.time < keepUntil)
    : undefined

  return {
    current: {
      temp: Math.round(c.temperature_2m),
      code: c.weather_code,
      isDay: c.is_day === 1,
      feels: round(c.apparent_temperature),
      humidity: round(c.relative_humidity_2m),
      wind: round(c.wind_speed_10m),
      gust: round(c.wind_gusts_10m),
      windDir: round(c.wind_direction_10m),
      precip: tenth(c.precipitation),
    },
    daily: dates.map((date, i) => ({
      date,
      code: num('weather_code', i) ?? 3,
      high: Math.round(num('temperature_2m_max', i) ?? 0),
      low: Math.round(num('temperature_2m_min', i) ?? 0),
      feelsHigh: round(num('apparent_temperature_max', i)),
      feelsLow: round(num('apparent_temperature_min', i)),
      precipChance: round(num('precipitation_probability_max', i)),
      precip: tenth(num('precipitation_sum', i)),
      snow: tenth(num('snowfall_sum', i)),
      windMax: round(num('wind_speed_10m_max', i)),
      gustMax: round(num('wind_gusts_10m_max', i)),
      uvMax: tenth(num('uv_index_max', i)),
      sunrise: clock(day.sunrise?.[i] as string | undefined),
      sunset: clock(day.sunset?.[i] as string | undefined),
    })),
    hourly,
    unit,
    fetchedAt: Date.now(),
  }
}

const SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor'] as const

/** Active National Weather Service alerts for a point (United States only; elsewhere returns none). */
export async function fetchAlerts(place: Pick<Place, 'lat' | 'lon'>, fetchImpl: typeof fetch = fetch): Promise<WeatherAlert[]> {
  const res = await fetchImpl(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`)
  // 404/400 = outside the US.
  if (!res.ok) return []
  const data = (await res.json()) as { features?: { id: string; properties: { event: string; headline?: string; severity?: string; ends?: string | null; expires?: string | null } }[] }
  const rank = (s: string) => SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]) + 1 || 9
  return (data.features ?? [])
    .map((f) => ({
      id: f.id,
      event: f.properties.event,
      headline: f.properties.headline ?? f.properties.event,
      severity: (SEVERITIES as readonly string[]).includes(f.properties.severity ?? '') ? (f.properties.severity as WeatherAlert['severity']) : 'Unknown',
      ends: f.properties.ends ?? f.properties.expires ?? null,
    }))
    .sort((a, b) => rank(a.severity) - rank(b.severity))
}

/** US AQI right now (Open-Meteo air quality), or null when unavailable. */
export async function fetchAirQuality(place: Pick<Place, 'lat' | 'lon'>, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const res = await fetchImpl(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.lat}&longitude=${place.lon}&current=us_aqi`)
  if (!res.ok) return null
  const data = (await res.json()) as { current?: { us_aqi?: number | null } }
  return typeof data.current?.us_aqi === 'number' ? Math.round(data.current.us_aqi) : null
}

/** EPA category for a US AQI value. */
export function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for sensitive groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very unhealthy'
  return 'Hazardous'
}

export function uvLabel(uv: number): string {
  if (uv < 3) return 'Low'
  if (uv < 6) return 'Moderate'
  if (uv < 8) return 'High'
  if (uv < 11) return 'Very high'
  return 'Extreme'
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]

/** "7 AM", "12 PM" from "2026-10-03T07:00". */
export function hourLabel(time: string): string {
  const h = Number(time.slice(11, 13))
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
}

/** "6:58 AM" from "06:58". */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "0.25 in", "6 mm", "trace". */
export function amountLabel(n: number, unit: string): string {
  if (n <= 0) return `0 ${unit}`
  if (unit === 'in') return n < 0.01 ? 'trace' : `${n < 0.1 ? n.toFixed(2) : n.toFixed(1)} in`
  return `${n < 1 ? n.toFixed(1) : Math.round(n)} ${unit}`
}

/**
 * When rain is likely in the coming hours, in words: "Rain likely 3 – 6 PM (70%)".
 * Looks at `hours` from now; null when nothing reaches `threshold`%.
 */
export function precipSummary(hourly: HourForecast[], fromTime: string, hours = 12, threshold = 50): string | null {
  const ahead = hourly.filter((h) => h.time >= fromTime).slice(0, hours)
  const wet = ahead.filter((h) => h.precipChance >= threshold)
  if (wet.length === 0) return null
  const first = wet[0]
  // The first wet stretch: consecutive hours from the first wet one.
  const start = ahead.indexOf(first)
  let end = start
  while (end + 1 < ahead.length && ahead[end + 1].precipChance >= threshold) end++
  const peak = Math.max(...ahead.slice(start, end + 1).map((h) => h.precipChance))
  const snowy = ahead.slice(start, end + 1).some((h) => isSnow(h.code))
  const what = snowy ? 'Snow' : ahead.slice(start, end + 1).some((h) => h.code >= 95) ? 'Storms' : 'Rain'
  const after = ahead[end + 1]
  const span = after ? `${hourLabel(first.time)} – ${hourLabel(after.time)}` : `from ${hourLabel(first.time)}`
  return start === 0 ? `${what} likely now${after ? ` until ${hourLabel(after.time)}` : ''} (${peak}%)` : `${what} likely ${span} (${peak}%)`
}

export const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86

/** WMO weather code → icon and words. https://open-meteo.com/en/docs#weathervariables */
export function describeWeather(code: number, isDay = true): { icon: string; text: string } {
  if (code === 0) return isDay ? { icon: '☀️', text: 'Clear' } : { icon: '🌙', text: 'Clear' }
  if (code === 1 || code === 2) return isDay ? { icon: '🌤️', text: 'Partly cloudy' } : { icon: '☁️', text: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', text: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫️', text: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'Drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: code >= 80 ? 'Showers' : 'Rain' }
  if (isSnow(code)) return { icon: '🌨️', text: 'Snow' }
  if (code >= 95) return { icon: '⛈️', text: 'Thunderstorm' }
  return { icon: '🌡️', text: 'Weather' }
}
