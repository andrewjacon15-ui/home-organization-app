import { createContext, useContext } from 'react'
import { getDoc, writeBatch, type DocumentReference } from 'firebase/firestore'
import { db } from '../firebase'

/** Puts back what a delete removed. */
export type Restore = () => Promise<void>

export interface UndoValue {
  /** Shows "message · Undo" for a few seconds; Undo runs `restore`. */
  offer: (message: string, restore: Restore) => void
}

export const UndoContext = createContext<UndoValue>({ offer: () => undefined })

/** Deletes happen at once and offer Undo, instead of asking "Are you sure?" first. */
export const useUndo = () => useContext(UndoContext)

const BATCH = 400

/**
 * Deletes documents and returns how to put them back exactly as they were (same ids, same
 * fields). Each is read first, which the device's cache usually answers without a charge.
 */
export async function removeDocs(refs: DocumentReference[]): Promise<Restore> {
  const snaps = await Promise.all(refs.map((r) => getDoc(r)))
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db)
    refs.slice(i, i + BATCH).forEach((r) => batch.delete(r))
    await batch.commit()
  }
  const kept = snaps.filter((s) => s.exists())
  return async () => {
    for (let i = 0; i < kept.length; i += BATCH) {
      const batch = writeBatch(db)
      kept.slice(i, i + BATCH).forEach((s) => batch.set(s.ref, s.data()!))
      await batch.commit()
    }
  }
}
