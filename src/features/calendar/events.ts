import { addDays, toDateKey } from '../../lib/dates'
import type { CalendarEvent, NewManualEvent } from '../../types'

const MAX_SPAN_DAYS = 62

/** The local-date keys an event covers. All-day end dates are exclusive; timed events count the day they end on. */
export function eventDateKeys(event: CalendarEvent): string[] {
  let first: string
  let last: string
  if (event.allDay && event.startDate) {
    first = event.startDate
    const endExclusive = event.endDate && event.endDate > first ? event.endDate : addDays(first, 1)
    last = addDays(endExclusive, -1)
  } else {
    first = toDateKey(event.start)
    // An event ending exactly at midnight doesn't spill into the next day.
    last = event.end > event.start ? toDateKey(new Date(event.end.getTime() - 1)) : first
  }
  const keys = [first]
  while (keys[keys.length - 1] < last && keys.length < MAX_SPAN_DAYS) keys.push(addDays(keys[keys.length - 1], 1))
  return keys
}

function compareEvents(a: CalendarEvent, b: CalendarEvent) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title)
}

/** Buckets events into the given days, all-day first then by start time. */
export function groupByDay(events: CalendarEvent[], days: string[]): Record<string, CalendarEvent[]> {
  const byDay: Record<string, CalendarEvent[]> = Object.fromEntries(days.map((d) => [d, []]))
  for (const event of events) {
    for (const key of eventDateKeys(event)) byDay[key]?.push(event)
  }
  for (const d of days) byDay[d].sort(compareEvents)
  return byDay
}

/** UTC midnight for a date key, matching how the sync function stores all-day events. */
function utcMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Builds a manual event from form fields. Times are local to this device. */
export function buildManualEvent(input: { title: string; date: string; allDay: boolean; startTime: string; endTime: string }): NewManualEvent {
  const title = input.title.trim()
  if (input.allDay) {
    const endDate = addDays(input.date, 1)
    return { title, allDay: true, startDate: input.date, endDate, start: utcMidnight(input.date), end: utcMidnight(endDate) }
  }
  const start = new Date(`${input.date}T${input.startTime || '09:00'}`)
  let end = new Date(`${input.date}T${input.endTime || input.startTime || '10:00'}`)
  if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000)
  return { title, allDay: false, start, end }
}
