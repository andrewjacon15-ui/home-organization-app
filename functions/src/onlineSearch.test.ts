import { describe, expect, it, vi } from 'vitest'
import { findOnlineRecipes, MONTHLY_CAP, type SearchStore } from './onlineSearch.js'
import type { HostRecord, HostStore, HttpGet } from './web/fetcher.js'

const page = (name: string, ingredients: string[], rating?: [number, number]) => `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name,
  recipeIngredient: ingredients,
  recipeInstructions: ['Cook it.'],
  ...(rating ? { aggregateRating: { ratingValue: rating[0], ratingCount: rating[1] } } : {}),
})}</script></head><body></body></html>`

const PAGES: Record<string, string> = {
  'https://budgetbytes.com/robots.txt': '',
  'https://budgetbytes.com/fried-rice': page('Fried Rice', ['3 cups cooked rice', '2 eggs', '1 cup peas', '2 tbsp soy sauce'], [4.6, 900]),
  'https://budgetbytes.com/egg-bowl': page('Egg Rice Bowl', ['1 cup rice', '2 eggs'], [5, 2]),
  'https://allrecipes.com/robots.txt': '',
  'https://allrecipes.com/paella': page('Paella', ['2 cups rice', '1 lb shrimp', '1 lb chorizo', 'saffron', '1 onion'], [4.8, 5000]),
  'https://allrecipes.com/blog': '<html><body><p>Ten rice tips</p></body></html>',
  'https://random.example/rice': page('Off-list Rice', ['rice', 'eggs']),
}

const get: HttpGet = async (url) => (url in PAGES ? { status: 200, url, contentType: 'text/html', body: PAGES[url] } : { status: 404, url, contentType: 'text/html', body: '' })

class Hosts implements HostStore {
  rec = new Map<string, HostRecord>()
  async get(h: string) {
    return this.rec.get(h) ?? null
  }
  async saveRobots(h: string, robots: string | null, at: number) {
    this.rec.set(h, { robots, robotsAt: at })
  }
  async reserve(_h: string, now: number) {
    return now
  }
}

class Store implements SearchStore {
  cache = new Map<string, { recipes: never[]; at: number }>()
  searches = 0
  kitchenDoc: unknown = { sites: ['budgetbytes.com', 'allrecipes.com'], staples: ['salt', 'pepper', 'oil', 'water'] }
  async isMember(_f: string, uid: string) {
    return uid === 'andrew'
  }
  async kitchen() {
    return this.kitchenDoc
  }
  async getCache(k: string) {
    return this.cache.get(k) ?? null
  }
  async putCache(k: string, recipes: never[], at: number) {
    this.cache.set(k, { recipes, at })
  }
  async takeSearch(_m: string, cap: number) {
    if (this.searches >= cap) return false
    this.searches++
    return true
  }
}

const setup = () => {
  const store = new Store()
  const search = vi.fn(async () => ['https://budgetbytes.com/fried-rice', 'https://random.example/rice', 'https://allrecipes.com/paella', 'https://allrecipes.com/blog', 'https://budgetbytes.com/egg-bowl'])
  let t = 1_000_000
  return { store, search, deps: { store, search, fetcher: { get, hosts: new Hosts(), sleep: async () => undefined }, now: () => t }, advance: (ms: number) => void (t += ms) }
}

describe('findOnlineRecipes', () => {
  it('searches only the family sites, keeps real recipes, and ranks by match and popularity', async () => {
    const { deps, search } = setup()
    const res = await findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'rice, eggs, peas and soy sauce' })
    expect(search).toHaveBeenCalledWith(expect.stringMatching(/^rice egg pea soy sauce recipe \(site:budgetbytes\.com OR site:allrecipes\.com\)$/))
    expect(res.results.map((r) => r.title)).toEqual(['Fried Rice', 'Egg Rice Bowl', 'Paella'])
    expect(res.results[0]).toMatchObject({ match: 1, missing: [], siteName: 'budgetbytes.com', url: 'https://budgetbytes.com/fried-rice' })
    expect(res.results[2].missing).toEqual(['shrimp', 'sausage', 'saffron', 'onion'])
    // The off-list site and the blog post without a recipe never appear.
    expect(res.results.some((r) => r.url.includes('random.example') || r.url.includes('/blog'))).toBe(false)
  })

  it('explains each pick: ingredients, rating, and search position', async () => {
    const { deps } = setup()
    const res = await findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'rice, eggs, peas and soy sauce' })
    const fried = res.results[0]
    expect(fried.reasons).toEqual(['You have every ingredient', 'Rated 4.6★ by 900 cooks', '#1 of 4 in web search (budgetbytes.com)'])
    expect(fried.parts).toMatchObject({ match: 1, search: 1 })
    expect(res.results[2].reasons[0]).toBe('You have 1 of its 5 ingredients')
  })

  it('finds a named dish, ranked by rating and search position', async () => {
    const { deps, search } = setup()
    search.mockResolvedValueOnce(['https://allrecipes.com/paella', 'https://budgetbytes.com/fried-rice'])
    const res = await findOnlineRecipes(deps, 'andrew', { familyId: 'f', query: 'Paella!' })
    expect(search).toHaveBeenCalledWith(expect.stringMatching(/^Paella recipe \(site:/))
    expect(res.query).toBe('Paella')
    expect(res.results[0].title).toBe('Paella')
    expect(res.results[0].parts.match).toBeNull()
    expect(res.results[0].reasons[0]).toBe('Rated 4.8★ by 5,000 cooks')
    await expect(findOnlineRecipes(deps, 'andrew', { familyId: 'f', query: '  ' })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('serves repeat searches from the 7-day cache without using the search allowance', async () => {
    const { deps, search, store, advance } = setup()
    await findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'rice, eggs' })
    await findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'eggs and rice' })
    expect(search).toHaveBeenCalledTimes(1)
    expect(store.searches).toBe(1)
    advance(8 * 86_400_000)
    await findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'rice, eggs' })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('stops at the monthly cap', async () => {
    const { deps, store } = setup()
    store.searches = MONTHLY_CAP
    await expect(findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: 'rice' })).rejects.toMatchObject({ code: 'resource-exhausted' })
  })

  it('says when online search is off, and checks input and membership', async () => {
    const { deps } = setup()
    await expect(findOnlineRecipes({ ...deps, search: null }, 'andrew', { familyId: 'f', have: 'rice' })).rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(findOnlineRecipes(deps, 'stranger', { familyId: 'f', have: 'rice' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(findOnlineRecipes(deps, 'andrew', { familyId: 'f', have: '' })).rejects.toMatchObject({ code: 'invalid-argument' })
  })
})
