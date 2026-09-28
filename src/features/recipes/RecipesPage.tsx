import { useEffect, useState } from 'react'
import { useToday } from '../../lib/hooks'
import { addItems, groceryListId, watchLists, type FamilyList } from '../lists/listsApi'
import { deleteRecipe, lines, planRecipe, saveRecipe, watchRecipes, type Recipe } from './recipesApi'
import { RecipeBook } from './RecipeBook'

export function RecipesPage({ familyId, userId }: { familyId: string; userId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [error, setError] = useState<string | null>(null)
  const today = useToday()

  const [lists, setLists] = useState<FamilyList[]>([])

  useEffect(() => watchRecipes(familyId, setRecipes), [familyId])
  useEffect(() => watchLists(familyId, setLists), [familyId])

  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <RecipeBook
        recipes={recipes}
        today={today}
        onSave={(draft, id) => saveRecipe(familyId, userId, draft, id).catch((e) => void report(e))}
        onDelete={(r) => deleteRecipe(familyId, r.id).catch(report)}
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
