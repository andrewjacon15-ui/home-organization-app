// The daily summary on Home: the day told as a few sentences and one timeline, built from
// the calendar, chores, meals, lists, countdowns and the forecast (no screen of its own data).
import { addDays, fromDateKey } from '../../lib/dates'
import type { OwnedEvent } from '../calendar/views'
import type { Occurrence } from '../chores/schedule'
import type { Forecast } from '../weather/weatherApi'
import { describeWeather } from '../weather/weatherApi'

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "3 events, 4 chores to do, and tacos for dinner." — what's left of today in one line. */
export function daySentence(o: { events: number; chores: number; dinner: string }): string {
  const parts: string[] = []
  if (o.events) parts.push(plural(o.events, 'event'))
  if (o.chores) parts.push(`${plural(o.chores, 'chore')} to do`)
  const dinner = o.dinner.trim()
  if (dinner) parts.push(`${dinner} for dinner`)
  if (!parts.length) return 'Nothing left on the calendar today.'
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const hourOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric' })

/** "64° and partly cloudy · High 72°, low 58° · Rain likely around 3 PM". Null until there's a forecast. */
export function weatherLine(f: Forecast | null, today: string, now: Date): string | null {
  if (!f) return null
  const day = f.daily.find((d) => d.date === today)
  const sky = describeWeather(f.current.code, f.current.isDay).text.toLowerCase()
  const parts = [`${f.current.temp}° and ${sky}`]
  if (day) parts.push(`High ${day.high}°, low ${day.low}°`)
  // The first hour still to come today with a good chance of rain or snow.
  const wet = (f.hourly ?? []).find((h) => h.time.startsWith(today) && new Date(h.time) >= new Date(now.getTime() - 3_600_000) && h.precipChance >= 50)
  if (wet) {
    const at = new Date(wet.time)
    const snow = (wet.code >= 71 && wet.code <= 77) || wet.code === 85 || wet.code === 86
    parts.push(`${snow ? 'Snow' : 'Rain'} likely ${at <= now ? 'now' : `around ${hourOf(at)}`}`)
  }
  return parts.join(' · ')
}

/** "now", "in 25 min", "in 2 hr 10 min", or "at 3:00 PM" (more than 6 hours away). */
export function relative(now: Date, at: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  if (mins < 360) return `in ${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''}`
  return `at ${clock(at)}`
}

export interface NextUp {
  event: OwnedEvent
  /** Happening right now. */
  ongoing: boolean
  /** Nothing more today: the first thing tomorrow. */
  tomorrow: boolean
}

const onDay = (e: OwnedEvent, key: string) => !e.allDay && e.start >= fromDateKey(key) && e.start < fromDateKey(addDays(key, 1))

/** What's on now, else the next thing today, else tomorrow's first event (timed events only). */
export function nextUp(events: OwnedEvent[], now: Date, today: string): NextUp | null {
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start.getTime() - b.start.getTime())
  const ongoing = timed.find((e) => e.start <= now && e.end > now)
  if (ongoing) return { event: ongoing, ongoing: true, tomorrow: false }
  const later = timed.find((e) => e.start > now && onDay(e, today))
  if (later) return { event: later, ongoing: false, tomorrow: false }
  const first = timed.find((e) => onDay(e, addDays(today, 1)))
  return first ? { event: first, ongoing: false, tomorrow: true } : null
}

export type TimelineRow =
  | { kind: 'event'; key: string; at: Date; end: Date; event: OwnedEvent; past: boolean }
  | { kind: 'chore'; key: string; at: Date; occurrence: Occurrence; past: boolean }

/** Today's timed events and timed chores, in order (all-day events and untimed chores are listed apart). */
export function timeline(events: OwnedEvent[], chores: Occurrence[], today: string, now: Date): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const e of events) {
    if (e.allDay || !(e.start < fromDateKey(addDays(today, 1)) && e.end > fromDateKey(today))) continue
    rows.push({ kind: 'event', key: `e:${e.id}`, at: e.start, end: e.end, event: e, past: e.end <= now })
  }
  for (const o of chores) {
    if (!o.chore.dueTime || o.date !== today) continue
    const [h, m] = o.chore.dueTime.split(':').map(Number)
    const at = fromDateKey(today)
    at.setHours(h, m, 0, 0)
    rows.push({ kind: 'chore', key: `c:${o.chore.id}:${o.date}`, at, occurrence: o, past: o.done })
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === 'event' ? -1 : 1))
}

/** All-day events that cover `day`. */
export const allDayOn = (events: OwnedEvent[], day: string) => events.filter((e) => e.allDay && (e.startDate ?? '') <= day && (e.endDate ?? '') > day)
