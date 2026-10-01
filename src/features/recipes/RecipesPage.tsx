import { useEffect, useRef, useState } from 'react'
import { useToday } from '../../lib/hooks'
import { addItems, groceryListId, watchLists, type FamilyList } from '../lists/listsApi'
import { importRecipe, rebuildCatalog, saveTags, setFavorite, watchCatalog, type CatalogEntry } from './catalog'
import { deleteRecipe, lines, markReviewed, planRecipe, saveRecipe, watchRecipe, type Recipe } from './recipesApi'
import { RecipeBook } from './RecipeBook'
import { takeRecipesFilter } from './recipesFilter'

export function RecipesPage({ familyId, userId }: { familyId: string; userId: string }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [current, setCurrent] = useState<Recipe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = useToday()
  // Settings → Cookbooks → "N need review" opens straight onto the review list.
  const [initialFilter] = useState<'all' | 'review'>(() => takeRecipesFilter())
  const [lists, setLists] = useState<FamilyList[]>([])
  const rebuilding = useRef(false)

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

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
  // The grocery list is only needed when adding to it; this listener is two small documents.
  useEffect(() => watchLists(familyId, setLists), [familyId])

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
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
        onImport={(url) => importRecipe(familyId, url)}
        initialFilter={initialFilter}
        onPlan={(r, date, slot) => planRecipe(familyId, userId, date, slot, r.title).catch(report)}
        onAddToGrocery={async (r) => {
          const items = lines(r.ingredients)
          try {
            await addItems(familyId, await groceryListId(familyId, userId, lists), userId, items)
            return items.length
          } catch (e) {
            report(e)
            return 0
          }
        }}
      />
    </>
  )
}
