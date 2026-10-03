import { createElement } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Droplets, Moon, Sun, TriangleAlert, type LucideIcon } from '../../components/weatherGlyphs'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { useNow } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import { useDayForecast, useWeather, useWeatherInfo } from './WeatherContext'
import { describeWeather, precipSummary } from './weatherApi'

/** WMO weather code → a line icon from the app's one icon set (not emoji, which vary by device). */
function glyphFor(code: number, isDay = true): LucideIcon {
  if (code === 0) return isDay ? Sun : Moon
  if (code === 1 || code === 2) return isDay ? CloudSun : CloudMoon
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow
  if (code >= 95) return CloudLightning
  return Cloud
}

export function WeatherGlyph({ code, isDay, size }: { code: number; isDay?: boolean; size: number }) {
  return createElement(glyphFor(code, isDay), { className: 'weather-icon', size, strokeWidth: ICON_STROKE, 'aria-hidden': true })
}

/** Sun icon + "77°" for the header. Renders nothing until a location is set and the forecast loads. */
export function CurrentWeather() {
  const forecast = useWeather()
  if (!forecast) return null
  const { text } = describeWeather(forecast.current.code, forecast.current.isDay)
  return (
    <span className="current-weather" title={text} aria-label={`${text}, ${forecast.current.temp} degrees ${forecast.unit === 'F' ? 'Fahrenheit' : 'Celsius'}`}>
      <WeatherGlyph code={forecast.current.code} isDay={forecast.current.isDay} size={20} />
      {forecast.current.temp}°
    </span>
  )
}

/** Small icon + high for a calendar day header (Settings → Weather can turn these off). */
export function DayWeather({ date }: { date: string }) {
  const { settings } = useSettings()
  const day = useDayForecast(date)
  if (!day || !settings.weatherOnCalendar) return null
  const { text } = describeWeather(day.code)
  const wet = (day.precipChance ?? 0) >= 40
  return (
    <span
      className="day-weather"
      title={`${text}, high ${day.high}°, low ${day.low}°${day.precipChance !== undefined ? `, ${day.precipChance}% chance of rain` : ''}`}
      aria-label={`${text}, high ${day.high} degrees`}
    >
      <WeatherGlyph code={day.code} size={15} />
      {day.high}°{wet && <span className="day-weather__rain">{day.precipChance}%</span>}
    </span>
  )
}

/** "72° / 58° · Partly cloudy · 40% rain" under a day's heading. */
export function DayForecastLine({ date }: { date: string }) {
  const { settings } = useSettings()
  const day = useDayForecast(date)
  if (!day || !settings.weatherOnCalendar) return null
  const { text } = describeWeather(day.code)
  return (
    <span className="day-forecast">
      <WeatherGlyph code={day.code} size={18} />
      {day.high}° / {day.low}° · {text}
      {(day.precipChance ?? 0) >= 20 && <span className="day-weather__rain"> · {day.precipChance}% rain</span>}
    </span>
  )
}

/** Home panel: now, what's coming in the next hours, and the next five days. */
export function WeatherStrip() {
  const { forecast, alerts } = useWeatherInfo()
  const now = useNow()
  if (!forecast) return <p className="muted">Set a weather location in Settings → Weather.</p>
  const today = toDateKey(now)
  const hourKey = `${today}T${String(now.getHours()).padStart(2, '0')}:00`
  const days = forecast.daily.filter((d) => d.date >= today).slice(0, 5)
  const summary = forecast.hourly ? precipSummary(forecast.hourly, hourKey) : null
  const c = forecast.current
  return (
    <div className="weather-strip">
      <div className="weather-strip__now">
        <WeatherGlyph code={c.code} isDay={c.isDay} size={36} />
        <span className="weather-strip__temp">{c.temp}°</span>
        <span className="weather-strip__text">
          {describeWeather(c.code, c.isDay).text}
          {alerts[0] ? (
            <span className="weather-strip__alert">
              <TriangleAlert size={14} strokeWidth={ICON_STROKE} aria-hidden /> {alerts[0].event}
            </span>
          ) : (
            summary && (
              <span className="weather-strip__rain">
                <Droplets size={14} strokeWidth={ICON_STROKE} aria-hidden /> {summary}
              </span>
            )
          )}
        </span>
      </div>
      <ol className="weather-strip__days">
        {days.map((d) => (
          <li key={d.date} aria-label={`${fromDateKey(d.date).toLocaleDateString(undefined, { weekday: 'long' })}: ${describeWeather(d.code).text}, ${d.high} / ${d.low}`}>
            <span className="muted">{d.date === today ? 'Today' : fromDateKey(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <WeatherGlyph code={d.code} size={22} />
            <span>
              {d.high}° <span className="muted">{d.low}°</span>
            </span>
            {(d.precipChance ?? 0) >= 20 && <span className="day-weather__rain">{d.precipChance}%</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
