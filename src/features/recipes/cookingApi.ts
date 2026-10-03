/**
 * Cooking progress, shared live between devices while a recipe is being made
 * (families/{f}/cookingSessions/{recipeId}). It's temporary: Done or Reset deletes it, and a
 * forgotten one expires by itself after a day (Firestore TTL on expireAt).
 */
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase'

export interface CookingState {
  /** Servings being made (null = as written). Older sessions; new ones use scale. */
  servings: number | null
  /** Batch size against the recipe as written (½, 2…); null = as written. */
  scale: number | null
  /** Checked ingredient and step indexes. */
  items: number[]
  steps: number[]
  /** The current step in one-step view. */
  step: number
}

export const FRESH: CookingState = { servings: null, scale: null, items: [], steps: [], step: 0 }

/** How much to multiply the amounts by. */
export function cookingFactor(s: CookingState, base: number | null | undefined): number {
  if (s.scale) return s.scale
  return s.servings && base ? s.servings / base : 1
}

export type CookingAction = { type: 'item'; i: number } | { type: 'step'; i: number } | { type: 'goto'; step: number; total: number } | { type: 'next'; total: number } | { type: 'servings'; n: number | null } | { type: 'scale'; f: number | null }

const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b))

export function cookingReducer(s: CookingState, a: CookingAction): CookingState {
  switch (a.type) {
    case 'item':
      return { ...s, items: toggle(s.items, a.i) }
    case 'step':
      return { ...s, steps: toggle(s.steps, a.i) }
    case 'goto':
      return { ...s, step: Math.max(0, Math.min(a.total - 1, a.step)) }
    case 'next':
      // "Next" finishes the current step and moves on.
      return { ...s, steps: s.steps.includes(s.step) ? s.steps : toggle(s.steps, s.step), step: Math.min(a.total - 1, s.step + 1) }
    case 'servings':
      return { ...s, scale: null, servings: a.n == null ? null : Math.max(1, Math.min(100, Math.round(a.n))) }
    case 'scale':
      return { ...s, servings: null, scale: a.f == null || Math.abs(a.f - 1) < 1e-6 ? null : Math.max(0.125, Math.min(16, Math.round(a.f * 1000) / 1000)) }
  }
}

const sessionRef = (familyId: string, recipeId: string) => doc(db, 'families', familyId, 'cookingSessions', recipeId)

export function watchCooking(familyId: string, recipeId: string, onChange: (s: CookingState | null) => void) {
  return onSnapshot(sessionRef(familyId, recipeId), (snap) => {
    if (!snap.exists()) return onChange(null)
    const x = snap.data()
    onChange({ servings: x.servings ?? null, scale: x.scale ?? null, items: x.items ?? [], steps: x.steps ?? [], step: x.step ?? 0 })
  })
}

export function saveCooking(familyId: string, recipeId: string, userId: string, s: CookingState) {
  return setDoc(sessionRef(familyId, recipeId), {
    servings: s.servings,
    scale: s.scale,
    items: s.items.slice(0, 100),
    steps: s.steps.slice(0, 100),
    step: s.step,
    startedBy: userId,
    updatedAt: serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + 24 * 3600_000),
  })
}

/** Done or Reset: the progress isn't kept. */
export function endCooking(familyId: string, recipeId: string) {
  return deleteDoc(sessionRef(familyId, recipeId))
}
