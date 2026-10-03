import type { Device } from '../../lib/device'

export type HomePanel = 'countdowns' | 'lists' | 'tasks' | 'calendar' | 'weather'

export const HOME_PANELS: { id: HomePanel; label: string }[] = [
  { id: 'countdowns', label: 'Countdowns' },
  { id: 'lists', label: 'Lists' },
  { id: 'tasks', label: "Today's tasks" },
  { id: 'calendar', label: 'Calendar' },
  { id: 'weather', label: 'Weather' },
]

/** Top to bottom. */
export const DEFAULT_HOME: HomePanel[] = ['countdowns', 'lists', 'tasks', 'calendar']

const isPanel = (v: unknown): v is HomePanel => HOME_PANELS.some((p) => p.id === v)

/** The panels a device shows on Home, in order (settings.homePanels; unset = the default). */
export function homePanelsFor(setting: Partial<Record<Device, string[]>> | undefined, device: Device): HomePanel[] {
  const list = setting?.[device]
  if (!Array.isArray(list)) return DEFAULT_HOME
  return [...new Set(list.filter(isPanel))]
}

/** Relative heights when panels stack: the week needs the most room; a strip (countdowns, weather) takes only what it needs. */
export const PANEL_WEIGHT: Record<HomePanel, number | 'auto'> = { countdowns: 'auto', lists: 1, tasks: 1.1, calendar: 1.35, weather: 'auto' }
