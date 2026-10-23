import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { getKitchen, saveKitchen } from '../recipes/kitchenApi'
import { structured, type RecipeDraft } from '../recipes/recipesApi'
import { STARTER_RECIPES, STARTER_RECIPES_VERSION, type StarterRecipe } from './starterRecipes'

/** A starter recipe as the recipe draft the app saves (credited when it's adapted). */
export function starterDraft(r: StarterRecipe): RecipeDraft {
  return {
    title: r.title,
    ingredients: r.ingredients.join('\n'),
    steps: r.steps.join('\n'),
    servings: r.servings,
    minutes: r.minutes,
    url: r.from?.url ?? null,
    yieldText: r.yieldText ?? null,
    notes: [r.notes, r.from ? `Adapted from ${r.from.siteName}; steps rewritten for this app.` : null].filter(Boolean).join(' ') || null,
    source: r.from ? { type: 'online', siteName: r.from.siteName, url: r.from.url } : { type: 'manual' },
  }
}

let running: Promise<number> | null = null

/**
 * Gives the household the starter recipes, once (Settings → Kitchen remembers which set):
 * each is saved as starter_<id> unless it's already there, so nothing the household changed is
 * overwritten and one they deleted isn't brought back by a later visit. Resolves with how many
 * were added.
 */
export function seedStarterRecipes(familyId: string, userId: string): Promise<number> {
  running ??= (async () => {
    const kitchen = await getKitchen(familyId)
    if (kitchen.starterRecipes >= STARTER_RECIPES_VERSION) return 0
    const col = collection(db, 'families', familyId, 'recipes')
    const have = await Promise.all(STARTER_RECIPES.map((r) => getDoc(doc(col, `starter_${r.id}`)).then((s) => s.exists())))
    const missing = STARTER_RECIPES.filter((_, i) => !have[i])
    if (missing.length) {
      const batch = writeBatch(db)
      for (const r of missing) {
        const draft = starterDraft(r)
        const { source, notes, yieldText, ...rest } = draft
        batch.set(doc(col, `starter_${r.id}`), {
          title: rest.title,
          ingredients: rest.ingredients,
          steps: rest.steps,
          servings: rest.servings,
          minutes: rest.minutes,
          url: rest.url,
          source,
          notes,
          yieldText,
          ...structured(draft),
          createdBy: userId,
          createdAt: serverTimestamp(),
        })
      }
      await batch.commit()
    }
    await saveKitchen(familyId, { ...kitchen, starterRecipes: STARTER_RECIPES_VERSION })
    return missing.length
  })().finally(() => {
    running = null
  })
  return running
}
