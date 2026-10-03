import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { fromDateKey } from '../../lib/dates'
import { upcomingHolidays } from './holidays'

/**
 * families/{id}/countdowns: "Beach trip in 12 days" on Home. A one-time countdown is deleted
 * automatically the day after (TTL on expireAt); birthdays and anniversaries repeat every year.
 */
export type CountdownKind = 'once' | 'birthday' | 'anniversary'

export interface Countdown {
  id: string
  title: string
  /** YYYY-MM-DD. For a birthday or anniversary, the original date (its year gives the age). */
  date: string
  kind?: CountdownKind
}

/** A countdown as Home shows it: its next date, and a line like "turns 60". */
export interface ShownCountdown {
  id: string
  title: string
  date: string
  detail: string | null
  kind: CountdownKind | 'holiday'
  /** The saved countdown (holidays aren't saved, so they can't be removed one by one). */
  source: Countdown | null
}

const col = (familyId: string) => collection(db, 'families', familyId, 'countdowns')
const yearly = (kind: CountdownKind | undefined) => kind === 'birthday' || kind === 'anniversary'

export function watchCountdowns(familyId: string, onChange: (list: Countdown[]) => void) {
  return onSnapshot(query(col(familyId), orderBy('date')), (snap) =>
    onChange(snap.docs.map((d) => ({ id: d.id, title: d.get('title'), date: d.get('date'), kind: d.get('kind') ?? 'once' }))),
  )
}

export function addCountdown(familyId: string, userId: string, title: string, date: string, kind: CountdownKind = 'once') {
  const [y, m, d] = date.split('-').map(Number)
  return addDoc(col(familyId), {
    title: title.trim().slice(0, 80),
    date,
    createdBy: userId,
    createdAt: serverTimestamp(),
    // Birthdays and anniversaries stay; a one-time countdown goes two days after, in UTC,
    // so it outlives the day itself in every timezone.
    ...(yearly(kind) ? { kind } : { expireAt: Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d + 2))) }),
  })
}

export const removeCountdown = (familyId: string, id: string) => deleteDoc(doc(col(familyId), id))

/** Whole days from today to the date (negative once it has passed). */
export function daysUntil(date: string, today: string): number {
  return Math.round((fromDateKey(date).getTime() - fromDateKey(today).getTime()) / 86_400_000)
}

/** "Today", "Tomorrow", "12 days", "3 weeks", "5 months". */
export function untilLabel(days: number): { count: string; unit: string } {
  if (days === 0) return { count: 'Today', unit: '' }
  if (days === 1) return { count: '1', unit: 'day' }
  if (days < 60) return { count: String(days), unit: 'days' }
  if (days < 180) return { count: String(Math.round(days / 7)), unit: 'weeks' }
  return { count: String(Math.round(days / 30.4)), unit: 'months' }
}

/** One-time countdowns still ahead, soonest first (past ones hide even before the TTL removes them). */
export const upcoming = (list: Countdown[], today: string) => list.filter((c) => !yearly(c.kind) && c.date >= today).sort((a, b) => a.date.localeCompare(b.date))

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** The next time a yearly date comes round, today included. Feb 29 falls on Feb 28 in other years. */
export function nextYearly(date: string, today: string): string {
  const [, m, d] = date.split('-').map(Number)
  const on = (y: number) => `${y}-${String(m).padStart(2, '0')}-${String(m === 2 && d === 29 && !isLeap(y) ? 28 : d).padStart(2, '0')}`
  const year = Number(today.slice(0, 4))
  return on(year) >= today ? on(year) : on(year + 1)
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}

const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

/** "Mom" → "Mom’s birthday"; a title that already says what it is stays as typed. */
export function yearlyTitle(c: Countdown): string {
  if (c.kind === 'birthday') return /birthday|bday/i.test(c.title) ? c.title : `${possessive(c.title)} birthday`
  if (c.kind === 'anniversary') return /anniversary/i.test(c.title) ? c.title : `${possessive(c.title)} anniversary`
  return c.title
}

/**
 * Everything the Countdowns panel shows, soonest first: one-time countdowns, the next
 * birthday or anniversary of each saved one, and (when on) US holidays in the next `holidayDays`.
 */
export function shownCountdowns(list: Countdown[], today: string, opts: { holidays: boolean; holidayDays?: number } = { holidays: true }): ShownCountdown[] {
  const out: ShownCountdown[] = upcoming(list, today).map((c) => ({ id: c.id, title: c.title, date: c.date, detail: null, kind: 'once', source: c }))
  for (const c of list) {
    if (!yearly(c.kind)) continue
    const date = nextYearly(c.date, today)
    const years = Number(date.slice(0, 4)) - Number(c.date.slice(0, 4))
    const detail = years <= 0 ? null : c.kind === 'birthday' ? `turns ${years}` : `${ordinal(years)} anniversary`
    out.push({ id: c.id, title: yearlyTitle(c), date, detail, kind: c.kind!, source: c })
  }
  if (opts.holidays) {
    for (const h of upcomingHolidays(today, opts.holidayDays ?? 60)) out.push({ id: `holiday:${h.key}:${h.date}`, title: h.title, date: h.date, detail: null, kind: 'holiday', source: null })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}
