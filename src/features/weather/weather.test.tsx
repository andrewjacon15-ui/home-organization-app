import { render, screen } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GeneralSettings } from '../settings/GeneralSettings'
import { StaticSettings } from '../settings/SettingsContext'
import { CurrentWeather, DayWeather } from './WeatherBadges'
import { StaticWeather } from './WeatherContext'
import { describeWeather, fetchForecast, searchPlaces, type Forecast } from './weatherApi'

const json = (body: unknown, ok = true) => vi.fn(async (_url: string | URL | Request) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response)

const forecast: Forecast = {
  current: { temp: 77, code: 0, isDay: true },
  daily: [{ date: '2026-09-28', code: 61, high: 81, low: 64 }],
  unit: 'F',
  fetchedAt: 0,
}

describe('weatherApi', () => {
  it('searches places by city or ZIP and labels them', async () => {
    const f = json({ results: [{ name: 'Atlanta', admin1: 'Georgia', country_code: 'US', latitude: 33.74912, longitude: -84.38798 }] })
    expect(await searchPlaces('30316', f)).toEqual([{ label: 'Atlanta, Georgia, US', lat: 33.749, lon: -84.388 }])
    expect(String(f.mock.calls[0][0])).toContain('name=30316')
    expect(await searchPlaces('a', f)).toEqual([])
  })

  it('parses the forecast and asks for the chosen unit', async () => {
    const f = json({
      current: { temperature_2m: 76.6, weather_code: 2, is_day: 1 },
      daily: { time: ['2026-09-27', '2026-09-28'], weather_code: [0, 61], temperature_2m_max: [80.4, 71.5], temperature_2m_min: [60.1, 59.9] },
    })
    const result = await fetchForecast({ lat: 33.7, lon: -84.4 }, 'C', f)
    expect(String(f.mock.calls[0][0])).toContain('temperature_unit=celsius')
    expect(result.current).toEqual({ temp: 77, code: 2, isDay: true })
    expect(result.daily[1]).toEqual({ date: '2026-09-28', code: 61, high: 72, low: 60 })
    expect(result.unit).toBe('C')
  })

  it('maps weather codes to icons', () => {
    expect(describeWeather(0).text).toBe('Clear')
    expect(describeWeather(0, false).icon).toBe('🌙')
    expect(describeWeather(63).text).toBe('Rain')
    expect(describeWeather(75).text).toBe('Snow')
    expect(describeWeather(95).text).toBe('Thunderstorm')
  })
})

describe('weather badges', () => {
  it('shows the current temperature and a day forecast', () => {
    render(
      <StaticWeather forecast={forecast}>
        <CurrentWeather />
        <DayWeather date="2026-09-28" />
        <DayWeather date="2026-12-25" />
      </StaticWeather>,
    )
    expect(screen.getByLabelText('Clear, 77 degrees Fahrenheit')).toHaveTextContent('77°')
    expect(screen.getByLabelText('Rain, high 81 degrees')).toBeInTheDocument()
    expect(screen.getAllByText(/°/)).toHaveLength(2)
  })

  it('renders nothing without a forecast', () => {
    const { container } = render(
      <StaticWeather forecast={null}>
        <CurrentWeather />
      </StaticWeather>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('GeneralSettings', () => {
  it('finds a place and saves it as the weather location', async () => {
    const update = vi.fn(async () => undefined)
    const search = vi.fn(async () => [{ label: 'Atlanta, Georgia, US', lat: 33.749, lon: -84.388 }])
    const user = userEvent.setup()
    render(
      <StaticSettings update={update}>
        <GeneralSettings search={search} />
      </StaticSettings>,
    )
    expect(screen.getByText(/Not set/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search for a place'), 'Atlanta')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await user.click(await screen.findByRole('button', { name: 'Atlanta, Georgia, US' }))
    expect(update).toHaveBeenCalledWith({ weatherLocation: { label: 'Atlanta, Georgia, US', lat: 33.749, lon: -84.388 } })
  })

  it('changes unit, text size, and density', async () => {
    const update = vi.fn(async () => undefined)
    const user = userEvent.setup()
    render(
      <StaticSettings update={update} settings={{ weatherLocation: { label: 'Atlanta', lat: 1, lon: 2 } }}>
        <GeneralSettings search={vi.fn()} />
      </StaticSettings>,
    )
    await choose(user, screen.getByLabelText('Units'), '°C, mm, km/h')
    expect(update).toHaveBeenLastCalledWith({ temperatureUnit: 'C' })
    await choose(user, screen.getByLabelText('Text size'), 'Small')
    expect(update).toHaveBeenLastCalledWith({ textSize: 'small' })
    await choose(user, screen.getByLabelText('Density'), 'Compact')
    expect(update).toHaveBeenLastCalledWith({ density: 'compact' })
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(update).toHaveBeenLastCalledWith({ weatherLocation: null })
  })
})
