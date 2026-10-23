/**
 * "What can I make?": turn what someone says they have into ingredient keys, then score
 * recipes by how much of them that covers. Rule-based: the same dictionary as the parser
 * (synonyms, plurals, families), plus a small typo allowance for words it doesn't know.
 */
import { aisleFor } from './aisles.js'
import { familyOf, lookupPhrase, maxPhraseWords } from './dictionary.js'
import { parseIngredient } from './ingredient.js'

export interface HaveItem {
  /** What they said ("chicken thighs"). */
  text: string
  key: string
  family: string
  /** Found in the ingredient dictionary (unknown words get a typo allowance). */
  known: boolean
}

/** Pantry staples most kitchens always have; they don't count against a recipe. Editable in Settings. */
export const DEFAULT_STAPLES = ['salt', 'pepper', 'water', 'oil']

const LEAD_IN = /^(?:i\s+(?:have|got)|we\s+(?:have|got)|there(?:'s| is| are)|some|a\s+(?:few|couple(?:\s+of)?|bit\s+of|little)|leftover|left\s*over|half\s+(?:a|an)|plenty\s+of|lots\s+of|a\s+lot\s+of)\s+/i

/** "I have chicken thighs, rice and some broccoli" → chicken thigh, rice, broccoli. */
export function tokenizeHave(text: string): HaveItem[] {
  const out = new Map<string, HaveItem>()
  const pieces = text
    .toLowerCase()
    .split(SEPARATORS)
    .map((p) => p.trim().replace(/[.!?]+$/, ''))
  for (let piece of pieces) {
    for (let i = 0; i < 3 && LEAD_IN.test(piece); i++) piece = piece.replace(LEAD_IN, '')
    piece = piece.trim()
    if (!piece || piece.length > 60) continue
    const ing = parseIngredient(piece)
    const key = ing.key.trim()
    if (!key || key.length < 2) continue
    if (!out.has(key)) out.set(key, { text: piece, key, family: familyOf(key) || key, known: ing.known })
  }
  return [...out.values()]
}

const SEPARATORS = /[\n,;&+]|\band\b|\bplus\b|\balso\b|\bwith\b/i

/**
 * Speech comes back as one run-on phrase ("chicken thighs rice broccoli"). Splits it into a
 * comma list by finding the longest dictionary name at each word. Words the dictionary
 * doesn't know ("2 cups", "frozen", "some") stay with the food after them, or the one
 * before when nothing follows. Existing commas and "and" are kept as breaks.
 */
export function listFromSpeech(text: string): string {
  const max = maxPhraseWords()
  const items: string[] = []
  for (const piece of text.split(SEPARATORS)) {
    const words = piece.trim().replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean)
    const found: string[] = []
    let pending: string[] = []
    for (let i = 0; i < words.length; ) {
      let n = Math.min(max, words.length - i)
      while (n > 0 && !lookupPhrase(words.slice(i, i + n).join(' ').replace(/[^\p{L}' -]/gu, ''))) n--
      if (n === 0) {
        pending.push(words[i++])
        continue
      }
      found.push([...pending, ...words.slice(i, i + n)].join(' '))
      pending = []
      i += n
    }
    if (pending.length) {
      if (found.length) found[found.length - 1] += ' ' + pending.join(' ')
      else found.push(pending.join(' '))
    }
    items.push(...found)
  }
  return items.join(', ')
}

/** Edit distance, capped (for typos like "brocoli" or "parmesean"). */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > cap) return cap + 1
    prev = cur
  }
  return prev[b.length]
}

function close(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length)
  if (n < 5) return false
  return editDistance(a, b, n >= 8 ? 2 : 1) <= (n >= 8 ? 2 : 1)
}

/**
 * Does something they have cover this recipe ingredient? The same food; a general word for it
 * ("cheese" covers ricotta, "chicken" covers thighs); or the recipe asks for the general food
 * and they have a kind of it. Two different kinds (ricotta vs cream cheese) don't count.
 */
export function covers(h: HaveItem, key: string, family: string): boolean {
  if (h.key === key || h.key === family) return true
  if (key === h.family) return true
  // Typo allowance only for words the dictionary did not recognize ("brocoli"), so "beet" never matches "beef".
  return !h.known && close(h.key, key)
}

/** Flavor builders: most savory recipes use them, so having them says little about the dish. */
const AROMATICS = new Set(['onion', 'garlic', 'shallot', 'ginger', 'scallion', 'green onion', 'red onion'])
const HERBS = new Set(['basil', 'parsley', 'cilantro', 'mint', 'dill', 'thyme', 'rosemary', 'sage', 'chive', 'tarragon', 'oregano', 'bay leaf'])

/**
 * How much an ingredient counts toward a match: the meat or fish a dish is built on most
 * (3), fresh produce, dairy and bread next (1.5), pantry goods and spices 1, herbs and
 * aromatics like onion and garlic least (0.5).
 */
export function ingredientWeight(key: string, family = familyOf(key) || key): number {
  if (AROMATICS.has(key) || AROMATICS.has(family) || HERBS.has(key) || HERBS.has(family)) return 0.5
  const aisle = aisleFor(key)
  if (aisle === 'Meat & Seafood') return 3
  if (aisle === 'Produce' || aisle === 'Dairy & Eggs' || aisle === 'Bakery' || aisle === 'Frozen') return 1.5
  return 1
}

/** The two or three ingredients a search should be about: the weightiest they listed, never staples. */
export function mainIngredients(have: HaveItem[], staples: string[] = DEFAULT_STAPLES, n = 3): string[] {
  const staple = new Set(staples.map((s) => s.toLowerCase()))
  const real = have.filter((h) => !staple.has(h.key) && !staple.has(h.family))
  const pool = real.length ? real : have
  return pool
    .map((h, i) => ({ key: h.key, w: ingredientWeight(h.key, h.family), i }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, n)
    .map((x) => x.key)
}

export interface MatchResult {
  /** 0–1 share of the non-staple ingredients they have. */
  match: number
  /**
   * 0–1 how well the recipe fits what they have: the share they have, weighted toward main
   * ingredients (70%), how much of what they listed it uses (30%), less 0.03 per missing item.
   */
  fit: number
  have: string[]
  missing: string[]
  /** Staples the recipe uses (not counted). */
  staples: string[]
}

/** Scores one recipe's ingredient keys (and their families) against what they have. */
export function matchRecipe(keys: string[], families: string[], have: HaveItem[], staples: string[] = DEFAULT_STAPLES): MatchResult {
  const staple = new Set(staples.map((s) => s.toLowerCase()))
  const res: MatchResult = { match: 0, fit: 0, have: [], missing: [], staples: [] }
  const seen = new Set<string>()
  keys.forEach((key, i) => {
    if (seen.has(key)) return
    seen.add(key)
    const family = families[i] || familyOf(key) || key
    const gotIt = have.some((h) => covers(h, key, family))
    if (!gotIt && (staple.has(key) || staple.has(family))) res.staples.push(key)
    else if (gotIt) res.have.push(key)
    else res.missing.push(key)
  })
  const needed = res.have.length + res.missing.length
  res.match = needed ? res.have.length / needed : res.staples.length ? 1 : 0
  const weigh = (list: string[]) => list.reduce((n, k) => n + ingredientWeight(k, families[keys.indexOf(k)] || familyOf(k) || k), 0)
  const got = weigh(res.have)
  const weighted = needed ? got / (got + weigh(res.missing)) : res.match
  const used = have.length ? have.filter((h) => keys.some((k, i) => covers(h, k, families[i] || familyOf(k) || k))).length / have.length : 0
  res.fit = Math.max(0, Math.min(1, 0.7 * weighted + 0.3 * used - 0.03 * res.missing.length))
  return res
}

export interface Ranked<T> {
  item: T
  result: MatchResult
  score: number
}

/** Best first: match %, then fewer missing, then favorites, then title. Always returns up to `top`. */
export function rankByMatch<T extends { t: string; f?: boolean }>(entries: T[], score: (e: T) => MatchResult, top = 3): Ranked<T>[] {
  return entries
    .map((item) => {
      const result = score(item)
      return { item, result, score: result.match }
    })
    .sort((a, b) => b.result.match - a.result.match || a.result.missing.length - b.result.missing.length || Number(!!b.item.f) - Number(!!a.item.f) || a.item.t.localeCompare(b.item.t))
    .slice(0, top)
}

/** Bayesian average rating: a few 5-star reviews shouldn't beat thousands of 4.7s. Prior m = 4.0 from C = 50 reviews. */
export function bayesianRating(value: number | null | undefined, count: number | null | undefined, m = 4.0, C = 50): number {
  const n = Math.max(0, count ?? 0)
  const r = value ?? m
  return (C * m + n * r) / (C + n)
}

/** Popularity on a 0–1 scale: the Bayesian rating, where 3★ or less is 0 and 5★ is 1. */
export function popularity(rating: { value: number; count: number } | null | undefined): number {
  return Math.max(0, Math.min(1, (bayesianRating(rating?.value, rating?.count) - 3) / 2))
}

/** Search position on a 0–1 scale: the first result 1, the last 0. */
export function searchScore(rank: number | null | undefined, of: number): number {
  if (rank == null || of <= 1) return 1
  return Math.max(0, 1 - (rank - 1) / (of - 1))
}

/** What online results are sorted by (Settings → Kitchen, and a switch above the results). */
export type SearchPriority = 'match' | 'balanced' | 'rating'
export const SEARCH_PRIORITIES: SearchPriority[] = ['match', 'balanced', 'rating']
export const PRIORITY_LABELS: Record<SearchPriority, string> = { match: 'Best match', balanced: 'Balanced', rating: 'Best rated' }

/** Each priority's weights for ingredient fit, popularity and web-search position. */
export const PRIORITY_WEIGHTS: Record<SearchPriority, { fit: number; rating: number; search: number }> = {
  match: { fit: 0.8, rating: 0.1, search: 0.1 },
  balanced: { fit: 0.6, rating: 0.25, search: 0.15 },
  rating: { fit: 0.3, rating: 0.6, search: 0.1 },
}

/** "Best rated" never shows a recipe that uses less than this share of a recipe's ingredients they have. */
export const RATED_MIN_MATCH = 0.4

export interface RankParts {
  /** null when searching for a dish (nothing to match). */
  fit: number | null
  rating: number
  search: number
}

/** One result's score for a priority. A dish search has no fit: popularity and position only. */
export function rankScore(parts: RankParts, priority: SearchPriority = 'balanced'): number {
  if (parts.fit == null) return priority === 'rating' ? 0.8 * parts.rating + 0.2 * parts.search : 0.6 * parts.rating + 0.4 * parts.search
  const w = PRIORITY_WEIGHTS[priority]
  return w.fit * parts.fit + w.rating * parts.rating + w.search * parts.search
}

/** Results in a priority's order. "Best rated" leaves out recipes that use too little of what they have. */
export function rankOnline<T extends { match: number; parts?: { match?: number | null; fit?: number | null; rating: number; search: number } }>(results: T[], priority: SearchPriority): T[] {
  const partsOf = (r: T): RankParts => ({ fit: r.parts?.fit ?? r.parts?.match ?? null, rating: r.parts?.rating ?? 0.5, search: r.parts?.search ?? 1 })
  const pool = priority === 'rating' ? results.filter((r) => partsOf(r).fit == null || r.match >= RATED_MIN_MATCH) : results
  return [...pool].sort((a, b) => rankScore(partsOf(b), priority) - rankScore(partsOf(a), priority))
}
