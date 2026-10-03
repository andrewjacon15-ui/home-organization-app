import { addDays } from '../../lib/dates'
import type { MealPlan } from '../../types'

export type PlannedSlot = 'breakfast' | 'lunch' | 'dinner'

/** One meal on the plan, and the saved recipe it names (if any). */
export interface PlannedMeal {
  date: string
  slot: PlannedSlot
  text: string
  recipeId: string | null
}

export interface GroceryResult {
  added: number
  staples: number
  onList: number
}

export const SPANS = [3, 7, 14] as const
const SLOT_ORDER: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']
export const SLOT_LABELS: Record<PlannedSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }
export const mealKey = (m: Pick<PlannedMeal, 'date' | 'slot'>) => `${m.date}:${m.slot}`

/** The meals planned from `from` for `days` days, in order, matched to saved recipes. */
export function plannedMeals(plans: Record<string, MealPlan>, from: string, days: number, recipeFor: (text: string) => string | null): PlannedMeal[] {
  const out: PlannedMeal[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    for (const slot of SLOT_ORDER) {
      const text = plans[date]?.[slot]?.trim()
      if (text) out.push({ date, slot, text, recipeId: recipeFor(text) })
    }
  }
  return out
}
