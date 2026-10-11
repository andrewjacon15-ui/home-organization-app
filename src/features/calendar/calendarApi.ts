import { removeDocs } from '../../lib/undo'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import type { CalendarEvent, NewManualEvent, SyncedCalendar } from '../../types'

const eventsCol = (familyId: string) => collection(db, 'families', familyId, 'events')

/** Events starting in [from - lookbackDays, to). The lookback catches multi-day events that began earlier. */
export function watchEvents(familyId: string, from: Date, to: Date, onChange: (events: CalendarEvent[]) => void, lookbackDays = 14) {
  const since = new Date(from.getTime() - lookbackDays * 86_400_000)
  const q = query(eventsCol(familyId), where('start', '>=', Timestamp.fromDate(since)), where('start', '<', Timestamp.fromDate(to)))
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          source: data.source,
          sourceUserId: data.sourceUserId,
          ...(Array.isArray(data.memberIds) ? { memberIds: data.memberIds } : {}),
          ...(data.calendarKey ? { calendarKey: data.calendarKey } : {}),
          title: data.title,
          start: (data.start as Timestamp).toDate(),
          end: (data.end as Timestamp).toDate(),
          allDay: Boolean(data.allDay),
          ...(data.startDate ? { startDate: data.startDate, endDate: data.endDate } : {}),
          ...(data.location ? { location: data.location } : {}),
          ...(typeof data.htmlLink === 'string' && data.htmlLink.startsWith('https://') ? { htmlLink: data.htmlLink } : {}),
        }
      }),
    )
  })
}

export function addManualEvent(familyId: string, userId: string, event: NewManualEvent) {
  const { start, end, startDate, endDate, memberIds, ...rest } = event
  return addDoc(eventsCol(familyId), {
    ...rest,
    ...(memberIds?.length ? { memberIds } : {}),
    ...(startDate ? { startDate, endDate } : {}),
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
    source: 'manual',
    sourceUserId: userId,
    createdAt: serverTimestamp(),
  })
}

export function deleteManualEvent(familyId: string, eventId: string) {
  return removeDocs([doc(eventsCol(familyId), eventId)])
}

export const connectCalendar = (familyId: string, code: string) =>
  httpsCallable<{ familyId: string; code: string }, { email: string }>(functions, 'connectCalendar')({ familyId, code })

export const syncMyCalendar = (familyId: string) => httpsCallable(functions, 'syncMyCalendar')({ familyId })

export const disconnectCalendar = (familyId: string) => httpsCallable(functions, 'disconnectCalendar')({ familyId })

const calendarsCol = (familyId: string) => collection(db, 'families', familyId, 'calendars')

/** Everyone's synced Google calendars, primary first then by name. */
export function watchCalendars(familyId: string, onChange: (calendars: SyncedCalendar[]) => void) {
  return onSnapshot(calendarsCol(familyId), (snap) => {
    const list = snap.docs.map((d) => {
      const data = d.data()
      const synced = data.lastSyncAt as Timestamp | undefined
      return { ...(data as Omit<SyncedCalendar, 'key'>), key: d.id, ...(synced ? { lastSyncAt: synced.toDate() } : {}) }
    })
    list.sort((a, b) => Number(b.primary) - Number(a.primary) || (a.alias || a.name).localeCompare(b.alias || b.name))
    onChange(list)
  })
}

/** Adds a calendar link (.ics / webcal); the server checks it works and brings its events in. */
export const addCalendarFeed = (familyId: string, url: string, name: string, memberIds: string[], color: string) =>
  httpsCallable<object, { key: string; name: string; eventCount: number }>(functions, 'addCalendarFeed')({ familyId, url, name, memberIds, color }).then((r) => r.data)

export const refreshCalendarFeed = (familyId: string, key: string) => httpsCallable(functions, 'refreshCalendarFeed')({ familyId, key })

export const removeCalendarFeed = (familyId: string, key: string) => httpsCallable(functions, 'removeCalendarFeed')({ familyId, key })

/** Show/hide, recolor, rename, or reassign one of your own calendars. */
export function updateCalendar(familyId: string, key: string, changes: Partial<Pick<SyncedCalendar, 'enabled' | 'color' | 'alias' | 'memberIds'>>) {
  return updateDoc(doc(calendarsCol(familyId), key), changes)
}
