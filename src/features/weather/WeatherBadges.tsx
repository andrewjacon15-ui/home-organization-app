import { useDayForecast, useWeather } from './WeatherContext'
import { describeWeather } from './weatherApi'

/** "☀️ 77°" for the header. Renders nothing until a location is set and the forecast loads. */
export function CurrentWeather() {
  const forecast = useWeather()
  if (!forecast) return null
  const { icon, text } = describeWeather(forecast.current.code, forecast.current.isDay)
  return (
    <span className="current-weather" title={text} aria-label={`${text}, ${forecast.current.temp} degrees ${forecast.unit === 'F' ? 'Fahrenheit' : 'Celsius'}`}>
      <span aria-hidden>{icon}</span> {forecast.current.temp}°
    </span>
  )
}

/** Small icon + high for a calendar day header. */
export function DayWeather({ date }: { date: string }) {
  const day = useDayForecast(date)
  if (!day) return null
  const { icon, text } = describeWeather(day.code)
  return (
    <span className="day-weather" title={`${text}, high ${day.high}°, low ${day.low}°`} aria-label={`${text}, high ${day.high} degrees`}>
      <span aria-hidden>{icon}</span>
      {day.high}°
    </span>
  )
}
