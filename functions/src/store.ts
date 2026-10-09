import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { measureFiles, type AdminStore, type StoredFile } from './admin.js'
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

/** Where household files live (Cloud Storage), for the admin overview. */
export interface AdminFiles {
  list(prefix: string): Promise<StoredFile[]>
  removeAll(prefix: string): Promise<void>
}

/**
 * The admin overview: one count/sum aggregation per collection (about one read per 1,000
 * documents), plus the household's files measured in Storage, which is exact even for photos
 * uploaded before the app recorded their size. Those photos get their size filled in here, so
 * the Photos page's storage readout counts them too.
 */
export function firestoreAdminStore(db: Firestore, files: AdminFiles): AdminStore {
  const family = (id: string) => db.doc(`families/${id}`)
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
          // Count photos on their own: a count in the same query as sum('bytes') only counts
          // photos that have a size, which hid every photo uploaded before sizes were recorded.
          const [members, events, recipes, photos, sized, stored] = await Promise.all([
            sub('members').get(),
            sub('events').count().get(),
            sub('recipes').count().get(),
            sub('photos').count().get(),
            sub('photos').where('bytes', '>=', 0).count().get(),
            files.list(`families/${f.id}/`),
          ])
          const measured = measureFiles(f.id, stored)
          // Photos uploaded before sizes were recorded: fill their size in once from the stored files,
          // so the Photos page's storage readout counts them too.
          if (photos.data().count > sized.data().count) {
            const unsized = (await sub('photos').select('bytes', 'storagePath').get()).docs.filter((d) => typeof d.get('bytes') !== 'number')
            await inBatches(db, unsized, (batch, d) => {
              const id = String(d.get('storagePath') ?? '').split('/').pop()?.replace(/\.[^.]+$/, '') ?? d.id
              const bytes = measured.photoSizes.get(id) ?? measured.photoSizes.get(d.id)
              if (bytes != null) batch.update(d.ref, { bytes: Math.min(bytes, 300 * 1024 * 1024) })
            })
          }
          const ownerId = String(f.get('ownerId') ?? '')
          const people = members.docs.map((m) => ({
            id: m.id,
            name: String(m.get('displayName') ?? ''),
            email: typeof m.get('email') === 'string' ? (m.get('email') as string) : null,
            owner: m.id === ownerId,
          }))
          people.sort((x, y) => Number(y.owner) - Number(x.owner) || x.name.localeCompare(y.name))
          const created = f.get('createdAt')?.toDate?.() as Date | undefined
          return {
            id: f.id,
            name: String(f.get('name') ?? ''),
            ownerEmail: ownerByFamily.get(f.id) ?? people.find((p) => p.owner)?.email ?? null,
            createdAt: created ? created.toISOString() : null,
            members: members.size,
            people,
            events: events.data().count,
            recipes: recipes.data().count,
            photos: photos.data().count,
            photoBytes: measured.photoBytes,
            cookbookBytes: measured.cookbookBytes,
            otherBytes: measured.otherBytes,
          }
        }),
      )
    },
    async householdOwner(id) {
      const snap = await family(id).get()
      return snap.exists ? ((snap.get('ownerId') as string | undefined) ?? null) : undefined
    },
    async searchesThisMonth(month) {
      return Number((await db.doc(`apiUsage/brave_${month}`).get()).get('count') ?? 0)
    },
    async creators() {
      const list = (await db.doc('config/access').get()).get('familyCreators')
      return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
    },
    async setCreators(emails) {
      await db.doc('config/access').set({ familyCreators: emails }, { merge: true })
    },
    async member(id, uid) {
      const snap = await db.doc(`families/${id}/members/${uid}`).get()
      return snap.exists ? { email: typeof snap.get('email') === 'string' ? (snap.get('email') as string).toLowerCase() : null } : null
    },
    async removeMember(id, uid, email) {
      if (email) {
        const invite = db.doc(`invites/${email}`)
        if ((await invite.get()).get('familyId') === id) await invite.delete()
      }
      await db.recursiveDelete(db.doc(`families/${id}/members/${uid}`))
    },
    async householdName(id) {
      const snap = await family(id).get()
      return snap.exists ? String(snap.get('name') ?? '') : null
    },
    async isMember(id, uid) {
      return (await db.doc(`families/${id}/members/${uid}`).get()).exists
    },
    async rename(id, name) {
      await family(id).update({ name })
    },
    async remove(id) {
      const invites = await db.collection('invites').where('familyId', '==', id).get()
      await inBatches(db, invites.docs, (batch, d) => batch.delete(d.ref))
      await files.removeAll(`families/${id}/`)
      await db.recursiveDelete(family(id))
    },
  }
}
