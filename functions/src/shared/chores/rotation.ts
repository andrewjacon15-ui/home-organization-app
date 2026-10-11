/**
 * Chore rotations: a repeating chore that takes turns between people ("trash: Sam, then
 * Lydia, then Max"). Each time it comes due, the next person in the list has it. Shared by
 * the app and the reminder emails so both agree on whose turn it is.
 */

export interface RotationRepeat {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  /** Weekly: which weekdays (0 = Sunday). Defaults to the start date's weekday. */
  days?: number[]
}

export interface RotatingChore {
  assigneeId: string | null
  /** YYYY-MM-DD: the first time it's due. */
  dueDate: string | null
  repeat?: RotationRepeat | null
  /** Member ids, in turn order (two or more). */
  rotation?: string[] | null
}

const DAY = 86_400_000
const utc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const weekday = (key: string) => new Date(utc(key)).getUTCDay()
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY)
const months = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/**
 * How many times the chore came due before `key` (0 for the first time), assuming `key` is
 * one of its due dates. Weeks start on Sunday, as in the schedule.
 */
export function turnIndex(repeat: RotationRepeat, anchor: string, key: string): number {
  const n = Math.max(1, repeat.interval)
  if (key <= anchor) return 0
  if (repeat.freq === 'daily') return Math.floor(daysBetween(anchor, key) / n)
  if (repeat.freq === 'monthly') return Math.floor(months(anchor, key) / n)
  const days = [...new Set(repeat.days?.length ? repeat.days : [weekday(anchor)])].sort()
  const weeks = Math.round(daysBetween(anchor, key) / 7 + (weekday(anchor) - weekday(key)) / 7)
  const active = Math.floor(weeks / n)
  // The first week only has the days on or after the start date.
  const firstWeek = days.filter((d) => d >= weekday(anchor)).length
  const before = days.filter((d) => d < weekday(key)).length
  if (active === 0) return before - (days.length - firstWeek)
  return firstWeek + (active - 1) * days.length + before
}

/** Whose turn it is on `key`: the rotation's person for that time, or the chore's usual person. */
export function assigneeOn<C extends RotatingChore>(chore: C, key: string): string | null {
  const people = chore.rotation
  if (!chore.repeat || !chore.dueDate || !people || people.length < 2) return chore.assigneeId
  const i = turnIndex(chore.repeat, chore.dueDate, key)
  return people[((i % people.length) + people.length) % people.length] ?? chore.assigneeId
}

/** The chore as it is on `key`, with that day's person in assigneeId. */
export function onTurn<C extends RotatingChore>(chore: C, key: string): C {
  const who = assigneeOn(chore, key)
  return who === chore.assigneeId ? chore : { ...chore, assigneeId: who }
}
