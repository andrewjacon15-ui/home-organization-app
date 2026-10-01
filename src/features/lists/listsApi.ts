import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'

export type ListKind = 'grocery' | 'todo' | 'custom'

export interface FamilyList {
  id: string
  title: string
  kind: ListKind
  /** Show a section per person (like the To-Do list). */
  sections: boolean
  order: number
}

export interface ListItem {
  id: string
  text: string
  done: boolean
  /** Which person's section; null = the list's shared area. */
  memberId: string | null
  order: number
  /** Who added it (used for "just my items" on lists without sections). */
  createdBy?: string
}

const listsCol = (familyId: string) => collection(db, 'families', familyId, 'lists')
const itemsCol = (familyId: string, listId: string) => collection(db, 'families', familyId, 'lists', listId, 'items')

export const DEFAULT_LISTS: Omit<FamilyList, 'order'>[] = [
  { id: 'grocery', title: 'Grocery List', kind: 'grocery', sections: false },
  { id: 'todo', title: 'To-Do List', kind: 'todo', sections: true },
]

export function watchLists(familyId: string, onChange: (lists: FamilyList[]) => void) {
  return onSnapshot(listsCol(familyId), (snap) => {
    const lists = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FamilyList, 'id'>) }))
    lists.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    onChange(lists)
  })
}

export function watchItems(familyId: string, listId: string, onChange: (items: ListItem[]) => void) {
  return onSnapshot(itemsCol(familyId, listId), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const x = d.data()
        return { id: d.id, text: x.text, done: !!x.done, memberId: x.memberId ?? null, order: x.order ?? 0, createdBy: x.createdBy }
      }),
    )
  })
}

/** First visit: create the Grocery and To-Do lists. Fixed IDs make a race between two devices harmless. */
export async function ensureDefaultLists(familyId: string, userId: string) {
  const existing = await getDocs(query(listsCol(familyId), limit(1)))
  if (!existing.empty) return
  const batch = writeBatch(db)
  DEFAULT_LISTS.forEach((l, i) => {
    batch.set(doc(listsCol(familyId), l.id), { title: l.title, kind: l.kind, sections: l.sections, order: i, createdBy: userId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

export async function createList(familyId: string, userId: string, title: string, order: number) {
  const ref = doc(listsCol(familyId))
  await setDoc(ref, { title: title.trim(), kind: 'custom', sections: false, order, createdBy: userId, createdAt: serverTimestamp() })
  return ref.id
}

export function updateList(familyId: string, listId: string, changes: Partial<Pick<FamilyList, 'title' | 'sections'>>) {
  return updateDoc(doc(listsCol(familyId), listId), changes)
}

/** Deletes a list and everything on it. */
export async function deleteList(familyId: string, listId: string) {
  const items = await getDocs(itemsCol(familyId, listId))
  const batch = writeBatch(db)
  items.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(listsCol(familyId), listId))
  await batch.commit()
}

/** Adds items to the bottom of a list (or a person's section). */
export async function addItems(familyId: string, listId: string, userId: string, texts: string[], memberId: string | null = null) {
  const clean = texts.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return
  const batch = writeBatch(db)
  const base = Date.now()
  clean.forEach((text, i) => {
    batch.set(doc(itemsCol(familyId, listId)), { text: text.slice(0, 300), done: false, memberId, order: base + i, createdBy: userId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

export function setItemDone(familyId: string, listId: string, itemId: string, done: boolean) {
  return updateDoc(doc(itemsCol(familyId, listId), itemId), done ? { done, doneAt: serverTimestamp() } : { done })
}

export function deleteItem(familyId: string, listId: string, itemId: string) {
  return deleteDoc(doc(itemsCol(familyId, listId), itemId))
}

export async function clearCompleted(familyId: string, listId: string, items: ListItem[]) {
  const done = items.filter((i) => i.done)
  if (done.length === 0) return
  const batch = writeBatch(db)
  done.forEach((i) => batch.delete(doc(itemsCol(familyId, listId), i.id)))
  await batch.commit()
}

/** The grocery list's ID, creating the list if it was never made or has been deleted. */
export async function groceryListId(familyId: string, userId: string, lists: FamilyList[]): Promise<string> {
  const existing = lists.find((l) => l.kind === 'grocery')
  if (existing) return existing.id
  await setDoc(doc(listsCol(familyId), 'grocery'), { title: 'Grocery List', kind: 'grocery', sections: false, order: -1, createdBy: userId, createdAt: serverTimestamp() })
  return 'grocery'
}
