/**
 * "What can I make?": turn what someone says they have into ingredient keys, then score
 * recipes by how much of them that covers. Rule-based: the same dictionary as the parser
 * (synonyms, plurals, families), plus a small typo allowance for words it doesn't know.
 */
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

export interface MatchResult {
  /** 0–1 share of the non-staple ingredients they have. */
  match: number
  have: string[]
  missing: string[]
  /** Staples the recipe uses (not counted). */
  staples: string[]
}

/** Scores one recipe's ingredient keys (and their families) against what they have. */
export function matchRecipe(keys: string[], families: string[], have: HaveItem[], staples: string[] = DEFAULT_STAPLES): MatchResult {
  const staple = new Set(staples.map((s) => s.toLowerCase()))
  const res: MatchResult = { match: 0, have: [], missing: [], staples: [] }
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

/**
 * Online ranking. Searching by ingredients: 60% ingredient match, 25% popularity, 15% search
 * position. Searching for a dish (no match to weigh): 60% popularity, 40% search position.
 */
export function onlineScore(match: number | null, rating: { value: number; count: number } | null | undefined, position = 1): number {
  const pop = popularity(rating)
  return match == null ? 0.6 * pop + 0.4 * position : 0.6 * match + 0.25 * pop + 0.15 * position
}
