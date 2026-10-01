import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { parseIngredient } from '@shared/recipes/ingredient.js'
import { db } from '../../firebase'
import type { MealPlan, MealSlot } from '../../types'

/** Where a recipe came from. Cookbook recipes point back to the book and page. */
export interface RecipeSource {
  type: 'manual' | 'cookbook' | 'online'
  bookId?: string | null
  bookTitle?: string | null
  location?: string | null
  url?: string | null
  siteName?: string | null
}

export interface Recipe {
  id: string
  title: string
  source?: RecipeSource | null
  /** Parsed from a cookbook with low confidence: check it against the book. */
  needsReview?: boolean
  confidence?: number | null
  yieldText?: string | null
  /** Changed by the family (re-parsing a book won't overwrite it). */
  edited?: boolean
  favorite?: boolean
  servings?: number | null
  minutes?: number | null
  /** One ingredient per line. */
  ingredients: string
  /** One step per line. */
  steps: string
  url?: string | null
}

export type RecipeDraft = Omit<Recipe, 'id'>

const recipesCol = (familyId: string) => collection(db, 'families', familyId, 'recipes')

export const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** The recipe a meal refers to, matched by title (case and spacing ignored). */
export function findRecipe(recipes: Recipe[], mealText: string): Recipe | undefined {
  const key = mealText.trim().toLowerCase()
  return key ? recipes.find((r) => r.title.trim().toLowerCase() === key) : undefined
}

export function watchRecipes(familyId: string, onChange: (recipes: Recipe[]) => void) {
  return onSnapshot(recipesCol(familyId), (snap) => {
    const list = snap.docs.map((d) => {
      const x = d.data()
      return {
        id: d.id,
        title: x.title,
        ingredients: x.ingredients ?? '',
        steps: x.steps ?? '',
        servings: x.servings ?? null,
        minutes: x.minutes ?? null,
        url: x.url ?? null,
        source: x.source ?? null,
        needsReview: !!x.needsReview,
        confidence: x.confidence ?? null,
        yieldText: x.yieldText ?? null,
        edited: !!x.edited,
        favorite: !!x.favorite,
      } satisfies Recipe
    })
    list.sort((a, b) => a.title.localeCompare(b.title))
    onChange(list)
  })
}

function clean(draft: RecipeDraft) {
  return {
    title: draft.title.trim(),
    ingredients: draft.ingredients.trim(),
    steps: draft.steps.trim(),
    servings: draft.servings || null,
    minutes: draft.minutes ?? null,
    url: draft.url?.trim() || null,
  }
}

/** The structured fields every recipe keeps alongside its text (parsed with the same rules as cookbooks). */
function structured(draft: RecipeDraft) {
  return {
    items: lines(draft.ingredients)
      .filter((l) => !/:\s*$/.test(l)) // group labels like "For the sauce:"
      .slice(0, 80)
      .map((l) => {
        const i = parseIngredient(l)
        return { raw: i.raw, qty: i.qty, qtyMax: i.qtyMax, unit: i.unit, name: i.name, note: i.note, key: i.key, family: i.family, known: i.known }
      }),
    stepList: lines(draft.steps).slice(0, 80),
  }
}

/** Saving an edit also clears "Needs review" and protects the recipe from re-parsing. */
export async function saveRecipe(familyId: string, userId: string, draft: RecipeDraft, id?: string): Promise<string> {
  if (id) {
    await updateDoc(doc(recipesCol(familyId), id), { ...clean(draft), ...structured(draft), needsReview: false, edited: true, updatedAt: serverTimestamp() })
    return id
  }
  const ref = await addDoc(recipesCol(familyId), { ...clean(draft), ...structured(draft), source: { type: 'manual' }, createdBy: userId, createdAt: serverTimestamp() })
  return ref.id
}

/** "Looks right": a reviewed cookbook recipe leaves the review list. */
export function markReviewed(familyId: string, id: string) {
  return updateDoc(doc(recipesCol(familyId), id), { needsReview: false, edited: true, updatedAt: serverTimestamp() })
}

export function deleteRecipe(familyId: string, id: string) {
  return deleteDoc(doc(recipesCol(familyId), id))
}

/** Puts a recipe on the meal plan, keeping the day's other meals. */
export async function planRecipe(familyId: string, userId: string, date: string, slot: Exclude<MealSlot, 'notes'>, title: string) {
  const ref = doc(db, 'families', familyId, 'mealPlans', date)
  const snap = await getDoc(ref)
  const current = (snap.exists() ? snap.data() : {}) as Partial<MealPlan>
  await setDoc(ref, {
    breakfast: current.breakfast ?? '',
    lunch: current.lunch ?? '',
    dinner: current.dinner ?? '',
    notes: current.notes ?? '',
    [slot]: title,
    updatedBy: userId,
  })
}
