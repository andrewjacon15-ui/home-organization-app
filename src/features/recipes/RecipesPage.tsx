import { useEffect, useRef, useState } from 'react'
import { ONLINE_SEARCH } from '@shared/features.js'
import { DEFAULT_KITCHEN } from '@shared/recipes/kitchen.js'
import { useToday } from '../../lib/hooks'
import { addItems, groceryListId, watchLists, type FamilyList } from '../lists/listsApi'
import { importRecipe, rebuildCatalog, saveTags, setFavorite, watchCatalog, type CatalogEntry } from './catalog'
import { CookingMode } from './CookingMode'
import { KitchenSearch, WebSearch } from './Finder'
import { findOnline, watchKitchen, type OnlineResult } from './kitchenApi'
import { deleteRecipe, getRecipe, markReviewed, planRecipe, saveRecipe, watchRecipe, type Recipe } from './recipesApi'
import { RecipeBook } from './RecipeBook'
import { RecipeHome, RecipeTrail, type RecipeView } from './RecipeHome'
import { takeRecipesFilter } from './recipesFilter'

/**
 * Recipes: three ways in (our recipes, what's in my kitchen, search the web), each one
 * level down from the start, with "‹ Recipes" always one tap back. Any recipe can open the
 * cooking screen.
 */
export function RecipesPage({ familyId, userId }: { familyId: string; userId: string }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [current, setCurrent] = useState<Recipe | null>(null)
  const [cooking, setCooking] = useState<{ recipe: Recipe; scale: number; oneStep: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  // Settings → Cookbooks → "N need review" opens straight onto the review list.
  const [initialFilter] = useState<'all' | 'review'>(() => takeRecipesFilter())
  const [view, setView] = useState<RecipeView>(initialFilter === 'review' ? 'book' : 'home')
  const [lists, setLists] = useState<FamilyList[]>([])
  const rebuilding = useRef(false)
  const [kitchen, setKitchen] = useState(DEFAULT_KITCHEN)

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  const go = (v: RecipeView) => {
    setView(v)
    document.querySelector('.app')?.scrollTo?.(0, 0)
  }
  const open = (id: string) => {
    setSelected(id)
    go('book')
  }

  // The catalog index (a few documents); built once on the server for families that predate it.
  useEffect(
    () =>
      watchCatalog(familyId, (next, current) => {
        setEntries(next)
        if (!current && !rebuilding.current) {
          rebuilding.current = true
          rebuildCatalog(familyId).catch(report)
        }
      }),
    [familyId],
  )
  // Only the open recipe is read in full.
  useEffect(() => {
    if (selected) return watchRecipe(familyId, selected, setCurrent)
  }, [familyId, selected])
  useEffect(() => watchKitchen(familyId, setKitchen), [familyId])
  // The grocery list is only needed when adding to it; this listener is two small documents.
  useEffect(() => watchLists(familyId, setLists), [familyId])

  // A web recipe joins the catalog only when the family actually cooks it.
  const cookOnline = async (r: OnlineResult) => {
    const { id } = await importRecipe(familyId, r.url)
    setSelected(id)
    const saved = await getRecipe(familyId, id)
    if (saved) setCooking({ recipe: saved, scale: 1, oneStep: false })
    return id
  }

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      {view === 'home' ? (
        <RecipeHome entries={entries} onlineReady={ONLINE_SEARCH} onPick={go} onOpen={open} />
      ) : (
        <RecipeTrail view={view} onHome={() => go('home')} />
      )}
      {view === 'book' && (
        <RecipeBook
          entries={entries}
          selected={selected}
          current={current}
          onSelect={setSelected}
          today={today}
          onSave={(draft, id) => saveRecipe(familyId, userId, draft, id).catch((e) => void report(e))}
          onDelete={(r) => deleteRecipe(familyId, r.id).catch(report)}
          onMarkReviewed={(r) => markReviewed(familyId, r.id).catch(report)}
          onFavorite={(id, fav) => setFavorite(familyId, id, fav).catch(report)}
          onSaveTags={(r, tags) => saveTags(familyId, r.id, tags).catch(report)}
          initialFilter={initialFilter}
          onCook={(recipe, o) => setCooking({ recipe, ...o })}
          onPlan={(r, date, slot) => planRecipe(familyId, userId, date, slot, r.title).catch(report)}
          onAddToGrocery={async (_r, items) => {
            try {
              const listId = await groceryListId(familyId, userId, lists)
              // Grocery lists with store aisles file each ingredient under its aisle.
              await addItems(familyId, listId, userId, items, null, { categories: lists.find((l) => l.id === listId)?.categories })
              return items.length
            } catch (e) {
              report(e)
              return 0
            }
          }}
        />
      )}
      {view === 'kitchen' && (
        <KitchenSearch
          entries={entries ?? []}
          staples={kitchen.staples}
          onOpen={open}
          onFindOnline={ONLINE_SEARCH ? (have) => findOnline(familyId, { have }) : undefined}
          onCookOnline={cookOnline}
        />
      )}
      {view === 'web' && (
        <WebSearch
          onFind={ONLINE_SEARCH ? (query) => findOnline(familyId, { query }) : undefined}
          onCookOnline={cookOnline}
          onImport={(url) => importRecipe(familyId, url)}
          onOpen={open}
        />
      )}
      {cooking && <CookingMode familyId={familyId} userId={userId} recipe={cooking.recipe} scale={cooking.scale} oneStep={cooking.oneStep} onClose={() => setCooking(null)} />}
    </>
  )
}
