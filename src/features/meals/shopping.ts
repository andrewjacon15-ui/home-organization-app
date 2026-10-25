import { groceryLines, type GroceryLine, type GroceryPlan } from '@shared/recipes/groceries.js'
import { parseIngredient } from '@shared/recipes/ingredient.js'
import { scaleLine } from '@shared/recipes/scaler.js'
import { fromDateKey } from '../../lib/dates'
import type { ItemMerge, ListItem } from '../lists/listsApi'
import { lines, type Recipe } from '../recipes/recipesApi'
import type { MealPlan } from '../../types'
import { mealKey, SLOT_LABELS, type PlannedMeal, type PlannedSlot } from './upcomingMeals'

type Meal = Pick<PlannedMeal, 'date' | 'slot' | 'text' | 'people'>
const SLOTS: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']

/** "Tue dinner: Tacos" — which meal a grocery line is for. */
export function mealSource(m: Meal): string {
  return `${fromDateKey(m.date).toLocaleDateString(undefined, { weekday: 'short' })} ${SLOT_LABELS[m.slot].toLowerCase()}: ${m.text}`
}

/** How much to scale a recipe for `people` (only when both are known). */
export const scaleFor = (people: number | null, servings: number | null | undefined) => (people && servings ? people / servings : 1)

export interface Shopping {
  /** Lines combined across meals; each line's `sources` are the meals' keys ("YYYY-MM-DD:slot"). */
  plan: GroceryPlan
  /** "Tue dinner: Tacos" for each meal key. */
  labels: Record<string, string>
}

/**
 * The grocery list for these meals: every recipe scaled to `people` (when it says how many it
 * serves), the same ingredient combined across meals, staples and what's on the list left off,
 * and each line marked with the meals it's for (so clearing those meals can take it off again).
 */
export function shoppingPlan(meals: { meal: Meal & { people?: number | null }; recipe: Recipe | null }[], people: number | null | 'plan', staples: string[], onList: string[]): Shopping {
  const labels: Record<string, string> = {}
  const inputs = meals.flatMap(({ meal, recipe }) => {
    if (!recipe) return []
    const key = mealKey(meal)
    labels[key] = mealSource(meal)
    // "As planned": each meal for as many as its day was planned for (else as written).
    const factor = scaleFor(people === 'plan' ? (meal.people ?? null) : people, recipe.servings)
    return lines(recipe.ingredients).map((l) => ({ text: scaleLine(l, factor), source: key }))
  })
  return { plan: groceryLines(inputs, staples, onList), labels }
}

const keyOf = (text: string) => parseIngredient(text).key || text.trim().toLowerCase()

/**
 * Where these grocery lines go on the list: a line the list already has for other planned meals
 * is added into that item (amounts added up where they can be, its meals joined), so clearing
 * one of the meals leaves it for the other; the rest are new items. (Lines the household put on
 * the list by hand should already be left off, as `shoppingPlan`'s "on the list".)
 */
export function mealGroceryChanges(details: GroceryLine[], items: ListItem[]): { add: { text: string; meals: string[] }[]; merge: ItemMerge[] } {
  const byKey = new Map<string, ListItem>()
  for (const i of items) {
    if (i.done || !i.meals?.length) continue
    const k = keyOf(i.text)
    if (k && !byKey.has(k)) byKey.set(k, i)
  }
  const add: { text: string; meals: string[] }[] = []
  const merged = new Map<string, ItemMerge>()
  for (const d of details) {
    const item = byKey.get(keyOf(d.line))
    if (!item) {
      add.push({ text: d.line, meals: d.sources })
      continue
    }
    const cur = merged.get(item.id) ?? { item, text: item.text, meals: [...(item.meals ?? [])] }
    // "1 onion" and "2 onions" become "3 onions"; wording that won't add up keeps the item's own.
    const both = groceryLines([cur.text, d.line]).details
    if (both.length === 1) cur.text = both[0].line
    cur.meals = [...new Set([...cur.meals, ...d.sources])]
    merged.set(item.id, cur)
  }
  return { add, merge: [...merged.values()] }
}

const planned = (plans: Record<string, MealPlan>, key: string) => {
  const [date, slot] = key.split(':') as [string, PlannedSlot]
  return !!plans[date]?.[slot]?.trim()
}

/**
 * Grocery items, not bought yet, that were added for meals on these days only and whose meals
 * are all gone from the plan now (cleared or replaced since).
 */
export function staleGroceries(items: ListItem[], plans: Record<string, MealPlan>, days: string[]): ListItem[] {
  const shown = new Set(days)
  return items.filter((i) => !i.done && i.meals?.length && i.meals.every((k) => shown.has(k.split(':')[0])) && !i.meals.some((k) => planned(plans, k)))
}

/**
 * The meals on these days, from `from` on, with nothing on the grocery list for them (bought or
 * not): the ones a sync shops for. Whether each has a saved recipe is the caller's to check.
 */
export function mealsWithoutGroceries(items: ListItem[], plans: Record<string, MealPlan>, days: string[], from: string): Meal[] {
  const covered = new Set(items.flatMap((i) => i.meals ?? []))
  return days
    .filter((d) => d >= from)
    .flatMap((date) => SLOTS.filter((slot) => planned(plans, `${date}:${slot}`) && !covered.has(`${date}:${slot}`)).map((slot) => ({ date, slot, text: plans[date][slot].trim(), ...(plans[date].people ? { people: plans[date].people } : {}) })))
}
