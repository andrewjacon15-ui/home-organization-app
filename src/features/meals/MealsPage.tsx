import { useEffect, useState } from 'react'
import { DEFAULT_KITCHEN } from '@shared/recipes/kitchen.js'
import { CartIcon, CloseIcon, MealsIcon, RandomIcon } from '../../components/Icons'
import { addItems, groceryListId, openItemTexts, watchLists, type FamilyList } from '../lists/listsApi'
import { watchKitchen } from '../recipes/kitchenApi'
import { MealGroceries } from './MealGroceries'
import { MealTemplates, type ApplyOptions, type ApplyResult } from './MealTemplates'
import { pickMeals, type Wanted } from './randomize'
import { shoppingPlan } from './shopping'
import { applyTemplate, deleteTemplate, isEmptyPlan, mealsUsed, saveTemplate, templateFromWeek, updateTemplate, watchTemplates, type MealTemplate, type TemplateDraft } from './templates'
import { plannedMeals, type PlannedMeal, type PlannedSlot } from './upcomingMeals'
import { addDays, daysBetween, fromDateKey, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'
import { getMealPlans, saveMealPlan, watchMealPlans } from './mealsApi'
import { findEntry, watchCatalog, type CatalogEntry } from '../recipes/catalog'
import { getRecipe, type Recipe } from '../recipes/recipesApi'
import { RecipeView } from '../recipes/RecipeBook'
import { useUndo } from '../../lib/undo'

interface Props {
  familyId: string
  userId: string
}

const EMPTY: MealPlan = { breakfast: '', lunch: '', dinner: '', notes: '' }
const SLOTS: PlannedSlot[] = ['breakfast', 'lunch', 'dinner']
const short = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function MealsPage({ familyId, userId }: Props) {
  const { offer } = useUndo()
  const today = useToday()
  const { settings } = useSettings()
  const currentWeekStart = startOfWeek(today, settings.weekStartsOn)
  // An offset (not a fixed date) so the wall display rolls to the new week on its own.
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = addDays(currentWeekStart, weekOffset * 7)
  const [plans, setPlans] = useState<Record<string, MealPlan>>({})
  const [error, setError] = useState<string | null>(null)
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  // Recipe titles come from the catalog index (a few documents); a recipe is read only when opened.
  const [recipes, setRecipes] = useState<CatalogEntry[]>([])
  const [open, setOpen] = useState<Recipe | null>(null)
  // Pantry staples, how many the household cooks for, and what never to pick (one small document).
  const [kitchen, setKitchen] = useState(DEFAULT_KITCHEN)

  useEffect(() => watchCatalog(familyId, setRecipes), [familyId])
  useEffect(() => watchKitchen(familyId, setKitchen), [familyId])
  useEffect(() => watchMealPlans(familyId, weekStart, addDays(weekStart, 6), setPlans), [familyId, weekStart])

  // Groceries for upcoming meals: its own window of days from today, read only while open.
  const [shopping, setShopping] = useState(false)
  const [shopDays, setShopDays] = useState(7)
  const [upcoming, setUpcoming] = useState<{ key: string; plans: Record<string, MealPlan> } | null>(null)
  const [lists, setLists] = useState<FamilyList[]>([])
  const shopKey = `${today}+${shopDays}`
  useEffect(() => {
    if (!shopping) return
    return watchMealPlans(familyId, today, addDays(today, shopDays - 1), (plans) => setUpcoming({ key: shopKey, plans }))
  }, [familyId, shopping, today, shopDays, shopKey])
  // Meal plan templates (read only while their sheet is open).
  const [templating, setTemplating] = useState(false)
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  useEffect(() => (templating ? watchTemplates(familyId, setTemplates) : undefined), [familyId, templating])
  // The grocery list, for either sheet.
  const needLists = shopping || templating
  useEffect(() => (needLists ? watchLists(familyId, setLists) : undefined), [familyId, needLists])
  const meals = upcoming?.key === shopKey ? plannedMeals(upcoming.plans, today, shopDays, (text) => findEntry(recipes, text)?.id ?? null) : null

  /** The combined grocery list for these meals, scaled to `people`, to look over before adding. */
  async function reviewGroceries(chosen: Pick<PlannedMeal, 'date' | 'slot' | 'text' | 'recipeId'>[], people: number | null) {
    // A recipe planned twice is shopped for twice.
    const found = await Promise.all(chosen.map(async (meal) => ({ meal, recipe: meal.recipeId ? await getRecipe(familyId, meal.recipeId) : null })))
    const listId = await groceryListId(familyId, userId, lists)
    return shoppingPlan(found, people, kitchen.staples, await openItemTexts(familyId, listId))
  }

  async function addGroceries(lines: string[]) {
    const listId = await groceryListId(familyId, userId, lists)
    // Grocery lists with store aisles file each line under its aisle.
    await addItems(familyId, listId, userId, lines, null, { list: lists.find((l) => l.id === listId) })
  }

  /**
   * Picks recipes for these meals at random from the recipe book: never one already in `taken`,
   * nothing on the avoid list, and (while there's anything else) nothing from the last two weeks.
   */
  async function pick(wanted: Wanted[], taken: string[]) {
    const before = await getMealPlans(familyId, addDays(today, -14), addDays(today, -1)).catch(() => ({}) as Record<string, MealPlan>)
    const recent = Object.values(before).flatMap((p) => SLOTS.map((s) => p[s]).filter(Boolean))
    return pickMeals(recipes, wanted, { taken, recent, avoid: kitchen.avoid })
  }

  /** Saves changed days and offers to put them back as they were. */
  async function saveDays(changes: Record<string, MealPlan>, current: Record<string, MealPlan>, message: string) {
    const was = Object.fromEntries(Object.keys(changes).map((date) => [date, current[date] ?? EMPTY]))
    await Promise.all(Object.entries(changes).map(([date, plan]) => saveMealPlan(familyId, date, plan, userId)))
    offer(message, async () => {
      await Promise.all(Object.entries(was).map(([date, plan]) => saveMealPlan(familyId, date, plan, userId)))
    })
  }

  const weekTitles = Object.values(plans).flatMap((p) => SLOTS.map((s) => p[s]).filter(Boolean))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const emptyDinners = days.filter((d) => d >= today && !plans[d]?.dinner)

  /** Fills the week's empty dinners (from today on) with recipes from the book. */
  async function randomizeDinners() {
    try {
      const picked = await pick(
        emptyDinners.map((day) => ({ day, slot: 'dinner' })),
        weekTitles,
      )
      const changes = Object.fromEntries(Object.entries(picked).map(([k, title]) => {
        const day = k.split(':')[0]
        return [day, { ...(plans[day] ?? EMPTY), dinner: title }]
      }))
      if (!Object.keys(changes).length) return setError(recipes.length ? 'Every recipe that suits dinner is already planned.' : 'Add some recipes in Recipes first, then the randomizer can choose from them.')
      await saveDays(changes, plans, `Planned ${plural(Object.keys(changes).length, 'dinner')} at random`)
    } catch (e) {
      report(e)
    }
  }

  /** One meal at random (a different recipe than the one there now). */
  async function randomizeOne(date: string, slot: PlannedSlot) {
    try {
      const picked = await pick([{ day: date, slot }], weekTitles)
      const title = picked[`${date}:${slot}`]
      if (!title) return setError('No other recipe suits that meal yet.')
      const plan = plans[date] ?? EMPTY
      await saveDays({ [date]: { ...plan, [slot]: title } }, plans, `${title} for ${fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long' })}`)
    } catch (e) {
      report(e)
    }
  }

  /** Puts a template on a week, then (if asked) adds up its groceries to look over. */
  async function applyToWeek(t: MealTemplate, o: ApplyOptions): Promise<ApplyResult> {
    const current = o.weekStart === weekStart ? plans : await getMealPlans(familyId, o.weekStart, addDays(o.weekStart, 6))
    const { changes, added } = applyTemplate(t, o.weekStart, current, o.mode)
    const label = `${short(o.weekStart)} – ${short(addDays(o.weekStart, 6))}`
    // Show the week it went on.
    setWeekOffset(Math.round(daysBetween(currentWeekStart, o.weekStart) / 7))
    const n = Object.keys(changes).length
    if (n) await saveDays(changes, current, `Planned ${label} from “${t.name}”`)
    const message = n ? `Planned ${plural(n, 'day')} of ${label} from “${t.name}”.` : `Nothing to change: ${label} already has those meals.`
    if (!o.groceries) return { message }
    const withRecipes = added.map((m) => ({ ...m, recipeId: findEntry(recipes, m.text)?.id ?? null })).filter((m) => m.recipeId)
    if (!withRecipes.length) return { message: `${message} None of its meals are saved recipes, so there's nothing to shop for.` }
    return { message, groceries: { plan: await reviewGroceries(withRecipes, o.people), people: o.people } }
  }

  const fromWeek: TemplateDraft | null = days.every((d) => !plans[d] || isEmptyPlan(plans[d]))
    ? null
    : (() => {
        const tdays = templateFromWeek(plans, weekStart)
        return { name: '', days: tdays, people: kitchen.people, meals: mealsUsed(tdays) }
      })()

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <div className="meals__tools">
        <button type="button" className="button" onClick={() => setTemplating(true)}>
          <MealsIcon size={18} /> Templates
        </button>
        <button type="button" className="button" disabled={emptyDinners.length === 0} onClick={() => void randomizeDinners()} title={emptyDinners.length ? undefined : 'Every dinner from today on is planned'}>
          <RandomIcon size={18} /> Randomize empty dinners
        </button>
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
          if (e) getRecipe(familyId, e.id).then(setOpen, report)
        }}
        onRandomize={recipes.length ? (date, slot) => void randomizeOne(date, slot) : undefined}
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onSave={(date, plan) => saveMealPlan(familyId, date, plan, userId).catch(report)}
      />
      {templating && (
        <MealTemplates
          weekStart={weekStart}
          currentWeekStart={currentWeekStart}
          weekStartsOn={settings.weekStartsOn}
          fromWeek={fromWeek}
          templates={templates}
          titles={recipes.map((r) => r.t)}
          defaultPeople={kitchen.people}
          pick={pick}
          onSave={async (draft, id) => {
            await (id ? updateTemplate(familyId, id, draft) : saveTemplate(familyId, userId, draft))
          }}
          onApply={applyToWeek}
          onAddGroceries={addGroceries}
          onDelete={(t) => void deleteTemplate(familyId, t.id).then((r) => offer(`Deleted the template “${t.name}”`, r), report)}
          onClose={() => setTemplating(false)}
        />
      )}
      {shopping && (
        <MealGroceries
          today={today}
          days={shopDays}
          onDays={setShopDays}
          meals={meals}
          defaultPeople={kitchen.people}
          onReview={reviewGroceries}
          onAdd={addGroceries}
          onClose={() => setShopping(false)}
        />
      )}
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
