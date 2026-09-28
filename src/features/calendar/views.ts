import { addDays, fromDateKey, startOfWeek, toDateKey } from '../../lib/dates'
import type { CalendarEvent } from '../../types'
import type { DisplaySettings } from '../settings/settingsApi'

export type CalendarViewKind = 'week' | 'month' | 'schedule'

export interface ViewRange {
  /** Date keys shown, in order. */
  days: string[]
  label: string
  /** For month grids: the month being shown (other days are dimmed). null when not a calendar month. */
  focusMonth: number | null
}

type ViewSettings = Pick<DisplaySettings, 'weekStartsOn' | 'weekStartToday' | 'monthStartCurrentWeek' | 'scheduleDays' | 'scheduleStartToday'>

const short = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const range = (start: string, count: number) => Array.from({ length: count }, (_, i) => addDays(start, i))

/** The days a view shows, `offset` pages away from the one containing today. */
export function viewRange(kind: CalendarViewKind, today: string, offset: number, s: ViewSettings): ViewRange {
  if (kind === 'week') {
    const base = s.weekStartToday ? today : startOfWeek(today, s.weekStartsOn)
    const days = range(addDays(base, offset * 7), 7)
    return { days, label: `${short(days[0])} – ${short(days[6])}`, focusMonth: null }
  }

  if (kind === 'schedule') {
    const n = s.scheduleDays
    const base = s.scheduleStartToday ? today : startOfWeek(today, s.weekStartsOn)
    const days = range(addDays(base, offset * n), n)
    return { days, label: n === 1 ? short(days[0]) : `${short(days[0])} – ${short(days[n - 1])}`, focusMonth: null }
  }

  if (s.monthStartCurrentWeek) {
    // A rolling five weeks starting this week, the way Skylight does it.
    const base = addDays(startOfWeek(today, s.weekStartsOn), offset * 35)
    const days = range(base, 35)
    return { days, label: `${short(days[0])} – ${short(days[34])}`, focusMonth: null }
  }

  const t = fromDateKey(today)
  const first = new Date(t.getFullYear(), t.getMonth() + offset, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const start = startOfWeek(toDateKey(first), s.weekStartsOn)
  const end = addDays(startOfWeek(toDateKey(last), s.weekStartsOn), 6)
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return { days, label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), focusMonth: first.getMonth() }
}

/** Day-of-week headers for a grid starting on `weekStartsOn`. */
export function weekdayHeaders(weekStartsOn: number): string[] {
  const sunday = new Date(2026, 0, 4) // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(sunday.getFullYear(), 0, 4 + ((weekStartsOn + i) % 7)).toLocaleDateString(undefined, { weekday: 'short' }),
  )
}

export function isWeekend(key: string) {
  const day = fromDateKey(key).getDay()
  return day === 0 || day === 6
}

/** An event plus everyone it belongs to (after merging copies from several people's calendars). */
export interface OwnedEvent extends CalendarEvent {
  ownerIds: string[]
}

/**
 * Who each event is for, merging the same Google event that shows up in several
 * people's calendars (a shared invite) into one entry with all of them as owners.
 */
export function withOwners(events: CalendarEvent[]): OwnedEvent[] {
  const merged = new Map<string, OwnedEvent>()
  const out: OwnedEvent[] = []
  for (const e of events) {
    const owners = e.memberIds?.length ? e.memberIds : [e.sourceUserId]
    if (e.source !== 'google') {
      out.push({ ...e, ownerIds: owners })
      continue
    }
    const key = `${e.title}|${e.start.getTime()}|${e.end.getTime()}|${e.allDay}`
    const existing = merged.get(key)
    if (existing) {
      for (const o of owners) if (!existing.ownerIds.includes(o)) existing.ownerIds.push(o)
    } else {
      const owned = { ...e, ownerIds: [...owners] }
      merged.set(key, owned)
      out.push(owned)
    }
  }
  return out
}

/** "in 45 min" / "in 2 hr" for events later today; null otherwise. */
export function countdownLabel(event: CalendarEvent, now: Date): string | null {
  if (event.allDay || event.start <= now || toDateKey(event.start) !== toDateKey(now)) return null
  const mins = Math.ceil((event.start.getTime() - now.getTime()) / 60_000)
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `in ${hours} hr ${rest} min` : `in ${hours} hr`
}

export function isPast(event: CalendarEvent, now: Date, today: string): boolean {
  if (event.allDay) return (event.endDate ?? event.startDate ?? today) <= today
  return event.end <= now
}
