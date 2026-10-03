import type { Device } from '../../lib/device'

export type WeatherView = 'day' | 'threeDay' | 'week'

export const WEATHER_VIEWS: { id: WeatherView; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'threeDay', label: '3 days' },
  { id: 'week', label: 'Week' },
]

/** A phone shows today in detail; the wall tablet has room for three days; a computer, the week. */
export const DEFAULT_WEATHER_VIEW: Record<Device, WeatherView> = { phone: 'day', tablet: 'threeDay', desktop: 'week' }

export type WeatherDetail = 'precip' | 'hourly' | 'feels' | 'wind' | 'humidity' | 'uv' | 'sun' | 'aqi'

export const WEATHER_DETAILS: { id: WeatherDetail; label: string; hint?: string }[] = [
  { id: 'precip', label: 'Rain and snow', hint: 'Chance, amount, and when it starts' },
  { id: 'hourly', label: 'Hour by hour', hint: 'Temperature and chance of rain for each hour' },
  { id: 'feels', label: 'Feels like' },
  { id: 'wind', label: 'Wind and gusts' },
  { id: 'humidity', label: 'Humidity' },
  { id: 'uv', label: 'UV index' },
  { id: 'sun', label: 'Sunrise and sunset' },
  { id: 'aqi', label: 'Air quality', hint: 'US AQI, checked with each refresh' },
]

export const weatherViewFor = (setting: Partial<Record<Device, WeatherView>> | undefined, device: Device): WeatherView =>
  setting?.[device] ?? DEFAULT_WEATHER_VIEW[device]
