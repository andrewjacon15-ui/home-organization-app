import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import type { getStorage } from 'firebase-admin/storage'
import type { BookDoc, BookFiles, CookbookStore, ParseState } from './cookbooks.js'

const BATCH = 400

/** Admin SDK implementation (bypasses rules; the callables check membership first). */
export function firestoreCookbookStore(db: Firestore): CookbookStore {
  const book = (f: string, b: string) => db.doc(`families/${f}/cookbooks/${b}`)
  const state = (f: string, b: string) => db.doc(`families/${f}/cookbooks/${b}/work/state`)
  const recipes = (f: string) => db.collection(`families/${f}/recipes`)

  return {
    async isMember(f, uid) {
      return (await db.doc(`families/${f}/members/${uid}`).get()).exists
    },
    async getBook(f, b) {
      const snap = await book(f, b).get()
      return snap.exists ? (snap.data() as BookDoc) : null
    },
    async updateBook(f, b, changes) {
      await book(f, b).set({ ...changes, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    },
    async getState(f, b) {
      const snap = await state(f, b).get()
      return snap.exists ? (snap.data() as ParseState) : null
    },
    async setState(f, b, s) {
      await state(f, b).set(s)
    },
    async claim(f, b, runId, next, until, now) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(state(f, b))
        const s = snap.data() as ParseState | undefined
        if (!s || s.runId !== runId || s.next !== next || s.phase !== 'parsing' || (s.lease && s.lease.until > now)) return null
        const claimed: ParseState = { ...s, lease: { next, until } }
        tx.set(state(f, b), claimed)
        return claimed
      })
    },
    async keptRecipeIds(f, ids) {
      if (!ids.length) return new Set()
      const snaps = await db.getAll(...ids.map((id) => recipes(f).doc(id)))
      return new Set(snaps.filter((s) => s.exists && (s.get('edited') || s.get('favorite'))).map((s) => s.id))
    },
    async writeRecipes(f, list) {
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = db.batch()
        for (const r of list.slice(i, i + BATCH)) batch.set(recipes(f).doc(r.id), { ...r.data, createdAt: FieldValue.serverTimestamp() })
        await batch.commit()
      }
    },
    async deleteBookRecipes(f, bookId, keepEdited) {
      const snap = await recipes(f).where('source.bookId', '==', bookId).get()
      const doomed = snap.docs.filter((d) => !(keepEdited && (d.get('edited') || d.get('favorite'))))
      for (let i = 0; i < doomed.length; i += BATCH) {
        const batch = db.batch()
        for (const d of doomed.slice(i, i + BATCH)) batch.delete(d.ref)
        await batch.commit()
      }
      return doomed.length
    },
    async countBookRecipes(f, bookId) {
      const mine = recipes(f).where('source.bookId', '==', bookId)
      const [total, review] = await Promise.all([mine.count().get(), mine.where('needsReview', '==', true).count().get()])
      return { total: total.data().count, review: review.data().count }
    },
    async deleteBook(f, b) {
      await state(f, b).delete()
      await book(f, b).delete()
    },
    async listParsing(olderThan) {
      const out: { familyId: string; bookId: string; state: ParseState }[] = []
      for (const fam of (await db.collection('families').select().get()).docs) {
        const books = await fam.ref.collection('cookbooks').where('status', 'in', ['queued', 'parsing']).select().get()
        for (const b of books.docs) {
          const s = (await state(fam.id, b.id).get()).data() as ParseState | undefined
          if (s && s.phase === 'parsing' && s.updatedAt < olderThan) out.push({ familyId: fam.id, bookId: b.id, state: s })
        }
      }
      return out
    },
  }
}

/** Cloud Storage for the original files and covers. */
export function storageBookFiles(storage: ReturnType<typeof getStorage>): BookFiles {
  const bucket = storage.bucket()
  return {
    async read(path) {
      const [data] = await bucket.file(path).download()
      return data
    },
    async write(path, data, contentType) {
      await bucket.file(path).save(data, { contentType, resumable: false, metadata: { cacheControl: 'public, max-age=86400' } })
    },
    async remove(prefix) {
      await bucket.deleteFiles({ prefix })
    },
  }
}
