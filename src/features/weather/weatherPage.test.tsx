import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticSettings } from '../settings/SettingsContext'
import { amountLabel, aqiLabel, clockLabel, compass, fetchAlerts, precipSummary, uvLabel, type Forecast, type WeatherAlert } from './weatherApi'
import { StaticWeather } from './WeatherContext'
import { WeatherPage } from './WeatherPage'

const json = (body: unknown, ok = true) => vi.fn(async (_url: string | URL | Request) => ({ ok, status: ok ? 200 : 404, json: async () => body }) as Response)

describe('forecast details', () => {
  const hours = (chances: number[], code = 61) =>
    chances.map((c, i) => ({ time: `2026-10-03T${String(9 + i).padStart(2, '0')}:00`, temp: 60, code, isDay: true, precipChance: c, precip: 0, wind: 5 }))

  it('says when rain is likely, in words', () => {
    expect(precipSummary(hours([0, 10, 60, 80, 70, 20]), '2026-10-03T09:00')).toBe('Rain likely 11 AM – 2 PM (80%)')
    expect(precipSummary(hours([90, 60, 10]), '2026-10-03T09:00')).toBe('Rain likely now until 11 AM (90%)')
    expect(precipSummary(hours([0, 70], 73), '2026-10-03T09:00')).toBe('Snow likely from 10 AM (70%)')
    expect(precipSummary(hours([0, 20, 30]), '2026-10-03T09:00')).toBeNull()
  })

  it('labels amounts, UV, air, and wind direction', () => {
    expect(amountLabel(0.004, 'in')).toBe('trace')
    expect(amountLabel(0.25, 'in')).toBe('0.3 in')
    expect(amountLabel(0.05, 'in')).toBe('0.05 in')
    expect(amountLabel(6.4, 'mm')).toBe('6 mm')
    expect(uvLabel(7)).toBe('High')
    expect(aqiLabel(42)).toBe('Good')
    expect(compass(225)).toBe('SW')
    expect(clockLabel('18:42')).toBe('6:42 PM')
  })

  it('reads NWS alerts, most severe first, and nothing outside the US', async () => {
    const f = json({
      features: [
        { id: 'a', properties: { event: 'Wind Advisory', headline: 'Wind Advisory until 6 PM', severity: 'Moderate', ends: '2026-10-03T18:00:00-04:00' } },
        { id: 'b', properties: { event: 'Tornado Warning', headline: 'Tornado Warning', severity: 'Extreme', ends: null } },
      ],
    })
    expect((await fetchAlerts({ lat: 33.7, lon: -84.4 }, f)).map((a) => a.event)).toEqual(['Tornado Warning', 'Wind Advisory'])
    expect(await fetchAlerts({ lat: 51.5, lon: 0 }, json({}, false))).toEqual([])
  })
})

describe('Weather tab', () => {
  const forecast: Forecast = {
    current: { temp: 68, code: 2, isDay: true, feels: 66, humidity: 55, wind: 9, gust: 18, windDir: 200 },
    daily: [
      { date: '2026-10-03', code: 61, high: 72, low: 55, precipChance: 80, precip: 0.4, windMax: 12, gustMax: 22, uvMax: 5, sunrise: '07:31', sunset: '19:12', feelsHigh: 71, feelsLow: 53 },
      { date: '2026-10-04', code: 0, high: 75, low: 52, precipChance: 0, precip: 0, windMax: 6, gustMax: 10, uvMax: 6, sunrise: '07:32', sunset: '19:10' },
      { date: '2026-10-05', code: 3, high: 70, low: 50, precipChance: 20, precip: 0, windMax: 8, gustMax: 12, uvMax: 4, sunrise: '07:33', sunset: '19:09' },
      { date: '2026-10-06', code: 71, high: 40, low: 30, precipChance: 60, precip: 0.2, snow: 2, uvMax: 2 },
    ],
    hourly: Array.from({ length: 30 }, (_, i) => ({
      time: `2026-10-0${3 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`,
      temp: 60 + (i % 10),
      code: 61,
      isDay: true,
      precipChance: i >= 14 && i <= 16 ? 70 : 5,
      precip: 0,
      wind: 5,
    })),
    unit: 'F',
    fetchedAt: 0,
  }
  const place = { weatherLocation: { label: 'Atlanta, Georgia, US', lat: 33.7, lon: -84.4 } }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-03T10:20'), toFake: ['Date'] })
    sessionStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  const mount = (extra = {}, alerts: WeatherAlert[] = []) =>
    render(
      <StaticSettings settings={{ ...place, ...extra }}>
        <StaticWeather forecast={forecast} alerts={alerts} aqi={38}>
          <WeatherPage />
        </StaticWeather>
      </StaticSettings>,
    )

  it('shows today in detail: now, when rain starts, the hours, and the chosen tiles', () => {
    mount({ weatherView: { desktop: 'day' } })
    expect(screen.getByRole('region', { name: 'Now' })).toHaveTextContent('68°')
    expect(screen.getByText('Rain likely 2 PM – 5 PM (70%)')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Hour by hour' })).toBeInTheDocument()
    expect(screen.getByText('Gusts 18 mph')).toBeInTheDocument()
    expect(screen.queryByText('Humidity')).not.toBeInTheDocument() // off by default
  })

  it('hides details that are turned off, and shows alerts', () => {
    mount({ weatherView: { desktop: 'day' }, weatherDetails: ['humidity', 'aqi'] }, [{ id: 'x', event: 'Flood Watch', headline: 'Flood Watch for Fulton County', severity: 'Severe', ends: null }])
    expect(screen.getByRole('alert')).toHaveTextContent('Flood Watch for Fulton County')
    expect(screen.queryByRole('region', { name: 'Hour by hour' })).not.toBeInTheDocument()
    expect(screen.getByText('55%')).toBeInTheDocument()
    expect(screen.getByText(/Good/)).toBeInTheDocument()
    expect(screen.queryByText(/Rain likely/)).not.toBeInTheDocument()
  })

  it('switches between three days and the week', () => {
    mount({ weatherView: { desktop: 'threeDay' } })
    expect(screen.getAllByRole('listitem', { name: /October/ })).toHaveLength(3)
    expect(screen.getByText('80% · 0.4 in')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.getByText('Today', { selector: '.weather-row__day' })).toBeInTheDocument()
    expect(screen.getByText(/2\.0 in snow/)).toBeInTheDocument()
  })

  it('asks for a location first', () => {
    render(
      <StaticSettings>
        <StaticWeather forecast={null}>
          <WeatherPage />
        </StaticWeather>
      </StaticSettings>,
    )
    expect(screen.getByLabelText('Search for a place')).toBeInTheDocument()
  })
})
