import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import type { HostRecord, HostStore } from './web/fetcher.js'
import type { WebRecipeStore } from './webRecipes.js'

/** crawlHosts/{host}: robots.txt cache and request spacing (server-only; rules deny clients). */
export function firestoreHostStore(db: Firestore): HostStore {
  const ref = (host: string) => db.collection('crawlHosts').doc(host.replace(/[^a-z0-9.-]/gi, '_').slice(0, 200))
  return {
    async get(host) {
      const snap = await ref(host).get()
      if (!snap.exists) return null
      const d = snap.data() as Partial<HostRecord>
      return { robots: d.robots ?? null, robotsAt: d.robotsAt ?? 0 }
    },
    async saveRobots(host, robots, at) {
      await ref(host).set({ robots, robotsAt: at }, { merge: true })
    },
    async reserve(host, now, gap) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(host))
        const last = (snap.get('lastAt') as number | undefined) ?? 0
        const start = Math.max(now, last + gap)
        tx.set(ref(host), { lastAt: start }, { merge: true })
        return start
      })
    },
  }
}

export function firestoreWebRecipeStore(db: Firestore): WebRecipeStore {
  const recipe = (f: string, id: string) => db.doc(`families/${f}/recipes/${id}`)
  return {
    async isMember(f, uid) {
      return (await db.doc(`families/${f}/members/${uid}`).get()).exists
    },
    async getRecipeFlags(f, id) {
      const snap = await recipe(f, id).get()
      if (!snap.exists) return null
      return { edited: snap.get('edited') === true, favorite: snap.get('favorite') === true, tagsEdited: snap.get('tagsEdited') === true }
    },
    async saveRecipe(f, id, data) {
      await recipe(f, id).set({ ...data, updatedAt: FieldValue.serverTimestamp(), ...(data.createdBy ? { createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true })
    },
  }
}
