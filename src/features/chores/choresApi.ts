import { addDoc, collection, doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { removeDocs } from '../../lib/undo'
import { db } from '../../firebase'
import type { Chore, NewChore } from '../../types'
import { pruneCompletions, type Occurrence } from './schedule'

const choresCol = (familyId: string) => collection(db, 'families', familyId, 'chores')

export function watchChores(familyId: string, onChange: (chores: Chore[]) => void) {
  return onSnapshot(choresCol(familyId), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          title: data.title,
          assigneeId: data.assigneeId ?? null,
          dueDate: data.dueDate ?? null,
          ...(data.dueTime ? { dueTime: data.dueTime } : {}),
          done: data.done,
          points: data.points ?? 0,
          ...(data.repeat ? { repeat: data.repeat } : {}),
          ...(data.completions ? { completions: data.completions } : {}),
          ...(data.doneBy ? { doneBy: data.doneBy } : {}),
          ...(Array.isArray(data.rotation) && data.rotation.length > 1 ? { rotation: data.rotation } : {}),
        }
      }),
    )
  })
}

export function addChore(familyId: string, createdBy: string, chore: NewChore) {
  return addDoc(choresCol(familyId), { ...chore, done: false, createdBy, createdAt: serverTimestamp() })
}


export function deleteChore(familyId: string, choreId: string) {
  return removeDocs([doc(choresCol(familyId), choreId)])
}

/**
 * Checks off (or un-checks) one occurrence and credits (or removes) its stars in one write.
 * Stars go to the chore's person, or to whoever did an Up for Grabs chore.
 */
export async function setOccurrenceDone(familyId: string, o: Occurrence, done: boolean, doneBy: string | null, userId: string, today: string) {
  const c = o.chore
  const batch = writeBatch(db)
  const ref = doc(choresCol(familyId), c.id)
  const who = c.assigneeId ?? doneBy
  if (c.repeat) {
    const next = { ...(c.completions ?? {}) }
    if (done) next[o.date] = doneBy ?? c.assigneeId ?? ''
    else delete next[o.date]
    batch.update(ref, { completions: pruneCompletions(next, today) })
  } else {
    batch.update(ref, { done, doneBy: done ? doneBy : null })
  }
  // One star entry per occurrence (one-offs keep the original chore_<id> key).
  const entry = doc(db, 'families', familyId, 'stars', c.repeat ? `chore_${c.id}_${o.date}` : `chore_${c.id}`)
  if (who && c.points > 0) {
    if (done) batch.set(entry, { memberId: who, delta: c.points, reason: `Chore: ${c.title}`.slice(0, 200), choreId: c.id, createdBy: userId, createdAt: serverTimestamp() })
    else batch.delete(entry)
  }
  await batch.commit()
}
