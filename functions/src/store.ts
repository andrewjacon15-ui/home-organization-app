import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import type { FeedCalendar, FeedStore } from './feeds.js'
import type { CalendarStatus, CalendarStore, EventDoc, StoredCalendar, StoredTokens } from './types.js'

const BATCH_LIMIT = 400

async function inBatches<T>(db: Firestore, items: T[], apply: (batch: FirebaseFirestore.WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = db.batch()
    for (const item of items.slice(i, i + BATCH_LIMIT)) apply(batch, item)
    await batch.commit()
  }
}

/** Admin SDK implementation. Bypasses security rules, which is why tokens live only here. */
export function firestoreStore(db: Firestore): CalendarStore {
  const memberRef = (familyId: string, uid: string) => db.doc(`families/${familyId}/members/${uid}`)
  const tokensRef = (familyId: string, uid: string) => db.doc(`families/${familyId}/members/${uid}/private/tokens`)
  const eventsCol = (familyId: string) => db.collection(`families/${familyId}/events`)
  const calendarsCol = (familyId: string) => db.collection(`families/${familyId}/calendars`)

  return {
    async isMember(familyId, uid) {
      return (await memberRef(familyId, uid).get()).exists
    },

    async getTokens(familyId, uid) {
      const snap = await tokensRef(familyId, uid).get()
      if (!snap.exists) return null
      const { refreshToken, email, scope } = snap.data() as StoredTokens
      return { refreshToken, email, scope }
    },

    async saveTokens(familyId, uid, tokens) {
      await tokensRef(familyId, uid).set({ ...tokens, updatedAt: FieldValue.serverTimestamp() })
    },

    async deleteTokens(familyId, uid) {
      await tokensRef(familyId, uid).delete()
    },

    async listConnected() {
      const snap = await db.collectionGroup('private').get()
      return snap.docs
        .filter((d) => d.id === 'tokens')
        .map((d) => {
          // families/{familyId}/members/{uid}/private/tokens
          const [, familyId, , uid] = d.ref.path.split('/')
          const { refreshToken, email, scope } = d.data() as StoredTokens
          return { familyId, uid, tokens: { refreshToken, email, scope } }
        })
    },

    async listGoogleEventIds(familyId, uid) {
      const snap = await eventsCol(familyId).where('sourceUserId', '==', uid).where('source', '==', 'google').select().get()
      return snap.docs.map((d) => d.id)
    },

    async listGoogleEvents(familyId, uid) {
      const snap = await eventsCol(familyId).where('sourceUserId', '==', uid).where('source', '==', 'google').get()
      const out = new Map<string, EventDoc>()
      for (const d of snap.docs) {
        const x = d.data()
        out.set(d.id, { ...(x as EventDoc), start: x.start?.toDate?.() ?? x.start, end: x.end?.toDate?.() ?? x.end })
      }
      return out
    },

    async getCalendarStatus(familyId, uid) {
      const s = (await memberRef(familyId, uid).get()).get('calendar') as (CalendarStatus & { lastSyncAt?: { toDate?: () => Date } }) | undefined
      if (!s) return null
      return s.status === 'connected' ? { ...s, lastSyncAt: s.lastSyncAt?.toDate?.() ?? new Date(0) } : s
    },

    async upsertEvents(familyId, events) {
      await inBatches(db, events, (batch, { id, data }) =>
        batch.set(eventsCol(familyId).doc(id), { ...data, updatedAt: FieldValue.serverTimestamp() }),
      )
    },

    async deleteEvents(familyId, ids) {
      await inBatches(db, ids, (batch, id) => batch.delete(eventsCol(familyId).doc(id)))
    },

    async listCalendars(familyId, uid) {
      const snap = await calendarsCol(familyId).where('ownerId', '==', uid).get()
      return snap.docs.map((d) => ({ ...(d.data() as Omit<StoredCalendar, 'key'>), key: d.id }))
    },

    async upsertCalendars(familyId, calendars) {
      await inBatches(db, calendars, (batch, { key, ...data }) => batch.set(calendarsCol(familyId).doc(key), data))
    },

    async deleteCalendars(familyId, keys) {
      await inBatches(db, keys, (batch, key) => batch.delete(calendarsCol(familyId).doc(key)))
    },

    async setCalendarStatus(familyId, uid, status) {
      await memberRef(familyId, uid).update({ calendar: status ?? FieldValue.delete() })
    },
  }
}

const toDate = (v: unknown): Date | null => (v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null)

/** Calendar links: calendar docs with kind 'ics', and their events. */
export function firestoreFeedStore(db: Firestore): FeedStore {
  const eventsCol = (familyId: string) => db.collection(`families/${familyId}/events`)
  const calendarsCol = (familyId: string) => db.collection(`families/${familyId}/calendars`)
  const asFeed = (d: FirebaseFirestore.DocumentSnapshot): FeedCalendar => {
    const x = d.data() as FeedCalendar
    return { ...x, key: d.id, lastSyncAt: toDate(x.lastSyncAt) }
  }

  return {
    async isMember(familyId, uid) {
      return (await db.doc(`families/${familyId}/members/${uid}`).get()).exists
    },
    async familyTimezone(familyId) {
      const tz = (await db.doc(`families/${familyId}`).get()).get('timezone')
      return typeof tz === 'string' && tz ? tz : null
    },
    async listFeeds() {
      const snap = await db.collectionGroup('calendars').where('kind', '==', 'ics').get()
      // families/{familyId}/calendars/{key}
      return snap.docs.map((d) => ({ familyId: d.ref.path.split('/')[1], feed: asFeed(d) }))
    },
    async getFeed(familyId, key) {
      const snap = await calendarsCol(familyId).doc(key).get()
      return snap.exists && snap.get('kind') === 'ics' ? asFeed(snap) : null
    },
    async saveFeed(familyId, { key, lastSyncAt, ...data }) {
      await calendarsCol(familyId).doc(key).set({ ...data, ...(lastSyncAt ? { lastSyncAt } : {}) })
    },
    async setFeedStatus(familyId, key, status) {
      await calendarsCol(familyId).doc(key).set(status, { merge: true })
    },
    async deleteFeed(familyId, key) {
      await calendarsCol(familyId).doc(key).delete()
    },
    async listFeedEvents(familyId, key) {
      const snap = await eventsCol(familyId).where('calendarKey', '==', key).where('source', '==', 'ics').get()
      const out = new Map<string, EventDoc>()
      for (const d of snap.docs) {
        const x = d.data()
        out.set(d.id, { ...(x as EventDoc), start: x.start?.toDate?.() ?? x.start, end: x.end?.toDate?.() ?? x.end })
      }
      return out
    },
    async upsertEvents(familyId, events) {
      await inBatches(db, events, (batch, { id, data }) => batch.set(eventsCol(familyId).doc(id), { ...data, updatedAt: FieldValue.serverTimestamp() }))
    },
    async deleteEvents(familyId, ids) {
      await inBatches(db, ids, (batch, id) => batch.delete(eventsCol(familyId).doc(id)))
    },
  }
}
