import { groceryLines, type GroceryPlan } from '@shared/recipes/groceries.js'
import { scaleLine } from '@shared/recipes/scaler.js'
import { fromDateKey } from '../../lib/dates'
import { lines, type Recipe } from '../recipes/recipesApi'
import { mealKey, SLOT_LABELS, type PlannedMeal } from './upcomingMeals'

type Meal = Pick<PlannedMeal, 'date' | 'slot' | 'text'>

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
export function shoppingPlan(meals: { meal: Meal; recipe: Recipe | null }[], people: number | null, staples: string[], onList: string[]): Shopping {
  const labels: Record<string, string> = {}
  const inputs = meals.flatMap(({ meal, recipe }) => {
    if (!recipe) return []
    const key = mealKey(meal)
    labels[key] = mealSource(meal)
    const factor = scaleFor(people, recipe.servings)
    return lines(recipe.ingredients).map((l) => ({ text: scaleLine(l, factor), source: key }))
  })
  return { plan: groceryLines(inputs, staples, onList), labels }
}
