/**
 * "Paste a recipe link": fetch the page politely (web/fetcher.ts), read its schema.org
 * recipe (web/schemaRecipe.ts), parse the ingredients with the shared rules, auto-tag,
 * and save it to the family's catalog. The document ID comes from the page's canonical
 * URL, so importing the same recipe twice updates one entry instead of duplicating it.
 */
import { hash, tidyTitle } from './cookbooks.js'
import { parseIngredient } from './shared/recipes/ingredient.js'
import { autoTag } from './shared/recipes/tagger.js'
import { fetchPage, FetchError, type FetcherDeps } from './web/fetcher.js'
import { readRecipePage, type WebRecipe } from './web/schemaRecipe.js'

export interface WebRecipeStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  /** The existing recipe's flags, or null. */
  getRecipeFlags(familyId: string, id: string): Promise<{ edited: boolean; favorite: boolean; tagsEdited: boolean } | null>
  /** Creates or replaces the recipe (merge keeps fields we don't send, such as favorite). */
  saveRecipe(familyId: string, id: string, data: Record<string, unknown>): Promise<void>
}

export interface ImportDeps {
  store: WebRecipeStore
  fetcher: FetcherDeps
}

export class ImportError extends Error {
  constructor(
    public code: 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

const intIn = (v: number | null, lo: number, hi: number) => (v != null && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null)

/** The web recipe as a recipes/{id} document (same shape as cookbook recipes). */
export function webRecipeDoc(r: WebRecipe, uid: string): { id: string; data: Record<string, unknown> } {
  const id = `web_${hash(r.canonicalUrl)}`
  // Some sites append a price to each line ("2 tsp paprika ($0.20)"); that's not part of the recipe.
  const lines = r.ingredientLines
    .map((l) => l.replace(/\s*\(\$\s?\d+(?:\.\d+)?\)/g, '').slice(0, 300))
    .filter(Boolean)
    .slice(0, 80)
  const items = lines
    .filter((l) => !/:\s*$/.test(l))
    .map((l) => {
      const i = parseIngredient(l)
      return { raw: i.raw.slice(0, 300), qty: i.qty, qtyMax: i.qtyMax, unit: i.unit, name: i.name.slice(0, 120), note: i.note.slice(0, 200), key: i.key.slice(0, 80), family: i.family.slice(0, 80), known: i.known }
    })
  const steps = r.steps.map((s) => s.slice(0, 2000)).slice(0, 80)
  const title = tidyTitle(r.title || 'Untitled recipe').slice(0, 120)
  const total = r.totalMinutes ?? (r.prepMinutes != null || r.cookMinutes != null ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) : null)
  const credit = [r.author, r.siteName].filter(Boolean).join(', ').slice(0, 160) || null
  return {
    id,
    data: {
      title,
      ingredients: lines.join('\n').slice(0, 5000),
      steps: steps.join('\n').slice(0, 10000),
      servings: intIn(r.servings, 1, 100),
      minutes: intIn(total, 0, 10000),
      url: r.canonicalUrl.slice(0, 500),
      source: { type: 'online', url: r.canonicalUrl.slice(0, 500), siteName: r.siteName?.slice(0, 80) ?? null },
      dedupeKey: id,
      yieldText: r.yieldText?.slice(0, 120) ?? null,
      prepMinutes: intIn(r.prepMinutes, 0, 10000),
      cookMinutes: intIn(r.cookMinutes, 0, 10000),
      totalMinutes: intIn(r.totalMinutes, 0, 10000),
      items,
      stepList: steps,
      tags: autoTag({ title, items, hints: r.hints }),
      rating: r.rating,
      credit,
      image: r.image,
      // The page-text fallback is a best guess: ask the family to check it.
      confidence: r.method === 'page' ? 0.5 : 1,
      needsReview: r.method === 'page',
      edited: false,
      createdBy: uid,
    },
  }
}

/** Callable: import one recipe page into the family's catalog. */
export async function importRecipeUrl(deps: ImportDeps, uid: string | undefined, data: { familyId?: unknown; url?: unknown }) {
  if (!uid) throw new ImportError('permission-denied', 'Sign in first.')
  const familyId = data.familyId
  if (typeof familyId !== 'string' || !familyId || familyId.length > 100) throw new ImportError('invalid-argument', 'familyId is required.')
  if (!(await deps.store.isMember(familyId, uid))) throw new ImportError('permission-denied', 'Not a member of this family.')
  const url = typeof data.url === 'string' ? data.url.trim() : ''
  if (!url || url.length > 2000) throw new ImportError('invalid-argument', 'Paste a link to a recipe page.')

  let page: { url: string; html: string }
  try {
    page = await fetchPage(deps.fetcher, url)
  } catch (e) {
    if (e instanceof FetchError) throw new ImportError(e.reason === 'bad-url' || e.reason === 'blocked-address' ? 'invalid-argument' : e.reason === 'network' ? 'unavailable' : 'failed-precondition', e.message)
    throw e
  }
  const recipe = readRecipePage(page.html, page.url)
  if (!recipe || recipe.ingredientLines.length === 0) throw new ImportError('not-found', "Couldn't find a recipe on that page. You can add it by hand.")

  const { id, data: doc } = webRecipeDoc(recipe, uid)
  const existing = await deps.store.getRecipeFlags(familyId, id)
  // Already saved and changed by the family: keep their version.
  if (existing?.edited) return { id, title: doc.title, existed: true, needsReview: false }
  if (existing?.tagsEdited) delete doc.tags
  if (existing) delete doc.createdBy
  await deps.store.saveRecipe(familyId, id, doc)
  return { id, title: doc.title as string, existed: !!existing, needsReview: doc.needsReview as boolean }
}
