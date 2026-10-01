/**
 * Reads a recipe out of a web page: schema.org Recipe in JSON-LD first (what nearly every
 * recipe site publishes for search engines), then schema.org microdata, then — for pages
 * with neither — the same rule-based extractor the cookbooks use, flagged for review.
 * Keeps only structured facts (title, ingredients, steps, times, yield, rating, credit);
 * page prose such as the story above the recipe is never stored.
 */
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { xhtmlToBlocks } from '../books/epub.js'
import { extractRecipes, parseMinutes } from '../shared/recipes/extract.js'

export interface WebRecipe {
  title: string
  ingredientLines: string[]
  steps: string[]
  yieldText: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  totalMinutes: number | null
  rating: { value: number; count: number } | null
  image: string | null
  author: string | null
  siteName: string | null
  canonicalUrl: string
  /** recipeCategory, recipeCuisine, keywords: hints for the auto-tagger. */
  hints: string[]
  method: 'json-ld' | 'microdata' | 'page'
}

/** Strips tags and entities, collapses whitespace. */
export function plain(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  const text = /[<&]/.test(s) ? cheerio.load(`<div>${s}</div>`)('div').text() : s
  return text.replace(/\s+/g, ' ').trim()
}

/** ISO 8601 durations ("PT1H30M", "P0DT0H20M") → minutes; falls back to "20 mins". */
export function isoMinutes(value: unknown): number | null {
  const s = plain(Array.isArray(value) ? value[0] : value)
  if (!s) return null
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(s)
  if (m && (m[1] || m[2] || m[3] || m[4])) {
    const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60
    return total > 0 ? Math.round(total) : null
  }
  return parseMinutes(s)
}

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|_ga$|cmpid$)/i

/** One URL per recipe page: no tracking parameters, fragment, or trailing slash; lowercase host. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw)
  u.hash = ''
  u.hostname = u.hostname.toLowerCase()
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
  u.searchParams.sort()
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '') || '/'
  return u.toString()
}

const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

function isRecipeType(t: unknown): boolean {
  return asArray(t).some((x) => typeof x === 'string' && /(^|\/|:)Recipe$/i.test(x))
}

/** Depth-first search for the first schema.org Recipe node (handles @graph, arrays, nesting). */
function findRecipeNode(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 8) return null
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipeNode(n, depth + 1)
      if (hit) return hit
    }
    return null
  }
  const o = node as Record<string, unknown>
  if (isRecipeType(o['@type'])) return o
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'about']) {
    const hit = findRecipeNode(o[key], depth + 1)
    if (hit) return hit
  }
  return null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    try {
      // Some sites leave raw newlines/tabs inside strings.
      // eslint-disable-next-line no-control-regex -- control characters are exactly what's being removed
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '))
    } catch {
      return null
    }
  }
}

/** recipeInstructions in any of its shapes → a flat list of steps. */
function instructionSteps(value: unknown, depth = 0): string[] {
  if (value == null || depth > 5) return []
  if (typeof value === 'string') {
    let text = value.replace(/<br\s*\/?>/gi, '\n')
    if (/<(li|p)\b/i.test(text)) {
      const $ = cheerio.load(`<div>${text}</div>`)
      text = $('li, p').map((_, el) => $(el).text()).get().join('\n') || text
    }
    return text
      .split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/)
      .map((s) => plain(s).replace(/^\d+[.)]\s+/, ''))
      .filter(Boolean)
  }
  if (Array.isArray(value)) return value.flatMap((v) => instructionSteps(v, depth + 1))
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (o.itemListElement) return instructionSteps(o.itemListElement, depth + 1)
    return instructionSteps(String(o.text ?? o.name ?? o.description ?? ''), depth + 1)
  }
  return []
}

function firstName(v: unknown): string | null {
  for (const x of asArray(v)) {
    if (typeof x === 'string' && plain(x)) return plain(x)
    if (x && typeof x === 'object' && plain((x as Record<string, unknown>).name)) return plain((x as Record<string, unknown>).name)
  }
  return null
}

function imageUrl(v: unknown, base: string): string | null {
  for (const x of asArray(v)) {
    const raw = typeof x === 'string' ? x : x && typeof x === 'object' ? ((x as Record<string, unknown>).url as string) : null
    if (!raw) continue
    try {
      const u = new URL(raw, base)
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString().slice(0, 500)
    } catch {
      // not a URL
    }
  }
  return null
}

function yieldOf(v: unknown): { text: string | null; servings: number | null } {
  const all = asArray(v).map((x) => plain(x)).filter(Boolean)
  const text = all.find((x) => /\D/.test(x)) ?? all[0] ?? null
  const n = all.map((x) => Number(/\d+/.exec(x)?.[0])).find((x) => Number.isFinite(x) && x > 0)
  return { text: text ? (/^\d+$/.test(text) ? `Serves ${text}` : text) : null, servings: n ?? null }
}

function ratingOf(v: unknown): WebRecipe['rating'] {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const toNum = (x: unknown) => Number(plain(x).replace(/,/g, ''))
  const value = toNum(o.ratingValue)
  const count = toNum(o.ratingCount ?? o.reviewCount)
  const best = Number(plain(o.bestRating)) || 5
  if (!Number.isFinite(value) || value <= 0) return null
  return { value: Math.round((value / best) * 5 * 100) / 100, count: Number.isFinite(count) && count > 0 ? Math.round(count) : 0 }
}

function hintsOf(o: Record<string, unknown>): string[] {
  return [...asArray(o.recipeCategory), ...asArray(o.recipeCuisine), ...asArray(o.keywords).flatMap((k) => String(k).split(','))]
    .map((x) => plain(x).toLowerCase())
    .filter((x) => x && x.length <= 40)
    .slice(0, 30)
}

function meta($: cheerio.CheerioAPI, name: string): string | null {
  return $(`meta[property="${name}"], meta[name="${name}"]`).attr('content')?.trim() || null
}

function pageFacts($: cheerio.CheerioAPI, finalUrl: string) {
  let canonical = finalUrl
  for (const c of [$('link[rel="canonical"]').attr('href'), meta($, 'og:url')]) {
    if (!c) continue
    try {
      const u = new URL(c, finalUrl)
      // Only trust a canonical on the same site (some pages point at a syndication partner).
      if ((u.protocol === 'https:' || u.protocol === 'http:') && sameSite(u.hostname, new URL(finalUrl).hostname)) {
        canonical = u.toString()
        break
      }
    } catch {
      // ignore
    }
  }
  const host = new URL(finalUrl).hostname.replace(/^www\./, '')
  return { canonical: canonicalUrl(canonical), siteName: plain(meta($, 'og:site_name')) || host }
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '')

function fromJsonLd($: cheerio.CheerioAPI, finalUrl: string): WebRecipe | null {
  const facts = pageFacts($, finalUrl)
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    const node = findRecipeNode(parseJson($(el).text()))
    if (!node) continue
    const ingredientLines = asArray(node.recipeIngredient ?? node.ingredients)
      .map(plain)
      .filter(Boolean)
    const steps = instructionSteps(node.recipeInstructions)
    const y = yieldOf(node.recipeYield)
    const publisher = firstName(node.publisher)
    return {
      title: plain(node.name) || plain(meta($, 'og:title')) || plain($('title').text()),
      ingredientLines,
      steps,
      yieldText: y.text,
      servings: y.servings,
      prepMinutes: isoMinutes(node.prepTime),
      cookMinutes: isoMinutes(node.cookTime),
      totalMinutes: isoMinutes(node.totalTime),
      rating: ratingOf(node.aggregateRating),
      image: imageUrl(node.image, finalUrl),
      author: firstName(node.author),
      siteName: (plain(meta($, 'og:site_name')) || publisher || facts.siteName).slice(0, 80),
      canonicalUrl: facts.canonical,
      hints: hintsOf(node),
      method: 'json-ld',
    }
  }
  return null
}

function fromMicrodata($: cheerio.CheerioAPI, finalUrl: string): WebRecipe | null {
  const root = $('[itemscope][itemtype]')
    .filter((_, el) => /schema\.org\/Recipe\b/i.test($(el).attr('itemtype') ?? ''))
    .first()
  if (!root.length) return null
  // Properties that belong to the recipe itself, not to a nested item (an author's name, say).
  const own = (prop: string) =>
    root.find(`[itemprop~="${prop}"]`).filter((_, el) => {
      const scope = $(el).parent().closest('[itemscope]')
      return scope.length > 0 && scope[0] === root[0]
    })
  const valueOf = (el: AnyNode) => {
    const $el = $(el)
    return plain($el.attr('content') ?? $el.attr('datetime') ?? $el.text())
  }
  const one = (prop: string) => {
    const el = own(prop).first()
    return el.length ? valueOf(el[0]) : ''
  }
  const facts = pageFacts($, finalUrl)
  const ingredientLines = [...own('recipeIngredient').toArray(), ...own('ingredients').toArray()].map(valueOf).filter(Boolean)
  const instr = own('recipeInstructions')
  const steps = instr
    .toArray()
    .flatMap((el) => {
      const $el = $(el)
      const inner = $el.find('[itemprop~="text"], li, p')
      return inner.length ? inner.toArray().map((x) => plain($(x).text())) : [valueOf(el)]
    })
    .filter(Boolean)
  const y = yieldOf(one('recipeYield'))
  const ratingEl = root.find('[itemprop~="aggregateRating"]').first()
  const rating = ratingEl.length
    ? ratingOf({
        ratingValue: ratingEl.find('[itemprop~="ratingValue"]').attr('content') ?? ratingEl.find('[itemprop~="ratingValue"]').text(),
        bestRating: ratingEl.find('[itemprop~="bestRating"]').attr('content'),
        ratingCount: ratingEl.find('[itemprop~="ratingCount"], [itemprop~="reviewCount"]').first().attr('content') ?? ratingEl.find('[itemprop~="ratingCount"], [itemprop~="reviewCount"]').first().text(),
      })
    : null
  const authorEl = root.find('[itemprop~="author"]').first()
  const imgEl = own('image').first()
  return {
    title: one('name') || plain(meta($, 'og:title')),
    ingredientLines,
    steps,
    yieldText: y.text,
    servings: y.servings,
    prepMinutes: isoMinutes(one('prepTime')),
    cookMinutes: isoMinutes(one('cookTime')),
    totalMinutes: isoMinutes(one('totalTime')),
    rating,
    image: imgEl.length ? imageUrl(imgEl.attr('src') ?? imgEl.attr('content') ?? imgEl.attr('href'), finalUrl) : null,
    author: authorEl.length ? plain(authorEl.find('[itemprop~="name"]').first().text() || authorEl.text()) || null : null,
    siteName: facts.siteName.slice(0, 80),
    canonicalUrl: facts.canonical,
    hints: [one('recipeCategory'), one('recipeCuisine'), ...one('keywords').split(',')].map((x) => x.toLowerCase().trim()).filter(Boolean),
    method: 'microdata',
  }
}

/** No structured data: read the page's headings and lists with the cookbook extractor. */
function fromPageText($: cheerio.CheerioAPI, html: string, finalUrl: string): WebRecipe | null {
  const main = $('article').first().html() ?? $('main').first().html() ?? $('body').html() ?? html
  const blocks = xhtmlToBlocks(`<html><body>${main}</body></html>`, 'web')
  const { recipes } = extractRecipes(blocks, true)
  const best = recipes.sort((a, b) => b.confidence - a.confidence)[0]
  if (!best || best.ingredientLines.length < 2) return null
  const facts = pageFacts($, finalUrl)
  return {
    title: plain(meta($, 'og:title')) || best.title,
    ingredientLines: best.ingredientLines,
    steps: best.steps,
    yieldText: best.yieldText,
    servings: best.servings,
    prepMinutes: best.prepMinutes,
    cookMinutes: best.cookMinutes,
    totalMinutes: best.totalMinutes,
    rating: null,
    image: imageUrl(meta($, 'og:image'), finalUrl),
    author: null,
    siteName: facts.siteName.slice(0, 80),
    canonicalUrl: facts.canonical,
    hints: [],
    method: 'page',
  }
}

/** The page's recipe, or null when there isn't one. */
export function readRecipePage(html: string, finalUrl: string): WebRecipe | null {
  const $ = cheerio.load(html)
  const found = fromJsonLd($, finalUrl) ?? fromMicrodata($, finalUrl)
  if (found && found.ingredientLines.length > 0) return found
  return fromPageText($, html, finalUrl)
}
