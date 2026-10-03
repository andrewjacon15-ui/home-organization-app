import { collection, deleteDoc, deleteField, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { AISLES, categoryFor } from '@shared/recipes/aisles.js'
import { db } from '../../firebase'

export type ListKind = 'grocery' | 'todo' | 'custom'

export interface FamilyList {
  id: string
  title: string
  kind: ListKind
  /** Show a section per person (like the To-Do list). */
  sections: boolean
  order: number
  /** Smaller lists inside this one ("Produce", "Pantry"…), in display order. */
  categories?: ListCategory[]
}

export interface ListCategory {
  id: string
  name: string
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
  /** Which category it's filed under; null = the list's top. */
  categoryId?: string | null
}

const listsCol = (familyId: string) => collection(db, 'families', familyId, 'lists')
const itemsCol = (familyId: string, listId: string) => collection(db, 'families', familyId, 'lists', listId, 'items')

export const DEFAULT_LISTS: Omit<FamilyList, 'order'>[] = [
  { id: 'grocery', title: 'Grocery List', kind: 'grocery', sections: false },
  { id: 'todo', title: 'To-Do List', kind: 'todo', sections: true },
]

export function watchLists(familyId: string, onChange: (lists: FamilyList[]) => void) {
  return onSnapshot(listsCol(familyId), (snap) => {
    const lists = snap.docs.map((d) => {
      const x = d.data() as Omit<FamilyList, 'id'>
      return { ...x, id: d.id, categories: Array.isArray(x.categories) ? x.categories : [] }
    })
    lists.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    onChange(lists)
  })
}

export function watchItems(familyId: string, listId: string, onChange: (items: ListItem[]) => void) {
  return onSnapshot(itemsCol(familyId, listId), (snap) => {
    onChange(
      snap.docs.map((d) => {
        const x = d.data()
        return { id: d.id, text: x.text, done: !!x.done, memberId: x.memberId ?? null, order: x.order ?? 0, createdBy: x.createdBy, categoryId: x.categoryId ?? null }
      }),
    )
  })
}

/** What's still to get on a list (one read, for adding without doubling up). */
export async function openItemTexts(familyId: string, listId: string): Promise<string[]> {
  const snap = await getDocs(itemsCol(familyId, listId))
  return snap.docs.filter((d) => !d.get('done')).map((d) => String(d.get('text') ?? ''))
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

/**
 * Adds items to the bottom of a list (or a person's section, or a category). With no category
 * given, a list that has store aisles files each item under its aisle ("bananas" → Produce).
 */
export async function addItems(familyId: string, listId: string, userId: string, texts: string[], memberId: string | null = null, opts: { categoryId?: string | null; categories?: ListCategory[] } = {}) {
  const clean = texts.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return
  const batch = writeBatch(db)
  const base = Date.now()
  clean.forEach((text, i) => {
    const categoryId = opts.categoryId !== undefined ? opts.categoryId : categoryFor(text, opts.categories ?? [])
    batch.set(doc(itemsCol(familyId, listId)), { text: text.slice(0, 300), done: false, memberId, categoryId: categoryId ?? null, order: base + i, createdBy: userId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

/** Checked-off items remove themselves after `keepDays` (a Firestore TTL policy on expireAt); 0 = keep. */
export function setItemDone(familyId: string, listId: string, itemId: string, done: boolean, keepDays = 30) {
  const expiry = done && keepDays > 0 ? { expireAt: Timestamp.fromMillis(Date.now() + keepDays * 86_400_000) } : { expireAt: deleteField() }
  return updateDoc(doc(itemsCol(familyId, listId), itemId), done ? { done, doneAt: serverTimestamp(), ...expiry } : { done, ...expiry })
}

/** Edit an item's wording, or move it to another category. */
export function updateItem(familyId: string, listId: string, itemId: string, changes: { text?: string; categoryId?: string | null }) {
  const out: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (changes.text !== undefined) out.text = changes.text.trim().slice(0, 300)
  if (changes.categoryId !== undefined) out.categoryId = changes.categoryId
  return updateDoc(doc(itemsCol(familyId, listId), itemId), out)
}

const newCategoryId = () => Math.random().toString(36).slice(2, 10)

export function addCategories(familyId: string, list: FamilyList, names: string[]) {
  const have = new Set((list.categories ?? []).map((c) => c.name.trim().toLowerCase()))
  const added = names.map((n) => n.trim().slice(0, 40)).filter((n) => n && !have.has(n.toLowerCase())).map((name) => ({ id: newCategoryId(), name }))
  return updateDoc(doc(listsCol(familyId), list.id), { categories: [...(list.categories ?? []), ...added].slice(0, 30) })
}

/** Store aisles for a grocery list: what's already on it is sorted in, and new items sort themselves. */
export async function addAisles(familyId: string, list: FamilyList, items: ListItem[]) {
  const have = new Set((list.categories ?? []).map((c) => c.name.trim().toLowerCase()))
  const categories = [...(list.categories ?? []), ...AISLES.filter((a) => !have.has(a.toLowerCase())).map((name) => ({ id: newCategoryId(), name }))].slice(0, 30)
  const batch = writeBatch(db)
  batch.update(doc(listsCol(familyId), list.id), { categories })
  for (const i of items) {
    // Items already filed under a category that still exists stay put.
    if (i.done || (i.categoryId && have.has((list.categories ?? []).find((c) => c.id === i.categoryId)?.name.trim().toLowerCase() ?? ""))) continue
    const categoryId = categoryFor(i.text, categories)
    if (categoryId) batch.update(doc(itemsCol(familyId, list.id), i.id), { categoryId })
  }
  await batch.commit()
}

export function renameCategory(familyId: string, list: FamilyList, categoryId: string, name: string) {
  return updateDoc(doc(listsCol(familyId), list.id), { categories: (list.categories ?? []).map((c) => (c.id === categoryId ? { ...c, name: name.trim().slice(0, 40) } : c)) })
}

export function moveCategory(familyId: string, list: FamilyList, categoryId: string, by: -1 | 1) {
  const cats = [...(list.categories ?? [])]
  const i = cats.findIndex((c) => c.id === categoryId)
  const j = i + by
  if (i < 0 || j < 0 || j >= cats.length) return Promise.resolve()
  ;[cats[i], cats[j]] = [cats[j], cats[i]]
  return updateDoc(doc(listsCol(familyId), list.id), { categories: cats })
}

/** Removes a category; its items move to the top of the list (nothing is deleted). */
export async function deleteCategory(familyId: string, list: FamilyList, categoryId: string, items: ListItem[]) {
  const batch = writeBatch(db)
  batch.update(doc(listsCol(familyId), list.id), { categories: (list.categories ?? []).filter((c) => c.id !== categoryId) })
  items.filter((i) => i.categoryId === categoryId).forEach((i) => batch.update(doc(itemsCol(familyId, list.id), i.id), { categoryId: null }))
  await batch.commit()
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
