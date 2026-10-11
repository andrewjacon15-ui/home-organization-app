import { addDays, daysBetween, fromDateKey, startOfWeek } from '../../lib/dates'
import { onTurn } from '@shared/chores/rotation.js'
import type { Chore, ChoreRepeat } from '../../types'

/** One chore on one day. For repeating chores each date is its own occurrence; a rotating chore's assigneeId is whoever's turn that date is. */
export interface Occurrence {
  chore: Chore
  /** The date this occurrence was due (may be before the day being shown, if it's late). */
  date: string
  done: boolean
  /** Who did it (for "up for grabs" chores, and repeating chores). */
  doneBy: string | null
}

const weekday = (key: string) => fromDateKey(key).getDay()
const WEEKDAYS = [1, 2, 3, 4, 5]

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Whether a chore is due on `key` (YYYY-MM-DD). */
export function occursOn(chore: Chore, key: string): boolean {
  const r = chore.repeat
  if (!r) return chore.dueDate === key
  const anchor = chore.dueDate
  if (!anchor || key < anchor) return false
  const n = Math.max(1, r.interval)
  switch (r.freq) {
    case 'daily':
      return daysBetween(anchor, key) % n === 0
    case 'weekly': {
      const days = r.days?.length ? r.days : [weekday(anchor)]
      if (!days.includes(weekday(key))) return false
      return Math.round(daysBetween(startOfWeek(anchor), startOfWeek(key)) / 7) % n === 0
    }
    case 'monthly': {
      if (monthsBetween(anchor, key) % n !== 0) return false
      const want = fromDateKey(anchor).getDate()
      const d = fromDateKey(key)
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      return d.getDate() === Math.min(want, lastDay)
    }
  }
}

export function isDoneOn(chore: Chore, key: string): boolean {
  return chore.repeat ? !!chore.completions && key in chore.completions : chore.done
}

function occ(base: Chore, date: string): Occurrence {
  const chore = onTurn(base, date)
  const done = isDoneOn(chore, date)
  const doneBy = chore.repeat ? (chore.completions?.[date] || null) : (chore.doneBy ?? null)
  return { chore, date, done, doneBy }
}

/** The most recent due date before `today` (within a month), if any. */
function lastBefore(chore: Chore, today: string): string | null {
  for (let i = 1; i <= 31; i++) {
    const d = addDays(today, -i)
    if (occursOn(chore, d)) return d
  }
  return null
}

/**
 * What to show on `day`. On today this also carries forward anything still undone:
 * one-off chores that are overdue, undated "anytime" chores, and a repeating chore's
 * most recent missed occurrence (unless it's due again today).
 */
export function occurrencesOn(chores: Chore[], day: string, today: string): Occurrence[] {
  const out: Occurrence[] = []
  for (const c of chores) {
    if (occursOn(c, day)) {
      out.push(occ(c, day))
      continue
    }
    if (day !== today) continue
    if (!c.repeat) {
      if (!c.dueDate) out.push(occ(c, today)) // anytime
      else if (c.dueDate < today && !c.done) out.push(occ(c, c.dueDate)) // overdue
    } else {
      const last = lastBefore(c, today)
      if (last && !isDoneOn(c, last)) out.push(occ(c, last))
    }
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || (a.chore.dueTime ?? '99').localeCompare(b.chore.dueTime ?? '99') || a.chore.title.localeCompare(b.chore.title))
}

/** When an occurrence is due: its time that day, or the end of the day. */
export function dueAt(o: Occurrence): Date {
  const d = fromDateKey(o.date)
  if (o.chore.dueTime) {
    const [h, m] = o.chore.dueTime.split(':').map(Number)
    d.setHours(h, m, 0, 0)
  } else {
    d.setHours(23, 59, 59, 999)
  }
  return d
}

const time = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "9 hours late", "6 days late", "Today · 8:00 AM", "Tomorrow", "Anytime". */
export function dueLabel(o: Occurrence, now: Date, today: string): { text: string; late: boolean } {
  if (!o.chore.dueDate && !o.chore.repeat) return { text: 'Anytime', late: false }
  if (!o.done) {
    const ms = now.getTime() - dueAt(o).getTime()
    if (ms > 0) {
      if (o.date < today) {
        const days = Math.max(1, daysBetween(o.date, today))
        return { text: `${days} day${days === 1 ? '' : 's'} late`, late: true }
      }
      const mins = Math.floor(ms / 60_000)
      if (mins < 60) return { text: `${Math.max(1, mins)} min late`, late: true }
      const hours = Math.floor(mins / 60)
      return { text: `${hours} hour${hours === 1 ? '' : 's'} late`, late: true }
    }
  }
  const day = o.date === today ? 'Today' : o.date === addDays(today, 1) ? 'Tomorrow' : fromDateKey(o.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return { text: o.chore.dueTime ? `${day} · ${time(o.chore.dueTime)}` : day, late: false }
}

const DAY_NAMES = [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'short' }))

/** "Every day", "Weekdays", "Every 2 weeks on Sun, Wed", "Every month". */
export function repeatLabel(r: ChoreRepeat | null | undefined): string | null {
  if (!r) return null
  const n = r.interval
  if (r.freq === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`
  if (r.freq === 'monthly') return n === 1 ? 'Every month' : `Every ${n} months`
  const days = [...(r.days ?? [])].sort()
  if (n === 1 && days.length === 5 && WEEKDAYS.every((d) => days.includes(d))) return 'Weekdays'
  if (n === 1 && days.length === 7) return 'Every day'
  const on = days.length ? ` on ${days.map((d) => DAY_NAMES[d]).join(', ')}` : ''
  return (n === 1 ? 'Every week' : `Every ${n} weeks`) + on
}

/** "Takes turns: Sam, Lydia, Max" for a rotating chore (first names), or null. */
export function rotationLabel(chore: Chore, names: Map<string, string>): string | null {
  if (!chore.repeat || !chore.rotation || chore.rotation.length < 2) return null
  return `Takes turns: ${chore.rotation.map((id) => (names.get(id) ?? 'someone').split(' ')[0]).join(', ')}`
}

/** Keeps the completions map small: only the last ~90 days. */
export function pruneCompletions(completions: Record<string, string>, today: string): Record<string, string> {
  const cutoff = addDays(today, -90)
  return Object.fromEntries(Object.entries(completions).filter(([k]) => k >= cutoff))
}

export type RepeatChoice = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'

/** The add-chore form's repeat menu as a stored rule. */
export function toRepeat(choice: RepeatChoice, days: number[]): ChoreRepeat | null {
  switch (choice) {
    case 'none':
      return null
    case 'daily':
      return { freq: 'daily', interval: 1 }
    case 'weekdays':
      return { freq: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] }
    case 'weekly':
      return { freq: 'weekly', interval: 1, days: [...days].sort() }
    case 'biweekly':
      return { freq: 'weekly', interval: 2, days: [...days].sort() }
    case 'monthly':
      return { freq: 'monthly', interval: 1 }
  }
}
