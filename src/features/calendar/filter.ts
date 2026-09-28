import type { CalendarEvent, SyncedCalendar } from '../../types'
import { ownersOf } from './views'

export interface HiddenSets {
  people: string[]
  calendars: string[]
}

const KEY = 'calendar-filter-v1'

export function loadHidden(): HiddenSets {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '') as HiddenSets
    return { people: v.people ?? [], calendars: v.calendars ?? [] }
  } catch {
    return { people: [], calendars: [] }
  }
}

export function saveHidden(h: HiddenSets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h))
  } catch {
    // per-device convenience only
  }
}

/** Hides events from switched-off calendars, and events whose people are all switched off. */
export function applyFilter(events: CalendarEvent[], hidden: HiddenSets, calendars: Map<string, SyncedCalendar>): CalendarEvent[] {
  if (!hidden.people.length && !hidden.calendars.length) return events
  return events.filter((e) => {
    if (e.calendarKey && hidden.calendars.includes(e.calendarKey)) return false
    return ownersOf(e, calendars).some((id) => !hidden.people.includes(id))
  })
}
