import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import type { MealPlan, MealSlot } from '../../types'

export interface Recipe {
  id: string
  title: string
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
      }
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

export async function saveRecipe(familyId: string, userId: string, draft: RecipeDraft, id?: string): Promise<string> {
  if (id) {
    await updateDoc(doc(recipesCol(familyId), id), { ...clean(draft), updatedAt: serverTimestamp() })
    return id
  }
  const ref = await addDoc(recipesCol(familyId), { ...clean(draft), createdBy: userId, createdAt: serverTimestamp() })
  return ref.id
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
