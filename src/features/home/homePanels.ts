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

/**
 * Bumped when a new panel should appear on Homes saved before it existed. Version 2:
 * Countdowns go to the top of every device's Home (once; after that, the saved order wins).
 */
export const HOME_PANELS_VERSION = 2

/** How many days the Home calendar shows (Settings → Home screen, or the panel's own switch). */
export const HOME_CALENDAR_DAYS = [1, 3, 7] as const
export type HomeCalendarDays = (typeof HOME_CALENDAR_DAYS)[number]
export const DEFAULT_HOME_CALENDAR_DAYS: HomeCalendarDays = 3
export const homeCalendarDays = (v: unknown): HomeCalendarDays => (HOME_CALENDAR_DAYS.includes(v as HomeCalendarDays) ? (v as HomeCalendarDays) : DEFAULT_HOME_CALENDAR_DAYS)

const isPanel = (v: unknown): v is HomePanel => HOME_PANELS.some((p) => p.id === v)

/** The panels a device shows on Home, in order (settings.homePanels; unset = the default). */
export function homePanelsFor(setting: Partial<Record<Device, string[]>> | undefined, device: Device, version = HOME_PANELS_VERSION): HomePanel[] {
  const list = setting?.[device]
  if (!Array.isArray(list)) return DEFAULT_HOME
  const panels = [...new Set(list.filter(isPanel))]
  // Saved before countdowns were the default: put them on top.
  return version < 2 ? ['countdowns', ...panels.filter((p) => p !== 'countdowns')] : panels
}

/** Relative heights when panels stack: the calendar needs the most room; a strip (countdowns, weather) takes only what it needs. */
export const PANEL_WEIGHT: Record<HomePanel, number | 'auto'> = { countdowns: 'auto', lists: 1, tasks: 1.1, calendar: 2, weather: 'auto' }
