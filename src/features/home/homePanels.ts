import type { Device } from '../../lib/device'

export type HomePanel = 'lists' | 'tasks' | 'calendar'

export const HOME_PANELS: { id: HomePanel; label: string }[] = [
  { id: 'lists', label: 'Lists' },
  { id: 'tasks', label: "Today's tasks" },
  { id: 'calendar', label: 'Calendar' },
]

/** Top to bottom. */
export const DEFAULT_HOME: HomePanel[] = ['lists', 'tasks', 'calendar']

const isPanel = (v: unknown): v is HomePanel => HOME_PANELS.some((p) => p.id === v)

/** The panels a device shows on Home, in order (settings.homePanels; unset = the default). */
export function homePanelsFor(setting: Partial<Record<Device, string[]>> | undefined, device: Device): HomePanel[] {
  const list = setting?.[device]
  if (!Array.isArray(list)) return DEFAULT_HOME
  return [...new Set(list.filter(isPanel))]
}

/** Relative heights when panels stack: the week needs the most room. */
export const PANEL_WEIGHT: Record<HomePanel, number> = { lists: 1, tasks: 1.1, calendar: 1.35 }
