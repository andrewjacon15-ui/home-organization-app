import { groceryLines, type GroceryPlan } from '@shared/recipes/groceries.js'
import { scaleLine } from '@shared/recipes/scaler.js'
import { fromDateKey } from '../../lib/dates'
import { lines, type Recipe } from '../recipes/recipesApi'
import { SLOT_LABELS, type PlannedMeal } from './upcomingMeals'

/** "Tue dinner: Tacos" — which meal a grocery line is for. */
export function mealSource(m: Pick<PlannedMeal, 'date' | 'slot' | 'text'>): string {
  return `${fromDateKey(m.date).toLocaleDateString(undefined, { weekday: 'short' })} ${SLOT_LABELS[m.slot].toLowerCase()}: ${m.text}`
}

/** How much to scale a recipe for `people` (only when both are known). */
export const scaleFor = (people: number | null, servings: number | null | undefined) => (people && servings ? people / servings : 1)

/**
 * The grocery list for these meals: every recipe scaled to `people` (when it says how many it
 * serves), the same ingredient combined across meals, staples and what's on the list left off,
 * and each line marked with the meals it's for.
 */
export function shoppingPlan(meals: { meal: Pick<PlannedMeal, 'date' | 'slot' | 'text'>; recipe: Recipe | null }[], people: number | null, staples: string[], onList: string[]): GroceryPlan {
  const inputs = meals.flatMap(({ meal, recipe }) => {
    if (!recipe) return []
    const factor = scaleFor(people, recipe.servings)
    return lines(recipe.ingredients).map((l) => ({ text: scaleLine(l, factor), source: mealSource(meal) }))
  })
  return groceryLines(inputs, staples, onList)
}
