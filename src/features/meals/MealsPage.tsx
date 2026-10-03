import { useEffect, useState } from 'react'
import { DEFAULT_KITCHEN } from '@shared/recipes/kitchen.js'
import { groceryLines } from '@shared/recipes/groceries.js'
import { CartIcon, CloseIcon } from '../../components/Icons'
import { addItems, groceryListId, openItemTexts, watchLists, type FamilyList } from '../lists/listsApi'
import { watchKitchen } from '../recipes/kitchenApi'
import { MealGroceries } from './MealGroceries'
import { plannedMeals, type GroceryResult, type PlannedMeal } from './upcomingMeals'
import { addDays, daysBetween, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'
import { saveMealPlan, watchMealPlans } from './mealsApi'
import { findEntry, watchCatalog, type CatalogEntry } from '../recipes/catalog'
import { getRecipe, lines, type Recipe } from '../recipes/recipesApi'
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
  // Recipe titles come from the catalog index (a few documents); a recipe is read only when opened.
  const [recipes, setRecipes] = useState<CatalogEntry[]>([])
  const [open, setOpen] = useState<Recipe | null>(null)

  useEffect(() => watchCatalog(familyId, setRecipes), [familyId])

  useEffect(() => watchMealPlans(familyId, weekStart, addDays(weekStart, 6), setPlans), [familyId, weekStart])

  // Groceries for upcoming meals: its own window of days from today, read only while open.
  const [shopping, setShopping] = useState(false)
  const [shopDays, setShopDays] = useState(7)
  const [upcoming, setUpcoming] = useState<{ key: string; plans: Record<string, MealPlan> } | null>(null)
  const [lists, setLists] = useState<FamilyList[]>([])
  const [kitchen, setKitchen] = useState(DEFAULT_KITCHEN)
  const shopKey = `${today}+${shopDays}`
  useEffect(() => {
    if (!shopping) return
    return watchMealPlans(familyId, today, addDays(today, shopDays - 1), (plans) => setUpcoming({ key: shopKey, plans }))
  }, [familyId, shopping, today, shopDays, shopKey])
  useEffect(() => (shopping ? watchLists(familyId, setLists) : undefined), [familyId, shopping])
  useEffect(() => (shopping ? watchKitchen(familyId, setKitchen) : undefined), [familyId, shopping])
  const meals = upcoming?.key === shopKey ? plannedMeals(upcoming.plans, today, shopDays, (text) => findEntry(recipes, text)?.id ?? null) : null

  async function addGroceries(chosen: PlannedMeal[]): Promise<GroceryResult> {
    // A recipe planned twice is shopped for twice.
    const found = await Promise.all(chosen.map((m) => getRecipe(familyId, m.recipeId!)))
    const ingredientLines = found.flatMap((r) => (r ? lines(r.ingredients) : []))
    const listId = await groceryListId(familyId, userId, lists)
    const plan = groceryLines(ingredientLines, kitchen.staples, await openItemTexts(familyId, listId))
    await addItems(familyId, listId, userId, plan.lines, null, { categories: lists.find((l) => l.id === listId)?.categories })
    return { added: plan.lines.length, staples: plan.staples.length, onList: plan.onList.length }
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <div className="meals__tools">
        <button type="button" className="button" onClick={() => setShopping(true)}>
          <CartIcon size={18} /> Groceries for upcoming meals
        </button>
      </div>
      <MealPlanner
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        today={today}
        plans={plans}
        recipeTitles={recipes.map((r) => r.t)}
        hasRecipe={(text) => !!findEntry(recipes, text)}
        onOpenRecipe={(text) => {
          const e = findEntry(recipes, text)
          if (e) getRecipe(familyId, e.id).then(setOpen, (err) => setError(err instanceof Error ? err.message : String(err)))
        }}
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onSave={(date, plan) =>
          saveMealPlan(familyId, date, plan, userId).catch((e) => setError(e instanceof Error ? e.message : String(e)))
        }
      />
      {shopping && <MealGroceries today={today} days={shopDays} onDays={setShopDays} meals={meals} onAdd={addGroceries} onClose={() => setShopping(false)} />}
      {open && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpen(null)}>
          <div className="overlay__panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-button overlay__close" onClick={() => setOpen(null)} aria-label="Close recipe">
              <CloseIcon size={22} />
            </button>
            <RecipeView recipe={open} today={today} />
          </div>
        </div>
      )}
    </>
  )
}
