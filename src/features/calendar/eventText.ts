import { addDays, fromDateKey } from '../../lib/dates'
import type { CalendarEvent } from '../../types'

const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Saturday, October 3 · 9:00 AM – 10:30 AM", "All day", or a span of days. */
export function whenText(e: Pick<CalendarEvent, 'start' | 'end' | 'allDay' | 'startDate' | 'endDate'>): string {
  if (e.allDay) {
    const first = e.startDate ? fromDateKey(e.startDate) : e.start
    // All-day ends are exclusive: an event ending the 4th was the 3rd only.
    const last = e.startDate && e.endDate ? fromDateKey(addDays(e.endDate, -1)) : e.end
    return first.toDateString() === last.toDateString() ? `${day(first)} · All day` : `${day(first)} – ${day(last)}`
  }
  if (e.start.toDateString() === e.end.toDateString()) return `${day(e.start)} · ${time(e.start)} – ${time(e.end)}`
  return `${day(e.start)}, ${time(e.start)} – ${day(e.end)}, ${time(e.end)}`
}

/** A maps search for the place: opens the phone's map app, or Google Maps in the browser. */
export const mapsLink = (location: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
