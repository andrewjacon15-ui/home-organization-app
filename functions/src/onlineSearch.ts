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
import { matchRecipe, onlineScore, popularity, searchScore, tokenizeHave } from './shared/recipes/matcher.js'
import { fetchPage, type FetcherDeps } from './web/fetcher.js'
import { readRecipePage, type WebRecipe } from './web/schemaRecipe.js'

/** Brave gives $5 of free credit a month = 1,000 searches; stop well before it. */
export const MONTHLY_CAP = 900
const CACHE_MS = 7 * 86_400_000
const MAX_PAGES = 8
const TOP = 5

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
  /** Where it came in the web search (1 = first). */
  searchRank: number | null
  /** Why it's shown, in plain words ("You have 4 of its 5 ingredients", "Rated 4.7★ by 3,214 cooks"). */
  reasons: string[]
  /** The ranking's parts, each 0–1 (match is null when searching for a dish). */
  parts: { match: number | null; rating: number; search: number }
}

/** A parsed recipe kept in the cache (structured facts only). */
type Cached = Omit<OnlineResult, 'match' | 'have' | 'missing' | 'score' | 'reasons' | 'parts'> & { keys: string[]; families: string[] }

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

function toCached(r: WebRecipe, searchRank: number): Cached {
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
    searchRank,
    keys: items.map((i) => i.key),
    families: items.map((i) => i.family),
  }
}

/** Runs async work with at most `n` at once. */
async function pool<T, R>(items: T[], n: number, work: (t: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await work(items[i], i)
      }
    }),
  )
  return out
}

const plural = (n: number, one: string) => `${n.toLocaleString('en-US')} ${one}${n === 1 ? '' : 's'}`

/** The plain-words reasons a result is shown. */
export function reasonsFor(r: { rating: OnlineResult['rating']; searchRank: number | null; minutes: number | null; siteName: string | null }, m: { have: string[]; missing: string[] } | null, of: number): string[] {
  const out: string[] = []
  if (m) {
    const needed = m.have.length + m.missing.length
    out.push(m.missing.length === 0 ? 'You have every ingredient' : `You have ${m.have.length} of its ${plural(needed, 'ingredient')}`)
  }
  if (r.rating?.value && r.rating.count) out.push(`Rated ${r.rating.value.toFixed(1)}★ by ${plural(r.rating.count, 'cook')}`)
  else out.push('Not rated yet')
  if (r.searchRank) out.push(`#${r.searchRank} of ${of} in web search${r.siteName ? ` (${r.siteName})` : ''}`)
  if (r.minutes) out.push(`Ready in ${r.minutes} min`)
  return out
}

/**
 * Callable: the best online recipes, either for what they have (`have`: ingredients) or
 * for a dish they name (`query`: "chicken tikka masala").
 */
export async function findOnlineRecipes(deps: SearchDeps, uid: string | undefined, data: { familyId?: unknown; have?: unknown; query?: unknown }) {
  if (!uid) throw new SearchError('permission-denied', 'Sign in first.')
  const familyId = data.familyId
  if (typeof familyId !== 'string' || !familyId || familyId.length > 100) throw new SearchError('invalid-argument', 'familyId is required.')
  if (!(await deps.store.isMember(familyId, uid))) throw new SearchError('permission-denied', 'Not a member of this family.')
  if (!deps.search) throw new SearchError('failed-precondition', "Online search isn't set up yet.")
  const dish = typeof data.query === 'string' ? data.query.replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : ''
  const text = typeof data.have === 'string' ? data.have.slice(0, 1000) : ''
  const have = dish ? [] : tokenizeHave(text)
  if (!dish && !have.length) throw new SearchError('invalid-argument', typeof data.query === 'string' ? 'Type the dish you want, like “chicken pot pie”.' : 'Tell me a few ingredients you have.')

  const kitchen = readKitchen(await deps.store.kitchen(familyId))
  const sites = kitchen.sites.length ? kitchen.sites : []
  if (!sites.length) throw new SearchError('failed-precondition', 'Add some recipe sites in Settings → Kitchen first.')
  const now = (deps.now ?? Date.now)()
  const keys = have.map((h) => h.key).slice(0, 8)
  const what = dish ? `dish:${dish.toLowerCase()}` : [...keys].sort().join('|')
  const cacheKey = `q_${hash(what + '#' + [...sites].sort().join(','))}`

  let recipes: Cached[]
  const cached = await deps.store.getCache(cacheKey)
  if (cached && now - cached.at < CACHE_MS) {
    recipes = cached.recipes
  } else {
    if (!(await deps.store.takeSearch(new Date(now).toISOString().slice(0, 7), MONTHLY_CAP))) {
      throw new SearchError('resource-exhausted', "This month's online searches are used up (kept under the free allowance). Cookbook search still works.")
    }
    const query = `${dish || keys.join(' ')} recipe (${sites.slice(0, 12).map((s) => `site:${s}`).join(' OR ')})`
    const urls = [...new Set((await deps.search(query)).filter((u) => onSite(u, sites)))].slice(0, MAX_PAGES)
    const pages = await pool(urls, 4, async (u, rank) => {
      try {
        const page = await fetchPage(deps.fetcher, u)
        const r = readRecipePage(page.html, page.url)
        // Only real structured recipes: a page-text guess isn't good enough to recommend.
        return r && r.method !== 'page' && r.ingredientLines.length >= 2 ? toCached(r, rank + 1) : null
      } catch {
        return null
      }
    })
    recipes = [...new Map(pages.filter((r): r is Cached => !!r).map((r) => [r.url, r])).values()]
    await deps.store.putCache(cacheKey, recipes, now)
  }

  // Search positions are counted among the pages that turned out to be recipes.
  const of = Math.max(1, ...recipes.map((r) => r.searchRank ?? 0))
  const results: OnlineResult[] = recipes
    .map(({ keys: k, families, ...r }) => {
      const searchRank = r.searchRank ?? null
      const m = dish ? null : matchRecipe(k, families, have, kitchen.staples)
      const search = searchScore(searchRank, of)
      return {
        ...r,
        searchRank,
        match: m?.match ?? 0,
        have: m?.have ?? [],
        missing: m?.missing ?? [],
        score: onlineScore(m ? m.match : null, r.rating, search),
        reasons: reasonsFor({ ...r, searchRank }, m, of),
        parts: { match: m ? m.match : null, rating: popularity(r.rating), search },
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP)
  return { have: have.map((h) => h.key), query: dish || null, results }
}
