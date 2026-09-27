import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { Chore, NewChore } from '../../types'

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
          done: data.done,
          points: data.points ?? 0,
        }
      }),
    )
  })
}

export function addChore(familyId: string, createdBy: string, chore: NewChore) {
  return addDoc(choresCol(familyId), { ...chore, done: false, createdBy, createdAt: serverTimestamp() })
}

export function setChoreDone(familyId: string, choreId: string, done: boolean) {
  return updateDoc(doc(choresCol(familyId), choreId), { done })
}

export function deleteChore(familyId: string, choreId: string) {
  return deleteDoc(doc(choresCol(familyId), choreId))
}
