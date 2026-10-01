import { describe, expect, it, vi } from 'vitest'
import { indexChange } from '../recipeIndex.js'
import { shardOf, toIndexEntry } from '../shared/recipes/catalogIndex.js'
import { parseIngredient } from '../shared/recipes/ingredient.js'
import { autoTag } from '../shared/recipes/tagger.js'
import { importRecipeUrl, ImportError, webRecipeDoc, type WebRecipeStore } from '../webRecipes.js'
import { checkUrl, fetchPage, FetchError, isPrivateAddress, robotsAllows, robotsRules, type HostRecord, type HostStore, type HttpGet } from './fetcher.js'
import { canonicalUrl, isoMinutes, readRecipePage } from './schemaRecipe.js'

// ---- fixtures ---------------------------------------------------------------

const JSON_LD_GRAPH = `<!doctype html><html><head>
<title>Weeknight Chicken Tikka Masala | Test Kitchen</title>
<link rel="canonical" href="https://www.testkitchen.example/recipes/tikka-masala/">
<meta property="og:site_name" content="Test Kitchen">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Test Kitchen"},
  {"@type":["Recipe","NewsArticle"],"name":"Weeknight Chicken Tikka Masala",
   "author":[{"@type":"Person","name":"Sam Cook"}],
   "image":["https://img.testkitchen.example/tikka.jpg"],
   "recipeYield":["4","4 servings"],
   "prepTime":"PT15M","cookTime":"PT0H35M","totalTime":"PT50M",
   "recipeCategory":"Dinner","recipeCuisine":"Indian","keywords":"curry, weeknight",
   "recipeIngredient":["1 1/2 lb boneless chicken thighs","1 cup plain yogurt","2 tbsp garam masala","1 (14-ounce) can crushed tomatoes","&frac12; cup heavy cream","Salt, to taste"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Marinate","itemListElement":[{"@type":"HowToStep","text":"Toss the chicken with yogurt and spices."}]},
     {"@type":"HowToSection","name":"Cook","itemListElement":[{"@type":"HowToStep","text":"Brown the chicken.<br>Add tomatoes and simmer 20 minutes."},{"@type":"HowToStep","text":"Stir in the cream &amp; season."}]}
   ],
   "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","ratingCount":"1,234"}}
]}</script></head><body><p>My grandmother's story about this dish goes on for pages…</p></body></html>`

const MICRODATA = `<html><head><meta property="og:site_name" content="Old Blog"></head><body>
<div itemscope itemtype="http://schema.org/Recipe">
  <h1 itemprop="name">Banana Bread</h1>
  <span itemprop="author" itemscope itemtype="http://schema.org/Person"><span itemprop="name">Pat Baker</span></span>
  <meta itemprop="prepTime" content="PT10M"><meta itemprop="cookTime" content="PT1H">
  <span itemprop="recipeYield">1 loaf</span>
  <ul><li itemprop="recipeIngredient">3 ripe bananas</li><li itemprop="recipeIngredient">2 cups all-purpose flour</li><li itemprop="recipeIngredient">1/2 cup sugar</li><li itemprop="recipeIngredient">1 egg</li></ul>
  <ol itemprop="recipeInstructions"><li>Mash the bananas.</li><li>Mix everything and bake 1 hour at 350°F.</li></ol>
  <div itemprop="aggregateRating" itemscope itemtype="http://schema.org/AggregateRating"><meta itemprop="ratingValue" content="9"><meta itemprop="bestRating" content="10"><meta itemprop="ratingCount" content="12"></div>
</div></body></html>`

const PLAIN_PAGE = `<html><head><meta property="og:title" content="Simple Pancakes"></head><body><article>
<h1>Simple Pancakes</h1><p>Serves 4</p>
<h2>Ingredients</h2><ul><li>1 1/2 cups flour</li><li>1 tbsp sugar</li><li>2 tsp baking powder</li><li>1 1/4 cups milk</li><li>1 egg</li></ul>
<h2>Method</h2><ol><li>Whisk the dry ingredients.</li><li>Add milk and egg; cook on a hot griddle.</li></ol>
</article></body></html>`

// ---- schema.org reading -----------------------------------------------------

describe('readRecipePage', () => {
  it('reads JSON-LD inside @graph, with sections, entities, times, yield, rating, and credit', () => {
    const r = readRecipePage(JSON_LD_GRAPH, 'https://www.testkitchen.example/recipes/tikka-masala/?utm_source=x')!
    expect(r.method).toBe('json-ld')
    expect(r.title).toBe('Weeknight Chicken Tikka Masala')
    expect(r.ingredientLines).toEqual(['1 1/2 lb boneless chicken thighs', '1 cup plain yogurt', '2 tbsp garam masala', '1 (14-ounce) can crushed tomatoes', '½ cup heavy cream', 'Salt, to taste'])
    expect(r.steps).toEqual(['Toss the chicken with yogurt and spices.', 'Brown the chicken.', 'Add tomatoes and simmer 20 minutes.', 'Stir in the cream & season.'])
    expect(r).toMatchObject({ prepMinutes: 15, cookMinutes: 35, totalMinutes: 50, servings: 4, yieldText: '4 servings', author: 'Sam Cook', siteName: 'Test Kitchen' })
    expect(r.rating).toEqual({ value: 4.7, count: 1234 })
    expect(r.canonicalUrl).toBe('https://www.testkitchen.example/recipes/tikka-masala')
    expect(r.hints).toEqual(expect.arrayContaining(['dinner', 'indian', 'curry']))
    // Page prose is not kept anywhere.
    expect(JSON.stringify(r)).not.toContain('grandmother')
  })

  it('falls back to microdata, scoping properties to the recipe and normalizing a 10-point rating', () => {
    const r = readRecipePage(MICRODATA, 'https://oldblog.example/banana-bread')!
    expect(r.method).toBe('microdata')
    expect(r.title).toBe('Banana Bread')
    expect(r.author).toBe('Pat Baker')
    expect(r.ingredientLines).toHaveLength(4)
    expect(r.steps).toEqual(['Mash the bananas.', 'Mix everything and bake 1 hour at 350°F.'])
    expect(r).toMatchObject({ prepMinutes: 10, cookMinutes: 60, yieldText: '1 loaf', siteName: 'Old Blog' })
    expect(r.rating).toEqual({ value: 4.5, count: 12 })
  })

  it('reads a page with no structured data using the cookbook rules', () => {
    const r = readRecipePage(PLAIN_PAGE, 'https://plain.example/pancakes')!
    expect(r.method).toBe('page')
    expect(r.title).toBe('Simple Pancakes')
    expect(r.ingredientLines).toContain('1 egg')
    expect(r.steps).toHaveLength(2)
  })

  it('returns null when there is no recipe', () => {
    expect(readRecipePage('<html><body><p>Just a blog post.</p></body></html>', 'https://x.example/')).toBeNull()
  })

  it('parses ISO durations and canonical URLs', () => {
    expect(isoMinutes('PT1H30M')).toBe(90)
    expect(isoMinutes('P0DT0H20M')).toBe(20)
    expect(isoMinutes('PT45S')).toBe(1)
    expect(isoMinutes('25 mins')).toBe(25)
    expect(isoMinutes('')).toBeNull()
    expect(canonicalUrl('https://Example.com/a/b/?utm_medium=s&b=2&a=1#c')).toBe('https://example.com/a/b?a=1&b=2')
    expect(canonicalUrl('https://example.com/')).toBe('https://example.com/')
  })
})

// ---- auto-tagger ------------------------------------------------------------

const items = (...lines: string[]) => lines.map((l) => parseIngredient(l))

describe('autoTag', () => {
  it('tags a curry dinner: Indian, chicken, not vegetarian', () => {
    const t = autoTag({ title: 'Chicken Tikka Masala', items: items('1 lb chicken thighs', '1 cup yogurt', '2 tbsp garam masala', '1 tsp turmeric', '1 can crushed tomatoes') })
    expect(t.meal).toContain('dinner')
    expect(t.cuisine[0]).toBe('indian')
    expect(t.main).toEqual(['chicken'])
    expect(t.diet).not.toContain('vegetarian')
  })

  it('tags a vegan, gluten-free, dairy-free salad', () => {
    const t = autoTag({ title: 'Chickpea Salad', items: items('1 can chickpeas', '1 cucumber', '2 tbsp olive oil', '1 lemon', 'salt') })
    expect(t.meal).toContain('lunch')
    expect(t.diet).toEqual(['vegetarian', 'vegan', 'gluten-free', 'dairy-free'])
    expect(t.main).toEqual(['beans'])
  })

  it('tags desserts and breakfasts, and keeps diet claims off unknown ingredients', () => {
    const cake = autoTag({ title: 'Chocolate Cake', items: items('2 cups flour', '1 cup sugar', '2 eggs', '1 cup milk') })
    expect(cake.meal).toEqual(['dessert'])
    expect(cake.diet).toEqual(['vegetarian'])
    expect(cake.main).toEqual([])
    const pancakes = autoTag({ title: 'Buttermilk Pancakes', items: items('2 cups flour', '2 cups buttermilk', '2 eggs') })
    expect(pancakes.meal).toContain('breakfast')
    const mystery = autoTag({ title: 'Stew', items: items('1 lb guanciale', '2 cups zorblax', '1 onion') })
    expect(mystery.diet).toEqual([])
  })

  it('reads describing-word commas and footnote marks, and does not call every pasta Italian', () => {
    const chicken = parseIngredient('1 lb. boneless, skinless chicken breast')
    expect(chicken).toMatchObject({ key: 'chicken breast', family: 'chicken' })
    expect(parseIngredient('3 green onions* sliced').key).toBe('green onion')
    expect(parseIngredient('1 cup butter, softened')).toMatchObject({ key: 'butter', note: 'softened' })
    const t = autoTag({ title: 'One Pot Creamy Cajun Chicken Pasta', items: items('1 lb. boneless, skinless chicken breast', '1/2 lb. penne pasta', '2 cups chicken broth') })
    expect(t.main).toEqual(['chicken'])
    expect(t.cuisine).not.toContain('italian')
  })

  it('uses page hints', () => {
    expect(autoTag({ title: 'Grandma special', items: items('1 lb pork shoulder', '1 onion'), hints: ['mexican', 'main course'] }).cuisine).toContain('mexican')
  })
})

// ---- index ------------------------------------------------------------------

describe('catalog index', () => {
  const doc = { title: 'Banana Bread', items: [{ key: 'banana', family: 'banana' }, { key: 'flour', family: 'flour' }, { key: 'banana', family: 'banana' }], tags: { meal: ['dessert', 'bogus'] }, minutes: 70, source: { type: 'cookbook', bookTitle: 'Baking' }, favorite: true, servings: 8 }

  it('packs a recipe into a short entry', () => {
    expect(toIndexEntry(doc)).toEqual({ t: 'Banana Bread', k: ['banana', 'flour'], fa: ['banana', 'flour'], g: { meal: ['dessert'], cuisine: [], main: [], diet: [] }, m: 70, s: 'cookbook', b: 'Baking', f: true, r: false, rv: null, rc: null, n: 8 })
  })

  it('spreads recipes over the shards deterministically', () => {
    expect(shardOf('ck_abc')).toBe(shardOf('ck_abc'))
    const used = new Set(Array.from({ length: 200 }, (_, i) => shardOf(`r${i}`)))
    expect(used.size).toBe(8)
  })

  it('skips index writes when nothing shown changed', () => {
    expect(indexChange(doc, { ...doc, steps: 'new steps', updatedAt: 5 })).toEqual({ op: 'none' })
    expect(indexChange(doc, { ...doc, favorite: false })).toMatchObject({ op: 'put', entry: { f: false } })
    expect(indexChange(doc, null)).toEqual({ op: 'remove' })
    expect(indexChange(null, null)).toEqual({ op: 'none' })
  })
})

// ---- fetcher ----------------------------------------------------------------

describe('addresses', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true)
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('refuses non-web and internal URLs', () => {
    for (const u of ['ftp://x.example/a', 'http://localhost/a', 'http://metadata.google.internal/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'https://user:pw@x.example/', 'http://x.example:8080/', 'file:///etc/passwd', 'notaurl']) {
      expect(() => checkUrl(u), u).toThrow(FetchError)
    }
    expect(checkUrl('https://www.seriouseats.com/recipe').hostname).toBe('www.seriouseats.com')
  })
})

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /search
Disallow: /*?print=
Allow: /search/about

User-agent: BadBot
Disallow: /
`
  it('applies the * group with longest-match wins', () => {
    const rules = robotsRules(txt)
    expect(robotsAllows(rules, '/recipes/pasta')).toBe(true)
    expect(robotsAllows(rules, '/search?q=x')).toBe(false)
    expect(robotsAllows(rules, '/search/about')).toBe(true)
    expect(robotsAllows(rules, '/recipes/pasta?print=1')).toBe(false)
  })

  it('uses our own group when a site names us', () => {
    const rules = robotsRules('User-agent: *\nDisallow:\n\nUser-agent: FamilyOrganizerRecipeImporter\nDisallow: /\n')
    expect(robotsAllows(rules, '/anything')).toBe(false)
    expect(robotsAllows(robotsRules('User-agent: *\nDisallow:\n'), '/anything')).toBe(true)
  })
})

class FakeHosts implements HostStore {
  rec = new Map<string, HostRecord>()
  last = new Map<string, number>()
  async get(h: string) {
    return this.rec.get(h) ?? null
  }
  async saveRobots(h: string, robots: string | null, at: number) {
    this.rec.set(h, { robots, robotsAt: at })
  }
  async reserve(h: string, now: number, gap: number) {
    const start = Math.max(now, (this.last.get(h) ?? 0) + gap)
    this.last.set(h, start)
    return start
  }
}

const site = (pages: Record<string, { status?: number; body: string; type?: string }>): HttpGet =>
  vi.fn(async (url: string) => {
    const p = pages[url]
    if (!p) return { status: 404, url, contentType: 'text/html', body: '' }
    return { status: p.status ?? 200, url, contentType: p.type ?? 'text/html; charset=utf-8', body: p.body }
  })

describe('fetchPage', () => {
  it('checks robots.txt once, caches it, and spaces requests to a host', async () => {
    const get = site({ 'https://a.example/robots.txt': { body: 'User-agent: *\nDisallow: /private', type: 'text/plain' }, 'https://a.example/r/1': { body: '<p>1</p>' }, 'https://a.example/r/2': { body: '<p>2</p>' } })
    const hosts = new FakeHosts()
    let t = 1000
    const sleep = vi.fn(async (ms: number) => void (t += ms))
    const deps = { get, hosts, now: () => t, sleep }
    expect((await fetchPage(deps, 'https://a.example/r/1')).html).toBe('<p>1</p>')
    await fetchPage(deps, 'https://a.example/r/2')
    expect(get).toHaveBeenCalledTimes(3) // robots once + two pages
    expect(sleep).toHaveBeenCalledWith(2000)
    await expect(fetchPage(deps, 'https://a.example/private/x')).rejects.toThrow(/asks automated tools not to read/)
  })

  it('reports blocked and missing pages clearly', async () => {
    const get = site({ 'https://b.example/forbidden': { status: 403, body: '' }, 'https://b.example/pdf': { body: '%PDF', type: 'application/pdf' } })
    const deps = { get, hosts: new FakeHosts(), sleep: async () => undefined }
    await expect(fetchPage(deps, 'https://b.example/forbidden')).rejects.toThrow(/didn't let the importer in/)
    await expect(fetchPage(deps, 'https://b.example/gone')).rejects.toThrow(/doesn't exist anymore/)
    await expect(fetchPage(deps, 'https://b.example/pdf')).rejects.toThrow(/isn't a web page/)
  })
})

// ---- import -----------------------------------------------------------------

class FakeRecipes implements WebRecipeStore {
  docs = new Map<string, Record<string, unknown>>()
  async isMember(_f: string, uid: string) {
    return uid === 'andrew'
  }
  async getRecipeFlags(_f: string, id: string) {
    const d = this.docs.get(id)
    return d ? { edited: d.edited === true, favorite: d.favorite === true, tagsEdited: d.tagsEdited === true } : null
  }
  async saveRecipe(_f: string, id: string, data: Record<string, unknown>) {
    this.docs.set(id, { ...this.docs.get(id), ...data })
  }
}

describe('importRecipeUrl', () => {
  const pages = { 'https://www.testkitchen.example/recipes/tikka-masala/?utm_source=pin': { body: JSON_LD_GRAPH }, 'https://www.testkitchen.example/recipes/tikka-masala': { body: JSON_LD_GRAPH } }
  const deps = (store: FakeRecipes) => ({ store, fetcher: { get: site(pages), hosts: new FakeHosts(), sleep: async () => undefined } })

  it('saves a structured, tagged, credited recipe and dedupes by canonical URL', async () => {
    const store = new FakeRecipes()
    const first = await importRecipeUrl(deps(store), 'andrew', { familyId: 'f', url: 'https://www.testkitchen.example/recipes/tikka-masala/?utm_source=pin' })
    expect(first).toMatchObject({ title: 'Weeknight Chicken Tikka Masala', existed: false, needsReview: false })
    const doc = store.docs.get(first.id)!
    expect(first.id).toMatch(/^web_/)
    expect(doc).toMatchObject({ servings: 4, minutes: 50, url: 'https://www.testkitchen.example/recipes/tikka-masala', credit: 'Sam Cook, Test Kitchen', source: { type: 'online', siteName: 'Test Kitchen' } })
    expect((doc.items as { key: string }[]).map((i) => i.key)).toContain('chicken thigh')
    expect((doc.tags as { cuisine: string[] }).cuisine).toContain('indian')
    expect(doc.stepList).toHaveLength(4)

    // Same recipe, different link → same document.
    store.docs.get(first.id)!.favorite = true
    const again = await importRecipeUrl(deps(store), 'andrew', { familyId: 'f', url: 'https://www.testkitchen.example/recipes/tikka-masala' })
    expect(again).toMatchObject({ id: first.id, existed: true })
    expect(store.docs.size).toBe(1)
    expect(store.docs.get(first.id)!.favorite).toBe(true)

    // A recipe the family edited is left alone.
    store.docs.get(first.id)!.edited = true
    store.docs.get(first.id)!.title = 'Our Tikka'
    await importRecipeUrl(deps(store), 'andrew', { familyId: 'f', url: 'https://www.testkitchen.example/recipes/tikka-masala' })
    expect(store.docs.get(first.id)!.title).toBe('Our Tikka')
  })

  it('checks membership and input', async () => {
    const store = new FakeRecipes()
    await expect(importRecipeUrl(deps(store), undefined, { familyId: 'f', url: 'https://x.example' })).rejects.toThrow(ImportError)
    await expect(importRecipeUrl(deps(store), 'stranger', { familyId: 'f', url: 'https://x.example' })).rejects.toThrow(/Not a member/)
    await expect(importRecipeUrl(deps(store), 'andrew', { familyId: 'f', url: '' })).rejects.toThrow(/Paste a link/)
    await expect(importRecipeUrl(deps(store), 'andrew', { familyId: 'f', url: 'http://169.254.169.254/latest' })).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('says so when a page has no recipe', async () => {
    const store = new FakeRecipes()
    const d = { store, fetcher: { get: site({ 'https://blog.example/post': { body: '<p>hello</p>' } }), hosts: new FakeHosts(), sleep: async () => undefined } }
    await expect(importRecipeUrl(d, 'andrew', { familyId: 'f', url: 'https://blog.example/post' })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('flags page-text fallbacks for review', () => {
    const r = readRecipePage(PLAIN_PAGE, 'https://plain.example/pancakes')!
    expect(webRecipeDoc(r, 'andrew').data).toMatchObject({ needsReview: true, confidence: 0.5 })
  })
})
