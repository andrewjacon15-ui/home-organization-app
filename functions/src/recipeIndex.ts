/**
 * Keeps families/{f}/recipeIndex/{shard} in step with families/{f}/recipes/{id}.
 * Each shard holds `e: { [recipeId]: IndexEntry }`; `meta` holds the index version.
 * Writes that don't change a recipe's entry (an updatedAt bump, a steps edit) skip the
 * index entirely, so they cost nothing extra.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { INDEX_SHARDS, INDEX_VERSION, sameEntry, shardOf, toIndexEntry, type IndexEntry } from './shared/recipes/catalogIndex.js'

/** What the trigger should do for one recipe write: nothing, put an entry, or remove it. */
export function indexChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { op: 'none' } | { op: 'put'; entry: IndexEntry } | { op: 'remove' } {
  if (!after) return before ? { op: 'remove' } : { op: 'none' }
  const next = toIndexEntry(after)
  if (before && sameEntry(toIndexEntry(before), next)) return { op: 'none' }
  return { op: 'put', entry: next }
}

const indexCol = (db: Firestore, familyId: string) => db.collection(`families/${familyId}/recipeIndex`)

/** Applies one change; retried a few times because a big cookbook import writes many at once. */
export async function applyIndexChange(db: Firestore, familyId: string, recipeId: string, change: ReturnType<typeof indexChange>) {
  if (change.op === 'none') return
  const ref = indexCol(db, familyId).doc(shardOf(recipeId))
  const value = change.op === 'put' ? change.entry : FieldValue.delete()
  for (let attempt = 0; ; attempt++) {
    try {
      await ref.set({ e: { [recipeId]: value } }, { merge: true })
      return
    } catch (e) {
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.random() * 200))
    }
  }
}

/** Rebuilds the whole index from the recipes (first run, or after INDEX_VERSION changes). */
export async function rebuildIndex(db: Firestore, familyId: string): Promise<number> {
  const shards: Record<string, Record<string, IndexEntry>> = {}
  for (let i = 0; i < INDEX_SHARDS; i++) shards[`s${i}`] = {}
  // select() keeps the read light: only the fields the index uses.
  const snap = await db
    .collection(`families/${familyId}/recipes`)
    .select('title', 'items', 'tags', 'totalMinutes', 'minutes', 'source', 'favorite', 'needsReview', 'rating', 'servings')
    .get()
  for (const d of snap.docs) shards[shardOf(d.id)][d.id] = toIndexEntry(d.data())
  const batch = db.batch()
  // Empty shards are removed, not stored: every shard document is a read each time the catalog opens.
  for (const [id, e] of Object.entries(shards)) {
    if (Object.keys(e).length) batch.set(indexCol(db, familyId).doc(id), { e })
    else batch.delete(indexCol(db, familyId).doc(id))
  }
  batch.set(indexCol(db, familyId).doc('meta'), { v: INDEX_VERSION, count: snap.size, builtAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return snap.size
}
