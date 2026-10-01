import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { useDayForecast, useWeather } from './WeatherContext'
import { describeWeather } from './weatherApi'

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

function WeatherGlyph({ code, isDay, size }: { code: number; isDay?: boolean; size: number }) {
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

/** Small icon + high for a calendar day header. */
export function DayWeather({ date }: { date: string }) {
  const day = useDayForecast(date)
  if (!day) return null
  const { text } = describeWeather(day.code)
  return (
    <span className="day-weather" title={`${text}, high ${day.high}°, low ${day.low}°`} aria-label={`${text}, high ${day.high} degrees`}>
      <WeatherGlyph code={day.code} size={15} />
      {day.high}°
    </span>
  )
}
