import { CloudRain, Droplets, Snowflake, Sun, Sunrise, Sunset, Thermometer, TriangleAlert, Wind } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ICON_STROKE } from '../../components/Icons'
import { fromDateKey, toDateKey } from '../../lib/dates'
import { useDevice } from '../../lib/DeviceContext'
import { useNow, useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import { LocationPicker } from './LocationPicker'
import { WeatherGlyph } from './WeatherBadges'
import { useWeatherInfo } from './WeatherContext'
import {
  amountLabel,
  aqiLabel,
  clockLabel,
  compass,
  describeWeather,
  hourLabel,
  precipSummary,
  unitsFor,
  uvLabel,
  type DayForecast,
  type Forecast,
  type HourForecast,
  type Units,
  type WeatherAlert,
} from './weatherApi'
import { WEATHER_VIEWS, weatherViewFor, type WeatherDetail, type WeatherView } from './weatherOptions'

const VIEW_KEY = 'weather-view'

/** Today in detail, the next three days side by side, or the week as rows. Settings → Weather picks what shows. */
export function WeatherPage() {
  const { settings } = useSettings()
  const { layout } = useDevice()
  const { forecast, alerts, aqi } = useWeatherInfo()
  const now = useNow()
  const today = useToday()
  const [view, setView] = useState<WeatherView>(() => {
    try {
      const v = sessionStorage.getItem(VIEW_KEY)
      if (WEATHER_VIEWS.some((x) => x.id === v)) return v as WeatherView
    } catch {
      // fall through to the device's default
    }
    return weatherViewFor(settings.weatherView, layout)
  })
  const pick = (v: WeatherView) => {
    setView(v)
    try {
      sessionStorage.setItem(VIEW_KEY, v)
    } catch {
      // convenience only
    }
  }

  if (!settings.weatherLocation) {
    return (
      <div className="weather">
        <h1 className="page-title">Weather</h1>
        <div className="card weather-setup">
          <p>Choose where to show the weather for. Search by city or ZIP code.</p>
          <LocationPicker />
        </div>
      </div>
    )
  }

  const details = new Set(settings.weatherDetails as WeatherDetail[])
  const units = unitsFor(forecast?.unit ?? settings.temperatureUnit)
  const hourKey = `${toDateKey(now)}T${String(now.getHours()).padStart(2, '0')}:00`
  const days = forecast ? forecast.daily.filter((d) => d.date >= today) : []

  return (
    <div className="weather">
      <header className="weather__head">
        <div>
          <h1 className="page-title">Weather</h1>
          <span className="muted">{settings.weatherLocation.label}</span>
        </div>
        <div className="segmented" role="group" aria-label="Forecast length">
          {WEATHER_VIEWS.map((v) => (
            <button key={v.id} type="button" className={`segmented__item${view === v.id ? ' segmented__item--active' : ''}`} aria-pressed={view === v.id} onClick={() => pick(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {alerts.map((a) => (
        <AlertBanner key={a.id} alert={a} />
      ))}

      {!forecast || days.length === 0 ? (
        <p className="muted">Loading the forecast…</p>
      ) : view === 'day' ? (
        <TodayView forecast={forecast} day={days[0]} hourKey={hourKey} details={details} units={units} aqi={aqi} />
      ) : view === 'threeDay' ? (
        <ThreeDays days={days.slice(0, 3)} hourly={forecast.hourly ?? []} today={today} details={details} units={units} />
      ) : (
        <WeekView days={days.slice(0, 7)} today={today} details={details} units={units} />
      )}

      <p className="weather__credit muted">
        Forecast from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
        {settings.weatherAlerts && (
          <>
            {' '}· alerts from the <a href="https://www.weather.gov/" target="_blank" rel="noreferrer">National Weather Service</a>
          </>
        )}
        {forecast && ` · updated ${new Date(forecast.fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
      </p>
    </div>
  )
}

function AlertBanner({ alert }: { alert: WeatherAlert }) {
  const strong = alert.severity === 'Extreme' || alert.severity === 'Severe'
  const until = alert.ends ? new Date(alert.ends).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null
  return (
    <div className={`weather-alert${strong ? ' weather-alert--severe' : ''}`} role="alert">
      <TriangleAlert size={20} strokeWidth={ICON_STROKE} aria-hidden />
      <div>
        <strong>{alert.event}</strong>
        {until && <span className="muted"> · until {until}</span>}
        <p>{alert.headline}</p>
      </div>
    </div>
  )
}

const weekday = (key: string, today: string, style: 'short' | 'long' = 'short') =>
  key === today ? 'Today' : fromDateKey(key).toLocaleDateString(undefined, { weekday: style })

function TodayView({ forecast, day, hourKey, details, units, aqi }: { forecast: Forecast; day: DayForecast; hourKey: string; details: Set<WeatherDetail>; units: Units; aqi: number | null }) {
  const c = forecast.current
  const hourly = forecast.hourly ?? []
  const next = hourly.filter((h) => h.time >= hourKey).slice(0, 24)
  const summary = details.has('precip') ? precipSummary(hourly, hourKey) : null
  return (
    <div className="weather-today">
      <section className="card weather-now" aria-label="Now">
        <WeatherGlyph code={c.code} isDay={c.isDay} size={72} />
        <div className="weather-now__main">
          <span className="weather-now__temp">{c.temp}°</span>
          <span className="weather-now__text">{describeWeather(c.code, c.isDay).text}</span>
          <span className="muted">
            High {day.high}° · Low {day.low}°{details.has('feels') && c.feels !== undefined && ` · Feels like ${c.feels}°`}
          </span>
          {details.has('precip') && (
            <span className={`weather-now__rain${summary ? ' weather-now__rain--wet' : ''}`}>
              <CloudRain size={18} strokeWidth={ICON_STROKE} aria-hidden />
              {summary ?? 'No rain expected in the next 12 hours'}
            </span>
          )}
        </div>
      </section>

      {details.has('hourly') && next.length > 0 && <HourStrip hours={next} showRain={details.has('precip')} />}

      <section className="weather-tiles" aria-label="Details">
        {details.has('precip') && (
          <Tile icon={<Droplets {...ico} />} label="Rain and snow">
            <strong>{day.precipChance ?? 0}%</strong> chance
            <span className="muted">{precipAmount(day, units)} today</span>
          </Tile>
        )}
        {details.has('wind') && c.wind !== undefined && (
          <Tile icon={<Wind {...ico} />} label="Wind">
            <strong>
              {c.wind} {units.wind}
            </strong>
            {c.windDir !== undefined && ` ${compass(c.windDir)}`}
            <span className="muted">Gusts {c.gust ?? day.gustMax} {units.wind}</span>
          </Tile>
        )}
        {details.has('feels') && c.feels !== undefined && (
          <Tile icon={<Thermometer {...ico} />} label="Feels like">
            <strong>{c.feels}°</strong>
            {day.feelsHigh !== undefined && <span className="muted">Up to {day.feelsHigh}° today</span>}
          </Tile>
        )}
        {details.has('humidity') && c.humidity !== undefined && (
          <Tile icon={<Droplets {...ico} />} label="Humidity">
            <strong>{c.humidity}%</strong>
          </Tile>
        )}
        {details.has('uv') && day.uvMax !== undefined && (
          <Tile icon={<Sun {...ico} />} label="UV index">
            <strong>{Math.round(day.uvMax)}</strong> {uvLabel(day.uvMax)}
            <span className="muted">Highest today</span>
          </Tile>
        )}
        {details.has('sun') && day.sunrise && day.sunset && (
          <Tile icon={<Sunrise {...ico} />} label="Sunrise and sunset">
            <strong>{clockLabel(day.sunrise)}</strong>
            <span className="muted">Sets {clockLabel(day.sunset)}</span>
          </Tile>
        )}
        {details.has('aqi') && aqi !== null && (
          <Tile icon={<Wind {...ico} />} label="Air quality">
            <strong>{aqi}</strong> {aqiLabel(aqi)}
          </Tile>
        )}
      </section>
    </div>
  )
}

const ico = { size: 18, strokeWidth: ICON_STROKE, 'aria-hidden': true } as const

function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="card weather-tile">
      <span className="weather-tile__label">
        {icon}
        {label}
      </span>
      <span className="weather-tile__value">{children}</span>
    </div>
  )
}

function precipAmount(day: DayForecast, units: Units): string {
  const snow = day.snow ?? 0
  const rain = amountLabel(day.precip ?? 0, units.precip)
  return snow > 0 ? `${rain}, ${amountLabel(snow, units.snow)} snow` : rain
}

/** The next hours left to right: time, sky, temperature, and a bar for the chance of rain. */
function HourStrip({ hours, showRain }: { hours: HourForecast[]; showRain: boolean }) {
  return (
    <section className="card weather-hours" aria-label="Hour by hour">
      <ol>
        {hours.map((h, i) => (
          <li key={h.time} className="weather-hour" aria-label={`${hourLabel(h.time)}: ${h.temp}°, ${describeWeather(h.code, h.isDay).text}${showRain ? `, ${h.precipChance}% chance of rain` : ''}`}>
            <span className="weather-hour__time">{i === 0 ? 'Now' : hourLabel(h.time)}</span>
            <WeatherGlyph code={h.code} isDay={h.isDay} size={22} />
            <span className="weather-hour__temp">{h.temp}°</span>
            {showRain && (
              <span className="weather-hour__rain">
                <span className="rain-bar" style={{ '--rain-chance': `${h.precipChance}%` } as CSSProperties} />
                <span className={h.precipChance >= 10 ? '' : 'weather-hour__dry'}>{h.precipChance}%</span>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** A tiny chance-of-rain chart for one day, hour by hour. */
function RainBars({ hours }: { hours: HourForecast[] }) {
  if (hours.length === 0) return null
  return (
    <div className="rain-bars" aria-hidden>
      {hours.map((h) => (
        <span key={h.time} className="rain-bar" style={{ '--rain-chance': `${h.precipChance}%` } as CSSProperties} title={`${hourLabel(h.time)}: ${h.precipChance}%`} />
      ))}
    </div>
  )
}

function ThreeDays({ days, hourly, today, details, units }: { days: DayForecast[]; hourly: HourForecast[]; today: string; details: Set<WeatherDetail>; units: Units }) {
  return (
    <ol className="weather-days">
      {days.map((d) => {
        const hours = hourly.filter((h) => h.time.startsWith(d.date))
        return (
          <li key={d.date} className={`card weather-day${d.date === today ? ' weather-day--today' : ''}`} aria-label={fromDateKey(d.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
            <header className="weather-day__head">
              <span className="weather-day__name">{weekday(d.date, today, 'long')}</span>
              <span className="muted">{fromDateKey(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </header>
            <div className="weather-day__sky">
              <WeatherGlyph code={d.code} size={48} />
              <div>
                <span className="weather-day__temps">
                  {d.high}° <span className="muted">/ {d.low}°</span>
                </span>
                <span className="weather-day__text">{describeWeather(d.code).text}</span>
              </div>
            </div>
            <dl className="weather-facts">
              {details.has('precip') && (
                <Fact icon={(d.snow ?? 0) > 0 ? <Snowflake {...ico} /> : <Droplets {...ico} />} label="Rain">
                  {d.precipChance ?? 0}% · {precipAmount(d, units)}
                </Fact>
              )}
              {details.has('precip') && details.has('hourly') && hours.length > 0 && (
                <div className="weather-facts__chart">
                  <RainBars hours={hours} />
                  <span className="rain-bars__axis muted">
                    <span>{hourLabel(hours[0].time)}</span>
                    <span>{hourLabel(hours[hours.length - 1].time)}</span>
                  </span>
                </div>
              )}
              {details.has('feels') && d.feelsHigh !== undefined && (
                <Fact icon={<Thermometer {...ico} />} label="Feels like">
                  {d.feelsHigh}° / {d.feelsLow}°
                </Fact>
              )}
              {details.has('wind') && d.windMax !== undefined && (
                <Fact icon={<Wind {...ico} />} label="Wind">
                  {d.windMax} {units.wind}, gusts {d.gustMax}
                </Fact>
              )}
              {details.has('uv') && d.uvMax !== undefined && (
                <Fact icon={<Sun {...ico} />} label="UV">
                  {Math.round(d.uvMax)} {uvLabel(d.uvMax)}
                </Fact>
              )}
              {details.has('sun') && d.sunrise && d.sunset && (
                <Fact icon={<Sunset {...ico} />} label="Sun">
                  {clockLabel(d.sunrise)} – {clockLabel(d.sunset)}
                </Fact>
              )}
            </dl>
          </li>
        )
      })}
    </ol>
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="weather-fact">
      <dt>
        {icon}
        <span className="visually-hidden">{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

/** One row a day; the bar shows each day's low-to-high within the week's range. */
function WeekView({ days, today, details, units }: { days: DayForecast[]; today: string; details: Set<WeatherDetail>; units: Units }) {
  const min = Math.min(...days.map((d) => d.low))
  const max = Math.max(...days.map((d) => d.high))
  const span = Math.max(1, max - min)
  return (
    <ol className="card weather-week">
      {days.map((d) => (
        <li key={d.date} className={`weather-row${d.date === today ? ' weather-row--today' : ''}`}>
          <span className="weather-row__day">{weekday(d.date, today)}</span>
          <span className="weather-row__sky">
            <WeatherGlyph code={d.code} size={26} />
            <span className="weather-row__text">{describeWeather(d.code).text}</span>
          </span>
          {details.has('precip') && (
            <span className={`weather-row__rain${(d.precipChance ?? 0) >= 30 ? ' weather-row__rain--wet' : ''}`}>
              <Droplets size={15} strokeWidth={ICON_STROKE} aria-hidden />
              {d.precipChance ?? 0}%<span className="weather-row__amount muted"> {precipAmount(d, units)}</span>
            </span>
          )}
          <span className="weather-row__temps">
            <span className="muted">{d.low}°</span>
            <span className="temp-range" aria-hidden>
              <span className="temp-range__fill" style={{ left: `${((d.low - min) / span) * 100}%`, width: `${((d.high - d.low) / span) * 100}%` }} />
            </span>
            <span>{d.high}°</span>
          </span>
          {details.has('wind') && d.windMax !== undefined && (
            <span className="weather-row__extra muted">
              <Wind size={15} strokeWidth={ICON_STROKE} aria-hidden /> {d.windMax} {units.wind}
            </span>
          )}
          {details.has('uv') && d.uvMax !== undefined && <span className="weather-row__extra muted">UV {Math.round(d.uvMax)}</span>}
        </li>
      ))}
    </ol>
  )
}
