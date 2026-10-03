import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { fromDateKey } from '../../lib/dates'

/** families/{id}/countdowns: "Beach trip in 12 days" on Home. Deleted automatically the day after (TTL on expireAt). */
export interface Countdown {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
}

const col = (familyId: string) => collection(db, 'families', familyId, 'countdowns')

export function watchCountdowns(familyId: string, onChange: (list: Countdown[]) => void) {
  return onSnapshot(query(col(familyId), orderBy('date')), (snap) => onChange(snap.docs.map((d) => ({ id: d.id, title: d.get('title'), date: d.get('date') }))))
}

export function addCountdown(familyId: string, userId: string, title: string, date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return addDoc(col(familyId), {
    title: title.trim().slice(0, 80),
    date,
    createdBy: userId,
    createdAt: serverTimestamp(),
    // Two days after, in UTC, so it outlives the day itself in every timezone.
    expireAt: Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d + 2))),
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

/** Upcoming countdowns, soonest first (past ones hide even before the TTL removes them). */
export const upcoming = (list: Countdown[], today: string) => list.filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))
