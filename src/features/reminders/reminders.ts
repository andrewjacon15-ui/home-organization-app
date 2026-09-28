import type { CalendarEvent, Chore } from '../../types'
import { toDateKey } from '../../lib/dates'
import { withOwners } from '../calendar/views'
import { isDoneOn, occursOn } from '../chores/schedule'
import type { DisplaySettings } from '../settings/settingsApi'

export interface Reminder {
  /** Stable per trigger, so the same reminder never fires twice on a device. */
  key: string
  at: Date
  kind: 'event' | 'chore'
  title: string
  detail: string
  ownerIds: string[]
}

export type ReminderSettings = Pick<DisplaySettings, 'remindAtStart' | 'remindBeforeEnabled' | 'remindBeforeMinutes' | 'remindChoresDue'>

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function minutesLabel(n: number) {
  if (n % 60 === 0) return `${n / 60} hr`
  return n > 60 ? `${Math.floor(n / 60)} hr ${n % 60} min` : `${n} min`
}

/** Local Date for a chore's YYYY-MM-DD + HH:MM. */
export function choreDueAt(chore: Chore): Date | null {
  if (!chore.dueDate || !chore.dueTime) return null
  const [y, m, d] = chore.dueDate.split('-').map(Number)
  const [hh, mm] = chore.dueTime.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** Every reminder whose moment falls in (from, to], oldest first. All-day events never remind. */
export function remindersBetween(events: CalendarEvent[], chores: Chore[], s: ReminderSettings, from: Date, to: Date): Reminder[] {
  const out: Reminder[] = []
  const inWindow = (at: Date) => at > from && at <= to

  for (const e of withOwners(events)) {
    if (e.allDay) continue
    const startKey = e.start.getTime()
    if (s.remindBeforeEnabled && s.remindBeforeMinutes > 0) {
      const at = new Date(startKey - s.remindBeforeMinutes * 60_000)
      if (inWindow(at)) {
        out.push({ key: `e:${e.id}:${startKey}:before${s.remindBeforeMinutes}`, at, kind: 'event', title: e.title, detail: `In ${minutesLabel(s.remindBeforeMinutes)} · ${time(e.start)}`, ownerIds: e.ownerIds })
      }
    }
    if (s.remindAtStart && inWindow(e.start)) {
      out.push({ key: `e:${e.id}:${startKey}:start`, at: e.start, kind: 'event', title: e.title, detail: `Starting now · ${time(e.start)}`, ownerIds: e.ownerIds })
    }
  }

  if (s.remindChoresDue) {
    // Check each day the window touches, so repeating chores remind on every due date.
    const days = [...new Set([toDateKey(from), toDateKey(to)])]
    for (const c of chores) {
      if (!c.dueTime) continue
      for (const day of days) {
        if (!occursOn(c, day) || isDoneOn(c, day)) continue
        const at = choreDueAt({ ...c, dueDate: day })
        if (at && inWindow(at)) {
          out.push({ key: `c:${c.id}:${day}T${c.dueTime}`, at, kind: 'chore', title: c.title, detail: `Chore due · ${time(at)}`, ownerIds: c.assigneeId ? [c.assigneeId] : [] })
        }
      }
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}
