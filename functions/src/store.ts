import { AggregateField, FieldValue, type Firestore } from 'firebase-admin/firestore'
import type { AdminStore } from './admin.js'
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
      const { refreshToken, email, scope, syncDigest } = snap.data() as StoredTokens
      return { refreshToken, email, scope, ...(syncDigest ? { syncDigest } : {}) }
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
          const { refreshToken, email, scope, syncDigest } = d.data() as StoredTokens
          return { familyId, uid, tokens: { refreshToken, email, scope, ...(syncDigest ? { syncDigest } : {}) } }
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

    async saveSyncDigest(familyId, uid, digest) {
      await tokensRef(familyId, uid).set({ syncDigest: digest }, { merge: true })
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

/** The admin overview: one count/sum aggregation per collection (about one read per 1,000 documents). */
export function firestoreAdminStore(db: Firestore): AdminStore {
  return {
    async admins() {
      const list = (await db.doc('config/access').get()).get('admins')
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase()) : []
    },
    async households() {
      const families = await db.collection('families').get()
      const invites = await db.collection('householdInvites').where('usedBy', '!=', null).get()
      const ownerByFamily = new Map(invites.docs.map((d) => [d.get('familyId') as string, d.get('usedEmail') as string]))
      return Promise.all(
        families.docs.map(async (f) => {
          const sub = (name: string) => f.ref.collection(name)
          const [members, events, recipes, photos, cookbooks, owner] = await Promise.all([
            sub('members').count().get(),
            sub('events').count().get(),
            sub('recipes').count().get(),
            sub('photos').aggregate({ n: AggregateField.count(), bytes: AggregateField.sum('bytes') }).get(),
            sub('cookbooks').aggregate({ bytes: AggregateField.sum('sizeBytes') }).get(),
            ownerByFamily.has(f.id) ? Promise.resolve(null) : sub('members').doc(String(f.get('ownerId'))).get(),
          ])
          const created = f.get('createdAt')?.toDate?.() as Date | undefined
          return {
            id: f.id,
            name: String(f.get('name') ?? ''),
            ownerEmail: ownerByFamily.get(f.id) ?? (owner?.get('email') as string | undefined) ?? null,
            createdAt: created ? created.toISOString() : null,
            members: members.data().count,
            events: events.data().count,
            recipes: recipes.data().count,
            photos: photos.data().n,
            photoBytes: Number(photos.data().bytes ?? 0),
            cookbookBytes: Number(cookbooks.data().bytes ?? 0),
          }
        }),
      )
    },
  }
}
