/**
 * "What can I make?" → Online: search the family's recipe sites (Brave Search API, `site:`
 * filters), read each candidate page politely (web/fetcher.ts), keep only real schema.org
 * recipes, score them by ingredient match and popularity, return the best. Nothing is saved
 * to the catalog here; the family saves a recipe when they choose to cook it.
 *
 * Costs are capped: results are cached for 7 days (webCache, server-only), and searches stop
 * for the month at MONTHLY_CAP, below Brave's monthly free credit.
 */
import { hash } from './cookbooks.js'
import { parseIngredient } from './shared/recipes/ingredient.js'
import { onSite, readKitchen } from './shared/recipes/kitchen.js'
import { matchRecipe, onlineScore, tokenizeHave } from './shared/recipes/matcher.js'
import { fetchPage, type FetcherDeps } from './web/fetcher.js'
import { readRecipePage, type WebRecipe } from './web/schemaRecipe.js'

/** Brave gives $5 of free credit a month = 1,000 searches; stop well before it. */
export const MONTHLY_CAP = 900
const CACHE_MS = 7 * 86_400_000
const MAX_PAGES = 8
const TOP = 3

export interface OnlineResult {
  url: string
  title: string
  siteName: string | null
  credit: string | null
  image: string | null
  minutes: number | null
  servings: number | null
  yieldText: string | null
  rating: { value: number; count: number } | null
  ingredientLines: string[]
  steps: string[]
  match: number
  have: string[]
  missing: string[]
  score: number
}

/** A parsed recipe kept in the cache (structured facts only). */
type Cached = Omit<OnlineResult, 'match' | 'have' | 'missing' | 'score'> & { keys: string[]; families: string[] }

export interface SearchStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  kitchen(familyId: string): Promise<unknown>
  getCache(key: string): Promise<{ recipes: Cached[]; at: number } | null>
  putCache(key: string, recipes: Cached[], at: number): Promise<void>
  /** Counts one search against this month; false when the cap is reached. */
  takeSearch(month: string, cap: number): Promise<boolean>
}

export interface SearchDeps {
  store: SearchStore
  fetcher: FetcherDeps
  /** Web search: result URLs for a query. Null when online search isn't set up. */
  search: ((query: string) => Promise<string[]>) | null
  now?: () => number
}

export class SearchError extends Error {
  constructor(
    public code: 'permission-denied' | 'invalid-argument' | 'failed-precondition' | 'resource-exhausted' | 'unavailable',
    message: string,
  ) {
    super(message)
  }
}

/** Brave Search API: web results for a query (key from Secret Manager). */
export function braveSearch(apiKey: string) {
  return async (query: string): Promise<string[]> => {
    const url = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: '20', safesearch: 'strict' })}`
    const res = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey } })
    if (res.status === 429) throw new SearchError('resource-exhausted', 'Online search is busy. Try again in a minute.')
    if (!res.ok) throw new SearchError('unavailable', `Online search failed (${res.status}).`)
    const body = (await res.json()) as { web?: { results?: { url?: string }[] } }
    return (body.web?.results ?? []).map((r) => r.url ?? '').filter(Boolean)
  }
}

function toCached(r: WebRecipe): Cached {
  const items = r.ingredientLines.slice(0, 60).map((l) => parseIngredient(l))
  return {
    url: r.canonicalUrl,
    title: r.title.slice(0, 120),
    siteName: r.siteName,
    credit: [r.author, r.siteName].filter(Boolean).join(', ') || null,
    image: r.image,
    minutes: r.totalMinutes ?? (r.prepMinutes != null || r.cookMinutes != null ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) : null),
    servings: r.servings,
    yieldText: r.yieldText,
    rating: r.rating,
    ingredientLines: r.ingredientLines.slice(0, 60).map((l) => l.replace(/\s*\(\$\s?\d+(?:\.\d+)?\)/g, '').slice(0, 300)),
    steps: r.steps.slice(0, 60).map((s) => s.slice(0, 2000)),
    keys: items.map((i) => i.key),
    families: items.map((i) => i.family),
  }
}

/** Runs async work with at most `n` at once. */
async function pool<T, R>(items: T[], n: number, work: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await work(items[i])
      }
    }),
  )
  return out
}

/** Callable: the best online recipes for what they have. */
export async function findOnlineRecipes(deps: SearchDeps, uid: string | undefined, data: { familyId?: unknown; have?: unknown }) {
  if (!uid) throw new SearchError('permission-denied', 'Sign in first.')
  const familyId = data.familyId
  if (typeof familyId !== 'string' || !familyId || familyId.length > 100) throw new SearchError('invalid-argument', 'familyId is required.')
  if (!(await deps.store.isMember(familyId, uid))) throw new SearchError('permission-denied', 'Not a member of this family.')
  if (!deps.search) throw new SearchError('failed-precondition', "Online search isn't set up yet.")
  const text = typeof data.have === 'string' ? data.have.slice(0, 1000) : ''
  const have = tokenizeHave(text)
  if (!have.length) throw new SearchError('invalid-argument', 'Tell me a few ingredients you have.')

  const kitchen = readKitchen(await deps.store.kitchen(familyId))
  const sites = kitchen.sites.length ? kitchen.sites : []
  if (!sites.length) throw new SearchError('failed-precondition', 'Add some recipe sites in Settings → Kitchen first.')
  const now = (deps.now ?? Date.now)()
  const keys = have.map((h) => h.key).slice(0, 8)
  const cacheKey = `q_${hash([...keys].sort().join('|') + '#' + [...sites].sort().join(','))}`

  let recipes: Cached[]
  const cached = await deps.store.getCache(cacheKey)
  if (cached && now - cached.at < CACHE_MS) {
    recipes = cached.recipes
  } else {
    if (!(await deps.store.takeSearch(new Date(now).toISOString().slice(0, 7), MONTHLY_CAP))) {
      throw new SearchError('resource-exhausted', "This month's online searches are used up (kept under the free allowance). Cookbook search still works.")
    }
    const query = `${keys.join(' ')} recipe (${sites.slice(0, 12).map((s) => `site:${s}`).join(' OR ')})`
    const urls = [...new Set((await deps.search(query)).filter((u) => onSite(u, sites)))].slice(0, MAX_PAGES)
    const pages = await pool(urls, 4, async (u) => {
      try {
        const page = await fetchPage(deps.fetcher, u)
        const r = readRecipePage(page.html, page.url)
        // Only real structured recipes: a page-text guess isn't good enough to recommend.
        return r && r.method !== 'page' && r.ingredientLines.length >= 2 ? toCached(r) : null
      } catch {
        return null
      }
    })
    recipes = [...new Map(pages.filter((r): r is Cached => !!r).map((r) => [r.url, r])).values()]
    await deps.store.putCache(cacheKey, recipes, now)
  }

  const results: OnlineResult[] = recipes
    .map(({ keys: k, families, ...r }) => {
      const m = matchRecipe(k, families, have, kitchen.staples)
      return { ...r, match: m.match, have: m.have, missing: m.missing, score: onlineScore(m.match, r.rating) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP)
  return { have: have.map((h) => h.key), results }
}
