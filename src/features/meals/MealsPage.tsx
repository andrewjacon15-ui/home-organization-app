import { useEffect, useState } from 'react'
import { addDays, daysBetween, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'
import { saveMealPlan, watchMealPlans } from './mealsApi'
import { findRecipe, watchRecipes, type Recipe } from '../recipes/recipesApi'
import { RecipeView } from '../recipes/RecipeBook'

interface Props {
  familyId: string
  userId: string
}

export function MealsPage({ familyId, userId }: Props) {
  const today = useToday()
  const { settings } = useSettings()
  const currentWeekStart = startOfWeek(today, settings.weekStartsOn)
  // An offset (not a fixed date) so the wall display rolls to the new week on its own.
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = addDays(currentWeekStart, weekOffset * 7)
  const [plans, setPlans] = useState<Record<string, MealPlan>>({})
  const [error, setError] = useState<string | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [open, setOpen] = useState<Recipe | null>(null)

  useEffect(() => watchRecipes(familyId, setRecipes), [familyId])

  useEffect(() => watchMealPlans(familyId, weekStart, addDays(weekStart, 6), setPlans), [familyId, weekStart])

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <MealPlanner
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        today={today}
        plans={plans}
        recipeTitles={recipes.map((r) => r.title)}
        hasRecipe={(text) => !!findRecipe(recipes, text)}
        onOpenRecipe={(text) => setOpen(findRecipe(recipes, text) ?? null)}
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onSave={(date, plan) =>
          saveMealPlan(familyId, date, plan, userId).catch((e) => setError(e instanceof Error ? e.message : String(e)))
        }
      />
      {open && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <div className="overlay__panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-button overlay__close" onClick={() => setOpen(null)} aria-label="Close recipe">
              ✕
            </button>
            <RecipeView recipe={open} today={today} />
          </div>
        </div>
      )}
    </>
  )
}
