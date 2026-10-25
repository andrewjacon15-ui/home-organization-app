import { useEffect, useRef, useState } from 'react'
import { DEFAULT_KITCHEN } from '@shared/recipes/kitchen.js'
import { CartIcon, CloseIcon, MealsIcon, RandomIcon } from '../../components/Icons'
import { addItems, applyGroceries, groceryListId, removeItems, watchItems, watchLists, type FamilyList, type ListItem, type NewItem } from '../lists/listsApi'
import { seedStarterRecipes } from './starterSeed'
import { isFirstStarter, STARTER_ALIASES } from './starterAliases'
import { watchKitchen } from '../recipes/kitchenApi'
import { MealGroceries } from './MealGroceries'
import { MealTemplates, type ApplyOptions, type ApplyResult } from './MealTemplates'
import { pickMeals, type Wanted } from './randomize'
import { mealGroceryChanges, mealsWithoutGroceries, shoppingPlan, staleGroceries } from './shopping'
import { applyTemplate, dayOnWeek, isDay, deleteTemplate, isEmptyPlan, mealsUsed, saveTemplate, templateFromWeek, templateMealsOn, updateTemplate, watchTemplates, type MealTemplate, type TemplateDraft } from './templates'
import { plannedMeals, type PlannedMeal, type PlannedSlot } from './upcomingMeals'
import { addDays, daysBetween, fromDateKey, startOfWeek } from '../../lib/dates'
import { useToday } from '../../lib/hooks'
import { useSettings } from '../settings/SettingsContext'
import type { MealPlan } from '../../types'
import { MealPlanner } from './MealPlanner'
import { getMealPlans, isBlankPlan, saveMealPlans, watchMealPlans } from './mealsApi'
import { findEntry, watchCatalog, type CatalogEntry } from '../recipes/catalog'
import { getRecipe, getRecipes, type Recipe } from '../recipes/recipesApi'
import { RecipeView } from '../recipes/RecipeBook'
import { useUndo, type Restore } from '../../lib/undo'

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
  // A short note after syncing groceries when there was nothing to change.
  const [notice, setNotice] = useState<string | null>(null)
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
  // The lists (a few small documents), and the grocery list's items, live: adding up groceries
  // and clearing meals decide from these at once instead of reading the list each time.
  useEffect(() => watchLists(familyId, setLists), [familyId])
  const grocery = lists.find((l) => l.kind === 'grocery')
  const [groceryItems, setGroceryItems] = useState<ListItem[]>([])
  const groceryId = grocery?.id
  useEffect(() => (groceryId ? watchItems(familyId, groceryId, setGroceryItems) : undefined), [familyId, groceryId])
  // The newest copy, for work that finishes after a recipe read.
  const groceryNow = useRef(groceryItems)
  groceryNow.current = groceryItems
  // While the templates sheet is open, this week and next are live too (a template goes on either).
  const [sheetPlans, setSheetPlans] = useState<Record<string, MealPlan>>({})
  useEffect(() => (templating ? watchMealPlans(familyId, currentWeekStart, addDays(currentWeekStart, 13), setSheetPlans) : undefined), [familyId, templating, currentWeekStart])
  // Recipes read for groceries stay for the visit (a week's worth comes in one read).
  const recipeCache = useRef(new Map<string, Recipe>())
  // Starters exactly as first shipped become the current version (their meals named after recipes).
  useEffect(() => {
    for (const t of templates) {
      const now = isFirstStarter(t)
      if (now) updateTemplate(familyId, t.id, { ...now, name: t.name, people: t.people }).catch(() => undefined)
    }
  }, [familyId, templates])
  // Every household starts with the recipes the starter templates use (once; see starterSeed.ts).
  useEffect(() => {
    seedStarterRecipes(familyId, userId).catch(() => undefined)
  }, [familyId, userId])
  /** The saved recipe a meal names: its title, or (meals planned from the first starters) its old name. */
  const recipeFor = (text: string) => findEntry(recipes, text) ?? findEntry(recipes, STARTER_ALIASES[text.trim().toLowerCase()] ?? '')
  const meals = upcoming?.key === shopKey ? plannedMeals(upcoming.plans, today, shopDays, (text) => recipeFor(text)?.id ?? null) : null

  /** Reads these recipes into the visit's cache (one read per 30), skipping ones already there. */
  async function loadRecipes(ids: (string | null | undefined)[]) {
    const cache = recipeCache.current
    const missing = [...new Set(ids.filter((id): id is string => !!id && !cache.has(id)))]
    if (missing.length) for (const r of await getRecipes(familyId, missing)) cache.set(r.id, r)
  }
  // Fetched ahead, while a sheet is open, so its grocery list adds up without waiting: the
  // templates' recipes, and the upcoming meals'.
  const templateRecipeIds = templates.flatMap((t) => t.days.flatMap((d) => SLOTS.map((s) => (d[s] ? recipeFor(d[s])?.id : undefined)))).filter(Boolean).sort().join(',')
  const upcomingRecipeIds = (meals ?? []).map((m) => m.recipeId).filter(Boolean).sort().join(',')
  const recipeIdsAhead = templating ? templateRecipeIds : shopping ? upcomingRecipeIds : ''
  useEffect(() => {
    if (recipeIdsAhead) loadRecipes(recipeIdsAhead.split(',')).catch(() => undefined)
    // loadRecipes only reads the cache and the household id; the ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeIdsAhead])

  /** The combined grocery list for these meals, scaled to `people`, to look over before adding. */
  async function reviewGroceries(chosen: Pick<PlannedMeal, 'date' | 'slot' | 'text' | 'recipeId' | 'people'>[], people: number | null | 'plan') {
    const cache = recipeCache.current
    await loadRecipes(chosen.map((m) => m.recipeId))
    // A recipe planned twice is shopped for twice.
    const found = chosen.map((meal) => ({ meal: { ...meal, people: meal.people ?? kitchen.people }, recipe: (meal.recipeId && cache.get(meal.recipeId)) || null }))
    const onList = groceryItems.filter((i) => !i.done).map((i) => i.text)
    return shoppingPlan(found, people, kitchen.staples, onList)
  }

  /** Adds lines to the grocery list. The device shows them at once; the server catches up behind. */
  async function addGroceries(lines: NewItem[]) {
    const listId = grocery?.id ?? (await groceryListId(familyId, userId, lists))
    // Grocery lists with store aisles file each line under its aisle.
    addItems(familyId, listId, userId, lines, null, { list: lists.find((l) => l.id === listId) }).catch(report)
  }

  /**
   * Puts these meals' groceries straight on the list (a meal typed in or picked at random, with
   * no list to look over): each saved recipe scaled for its day, pantry staples and what's on the
   * list by hand left off, and a line another meal already put there added into that item.
   * Items in `skip` are on their way off the list. Meals without a saved recipe add nothing.
   */
  async function addMealGroceries(meals: Pick<PlannedMeal, 'date' | 'slot' | 'text' | 'people'>[], skip: Set<string> = new Set()): Promise<{ count: number; restore: Restore } | null> {
    const withRecipes = meals.map((m) => ({ ...m, recipeId: recipeFor(m.text)?.id ?? null })).filter((m) => m.recipeId)
    if (!withRecipes.length) return null
    await loadRecipes(withRecipes.map((m) => m.recipeId))
    const cache = recipeCache.current
    const found = withRecipes.map((meal) => ({ meal: { ...meal, people: meal.people ?? kitchen.people }, recipe: cache.get(meal.recipeId!) ?? null }))
    const items = groceryNow.current.filter((i) => !skip.has(i.id))
    const byHand = items.filter((i) => !i.done && !i.meals?.length).map((i) => i.text)
    const { add, merge } = mealGroceryChanges(shoppingPlan(found, 'plan', kitchen.staples, byHand).plan.details, items)
    if (!add.length && !merge.length) return null
    const listId = grocery?.id ?? (await groceryListId(familyId, userId, lists))
    const list = lists.find((l) => l.id === listId) ?? { id: listId, title: 'Grocery List', kind: 'grocery' as const, sections: false, order: -1 }
    const { done, restore } = applyGroceries(familyId, list, userId, add, merge)
    done.catch(report)
    return { count: add.length + merge.length, restore }
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

  /** Puts these days on screen straight away (the snapshot that follows says the same). */
  function showPlans(changes: Record<string, MealPlan>) {
    const merge = (cur: Record<string, MealPlan>, all: boolean) => {
      const next = { ...cur }
      for (const [date, plan] of Object.entries(changes)) {
        if (!all && !(date in cur) && (date < weekStart || date > addDays(weekStart, 6))) continue
        if (isBlankPlan(plan)) delete next[date]
        else next[date] = plan
      }
      return next
    }
    setPlans((cur) => merge(cur, false))
    setSheetPlans((cur) => merge(cur, true))
  }

  /**
   * The grocery items, not bought yet, whose meals are all gone once `changes` are saved: the ones
   * changed now, or cleared before. One a meal still on the plan needs, stays (as does one whose
   * other meals are on days not loaded here: better kept than wrongly taken off).
   */
  function groceriesOnlyFor(gone: string[], known: Record<string, MealPlan>) {
    const goneSet = new Set(gone)
    const stillPlanned = (k: string) => {
      if (goneSet.has(k)) return false
      const [date, slot] = k.split(':') as [string, PlannedSlot]
      return date in known ? !!known[date]?.[slot] : true
    }
    return groceryItems.filter((i) => !i.done && i.meals?.length && i.meals.some((k) => goneSet.has(k)) && !i.meals.some(stillPlanned))
  }

  /**
   * Saves changed days and offers to put them back as they were. Meals it takes away (or
   * replaces) also take their grocery items off the list: the ones added only for those meals and
   * not bought yet. Undo brings back both. Nothing waits for the server: the device shows the
   * change at once and the writes go out behind it. Returns how many grocery items went.
   */
  function saveDays(changes: Record<string, MealPlan>, current: Record<string, MealPlan>, message: string, opts: { groceries?: boolean; quiet?: boolean } = {}): number {
    const was = Object.fromEntries(Object.keys(changes).map((date) => [date, current[date] ?? EMPTY]))
    const gone = Object.entries(changes).flatMap(([date, plan]) => SLOTS.filter((s) => was[date][s] && plan[s] !== was[date][s]).map((s) => `${date}:${s}`))
    const items = grocery && gone.length ? groceriesOnlyFor(gone, { ...sheetPlans, ...plans, ...current, ...changes }) : []
    const removed = grocery && items.length ? removeItems(familyId, grocery.id, items) : null
    removed?.done.catch(report)
    // `groceries`: meals put in here (typed, or picked at random) bring their recipe's groceries.
    const fresh = opts.groceries
      ? Object.entries(changes).flatMap(([date, plan]) => SLOTS.filter((s) => plan[s].trim() && plan[s] !== was[date][s]).map((slot) => ({ date, slot, text: plan[slot].trim(), people: plan.people ?? null })))
      : []
    const adding = fresh.some((m) => recipeFor(m.text))
      ? addMealGroceries(fresh, new Set(items.map((i) => i.id))).catch((e) => {
          report(e)
          return null
        })
      : null
    // On screen at once (the saved copy follows and agrees), then saved in one batch.
    showPlans(changes)
    saveMealPlans(familyId, changes, userId).catch(report)
    // A plain edit (no groceries touched) needs no Undo: typing it back is as quick.
    if (opts.quiet && !items.length && !adding) return items.length
    const its = fresh.length > 1 ? 'their' : 'its'
    const text = adding
      ? `${message}, and ${items.length ? 'swapped' : 'added'} ${its} groceries on the list`
      : items.length
        ? `${message}, and took ${plural(items.length, 'grocery item')} off the list`
        : message
    offer(text, async () => {
      showPlans(was)
      const added = await adding
      await Promise.all([saveMealPlans(familyId, was, userId), removed?.restore(), added?.restore()])
    })
    return items.length
  }

  /**
   * Checks the grocery list against this week's meals: groceries added for meals that are gone
   * come off, and meals from today on with a saved recipe and nothing on the list get theirs.
   */
  async function syncGroceries() {
    const stale = staleGroceries(groceryItems, plans, days)
    const missing = mealsWithoutGroceries(groceryItems, plans, days, today)
    const removed = grocery && stale.length ? removeItems(familyId, grocery.id, stale) : null
    removed?.done.catch(report)
    try {
      const added = await addMealGroceries(missing, new Set(stale.map((i) => i.id)))
      if (!removed && !added) {
        setNotice('The grocery list already matches this week’s meals.')
        return
      }
      setNotice(null)
      const parts = [added && `added ${plural(added.count, 'grocery line')}`, removed && `took off ${plural(stale.length, 'item')} no meal needs`].filter(Boolean)
      offer(`Synced groceries: ${parts.join(' and ')}`, async () => {
        await Promise.all([removed?.restore(), added?.restore()])
      })
    } catch (e) {
      report(e)
    }
  }

  /** Clears these meals (all of a day's, notes too, when `notes` names the day). */
  function clearMeals(keys: string[], notes: string[], message: string, current = plans) {
    const changes: Record<string, MealPlan> = {}
    for (const k of keys) {
      const [date, slot] = k.split(':') as [string, PlannedSlot]
      changes[date] = { ...(changes[date] ?? current[date] ?? EMPTY), [slot]: '' }
    }
    for (const date of notes) changes[date] = { ...(changes[date] ?? current[date] ?? EMPTY), notes: '' }
    return Object.keys(changes).length ? saveDays(changes, current, message) : 0
  }

  const dayName = (date: string) => fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long' })
  const keysOf = (date: string) => SLOTS.filter((s) => plans[date]?.[s]).map((s) => `${date}:${s}`)

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
      saveDays(changes, plans, `Planned ${plural(Object.keys(changes).length, 'dinner')} at random`, { groceries: true })
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
      saveDays({ [date]: { ...plan, [slot]: title } }, plans, `${title} for ${dayName(date)}`, { groceries: true })
    } catch (e) {
      report(e)
    }
  }

  /** Takes a template's meals back off the week on screen: only the ones still as it planned them. */
  async function removeFromWeek(t: MealTemplate): Promise<string> {
    const { keys, notes } = templateMealsOn(t, weekStart, plans)
    const items = clearMeals(keys, notes, `Removed “${t.name}” from ${short(weekStart)} – ${short(addDays(weekStart, 6))}`)
    return `Took ${plural(keys.length, 'meal')} from “${t.name}” off this week${items ? ` and ${plural(items, 'grocery item')} off the list` : ''}.`
  }

  /** Puts a template on a week, then (if asked) adds up its groceries to look over. */
  async function applyToWeek(t: MealTemplate, o: ApplyOptions): Promise<ApplyResult> {
    // This week and next are already here; another week is read once.
    const loaded = { ...sheetPlans, ...plans }
    const covered = Array.from({ length: 7 }, (_, i) => addDays(o.weekStart, i)).every((d) => o.weekStart === weekStart || (d >= currentWeekStart && d <= addDays(currentWeekStart, 13)))
    const current = covered ? loaded : await getMealPlans(familyId, o.weekStart, addDays(o.weekStart, 6))
    // A day template goes on its one day (o.weekStart is that day).
    const { changes, added } = applyTemplate(isDay(t) ? dayOnWeek(t, o.weekStart) : t, o.weekStart, current, o.mode)
    // The days remember how many they're for, so later grocery lists come out right; the template
    // remembers the number chosen here for next time.
    if (o.people) for (const date of Object.keys(changes)) changes[date] = { ...changes[date], people: o.people }
    if (o.people !== t.people) updateTemplate(familyId, t.id, { name: t.name, days: t.days, people: o.people, meals: t.meals, kind: t.kind }).catch(report)
    const label = isDay(t) ? fromDateKey(o.weekStart).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : `${short(o.weekStart)} – ${short(addDays(o.weekStart, 6))}`
    // Show the week it went on, with its meals at once (they're here already; the watch catches up).
    const target = startOfWeek(o.weekStart, settings.weekStartsOn)
    if (target !== weekStart) {
      setPlans(Object.fromEntries(Array.from({ length: 7 }, (_, i) => addDays(target, i)).flatMap((d) => { const p = changes[d] ?? current[d]; return p && !isBlankPlan(p) ? [[d, p]] : [] })))
    }
    setWeekOffset(Math.round(daysBetween(currentWeekStart, target) / 7))
    const n = Object.keys(changes).length
    if (n) saveDays(changes, current, `Planned ${label} from “${t.name}”`)
    const message = n ? (isDay(t) ? `Planned ${label} from “${t.name}”.` : `Planned ${plural(n, 'day')} of ${label} from “${t.name}”.`) : `Nothing to change: ${label} already has those meals.`
    if (!o.groceries) return { message }
    const withRecipes = added.map((m) => ({ ...m, recipeId: recipeFor(m.text)?.id ?? null })).filter((m) => m.recipeId)
    if (!withRecipes.length) return { message: `${message} None of its meals are saved recipes, so there's nothing to shop for.` }
    return { message, groceries: { shopping: await reviewGroceries(withRecipes, o.people), people: o.people } }
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
      {notice && (
        <p className="muted" role="status">
          {notice} <button className="link" onClick={() => setNotice(null)}>Dismiss</button>
        </p>
      )}
      <div className="meals__tools">
        <button type="button" className="button" onClick={() => setTemplating(true)}>
          <MealsIcon size={18} /> Templates
        </button>
        <button type="button" className="button" disabled={emptyDinners.length === 0} onClick={() => void randomizeDinners()} title={emptyDinners.length ? undefined : 'Every dinner from today on is planned'}>
          <RandomIcon size={18} aria-hidden /> <span className="meals__tool-long">Randomize empty dinners</span><span className="meals__tool-short" aria-hidden>Randomize</span>
        </button>
        <button type="button" className="button" onClick={() => setShopping(true)}>
          <CartIcon size={18} aria-hidden /> <span className="meals__tool-long">Groceries for upcoming meals</span><span className="meals__tool-short" aria-hidden>Groceries</span>
        </button>
      </div>
      <MealPlanner
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        today={today}
        plans={plans}
        recipeTitles={recipes.map((r) => r.t)}
        hasRecipe={(text) => !!recipeFor(text)}
        onOpenRecipe={(text) => {
          const e = recipeFor(text)
          if (e) getRecipe(familyId, e.id).then(setOpen, report)
        }}
        onRandomize={recipes.length ? (date, slot) => void randomizeOne(date, slot) : undefined}
        onClearMeal={(date, slot) => void clearMeals([`${date}:${slot}`], [], `Cleared ${dayName(date)} ${slot}`)}
        onClearDay={(date) => void clearMeals(keysOf(date), plans[date]?.notes ? [date] : [], `Cleared ${dayName(date)}`)}
        onClearWeek={() =>
          void clearMeals(
            days.flatMap(keysOf),
            days.filter((d) => plans[d]?.notes),
            `Cleared ${short(weekStart)} – ${short(addDays(weekStart, 6))}`,
          )
        }
        onWeekChange={(start) => setWeekOffset(Math.round(daysBetween(currentWeekStart, start) / 7))}
        onSave={(date, plan) => {
          // "Tacos for Tuesday dinner" / "Cleared Tuesday dinner" (a meal typed in or erased).
          const slot = SLOTS.find((s) => plan[s] !== (plans[date]?.[s] ?? ''))
          const message = !slot ? `Updated ${dayName(date)}` : plan[slot] ? `${plan[slot]} for ${dayName(date)} ${slot}` : `Cleared ${dayName(date)} ${slot}`
          saveDays({ [date]: plan }, plans, message, { groceries: true, quiet: true })
        }}
        onSyncGroceries={() => void syncGroceries()}
      />
      {templating && (
        <MealTemplates
          weekStart={weekStart}
          currentWeekStart={currentWeekStart}
          weekStartsOn={settings.weekStartsOn}
          fromWeek={fromWeek}
          weekPlans={plans}
          onRemoveFromWeek={removeFromWeek}
          templates={templates}
          entries={recipes}
          today={today}
          defaultPeople={kitchen.people}
          pick={pick}
          onSave={async (draft, id) => {
            // Shown at once from the device's copy; the server catches up behind.
            void (id ? updateTemplate(familyId, id, draft) : saveTemplate(familyId, userId, draft)).catch(report)
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
