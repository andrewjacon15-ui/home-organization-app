import { collection, deleteField, doc, FieldPath, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { AISLES } from '@shared/recipes/aisles.js'
import { groceryCategory, learnKey } from '@shared/recipes/groceryAisle.js'
import { db } from '../../firebase'
import { removeDocs, type Restore } from '../../lib/undo'

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
  /** Grocery lists sort themselves into store aisles unless this is false. */
  autoSort?: boolean
  /** Grocery lists: where the household moved items (learnKey(text) → category id, '' = the top), so they file themselves that way next time. */
  learned?: Record<string, string>
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
      return { ...x, id: d.id, categories: Array.isArray(x.categories) ? x.categories : [], learned: x.learned && typeof x.learned === 'object' ? x.learned : {} }
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

/** Deletes a list and everything on it (and returns how to put it all back). */
export async function deleteList(familyId: string, listId: string) {
  const items = await getDocs(itemsCol(familyId, listId))
  return removeDocs([...items.docs.map((d) => d.ref), doc(listsCol(familyId), listId)])
}

/** Whether a list files new items itself: grocery lists, unless aisle sorting is off. */
export const sortsItself = (list: FamilyList | undefined): list is FamilyList => !!list && list.kind === 'grocery' && list.autoSort !== false

/**
 * Adds items to the bottom of a list (or a person's section, or a category). With no category
 * given, a grocery list files each item under its aisle ("bananas" → Produce), or wherever the
 * household moved that item before.
 */
export async function addItems(familyId: string, listId: string, userId: string, texts: string[], memberId: string | null = null, opts: { categoryId?: string | null; list?: FamilyList } = {}) {
  const clean = texts.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return
  const batch = writeBatch(db)
  const base = Date.now()
  clean.forEach((text, i) => {
    const categoryId = opts.categoryId !== undefined ? opts.categoryId : sortsItself(opts.list) && !memberId ? groceryCategory(text, opts.list.categories ?? [], opts.list.learned) : null
    batch.set(doc(itemsCol(familyId, listId)), { text: text.slice(0, 300), done: false, memberId, categoryId: categoryId ?? null, order: base + i, createdBy: userId, createdAt: serverTimestamp() })
  })
  await batch.commit()
}

/** How items compare for repeats: grocery items by the thing itself ("2 bags Bananas" = "banana"), others by their words. */
export function itemMatchKey(list: Pick<FamilyList, 'kind'>, text: string): string {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return (list.kind === 'grocery' && learnKey(text)) || words
}

/** The item `text` would repeat in the same person's section: one still to get first, else one checked off. */
export function findRepeat(list: FamilyList, items: ListItem[], text: string, memberId: string | null): ListItem | null {
  const key = itemMatchKey(list, text)
  if (!key) return null
  const same = items.filter((i) => (i.memberId ?? null) === (memberId ?? null) && itemMatchKey(list, i.text ?? '') === key)
  return same.find((i) => !i.done) ?? same[0] ?? null
}

/** Puts a checked-off item back on the list, keeping its place and aisle; `text` rewords it. */
export function reviveItem(familyId: string, listId: string, itemId: string, text?: string) {
  return updateDoc(doc(itemsCol(familyId, listId), itemId), { done: false, expireAt: deleteField(), ...(text ? { text: text.trim().slice(0, 300) } : {}), updatedAt: serverTimestamp() })
}

/** Checked-off items remove themselves after `keepDays` (a Firestore TTL policy on expireAt); 0 = keep. */
export function setItemDone(familyId: string, listId: string, itemId: string, done: boolean, keepDays = 30) {
  const expiry = done && keepDays > 0 ? { expireAt: Timestamp.fromMillis(Date.now() + keepDays * 86_400_000) } : { expireAt: deleteField() }
  return updateDoc(doc(itemsCol(familyId, listId), itemId), done ? { done, doneAt: serverTimestamp(), ...expiry } : { done, ...expiry })
}

/** Puts an item somewhere else on its list: a new place in the order, and maybe another category or person's section. */
export function moveItem(familyId: string, listId: string, itemId: string, to: { order: number; categoryId: string | null; memberId: string | null }) {
  return updateDoc(doc(itemsCol(familyId, listId), itemId), { order: to.order, categoryId: to.categoryId, memberId: to.memberId, updatedAt: serverTimestamp() })
}

/** Most items a grocery list remembers. */
export const LEARNED_MAX = 400

/** A grocery list remembers where an item was moved, so the next one like it files itself there. */
export function learnCategory(familyId: string, list: FamilyList, text: string, categoryId: string | null) {
  const key = learnKey(text)
  if (!key || list.kind !== 'grocery' || (list.learned ?? {})[key] === (categoryId ?? '')) return Promise.resolve()
  const learned = { ...(list.learned ?? {}), [key]: categoryId ?? '' }
  if (Object.keys(learned).length <= LEARNED_MAX) return updateDoc(doc(listsCol(familyId), list.id), new FieldPath('learned', key), categoryId ?? '')
  // Full: forget items filed under categories that are gone, then others, keeping this one.
  const ids = new Set((list.categories ?? []).map((c) => c.id))
  const keys = Object.keys(learned).filter((k) => k !== key)
  const order = [...keys.filter((k) => learned[k] && !ids.has(learned[k])), ...keys.filter((k) => !learned[k] || ids.has(learned[k]))]
  const drop = new Set(order.slice(0, Object.keys(learned).length - LEARNED_MAX))
  return updateDoc(doc(listsCol(familyId), list.id), { learned: Object.fromEntries(Object.entries(learned).filter(([k]) => !drop.has(k))) })
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

/** A grocery list that sorts itself but is missing a store aisle (a new list, or one made before an aisle was added). */
export function needsAisles(list: FamilyList): boolean {
  if (!sortsItself(list)) return false
  const names = new Set((list.categories ?? []).map((c) => c.name.trim().toLowerCase()))
  return !AISLES.every((a) => names.has(a.toLowerCase()))
}

/** Turns aisle sorting on (adds the aisles and files what's there) or off (removes the aisles; items stay). */
export async function setAutoSort(familyId: string, list: FamilyList, items: ListItem[], on: boolean) {
  if (on) {
    await updateDoc(doc(listsCol(familyId), list.id), { autoSort: true })
    return addAisles(familyId, { ...list, autoSort: true }, items)
  }
  const aisle = new Set(AISLES.map((a) => a.toLowerCase()))
  const gone = new Set((list.categories ?? []).filter((c) => aisle.has(c.name.trim().toLowerCase())).map((c) => c.id))
  const batch = writeBatch(db)
  batch.update(doc(listsCol(familyId), list.id), { autoSort: false, categories: (list.categories ?? []).filter((c) => !gone.has(c.id)) })
  items.filter((i) => i.categoryId && gone.has(i.categoryId)).forEach((i) => batch.update(doc(itemsCol(familyId, list.id), i.id), { categoryId: null }))
  await batch.commit()
}

/**
 * Store aisles for a grocery list: what's already on it is sorted in, and new items sort
 * themselves. A missing aisle goes in after the aisle before it (Snacks & Drinks after Pantry).
 */
export async function addAisles(familyId: string, list: FamilyList, items: ListItem[]) {
  const have = new Set((list.categories ?? []).map((c) => c.name.trim().toLowerCase()))
  const categories = [...(list.categories ?? [])]
  AISLES.forEach((name, i) => {
    if (have.has(name.toLowerCase())) return
    const before = AISLES.slice(0, i).reverse().find((a) => have.has(a.toLowerCase()))
    const at = before ? categories.findIndex((c) => c.name.trim().toLowerCase() === before.toLowerCase()) + 1 : categories.length
    categories.splice(at, 0, { id: newCategoryId(), name })
    have.add(name.toLowerCase())
  })
  categories.splice(30)
  const batch = writeBatch(db)
  batch.update(doc(listsCol(familyId), list.id), { categories })
  for (const i of items) {
    // Items already filed under a category that still exists stay put.
    if (i.done || (i.categoryId && have.has((list.categories ?? []).find((c) => c.id === i.categoryId)?.name.trim().toLowerCase() ?? ""))) continue
    const categoryId = groceryCategory(i.text, categories, list.learned)
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

/** Removes a category; its items move to the top of the list (nothing is deleted). Returns how to undo it. */
export async function deleteCategory(familyId: string, list: FamilyList, categoryId: string, items: ListItem[]): Promise<Restore> {
  const before = list.categories ?? []
  const moved = items.filter((i) => i.categoryId === categoryId)
  const batch = writeBatch(db)
  batch.update(doc(listsCol(familyId), list.id), { categories: before.filter((c) => c.id !== categoryId) })
  moved.forEach((i) => batch.update(doc(itemsCol(familyId, list.id), i.id), { categoryId: null }))
  await batch.commit()
  return async () => {
    const back = writeBatch(db)
    back.update(doc(listsCol(familyId), list.id), { categories: before })
    moved.forEach((i) => back.update(doc(itemsCol(familyId, list.id), i.id), { categoryId }))
    await back.commit()
  }
}

export function deleteItem(familyId: string, listId: string, itemId: string) {
  return removeDocs([doc(itemsCol(familyId, listId), itemId)])
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
