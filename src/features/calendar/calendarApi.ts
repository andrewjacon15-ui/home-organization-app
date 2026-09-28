import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import type { CalendarEvent, NewManualEvent } from '../../types'

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
          title: data.title,
          start: (data.start as Timestamp).toDate(),
          end: (data.end as Timestamp).toDate(),
          allDay: Boolean(data.allDay),
          ...(data.startDate ? { startDate: data.startDate, endDate: data.endDate } : {}),
          ...(data.location ? { location: data.location } : {}),
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
  return deleteDoc(doc(eventsCol(familyId), eventId))
}

export const connectCalendar = (familyId: string, code: string) =>
  httpsCallable<{ familyId: string; code: string }, { email: string }>(functions, 'connectCalendar')({ familyId, code })

export const syncMyCalendar = (familyId: string) => httpsCallable(functions, 'syncMyCalendar')({ familyId })

export const disconnectCalendar = (familyId: string) => httpsCallable(functions, 'disconnectCalendar')({ familyId })
