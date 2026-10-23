import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { readKitchen, type KitchenSettings } from '@shared/recipes/kitchen.js'
import { db, functions } from '../../firebase'

const kitchenRef = (familyId: string) => doc(db, 'families', familyId, 'settings', 'kitchen')

/** Pantry staples and recipe sites for the household (one small document). */
export function watchKitchen(familyId: string, onChange: (k: KitchenSettings) => void) {
  return onSnapshot(kitchenRef(familyId), (snap) => onChange(readKitchen(snap.exists() ? snap.data() : null)))
}

export function saveKitchen(familyId: string, k: KitchenSettings) {
  return setDoc(kitchenRef(familyId), { staples: k.staples.slice(0, 60), sites: k.sites.slice(0, 30), searchPriority: k.searchPriority })
}

export interface OnlineResult {
  url: string
  title: string
  siteName: string | null
  credit: string | null
  image: string | null
  minutes: number | null
  servings: number | null
  yieldText: string | null
  rating: { value: number; count: number } | null
  ingredientLines: string[]
  steps: string[]
  match: number
  have: string[]
  missing: string[]
  score: number
  /** Where it came in the web search (1 = first). */
  searchRank?: number | null
  /** Why it's shown, in plain words. */
  reasons?: string[]
  /** The ranking's parts, each 0–1 (match and fit are null when searching for a dish). */
  parts?: { match: number | null; fit?: number | null; rating: number; search: number }
}

/** Search by what's in the kitchen (ingredients), or for a dish by name. */
export type OnlineQuery = { have: string } | { query: string }

export async function findOnline(familyId: string, q: OnlineQuery): Promise<OnlineResult[]> {
  try {
    const res = await httpsCallable<{ familyId: string } & OnlineQuery, { results: OnlineResult[] }>(functions, 'findOnlineRecipes', { timeout: 95_000 })({ familyId, ...q })
    return res.data.results
  } catch (err) {
    // Before the search key is added, the function isn't deployed at all.
    const e = err as { code?: string; message?: string }
    if (e.code === 'functions/not-found' || (e.code === 'functions/internal' && e.message === 'internal')) throw new Error("Online search isn't set up yet. Recipes from your catalog still work.")
    throw err
  }
}
